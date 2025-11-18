// src/routes/map-faq.routes.js
import { Router } from 'express';
import { Op } from 'sequelize';
import { isAllowedHost } from '../utils/url-guard.js';
import { requireAuth } from '../middlewares/auth.js';
import softAuth from '../middlewares/soft-auth.js';
import { requireRole } from '../middlewares/roles.js';
import { performOperation } from '../services/replicator.js';
import { normalizeLevel } from '../utils/levels.js';

function validUrlMaybe(u) {
  if (!u) return true;
  return isAllowedHost(String(u));
}

function normalizeTags(arr) {
  if (!arr) return null;
  if (!Array.isArray(arr)) return null;
  const t = arr
    .map((x) => String(x || '').trim())
    .filter(Boolean);
  return t.length ? t : null;
}

export default function createMapFaqRouter(models) {
  const router = Router();
  const {
    OutboxSqlite,
    MapBankSqlite,
    MapBankMysql,
    MapBankItemSqlite,
    MapBankItemMysql,
  } = models;

  // ===== Banks =====

  // إنشاء بنك (admin/user)
  router.post(
    '/banks',
    requireAuth,
    requireRole('admin', 'user'),
    async (req, res, next) => {
      try {
        const level = normalizeLevel(req.body?.level);
        const title = String(req.body?.title || '').trim();
        const status = String(req.body?.status || 'draft').trim();
        const orderIndex = Number(req.body?.orderIndex || 1);

        if (!title || !level) {
          return res
            .status(400)
            .json({ success: false, message: 'title و level مطلوبان' });
        }

        const created = await performOperation({
          modelName: 'MapBank',
          sqliteModel: MapBankSqlite,
          mysqlModel: MapBankMysql,
          op: 'create',
          data: { title, level, status, orderIndex, updatedAtLocal: new Date() },
          outboxModel: OutboxSqlite,
        });

        res.json({ success: true, data: created.toJSON() });
      } catch (e) {
        next(e);
      }
    }
  );

  // قائمة البنوك (فلترة: level, q, status) — الطلاب يشوفوا published فقط
  router.get('/banks', softAuth, async (req, res, next) => {
    try {
      const q = String(req.query.q || '').trim();
      const levelQ = String(req.query.level || '').trim();
      const statusQ = String(req.query.status || '').trim(); // لو فاضي واليوزر طالب → ندي published
      const isStudent = req.user?.role === 'student';

      const where = { isDeleted: false };
      if (q) where.title = { [Op.like]: `%${q}%` };

      if (levelQ) where.level = normalizeLevel(levelQ) || levelQ;
      else if (req.user?.level)
        where.level = normalizeLevel(req.user.level) || req.user.level;

      if (statusQ) where.status = statusQ;
      else if (isStudent) where.status = 'published';

      const rows = await MapBankSqlite.findAll({
        where,
        order: [
          ['orderIndex', 'ASC'],
          ['id', 'ASC'],
        ],
      });

      res.json({ success: true, data: rows });
    } catch (e) {
      next(e);
    }
  });

  // تفاصيل بنك + عناصره (لو طالب → published items فقط)
  router.get('/banks/:bankId', softAuth, async (req, res, next) => {
    try {
      const bankId = Number(req.params.bankId);
      if (!bankId)
        return res
          .status(400)
          .json({ success: false, message: 'bankId غير صالح' });

      const bank = await MapBankSqlite.findOne({
        where: { id: bankId, isDeleted: false },
      });
      if (!bank)
        return res
          .status(404)
          .json({ success: false, message: 'البنك غير موجود' });

      const isStudent = req.user?.role === 'student';
      const whereItems = { bankId, isDeleted: false };
      if (isStudent) whereItems.status = 'published';

      const items = await MapBankItemSqlite.findAll({
        where: whereItems,
        order: [
          ['orderIndex', 'ASC'],
          ['id', 'ASC'],
        ],
      });

      res.json({ success: true, data: { bank, items } });
    } catch (e) {
      next(e);
    }
  });

  // تعديل بنك
  router.patch(
    '/banks/:bankId',
    requireAuth,
    requireRole('admin', 'user'),
    async (req, res, next) => {
      try {
        const bankId = Number(req.params.bankId);
        const bank = await MapBankSqlite.findOne({
          where: { id: bankId, isDeleted: false },
        });
        if (!bank)
          return res
            .status(404)
            .json({ success: false, message: 'البنك غير موجود' });

        const patch = { updatedAtLocal: new Date() };
        if (req.body.title !== undefined)
          patch.title = String(req.body.title).trim();
        if (req.body.level !== undefined) {
          const lv = normalizeLevel(req.body.level);
          if (!lv)
            return res
              .status(400)
              .json({ success: false, message: 'level غير صالح' });
          patch.level = lv;
        }
        if (req.body.status !== undefined)
          patch.status = String(req.body.status).trim();
        if (req.body.orderIndex !== undefined)
          patch.orderIndex = Number(req.body.orderIndex);

        await performOperation({
          modelName: 'MapBank',
          sqliteModel: MapBankSqlite,
          mysqlModel: MapBankMysql,
          op: 'update',
          where: { id: bankId },
          data: patch,
          outboxModel: OutboxSqlite,
        });

        res.json({ success: true, data: { id: bankId, ...patch } });
      } catch (e) {
        next(e);
      }
    }
  );

  // حذف بنك (ناعم)
  router.delete(
    '/banks/:bankId',
    requireAuth,
    requireRole('admin', 'user'),
    async (req, res, next) => {
      try {
        const bankId = Number(req.params.bankId);
        const bank = await MapBankSqlite.findOne({
          where: { id: bankId, isDeleted: false },
        });
        if (!bank)
          return res
            .status(404)
            .json({ success: false, message: 'البنك غير موجود' });

        await performOperation({
          modelName: 'MapBank',
          sqliteModel: MapBankSqlite,
          mysqlModel: MapBankMysql,
          op: 'update',
          where: { id: bankId },
          data: { isDeleted: true, updatedAtLocal: new Date() },
          outboxModel: OutboxSqlite,
        });

        res.json({ success: true, message: 'تم حذف البنك' });
      } catch (e) {
        next(e);
      }
    }
  );

  // ===== Items =====

  // إنشاء عنصر واحد
  router.post(
    '/banks/:bankId/items',
    requireAuth,
    requireRole('admin', 'user'),
    async (req, res, next) => {
      try {
        const bankId = Number(req.params.bankId);
        if (!bankId)
          return res
            .status(400)
            .json({ success: false, message: 'bankId غير صالح' });

        const bank = await MapBankSqlite.findOne({
          where: { id: bankId, isDeleted: false },
        });
        if (!bank)
          return res
            .status(404)
            .json({ success: false, message: 'البنك غير موجود' });

        const b = req.body || {};
        const prompt = String(b.prompt || '').trim();
        if (!prompt)
          return res
            .status(400)
            .json({ success: false, message: 'prompt مطلوب' });

        // تحقق الدومين للصور (اختياري)
        for (const u of [
          b.mapImageUrl,
          b.questionImageUrl,
          b.answerImageUrl,
        ]) {
          if (u && !validUrlMaybe(u)) {
            return res
              .status(400)
              .json({ success: false, message: 'دومين الصورة غير مسموح' });
          }
        }

        const data = {
          bankId,
          prompt,
          answerText: b.answerText ?? null,
          mapImageUrl: b.mapImageUrl ?? null,
          questionImageUrl: b.questionImageUrl ?? null,
          answerImageUrl: b.answerImageUrl ?? null,
          tags: normalizeTags(b.tags),
          status: String(b.status || 'draft'),
          orderIndex: Number(b.orderIndex || 1),
          updatedAtLocal: new Date(),
        };

        const created = await performOperation({
          modelName: 'MapBankItem',
          sqliteModel: MapBankItemSqlite,
          mysqlModel: MapBankItemMysql,
          op: 'create',
          data,
          outboxModel: OutboxSqlite,
        });

        res.json({ success: true, data: created.toJSON() });
      } catch (e) {
        next(e);
      }
    }
  );

  // Batch إنشاء عناصر متعددة في طلب واحد
  router.post(
    '/banks/:bankId/items/batch',
    requireAuth,
    requireRole('admin', 'user'),
    async (req, res, next) => {
      try {
        const bankId = Number(req.params.bankId);
        if (!bankId)
          return res
            .status(400)
            .json({ success: false, message: 'bankId غير صالح' });

        const bank = await MapBankSqlite.findOne({
          where: { id: bankId, isDeleted: false },
        });
        if (!bank)
          return res
            .status(404)
            .json({ success: false, message: 'البنك غير موجود' });

        const items = Array.isArray(req.body?.items) ? req.body.items : [];
        if (!items.length)
          return res
            .status(400)
            .json({ success: false, message: 'items[] مطلوبة' });

        const createdAll = [];
        for (const it of items) {
          const prompt = String(it.prompt || '').trim();
          if (!prompt) continue;

          for (const u of [
            it.mapImageUrl,
            it.questionImageUrl,
            it.answerImageUrl,
          ]) {
            if (u && !validUrlMaybe(u)) {
              return res.status(400).json({
                success: false,
                message: 'دومين الصورة غير مسموح',
              });
            }
          }

          const data = {
            bankId,
            prompt,
            answerText: it.answerText ?? null,
            mapImageUrl: it.mapImageUrl ?? null,
            questionImageUrl: it.questionImageUrl ?? null,
            answerImageUrl: it.answerImageUrl ?? null,
            tags: normalizeTags(it.tags),
            status: String(it.status || 'draft'),
            orderIndex: Number(it.orderIndex || 1),
            updatedAtLocal: new Date(),
          };

          const created = await performOperation({
            modelName: 'MapBankItem',
            sqliteModel: MapBankItemSqlite,
            mysqlModel: MapBankItemMysql,
            op: 'create',
            data,
            outboxModel: OutboxSqlite,
          });
          createdAll.push(created.toJSON());
        }

        res.json({ success: true, data: createdAll });
      } catch (e) {
        next(e);
      }
    }
  );

  // تعديل عنصر
  router.patch(
    '/items/:itemId',
    requireAuth,
    requireRole('admin', 'user'),
    async (req, res, next) => {
      try {
        const itemId = Number(req.params.itemId);
        const item = await MapBankItemSqlite.findOne({
          where: { id: itemId, isDeleted: false },
        });
        if (!item)
          return res
            .status(404)
            .json({ success: false, message: 'العنصر غير موجود' });

        const b = req.body || {};
        for (const u of [
          b.mapImageUrl,
          b.questionImageUrl,
          b.answerImageUrl,
        ]) {
          if (u && !validUrlMaybe(u)) {
            return res
              .status(400)
              .json({ success: false, message: 'دومين الصورة غير مسموح' });
          }
        }

        const patch = { updatedAtLocal: new Date() };
        if (b.prompt !== undefined) patch.prompt = String(b.prompt).trim();
        if (b.answerText !== undefined) patch.answerText = b.answerText ?? null;
        if (b.mapImageUrl !== undefined) patch.mapImageUrl = b.mapImageUrl ?? null;
        if (b.questionImageUrl !== undefined)
          patch.questionImageUrl = b.questionImageUrl ?? null;
        if (b.answerImageUrl !== undefined)
          patch.answerImageUrl = b.answerImageUrl ?? null;
        if (b.tags !== undefined) patch.tags = normalizeTags(b.tags);
        if (b.status !== undefined) patch.status = String(b.status).trim();
        if (b.orderIndex !== undefined)
          patch.orderIndex = Number(b.orderIndex);

        await performOperation({
          modelName: 'MapBankItem',
          sqliteModel: MapBankItemSqlite,
          mysqlModel: MapBankItemMysql,
          op: 'update',
          where: { id: itemId },
          data: patch,
          outboxModel: OutboxSqlite,
        });

        res.json({ success: true, data: { id: itemId, ...patch } });
      } catch (e) {
        next(e);
      }
    }
  );

  // حذف عنصر (ناعم)
  router.delete(
    '/items/:itemId',
    requireAuth,
    requireRole('admin', 'user'),
    async (req, res, next) => {
      try {
        const itemId = Number(req.params.itemId);
        const item = await MapBankItemSqlite.findOne({
          where: { id: itemId, isDeleted: false },
        });
        if (!item)
          return res
            .status(404)
            .json({ success: false, message: 'العنصر غير موجود' });

        await performOperation({
          modelName: 'MapBankItem',
          sqliteModel: MapBankItemSqlite,
          mysqlModel: MapBankItemMysql,
          op: 'update',
          where: { id: itemId },
          data: { isDeleted: true, updatedAtLocal: new Date() },
          outboxModel: OutboxSqlite,
        });

        res.json({ success: true, message: 'تم حذف العنصر' });
      } catch (e) {
        next(e);
      }
    }
  );

  // (اختياري) بحث مباشر في العناصر
  router.get('/items', softAuth, async (req, res, next) => {
    try {
      const bankId = Number(req.query.bankId || 0);
      const q = String(req.query.q || '').trim();
      const tags = Array.isArray(req.query.tags) ? req.query.tags : null;
      const isStudent = req.user?.role === 'student';

      const where = { isDeleted: false };
      if (bankId) where.bankId = bankId;
      if (q) where.prompt = { [Op.like]: `%${q}%` };
      if (isStudent) where.status = 'published';

      const rows = await MapBankItemSqlite.findAll({
        where,
        order: [
          ['orderIndex', 'ASC'],
          ['id', 'ASC'],
        ],
      });

      // فلترة tags client-like (بسيطة)
      const filtered =
        tags && tags.length
          ? rows.filter(
              (r) =>
                Array.isArray(r.tags) &&
                tags.every((t) => r.tags.includes(t))
            )
          : rows;

      res.json({ success: true, data: filtered });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
