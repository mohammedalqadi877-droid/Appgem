const express = require('express');
const fs = require('fs');
const path = require('path');
const dbFactory = require('better-sqlite3');
const multer = require('multer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

// 🌟 الحل المجاني: جعل مجلد البيانات داخل مسار المشروع الحالي لتجنب رفض الصلاحيات
const DATA_DIR = path.join(__dirname, 'data');
const GAMES_DIR = path.join(DATA_DIR, 'games');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(GAMES_DIR)) fs.mkdirSync(GAMES_DIR, { recursive: true });

// إعداد قاعدة البيانات في المجلد المحلي المتوافق مع الخطة المجانية
const db = dbFactory(path.join(DATA_DIR, 'database.db'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// إعداد رفع الملفات بواسطة Multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, GAMES_DIR);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + ext);
    }
});
const upload = multer({ storage: storage });

// --- 1. إنشاء الجداول وتجهيز الإعدادات والألعاب الافتراضية ---
db.exec(`
    CREATE TABLE IF NOT EXISTS users (id_9chars TEXT PRIMARY KEY, attempts INTEGER, last_reset TEXT);
    CREATE TABLE IF NOT EXISTS games (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, thumbnail TEXT, filename TEXT, enabled INTEGER);
    CREATE TABLE IF NOT EXISTS ideas (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, title TEXT, content TEXT);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
`);

// دالة مساعدة لجلب وحفظ الإعدادات
function getSetting(key, defaultValue) {
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
    return row ? row.value : defaultValue;
}
function setSetting(key, value) {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
}

// وضع الإعدادات الافتراضية للألوان والواجهة إذا لم تكن موجودة
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

