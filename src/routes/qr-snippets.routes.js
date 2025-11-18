// src/routes/qr-snippets.routes.js
import { Router } from 'express';
import { Op } from 'sequelize';
import crypto from 'crypto';

import { performOperation } from '../services/replicator.js';
import { requireAuth } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/roles.js';
import { isAllowedHost } from '../utils/url-guard.js';

const ALLOWED_STREAM_TYPES = ['mp4', 'hls', 'dash', 'external'];

function normalizeBool(v) {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y'].includes(s)) return true;
  if (['0', 'false', 'no', 'n'].includes(s)) return false;
  return undefined;
}

function validateQrSnippet(body) {
  const errors = [];
  if (!body.title || String(body.title).trim().length < 3) {
    errors.push('عنوان الكود مطلوب (3 أحرف على الأقل)');
  }
  if (!body.courseId) errors.push('courseId مطلوب');
  if (!body.lessonId) errors.push('lessonId مطلوب');

  const st = String(body.streamType || 'mp4').toLowerCase();
  if (!ALLOWED_STREAM_TYPES.includes(st)) {
    errors.push('streamType غير صالح (mp4 | hls | dash | external)');
  }

  const url = String(body.streamUrl || '').trim();
  if (!url) {
    errors.push('رابط الفيديو (streamUrl) مطلوب');
  } else if (st !== 'external') {
    if (!isAllowedHost(url)) {
      errors.push('دومين رابط الفيديو غير مسموح (راجع CLOUD_ALLOWED_HOSTS)');
    }
  }

  if (body.posterUrl) {
    const p = String(body.posterUrl).trim();
    if (p && !isAllowedHost(p)) {
      errors.push('دومين صورة الـ poster غير مسموح');
    }
  }

  if (body.durationSec !== undefined && body.durationSec !== null) {
    const d = Number(body.durationSec);
    if (!Number.isFinite(d) || d < 0) {
      errors.push('durationSec غير صالح');
    }
  }

  if (body.linkExpiresAt) {
    const dt = new Date(body.linkExpiresAt);
    if (Number.isNaN(dt.getTime())) {
      errors.push('linkExpiresAt غير صالح');
    }
  }

  return errors;
}

function safeQrSnippet(q) {
  return typeof q?.toJSON === 'function' ? q.toJSON() : q || {};
}

