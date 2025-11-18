import { Router } from 'express';
import { isMysqlUp, getMysql, getSqlite } from '../config/db.js';

const router = Router();

router.get('/', (req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

router.get('/admin/status', async (req, res) => {
  const mysqlOk = await isMysqlUp();
  res.json({
    sqlite: getSqlite().options.storage,
    mysql: mysqlOk ? getMysql().config.database : null,
    mysqlUp: mysqlOk,
    time: new Date().toISOString()
  });
});

export default router;