// الألعاب الافتراضية (تم تحديث Snake لتدعم الموبايل واللمس)
const defaultGames = [
    {
        name: "ثعبان البرق الكلاسيكي",
        thumb: "https://images.unsplash.com/photo-1628157582853-a796fa650a6a?w=400",
        file: "snake.html",
        content: `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Snake Mobile</title>
    <style>
        body { background: #111; color: #fff; text-align: center; font-family: sans-serif; margin: 0; padding: 10px; touch-action: manipulation; }
        canvas { background: #000; display: block; margin: 10px auto; border: 4px solid #ef4444; max-width: 100%; height: auto; }
        h3 { margin: 5px 0; }
        /* تصميم أزرار التحكم للموبايل */
        .controls { display: grid; grid-template-columns: repeat(3, 60px); grid-template-rows: repeat(3, 60px); gap: 10px; justify-content: center; margin-top: 15px; }
        .btn-ctrl { background: #374151; color: #fff; border: none; border-radius: 50%; font-size: 24px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center; user-select: none; -webkit-user-select: none; }
        .btn-ctrl:active { background: #ef4444; }
        .up { grid-column: 2; grid-row: 1; }
        .left { grid-column: 1; grid-row: 2; }
        .right { grid-column: 3; grid-row: 2; }
        .down { grid-column: 2; grid-row: 3; }
    </style>
</head>
<body>
    <h3>اسكور: <span id="score">0</span></h3>
    <canvas id="gc" width="400" height="400"></canvas>

    <div class="controls">
        <button class="btn-ctrl up" onclick="changeDirection('UP')">⬆️</button>
        <button class="btn-ctrl left" onclick="changeDirection('LEFT')">⬅️</button>
        <button class="btn-ctrl right" onclick="changeDirection('RIGHT')">➡️</button>
        <button class="btn-ctrl down" onclick="changeDirection('DOWN')">⬇️</button>
    </div>

    <script>
        window.onload = function() {
            canvas = document.getElementById("gc");
            ctx = canvas.getContext("2d");
            document.addEventListener("keydown", keyPush);
            setInterval(game, 1000 / 12); // سرعة متوازنة تناسب شاشات اللمس
        };
        
        px = py = 10;
        gs = tc = 20;
        ax = ay = 15;
        xv = yv = 0;
        trail = [];
        tail = 5;
        score = 0;

        function game() {
            px += xv;
            py += yv;
            if (px < 0 || px > tc - 1 || py < 0 || py > tc - 1) {
                xv = yv = 0; px = py = 10; tail = 5; score = 0;
                document.getElementById("score").innerText = score;
            }
            ctx.fillStyle = "black";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = "lime";
            for (var i = 0; i < trail.length; i++) {
                ctx.fillRect(trail[i].x * gs, trail[i].y * gs, gs - 2, gs - 2);
                if (trail[i].x == px && trail[i].y == py) {
                    tail = 5; score = 0;
                    document.getElementById("score").innerText = score;
                }
            }
            trail.push({ x: px, y: py });
            while (trail.length > tail) { trail.shift(); }
            if (ax == px && ay == py) {
                tail++; score++;
                document.getElementById("score").innerText = score;
                ax = Math.floor(Math.random() * tc);
                ay = Math.floor(Math.random() * tc);
            }
            ctx.fillStyle = "red";
            ctx.fillRect(ax * gs, ay * gs, gs - 2, gs - 2);
        }

        // التحكم الذكي باللمس
        function changeDirection(dir) {
            if (dir === 'LEFT' && xv !== 1) { xv = -1; yv = 0; }
            if (dir === 'UP' && yv !== 1) { xv = 0; yv = -1; }
            if (dir === 'RIGHT' && xv !== -1) { xv = 1; yv = 0; }
            if (dir === 'DOWN' && yv !== -1) { xv = 0; yv = 1; }
        }

        // التحكم بالكيبورد للكمبيوتر
        function keyPush(evt) {
            switch (evt.keyCode) {
                case 37: changeDirection('LEFT'); break;
                case 38: changeDirection('UP'); break;
                case 39: changeDirection('RIGHT'); break;
                case 40: changeDirection('DOWN'); break;
            }
        }
    </script>
</body>
</html>`
    },
    {
        name: "مدافع الحصن الرقمي",
        thumb: "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=400",
        file: "defender.html",
        content: `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Defender</title><style>body{background:#222;color:#fff;text-align:center;font-family:sans-serif;margin:0;overflow:hidden}canvas{background:#111;display:block;margin:auto;border:2px solid #fff;max-width:100%;max-height:80vh}</style></head><body><h2>صد الأعداء القادمين! النتيجة: <span id="sc">0</span></h2><canvas id="dc" width="500" height="500"></canvas><script>const canvas=document.getElementById("dc"),ctx=canvas.getContext("2d");let score=0,enemies=[],speed=1;function spawn() {const sides=['T','B','L','R'],side=sides[Math.floor(Math.random()*4)];let e={x:250,y:250,w:20,h:20,id:Date.now()+Math.random()};if(side=='T'){e.x=Math.random()*500;e.y=0;}if(side=='B'){e.x=Math.random()*500;e.y=500;}if(side=='L'){e.x=0;e.y=Math.random()*500;}if(side=='R'){e.x=500;e.y=Math.random()*500;}enemies.push(e);}setInterval(spawn,1000);canvas.addEventListener("click",(e)=>{const rect=canvas.getBoundingClientRect(),mx=(e.clientX-rect.left)*(500/rect.width),my=(e.clientY-rect.top)*(500/rect.height);enemies=enemies.filter(en=>{if(mx>=en.x&&mx<=en.x+20&&my>=en.y&&my<=en.y+20){score++;speed+=0.05;document.getElementById("sc").innerText=score;return false;}return true;});});function update(){ctx.clearRect(0,0,500,500);ctx.fillStyle="blue";ctx.fillRect(235,235,30,30);ctx.fillStyle="red";enemies.forEach(en=>{let dx=235-en.x,dy=235-en.y,dist=Math.sqrt(dx*dx+dy*dy);if(dist>5){en.x+=(dx/dist)*speed;en.y+=(dy/dist)*speed;}else{score=0;speed=1;document.getElementById("sc").innerText=score;enemies=[];}ctx.fillRect(en.x,en.y,en.w,en.h);});requestAnimationFrame(update);}update();if(window.parent&&window.parent.initWakeLock)window.parent.initWakeLock();</script></body></html>`
    },
    {
        name: "لعبة لغز 2048",
        thumb: "https://images.unsplash.com/photo-1511512578047-dfb367046420?w=400",
        file: "2048.html",
        content: `<!DOCTYPE html><html><head><meta charset="utf-8"><title>2048 Lite</title><style>body{background:#faf8ef;color:#776e65;font-family:sans-serif;text-align:center;padding:10px}.grid{width:240px;height:240px;background:#bbada0;margin:20px auto;border-radius:6px;padding:10px;display:grid;grid-template-columns:repeat(4,1fr);grid-gap:10px}.cell{background:rgba(238,228,218,0.35);border-radius:3px;font-size:24px;font-weight:700;line-height:50px;height:50px;color:#776e65;text-align:center}</style></head><body><h2>لعبة 2048 المصغرة</h2><div class="grid"><div class="cell">2</div><div class="cell">4</div><div class="cell">8</div><div class="cell"></div><div class="cell"></div><div class="cell">16</div><div class="cell"></div><div class="cell"></div><div class="cell">32</div><div class="cell">64</div><div class="cell">128</div><div class="cell"></div><div class="cell"></div><div class="cell"></div><div class="cell">256</div><div class="cell">1024</div></div><p>استخدم اللمس للتنقل! حرك الأرقام للوصول إلى 2048.</p><script>if(window.parent&&window.parent.initWakeLock)window.parent.initWakeLock();</script></body></html>`
    }
];

