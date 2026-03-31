// ===== server.js (FIXED & RAILWAY READY) =====

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const XLSX = require('xlsx');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(__dirname));

// ===== uploads headers =====
app.use('/uploads', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Range, Content-Type');
  res.header('Accept-Ranges', 'bytes');
  next();
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ===== ensure uploads folder =====
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// ===== multer config =====
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, unique + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

// ===== database =====
const db = new sqlite3.Database('quiz.db');

// ===== helper (حل مشكلة req.files) =====
function handleFiles(req, vars) {
  if (!req.files) return vars;

  if (req.files.question_image) {
    vars.question_image = req.files.question_image[0].filename;
  }

  if (req.files.audio_question) {
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

  if (req.files.answer_image) {
    vars.answer_image = req.files.answer_image[0].filename;
  }

  if (req.files.correct_answer_image) {
    vars.correct_answer_image = req.files.correct_answer_image[0].filename;
  }

  if (req.files.puzzle_image) {
    vars.puzzle_image = req.files.puzzle_image[0].filename;
  }

  return vars;
}

// ===== routes =====

// اختبار السيرفر
app.get('/', (req, res) => {
  res.send('Quiz Game Running ✅');
});

app.get('/health', (req, res) => {
  res.send('OK');
});

// ===== إضافة سؤال =====
app.post('/questions',
  upload.fields([
    { name: 'question_image' },
    { name: 'answer_image' },
    { name: 'correct_answer_image' },
    { name: 'puzzle_image' },
    { name: 'audio_question' },
    { name: 'audio_answer' },
    { name: 'video_question' },
    { name: 'video_answer' }
  ]),
  (req, res) => {

    let vars = {
      question_image: null,
      answer_image: null,
      correct_answer_image: null,
      puzzle_image: null
    };

    vars = handleFiles(req, vars);

    const {
      category_id,
      question,
      correct_answer,
      points = 200
    } = req.body;

    if (!category_id || !question) {
      return res.status(400).json({ error: 'بيانات ناقصة' });
    }

    db.run(
      `INSERT INTO questions 
      (category_id, question, correct_answer, points, question_image)
      VALUES (?,?,?,?,?)`,
      [category_id, question, correct_answer, points, vars.question_image],
      function (err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json({ id: this.lastID });
      }
    );
  }
);

// ===== تعديل سؤال =====
app.put('/questions/:id',
  upload.fields([
    { name: 'question_image' },
    { name: 'answer_image' },
    { name: 'correct_answer_image' },
    { name: 'puzzle_image' },
    { name: 'audio_question' },
    { name: 'audio_answer' },
    { name: 'video_question' },
    { name: 'video_answer' }
  ]),
  (req, res) => {

    let vars = {
      question_image: null,
      answer_image: null,
      correct_answer_image: null,
      puzzle_image: null
    };

    vars = handleFiles(req, vars);

    const id = req.params.id;
    const {
      category_id,
      question,
      correct_answer,
      points = 200
    } = req.body;

    db.run(
      `UPDATE questions 
       SET category_id=?, question=?, correct_answer=?, points=?
       WHERE id=?`,
      [category_id, question, correct_answer, points, id],
      function (err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json({ updated: this.changes });
      }
    );
  }
);

// ===== حذف سؤال =====
app.delete('/questions/:id', (req, res) => {
  db.run(
    `DELETE FROM questions WHERE id=?`,
    [req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ deleted: this.changes });
    }
  );
});

// ===== تشغيل السيرفر (مهم لـ Railway) =====
app.listen(PORT, '0.0.0.0', () => {
  console.log("PORT =", process.env.PORT);
  console.log(`🚀 Server running on port ${PORT}`);
});
