// src/routes/courses.routes.js
import { Router } from 'express';
import { Op } from 'sequelize';
import { slugify } from '../utils/slug.js';
import { performOperation } from '../services/replicator.js';
import { isAllowedHost } from '../utils/url-guard.js';

// 🔐 Middlewares
import { requireAuth } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/roles.js';
import softAuth from '../middlewares/soft-auth.js';

// ⚠️ middlewares سابقة للوصول
import { canAccessCourse, canAccessLesson } from '../middlewares/access.js';

// 🧮 مستويات السنوات الموحّدة في المشروع
import { LEVELS_AR, normalizeLevel } from '../utils/levels.js';

/** ===== Validation ===== */
function validateCourse(b) {
  const errors = [];
  if (!b.title || String(b.title).trim().length < 3)
    errors.push('عنوان الكورس مطلوب (3 أحرف على الأقل)');

  if (b.priceCents !== undefined && Number(b.priceCents) < 0)
    errors.push('السعر غير صالح');

  if (b.level !== undefined) {
    const lv = normalizeLevel(b.level);
    if (!lv)
      errors.push('السنة/المستوى غير صالح. القيم المسموح بها: ' + LEVELS_AR.join(' | '));
  }

  if (
    b.status &&
    !['draft', 'published', 'archived'].includes(String(b.status))
  )
    errors.push('حالة النشر غير صالحة');

  return errors;
}

function validateCloudLesson(b) {
  const errors = [];
  if (!b.title || String(b.title).trim().length < 3)
    errors.push('عنوان الدرس مطلوب (3 أحرف على الأقل)');

  const st = String(b.streamType || '').toLowerCase();
  if (st && !['mp4', 'hls', 'dash', 'external'].includes(st)) {
    errors.push('streamType غير صالح');
  }

  if (st === 'external') {
    const provider = String(b.provider || '').toLowerCase();
    if (!['youtube', 'vimeo'].includes(provider))
      errors.push('provider غير صالح للـ external');
    if (!b.videoId && !b.streamUrl)
      errors.push('videoId أو streamUrl مطلوب للـ external');
  } else {
    if (!b.streamUrl || String(b.streamUrl).trim().length < 8)
      errors.push('رابط الفيديو (streamUrl) مطلوب');
    if (
      b.streamType &&
      !['mp4', 'hls', 'dash', 'external'].includes(String(b.streamType))
    )
      errors.push('streamType غير صالح');
    if (b.streamUrl && !isAllowedHost(b.streamUrl))
      errors.push('دومين الرابط غير مسموح (راجع CLOUD_ALLOWED_HOSTS)');
    if (b.downloadUrl && !isAllowedHost(b.downloadUrl))
      errors.push('دومين رابط التنزيل غير مسموح');
  }

  if (b.durationSec !== undefined && Number(b.durationSec) < 0)
    errors.push('المدة غير صالحة');
  if (b.captions && !Array.isArray(b.captions))
    errors.push('captions يجب أن تكون مصفوفة');
  if (b.resources && !Array.isArray(b.resources))
    errors.push('resources يجب أن تكون مصفوفة');
  if (b.linkExpiresAt) {
    const dt = new Date(b.linkExpiresAt);
    if (Number.isNaN(dt.getTime())) errors.push('linkExpiresAt غير صالح');
  }
  if (b.teacherNotes !== undefined && typeof b.teacherNotes !== 'string')
    errors.push('teacherNotes يجب أن تكون نصاً');

  return errors;
}

function safeCourse(c) {
  const json = typeof c?.toJSON === 'function' ? c.toJSON() : c || {};
  return json;
}
function safeLesson(l) {
  const json = typeof l?.toJSON === 'function' ? l.toJSON() : l || {};
  return json;
}

/** ===== Helpers للـ external ===== */
function normalizeExternalUrl(provider, { videoId, streamUrl }) {
  const p = String(provider || '').toLowerCase();
  if (videoId && !streamUrl) {
    const vid = String(videoId).trim();
    if (p === 'youtube') return `https://www.youtube.com/watch?v=${vid}`;
    if (p === 'vimeo') return `https://vimeo.com/${vid}`;
  }
  return streamUrl ? String(streamUrl).trim() : null;
}

