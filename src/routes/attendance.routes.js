// src/routes/attendance.routes.js
import { Router } from 'express';
import { Op } from 'sequelize';

import { performOperation } from '../services/replicator.js';
import { requireAuth } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/roles.js';

export function createAttendanceRouter(models) {
  const router = Router();

  const {
    OutboxSqlite,

    StudentSqlite,
    LessonSqlite,
    CourseSqlite,
    CenterSqlite,

    StudentAttendanceSqlite,
    StudentAttendanceMysql,

    // تقدم المشاهدة
    StudentLessonProgressSqlite,
    StudentLessonProgressMysql, // مش هنستخدمه هنا بس موجود

    // QR
    QrSnippetSqlite,
    StudentQrViewSqlite,

    // Exams
    ExamSqlite,
    ExamAttemptSqlite,

    // NEW: Notifications
    NotificationSqlite,
    NotificationMysql,
  } = models;

  // Helper صغير للـ JSON-safe
  function safeJson(row) {
    return row?.toJSON ? row.toJSON() : row || {};
  }

  // Helper: نجيب الدرس اللي قبل الحالي في نفس الكورس (lesson فقط)
  async function findPreviousLesson(courseId, currentLesson) {
    if (!currentLesson) return null;

    const where = {
      courseId: Number(courseId),
      isDeleted: false,
      kind: 'lesson',
      [Op.or]: [
        { orderIndex: { [Op.lt]: currentLesson.orderIndex } },
        {
          orderIndex: currentLesson.orderIndex,
          id: { [Op.lt]: currentLesson.id },
        },
      ],
    };

    const prev = await LessonSqlite.findOne({
      where,
      order: [
        ['orderIndex', 'DESC'],
        ['id', 'DESC'],
      ],
    });

    return prev;
  }

  // Helper: إنشاء إشعار تحذير حضور للطالب
  async function createAttendanceWarningNotification({
    studentId,
    course,
    currentLesson,
    previousLesson,
    warnings,
  }) {
    try {
      if (!studentId || !warnings || !warnings.length) return;

      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      // ما نبعتش أكتر من تحذير ATTENDANCE_WARNING لنفس الطالب في آخر ساعة (anti-spam بسيط)
      const existing = await NotificationSqlite.findOne({
        where: {
          studentId: Number(studentId),
          kind: 'ATTENDANCE_WARNING',
          createdAt: { [Op.gte]: oneHourAgo },
        },
      });

      if (existing) {
        return;
      }

      const title = 'تحذير بخصوص الحضور - ' + (course?.title || 'الكورس');

      const parts = warnings.map(
        (w) => '- ' + (w.message || w.code || '')
      );

      const bodyLines = [];

      if (currentLesson?.title) {
        bodyLines.push(`محاضرة اليوم: "${currentLesson.title}".`);
      }
      if (previousLesson?.title) {
        bodyLines.push(`المحاضرة السابقة: "${previousLesson.title}".`);
      }

      if (parts.length) {
        bodyLines.push('');
        bodyLines.push('ملحوظات على الحضور والمذاكرة:');
        bodyLines.push(...parts);
      }

      const body = bodyLines.join('\n');

      await performOperation({
        modelName: 'Notification',
        sqliteModel: NotificationSqlite,
        mysqlModel: NotificationMysql,
        op: 'create',
        data: {
          studentId: Number(studentId),
          title,
          body,
          kind: 'ATTENDANCE_WARNING',
          dataJson: {
            courseId: course?.id ?? null,
            currentLessonId: currentLesson?.id ?? null,
            previousLessonId: previousLesson?.id ?? null,
            warnings,
          },
          isRead: false,
          createdAt: now,
          updatedAtLocal: now,
        },
        outboxModel: OutboxSqlite,
      });
    } catch (e) {
      console.warn(
        '[notifications] failed to create attendance warning:',
        e.message
      );
    }
  }

  /**
   * POST /attendance/preview
   * بيشتغل وقت ما المساعد في السنتر يعمل Scan لطلب
   * body:
   * {
   *   studentId,
   *   courseId,
   *   lessonId,   // المحاضرة الحالية (kind='lesson')
   *   centerId?   // السنتر اللي الطالب حاضر فيه دلوقتي
   * }
   *
   * بيرجع:
   * - بيانات الطالب / الكورس / المحاضرة الحالية
   * - الدرس اللي قبلها (previousLesson)
   * - آخر 5 جلسات (حضور سنتر + مشاهدة أونلاين)
   * - حالة حضور/مشاهدة الدرس اللي قبل
   * - حالة الواجب بتاع الدرس اللي قبل
   * - آخر امتحان في نفس المادة/السنة
   * - إحصائيات QR للدرس اللي قبل
   * - توصية: ينفع يحضر ولا في تحذيرات (canAttend / autoDecision / warnings)
   * - هل الجلسة دي تعويض من سنتر تاني ولا لا
   */
  router.post(
    '/preview',
    requireAuth,
    requireRole('teacher', 'admin'),
    async (req, res, next) => {
      try {
        const {
          studentId,
          courseId,
          lessonId,
          centerId,
        } = req.body || {};

        if (!studentId || !courseId || !lessonId) {
          return res.status(400).json({
            success: false,
            message: 'studentId, courseId, lessonId مطلوبين',
          });
        }

        // ===== 1) تحقق الأساسيات: الطالب / الكورس / الدرس =====
        const student = await StudentSqlite.findByPk(studentId);
        if (!student) {
          return res
            .status(404)
            .json({ success: false, message: 'الطالب غير موجود' });
        }

        const course = await CourseSqlite.findByPk(courseId);
        if (!course || course.isDeleted) {
          return res
            .status(404)
            .json({ success: false, message: 'الكورس غير موجود' });
        }

        const lesson = await LessonSqlite.findByPk(lessonId);
        if (!lesson || lesson.isDeleted) {
          return res
            .status(404)
            .json({ success: false, message: 'المحاضرة غير موجودة' });
        }
        if (Number(lesson.courseId) !== Number(courseId)) {
          return res.status(400).json({
            success: false,
            message: 'المحاضرة لا تنتمي لهذا الكورس',
          });
        }
        if (String(lesson.kind).toLowerCase() !== 'lesson') {
          return res.status(400).json({
            success: false,
            message: 'المحاضرة الحالية لازم تكون lesson مش homework',
          });
        }

        const now = new Date();

        // ===== 2) الدرس اللي قبل الحالي =====
        const prevLesson = await findPreviousLesson(courseId, lesson);

        // ===== 3) آخر 5 جلسات (سنتر + أونلاين) =====
        const [attRows, progRows] = await Promise.all([
          StudentAttendanceSqlite.findAll({
            where: {
              studentId: Number(studentId),
              courseId: Number(courseId),
            },
            order: [['attendedAt', 'DESC']],
            limit: 20,
          }),
          StudentLessonProgressSqlite.findAll({
            where: {
              studentId: Number(studentId),
              courseId: Number(courseId),
            },
            order: [
              ['lastSeenAt', 'DESC'],
              ['updatedAtLocal', 'DESC'],
            ],
            limit: 50,
          }),
        ]);

        const lessonIdsSet = new Set();
        attRows.forEach((a) => lessonIdsSet.add(Number(a.lessonId)));
        progRows.forEach((p) => lessonIdsSet.add(Number(p.lessonId)));

        const lessonIdsArr = Array.from(lessonIdsSet);
        const lessonsMap = {};
        if (lessonIdsArr.length) {
          const lsns = await LessonSqlite.findAll({
            where: { id: { [Op.in]: lessonIdsArr } },
          });
          lsns.forEach((l) => {
            lessonsMap[Number(l.id)] = l;
          });
        }

        const sessions = [];

        // حضور سنتر
        attRows.forEach((a) => {
          const l = lessonsMap[Number(a.lessonId)];
          const attendedAt = a.attendedAt || a.createdAt || a.updatedAtLocal;
          sessions.push({
            type: 'center',
            lessonId: Number(a.lessonId),
            lessonTitle: l?.title || null,
            attendedAt,
            when: attendedAt,
            centerId: a.centerId || null,
            accessMode: a.accessMode || null,
          });
        });

        // مشاهدة أونلاين
        progRows.forEach((p) => {
          const l = lessonsMap[Number(p.lessonId)];
          const when =
            p.completedAt ||
            p.lastSeenAt ||
            p.updatedAtLocal ||
            p.createdAt ||
            now;
          const duration = Number(p.durationSecCached || l?.durationSec || 0) || 0;
          const watched = Number(p.maxWatchedSec || 0) || 0;
          const ratio = duration > 0 ? watched / duration : null;

          sessions.push({
            type: 'online',
            lessonId: Number(p.lessonId),
            lessonTitle: l?.title || null,
            when,
            fullyWatched: !!p.fullyWatched,
            watchedSec: watched,
            durationSec: duration,
            watchedRatio: ratio,
          });
        });

        sessions.sort((a, b) => {
          const da = a.when ? new Date(a.when).getTime() : 0;
          const db = b.when ? new Date(b.when).getTime() : 0;
          return db - da;
        });

        const lastFiveSessions = sessions.slice(0, 5);

        // ===== 4) حالة الدرس اللي قبل الحالي (حضور + أونلاين) =====
        let prevLessonInfo = null;
        let prevLessonAttendance = null;
        let prevLessonProgress = null;
        let prevLessonWatchRatio = null;

        if (prevLesson) {
          prevLessonAttendance = await StudentAttendanceSqlite.findOne({
            where: {
              studentId: Number(studentId),
              courseId: Number(courseId),
              lessonId: Number(prevLesson.id),
            },
            order: [['attendedAt', 'DESC']],
          });

          prevLessonProgress = await StudentLessonProgressSqlite.findOne({
            where: {
              studentId: Number(studentId),
              lessonId: Number(prevLesson.id),
            },
            order: [
              ['lastSeenAt', 'DESC'],
              ['updatedAtLocal', 'DESC'],
            ],
          });

          const durationTotal =
            Number(
              prevLessonProgress?.durationSecCached || prevLesson.durationSec || 0
            ) || 0;
          const watchedSec = Number(prevLessonProgress?.maxWatchedSec || 0) || 0;
          prevLessonWatchRatio =
            durationTotal > 0 ? watchedSec / durationTotal : null;

          prevLessonInfo = {
            id: Number(prevLesson.id),
            title: prevLesson.title,
            attendedInCenter: !!prevLessonAttendance,
            attendanceAt: prevLessonAttendance?.attendedAt || null,
            watchedOnline: !!prevLessonProgress,
            onlineFullyWatched: !!prevLessonProgress?.fullyWatched,
            onlineWatchedSec: watchedSec,
            onlineDurationSec: durationTotal,
            onlineWatchedRatio: prevLessonWatchRatio,
          };
        }

        // ===== 5) واجبات الدرس اللي قبل الحالي =====
        let prevHomeworkSummary = null;

        if (prevLesson) {
          const homeworks = await LessonSqlite.findAll({
            where: {
              parentLessonId: Number(prevLesson.id),
              isDeleted: false,
              // لو عايز تقصرها على kind='homework' فقط:
              // kind: 'homework',
            },
            order: [
              ['orderIndex', 'ASC'],
              ['id', 'ASC'],
            ],
          });

          if (homeworks.length) {
            const hwIds = homeworks.map((h) => Number(h.id));
            const hwProgressRows = await StudentLessonProgressSqlite.findAll({
              where: {
                studentId: Number(studentId),
                lessonId: { [Op.in]: hwIds },
              },
            });

            const hwProgMap = {};
            hwProgressRows.forEach((p) => {
              hwProgMap[Number(p.lessonId)] = p;
            });

            const details = homeworks.map((hw) => {
              const p = hwProgMap[Number(hw.id)];
              const duration =
                Number(p?.durationSecCached || hw.durationSec || 0) || 0;
              const watched = Number(p?.maxWatchedSec || 0) || 0;
              const ratio = duration > 0 ? watched / duration : null;
              return {
                lessonId: Number(hw.id),
                title: hw.title,
                watchedSec: watched,
                durationSec: duration,
                watchedRatio: ratio,
                fullyWatched: !!p?.fullyWatched,
                hasAnyView: watched > 5, // عتبة بسيطة
              };
            });

            const total = details.length;
            const opened = details.filter((d) => d.hasAnyView).length;
            const completed = details.filter(
              (d) =>
                d.fullyWatched ||
                (typeof d.watchedRatio === 'number' &&
                  d.watchedRatio >= 0.9)
            ).length;

            prevHomeworkSummary = {
              totalHomeworks: total,
              openedCount: opened,
              completedCount: completed,
              details,
            };
          }
        }

        // ===== 6) آخر امتحان للطالب في نفس المادة/السنة تقريباً =====
        let lastExamSummary = null;

        try {
          const examWhere = {
            status: 'published',
            isDeleted: false,
          };

          if (course.category) examWhere.category = course.category;
          if (course.level) examWhere.grade = course.level;

          const exams = await ExamSqlite.findAll({ where: examWhere });
          const examIds = exams.map((e) => Number(e.id));

          if (examIds.length) {
            const attempt = await ExamAttemptSqlite.findOne({
              where: {
                studentId: Number(studentId),
                examId: { [Op.in]: examIds },
                submittedAt: { [Op.ne]: null },
              },
              order: [
                ['submittedAt', 'DESC'],
                ['id', 'DESC'],
              ],
            });

            if (attempt) {
              const related = exams.find(
                (e) => Number(e.id) === Number(attempt.examId)
              );
              lastExamSummary = {
                examId: Number(attempt.examId),
                title: related?.title || null,
                score: attempt.score ?? null,
                submittedAt: attempt.submittedAt || null,
              };
            }
          }
        } catch (_) {
          // لو حصل خطأ في الامتحانات، تجاهله بس ما تبوّظش الـ preview
        }

        // ===== 7) إحصائيات QR للدرس اللي قبل =====
        let prevLessonQrSummary = null;

        if (prevLesson) {
          const qrList = await QrSnippetSqlite.findAll({
            where: {
              courseId: Number(courseId),
              lessonId: Number(prevLesson.id),
              isActive: true,
            },
            order: [['id', 'ASC']],
          });

          if (qrList.length) {
            const qrIds = qrList.map((q) => Number(q.id));
            const views = await StudentQrViewSqlite.findAll({
              where: {
                studentId: Number(studentId),
                qrId: { [Op.in]: qrIds },
              },
            });

            const viewMap = {};
            views.forEach((v) => {
              viewMap[Number(v.qrId)] = v;
            });

            const details = qrList.map((q) => {
              const v = viewMap[Number(q.id)];
              return {
                qrId: Number(q.id),
                title: q.title,
                viewsCount: Number(v?.viewsCount || 0),
                lastViewedAt: v?.lastViewedAt || null,
              };
            });

            const total = details.length;
            const watchedCount = details.filter(
              (d) => (d.viewsCount || 0) > 0
            ).length;

            prevLessonQrSummary = {
              totalSnippets: total,
              watchedSnippets: watchedCount,
              details,
            };
          }
        }

        // ===== 8) هل الجلسة دي تعويض من سنتر تاني؟ =====
        let isMakeupFromAnotherCenter = false;
        let originalCenter = null;
        let currentCenter = null;

        if (student.centerId) {
          originalCenter = await CenterSqlite.findByPk(student.centerId);
        }
        if (centerId) {
          currentCenter = await CenterSqlite.findByPk(centerId);
        }

        if (
          originalCenter &&
          currentCenter &&
          Number(originalCenter.id) !== Number(currentCenter.id)
        ) {
          isMakeupFromAnotherCenter = true;
        }

        // ===== 9) بناء الـ Warnings + توصية canAttend =====

        const warnings = [];

        // شرط 1: محاضرة قبل الحالية
        const hasPrevLesson = !!prevLesson;

        // هل اعتبرناه حضر الدرس اللي قبل؟ (سنتر أو أونلاين >=90%)
        let prevLessonConsideredAttended = false;
        if (prevLessonInfo) {
          if (prevLessonInfo.attendedInCenter) {
            prevLessonConsideredAttended = true;
          } else if (
            typeof prevLessonWatchRatio === 'number' &&
            prevLessonWatchRatio >= 0.9
          ) {
            prevLessonConsideredAttended = true;
          }
        }

        if (hasPrevLesson && !prevLessonConsideredAttended) {
          warnings.push({
            code: 'MISSING_PREVIOUS_LESSON',
            severity: 'high',
            message:
              'الطالب لم يحضر المحاضرة السابقة أو لم يشاهد 90% منها على الأقل.',
          });
        }

        // شرط 2: الواجب بتاع المحاضرة اللي قبل
        let prevHomeworkOpened = false;
        let prevHomeworkCompleted = false;
        if (prevHomeworkSummary) {
          if (prevHomeworkSummary.totalHomeworks > 0) {
            prevHomeworkOpened =
              prevHomeworkSummary.openedCount > 0 &&
              prevHomeworkSummary.openedCount <=
                prevHomeworkSummary.totalHomeworks;

            prevHomeworkCompleted =
              prevHomeworkSummary.completedCount ===
                prevHomeworkSummary.totalHomeworks &&
              prevHomeworkSummary.totalHomeworks > 0;
          }
        }

        if (prevHomeworkSummary && prevHomeworkSummary.totalHomeworks > 0) {
          if (!prevHomeworkOpened) {
            warnings.push({
              code: 'HOMEWORK_NOT_OPENED',
              severity: 'medium',
              message:
                'الطالب لم يفتح واجب المحاضرة السابقة على المنصة.',
            });
          } else if (!prevHomeworkCompleted) {
            warnings.push({
              code: 'HOMEWORK_NOT_COMPLETED',
              severity: 'medium',
              message:
                'الطالب بدأ واجب المحاضرة السابقة لكنه لم يكمله حتى النهاية.',
            });
          }
        }

        // ممكن تضيف Warning بسيط لو نسبة الـ QR قليلة جداً
        if (
          prevLessonQrSummary &&
          prevLessonQrSummary.totalSnippets > 0 &&
          prevLessonQrSummary.watchedSnippets <
            prevLessonQrSummary.totalSnippets * 0.5
        ) {
          warnings.push({
            code: 'LOW_QR_ENGAGEMENT',
            severity: 'low',
            message:
              'الطالب شاهد أقل من 50% من الفيديوهات القصيرة (QR) الخاصة بالمحاضرة السابقة.',
          });
        }

        const canAttend = warnings.length === 0;
        const autoDecision = canAttend ? 'ALLOW' : 'WARN';

        // ===== 10) إنشاء إشعار تحذير (لو فيه تحذيرات) =====
        if (warnings.length) {
          await createAttendanceWarningNotification({
            studentId,
            course,
            currentLesson: lesson,
            previousLesson: prevLesson,
            warnings,
          });
        }

        // ===== 11) الرد النهائي =====
        return res.json({
          success: true,
          data: {
            student: safeJson(student),
            course: safeJson(course),
            currentLesson: safeJson(lesson),
            previousLesson: prevLesson ? safeJson(prevLesson) : null,

            lastFiveSessions,

            previousLessonInfo: prevLessonInfo,
            previousHomeworkSummary: prevHomeworkSummary,
            previousLessonQrSummary: prevLessonQrSummary,
            lastExamSummary,

            isMakeupFromAnotherCenter,
            originalCenter: originalCenter ? safeJson(originalCenter) : null,
            currentCenter: currentCenter ? safeJson(currentCenter) : null,

            canAttend,
            autoDecision, // 'ALLOW' | 'WARN'
            warnings,
          },
        });
      } catch (e) {
        next(e);
      }
    }
  );

  /**
   * POST /attendance/mark
   * تسجيل حضور فعلي (بعد ما المساعد يشوف الـ preview ويقرر)
   * body:
   * {
   *   studentId,
   *   courseId,
   *   lessonId,        // lesson أصلية kind='lesson'
   *   centerId?,       
   *   accessMode,      // 'HW_ONLY' | 'FULL_LESSON'
   *   daysLimit?,      // عدد الأيام مسموح (اختياري)
   *   viewsLimit?      // عدد المشاهدات الأقصى (اختياري)
   *   // ممكن تبعت كمان:
   *   // exception?: boolean,        // لو حضر رغم وجود تحذيرات (للـ UI بس دلوقتي)
   *   // exceptionReason?: string,   // سبب الاستثناء (مش بيتخزن دلوقتي في DB)
   * }
   */
  router.post(
    '/mark',
    requireAuth,
    requireRole('teacher', 'admin'),
    async (req, res, next) => {
      try {
        const {
          studentId,
          courseId,
          lessonId,
          centerId,
          accessMode, // HW_ONLY | FULL_LESSON
          daysLimit, // optional
          viewsLimit, // optional
        } = req.body || {};

        if (!studentId || !courseId || !lessonId || !accessMode) {
          return res.status(400).json({
            success: false,
            message:
              'studentId, courseId, lessonId, accessMode مطلوبين',
          });
        }

        if (!['HW_ONLY', 'FULL_LESSON'].includes(accessMode)) {
          return res.status(400).json({
            success: false,
            message: 'accessMode غير صالح (HW_ONLY | FULL_LESSON)',
          });
        }

        // تأكد الطالب موجود
        const student = await StudentSqlite.findByPk(studentId);
        if (!student) {
          return res
            .status(404)
            .json({ success: false, message: 'الطالب غير موجود' });
        }

        // تأكد الدرس موجود وراجع لنفس الكورس
        const lesson = await LessonSqlite.findByPk(lessonId);
        if (!lesson || lesson.isDeleted) {
          return res
            .status(404)
            .json({ success: false, message: 'الدرس غير موجود' });
        }
        if (Number(lesson.courseId) !== Number(courseId)) {
          return res.status(400).json({
            success: false,
            message: 'الدرس لا ينتمي لهذا الكورس',
          });
        }
        if (String(lesson.kind).toLowerCase() !== 'lesson') {
          return res.status(400).json({
            success: false,
            message:
              'لا يمكن تسجيل حضور على واجب، لازم lesson أصلي',
          });
        }

        // تأكد الكورس مش ممسوح
        const course = await CourseSqlite.findByPk(courseId);
        if (!course || course.isDeleted) {
          return res
            .status(404)
            .json({ success: false, message: 'الكورس غير موجود' });
        }

        const now = new Date();

        // احسب انتهاء الإتاحة لو فيه daysLimit
        let accessExpiresAt = null;
        if (daysLimit !== undefined && daysLimit !== null) {
          const days = Number(daysLimit);
          if (Number.isFinite(days) && days > 0) {
            accessExpiresAt = new Date(
              now.getTime() + days * 24 * 60 * 60 * 1000
            );
          }
        }

        // حدّ المشاهدات
        let maxViews = null;
        if (viewsLimit !== undefined && viewsLimit !== null) {
          const v = Number(viewsLimit);
          if (Number.isFinite(v) && v >= 0) {
            maxViews = v;
          }
        }

        const data = {
          studentId: Number(studentId),
          courseId: Number(courseId),
          lessonId: Number(lessonId),
          centerId: centerId ?? student.centerId ?? null,

          accessMode,
          attendedAt: now,
          recordedByUserId: req.user?.id ?? null,

          accessExpiresAt,
          maxViews,
          viewsUsed: 0,

          createdAt: now,
          updatedAtLocal: now,
        };

        const created = await performOperation({
          modelName: 'StudentAttendance',
          sqliteModel: StudentAttendanceSqlite,
          mysqlModel: StudentAttendanceMysql,
          op: 'create',
          data,
          outboxModel: OutboxSqlite,
        });

        return res.json({
          success: true,
          data: created.toJSON?.() ?? data,
        });
      } catch (e) {
        next(e);
      }
    }
  );

  return router;
}

export default createAttendanceRouter;
