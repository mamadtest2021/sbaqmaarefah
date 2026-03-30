const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const XLSX = require('xlsx');

const app = express();
const PORT = process.env.PORT || 3001;  // منفذ مختلف لتجنب التضارب

// إعداد CORS
app.use(cors());

// إعداد middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- تقديم الملفات الثابتة (HTML, CSS, JS, صور ...) ---
app.use(express.static(__dirname)); // يقدّم ملفات المشروع كلها
// تحسين ترويسات ملفات الصوت/الفيديو داخل /uploads لضمان التشغيل السلس
app.use('/uploads', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Range, Content-Type');
  // إعلان دعم التشغيل المتقطع
  res.header('Accept-Ranges', 'bytes');
  next();
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  etag: true,
  fallthrough: true,
  setHeaders: (res, filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.mp3') res.setHeader('Content-Type', 'audio/mpeg');
    else if (ext === '.wav') res.setHeader('Content-Type', 'audio/wav');
    else if (ext === '.ogg') res.setHeader('Content-Type', 'audio/ogg');
    // منع التحميل الإجباري إن وُجد إعداد خارجي
    res.setHeader('Cache-Control', 'public, max-age=3600');
  }
}));

// إنشاء مجلد uploads إذا لم يكن موجوداً
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

// إعداد multer لرفع الملفات
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// إعداد قاعدة البيانات
const db = new sqlite3.Database('quiz.db');

// دوال مساعدة للتعامل مع SQLite كـ Promise
function runAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
}

function getAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function allAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

// إنشاء الجداول
db.serialize(() => {
  // إنشاء جدول التصنيفات
  db.run(`CREATE TABLE IF NOT EXISTS category_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    is_hidden INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // إنشاء جدول الفئات
  db.run(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    category_group_id INTEGER DEFAULT 1,
    category_image TEXT,
    is_hidden INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_group_id) REFERENCES category_groups(id)
  )`);

  // إنشاء جدول الأسئلة
  db.run(`CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL,
    question TEXT NOT NULL,
    answer TEXT,
    correct_answer TEXT,
    points INTEGER DEFAULT 200,
    notes TEXT,
    question_image TEXT,
    answer_image TEXT,
    video_question TEXT,
    video_answer TEXT,
    audio_question TEXT,
    audio_answer TEXT,
    qr_text TEXT,
    puzzle_image TEXT,
    blanks_data TEXT,
    option2 TEXT,
    option3 TEXT,
    option4 TEXT,
    question_type TEXT DEFAULT 'normal',
    FOREIGN KEY (category_id) REFERENCES categories(id)
  )`);

  // إنشاء جدول الألعاب
  db.run(`CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // إنشاء جدول الألعاب المُلعبة
  db.run(`CREATE TABLE IF NOT EXISTS games_played (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER NOT NULL,
    question_id INTEGER NOT NULL,
    FOREIGN KEY (game_id) REFERENCES games(id),
    FOREIGN KEY (question_id) REFERENCES questions(id)
  )`);

  // إنشاء جدول الإعدادات
  db.run(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`);

  // إدراج البيانات الافتراضية
  db.run(`INSERT OR IGNORE INTO category_groups (id, name, description) VALUES (1, 'بلا تصنيف', 'التصنيف الافتراضي للفئات')`);
  
  // إضافة الأعمدة الجديدة إلى الجداول الموجودة إذا لم تكن موجودة
  db.run(`ALTER TABLE questions ADD COLUMN correct_answer TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('خطأ في إضافة عمود correct_answer:', err.message);
    }
  });

  db.run(`ALTER TABLE questions ADD COLUMN correct_answer_image TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('خطأ في إضافة عمود correct_answer_image:', err.message);
    }
  });
  
  db.run(`ALTER TABLE questions ADD COLUMN option2 TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('خطأ في إضافة عمود option2:', err.message);
    }
  });
  
  db.run(`ALTER TABLE questions ADD COLUMN option3 TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('خطأ في إضافة عمود option3:', err.message);
    }
  });
  
  db.run(`ALTER TABLE questions ADD COLUMN option4 TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('خطأ في إضافة عمود option4:', err.message);
    }
  });
  
  db.run(`ALTER TABLE questions ADD COLUMN question_type TEXT DEFAULT 'normal'`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('خطأ في إضافة عمود question_type:', err.message);
    }
  });
  
  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_games_played_unique ON games_played(game_id, question_id)`);

  // إنشاء جدول الأسئلة المُعلَّمة للمراجعة
  db.run(`CREATE TABLE IF NOT EXISTS review_flags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id INTEGER NOT NULL UNIQUE,
    flagged_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
  )`);
});