export function createQrSnippetsRouter(models) {
  const router = Router();

  const {
    OutboxSqlite,
    CourseSqlite,
    LessonSqlite,
    QrSnippetSqlite,
    QrSnippetMysql,
  } = models;

  /**
   * POST /qr-snippets
   * إنشاء كود QR جديد
   * body:
   * {
   *   courseId,
   *   lessonId,
   *   title,
   *   description?,
   *   subject?,
   *   teacher?,
   *   streamType?,   // mp4 (default) | hls | dash | external
   *   streamUrl,
   *   posterUrl?,
   *   durationSec?,
   *   linkExpiresAt?, // ISO
   *   isActive?,
   *   token?,         // لو مش مبعوت، هيتولّد تلقائيًا
   * }
   */
  router.post(
    '/',
    requireAuth,
    requireRole('teacher', 'admin'),
    async (req, res, next) => {
      try {
        const body = req.body || {};
        const errors = validateQrSnippet(body);
        if (errors.length) {
          return res.status(400).json({ success: false, errors });
        }

        const courseId = Number(body.courseId);
        const lessonId = Number(body.lessonId);

        const course = await CourseSqlite.findByPk(courseId);
        if (!course || course.isDeleted) {
          return res.status(404).json({
            success: false,
            message: 'الكورس غير موجود',
          });
        }

        const lesson = await LessonSqlite.findByPk(lessonId);
        if (!lesson || lesson.isDeleted) {
          return res.status(404).json({
            success: false,
            message: 'الدرس غير موجود',
          });
        }
        if (Number(lesson.courseId) !== courseId) {
          return res.status(400).json({
            success: false,
            message: 'الدرس لا ينتمي لهذا الكورس',
          });
        }

        const st = String(body.streamType || 'mp4').toLowerCase();
        const streamUrl = String(body.streamUrl || '').trim();
        const provider = body.provider ? String(body.provider).toLowerCase() : null;

        // توليد token لو مش مبعوت
        const rawToken = String(body.token || '').trim();
        let token = rawToken;

        if (!token) {
          token = crypto.randomBytes(10).toString('base64url');
          // نضمن - بشكل بسيط - إن مفيش تكرار
          // (احتمال التصادم هنا ضعيف جداً، لكن بنعمل احتياط إضافي)
          let tries = 0;
          /* eslint-disable no-await-in-loop */
          while (tries < 5) {
            const exists = await QrSnippetSqlite.findOne({ where: { token } });
            if (!exists) break;
            token = crypto.randomBytes(10).toString('base64url');
            tries++;
          }
          /* eslint-enable no-await-in-loop */
        } else {
          const exists = await QrSnippetSqlite.findOne({ where: { token } });
          if (exists) {
            return res.status(409).json({
              success: false,
              message: 'token مستخدم من قبل',
            });
          }
        }

        const now = new Date();

        const data = {
          token,
          courseId,
          lessonId,
          title: String(body.title).trim(),
          description: body.description ?? null,
          subject: body.subject ?? (course.category || null),
          teacher: body.teacher ?? (course.teacherName || null),
          streamType: st,
          provider,
          streamUrl,
          posterUrl: body.posterUrl ? String(body.posterUrl).trim() : null,
          durationSec:
            body.durationSec !== undefined && body.durationSec !== null
              ? Number(body.durationSec)
              : null,
          linkExpiresAt: body.linkExpiresAt ? new Date(body.linkExpiresAt) : null,
          isActive:
            body.isActive !== undefined
              ? !!body.isActive
              : true,
          createdByUserId: req.user?.id ?? null,
          updatedAtLocal: now,
        };

        const created = await performOperation({
          modelName: 'QrSnippet',
          sqliteModel: QrSnippetSqlite,
          mysqlModel: QrSnippetMysql,
          op: 'create',
          data,
          outboxModel: OutboxSqlite,
        });

        return res.json({
          success: true,
          data: safeQrSnippet(created),
        });
      } catch (e) {
        next(e);
      }
    }
  );

  /**
   * GET /qr-snippets
   * لستة الأكواد مع فلترة اختيارية:
   * ?courseId=&lessonId=&q=&isActive=
   */
  router.get(
    '/',
    requireAuth,
    requireRole('teacher', 'admin'),
    async (req, res, next) => {
      try {
        const where = {};
        const q = String(req.query.q || '').trim();

        if (req.query.courseId) {
          const courseId = Number(req.query.courseId);
          if (!courseId) {
            return res.status(400).json({
              success: false,
              message: 'courseId غير صالح',
            });
          }
          where.courseId = courseId;
        }

        if (req.query.lessonId) {
          const lessonId = Number(req.query.lessonId);
          if (!lessonId) {
            return res.status(400).json({
              success: false,
              message: 'lessonId غير صالح',
            });
          }
          where.lessonId = lessonId;
        }

        const activeFilter = normalizeBool(req.query.isActive);
        if (activeFilter !== undefined) {
          where.isActive = activeFilter;
        }

        if (q) {
          where[Op.or] = [
            { title: { [Op.like]: `%${q}%` } },
            { description: { [Op.like]: `%${q}%` } },
            { token: { [Op.like]: `%${q}%` } },
          ];
        }

        const rows = await QrSnippetSqlite.findAll({
          where,
          order: [['id', 'DESC']],
        });

        res.json({
          success: true,
          data: rows.map(safeQrSnippet),
        });
      } catch (e) {
        next(e);
      }
    }
  );

  /**
   * GET /qr-snippets/:id
   */
  router.get(
    '/:id',
    requireAuth,
    requireRole('teacher', 'admin'),
    async (req, res, next) => {
      try {
        const id = Number(req.params.id);
        if (!id) {
          return res.status(400).json({
            success: false,
            message: 'id غير صالح',
          });
        }

        const qr = await QrSnippetSqlite.findByPk(id);
        if (!qr) {
          return res.status(404).json({
            success: false,
            message: 'الكود غير موجود',
          });
        }

        res.json({
          success: true,
          data: safeQrSnippet(qr),
        });
      } catch (e) {
        next(e);
      }
    }
  );

  /**
   * PATCH /qr-snippets/:id
   * تعديل بيانات الكود (بما فيها isActive لو حابب)
   */
  router.patch(
    '/:id',
    requireAuth,
    requireRole('teacher', 'admin'),
    async (req, res, next) => {
      try {
        const id = Number(req.params.id);
        if (!id) {
          return res.status(400).json({
            success: false,
            message: 'id غير صالح',
          });
        }

        const existing = await QrSnippetSqlite.findByPk(id);
        if (!existing) {
          return res.status(404).json({
            success: false,
            message: 'الكود غير موجود',
          });
        }

        const body = req.body || {};
        const merged = {
          ...safeQrSnippet(existing),
          ...body,
        };

        const errors = validateQrSnippet(merged);
        if (errors.length) {
          return res.status(400).json({ success: false, errors });
        }

        const patch = {};
        const now = new Date();

        const updatableFields = [
          'title',
          'description',
          'subject',
          'teacher',
          'streamType',
          'provider',
          'streamUrl',
          'posterUrl',
          'durationSec',
          'linkExpiresAt',
          'isActive',
          'courseId',
          'lessonId',
        ];

        updatableFields.forEach((key) => {
          if (body[key] !== undefined) {
            patch[key] = body[key];
          }
        });

        // تحديث token لو محتاج
        if (body.token !== undefined) {
          const newToken = String(body.token || '').trim();
          if (!newToken) {
            return res.status(400).json({
              success: false,
              message: 'token لا يمكن أن يكون فارغًا',
            });
          }
          if (newToken !== existing.token) {
            const exists = await QrSnippetSqlite.findOne({
              where: { token: newToken, id: { [Op.ne]: id } },
            });
            if (exists) {
              return res.status(409).json({
                success: false,
                message: 'token مستخدم من قبل',
              });
            }
            patch.token = newToken;
          }
        }

        // لو غيّرنا courseId أو lessonId لازم نتأكد من صحتهم
        const finalCourseId =
          patch.courseId !== undefined
            ? Number(patch.courseId)
            : Number(existing.courseId);
        const finalLessonId =
          patch.lessonId !== undefined
            ? Number(patch.lessonId)
            : Number(existing.lessonId);

        const course = await CourseSqlite.findByPk(finalCourseId);
        if (!course || course.isDeleted) {
          return res.status(404).json({
            success: false,
            message: 'الكورس غير موجود',
          });
        }

        const lesson = await LessonSqlite.findByPk(finalLessonId);
        if (!lesson || lesson.isDeleted) {
          return res.status(404).json({
            success: false,
            message: 'الدرس غير موجود',
          });
        }
        if (Number(lesson.courseId) !== finalCourseId) {
          return res.status(400).json({
            success: false,
            message: 'الدرس لا ينتمي لهذا الكورس',
          });
        }

        // تحويلات بسيطة
        if (patch.durationSec !== undefined && patch.durationSec !== null) {
          patch.durationSec = Number(patch.durationSec);
        }
        if (patch.linkExpiresAt !== undefined) {
          patch.linkExpiresAt = patch.linkExpiresAt
            ? new Date(patch.linkExpiresAt)
            : null;
        }
        if (patch.isActive !== undefined) {
          patch.isActive = !!patch.isActive;
        }

        patch.updatedAtLocal = now;

        await performOperation({
          modelName: 'QrSnippet',
          sqliteModel: QrSnippetSqlite,
          mysqlModel: QrSnippetMysql,
          op: 'update',
          where: { id },
          data: patch,
          outboxModel: OutboxSqlite,
        });

        res.json({
          success: true,
          data: { ...safeQrSnippet(existing), ...patch },
        });
      } catch (e) {
        next(e);
      }
    }
  );

  /**
   * DELETE /qr-snippets/:id
   * Soft delete: إلغاء تفعيل الكود (isActive = false)
   */
  router.delete(
    '/:id',
    requireAuth,
    requireRole('teacher', 'admin'),
    async (req, res, next) => {
      try {
        const id = Number(req.params.id);
        if (!id) {
          return res.status(400).json({
            success: false,
            message: 'id غير صالح',
          });
        }

        const existing = await QrSnippetSqlite.findByPk(id);
        if (!existing) {
          return res.status(404).json({
            success: false,
            message: 'الكود غير موجود',
          });
        }

        const patch = {
          isActive: false,
          updatedAtLocal: new Date(),
        };

        await performOperation({
          modelName: 'QrSnippet',
          sqliteModel: QrSnippetSqlite,
          mysqlModel: QrSnippetMysql,
          op: 'update',
          where: { id },
          data: patch,
          outboxModel: OutboxSqlite,
        });

        res.json({
          success: true,
          message: 'تم إلغاء تفعيل الكود',
          data: { id, isActive: false },
        });
      } catch (e) {
        next(e);
      }
    }
  );

  return router;
}

export default createQrSnippetsRouter;