defaultGames.forEach(g => {
    const fullPath = path.join(GAMES_DIR, g.file);
    if (!fs.existsSync(fullPath)) {
        fs.writeFileSync(fullPath, g.content);
    }
    const exists = db.prepare("SELECT id FROM games WHERE filename = ?").get(g.file);
    if (!exists) {
        db.prepare("INSERT INTO games (name, thumbnail, filename, enabled) VALUES (?, ?, ?, 1)").run(g.name, g.thumb, g.file);
    }
});

// --- 2. إدارة التوقيت وتحديث المحاولات (آسيا/عدن) ---
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

// --- 3. مسارات الـ API الخلفية ---
app.get('/ping', (req, res) => res.send('pong'));

app.post('/api/init-user', (req, res) => {
    const { userId } = req.body;
    if (!userId || userId.length !== 9) return res.status(400).json({ error: "ID غير صالح" });
    const user = verifyAndResetUser(userId);
    res.json(user);
});

app.post('/api/play-deduct', (req, res) => {
    const { userId } = req.body;
    let user = verifyAndResetUser(userId);
    if (user.attempts > 0) {
        const nextAttempts = user.attempts - 1;
        db.prepare("UPDATE users SET attempts = ? WHERE id_9chars = ?").run(nextAttempts, userId);
        return res.json({ success: true, attempts: nextAttempts });
    }
    res.json({ success: false, attempts: 0 });
});

// مسارات الأدمن المحمية بكلمة مرور
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