// --- Routes for Category Groups (التصنيفات) ---
app.get('/category-groups', async (req, res) => {
    try {
        const rows = await allAsync('SELECT * FROM category_groups ORDER BY name');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/category-groups', async (req, res) => {
    try {
        const { name, description } = req.body;
        if (!name) return res.status(400).json({ error: 'اسم التصنيف مطلوب' });
        const result = await runAsync('INSERT INTO category_groups (name, description) VALUES (?, ?)', [name, description]);
        res.status(201).json({ message: 'تم إضافة التصنيف بنجاح', id: result.lastID });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/category-groups/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description } = req.body;
        if (!name) return res.status(400).json({ error: 'اسم التصنيف مطلوب' });
        const result = await runAsync('UPDATE category_groups SET name = ?, description = ? WHERE id = ?', [name, description, id]);
        if (result.changes === 0) return res.status(404).json({ error: 'التصنيف غير موجود' });
        res.json({ message: 'تم تعديل التصنيف بنجاح' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/category-groups/:id/toggle-hidden', async (req, res) => {
    try {
        const { id } = req.params;
        const group = await getAsync('SELECT is_hidden FROM category_groups WHERE id = ?', [id]);
        if (!group) return res.status(404).json({ error: 'التصنيف غير موجود' });
        const newHiddenState = group.is_hidden === 1 ? 0 : 1;
        await runAsync('UPDATE category_groups SET is_hidden = ? WHERE id = ?', [newHiddenState, id]);
        res.json({ message: 'تم تغيير حالة التصنيف بنجاح', is_hidden: newHiddenState });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/category-groups/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await runAsync('DELETE FROM category_groups WHERE id = ?', [id]);
        if (result.changes === 0) return res.status(404).json({ error: 'التصنيف غير موجود' });
        res.json({ message: 'تم حذف التصنيف بنجاح' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Routes for Categories (الفئات) ---
app.get('/categories', async (req, res) => {
    try {
        const { for_game } = req.query;
        let query = `
            SELECT c.*, cg.name as category_group_name, cg.name as group_name 
            FROM categories c 
            LEFT JOIN category_groups cg ON c.category_group_id = cg.id 
        `;
        
        if (for_game === 'true') {
            query += ' WHERE c.is_hidden = 0 AND (cg.is_hidden = 0 OR cg.is_hidden IS NULL)';
        }
        
        query += ' ORDER BY cg.name, c.name';
        
        const rows = await allAsync(query);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/categories', upload.single('category_image'), async (req, res) => {
    try {
        const { name, description, category_group_id = 1 } = req.body;
        if (!name) return res.status(400).json({ error: 'اسم الفئة مطلوب' });
        
        const category_image = req.file ? req.file.filename : null;
        
        const result = await runAsync(
            'INSERT INTO categories (name, description, category_group_id, category_image) VALUES (?, ?, ?, ?)',
            [name, description, category_group_id, category_image]
        );
        res.status(201).json({ message: 'تم إضافة الفئة بنجاح', id: result.lastID });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/categories/:id', upload.single('category_image'), async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, category_group_id } = req.body;
        if (!name) return res.status(400).json({ error: 'اسم الفئة مطلوب' });
        
        let updateQuery = 'UPDATE categories SET name = ?, description = ?, category_group_id = ?';
        let params = [name, description, category_group_id, id];
        
        if (req.file) {
            updateQuery = 'UPDATE categories SET name = ?, description = ?, category_group_id = ?, category_image = ? WHERE id = ?';
            params = [name, description, category_group_id, req.file.filename, id];
        } else {
            updateQuery += ' WHERE id = ?';
        }
        
        const result = await runAsync(updateQuery, params);
        if (result.changes === 0) return res.status(404).json({ error: 'الفئة غير موجودة' });
        res.json({ message: 'تم تعديل الفئة بنجاح' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/categories/:id/toggle-hidden', async (req, res) => {
    try {
        const { id } = req.params;
        const category = await getAsync('SELECT is_hidden FROM categories WHERE id = ?', [id]);
        if (!category) return res.status(404).json({ error: 'الفئة غير موجودة' });
        const newHiddenState = category.is_hidden === 1 ? 0 : 1;
        await runAsync('UPDATE categories SET is_hidden = ? WHERE id = ?', [newHiddenState, id]);
        res.json({ message: 'تم تغيير حالة الفئة بنجاح', is_hidden: newHiddenState });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/categories/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await runAsync('DELETE FROM categories WHERE id = ?', [id]);
        if (result.changes === 0) return res.status(404).json({ error: 'الفئة غير موجودة' });
        res.json({ message: 'تم حذف الفئة بنجاح' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ---- Games APIs ----
app.get('/games', async (req, res) => {
  try {
    const rows = await allAsync('SELECT * FROM games ORDER BY created_at DESC');
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/games', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'اسم الجولة مطلوب' });
    const result = await runAsync('INSERT INTO games (name) VALUES (?)', [name]);
    res.status(201).json({ id: result.lastID });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/games/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'اسم الجولة مطلوب' });
    const result = await runAsync('UPDATE games SET name = ? WHERE id = ?', [name, id]);
    if (result.changes === 0) return res.status(404).json({ error: 'الجولة غير موجودة' });
    res.json({ message: 'تم تحديث الجولة بنجاح' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/games/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await runAsync('DELETE FROM games WHERE id = ?', [id]);
    if (result.changes === 0) return res.status(404).json({ error: 'الجولة غير موجودة' });
    res.json({ message: 'تم حذف الجولة بنجاح' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Questions APIs ----

// GET /questions?category_id=5
app.get('/questions', async (req, res) => {
  try {
    const { category_id } = req.query;
    let rows;
    if (category_id) {
      rows = await allAsync('SELECT * FROM questions WHERE category_id = ? ORDER BY id', [category_id]);
    } else {
      rows = await allAsync('SELECT * FROM questions ORDER BY id');
    }
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /questions/:id
app.get('/questions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const row = await getAsync('SELECT * FROM questions WHERE id = ?', [id]);
    if (!row) return res.status(404).json({ error: 'السؤال غير موجود' });
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /questions
app.post('/questions', upload.fields([
  { name: 'question_image', maxCount: 1 },
  { name: 'answer_image', maxCount: 1 },
  { name: 'correct_answer_image', maxCount: 1 },
  { name: 'puzzle_image', maxCount: 1 },
  { name: 'audio_question', maxCount: 1 },
  { name: 'audio_answer', maxCount: 1 },
  { name: 'video_question', maxCount: 1 },
  { name: 'video_answer', maxCount: 1 }
]), async (req, res) => {
  try {
    const {
      category_id, question, answer, points = 200, notes,
      video_question, video_answer, audio_question, audio_answer, 
      qr_text, correct_answer, option2, option3, option4,
      question_type = 'normal'
    } = req.body;

    if (!category_id || !question) {
      return res.status(400).json({ error: 'category_id و question مطلوبة' });
    }

    // معالجة الفراغات: تأتي كـ blanks_data (بعد تحويلها من admin) أو blanks[]
    let blanks_data = req.body.blanks_data || req.body['blanks[]'] || null;
    if (Array.isArray(blanks_data)) {
      blanks_data = JSON.stringify(blanks_data.filter(b => b && String(b).trim() !== ''));
    }

    // معالجة الملفات المرفوعة
    let question_image = null;
    let answer_image = null;
    let correct_answer_image = null;
    let puzzle_image = null;

    if (req.files) {
      if (req.files.question_image) {
        question_image = req.files.question_image[0].filename;
      
      if (req.files.audio_question) {
        // خزّن اسم الملف في الحقل النصي
        req.body.audio_question = '/uploads/' + req.files.audio_question[0].filename;
      }
      if (req.files.audio_answer) {
        req.body.audio_answer = '/uploads/' + req.files.audio_answer[0].filename;
      }
      if (req.files.video_question) {
        req.body.video_question = '/uploads/' + req.files.video_question[0].filename;
      }
      if (req.files.video_answer) {
        req.body.video_answer = '/uploads/' + req.files.video_answer[0].filename;
      }
    }
      if (req.files.answer_image) {
        answer_image = req.files.answer_image[0].filename;
      }
      if (req.files.correct_answer_image) {
        correct_answer_image = req.files.correct_answer_image[0].filename;
      }
      if (req.files.puzzle_image) {
        puzzle_image = req.files.puzzle_image[0].filename;
      }
    }

    // تحديد الإجابة الصحيحة مع معالجة صحيحة
    let finalAnswer = answer || correct_answer;
    
    // معالجة البيانات المختلفة للإجابة
    if (finalAnswer !== null && finalAnswer !== undefined) {
      if (typeof finalAnswer === 'object') {
        // إذا كان كائن، حوله إلى JSON
        finalAnswer = JSON.stringify(finalAnswer);
      } else if (typeof finalAnswer !== 'string') {
        // إذا لم يكن نص، حوله إلى نص
        finalAnswer = String(finalAnswer);
      }
    } else {
      finalAnswer = null;
    }

    const result = await runAsync(
      `INSERT INTO questions
       (category_id, question, correct_answer, points, notes, question_image, answer_image, correct_answer_image,
        video_question, video_answer, audio_question, audio_answer, qr_text, puzzle_image, blanks_data,
        option2, option3, option4, question_type)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [category_id, question, finalAnswer, points, notes, question_image, answer_image, correct_answer_image,
       video_question, video_answer, audio_question, audio_answer, qr_text, puzzle_image, blanks_data,
       option2, option3, option4, question_type]
    );
    res.status(201).json({ id: result.lastID });
  } catch (e) {
    console.error('خطأ في إضافة السؤال:', e);
    res.status(500).json({ error: e.message });
  }
});

// PUT /questions/:id
app.put('/questions/:id', upload.fields([
  { name: 'question_image', maxCount: 1 },
  { name: 'answer_image', maxCount: 1 },
  { name: 'correct_answer_image', maxCount: 1 },
  { name: 'puzzle_image', maxCount: 1 },
  { name: 'audio_question', maxCount: 1 },
  { name: 'audio_answer', maxCount: 1 },
  { name: 'video_question', maxCount: 1 },
  { name: 'video_answer', maxCount: 1 }
]), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      category_id, question, answer, points, notes,
      video_question, video_answer, audio_question, audio_answer,
      qr_text, correct_answer, option2, option3, option4,
      question_type
    } = req.body;

    // معالجة الفراغات: تأتي كـ blanks_data (بعد تحويلها من admin) أو blanks[]
    let blanks_data = req.body.blanks_data || req.body['blanks[]'] || null;
    if (Array.isArray(blanks_data)) {
      blanks_data = JSON.stringify(blanks_data.filter(b => b && String(b).trim() !== ''));
    }

    // معالجة الملفات المرفوعة
    let question_image = null;
    let answer_image = null;
    let correct_answer_image = null;
    let puzzle_image = null;

    if (req.files) {
      if (req.files.question_image) {
        question_image = req.files.question_image[0].filename;
      
      if (req.files.audio_question) {
        // خزّن اسم الملف في الحقل النصي
        req.body.audio_question = '/uploads/' + req.files.audio_question[0].filename;
      }
      if (req.files.audio_answer) {
        req.body.audio_answer = '/uploads/' + req.files.audio_answer[0].filename;
      }
      if (req.files.video_question) {
        req.body.video_question = '/uploads/' + req.files.video_question[0].filename;
      }
      if (req.files.video_answer) {
        req.body.video_answer = '/uploads/' + req.files.video_answer[0].filename;
      }
    }
      if (req.files.answer_image) {
        answer_image = req.files.answer_image[0].filename;
      }
      if (req.files.correct_answer_image) {
        correct_answer_image = req.files.correct_answer_image[0].filename;
      }
      if (req.files.puzzle_image) {
        puzzle_image = req.files.puzzle_image[0].filename;
      }
    }

    // تحديد الإجابة الصحيحة مع معالجة صحيحة
    let finalAnswer = answer || correct_answer;
    
    // معالجة البيانات المختلفة للإجابة
    if (finalAnswer !== null && finalAnswer !== undefined) {
      if (typeof finalAnswer === 'object') {
        // إذا كان كائن، حوله إلى JSON
        finalAnswer = JSON.stringify(finalAnswer);
      } else if (typeof finalAnswer !== 'string') {
        // إذا لم يكن نص، حوله إلى نص
        finalAnswer = String(finalAnswer);
      }
    } else {
      finalAnswer = null;
    }

    const result = await runAsync(
      `UPDATE questions SET
         category_id           = COALESCE(?, category_id),
         question              = COALESCE(?, question),
         correct_answer        = COALESCE(?, correct_answer),
         points                = COALESCE(?, points),
         notes                 = COALESCE(?, notes),
         question_image        = COALESCE(?, question_image),
         answer_image          = COALESCE(?, answer_image),
         correct_answer_image  = COALESCE(?, correct_answer_image),
         video_question        = COALESCE(?, video_question),
         video_answer          = COALESCE(?, video_answer),
         audio_question        = COALESCE(?, audio_question),
         audio_answer          = COALESCE(?, audio_answer),
         qr_text               = COALESCE(?, qr_text),
         puzzle_image          = COALESCE(?, puzzle_image),
         blanks_data           = COALESCE(?, blanks_data),
         option2               = COALESCE(?, option2),
         option3               = COALESCE(?, option3),
         option4               = COALESCE(?, option4),
         question_type         = COALESCE(?, question_type)
       WHERE id = ?`,
      [category_id, question, finalAnswer, points, notes,
       question_image, answer_image, correct_answer_image, video_question, video_answer,
       audio_question, audio_answer, qr_text, puzzle_image, blanks_data,
       option2, option3, option4, question_type, id]
    );
    if (result.changes === 0) return res.status(404).json({ error: 'السؤال غير موجود' });
    res.json({ message: 'تم تحديث السؤال بنجاح' });
  } catch (e) {
    console.error('خطأ في تعديل السؤال:', e);
    res.status(500).json({ error: e.message });
  }
});

// DELETE /questions/:id
app.delete('/questions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await runAsync('DELETE FROM questions WHERE id = ?', [id]);
    if (result.changes === 0) return res.status(404).json({ error: 'السؤال غير موجود' });
    res.json({ message: 'تم حذف السؤال بنجاح' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Games Played APIs ----

// GET /games/:id/played  -> returns [question_id,...]
app.get('/games/:id/played', async (req, res) => {
  try {
    const { id } = req.params;
    const rows = await allAsync('SELECT question_id FROM games_played WHERE game_id = ? ORDER BY id', [id]);
    res.json(rows.map(r => r.question_id));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /games/:id/played { question_id }
app.post('/games/:id/played', async (req, res) => {
  try {
    const { id } = req.params;
    const { question_id } = req.body;
    if (!question_id) return res.status(400).json({ error: 'question_id مطلوب' });
    await runAsync('INSERT OR IGNORE INTO games_played (game_id, question_id) VALUES (?,?)', [id, question_id]);
    res.status(201).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /games/:id/played/:question_id
app.delete('/games/:id/played/:question_id', async (req, res) => {
  try {
    const { id, question_id } = req.params;
    const result = await runAsync('DELETE FROM games_played WHERE game_id = ? AND question_id = ?', [id, question_id]);
    if (result.changes === 0) return res.status(404).json({ error: 'السجل غير موجود' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Export APIs ----

// GET /export/categories - تصدير الفئات إلى Excel
app.get('/export/categories', async (req, res) => {
  try {
    // جلب جميع الفئات مع معلومات التصنيف
    const categories = await allAsync(`
      SELECT 
        c.id,
        c.name,
        c.description,
        c.category_image,
        c.is_hidden,
        cg.name as category_group_name
      FROM categories c
      LEFT JOIN category_groups cg ON c.category_group_id = cg.id
      ORDER BY c.id
    `);

    // إنشاء workbook جديد
    const workbook = XLSX.utils.book_new();
    
    // تحضير البيانات للتصدير
    const exportData = categories.map(cat => ({
      'المعرف': cat.id,
      'اسم الفئة': cat.name,
      'الوصف': cat.description || '',
      'التصنيف': cat.category_group_name || 'بلا تصنيف',
      'الصورة': cat.category_image || '',
      'مخفية': cat.is_hidden ? 'نعم' : 'لا'
    }));

    // إنشاء worksheet
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    
    // إضافة worksheet إلى workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'الفئات');

    // تحويل إلى buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // إعداد headers للتحميل
    res.setHeader('Content-Disposition', 'attachment; filename="categories.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    
    res.send(buffer);
  } catch (e) {
    console.error('خطأ في تصدير الفئات:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /export/questions - تصدير الأسئلة إلى Excel
app.get('/export/questions', async (req, res) => {
  try {
    // جلب جميع الأسئلة مع معلومات الفئة
    const questions = await allAsync(`
      SELECT 
        q.id,
        q.question,
        q.correct_answer,
        q.points,
        q.notes,
        q.question_type,
        q.question_image,
        q.answer_image,
        q.video_question,
        q.video_answer,
        q.audio_question,
        q.audio_answer,
        q.qr_text,
        q.puzzle_image,
        q.blanks_data,
        q.option2,
        q.option3,
        q.option4,
        c.name as category_name
      FROM questions q
      LEFT JOIN categories c ON q.category_id = c.id
      ORDER BY q.id
    `);

    // إنشاء workbook جديد
    const workbook = XLSX.utils.book_new();
    
    // تحضير البيانات للتصدير
    const exportData = questions.map(q => ({
      'المعرف': q.id,
      'الفئة': q.category_name || 'غير محدد',
      'نوع السؤال': getQuestionTypeArabic(q.question_type),
      'نص السؤال': q.question,
      'الإجابة الصحيحة': formatAnswerForExport(q.correct_answer),
      'النقاط': q.points,
      'الملاحظات': q.notes || '',
      'الخيار 2': q.option2 || '',
      'الخيار 3': q.option3 || '',
      'الخيار 4': q.option4 || '',
      'صورة السؤال': q.question_image || '',
      'صورة الإجابة': q.answer_image || '',
      'فيديو السؤال': q.video_question || '',
      'فيديو الإجابة': q.video_answer || '',
      'صوت السؤال': q.audio_question || '',
      'صوت الإجابة': q.audio_answer || '',
      'نص QR': q.qr_text || '',
      'صورة الأحجية': q.puzzle_image || '',
      'بيانات الفراغات': q.blanks_data || ''
    }));

    // إنشاء worksheet
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    
    // إضافة worksheet إلى workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'الأسئلة');

    // تحويل إلى buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // إعداد headers للتحميل
    res.setHeader('Content-Disposition', 'attachment; filename="questions.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    
    res.send(buffer);
  } catch (e) {
    console.error('خطأ في تصدير الأسئلة:', e);
    res.status(500).json({ error: e.message });
  }
});

// دوال مساعدة للتصدير
function getQuestionTypeArabic(type) {
  const types = {
    'normal': 'عادي',
    'video': 'فيديو',
    'audio': 'صوتي',
    'blanks': 'فراغات',
    'puzzle': 'أحجية',
    'qr': 'رمز QR'
  };
  return types[type] || 'عادي';
}

function formatAnswerForExport(answer) {
  if (!answer) return '';
  
  // إذا كان النص يحتوي على "[object Object]" أو مشابه
  if (answer === '[object Object]' || answer === 'undefined' || answer === 'null') {
    return '';
  }
  
  // إذا كان JSON، حاول تحليله
  if (typeof answer === 'string' && (answer.startsWith('{') || answer.startsWith('['))) {
    try {
      const parsed = JSON.parse(answer);
      if (Array.isArray(parsed)) {
        return parsed.join('، ');
      }
      if (typeof parsed === 'object' && parsed.text) {
        return parsed.text;
      }
      if (typeof parsed === 'object' && parsed.value) {
        return parsed.value;
      }
    } catch (_) {
      // إذا فشل التحليل، أرجع النص كما هو
    }
  }
  
  return answer;
}

// --- Routes for Settings (الإعدادات) ---
app.get('/settings/:key', async (req, res) => {
    try {
        const { key } = req.params;
        const setting = await getAsync('SELECT value FROM settings WHERE key = ?', [key]);
        if (setting) {
            res.json({ key, value: setting.value });
        } else {
            // إرجاع قيمة افتراضية إذا لم يوجد الإعداد
            const defaultValue = key === 'show_categories_with_groups' ? 'true' : 'false';
            res.json({ key, value: defaultValue });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/settings/:key', async (req, res) => {
    try {
        const { key } = req.params;
        const { value } = req.body;
        
        if (!value) {
            return res.status(400).json({ error: 'قيمة الإعداد مطلوبة' });
        }
        
        // التحقق من وجود الإعداد وتحديثه أو إدراجه
        const existingSetting = await getAsync('SELECT key FROM settings WHERE key = ?', [key]);
        
        if (existingSetting) {
            await runAsync('UPDATE settings SET value = ? WHERE key = ?', [value, key]);
        } else {
            await runAsync('INSERT INTO settings (key, value) VALUES (?, ?)', [key, value]);
        }
        
        res.json({ message: 'تم حفظ الإعداد بنجاح', key, value });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Routes for Review Flags (أسئلة المراجعة) ---

// GET /review-flags — جلب كل الأسئلة المُعلَّمة مع بياناتها
app.get('/review-flags', async (req, res) => {
  try {
    const rows = await allAsync(`
      SELECT rf.id as flag_id, rf.question_id, rf.flagged_at,
             q.question, q.correct_answer, q.points, q.question_type, q.category_id,
             c.name as category_name
      FROM review_flags rf
      JOIN questions q ON q.id = rf.question_id
      LEFT JOIN categories c ON c.id = q.category_id
      ORDER BY rf.flagged_at DESC
    `);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /review-flags — إضافة سؤال للمراجعة
app.post('/review-flags', async (req, res) => {
  try {
    const { question_id } = req.body;
    if (!question_id) return res.status(400).json({ error: 'question_id مطلوب' });
    await runAsync('INSERT OR IGNORE INTO review_flags (question_id) VALUES (?)', [question_id]);
    res.status(201).json({ message: 'تمت إضافة السؤال للمراجعة' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /review-flags/:question_id — إزالة علامة المراجعة
app.delete('/review-flags/:question_id', async (req, res) => {
  try {
    const { question_id } = req.params;
    await runAsync('DELETE FROM review_flags WHERE question_id = ?', [question_id]);
    res.json({ message: 'تمت إزالة علامة المراجعة' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Health check
app.get('/health', (req, res) => res.send('OK'));

// بدء الخادم
app.listen(PORT, () => {
  console.log(`✅ السيرفر شغال على http://localhost:${PORT}`);
  console.log(`الخادم يعمل على المنفذ ${PORT}`);
});


// --- Routes for Import/Export (الاستيراد والتصدير) ---
app.post('/import/questions', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'ملف الاستيراد مطلوب' });
    }

    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    let importedCount = 0;
    let errors = [];

    for (const row of data) {
      try {
        // تحديد الفئة
        let categoryId = null;
        if (row['الفئة']) {
          const category = await getAsync('SELECT id FROM categories WHERE name = ?', [row['الفئة']]);
          if (category) {
            categoryId = category.id;
          } else {
            // إنشاء فئة جديدة إذا لم توجد
            const newCategory = await runAsync('INSERT INTO categories (name, category_group_id) VALUES (?, 1)', [row['الفئة']]);
            categoryId = newCategory.lastID;
          }
        }

        if (!categoryId) {
          errors.push(`السطر ${importedCount + 1}: لم يتم تحديد فئة صحيحة`);
          continue;
        }

        // تحديد نوع السؤال
        let questionType = 'normal';
        if (row['نوع السؤال']) {
          const typeMap = {
            'عادي': 'normal',
            'فيديو': 'video',
            'صوتي': 'audio',
            'فراغات': 'blanks',
            'أحجية': 'puzzle',
            'QR': 'qr'
          };
          questionType = typeMap[row['نوع السؤال']] || 'normal';
        }

        // إدراج السؤال
        await runAsync(
          `INSERT INTO questions 
           (category_id, question, correct_answer, points, notes, question_image, answer_image,
            video_question, video_answer, audio_question, audio_answer, qr_text, puzzle_image, 
            blanks_data, option2, option3, option4, question_type)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            categoryId,
            row['نص السؤال'] || '',
            row['الإجابة الصحيحة'] || '',
            row['النقاط'] || 200,
            row['الملاحظات'] || '',
            row['صورة السؤال'] || null,
            row['صورة الإجابة'] || null,
            row['فيديو السؤال'] || null,
            row['فيديو الإجابة'] || null,
            row['صوت السؤال'] || null,
            row['صوت الإجابة'] || null,
            row['نص QR'] || null,
            row['صورة الأحجية'] || null,
            row['بيانات الفراغات'] || null,
            row['الخيار 2'] || null,
            row['الخيار 3'] || null,
            row['الخيار 4'] || null,
            questionType
          ]
        );

        importedCount++;
      } catch (error) {
        errors.push(`السطر ${importedCount + 1}: ${error.message}`);
      }
    }

    // حذف الملف المؤقت
    fs.unlinkSync(req.file.path);

    res.json({
      message: `تم استيراد ${importedCount} سؤال بنجاح`,
      importedCount,
      errors: errors.length > 0 ? errors : null
    });

  } catch (error) {
    console.error('خطأ في استيراد الأسئلة:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/import/categories', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'ملف الاستيراد مطلوب' });
    }

    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    let importedCount = 0;
    let errors = [];

    for (const row of data) {
      try {
        // تحديد التصنيف
        let categoryGroupId = 1; // افتراضي
        if (row['التصنيف']) {
          const group = await getAsync('SELECT id FROM category_groups WHERE name = ?', [row['التصنيف']]);
          if (group) {
            categoryGroupId = group.id;
          } else {
            // إنشاء تصنيف جديد إذا لم يوجد
            const newGroup = await runAsync('INSERT INTO category_groups (name) VALUES (?)', [row['التصنيف']]);
            categoryGroupId = newGroup.lastID;
          }
        }

        // إدراج الفئة
        await runAsync(
          'INSERT INTO categories (name, description, category_group_id) VALUES (?, ?, ?)',
          [row['اسم الفئة'] || '', row['الوصف'] || '', categoryGroupId]
        );

        importedCount++;
      } catch (error) {
        errors.push(`السطر ${importedCount + 1}: ${error.message}`);
      }
    }

    // حذف الملف المؤقت
    fs.unlinkSync(req.file.path);

    res.json({
      message: `تم استيراد ${importedCount} فئة بنجاح`,
      importedCount,
      errors: errors.length > 0 ? errors : null
    });

  } catch (error) {
    console.error('خطأ في استيراد الفئات:', error);
    res.status(500).json({ error: error.message });
  }
});
