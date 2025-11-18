// src/routes/clients.routes.js
import { Router } from 'express';
import { performOperation } from '../services/replicator.js';

export function createClientsRouter(models) {
  const router = Router();
  const { OutboxSqlite, ClientSqlite, ClientMysql } = models;

  router.get('/', async (req, res, next) => {
    try {
      const rows = await ClientSqlite.findAll({ order: [['id', 'ASC']] });
      res.json({ success: true, data: rows });
    } catch (e) { next(e); }
  });

  router.post('/', async (req, res, next) => {
    try {
      const data = req.body;
      const r = await performOperation({
        modelName: 'Client',
        sqliteModel: ClientSqlite,
        mysqlModel: ClientMysql,
        op: 'create',
        data,
        outboxModel: OutboxSqlite
      });
      res.json({ success: true, data: r });
    } catch (e) { next(e); }
  });

  router.put('/:id', async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const data = req.body;
      const r = await performOperation({
        modelName: 'Client',
        sqliteModel: ClientSqlite,
        mysqlModel: ClientMysql,
        op: 'update',
        data,
        where: { id },
        outboxModel: OutboxSqlite
      });
      res.json({ success: true, data: r });
    } catch (e) { next(e); }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const r = await performOperation({
        modelName: 'Client',
        sqliteModel: ClientSqlite,
        mysqlModel: ClientMysql,
        op: 'delete',
        where: { id },
        outboxModel: OutboxSqlite
      });
      res.json({ success: true, data: r });
    } catch (e) { next(e); }
  });

  return router;
}
