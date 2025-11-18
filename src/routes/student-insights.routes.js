// src/routes/student-insights.routes.js
import { Router } from 'express';
import { Op } from 'sequelize';
import { requireAuth } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/roles.js';

export function createStudentInsightsRouter(models) {
  const router = Router();

  const {
    StudentSqlite,
    CenterSqlite,
    CourseSqlite,
    LessonSqlite,
    StudentAttendanceSqlite,
    StudentLessonProgressSqlite,
    QrSnippetSqlite,
    StudentQrViewSqlite,
    ExamSqlite,
    ExamAttemptSqlite,
  } = models;

  function toPlain(row) {
    return row?.toJSON ? row.toJSON() : row;
  }

  /**
   * GET /student-insights/center-dashboard/summary
   *
   * query:
   *  - studentId (مطلوب)
   *  - courseId  (مطلوب)
   *  - lessonId  (مطلوب)  -> المحاضرة اللي الطالب داخلها دلوقتي
   *  - centerId  (اختياري) -> السنتر الحالي اللي بيتم فيه الحضور
   *
   * بيرجع:
   *  - بيانات الطالب + سنتره الأساسي
   *  - هل الزيارة دي "تعويض" في سنتر غير سنتره الأصلي ولا لأ
   *  - سجل آخر 5 محاضرات اتفاعل معاها (حضور سنتر أو مشاهدة أونلاين)
   *      * لكل واحدة: Online ولا Center + اتفرج قد إيه وقد إيه فاضل
   *  - ملخّص واجبات "المحاضرة اللي قبل الحالية"
   *  - درجة آخر امتحان للمحاضرة اللي قبل الحالية (لو مربوط Exam.lessonId)
   *  - عدد QR short videos بتوع المحاضرة اللي قبل الحالية
   *    وكم واحد اتشاف منّهم
   */
  router.get(
    '/center-dashboard/summary',
    requireAuth,
    requireRole('teacher', 'admin'),
    async (req, res, next) => {
      try {
        const studentId = Number(req.query.studentId);
        const courseId  = Number(req.query.courseId);
        const lessonId  = Number(req.query.lessonId);
        const centerId  = req.query.centerId ? Number(req.query.centerId) : null;

        if (!studentId || !courseId || !lessonId) {
          return res.status(400).json({
            success: false,
            message: 'studentId, courseId, lessonId مطلوبة في الـ query',
          });
        }

        // ===== الطالب + سنتره الأساسي =====
        const student = await StudentSqlite.findByPk(studentId, {
          include: [{ model: CenterSqlite, as: 'center' }],
        });
        if (!student) {
          return res.status(404).json({
            success: false,
            message: 'الطالب غير موجود',
          });
        }

        // ===== الكورس =====
        const course = await CourseSqlite.findByPk(courseId);
        if (!course || course.isDeleted) {
          return res.status(404).json({
            success: false,
            message: 'الكورس غير موجود',
          });
        }

        // ===== المحاضرة الحالية =====
        const lesson = await LessonSqlite.findOne({
          where: { id: lessonId, courseId, isDeleted: false },
        });
        if (!lesson) {
          return res.status(404).json({
            success: false,
            message: 'المحاضرة غير موجودة في هذا الكورس',
          });
        }

        // ===== سنتر الزيارة الحالية =====
        let center = null;
        if (centerId) {
          center = await CenterSqlite.findByPk(centerId);
        }

        // تعويض؟ (لو سنتر الطالب الأساسي != السنتر الحالي)
        const isMakeup =
          !!center &&
          !!student.centerId &&
          Number(student.centerId) !== Number(centerId);

        // ===== آخر حضور للمحاضرة الحالية (لو كان موجود قبل كده) =====
        const currentAttendance = await StudentAttendanceSqlite.findOne({
          where: { studentId, courseId, lessonId },
          order: [['attendedAt', 'DESC'], ['id', 'DESC']],
        });

        // =============================================
        //  (2) آخر 5 محاضرات اتفاعل معاها (سنتر أو أونلاين)
        // =============================================

        // آخر 20 attendance (نوسع شوية علشان بعد الدمج)
        const attendanceRows = await StudentAttendanceSqlite.findAll({
          where: { studentId },
          order: [['attendedAt', 'DESC'], ['id', 'DESC']],
          limit: 20,
        });

        // آخر 20 progress (مشاهدة فيديو)
        const progressRows = await StudentLessonProgressSqlite.findAll({
          where: { studentId },
          order: [['lastSeenAt', 'DESC'], ['id', 'DESC']],
          limit: 20,
        });

        // ندمج الاتنين على مستوى lessonId
        const mergedMap = new Map();

        for (const att of attendanceRows) {
          const lid = att.lessonId;
          if (!lid) continue;

          const existing = mergedMap.get(lid) || {
            lessonId: lid,
            courseId: att.courseId || null,
            attendance: null,
            progress: null,
            lastInteractionAt: 0,
          };

          existing.courseId = existing.courseId || att.courseId || null;
          existing.attendance = att;

          const ts = att.attendedAt ? new Date(att.attendedAt).getTime() : 0;
          if (!existing.lastInteractionAt || ts > existing.lastInteractionAt) {
            existing.lastInteractionAt = ts;
          }

          mergedMap.set(lid, existing);
        }

        for (const prog of progressRows) {
          const lid = prog.lessonId;
          if (!lid) continue;

          const existing = mergedMap.get(lid) || {
            lessonId: lid,
            courseId: prog.courseId || null,
            attendance: null,
            progress: null,
            lastInteractionAt: 0,
          };

          existing.courseId = existing.courseId || prog.courseId || null;
          existing.progress = prog;

          const ts = prog.lastSeenAt ? new Date(prog.lastSeenAt).getTime() : 0;
          if (!existing.lastInteractionAt || ts > existing.lastInteractionAt) {
            existing.lastInteractionAt = ts;
          }

          mergedMap.set(lid, existing);
        }

        // نرتّب بالـ lastInteractionAt ونجيب أول 5 بس
        const mergedArr = Array.from(mergedMap.values())
          .filter(e => e.lastInteractionAt > 0)
          .sort((a, b) => b.lastInteractionAt - a.lastInteractionAt)
          .slice(0, 5);

        const lastLessonIds  = [...new Set(mergedArr.map(e => e.lessonId))];
        const lastCourseIds  = [...new Set(mergedArr.map(e => e.courseId).filter(Boolean))];

        const lastLessons = lastLessonIds.length
          ? await LessonSqlite.findAll({ where: { id: lastLessonIds } })
          : [];
        const lastCourses = lastCourseIds.length
          ? await CourseSqlite.findAll({ where: { id: lastCourseIds } })
          : [];

        const lessonMap = new Map(lastLessons.map(l => [l.id, l]));
        const courseMap = new Map(lastCourses.map(c => [c.id, c]));

        const lastLessonsSummary = mergedArr.map(entry => {
          const lsn = lessonMap.get(entry.lessonId);
          const crs = entry.courseId ? courseMap.get(entry.courseId) : null;
          const att = entry.attendance;
          const prog = entry.progress;

          const durationSec = (prog?.durationSecCached ?? lsn?.durationSec) || 0;
          const watchedSec  = prog?.maxWatchedSec ?? 0;

          let progressPercent = null;
          let remainingSec = null;
          let fullyWatched = !!prog?.fullyWatched;

          if (durationSec && durationSec > 0) {
            progressPercent = Math.min(
              100,
              Math.round((watchedSec / durationSec) * 100)
            );
            remainingSec = Math.max(0, durationSec - watchedSec);
            if (!fullyWatched && progressPercent >= 90) {
              fullyWatched = true;
            }
          }

          const attendanceMode = att
            ? (att.centerId ? 'center' : 'online')
            : (prog ? 'online' : null);

          return {
            lessonId: entry.lessonId,
            lessonTitle: lsn?.title ?? null,
            lessonKind: lsn?.kind ?? null,
            courseId: entry.courseId ?? lsn?.courseId ?? null,
            courseTitle: crs?.title ?? null,
            attendedAt: att?.attendedAt ?? null,
            attendanceMode,            // 'center' | 'online' | null
            centerId: att?.centerId ?? null,
            lastInteractionAt: new Date(entry.lastInteractionAt).toISOString(),
            watchedSec,
            durationSec: durationSec || null,
            remainingSec,
            progressPercent,
            fullyWatched,
          };
        });

        // =============================================
        //  (3,4,5,6) كل ما يخص "المحاضرة اللي قبل الحالية"
        // =============================================

        // المحاضرة اللي قبل الحالية في نفس الكورس (kind='lesson')
        let previousLesson = null;
        if (lesson.kind === 'lesson') {
          previousLesson = await LessonSqlite.findOne({
            where: {
              courseId,
              kind: 'lesson',
              isDeleted: false,
              [Op.or]: [
                { orderIndex: { [Op.lt]: lesson.orderIndex } },
                {
                  orderIndex: lesson.orderIndex,
                  id: { [Op.lt]: lesson.id },
                },
              ],
            },
            order: [
              ['orderIndex', 'DESC'],
              ['id', 'DESC'],
            ],
          });
        } else if (lesson.parentLessonId) {
          // لو اللي داخلها دلوقتي واجب، نبص على المحاضرة الأصلية
          previousLesson = await LessonSqlite.findByPk(lesson.parentLessonId);
        }

        // (4) واجب المحاضرة اللي قبل الحالية
        let previousHomeworkSummary = null;
        if (previousLesson) {
          const homeworks = await LessonSqlite.findAll({
            where: {
              parentLessonId: previousLesson.id,
              kind: 'homework',
              isDeleted: false,
            },
            order: [['orderIndex', 'ASC'], ['id', 'ASC']],
          });

          if (homeworks.length) {
            const hwIds = homeworks.map(h => h.id);
            const hwProgressRows = await StudentLessonProgressSqlite.findAll({
              where: { studentId, lessonId: hwIds },
            });
            const hwProgMap = new Map(hwProgressRows.map(p => [p.lessonId, p]));

            const items = homeworks.map(hw => {
              const prog = hwProgMap.get(hw.id);
              const durationSec = (prog?.durationSecCached ?? hw.durationSec) || 0;
              const watchedSec  = prog?.maxWatchedSec ?? 0;

              let progressPercent = null;
              let remainingSec = null;
              let fullyWatched = !!prog?.fullyWatched;

              if (durationSec && durationSec > 0) {
                progressPercent = Math.min(
                  100,
                  Math.round((watchedSec / durationSec) * 100)
                );
                remainingSec = Math.max(0, durationSec - watchedSec);
                if (!fullyWatched && progressPercent >= 90) {
                  fullyWatched = true;
                }
              }

              return {
                lessonId: hw.id,
                title: hw.title,
                watchedSec,
                durationSec: durationSec || null,
                remainingSec,
                progressPercent,
                fullyWatched,
              };
            });

            const total             = items.length;
            const fullyWatchedCount = items.filter(i => i.fullyWatched).length;
            const watchedAnyCount   = items.filter(i => (i.watchedSec || 0) > 0).length;

            previousHomeworkSummary = {
              total,
              watchedAnyCount,
              fullyWatchedCount,
              items,
            };
          }
        }

        // (6) QR short videos للمحاضرة اللي قبل الحالية
        let previousQrSummary = null;
        if (previousLesson) {
          const qrSnippets = await QrSnippetSqlite.findAll({
            where: {
              courseId,
              lessonId: previousLesson.id,
              isActive: true,
            },
          });

          const totalQr = qrSnippets.length;
          if (totalQr > 0) {
            const qrIds = qrSnippets.map(q => q.id);
            const views = await StudentQrViewSqlite.findAll({
              where: { studentId, qrId: qrIds },
            });

            const viewedQrIds = new Set(
              views
                .filter(v => (v.viewsCount || 0) > 0)
                .map(v => v.qrId)
            );

            const viewedQr    = viewedQrIds.size;
            const notViewedQr = totalQr - viewedQr;
            const viewedPercent = Math.round((viewedQr / totalQr) * 100);

            previousQrSummary = {
              totalQr,
              viewedQr,
              notViewedQr,
              viewedPercent,
            };
          } else {
            previousQrSummary = {
              totalQr: 0,
              viewedQr: 0,
              notViewedQr: 0,
              viewedPercent: null,
            };
          }
        }

        // (5) درجة آخر امتحان للمحاضرة اللي قبلها (لو فيه Exam.lessonId = previousLesson.id)
        let previousExamResult = null;
        if (previousLesson && ExamSqlite && ExamAttemptSqlite) {
          const lessonExams = await ExamSqlite.findAll({
            where: {
              lessonId: previousLesson.id,
              isDeleted: false,
              status: 'published',
            },
            order: [
              ['publishedAt', 'DESC'],
              ['id', 'DESC'],
            ],
          });

          const exam = lessonExams[0];
          if (exam) {
            const attempt = await ExamAttemptSqlite.findOne({
              where: { examId: exam.id, studentId },
              order: [['submittedAt', 'DESC'], ['id', 'DESC']],
            });

            previousExamResult = {
              examId: exam.id,
              title: exam.title,
              score: attempt?.score ?? null,
              attemptedAt: attempt?.submittedAt ?? null,
            };
          }
        }

        // ===== Response نهائي =====
        return res.json({
          success: true,
          data: {
            student: {
              id: student.id,
              name: student.fullName || student.name || null,
              centerId: student.centerId ?? null,
              centerName: student.center?.name ?? null,
            },
            course: {
              id: course.id,
              title: course.title,
            },
            currentLesson: {
              id: lesson.id,
              title: lesson.title,
              kind: lesson.kind,
              orderIndex: lesson.orderIndex,
            },
            center: center
              ? { id: center.id, name: center.name }
              : null,
            isMakeup,
            currentAttendance: currentAttendance
              ? {
                  id: currentAttendance.id,
                  attendedAt: currentAttendance.attendedAt,
                  centerId: currentAttendance.centerId,
                }
              : null,
            lastLessons: lastLessonsSummary,          // (النقطة 2)
            previousLesson: previousLesson
              ? {
                  id: previousLesson.id,
                  title: previousLesson.title,
                  orderIndex: previousLesson.orderIndex,
                }
              : null,
            previousHomeworkSummary,                  // (النقطة 4)
            previousExamResult,                       // (النقطة 5)
            previousQrSummary,                        // (النقطة 6)
          },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}

export default createStudentInsightsRouter;
