import dotenv from 'dotenv';
dotenv.config();

export const ENV = {
  PORT: process.env.PORT || 3000,

  MYSQL_DB: process.env.MYSQL_DB || 'etqan_db',
  MYSQL_USER: process.env.MYSQL_USER || 'root',
  MYSQL_PASS: process.env.MYSQL_PASS || '',
  MYSQL_HOST: process.env.MYSQL_HOST || '127.0.0.1',
  MYSQL_PORT: Number(process.env.MYSQL_PORT || 3306),

  SQLITE_DIR: process.env.SQLITE_DIR || './data',
  SQLITE_FILE: process.env.SQLITE_FILE || 'local.sqlite',

  SYNC_INTERVAL_MS: Number(process.env.SYNC_INTERVAL_MS || 5000),
  NODE_ENV: process.env.NODE_ENV || 'development',
};
