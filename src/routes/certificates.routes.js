// src/routes/certificates.routes.js
import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/roles.js';
import { performOperation } from '../services/replicator.js';

function safeCert(row) {
  return row?.toJSON ? row.toJSON() : row || {};
}

export default function createCertificatesRouter(models) {
  const router = Router();

  const {
    StudentSqlite,
    StudentCertificateSqlite,
    StudentCertificateMysql,
    OutboxSqlite,
  } = models;

  // ===== GET /certificates/me =====
  // شهادات الطالب الحالي
  router.get('/me', requireAuth, async (req, res, next) => {
    try {
      if (String(req.user?.role || '').toLowerCase() !== 'student') {
        return res
          .status(403)
          .json({ success: false, message: 'مصرّح للطلاب فقط' });
      }

      const rows = await StudentCertificateSqlite.findAll({
        where: { studentId: Number(req.user.id) },
        order: [
          ['issuedAt', 'DESC'],
          ['id', 'DESC'],
        ],
      });

      return res.json({
        success: true,
        data: rows.map(safeCert),
      });
    } catch (e) {
      next(e);
    }
  });

  // ===== GET /certificates/student/:id =====
  // شهادات طالب معيّن (للمدرّس / الأدمن)
  router.get(
    '/student/:id',
    requireAuth,
    requireRole('teacher', 'admin'),
    async (req, res, next) => {
      try {
        const studentId = Number(req.params.id);
        if (!studentId) {
          return res
            .status(400)
            .json({ success: false, message: 'studentId غير صالح' });
        }

        const student = await StudentSqlite.findByPk(studentId);
        if (!student) {
          return res
            .status(404)
            .json({ success: false, message: 'الطالب غير موجود' });
        }

        const rows = await StudentCertificateSqlite.findAll({
          where: { studentId },
          order: [
            ['issuedAt', 'DESC'],
            ['id', 'DESC'],
          ],
        });

        return res.json({
          success: true,
          data: rows.map(safeCert),
        });
      } catch (e) {
        next(e);
      }
    }
  );

  // ===== POST /certificates =====
  // إنشاء شهادة لطالب (أدمن / Teacher)
  router.post(
    '/',
    requireAuth,
    requireRole('teacher', 'admin'),
    async (req, res, next) => {
      try {
        const {
          studentId,
          title,
          description,
          type,
          issuedBy,
          issuedAt,
          reason,
          course,
          score,
          maxScore,
          meta,
        } = req.body || {};

        if (!studentId || !title) {
          return res.status(400).json({
            success: false,
            message: 'studentId و title مطلوبان',
          });
        }

        const student = await StudentSqlite.findByPk(studentId);
        if (!student) {
          return res
            .status(404)
            .json({ success: false, message: 'الطالب غير موجود' });
        }

        const allowedTypes = ['exam', 'course', 'behavior', 'other'];
        const certType = allowedTypes.includes(type) ? type : 'other';

        const now = new Date();

        const data = {
          studentId: Number(studentId),
          title: String(title).trim(),
          description: description ? String(description).trim() : null,
          type: certType,
          issuedBy: issuedBy ? String(issuedBy).trim() : 'منصة المبدع',
          issuedAt: issuedAt ? new Date(issuedAt) : now,
          reason: reason ? String(reason).trim() : null,
          course: course ? String(course).trim() : null,
          score: score != null ? Number(score) : null,
          maxScore: maxScore != null ? Number(maxScore) : null,
          metaJson: meta ? JSON.stringify(meta) : null,
          createdAtLocal: now,
          updatedAtLocal: now,
        };

        const created = await performOperation({
          modelName: 'StudentCertificate', // نفس الاسم في stores.js
          sqliteModel: StudentCertificateSqlite,
          mysqlModel: StudentCertificateMysql,
          op: 'create',
          data,
          outboxModel: OutboxSqlite,
        });

        return res.json({
          success: true,
          data: safeCert(created),
        });
      } catch (e) {
        next(e);
      }
    }
  );

  return router;
}
