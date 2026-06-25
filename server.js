const express = require('express');
const fs = require('fs');
const path = require('path');
const dbFactory = require('better-sqlite3');
const multer = require('multer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

const DATA_DIR = path.join(__dirname, 'data');
const GAMES_DIR = path.join(DATA_DIR, 'games');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(GAMES_DIR)) fs.mkdirSync(GAMES_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const db = dbFactory(path.join(DATA_DIR, 'database.db'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const gameStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, GAMES_DIR),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + ext);
    }
});
const uploadGame = multer({ storage: gameStorage });

const fileStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const uploadFile = multer({ storage: fileStorage });

// --- إنشاء وتحديث الجداول (إضافة حقل clicks للألعاب) ---
db.exec(`
    CREATE TABLE IF NOT EXISTS users (id_9chars TEXT PRIMARY KEY, attempts INTEGER, last_reset TEXT);
    CREATE TABLE IF NOT EXISTS games (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, thumbnail TEXT, filename TEXT, enabled INTEGER, clicks INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS ideas (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, title TEXT, content TEXT, file_url TEXT);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
`);

// التأكد من وجود عمود الـ clicks في حال كان الجدول قديماً
try {
    db.exec("ALTER TABLE games ADD COLUMN clicks INTEGER DEFAULT 0;");
} catch(e) { /* العمود موجود مسبقاً */ }

function getSetting(key, defaultValue) {
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
    return row ? row.value : defaultValue;
}
function setSetting(key, value) {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
}

// الإعدادات الافتراضية
const defaultSettings = {
    site_title_ar: "متجر البرق للألعاب",
    site_title_en: "Lightning Games",
    logo_url: "https://images.unsplash.com/photo-1612287230202-1bf1d85d1bdf?w=150",
    header_text: "أهلاً بك في عالم الحماس والإثارة المتجدد",
    footer_text: "جميع الحقوق محفوظة © متجر البرق لإدارة الخدمات المطور wh_wc",
    bg_color_1: "#0f172a",
    bg_color_2: "#1e293b",
    btn_color: "#ef4444",
    text_color: "#f8fafc",
    show_ideas: "1",
    limit_reached_msg: "لقد استهلكت عدد محاولات لعبك اليوم، عد غداً للتحديث أو تواصل معي لشحن محاولاتك فوراً!",
    telegram_username: "wh_wc"
};
Object.keys(defaultSettings).forEach(key => {
    if (!db.prepare("SELECT key FROM settings WHERE key = ?").get(key)) {
        setSetting(key, defaultSettings[key]);
    }
});