function extractExternalVideoId(provider, rawUrl) {
  try {
    if (!rawUrl) return null;
    const p = String(provider || '').toLowerCase();
    const u = new URL(rawUrl);

    if (p === 'youtube') {
      if (u.hostname.includes('youtu.be')) {
        return u.pathname.replace('/', '');
      }
      if (u.pathname.includes('/embed/')) {
        return u.pathname.split('/embed/')[1];
      }
      return u.searchParams.get('v');
    }

    if (p === 'vimeo') {
      const parts = u.pathname.split('/').filter(Boolean);
      return parts[parts.length - 1] || null;
    }
  } catch {
    // ignore
  }
  return null;
}

/** ===== Helpers للملكية ===== */
function isActive(sub) {
  const now = Date.now();
  const s = sub?.startsAt ? new Date(sub.startsAt).getTime() : 0;
  const e = sub?.endsAt ? new Date(sub.endsAt).getTime() : 0;
  return s <= now && now <= e && sub.status === 'active';
}

function parsePlanCategories(scopeValue) {
  if (!scopeValue) return null;
  try {
    const parsed = JSON.parse(scopeValue);
    if (Array.isArray(parsed)) {
      return parsed.map((c) => String(c).trim()).filter(Boolean);
    }
  } catch {
    // مش JSON → نعامله كـ قيمة واحدة
    const s = String(scopeValue).trim();
    return s ? [s] : null;
  }
  return null;
}

async function computeOwnership({ models, studentId, course }) {
  const { EnrollmentSqlite, SubscriptionSqlite, PlanSqlite } = models;

  if (course.isFree) return { owned: true, via: 'free' };

  const enroll = studentId
    ? await EnrollmentSqlite.findOne({
        where: { studentId, courseId: course.id },
      })
    : null;
  if (enroll) return { owned: true, via: 'enrollment' };

  if (studentId) {
    const subs = await SubscriptionSqlite.findAll({
      where: { studentId, status: 'active' },
      order: [['id', 'DESC']],
      limit: 10,
    });

    for (const sub of subs) {
      if (!isActive(sub)) continue;
      const plan = await PlanSqlite.findByPk(sub.planId);
      if (!plan || !plan.isActive) continue;

      const scopeType = String(plan.scopeType || 'ALL').toUpperCase();

      if (scopeType === 'ALL') {
        return { owned: true, via: 'subscription' };
      }

      if (scopeType === 'CATEGORY') {
        if (course.category && plan.scopeValue) {
          const cats = parsePlanCategories(plan.scopeValue) || [];
          if (cats.includes(course.category)) {
            return { owned: true, via: 'subscription' };
          }
        }
      }

      if (scopeType === 'COURSE_LIST' && plan.includeCourseIds) {
        try {
          const ids = JSON.parse(plan.includeCourseIds);
          if (Array.isArray(ids) && ids.includes(course.id)) {
            return { owned: true, via: 'subscription' };
          }
        } catch {
          // ignore
        }
      }
    }
  }

  return { owned: false, via: null };
}

