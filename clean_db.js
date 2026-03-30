const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('quiz.db');

console.log('تنظيف البيانات الفاسدة في قاعدة البيانات...');
console.log('=====================================');

// البحث عن الأسئلة التي تحتوي على "[object Object]"
db.all('SELECT id, question, answer FROM questions WHERE answer = "[object Object]"', [], (err, rows) => {
  if (err) {
    console.error('خطأ:', err.message);
    return;
  }
  
  console.log(`تم العثور على ${rows.length} سؤال يحتوي على بيانات فاسدة`);
  
  if (rows.length === 0) {
    console.log('لا توجد بيانات فاسدة للتنظيف');
    db.close();
    return;
  }
  
  // تنظيف البيانات الفاسدة
  const stmt = db.prepare('UPDATE questions SET answer = NULL WHERE id = ?');
  
  let cleaned = 0;
  rows.forEach((row) => {
    stmt.run([row.id], (err) => {
      if (err) {
        console.error(`خطأ في تنظيف السؤال ${row.id}:`, err.message);
      } else {
        cleaned++;
        console.log(`تم تنظيف السؤال ${row.id}: "${row.question}"`);
      }
      
      if (cleaned === rows.length) {
        stmt.finalize();
        console.log(`\nتم تنظيف ${cleaned} سؤال بنجاح`);
        console.log('يمكنك الآن إعادة إدخال الإجابات الصحيحة لهذه الأسئلة');
        db.close();
      }
    });
  });
});