// إدراج لعبة لغز ترتيب الأرقام تفاعلياً ومباشرة تلقائياً إذا لم تكن موجودة
const puzzleCheck = db.prepare("SELECT id FROM games WHERE name LIKE '%ترتيب الأرقام%' OR name LIKE '%ألغاز الأرقام%'").get();
if(!puzzleCheck) {
    // كود اللعبة التفاعلية بناءً على الصورة المرفقة
    const puzzleHtml = `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>ألغاز الأرقام</title>
        <style>
            body { background: linear-gradient(135deg, #667eea, #764ba2); color: #333; font-family: system-ui, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 10px; }
            .card { background: #fff; padding: 20px; border-radius: 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.2); width: 100%; max-width: 380px; text-align: center; }
            .header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
            .title { font-size: 22px; font-weight: bold; color: #4a148c; }
            .moves { font-size: 16px; color: #666; margin-bottom: 15px; }
            .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; background: #e0e0e0; padding: 12px; border-radius: 12px; margin-bottom: 15px; }
            .tile { background: linear-gradient(to bottom right, #da22ff, #9114ff); color: #fff; font-size: 20px; font-weight: bold; display: flex; justify-content: center; align-items: center; aspect-ratio: 1; border-radius: 8px; cursor: pointer; user-select: none; box-shadow: 0 4px 6px rgba(0,0,0,0.1); transition: transform 0.1s; }
            .tile:active { transform: scale(0.95); }
            .tile.empty { background: #e0e0e0; box-shadow: none; cursor: default; }
            .win-msg { color: #2e7d32; font-weight: bold; font-size: 18px; margin-top: 10px; display: none; }
        </style>
    </head>
    <body>
        <div class="card">
            <div class="header-row">
                <div class="title">ألغاز الأرقام</div>
            </div>
            <div class="moves">الحركات: <span id="move-count">0</span></div>
            <div class="grid" id="grid"></div>
            <div class="win-msg" id="win-message">🎉 أحسنت! تم ترتيب الأرقام بنجاح!</div>
        </div>
        <script>
            let board = [];
            let moves = 0;
            const size = 4;

            function initBoard() {
                // إنشاء مصفوفة مرتبة من 1 إلى 15 ثم الفراغ (0)
                let arr = Array.from({length: 15}, (_, i) => i + 1);
                arr.push(0);
                
                // خلط الأرقام عشوائياً لضمان إمكانية اللعب والحل البصري التنافسي
                do {
                    for (let i = arr.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [arr[i], arr[j]] = [arr[j], arr[i]];
                    }
                } while (!isSolvable(arr));

                board = [];
                for(let i=0; i<size; i++) {
                    board.push(arr.slice(i*size, i*size+size));
                }
                renderBoard();
            }

            function isSolvable(arr) {
                let inversions = 0;
                let emptyRow = 0;
                for (let i = 0; i < arr.length; i++) {
                    if (arr[i] === 0) {
                        emptyRow = Math.floor(i / size);
                        continue;
                    }
                    for (let j = i + 1; j < arr.length; j++) {
                        if (arr[j] !== 0 && arr[i] > arr[j]) inversions++;
                    }
                }
                // لقالب 4x4 تكون قابلة للحل إذا كانت العمليات متوافقة مع مكان السطر الفارغ
                return (size - emptyRow) % 2 === (inversions % 2 === 0 ? 0 : 1);
            }

            function renderBoard() {
                const gridEl = document.getElementById('grid');
                gridEl.innerHTML = '';
                for(let r=0; r<size; r++) {
                    for(let c=0; c<size; c++) {
                        const val = board[r][c];
                        const tile = document.createElement('div');
                        tile.classList.add('tile');
                        if(val === 0) {
                            tile.classList.add('empty');
                        } else {
                            tile.innerText = val;
                            tile.onclick = () => moveTile(r, c);
                        }
                        gridEl.appendChild(tile);
                    }
                }
                document.getElementById('move-count').innerText = moves;
                checkWin();
            }

            function moveTile(r, c) {
                // البحث عن المربع الفارغ المجاور (أعلى، أسفل، يمين، يسار)
                const dr = [-1, 1, 0, 0];
                const dc = [0, 0, -1, 1];
                for(let i=0; i<4; i++) {
                    let nr = r + dr[i];
                    let nc = c + dc[i];
                    if(nr >= 0 && nr < size && nc >= 0 && nc < size && board[nr][nc] === 0) {
                        board[nr][nc] = board[r][c];
                        board[r][c] = 0;
                        moves++;
                        renderBoard();
                        break;
                    }
                }
            }

            function checkWin() {
                let current = 1;
                for(let r=0; r<size; r++) {
                    for(let c=0; c<size; c++) {
                        if(r === size-1 && c === size-1) {
                            if(board[r][c] !== 0) return;
                        } else {
                            if(board[r][c] !== current) return;
                            current++;
                        }
                    }
                }
                document.getElementById('win-message').style.display = 'block';
            }

            initBoard();
        </script>
    </body>
    </html>
    `;
    fs.writeFileSync(path.join(GAMES_DIR, 'number-puzzle.html'), puzzleHtml);
    db.prepare("INSERT INTO games (name, thumbnail, filename, enabled, clicks) VALUES (?, ?, ?, 1, 0)")
      .run("ألغاز ترتيب الأرقام المطور", "https://images.unsplash.com/photo-1606326608606-aa0b62935f2b?w=250", "number-puzzle.html");
}

function getAdenDateString() {
    return new Date().toLocaleDateString("en-US", { timeZone: "Asia/Aden" });
}

