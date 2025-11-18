// src/routes/plans.routes.js
import { Router } from 'express';
import { performOperation } from '../services/replicator.js';
import { normalizeLevel } from '../utils/levels.js';
import { requireAuth } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/roles.js';

const ALLOWED_SCOPE_TYPES = ['ALL', 'CATEGORY', 'GRADE', 'COURSE_LIST'];
const MIN_PRICE = 0; // عدّل لو عايز حد أدنى

// ===== Helper: Grade =====
function normalizeGrade(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  const lv = normalizeLevel(s);
  return lv || null;
}

// ===== Helper: Categories =====
function normalizeCategories(input) {
  if (input == null) return null;
  const arr = Array.isArray(input) ? input : [input];
  const cleaned = arr.map((c) => String(c).trim()).filter(Boolean);
  return cleaned.length ? cleaned : null;
}

// ===== Helper: CourseIds =====
function normalizeCourseIds(input) {
  if (input == null) return null;
  if (!Array.isArray(input)) return null;
  const ids = input
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);
  return ids.length ? ids : null;
}

// ===== Helper: parse categories from scopeValue =====
function parseCategoriesFromScopeValue(scopeValue) {
  if (!scopeValue) return null;
  try {
    const parsed = JSON.parse(scopeValue);
    if (Array.isArray(parsed)) {
      return parsed.map((c) => String(c).trim()).filter(Boolean);
    }
  } catch {
    // مش JSON → نفترض single value
  }
  const s = String(scopeValue).trim();
  return s ? [s] : null;
}

// ===== Helper: parse courseIds from includeCourseIds =====
function parseCourseIdsFromInclude(includeCourseIds) {
  if (!includeCourseIds) return null;
  try {
    const parsed = JSON.parse(includeCourseIds);
    if (!Array.isArray(parsed)) return null;
    const ids = parsed
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0);
    return ids.length ? ids : null;
  } catch {
    return null;
  }
}

// ===== Validation for Plan body =====
function validatePlanBody(b, isPatch = false) {
  const errors = [];

  // name
  if (!isPatch) {
    if (!b.name || String(b.name).trim().length < 2) {
      errors.push('name مطلوب (≥2)');
    }
  } else if (b.name !== undefined && String(b.name).trim().length < 2) {
    errors.push('name غير صالح (≥2)');
  }

  // priceCents
  if (b.priceCents !== undefined) {
    const p = Number(b.priceCents);
    if (!Number.isFinite(p) || p < MIN_PRICE) {
      errors.push('priceCents غير صالح');
    }
  }

  // periodDays
  if (b.periodDays !== undefined) {
    const pd = Number(b.periodDays);
    if (!Number.isFinite(pd) || pd <= 0) {
      errors.push('periodDays يجب أن يكون رقمًا موجبًا');
    }
  }

  // currency
  if (b.currency !== undefined) {
    if (String(b.currency).length !== 3) {
      errors.push('currency يجب أن يكون رمز عملة من 3 أحرف (EGP, USD, ...)');
    }
  }

  // grade
  if (b.grade !== undefined && b.grade !== null && String(b.grade).trim() !== '') {
    const g = normalizeGrade(b.grade);
    if (!g) errors.push('grade غير صالح');
  }

  // categories
  if (b.categories !== undefined && b.categories !== null) {
    const cats = normalizeCategories(b.categories);
    if (!cats) {
      errors.push('categories غير صالحة');
    }
  }

  // courseIds
  if (b.courseIds !== undefined && b.courseIds !== null) {
    if (!Array.isArray(b.courseIds)) {
      errors.push('courseIds يجب أن يكون Array من أرقام');
    } else {
      const bad = b.courseIds.some((id) => {
        const n = Number(id);
        return !Number.isInteger(n) || n <= 0;
      });
      if (bad) errors.push('courseIds يحتوي قيم غير صالحة');
    }
  }

  // scopeType القديم (اختياري)
  if (b.scopeType !== undefined) {
    const S = String(b.scopeType || '').toUpperCase();
    if (!ALLOWED_SCOPE_TYPES.includes(S)) {
      errors.push('scopeType غير صالح (ALL | CATEGORY | GRADE | COURSE_LIST)');
    }
    if (
      S === 'CATEGORY' &&
      !b.categories &&
      (b.scopeValue === undefined ||
        b.scopeValue === null ||
        String(b.scopeValue).trim() === '')
    ) {
      errors.push('categories أو scopeValue مطلوب مع CATEGORY');
    }
    if (
      S === 'GRADE' &&
      !b.grade &&
      (b.scopeValue === undefined ||
        b.scopeValue === null ||
        String(b.scopeValue).trim() === '')
    ) {
      errors.push('grade أو scopeValue مطلوب مع GRADE');
    }
  }

  return errors;
}

