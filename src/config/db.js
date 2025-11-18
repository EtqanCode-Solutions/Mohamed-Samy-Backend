// src/config/db.js
import { Sequelize } from 'sequelize';
import path from 'path';
import fs from 'fs';
import { ENV } from './env.js';

let sqlite;
let mysql;

/* ---------- SQLite ---------- */
function makeSqlite() {
  const dir = path.isAbsolute(ENV.SQLITE_DIR)
    ? ENV.SQLITE_DIR
    : path.join(process.cwd(), ENV.SQLITE_DIR);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: path.join(dir, ENV.SQLITE_FILE),
    logging: false,
    // اتصال واحد يمنع السباقات/الـ locks
    pool: { max: 1, min: 1, idle: 10000, acquire: 30000 },
  });

  return sequelize;
}

/* ---------- MySQL ---------- */
function makeMysql() {
  return new Sequelize(ENV.MYSQL_DB, ENV.MYSQL_USER, ENV.MYSQL_PASS, {
    host: ENV.MYSQL_HOST,
    port: Number(ENV.MYSQL_PORT || 3306),
    dialect: 'mysql',
    logging: false,
  });
}

/* ---------- PRAGMA لِـ SQLite ---------- */
export async function applySqlitePragmas(sequelize) {
  // ترتيب هذه الأوامر مهم
  await sequelize.query('PRAGMA journal_mode = WAL;');
  await sequelize.query('PRAGMA synchronous = NORMAL;');
  await sequelize.query('PRAGMA busy_timeout = 5000;'); // انتظر 5 ثواني قبل SQLITE_BUSY
  // يمكن إضافة إعدادات أخرى عند الحاجة:
  // await sequelize.query('PRAGMA temp_store = MEMORY;');
  // await sequelize.query('PRAGMA mmap_size = 268435456;'); // 256MB
}

/* ---------- Init ---------- */
export async function initDatabases() {
  sqlite = makeSqlite();
  await sqlite.authenticate();
  console.log('✅ SQLite ready');

  // طبّق PRAGMA مباشرة بعد الاتصال
  await applySqlitePragmas(sqlite);

  mysql = makeMysql();
  try {
    await mysql.authenticate();
    console.log('✅ MySQL ready');
  } catch (e) {
    console.warn('⚠️ MySQL not available:', e.message);
  }
}

export function getSqlite() {
  if (!sqlite) throw new Error('SQLite not initialized');
  return sqlite;
}

export function getMysql() {
  if (!mysql) throw new Error('MySQL not initialized');
  return mysql;
}

export async function isMysqlUp() {
  try {
    await getMysql().authenticate();
    return true;
  } catch {
    return false;
  }
}
