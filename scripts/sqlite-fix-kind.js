// scripts/sqlite-fix-kind.js
import { sequelizeSqlite } from '../src/models/index.js'; // عدّل المسار وفق تصديرك للـ SQLite sequelize

async function ensureLessonsKind() {
  const dialect = sequelizeSqlite.getDialect?.() || 'sqlite';
  if (dialect !== 'sqlite') {
    console.log('Not SQLite; nothing to do.');
    return;
  }

  // 1) افحص الأعمدة الحالية
  const cols = await sequelizeSqlite.query('PRAGMA table_info(lessons);', { type: sequelizeSqlite.QueryTypes.SELECT });
  const hasKind = cols.some(c => c.name === 'kind');

  // 2) أضِف العمود لو ناقص
  if (!hasKind) {
    console.log('Adding lessons.kind column…');
    await sequelizeSqlite.query(`ALTER TABLE lessons ADD COLUMN kind TEXT DEFAULT 'lesson';`);
    // اختيارياً: لو عندك بيانات قديمة وتحتاج قيمة معينة لبعض الصفوف، حدّثها هنا.
    // await sequelizeSqlite.query(`UPDATE lessons SET kind='lesson' WHERE kind IS NULL;`);
  } else {
    console.log('Column lessons.kind already exists.');
  }

  // 3) اخرج بنجاح
  await sequelizeSqlite.close();
  console.log('Done.');
}

ensureLessonsKind().catch(async (e) => {
  console.error(e);
  try { await sequelizeSqlite.close(); } catch {}
  process.exit(1);
});