function verifyAndResetUser(userId) {
    const todayStr = getAdenDateString();
    let user = db.prepare("SELECT * FROM users WHERE id_9chars = ?").get(userId);
    
    if (!user) {
        user = { id_9chars: userId, attempts: 6, last_reset: todayStr };
        db.prepare("INSERT INTO users (id_9chars, attempts, last_reset) VALUES (?, 6, ?)").run(userId, todayStr);
    } else if (user.last_reset !== todayStr) {
        db.prepare("UPDATE users SET attempts = 6, last_reset = ? WHERE id_9chars = ?").run(todayStr, userId);
        user.attempts = 6;
        user.last_reset = todayStr;
    }
    return user;
}

app.get('/ping', (req, res) => res.send('pong'));

app.post('/api/init-user', (req, res) => {
    const { userId } = req.body;
    if (!userId || userId.length !== 9) return res.status(400).json({ error: "ID غير صالح" });
    const user = verifyAndResetUser(userId);
    res.json(user);
});

// تعديل مسار الخصم ليقوم باحتساب الـ click للعبة المحددة وتخزينها للإحصائيات
app.post('/api/play-deduct', (req, res) => {
    const { userId, filename } = req.body;
    let user = verifyAndResetUser(userId);
    if (user.attempts > 0) {
        const nextAttempts = user.attempts - 1;
        db.prepare("UPDATE users SET attempts = ? WHERE id_9chars = ?").run(nextAttempts, userId);
        
        if (filename) {
            db.prepare("UPDATE games SET clicks = clicks + 1 WHERE filename = ?").run(filename);
        }
        
        return res.json({ success: true, attempts: nextAttempts });
    }
    res.json({ success: false, attempts: 0 });
});

// باقي مسارات التحكم والأدمن
app.post('/api/admin/login', (req, res) => {
    if (req.body.password === ADMIN_PASSWORD) return res.json({ success: true });
    res.status(401).json({ success: false, msg: "كلمة مرور خاطئة" });
});

app.post('/api/admin/update-settings', (req, res) => {
    if (req.body.password !== ADMIN_PASSWORD) return res.status(401).send("غير مصرح");
    const config = req.body.settings;
    Object.keys(config).forEach(key => setSetting(key, config[key]));
    res.json({ success: true });
});

app.post('/api/admin/add-game', uploadGame.single('game_file'), (req, res) => {
    if (req.body.password !== ADMIN_PASSWORD) return res.status(401).send("غير مصرح");
    const { name, thumbnail } = req.body;
    const filename = req.file.filename;
    db.prepare("INSERT INTO games (name, thumbnail, filename, enabled, clicks) VALUES (?, ?, ?, 1, 0)").run(name, thumbnail, filename);
    res.redirect('/admin?auth=' + encodeURIComponent(ADMIN_PASSWORD));
});

app.post('/api/admin/add-idea', uploadFile.single('idea_file'), (req, res) => {
    if (req.body.password !== ADMIN_PASSWORD) return res.status(401).send("غير مصرح");
    const { type, title, content } = req.body;
    let fileUrl = "";
    if (req.file) fileUrl = "/sharedfile/" + req.file.filename;
    db.prepare("INSERT INTO ideas (type, title, content, file_url) VALUES (?, ?, ?, ?)").run(type, title, content, fileUrl);
    res.redirect('/admin?auth=' + encodeURIComponent(ADMIN_PASSWORD));
});

app.post('/api/admin/delete-idea', (req, res) => {
    if (req.body.password !== ADMIN_PASSWORD) return res.status(401).send("غير مصرح");
    const { id } = req.body;
    const idea = db.prepare("SELECT file_url FROM ideas WHERE id = ?").get(id);
    if(idea && idea.file_url) {
        try {
            const filename = idea.file_url.replace("/sharedfile/", "");
            fs.unlinkSync(path.join(UPLOADS_DIR, filename));
        } catch(e){}
    }
    db.prepare("DELETE FROM ideas WHERE id = ?").run(id);
    res.json({ success: true });
});

app.post('/api/admin/game-status', (req, res) => {
    if (req.body.password !== ADMIN_PASSWORD) return res.status(401).send("غير مصرح");
    const { id, enabled } = req.body;
    db.prepare("UPDATE games SET enabled = ? WHERE id = ?").run(enabled, id);
    res.json({ success: true });
});

