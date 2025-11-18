// scripts/fix-email.js
import { initDatabases, getSqlite, getMysql } from '../src/config/db.js';
import { registerModels } from '../src/models/index.js';

const OLD = 'ag.ahmedgabr.2022@gmila.com';
const NEW = 'ag.ahmedgabr.2022@gmail.com';

async function main() {
  await initDatabases();
  const models = registerModels();
  const { StudentSqlite, StudentMysql } = models;

  // صحح في SQLite
  const a = await StudentSqlite.update({ email: NEW }, { where: { email: OLD } });
  // صحح في MySQL (لو موجود هناك)
  const b = await StudentMysql.update({ email: NEW }, { where: { email: OLD } });

  console.log('SQLite updated rows:', a[0], 'MySQL updated rows:', b[0]);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
