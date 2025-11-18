import { Router } from 'express';
import { Op } from 'sequelize';
import { performOperation } from '../services/replicator.js';
import { isAllowedHost } from '../utils/url-guard.js';
import softAuth from '../middlewares/soft-auth.js';
import { requireRole } from '../middlewares/roles.js';
import { requireAuth } from '../middlewares/auth.js';

/** أنواع المرفقات المسموحة لإجابة الـFAQ */
const ALLOWED_KINDS = ['image','video','audio','pdf','doc','mp4','hls','external','link'];

function normalizeAttachments(arr) {
  if (!arr) return null;
  if (!Array.isArray(arr)) return null;
  const out = [];
  for (const x of arr) {
    if (!x || typeof x !== 'object') continue;
    const kind = String(x.kind || '').toLowerCase();
    if (!ALLOWED_KINDS.includes(kind)) continue;

    const url = String(x.url || '').trim();
    if (!url) continue;

    // external (يوتيوب/فيميو) يسمح بأي دومين — غير كده نتحقق من الدومين
    const isExternal = kind === 'external' ||
      ['youtube','vimeo'].includes(String(x.provider || '').toLowerCase());
    if (!isExternal && !isAllowedHost(url)) continue;

    out.push({
      kind,
      url,
      mime: x.mime ?? null,
      provider: x.provider ? String(x.provider).toLowerCase() : null,
      streamType: x.streamType ? String(x.streamType).toLowerCase() : null,
      durationSec: x.durationSec != null ? Number(x.durationSec) : null,
      thumb: x.thumb ?? null,
    });
  }
  return out.length ? out : null;
}

function validateBody(b, isUpdate = false) {
  const errors = [];
  if (!isUpdate) {
    if (!b.questionText || String(b.questionText).trim().length < 3)
      errors.push('questionText مطلوب (≥ 3 أحرف)');
  }
  if (b.attachments) {
    const at = normalizeAttachments(b.attachments);
    if (!at) errors.push('attachments غير صالحة');
  }
  if (b.status && !['draft','published'].includes(String(b.status)))
    errors.push('status غير صالح (draft|published)');
  if (b.orderIndex !== undefined && Number.isNaN(Number(b.orderIndex)))
    errors.push('orderIndex يجب أن يكون رقمًا');
  return errors;
}