app.post('/api/admin/add-game', upload.single('game_file'), (req, res) => {
    if (req.body.password !== ADMIN_PASSWORD) return res.status(401).send("غير مصرح");
    const { name, thumbnail } = req.body;
    const filename = req.file.filename;
    db.prepare("INSERT INTO games (name, thumbnail, filename, enabled) VALUES (?, ?, ?, 1)").run(name, thumbnail, filename);
    res.redirect('/admin?auth=' + encodeURIComponent(ADMIN_PASSWORD));
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

app.post('/api/admin/add-idea', (req, res) => {
    if (req.body.password !== ADMIN_PASSWORD) return res.status(401).send("غير مصرح");
    const { type, title, content } = req.body;
    db.prepare("INSERT INTO ideas (type, title, content) VALUES (?, ?, ?)").run(type, title, content);
    res.json({ success: true });
});

app.post('/api/admin/delete-idea', (req, res) => {
    if (req.body.password !== ADMIN_PASSWORD) return res.status(401).send("غير مصرح");
    const { id } = req.body;
    db.prepare("DELETE FROM ideas WHERE id = ?").run(id);
    res.json({ success: true });
});

app.post('/api/admin/charge-user', (req, res) => {
    if (req.body.password !== ADMIN_PASSWORD) return res.status(401).send("غير مصرح");
    const { targetId, attempts } = req.body;
    if (!targetId || targetId.length !== 9) return res.json({ success: false, msg: "رقم الـ ID غير صحيح" });
    
    const todayStr = getAdenDateString();
    db.prepare("INSERT OR REPLACE INTO users (id_9chars, attempts, last_reset) VALUES (?, ?, ?)").run(targetId, parseInt(attempts), todayStr);
    res.json({ success: true });
});

// تقديم ملفات الألعاب المرفوعة والمخزنة محلياً
app.get('/gamefile/:filename', (req, res) => {
    res.sendFile(path.join(GAMES_DIR, req.params.filename));
});

// --- 4. واجهة المستخدم الرئيسية (HTML / CSS / JS) ---
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
            * { box-sizing: border-box; margin: 0; padding: 0; font-family: system-ui, -apple-system, sans-serif; }
            body { background: var(--bg-1); color: var(--text); padding-bottom: 60px; min-height: 100vh; display: flex; flex-direction: column; }
            header { background: var(--bg-2); padding: 15px; border-bottom: 2px solid var(--btn); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; }
            .logo-area { display: flex; align-items: center; gap: 10px; }
            .logo-img { width: 45px; height: 45px; border-radius: 50%; object-fit: cover; border: 2px solid var(--btn); }
            .btn { background: var(--btn); color: #fff; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: bold; text-decoration: none; }
            .hero { text-align: center; padding: 30px 15px; background: linear-gradient(to bottom, var(--bg-2), var(--bg-1)); }
            .container { max-width: 1200px; margin: 0 auto; padding: 15px; width: 100%; flex: 1; }
            .games-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 20px; margin-top: 20px; }
            .game-card { background: var(--bg-2); border-radius: 12px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1); display: flex; flex-direction: column; box-shadow: 0 4px 15px rgba(0,0,0,0.3); }
            .game-thumb { width: 100%; height: 160px; object-fit: cover; }
            .game-info { padding: 15px; text-align: center; display: flex; flex-direction: column; gap: 10px; flex: 1; justify-content: space-between; }
            .game-actions { display: flex; gap: 10px; justify-content: center; }
            footer { background: var(--bg-2); text-align: center; padding: 15px; font-size: 14px; margin-top: auto; border-top: 1px solid rgba(255,255,255,0.05); }
            
            .modal { display: none; position: fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:1000; justify-content:center; align-items:center; padding:15px; }
            .modal-content { background: var(--bg-2); padding: 25px; border-radius: 12px; max-width: 600px; width: 100%; max-height: 80vh; overflow-y: auto; border: 2px solid var(--btn); relative; }
            .close-btn { float: left; cursor: pointer; font-size: 24px; color: var(--btn); }
            .idea-item { background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px; margin-bottom: 12px; border-right: 4px solid var(--btn); }
            
            #blocker { display: none; position: fixed; top:0; left:0; width:100%; height:100%; background:#ef4444; z-index:9999; flex-direction:column; justify-content:center; align-items:center; text-align:center; padding:20px; color:#fff; }
            #game-frame-container { display: none; position: fixed; top:0; left:0; width:100%; height:100%; background:#000; z-index:2000; flex-direction:column; }
            iframe { width:100%; height:100%; border:none; background:#fff; }
        </style>
    </head>
    <body>

        <header>
            <div class="logo-area">
                ${logoUrl ? `<img src="${logoUrl}" class="logo-img" alt="Logo">` : ''}
                <div>
                    <h2>${siteTitleAr}</h2>
                    <small style="color:rgba(255,255,255,0.6); font-family:monospace;">${siteTitleEn}</small>
                </div>
            </div>
            <div style="text-align: center;">
                <span id="user-display-id" style="display:block; font-size:12px; opacity:0.7;">ID: ------</span>
                <strong id="user-attempts" style="color: #4ade80;">متبقي - من 6 محاولات اليوم</strong>
            </div>
            <div>
                ${showIdeas ? `<button class="btn" onclick="openModal()">💡 أفكار مفيدة</button>` : ''}
            </div>
        </header>

        <div class="hero">
            <h1>${headerText}</h1>
        </div>

        <div class="container">
            <div class="games-grid">
                ${games.map(g => `
                    <div class="game-card">
                        <img src="${g.thumbnail}" class="game-thumb" alt="${g.name}">
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

        <footer>
            <p>${footerText}</p>
        </footer>

        <div id="ideasModal" class="modal" onclick="closeModal(event)">
            <div class="modal-content" onclick="event.stopPropagation()">
                <span class="close-btn" onclick="document.getElementById('ideasModal').style.display='none'">&times;</span>
                <h2 style="margin-bottom:20px;">💡 قائمة الأفكار الشاملة</h2>
                ${ideas.map(i => `
                    <div class="idea-item">
                        <h4>${i.title} <span style="font-size:10px; background:var(--btn); padding:2px 6px; border-radius:4px;">${i.type}</span></h4>
                        <div style="margin-top:10px; font-size:14px; line-height:1.6;">
                            ${i.type === 'رابط' ? `<a href="${i.content}" target="_blank" style="color:#60a5fa;">اضغط لزيارة الرابط</a>` : i.content}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>

        <div id="blocker">
            <h1 style="font-size: 48px; margin-bottom: 20px;">🚨 تنبيه هام!</h1>
            <p style="font-size: 22px; max-width: 600px; margin-bottom: 30px; line-height:1.6;">${limitMsg}</p>
            <a href="https://t.me/${tgUser}" target="_blank" class="btn" style="background:#fff; color:#ef4444; font-size:20px; padding:12px 30px;">💬 تواصل معي عبر تيليجرام لشحن الرصيد</a>
        </div>

        <div id="game-frame-container">
            <div style="background:#111; padding:10px; display:flex; justify-content:space-between; align-items:center;">
                <button class="btn" onclick="closeGameFrame()" style="background:#374151;">⬅️ خروج من اللعبة</button>
                <span id="game-timer" style="color:#fff;">منع النوم نشط ⚡</span>
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

            let currentAttempts = 6;
            let wakeLock = null;

            async function syncUser() {
                try {
                    let res = await fetch('/api/init-user', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ userId })
                    });
                    let data = await res.json();
                    currentAttempts = data.attempts;
                    document.getElementById('user-attempts').innerText = \`متبقي \${currentAttempts} من 6 محاولات اليوم\`;
                    if(currentAttempts <= 0) {
                        document.getElementById('blocker').style.display = 'flex';
                    }
                } catch(e) { console.error("فشل مزامنة البيانات السحابية"); }
            }
            syncUser();

            async function launchGame(filename) {
                if(currentAttempts <= 0) {
                    document.getElementById('blocker').style.display = 'flex';
                    return;
                }
                
                let res = await fetch('/api/play-deduct', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ userId })
                });
                let data = await res.json();
                currentAttempts = data.attempts;
                document.getElementById('user-attempts').innerText = \`متبقي \${currentAttempts} من 6 محاولات اليوم\`;

                if(data.success) {
                    document.getElementById('game-iframe').src = '/gamefile/' + filename;
                    document.getElementById('game-frame-container').style.display = 'flex';
                    initWakeLock();
                } else {
                    document.getElementById('blocker').style.display = 'flex';
                }
            }

            function openModal() { document.getElementById('ideasModal').style.display = 'flex'; }
            function closeModal(e) { if(e.target.id === 'ideasModal') document.getElementById('ideasModal').style.display = 'none'; }

            function closeGameFrame() {
                document.getElementById('game-frame-container').style.display = 'none';
                document.getElementById('game-iframe').src = '';
                if(wakeLock !== null) { wakeLock.release(); wakeLock = null; }
            }

            async function initWakeLock() {
                try {
                    if ('wakeLock' in navigator) {
                        wakeLock = await navigator.wakeLock.request('screen');
                    }
                } catch (err) { console.log("Wake Lock غير مدعوم"); }
            }
        </script>
    </body>
    </html>
    `);
});