// ===== Helpers خاصة بجزء اشتراكات الطالب =====

function deriveUnit(periodDays) {
  if (!periodDays) return 'اشتراك';
  if (periodDays === 30) return 'اشتراك شهري';
  if (periodDays === 90) return 'اشتراك ٣ شهور';
  if (periodDays === 180) return 'اشتراك نصف سنوي';
  if (periodDays === 365) return 'اشتراك سنوي';
  return `اشتراك ${periodDays} يوم`;
}

function buildScopeLabel(plan) {
  if (!plan) return '';
  if (plan.scopeType === 'ALL') {
    if (plan.scopeStage) {
      return `كل المواد المتاحة للمرحلة: ${plan.scopeStage}`;
    }
    return 'كل المواد المتاحة في هذه الخطة';
  }
  if (plan.scopeType === 'GRADE' && plan.scopeStage) {
    return `خطة للمرحلة: ${plan.scopeStage}`;
  }
  if (plan.scopeType === 'CATEGORY' && plan.scopeValue) {
    return `خطة لفئة: ${plan.scopeValue}`;
  }
  if (plan.scopeType === 'COURSE_LIST') {
    return 'خطة لمجموعة مواد محددة';
  }
  return '';
}

function mapSubscriptionToUi(sub) {
  const plan = sub.Plan || sub.plan || {};
  const now = new Date();

  const start = sub.startDate ? new Date(sub.startDate) : null;
  let end = sub.endDate ? new Date(sub.endDate) : null;

  // لو endDate مش محفوظة نحسبها من periodDays + startDate
  if (!end && start && typeof plan.periodDays === 'number') {
    end = new Date(start.getTime() + plan.periodDays * 24 * 60 * 60 * 1000);
  }

  let status = 'active';
  if (start && start > now) status = 'pending';
  else if (end && end < now) status = 'expired';

  return {
    id: sub.id,
    title: plan.name || 'خطة بدون اسم',
    desc: plan.description || '',
    price:
      typeof plan.priceCents === 'number' ? plan.priceCents / 100 : 0,
    unit: deriveUnit(plan.periodDays),
    status,
    startDate: start ? start.toISOString() : null,
    endDate: end ? end.toISOString() : null,
    scope: buildScopeLabel(plan),
  };
}

// ===================================================================
// =============   Router: Plans + Student Subscriptions   ============
// ===================================================================