export default function createFaqRouter(models) {
  const router = Router();
  const { OutboxSqlite, FaqSqlite, FaqMysql } = models;

  /** ===== إنشاء عنصر FAQ (سؤال+إجابة) — admin/user ===== */
  router.post('/', requireAuth, requireRole('admin','user'), async (req, res, next) => {
    try {
      const b = req.body || {};
      const errors = validateBody(b);
      if (errors.length) return res.status(400).json({ success: false, errors });

      // احصل على آخر orderIndex لزيادة الترتيب تلقائيًا لو لم يُرسل
      const maxOrder = await FaqSqlite.max('orderIndex', { where: { isDeleted: false } });
      const orderIndex = (b.orderIndex !== undefined)
        ? Number(b.orderIndex)
        : (Number.isFinite(maxOrder) ? Number(maxOrder) + 1 : 1);

      const data = {
        questionText: String(b.questionText).trim(),
        answerText:   b.answerText ? String(b.answerText).trim() : null,
        attachments:  normalizeAttachments(b.attachments),
        category:     b.category ?? null,
        level:        b.level ?? null,
        status:       b.status ?? 'published',
        orderIndex,
        updatedAtLocal: new Date(),
      };

      const created = await performOperation({
        modelName: 'Faq',
        sqliteModel: FaqSqlite,
        mysqlModel: FaqMysql,
        op: 'create',
        data,
        outboxModel: OutboxSqlite,
      });

      res.json({ success: true, data: created.toJSON() });
    } catch (e) { next(e); }
  });

  /** ===== تحديث عنصر FAQ — admin/user ===== */
  router.patch('/:id', requireAuth, requireRole('admin','user'), async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!id) return res.status(400).json({ success: false, message: 'معرّف غير صالح' });

      const existing = await FaqSqlite.findOne({ where: { id, isDeleted: false } });
      if (!existing) return res.status(404).json({ success: false, message: 'العنصر غير موجود' });

      const b = req.body || {};
      const errors = validateBody(b, true);
      if (errors.length) return res.status(400).json({ success: false, errors });

      const patch = { updatedAtLocal: new Date() };
      if (b.questionText !== undefined) patch.questionText = String(b.questionText).trim();
      if (b.answerText   !== undefined) patch.answerText   = b.answerText ? String(b.answerText).trim() : null;
      if (b.attachments  !== undefined) patch.attachments  = normalizeAttachments(b.attachments);
      if (b.category     !== undefined) patch.category     = b.category ?? null;
      if (b.level        !== undefined) patch.level        = b.level ?? null;
      if (b.status       !== undefined) patch.status       = b.status;
      if (b.orderIndex   !== undefined) patch.orderIndex   = Number(b.orderIndex);

      await performOperation({
        modelName: 'Faq',
        sqliteModel: FaqSqlite,
        mysqlModel: FaqMysql,
        op: 'update',
        where: { id },
        data: patch,
        outboxModel: OutboxSqlite,
      });

      res.json({ success: true, data: { id, ...patch } });
    } catch (e) { next(e); }
  });

  /** ===== حذف ناعم — admin/user ===== */
  router.delete('/:id', requireAuth, requireRole('admin','user'), async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!id) return res.status(400).json({ success: false, message: 'معرّف غير صالح' });

      const existing = await FaqSqlite.findOne({ where: { id, isDeleted: false } });
      if (!existing) return res.status(404).json({ success: false, message: 'العنصر غير موجود' });

      await performOperation({
        modelName: 'Faq',
        sqliteModel: FaqSqlite,
        mysqlModel: FaqMysql,
        op: 'update',
        where: { id },
        data: { isDeleted: true, updatedAtLocal: new Date() },
        outboxModel: OutboxSqlite,
      });

      res.json({ success: true, message: 'تم الحذف' });
    } catch (e) { next(e); }
  });

  /** ===== قراءة عنصر واحد (للدashboard/الويب) ===== */
  router.get('/:id', softAuth, async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!id) return res.status(400).json({ success: false, message: 'معرّف غير صالح' });

      const row = await FaqSqlite.findOne({ where: { id, isDeleted: false } });
      if (!row) return res.status(404).json({ success: false, message: 'غير موجود' });

      res.json({ success: true, data: row });
    } catch (e) { next(e); }
  });

  /**
   * ===== قائمة الكل:
   * - GET /faq
   * - يدعم: q, category, level, status, page/limit, all=1
   * - الطلب الافتراضي للطلاب يعرض published فقط (لو عايز الكل من الداشبورد ابعت ?status=all)
   */
  router.get('/', softAuth, async (req, res, next) => {
    try {
      const q        = String(req.query.q || '').trim();
      const category = String(req.query.category || '').trim();
      const level    = String(req.query.level || '').trim();
      const status   = String(req.query.status || '').trim(); // draft|published|all
      const all      = String(req.query.all || '').trim() === '1';

      const page  = Math.max(1, Number(req.query.page || 1));
      const limit = all ? undefined : Math.min(100, Math.max(1, Number(req.query.limit || 20)));
      const offset = all ? undefined : (page - 1) * limit;

      const where = { isDeleted: false };
      if (q)        where[Op.or] = [{ questionText: { [Op.like]: `%${q}%` } }, { answerText: { [Op.like]: `%${q}%` } }];
      if (category) where.category = category;
      if (level)    where.level    = level;
      if (!status || status === 'published') where.status = 'published';
      else if (status === 'draft') where.status = 'draft';
      // status=all → لا نضع شرط الحالة

      const findOpts = {
        where,
        order: [['orderIndex','ASC'], ['id','ASC']],
      };
      if (!all) { findOpts.limit = limit; findOpts.offset = offset; }

      const { rows, count } = await FaqSqlite.findAndCountAll(findOpts);

      res.json({
        success: true,
        data: rows,
        pagination: all ? { total: count } : { page, limit, total: count },
      });
    } catch (e) { next(e); }
  });

  return router;
}