app.post('/api/admin/delete-game', (req, res) => {
    if (req.body.password !== ADMIN_PASSWORD) return res.status(401).send("غير مصرح");
    const { id } = req.body;
    const game = db.prepare("SELECT filename FROM games WHERE id = ?").get(id);
    if(game) {
        try { fs.unlinkSync(path.join(GAMES_DIR, game.filename)); } catch(e){}
        db.prepare("DELETE FROM games WHERE id = ?").run(id);
    }
    res.json({ success: true });
});

app.post('/api/admin/charge-user', (req, res) => {
    if (req.body.password !== ADMIN_PASSWORD) return res.status(401).send("غير مصرح");
    const { targetId, attempts } = req.body;
    const todayStr = getAdenDateString();
    db.prepare("INSERT OR REPLACE INTO users (id_9chars, attempts, last_reset) VALUES (?, ?, ?)").run(targetId, parseInt(attempts), todayStr);
    res.json({ success: true });
});

app.get('/gamefile/:filename', (req, res) => res.sendFile(path.join(GAMES_DIR, req.params.filename)));
app.get('/sharedfile/:filename', (req, res) => res.sendFile(path.join(UPLOADS_DIR, req.params.filename)));

// واجهة المستخدم الرئيسية
app.get('/', (req, res) => {
    const games = db.prepare("SELECT * FROM games WHERE enabled = 1").all();
    const ideas = db.prepare("SELECT * FROM ideas").all();
    
    const siteTitleAr = getSetting('site_title_ar', 'متجر البرق');
    const siteTitleEn = getSetting('site_title_en', 'Lightning Games');
    const logoUrl = getSetting('logo_url', '');
    const headerText = getSetting('header_text', '');
    const footerText = getSetting('footer_text', '');
    const bg1 = getSetting('bg_color_1', '#0f172a');
    const bg2 = getSetting('bg_color_2', '#1e293b');
    const btnColor = getSetting('btn_color', '#ef4444');
    const textColor = getSetting('text_color', '#f8fafc');
    const showIdeas = getSetting('show_ideas', '1') === "1";
    const limitMsg = getSetting('limit_reached_msg', '');
    const tgUser = getSetting('telegram_username', 'wh_wc');

    res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${siteTitleAr} | ${siteTitleEn}</title>
        <style>
            :root { --bg-1: ${bg1}; --bg-2: ${bg2}; --btn: ${btnColor}; --text: ${textColor}; }
            * { box-sizing: border-box; margin: 0; padding: 0; font-family: system-ui, sans-serif; }
            body { background: var(--bg-1); color: var(--text); padding-bottom: 60px; min-height: 100vh; display: flex; flex-direction: column; }
            header { background: var(--bg-2); padding: 15px; border-bottom: 2px solid var(--btn); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; }
            .logo-area { display: flex; align-items: center; gap: 10px; }
            .logo-img { width: 45px; height: 45px; border-radius: 50%; object-fit: cover; border: 2px solid var(--btn); }
            .btn { background: var(--btn); color: #fff; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: bold; text-decoration: none; display: inline-block; text-align: center; }
            .hero { text-align: center; padding: 30px 15px; background: linear-gradient(to bottom, var(--bg-2), var(--bg-1)); }
            .container { max-width: 1200px; margin: 0 auto; padding: 15px; width: 100%; flex: 1; }
            .games-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 20px; margin-top: 20px; }
            .game-card { background: var(--bg-2); border-radius: 12px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1); display: flex; flex-direction: column; box-shadow: 0 4px 15px rgba(0,0,0,0.3); }
            .game-thumb { width: 100%; height: 160px; object-fit: cover; }
            .game-info { padding: 15px; text-align: center; display: flex; flex-direction: column; gap: 10px; flex: 1; justify-content: space-between; }
            .game-actions { display: flex; gap: 10px; justify-content: center; }
            footer { background: var(--bg-2); text-align: center; padding: 15px; font-size: 14px; margin-top: auto; border-top: 1px solid rgba(255,255,255,0.05); }
            .modal { display: none; position: fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:1000; justify-content:center; align-items:center; padding:15px; }
            .modal-content { background: var(--bg-2); padding: 25px; border-radius: 12px; max-width: 600px; width: 100%; max-height: 80vh; overflow-y: auto; border: 2px solid var(--btn); position: relative; }
            .close-btn { float: left; cursor: pointer; font-size: 24px; color: var(--btn); }
            .idea-item { background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px; margin-bottom: 12px; border-right: 4px solid var(--btn); text-align: right; }
            #blocker { display: none; position: fixed; top:0; left:0; width:100%; height:100%; background:#ef4444; z-index:9999; flex-direction:column; justify-content:center; align-items:center; text-align:center; padding:20px; color:#fff; }
            #game-frame-container { display: none; position: fixed; top:0; left:0; width:100%; height:100%; background:#000; z-index:2000; flex-direction:column; }
            iframe { width:100%; height:100%; border:none; background:#fff; }
            .video-container { position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; background: #000; margin-top: 10px; border-radius: 6px; }
            .video-container iframe { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
        </style>
    </head>
    <body>
        <header>
            <div class="logo-area">
                ${logoUrl ? `<img src="${logoUrl}" class="logo-img" alt="Logo">` : ''}
                <div><h2>${siteTitleAr}</h2><small style="color:rgba(255,255,255,0.6);">${siteTitleEn}</small></div>
            </div>
            <div style="text-align: center;">
                <span id="user-display-id" style="display:block; font-size:12px; opacity:0.7;">ID: ------</span>
                <strong id="user-attempts" style="color: #4ade80;">متبقي - من 6 محاولات اليوم</strong>
            </div>
            <div>${showIdeas ? `<button class="btn" onclick="openModal()">💡 أفكار مفيدة</button>` : ''}</div>
        </header>

        <div class="hero"><h1>${headerText}</h1></div>

        <div class="container">
            <div class="games-grid">
                ${games.map(g => `
                    <div class="game-card">
                        <img src="${g.thumbnail}" class="game-thumb">
                        <div class="game-info">
                            <h3>${g.name}</h3>
                            <div class="game-actions">
                                <button class="btn" onclick="launchGame('${g.filename}')">🎮 تشغيل اللعبة</button>
                                <a href="/gamefile/${g.filename}" download="${g.name}.html" class="btn" style="background:#4b5563;">📥 تحميل</a>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>

        <footer><p>${footerText}</p></footer>

        <div id="ideasModal" class="modal" onclick="closeModal(event)">
            <div class="modal-content" onclick="event.stopPropagation()">
                <span class="close-btn" onclick="document.getElementById('ideasModal').style.display='none'">&times;</span>
                <h2 style="margin-bottom:20px; text-align:center;">💡 قائمة الأفكار والمحتوى المفيد</h2>
                ${ideas.map(i => {
                    let videoEmbed = "";
                    if(i.type === 'فيديو' && i.content) {
                        let regExp = /^.*(youtu.be\\/|v\\/|u\\/\\w\\/|embed\\/|watch\\?v=|\\&v=)([^#\\&\\?]*).*/;
                        let match = i.content.match(regExp);
                        if (match && match[2].length == 11) {
                            videoEmbed = `<div class="video-container"><iframe src="https://www.youtube.com/embed/${match[2]}" allowfullscreen></iframe></div>`;
                        } else {
                            videoEmbed = `<div style="margin-top:10px;"><a href="${i.content}" target="_blank" class="btn" style="background:#3b82f6; font-size:13px;">📺 مشاهدة الفيديو المعروض</a></div>`;
                        }
                    }
                    return `
                    <div class="idea-item">
                        <h4>${i.title} <span style="font-size:10px; background:var(--btn); padding:2px 6px; border-radius:4px;">${i.type}</span></h4>
                        ${i.type === 'نص' ? `<p style="margin-top:8px; font-size:14px; white-space: pre-wrap;">${i.content}</p>` : ''}
                        ${i.type === 'رابط' ? `<p style="margin-top:8px;"><a href="${i.content}" target="_blank" style="color:#60a5fa; word-break:break-all;">🔗 ${i.content}</a></p>` : ''}
                        ${videoEmbed}
                        ${i.file_url ? `
                            <div style="margin-top:12px; background:rgba(0,0,0,0.2); padding:8px; border-radius:6px; display:flex; justify-content:space-between; align-items:center;">
                                <span style="font-size:12px; color:#10b981;">📦 ملف مرفق جاهز للتشغيل</span>
                                <a href="${i.file_url}" download class="btn" style="background:#10b981; padding:4px 10px; font-size:12px;">📥 تحميل الملف الآن</a>
                            </div>
                        ` : ''}
                    </div>
                `}).join('')}
            </div>
        </div>

        <div id="blocker">
            <h1>🚨 تنبيه هام!</h1><p>${limitMsg}</p><br>
            <a href="https://t.me/${tgUser}" target="_blank" class="btn" style="background:#fff; color:#ef4444;">💬 تواصل معي شحن الرصيد</a>
        </div>

        <div id="game-frame-container">
            <div style="background:#111; padding:10px; display:flex; justify-content:space-between; align-items:center;">
                <button class="btn" onclick="closeGameFrame()" style="background:#374151;">⬅️ خروج</button>
                <span style="color:#fff;">منع النوم نشط ⚡</span>
            </div>
            <iframe id="game-iframe"></iframe>
        </div>

        <script>
            let userId = localStorage.getItem('game_user_id');
            if(!userId) {
                const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
                userId = '';
                for (let i = 0; i < 9; i++) userId += chars.charAt(Math.floor(Math.random() * chars.length));
                localStorage.setItem('game_user_id', userId);
            }
            document.getElementById('user-display-id').innerText = "ID: " + userId;
            let currentAttempts = 6; let wakeLock = null;

            async function syncUser() {
                try {
                    let res = await fetch('/api/init-user', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ userId }) });
                    let data = await res.json(); currentAttempts = data.attempts;
                    document.getElementById('user-attempts').innerText = `متبقي ${currentAttempts} من 6 محاولات اليوم`;
                    if(currentAttempts <= 0) document.getElementById('blocker').style.display = 'flex';
                } catch(e) {}
            }
            syncUser();

            async function launchGame(filename) {
                if(currentAttempts <= 0) { document.getElementById('blocker').style.display = 'flex'; return; }
                let res = await fetch('/api/play-deduct', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ userId, filename }) });
                let data = await res.json(); currentAttempts = data.attempts;
                document.getElementById('user-attempts').innerText = `متبقي ${currentAttempts} من 6 محاولات اليوم`;
                if(data.success) {
                    document.getElementById('game-iframe').src = '/gamefile/' + filename;
                    document.getElementById('game-frame-container').style.display = 'flex';
                    if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
                } else { document.getElementById('blocker').style.display = 'flex'; }
            }
            function openModal() { document.getElementById('ideasModal').style.display = 'flex'; }
            function closeModal(e) { if(e.target.id === 'ideasModal') document.getElementById('ideasModal').style.display = 'none'; }
            function closeGameFrame() {
                document.getElementById('game-frame-container').style.display = 'none';
                document.getElementById('game-iframe').src = '';
                if(wakeLock !== null) { wakeLock.release(); wakeLock = null; }
            }
        </script>
    </body>
    </html>
    `);
});

// لوحة التحكم المحدثة بالإحصائيات الذكية
app.get('/admin', (req, res) => {
    const auth = req.query.auth || "";
    if (auth !== ADMIN_PASSWORD) {
        return res.send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>دخول الأدمن</title><style>body{background:#0f172a; color:#fff; display:flex; justify-content:center; align-items:center; height:100vh; margin:0;} .box{background:#1e293b; padding:30px; border-radius:8px; border:1px solid #ef4444; text-align:center;}</style></head>
        <body><div class="box"><h2>لوحة تحكم المشرف</h2><br><input type="password" id="pw" style="padding:10px; width:80%;"><br><br><button onclick="window.location.href='/admin?auth='+encodeURIComponent(document.getElementById('pw').value)" style="background:#ef4444; color:#fff; padding:10px 20px; border:none; cursor:pointer;">دخول</button></div></body></html>
        `);
    }

    // حساب الإحصائيات المطلوبة من قواعد البيانات مباشرة
    const totalUsers = db.prepare("SELECT COUNT(*) AS count FROM users").get().count;
    const mostPlayedGame = db.prepare("SELECT name, clicks FROM games ORDER BY clicks DESC LIMIT 1").get();
    
    let statsMsg = "لا توجد نقرات مسجلة بعد";
    if (mostPlayedGame && mostPlayedGame.clicks > 0) {
        statsMsg = \`\${mostPlayedGame.name} (\${mostPlayedGame.clicks} نقرة)\`;
    }

    const allGames = db.prepare("SELECT * FROM games").all();
    const allIdeas = db.prepare("SELECT * FROM ideas").all();

    res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <title>لوحة التحكم الإحصائية الكاملة</title>
        <style>
            body { background: #0f172a; color: #f8fafc; font-family: system-ui, sans-serif; padding: 20px; }
            .section { background: #1e293b; padding: 20px; border-radius: 8px; margin-bottom: 20px; border: 1px solid rgba(255,255,255,0.05); }
            .stats-box { display: flex; gap: 20px; margin-bottom: 20px; flex-wrap: wrap; }
            .stat-card { background: linear-gradient(135deg, #1e293b, #0f172a); border: 2px solid #ef4444; padding: 20px; border-radius: 12px; flex: 1; min-width: 200px; text-align: center; }
            .stat-card h3 { font-size: 16px; opacity: 0.8; margin-bottom: 10px; }
            .stat-card p { font-size: 24px; font-weight: bold; color: #4ade80; }
            h2 { color: #ef4444; margin-bottom: 15px; }
            label { display: block; margin: 10px 0 5px; font-weight: bold; }
            input[type="text"], input[type="password"] { width: 100%; padding: 10px; border-radius: 4px; border: 1px solid #475569; background: #0f172a; color: #fff; margin-bottom: 10px; }
            .btn { background: #ef4444; color:#fff; border:none; padding:10px 20px; border-radius:4px; cursor:pointer; font-weight:bold; }
            .grid-table { width:100%; border-collapse: collapse; margin-top:15px; }
            .grid-table th, .grid-table td { border: 1px solid #475569; padding: 10px; text-align: center; }
        </style>
    </head>
    <body>
        <h1>🎛️ لوحة إدارة متجر البرق والإحصائيات</h1><br>

        <!-- قسم الإحصائيات المباشرة -->
        <div class="stats-box">
            <div class="stat-card">
                <h3>👥 إجمالي عدد مستخدمين الموقع</h3>
                <p>${totalUsers} مستخدم</p>
            </div>
            <div class="stat-card" style="border-color: #3b82f6;">
                <h3>🔥 اللعبة الأكثر لعباً وشهرة</h3>
                <p style="color: #60a5fa; font-size: 18px;">${statsMsg}</p>
            </div>
        </div>

        <!-- شحن المحاولات للمستخدمين -->
        <div class="section">
            <h2>⚡ شحن محاولات حساب (عن طريق الـ ID)</h2>
            <div style="display:flex; gap:10px; flex-wrap:wrap;">
                <input type="text" id="targetId" placeholder="أدخل الـ ID المكون من 9 خانات" style="flex:1;">
                <input type="text" id="attemptsCount" placeholder="عدد المحاولات (مثال: 10)" style="width:150px;">
                <button class="btn" onclick="chargeUser()">شحن الرصيد الآن</button>
            </div>
        </div>

        <div class="section">
            <h2>🎮 قائمة الألعاب والتحكم بها</h2>
            <table class="grid-table">
                <thead><tr><th>اسم اللعبة</th><th>عدد النقرات</th><th>التحكم</th></tr></thead>
                <tbody>
                    ${allGames.map(g => `
                        <tr>
                            <td>${g.name}</td>
                            <td><strong style="color:#60a5fa;">${g.clicks || 0}</strong></td>
                            <td><button class="btn" style="background:#dc2626; padding:5px;" onclick="deleteGame(${g.id})">حذف</button></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        <script>
            const authKey = "${auth}";
            async function chargeUser() {
                const targetId = document.getElementById('targetId').value;
                const attempts = document.getElementById('attemptsCount').value;
                if(!targetId || !attempts) return alert("يرجى ملء جميع الحقول");
                let res = await fetch('/api/admin/charge-user', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ password: authKey, targetId, attempts })
                });
                let data = await res.json();
                if(data.success) { alert("تم شحن المحاولات بنجاح!"); location.reload(); }
            }
            async function deleteGame(id) {
                if(confirm("هل أنت متأكد من حذف اللعبة؟")) {
                    await fetch('/api/admin/delete-game', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ password: authKey, id })
                    });
                    location.reload();
                }
            }
        </script>
    </body>
    </html>
    `);
});

app.listen(PORT, () => console.log(`🚀 السيرفر يعمل بكفاءة كاملة`));