// --- 5. لوحة تحكم الإدارة الشاملة /admin ---
app.get('/admin', (req, res) => {
    const auth = req.query.auth || "";
    if (auth !== ADMIN_PASSWORD) {
        return res.send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head><meta charset="UTF-8"><title>تسجيل دخول الأدمن</title><style>body{background:#0f172a; color:#fff; font-family:sans-serif; display:flex; justify-content:center; align-items:center; height:100vh; margin:0;} .box{background:#1e293b; padding:30px; border-radius:8px; border:1px solid #ef4444; text-align:center;}</style></head>
        <body>
            <div class="box">
                <h2>لوحة تحكم المشرف</h2><br>
                <input type="password" id="pw" placeholder="كلمة المرور" style="padding:10px; border-radius:4px; border:none; width:80%;"><br><br>
                <button onclick="login()" style="background:#ef4444; color:#fff; border:none; padding:10px 20px; border-radius:4px; cursor:pointer;">دخول</button>
            </div>
            <script>
                function login(){
                    window.location.href = '/admin?auth=' + encodeURIComponent(document.getElementById('pw').value);
                }
            </script>
        </body></html>
        `);
    }

    const allGames = db.prepare("SELECT * FROM games").all();
    const allIdeas = db.prepare("SELECT * FROM ideas").all();

    res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <title>لوحة التحكم الكاملة</title>
        <style>
            body { background: #0f172a; color: #f8fafc; font-family: system-ui, sans-serif; padding: 20px; }
            .section { background: #1e293b; padding: 20px; border-radius: 8px; margin-bottom: 20px; border: 1px solid rgba(255,255,255,0.05); }
            h2 { color: #ef4444; margin-bottom: 15px; }
            label { display: block; margin: 10px 0 5px; font-weight: bold; }
            input[type="text"], input[type="password"], textarea, select { width: 100%; padding: 10px; border-radius: 4px; border: 1px solid #475569; background: #0f172a; color: #fff; margin-bottom: 10px; }
            .btn { background: #ef4444; color:#fff; border:none; padding:10px 20px; border-radius:4px; cursor:pointer; font-weight:bold; }
            .grid-table { width:100%; border-collapse: collapse; margin-top:15px; }
            .grid-table th, .grid-table td { border: 1px solid #475569; padding: 10px; text-align: center; }
            .color-pickers { display: flex; gap: 15px; flex-wrap: wrap; }
            .cp-box { background:#0f172a; padding:10px; border-radius:6px; text-align:center; }
        </style>
    </head>
    <body>
        <h1>🎛️ لوحة الإدارة العليا لموقع الألعاب</h1>
        <p style="margin-bottom:20px; color:#10b981;">الإعدادات تحفظ فورياً وتنعكس على الواجهة دون إعادة تشغيل السيرفر</p>

        <div class="section">
            <h2>أ. إعدادات الموقع والواجهة العامة</h2>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
                <div>
                    <label>اسم الموقع (عربي)</label>
                    <input type="text" id="site_title_ar" value="${getSetting('site_title_ar', '')}">
                </div>
                <div>
                    <label>اسم الموقع (إنجليزي)</label>
                    <input type="text" id="site_title_en" value="${getSetting('site_title_en', '')}">
                </div>
            </div>
            <label>رابط الشعار Logo</label>
            <input type="text" id="logo_url" value="${getSetting('logo_url', '')}">
            <label>نص الهيدر الرئيسي</label>
            <input type="text" id="header_text" value="${getSetting('header_text', '')}">
            <label>نص الفوتر (أسفل الصفحة)</label>
            <input type="text" id="footer_text" value="${getSetting('footer_text', '')}">
            <button class="btn" onclick="saveSettings()">💾 حفظ الإعدادات الأساسية</button>
        </div>

        <div class="section">
            <h2>ب. التحكم بالألوان والهوية البصرية</h2>
            <div class="color-pickers">
                <div class="cp-box"><label>الخلفية 1</label><input type="color" id="bg_color_1" value="${getSetting('bg_color_1', '#0f172a')}"></div>
                <div class="cp-box"><label>الخلفية 2</label><input type="color" id="bg_color_2" value="${getSetting('bg_color_2', '#1e293b')}"></div>
                <div class="cp-box"><label>لون الأزرار</label><input type="color" id="btn_color" value="${getSetting('btn_color', '#ef4444')}"></div>
                <div class="cp-box"><label>لون النصوص</label><input type="color" id="text_color" value="${getSetting('text_color', '#f8fafc')}"></div>
            </div><br>
            <button class="btn" style="background:#10b981;" onclick="saveSettings()">🎨 تطبيق الألوان فوراً</button>
        </div>

        <div class="section">
            <h2>ج. إعدادات القيود والواجهة</h2>
            <label>عرض زر "أفكار مفيدة"</label>
            <select id="show_ideas">
                <option value="1" ${getSetting('show_ideas', '1') === '1' ? 'selected' : ''}>إظهار الزر للعامة</option>
                <option value="0" ${getSetting('show_ideas', '1') === '0' ? 'selected' : ''}>إخفاء الزر بالكامل</option>
            </select>
            <label>نص رسالة انتهاء المحاولات اليومية</label>
            <textarea id="limit_reached_msg" rows="3">${getSetting('limit_reached_msg', '')}</textarea>
            <label>معرف تيليجرام للدعم والتواصل للتفعيل والشحن</label>
            <input type="text" id="telegram_username" value="${getSetting('telegram_username', '')}" placeholder="بدون علامة @">
            <button class="btn" onclick="saveSettings()">⚙️ تحديث الخصائص والقيود</button>
        </div>

        <div class="section">
            <h2>د. إضافة وإدارة ألعاب الـ HTML</h2>
            <form action="/api/admin/add-game" method="POST" enctype="multipart/form-data" style="background:rgba(0,0,0,0.2); padding:15px; border-radius:6px; margin-bottom:15px;">
                <input type="hidden" name="password" value="${auth}">
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                    <input type="text" name="name" placeholder="اسم اللعبة المبتكر" required>
                    <input type="text" name="thumbnail" placeholder="رابط الصورة المصغرة (Thumbnail URL)" required>
                </div>
                <label>اختر ملف اللعبة بصيغة (HTML فقط):</label>
                <input type="file" name="game_file" accept=".html" required><br><br>
                <button type="submit" class="btn" style="background:#3b82f6;">➕ رفع اللعبة الجديدة في المتجر</button>
            </form>

            <table class="grid-table">
                <thead><tr><th>الاسم</th><th>حالة اللعبة</th><th>العمليات</th></tr></thead>
                <tbody>
                    ${allGames.map(g => `
                        <tr>
                            <td>${g.name}</td>
                            <td>
                                <select onchange="toggleGame(${g.id}, this.value)">
                                    <option value="1" ${g.enabled === 1 ? 'selected' : ''}>نشطة ومفعلة</option>
                                    <option value="0" ${g.enabled === 0 ? 'selected' : ''}>معطلة ومخفية</option>
                                </select>
                            </td>
                            <td><button class="btn" style="padding:4px 8px; font-size:12px;" onclick="deleteGame(${g.id})">🗑️ حذف نهائي</button></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        <div class="section">
            <h2>هـ. إدارة الأفكار والمحتوى المفيد</h2>
            <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px;">
                <select id="idea_type">
                    <option value="نص">نص إرشادي</option>
                    <option value="فيديو">رابط فيديو embedded</option>
                    <option value="رابط">رابط خارجي مخصص</option>
                    <option value="لعبة">لعبة HTML تكميلية</option>
                </select>
                <input type="text" id="idea_title" placeholder="عنوان الفكرة">
                <input type="text" id="idea_content" placeholder="المحتوى النصي أو الرابط الإلكتروني">
            </div>
            <button class="btn" style="background:#8b5cf6;" onclick="addIdea()">💡 نشر الفكرة الجديدة</button>

            <table class="grid-table" style="margin-top:15px;">
                <thead><tr><th>النوع</th><th>العنوان</th><th>الإجراء</th></tr></thead>
                <tbody>
                    ${allIdeas.map(i => `
                        <tr>
                            <td>${i.type}</td>
                            <td>${i.title}</td>
                            <td><button class="btn" style="padding:4px 8px; font-size:12px;" onclick="deleteIdea(${i.id})">حذف</button></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        <div class="section" style="border: 2px dashed #10b981;">
            <h2>و. شحن محاولات المستخدمين الفوري (تخطي القيود اليومية)</h2>
            <div style="display:flex; gap:15px;">
                <input type="text" id="target_id" placeholder="أدخل الـ ID الخاص بالمستخدم (9 أحرف وأرقام)" style="max-width:400px;">
                <input type="number" id="charge_attempts" placeholder="عدد المحاولات الإضافية (مثال: 50)" style="max-width:200px;">
                <button class="btn" style="background:#10b981;" onclick="chargeUser()">⚡ شحن الرصيد الآن</button>
            </div>
        </div>

        <script>
            const authKey = "${auth}";

            async function saveSettings() {
                const settings = {
                    site_title_ar: document.getElementById('site_title_ar').value,
                    site_title_en: document.getElementById('site_title_en').value,
                    logo_url: document.getElementById('logo_url').value,
                    header_text: document.getElementById('header_text').value,
                    footer_text: document.getElementById('footer_text').value,
                    bg_color_1: document.getElementById('bg_color_1').value,
                    bg_color_2: document.getElementById('bg_color_2').value,
                    btn_color: document.getElementById('btn_color').value,
                    text_color: document.getElementById('text_color').value,
                    show_ideas: document.getElementById('show_ideas').value,
                    limit_reached_msg: document.getElementById('limit_reached_msg').value,
                    telegram_username: document.getElementById('telegram_username').value,
                };

                let res = await fetch('/api/admin/update-settings', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ password: authKey, settings })
                });
                if(res.ok) alert("تم حفظ وتطبيق كافة الإعدادات والألوان فورياً! 🎉");
            }

            async function toggleGame(id, enabled) {
                await fetch('/api/admin/game-status', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ password: authKey, id, enabled: parseInt(enabled) })
                });
            }

            async function deleteGame(id) {
                if(confirm("هل أنت متأكد تماماً من حذف هذه اللعبة وإزالتها من السيرفر؟")) {
                    await fetch('/api/admin/delete-game', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ password: authKey, id })
                    });
                    location.reload();
                }
            }

            async function addIdea() {
                const type = document.getElementById('idea_type').value;
                const title = document.getElementById('idea_title').value;
                const content = document.getElementById('idea_content').value;

                await fetch('/api/admin/add-idea', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ password: authKey, type, title, content })
                });
                location.reload();
            }

            async function deleteIdea(id) {
                await fetch('/api/admin/delete-idea', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ password: authKey, id })
                });
                location.reload();
            }

            async function chargeUser() {
                const targetId = document.getElementById('target_id').value;
                const attempts = document.getElementById('charge_attempts').value;

                let res = await fetch('/api/admin/charge-user', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ password: authKey, targetId, attempts })
                });
                let data = await res.json();
                if(data.success) {
                    alert("تم شحن الحساب بنجاح وتخصيص المحاولات المطلوبة للمستخدم! 🚀");
                } else {
                    alert("خطأ: " + data.msg);
                }
            }
        </script>
    </body>
    </html>
    `);
});

app.listen(PORT, () => {
    console.log(`🚀 السيرفر يعمل بكفاءة كاملة على منفذ: ${PORT}`);
});