export function createPlansRouter(models) {
  const router = Router();
  const {
    OutboxSqlite,
    PlanSqlite,
    PlanMysql,
    SubscriptionSqlite,
  } = models;

  // ==============================================================
  // 🧑‍🎓  أولاً: Routes الطلبة / الواجهة (عرض الخطط + اشتراكاتي)
  // ==============================================================

  // GET /plans/my-subscriptions
  // اشتراكات الطالب الحالي (مصرّح للطلاب فقط)
  router.get('/my-subscriptions', requireAuth, async (req, res, next) => {
    try {
      if (!SubscriptionSqlite) {
        return res.status(500).json({
          success: false,
          error: 'Subscription model not configured on server',
        });
      }

      const user = req.user || {};
      const studentId = Number(user.id);

      if (!studentId || user.role !== 'student') {
        return res
          .status(403)
          .json({ success: false, message: 'مصرّح للطلاب فقط' });
      }

      const subs = await SubscriptionSqlite.findAll({
        where: { studentId },
        include: [{ model: PlanSqlite, as: 'Plan' }],
        order: [['id', 'DESC']],
      });

      const data = subs.map((s) => mapSubscriptionToUi(s));
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  });

  // GET /plans
  // عرض جميع الخطط (للاستخدام في الواجهة / صفحة الخطط)
  router.get('/', async (_req, res, next) => {
    try {
      const rows = await PlanSqlite.findAll({ order: [['id', 'DESC']] });
      res.json({ success: true, data: rows.map((r) => r.toJSON()) });
    } catch (e) {
      next(e);
    }
  });

  // GET /plans/:id
  // عرض خطة واحدة بالتفاصيل
  router.get('/:id', async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const row = await PlanSqlite.findByPk(id);
      if (!row) {
        return res
          .status(404)
          .json({ success: false, error: 'Plan not found' });
      }
      res.json({ success: true, data: row.toJSON() });
    } catch (e) {
      next(e);
    }
  });

  // ==============================================================
  // 🛠️  ثانيًا: Routes الأدمن (إدارة الخطط: إضافة / تعديل / حذف)
  // ==============================================================

  // POST /plans
  // إنشاء خطة اشتراك جديدة (أدمن فقط)
  router.post(
    '/',
    requireAuth,
    requireRole('admin'),
    async (req, res, next) => {
      try {
        const b = req.body || {};
        const errors = validatePlanBody(b, false);
        if (errors.length)
          return res.status(400).json({ success: false, errors });

        // grade
        let rawGrade = b.grade;
        if (
          (rawGrade == null || String(rawGrade).trim() === '') &&
          b.scopeType &&
          String(b.scopeType).toUpperCase() === 'GRADE'
        ) {
          rawGrade = b.scopeValue;
        }
        const gradeNorm = normalizeGrade(rawGrade);

        // categories
        let categories = null;
        if (b.categories !== undefined && b.categories !== null) {
          categories = normalizeCategories(b.categories);
        } else if (
          b.scopeType &&
          String(b.scopeType).toUpperCase() === 'CATEGORY' &&
          b.scopeValue != null
        ) {
          categories = parseCategoriesFromScopeValue(b.scopeValue);
        }

        // courseIds
        let courseIds = null;
        if (Array.isArray(b.courseIds)) {
          courseIds = normalizeCourseIds(b.courseIds);
        }

        // scopeType / scopeValue / includeCourseIds
        let scopeType = 'ALL';
        let scopeValue = null;
        let includeCourseIds = null;

        if (courseIds && courseIds.length) {
          scopeType = 'COURSE_LIST';
          includeCourseIds = JSON.stringify(courseIds);
        } else if (categories && categories.length) {
          scopeType = 'CATEGORY';
          scopeValue = JSON.stringify(categories);
        } else {
          scopeType = 'ALL';
        }

        const data = {
          name: String(b.name).trim(),
          description: b.description ?? null,
          priceCents: Number(b.priceCents ?? 0),
          currency: String(b.currency ?? 'EGP').toUpperCase(),
          periodDays: Number(b.periodDays ?? 30),
          scopeType,
          scopeValue,
          scopeStage: gradeNorm,
          includeCourseIds,
          isActive: b.isActive ?? true,
          updatedAtLocal: new Date(),
        };

        const created = await performOperation({
          modelName: 'Plan',
          sqliteModel: PlanSqlite,
          mysqlModel: PlanMysql,
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

  // PATCH /plans/:id
  // تعديل خطة (أدمن فقط)
  router.patch(
    '/:id',
    requireAuth,
    requireRole('admin'),
    async (req, res, next) => {
      try {
        const id = Number(req.params.id);
        const existing = await PlanSqlite.findByPk(id);
        if (!existing) {
          return res
            .status(404)
            .json({ success: false, error: 'Plan not found' });
        }

        const b = req.body || {};
        const errors = validatePlanBody(b, true);
        if (errors.length)
          return res.status(400).json({ success: false, errors });

        const patch = { updatedAtLocal: new Date() };

        if (b.name !== undefined) patch.name = String(b.name).trim();
        if (b.description !== undefined)
          patch.description = b.description ?? null;
        if (b.priceCents !== undefined)
          patch.priceCents = Number(b.priceCents);
        if (b.currency !== undefined) {
          patch.currency = String(b.currency || 'EGP').toUpperCase();
        }
        if (b.periodDays !== undefined)
          patch.periodDays = Number(b.periodDays);
        if (b.isActive !== undefined) patch.isActive = !!b.isActive;

        // ----- grade -----
        let gradeSource;
        if (b.grade !== undefined) {
          gradeSource = b.grade;
        } else if (
          b.scopeType &&
          String(b.scopeType).toUpperCase() === 'GRADE' &&
          b.scopeValue !== undefined
        ) {
          gradeSource = b.scopeValue;
        } else {
          gradeSource = existing.scopeStage ?? null;
        }
        const gradeNorm = normalizeGrade(gradeSource);
        patch.scopeStage = gradeNorm;

        // ----- categories -----
        let categories = null;
        if (b.categories !== undefined) {
          categories = normalizeCategories(b.categories);
        } else if (
          (existing.scopeType === 'CATEGORY' ||
            (b.scopeType &&
              String(b.scopeType).toUpperCase() === 'CATEGORY')) &&
          (b.scopeValue !== undefined || existing.scopeValue != null)
        ) {
          categories = parseCategoriesFromScopeValue(
            b.scopeValue !== undefined ? b.scopeValue : existing.scopeValue
          );
        }

        // ----- courseIds -----
        let courseIds = null;
        if (b.courseIds !== undefined) {
          if (b.courseIds === null) {
            courseIds = null;
          } else {
            courseIds = normalizeCourseIds(b.courseIds);
          }
        } else if (existing.scopeType === 'COURSE_LIST') {
          courseIds = parseCourseIdsFromInclude(
            existing.includeCourseIds
          );
        }

        let scopeType = existing.scopeType || 'ALL';
        let scopeValue = existing.scopeValue ?? null;
        let includeCourseIds = existing.includeCourseIds ?? null;

        if (courseIds && courseIds.length) {
          scopeType = 'COURSE_LIST';
          includeCourseIds = JSON.stringify(courseIds);
          scopeValue = null;
        } else if (categories && categories.length) {
          scopeType = 'CATEGORY';
          scopeValue = JSON.stringify(categories);
          includeCourseIds = null;
        } else {
          scopeType = 'ALL';
          scopeValue = null;
          includeCourseIds = null;
        }

        patch.scopeType = scopeType;
        patch.scopeValue = scopeValue;
        patch.includeCourseIds = includeCourseIds;

        const updated = await performOperation({
          modelName: 'Plan',
          sqliteModel: PlanSqlite,
          mysqlModel: PlanMysql,
          op: 'update',
          where: { id },
          data: patch,
          outboxModel: OutboxSqlite,
        });

        if (!updated) {
          const fresh = await PlanSqlite.findByPk(id);
          return res.json({
            success: true,
            data: fresh?.toJSON?.() ?? null,
          });
        }
        if (typeof updated.toJSON === 'function') {
          return res.json({ success: true, data: updated.toJSON() });
        }
        const fresh = await PlanSqlite.findByPk(id);
        res.json({ success: true, data: fresh?.toJSON?.() ?? null });
      } catch (e) {
        next(e);
      }
    }
  );

  // DELETE /plans/:id
  // حذف خطة (أدمن فقط)
  router.delete(
    '/:id',
    requireAuth,
    requireRole('admin'),
    async (req, res, next) => {
      try {
        const id = Number(req.params.id);
        const existing = await PlanSqlite.findByPk(id);
        if (!existing) {
          return res
            .status(404)
            .json({ success: false, error: 'Plan not found' });
        }

        await performOperation({
          modelName: 'Plan',
          sqliteModel: PlanSqlite,
          mysqlModel: PlanMysql,
          op: 'delete',
          where: { id },
          outboxModel: OutboxSqlite,
        });

        res.json({ success: true, data: { id } });
      } catch (e) {
        next(e);
      }
    }
  );

  return router;
}

export default createPlansRouter;
