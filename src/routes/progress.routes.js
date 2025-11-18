// src/routes/progress.routes.js
import { Router } from 'express';
import { performOperation } from '../services/replicator.js';
import { requireAuth } from '../middlewares/auth.js';
import { canAccessLesson } from '../middlewares/access.js';

export function createProgressRouter(models) {
  const router = Router();

  const {
    OutboxSqlite,
    LessonSqlite,
    StudentLessonProgressSqlite,
    StudentLessonProgressMysql,
  } = models;

  // POST /lessons/:lessonId/progress
  router.post(
    '/lessons/:lessonId/progress',
    requireAuth,
    canAccessLesson(models),
    async (req, res, next) => {
      try {
        const studentId = req.user?.id;
        const lessonId  = Number(req.params.lessonId);
        const { currentPositionSec, videoDurationSec, deviceSessionId } = req.body || {};

        if (!studentId || !lessonId) {
          return res.status(400).json({ success: false, message: 'invalid data' });
        }

        const lsn = await LessonSqlite.findByPk(lessonId);
        if (!lsn || lsn.isDeleted) {
          return res.status(404).json({ success: false, message: 'lesson not found' });
        }

        // فاضل نجيب الصف الحالي (لو موجود)
        const existing = await StudentLessonProgressSqlite.findOne({
          where: { studentId, lessonId },
        });

        const now = new Date();

        const durationTotal = Number(videoDurationSec ?? lsn.durationSec ?? 0) || 0;
        const newPos        = Number(currentPositionSec ?? 0);
        const prevMax       = existing ? (existing.maxWatchedSec || 0) : 0;
        const newMax        = newPos > prevMax ? newPos : prevMax;

        // نسبة المشاهدة
        let fullyWatched   = existing ? !!existing.fullyWatched : false;
        let completedAt    = existing ? existing.completedAt : null;

        if (durationTotal > 0) {
          const ratio = newMax / durationTotal;
          if (!fullyWatched && ratio >= 0.9) {
            fullyWatched = true;
            completedAt = now;
          }
        }

        // بنبني الـ data اللي هنـcreate/hnupdate
        const payload = {
          studentId,
          lessonId,
          courseId: Number(lsn.courseId),

          lastPositionSec: newPos,
          maxWatchedSec:   newMax,
          durationSecCached: durationTotal,

          fullyWatched,
          completedAt,

          firstStartedAt: existing?.firstStartedAt || now,
          lastSeenAt: now,

          deviceSessionId: deviceSessionId ?? existing?.deviceSessionId ?? null,
          ipAddr: req.ip || existing?.ipAddr || null,
          userAgent: req.headers['user-agent'] || existing?.userAgent || null,

          createdAt: existing?.createdAt || now,
          updatedAtLocal: now,
        };

        if (!existing) {
          // أول مرة → create
          const created = await performOperation({
            modelName: 'StudentLessonProgress',
            sqliteModel: StudentLessonProgressSqlite,
            mysqlModel: StudentLessonProgressMysql,
            op: 'create',
            data: payload,
            outboxModel: OutboxSqlite,
          });

          return res.json({
            success: true,
            data: created.toJSON ? created.toJSON() : payload,
          });
        } else {
          // موجود → update
          await performOperation({
            modelName: 'StudentLessonProgress',
            sqliteModel: StudentLessonProgressSqlite,
            mysqlModel: StudentLessonProgressMysql,
            op: 'update',
            where: { id: existing.id },
            data: payload,
            outboxModel: OutboxSqlite,
          });

          const fresh = await StudentLessonProgressSqlite.findByPk(existing.id);
          return res.json({
            success: true,
            data: fresh?.toJSON?.() ?? payload,
          });
        }
      } catch (e) {
        next(e);
      }
    }
  );

  return router;
}

export default createProgressRouter;