function createCoursesRouter(models) {
  const router = Router();
  const {
    OutboxSqlite,
    CourseSqlite,
    CourseMysql,
    LessonSqlite,
    LessonMysql,
    StudentAttendanceSqlite,
    StudentAttendanceMysql,
    StudentLessonOverrideSqlite,
    StudentLessonOverrideMysql,
  } = models;

  // ===================================================================
  // 🛠️ أولًا: Routes الأدمن (إدارة الكورسات والدروس)
  // ===================================================================

  // إنشاء كورس جديد
  router.post(
    '/',
    requireAuth,
    requireRole('admin'),
    async (req, res, next) => {
      try {
        const body = req.body || {};
        const errors = validateCourse(body);
        if (errors.length)
          return res.status(400).json({ success: false, errors });

        const title = String(body.title).trim();
        const slug = slugify(body.slug || title);

        const exists = await CourseSqlite.findOne({
          where: { slug, isDeleted: false },
        });
        if (exists)
          return res
            .status(409)
            .json({ success: false, message: 'Slug مستخدم من قبل' });

        const levelNorm = normalizeLevel(body.level) || LEVELS_AR[0];

        const data = {
          title,
          slug,
          shortDesc: body.shortDesc ?? null,
          longDesc: body.longDesc ?? null,
          coverImageUrl: body.coverImageUrl ?? null,
          trailerUrl: body.trailerUrl ?? null,
          teacherName: body.teacherName ?? null,
          category: body.category ?? null,
          level: levelNorm,
          isFree: body.isFree ?? true,
          priceCents: Number(body.priceCents ?? 0),
          status: body.status ?? 'draft',
          publishedAt: body.status === 'published' ? new Date() : null,
          totalDurationSec: 0,
          lessonsCount: 0,
          updatedAtLocal: new Date(),
        };

        const created = await performOperation({
          modelName: 'Course',
          sqliteModel: CourseSqlite,
          mysqlModel: CourseMysql,
          op: 'create',
          data,
          outboxModel: OutboxSqlite,
        });

        return res.json({ success: true, data: safeCourse(created) });
      } catch (e) {
        next(e);
      }
    }
  );

  // تحديث كورس
  router.patch(
    '/:courseId',
    requireAuth,
    requireRole('admin'),
    async (req, res, next) => {
      try {
        const id = Number(req.params.courseId);
        if (!id)
          return res
            .status(400)
            .json({ success: false, message: 'courseId غير صالح' });

        const body = req.body || {};
        const existing = await CourseSqlite.findByPk(id);
        if (!existing || existing.isDeleted)
          return res
            .status(404)
            .json({ success: false, message: 'الكورس غير موجود' });

        const patch = { updatedAtLocal: new Date() };

        if (body.title) patch.title = String(body.title).trim();

        if (body.slug) {
          const slug = slugify(body.slug);
          const conflict = await CourseSqlite.findOne({
            where: { slug, id: { [Op.ne]: id }, isDeleted: false },
          });
          if (conflict)
            return res
              .status(409)
              .json({ success: false, message: 'Slug مستخدم من قبل' });
          patch.slug = slug;
        }

        [
          'shortDesc',
          'longDesc',
          'coverImageUrl',
          'trailerUrl',
          'teacherName',
          'category',
        ].forEach((k) => {
          if (body[k] !== undefined) patch[k] = body[k];
        });

        if (body.level !== undefined) {
          const lv = normalizeLevel(body.level);
          if (!lv)
            return res.status(400).json({
              success: false,
              message: 'السنة/المستوى غير صالح',
              allowed: LEVELS_AR,
            });
          patch.level = lv;
        }

        if (body.isFree !== undefined) patch.isFree = !!body.isFree;
        if (body.priceCents !== undefined)
          patch.priceCents = Number(body.priceCents);

        if (body.status) {
          patch.status = body.status;
          patch.publishedAt =
            body.status === 'published'
              ? existing.publishedAt || new Date()
              : null;
        }

        await performOperation({
          modelName: 'Course',
          sqliteModel: CourseSqlite,
          mysqlModel: CourseMysql,
          op: 'update',
          where: { id },
          data: patch,
          outboxModel: OutboxSqlite,
        });

        return res.json({
          success: true,
          data: { ...safeCourse(existing), ...patch },
        });
      } catch (e) {
        next(e);
      }
    }
  );

  // نشر كورس
  router.post(
    '/:courseId/publish',
    requireAuth,
    requireRole('admin'),
    async (req, res, next) => {
      try {
        const id = Number(req.params.courseId);
        if (!id)
          return res
            .status(400)
            .json({ success: false, message: 'courseId غير صالح' });

        const existing = await CourseSqlite.findByPk(id);
        if (!existing || existing.isDeleted)
          return res
            .status(404)
            .json({ success: false, message: 'الكورس غير موجود' });

        const patch = {
          status: 'published',
          publishedAt: new Date(),
          updatedAtLocal: new Date(),
        };

        await performOperation({
          modelName: 'Course',
          sqliteModel: CourseSqlite,
          mysqlModel: CourseMysql,
          op: 'update',
          where: { id },
          data: patch,
          outboxModel: OutboxSqlite,
        });

        res.json({ success: true, message: 'تم النشر', data: { id, ...patch } });
      } catch (e) {
        next(e);
      }
    }
  );

  // إلغاء نشر كورس
  router.post(
    '/:courseId/unpublish',
    requireAuth,
    requireRole('admin'),
    async (req, res, next) => {
      try {
        const id = Number(req.params.courseId);
        if (!id)
          return res
            .status(400)
            .json({ success: false, message: 'courseId غير صالح' });

        const existing = await CourseSqlite.findByPk(id);
        if (!existing || existing.isDeleted)
          return res
            .status(404)
            .json({ success: false, message: 'الكورس غير موجود' });

        const patch = {
          status: 'draft',
          publishedAt: null,
          updatedAtLocal: new Date(),
        };

        await performOperation({
          modelName: 'Course',
          sqliteModel: CourseSqlite,
          mysqlModel: CourseMysql,
          op: 'update',
          where: { id },
          data: patch,
          outboxModel: OutboxSqlite,
        });

        res.json({
          success: true,
          message: 'تم إلغاء النشر',
          data: { id, ...patch },
        });
      } catch (e) {
        next(e);
      }
    }
  );

  // حذف كورس (Soft Delete)
// حذف كورس نهائيًّا (Hard Delete من SQLite + MySQL + حذف الدروس)
router.delete(
  '/:courseId',
  requireAuth,
  requireRole('admin'),
  async (req, res, next) => {
    try {
      const id = Number(req.params.courseId);
      if (!id) {
        return res
          .status(400)
          .json({ success: false, message: 'courseId غير صالح' });
      }

      const existing = await CourseSqlite.findByPk(id);
      if (!existing) {
        return res
          .status(404)
          .json({ success: false, message: 'الكورس غير موجود' });
      }

      // 1️⃣ امسح كل الدروس المرتبطة بالكورس
      await performOperation({
        modelName: 'Lesson',
        sqliteModel: LessonSqlite,
        mysqlModel: LessonMysql,
        op: 'delete',          // <-- مهم
        where: { courseId: id },
        outboxModel: OutboxSqlite,
      });

      // 2️⃣ امسح الكورس نفسه
      await performOperation({
        modelName: 'Course',
        sqliteModel: CourseSqlite,
        mysqlModel: CourseMysql,
        op: 'delete',          // <-- مهم
        where: { id },
        outboxModel: OutboxSqlite,
      });

      return res.json({
        success: true,
        message: 'تم حذف الكورس نهائيًا من جميع الداتا بيزيز',
      });
    } catch (e) {
      next(e);
    }
  }
);
  // إضافة درس
  router.post(
    '/:courseId/lessons',
    requireAuth,
    requireRole('admin'),
    async (req, res, next) => {
      try {
        const courseId = Number(req.params.courseId);
        if (!courseId)
          return res
            .status(400)
            .json({ success: false, message: 'courseId غير صالح' });

        const course = await CourseSqlite.findOne({
          where: { id: courseId, isDeleted: false },
        });
        if (!course)
          return res
            .status(404)
            .json({ success: false, message: 'الكورس غير موجود' });

        const body = req.body || {};
        const errors = validateCloudLesson(body);
        if (errors.length)
          return res.status(400).json({ success: false, errors });

        const maxOrder = await LessonSqlite.max('orderIndex', {
          where: { courseId, isDeleted: false },
        });
        const orderIndex = Number.isFinite(maxOrder)
          ? (Number(maxOrder) || 0) + 1
          : 1;

        const st = String(body.streamType || 'mp4').toLowerCase();
        let provider =
          body.provider ?? process.env.CLOUD_DEFAULT_PROVIDER ?? 'generic';
        let streamUrl = body.streamUrl
          ? String(body.streamUrl).trim()
          : null;

        if (st === 'external') {
          provider = String(provider).toLowerCase();
          streamUrl = normalizeExternalUrl(provider, {
            videoId: body.videoId,
            streamUrl: body.streamUrl,
          });
        }

        const data = {
          courseId,
          title: String(body.title).trim(),
          description: body.description ?? null,
          teacherNotes: body.teacherNotes ?? null,
          provider,
          streamType: st,
          streamUrl,
          downloadUrl: body.downloadUrl
            ? String(body.downloadUrl).trim()
            : null,
          thumbnailUrl: body.thumbnailUrl ?? null,
          durationSec: Number(body.durationSec ?? 0),
          captions: Array.isArray(body.captions) ? body.captions : null,
          resources: Array.isArray(body.resources) ? body.resources : null,
          isFreePreview: !!body.isFreePreview,
          status: body.status ?? 'draft',
          orderIndex,
          linkExpiresAt: body.linkExpiresAt
            ? new Date(body.linkExpiresAt)
            : null,
          linkVersion: Number(body.linkVersion ?? 1),
          updatedAtLocal: new Date(),
        };

        const created = await performOperation({
          modelName: 'Lesson',
          sqliteModel: LessonSqlite,
          mysqlModel: LessonMysql,
          op: 'create',
          data,
          outboxModel: OutboxSqlite,
        });

        await performOperation({
          modelName: 'Course',
          sqliteModel: CourseSqlite,
          mysqlModel: CourseMysql,
          op: 'update',
          where: { id: courseId },
          data: {
            lessonsCount: (course.lessonsCount || 0) + 1,
            totalDurationSec:
              (course.totalDurationSec || 0) + (data.durationSec || 0),
            updatedAtLocal: new Date(),
          },
          outboxModel: OutboxSqlite,
        });

        res.json({ success: true, data: safeLesson(created) });
      } catch (e) {
        next(e);
      }
    }
  );

  // تعديل درس
  router.patch(
    '/:courseId/lessons/:lessonId',
    requireAuth,
    requireRole('admin'),
    async (req, res, next) => {
      try {
        const courseId = Number(req.params.courseId);
        const lessonId = Number(req.params.lessonId);
        if (!courseId || !lessonId)
          return res
            .status(400)
            .json({ success: false, message: 'معرّفات غير صالحة' });

        const lesson = await LessonSqlite.findOne({
          where: { id: lessonId, courseId, isDeleted: false },
        });
        if (!lesson)
          return res
            .status(404)
            .json({ success: false, message: 'الدرس غير موجود' });

        const body = req.body || {};
        const errors = validateCloudLesson({
          ...lesson.toJSON(),
          ...body,
          streamUrl: body.streamUrl ?? lesson.streamUrl,
        });
        if (errors.length)
          return res.status(400).json({ success: false, errors });

        const patch = { updatedAtLocal: new Date() };

        [
          'title',
          'description',
          'teacherNotes',
          'provider',
          'streamType',
          'streamUrl',
          'downloadUrl',
          'thumbnailUrl',
          'status',
        ].forEach((k) => {
          if (body[k] !== undefined) patch[k] = body[k];
        });

        if (
          (body.streamType &&
            String(body.streamType).toLowerCase() === 'external') ||
          lesson.streamType === 'external'
        ) {
          const prov = String(
            body.provider ?? lesson.provider ?? 'youtube'
          ).toLowerCase();
          const normalized = normalizeExternalUrl(prov, {
            videoId: body.videoId,
            streamUrl: body.streamUrl ?? lesson.streamUrl,
          });
          if (normalized) {
            patch.provider = prov;
            patch.streamType = 'external';
            patch.streamUrl = normalized;
          }
        }

        if (body.durationSec !== undefined)
          patch.durationSec = Number(body.durationSec);

        if (body.isFreePreview !== undefined)
          patch.isFreePreview = !!body.isFreePreview;

        if (body.captions !== undefined)
          patch.captions = Array.isArray(body.captions)
            ? body.captions
            : null;

        if (body.resources !== undefined)
          patch.resources = Array.isArray(body.resources)
            ? body.resources
            : null;

        if (body.linkExpiresAt !== undefined)
          patch.linkExpiresAt = body.linkExpiresAt
            ? new Date(body.linkExpiresAt)
            : null;

        if (body.linkVersion !== undefined)
          patch.linkVersion = Number(body.linkVersion);

        if (
          patch.durationSec !== undefined &&
          Number(patch.durationSec) !== (lesson.durationSec || 0)
        ) {
          const diff =
            Number(patch.durationSec) - (lesson.durationSec || 0);
          const course = await CourseSqlite.findByPk(courseId);
          await performOperation({
            modelName: 'Course',
            sqliteModel: CourseSqlite,
            mysqlModel: CourseMysql,
            op: 'update',
            where: { id: courseId },
            data: {
              totalDurationSec: (course.totalDurationSec || 0) + diff,
              updatedAtLocal: new Date(),
            },
            outboxModel: OutboxSqlite,
          });
        }

        await performOperation({
          modelName: 'Lesson',
          sqliteModel: LessonSqlite,
          mysqlModel: LessonMysql,
          op: 'update',
          where: { id: lessonId },
          data: patch,
          outboxModel: OutboxSqlite,
        });

        res.json({ success: true, data: { id: lessonId, ...patch } });
      } catch (e) {
        next(e);
      }
    }
  );
  // حذف درس (Soft Delete)
router.delete(
  '/:courseId/lessons/:lessonId',
  requireAuth,
  requireRole('admin'),
  async (req, res, next) => {
    try {
      const courseId = Number(req.params.courseId);
      const lessonId = Number(req.params.lessonId);
      if (!courseId || !lessonId) {
        return res.status(400).json({ success: false, message: 'معرّفات غير صالحة' });
      }

      const lesson = await LessonSqlite.findOne({
        where: { id: lessonId, courseId, isDeleted: false },
      });
      if (!lesson) {
        return res.status(404).json({ success: false, message: 'الدرس غير موجود' });
      }

      await performOperation({
        modelName: 'Lesson',
        sqliteModel: LessonSqlite,
        mysqlModel: LessonMysql,
        op: 'update',
        where: { id: lessonId },
        data: { isDeleted: true, updatedAtLocal: new Date() },
        outboxModel: OutboxSqlite,
      });

      return res.json({ success: true, message: 'تم حذف الدرس (soft delete)', data: { id: lessonId } });
    } catch (e) {
      next(e);
    }
  }
);

  // تدوير رابط الدرس
  router.post(
    '/:courseId/lessons/:lessonId/rotate-link',
    requireAuth,
    requireRole('admin'),
    async (req, res, next) => {
      try {
        const courseId = Number(req.params.courseId);
        const lessonId = Number(req.params.lessonId);
        if (!courseId || !lessonId)
          return res
            .status(400)
            .json({ success: false, message: 'معرّفات غير صالحة' });

        const lesson = await LessonSqlite.findOne({
          where: { id: lessonId, courseId, isDeleted: false },
        });
        if (!lesson)
          return res
            .status(404)
            .json({ success: false, message: 'الدرس غير موجود' });

        const newUrl = String(req.body?.streamUrl || '').trim();
        const newExpiry = req.body?.linkExpiresAt
          ? new Date(req.body.linkExpiresAt)
          : null;

        if (
          newUrl &&
          lesson.streamType !== 'external' &&
          !isAllowedHost(newUrl)
        ) {
          return res
            .status(400)
            .json({ success: false, message: 'دومين غير مسموح' });
        }

        const patch = {
          updatedAtLocal: new Date(),
          linkVersion: (lesson.linkVersion || 1) + 1,
        };
        if (newUrl) patch.streamUrl = newUrl;
        if (req.body?.linkExpiresAt !== undefined)
          patch.linkExpiresAt = newExpiry;

        await performOperation({
          modelName: 'Lesson',
          sqliteModel: LessonSqlite,
          mysqlModel: LessonMysql,
          op: 'update',
          where: { id: lessonId },
          data: patch,
          outboxModel: OutboxSqlite,
        });

        res.json({
          success: true,
          message: 'تم تدوير الرابط',
          data: { id: lessonId, ...patch },
        });
      } catch (e) {
        next(e);
      }
    }
  );

  // ===================================================================
  // 🎓 ثانيًا: Routes الطلاب / العامة (عرض الكورسات و المشاهدة)
  // ===================================================================

  // قائمة الكورسات (مع ملكية اختيارية)
  router.get('/', softAuth, async (req, res, next) => {
    try {
      const q = String(req.query.q || '').trim();
      const status = String(req.query.status || '').trim();
      const category = String(req.query.category || '').trim();
      const levelQ = String(req.query.level || '').trim();
      const includeOwnership = ['1', 'true', 'yes'].includes(
        String(req.query.includeOwnership || '').toLowerCase()
      );

      const page = Math.max(1, Number(req.query.page || 1));
      const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
      const offset = (page - 1) * limit;

      const where = { isDeleted: false };

      if (q) {
        where[Op.or] = [
          { title: { [Op.like]: `%${q}%` } },
          { shortDesc: { [Op.like]: `%${q}%` } },
          { teacherName: { [Op.like]: `%${q}%` } },
        ];
      }

      if (status) where.status = status;
      if (category) where.category = category;

      if (levelQ) {
        const lv = normalizeLevel(levelQ);
        where.level = lv || levelQ;
      } else if (req.user?.level) {
        const lvUser = normalizeLevel(req.user.level) || req.user.level;
        where.level = lvUser;
      }

      const { rows, count } = await CourseSqlite.findAndCountAll({
        where,
        order: [['id', 'DESC']],
        limit,
        offset,
      });

      let data = rows.map(safeCourse);

      if (includeOwnership && req.user?.id) {
        const studentId = Number(req.user.id);
        const enriched = [];
        for (const c of data) {
          const ownership = await computeOwnership({
            models,
            studentId,
            course: c,
          });
          enriched.push({ ...c, ownership });
        }
        data = enriched;
      }

      res.json({
        success: true,
        data,
        pagination: { page, limit, total: count },
      });
    } catch (e) {
      next(e);
    }
  });

  // تفاصيل كورس + Playlist دروس
  router.get('/:courseId', async (req, res, next) => {
    try {
      const id = Number(req.params.courseId);
      if (!id)
        return res
          .status(400)
          .json({ success: false, message: 'courseId غير صالح' });

      const course = await CourseSqlite.findOne({
        where: { id, isDeleted: false },
      });
      if (!course)
        return res
          .status(404)
          .json({ success: false, message: 'الكورس غير موجود' });

      const lessons = await LessonSqlite.findAll({
        where: { courseId: id, isDeleted: false },
        order: [
          ['orderIndex', 'ASC'],
          ['id', 'ASC'],
        ],
      });

      res.json({
        success: true,
        data: {
          ...safeCourse(course),
          lessons: lessons.map(safeLesson),
        },
      });
    } catch (e) {
      next(e);
    }
  });

  // استعلام ملكية كورس واحد
  router.get('/:id/ownership', softAuth, async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!id)
        return res
          .status(400)
          .json({ success: false, message: 'courseId غير صالح' });

      const course = await CourseSqlite.findOne({
        where: { id, isDeleted: false },
      });
      if (!course)
        return res
          .status(404)
          .json({ success: false, message: 'الكورس غير موجود' });

      if (!req.user?.id) {
        return res.json({
          success: true,
          data: { owned: !!course.isFree, via: course.isFree ? 'free' : null },
        });
      }

      const ownership = await computeOwnership({
        models,
        studentId: Number(req.user.id),
        course,
      });
      res.json({ success: true, data: ownership });
    } catch (e) {
      next(e);
    }
  });

  // 🔐 التحقق من وصول الطالب لكورس (API حماية)
  router.get(
    '/:id/access',
    requireAuth,
    canAccessCourse(models),
    (req, res) => {
      res.json({ success: true, access: req.accessInfo });
    }
  );

  // 🎥 رابط تشغيل محاضرة معيّنة (مع التحقق من الوصول)
  router.get(
    '/:courseId/lessons/:lessonId/stream',
    requireAuth,
    canAccessLesson(models),
    async (req, res, next) => {
      try {
        const { courseId, lessonId } = req.params;

        const lsn = await LessonSqlite.findOne({
          where: { id: lessonId, courseId },
        });

        if (!lsn) {
          return res
            .status(404)
            .json({ success: false, message: 'المحاضرة غير موجودة' });
        }

        const via = req.accessInfo?.via;
        const now = new Date();

        // الوصول عن طريق attendance
        if (via === 'attendance') {
          const attendanceId = req.accessInfo.attendanceId;
          const att = await StudentAttendanceSqlite.findByPk(attendanceId);

          if (!att) {
            return res.status(403).json({
              success: false,
              message: 'انتهت صلاحية الوصول (attendance not found)',
            });
          }

          if (att.accessExpiresAt && new Date(att.accessExpiresAt) < now) {
            return res.status(403).json({
              success: false,
              message: 'انتهت صلاحية الوصول (time)',
            });
          }

          if (att.maxViews != null && att.maxViews >= 0) {
            if ((att.viewsUsed || 0) >= att.maxViews) {
              return res.status(403).json({
                success: false,
                message: 'انتهت صلاحية الوصول (views)',
              });
            }
          }

          const newViewsUsed = (att.viewsUsed || 0) + 1;
          await performOperation({
            modelName: 'StudentAttendance',
            sqliteModel: StudentAttendanceSqlite,
            mysqlModel: StudentAttendanceMysql,
            op: 'update',
            where: { id: attendanceId },
            data: { viewsUsed: newViewsUsed, updatedAtLocal: now },
            outboxModel: OutboxSqlite,
          });
        }

        // الوصول عن طريق override
        if (via === 'override') {
          const overrideId = req.accessInfo.overrideId;
          const ov = await StudentLessonOverrideSqlite.findByPk(overrideId);

          if (!ov) {
            return res.status(403).json({
              success: false,
              message: 'انتهت صلاحية الوصول (override not found)',
            });
          }

          if (ov.expiresAt && new Date(ov.expiresAt) < now) {
            return res.status(403).json({
              success: false,
              message: 'انتهت صلاحية الوصول (time)',
            });
          }

          if (ov.maxViews != null && ov.maxViews >= 0) {
            if ((ov.viewsUsed || 0) >= ov.maxViews) {
              return res.status(403).json({
                success: false,
                message: 'انتهت صلاحية الوصول (views)',
              });
            }
          }

          const newViewsUsed = (ov.viewsUsed || 0) + 1;
          await performOperation({
            modelName: 'StudentLessonOverride',
            sqliteModel: StudentLessonOverrideSqlite,
            mysqlModel: StudentLessonOverrideMysql,
            op: 'update',
            where: { id: overrideId },
            data: { viewsUsed: newViewsUsed, updatedAtLocal: now },
            outboxModel: OutboxSqlite,
          });
        }

        // external (يوتيوب / فيميو)
        if (lsn.streamType === 'external') {
          const provider = String(lsn.provider || 'youtube').toLowerCase();
          const originalUrl = lsn.streamUrl || '';
          const vid = extractExternalVideoId(provider, originalUrl);

          return res.json({
            success: true,
            streamType: 'external',
            provider,
            streamUrl: null, // الفرونت يعتمد على videoId فقط
            videoId: vid ?? null,
            thumbnailUrl: lsn.thumbnailUrl,
            via,
          });
        }

        // باقي الأنواع (mp4 / hls / dash)
        return res.json({
          success: true,
          streamType: lsn.streamType,
          streamUrl: lsn.streamUrl,
          thumbnailUrl: lsn.thumbnailUrl,
          via,
        });
      } catch (e) {
        next(e);
      }
    }
  );

  return router;
}

export default createCoursesRouter;
