// src/middlewares/access.js
import { hasEntitlement } from '../services/access.js';

function inRange(start, end, now = new Date()) {
  const okStart = !start || new Date(start) <= now;
  const okEnd   = !end   || new Date(end)   >= now;
  return okStart && okEnd;
}

/**
 * السماح بالوصول إلى كورس كامل
 * دلوقتي بيعتمد على hasEntitlement عشان نمنع تكرار اللوجيك
 */
export function canAccessCourse(models) {
  return async (req, res, next) => {
    try {
      const studentId = req.user?.id;
      const courseId = Number(
        req.params.courseId ||
        req.params.id ||
        req.body?.courseId
      );

      if (!studentId || !courseId) {
        return res.status(401).json({ success: false, message: 'غير مصرح' });
      }

      const result = await hasEntitlement({
        models,
        studentId,
        resource: { type: 'COURSE', id: courseId },
      });

      if (!result.ok) {
        if (result.reason === 'COURSE_NOT_FOUND') {
          return res
            .status(404)
            .json({ success: false, message: 'الكورس غير موجود' });
        }

        // حالة خطة QUOTA ولسه محتاج يعمل Claim للكورس
        if (result.via === 'subscription_quota_eligible') {
          return res.status(403).json({
            success: false,
            message: 'يجب أولاً تفعيل هذا الكورس داخل الباقة (Claim)',
            code: 'SUBSCRIPTION_QUOTA_CLAIM_REQUIRED',
            data: {
              planId: result.planId,
              subscriptionId: result.subscriptionId,
              courseId: result.courseId,
            },
          });
        }

        return res
          .status(403)
          .json({ success: false, message: 'لا تملك صلاحية الوصول لهذا الكورس' });
      }

      // خزن كل تفاصيل الدخول في req.accessInfo
      req.accessInfo = result;
      return next();
    } catch (e) {
      return next(e);
    }
  };
}

/**
 * السماح بالوصول إلى درس معيّن (محاضرة أو واجب)
 * يشمل:
 * - preview مجاني
 * - صلاحية عامة على الكورس (free / enrollment / subscription)
 * - Attendance بالسنتر
 * - Override يدوي
 */
export function canAccessLesson(models) {
  const {
    LessonSqlite,
    CourseSqlite,
    StudentAttendanceSqlite,
    StudentLessonOverrideSqlite,
  } = models;

  return async (req, res, next) => {
    try {
      const studentId = req.user?.id;
      const courseId  = Number(req.params.courseId || req.body?.courseId);
      const lessonId  = Number(req.params.lessonId || req.body?.lessonId);

      if (!studentId || !courseId || !lessonId) {
        return res.status(401).json({ success: false, message: 'غير مصرح' });
      }

      const lesson = await LessonSqlite.findOne({
        where: { id: lessonId, courseId, isDeleted: false },
      });
      if (!lesson) {
        return res
          .status(404)
          .json({ success: false, message: 'الدرس غير موجود' });
      }

      const kind = String(lesson.kind || '').toLowerCase(); // 'lesson' | 'homework'
      const now  = new Date();

      // 0) لو الدرس مفتوح كمعاينة مجانية
      if (lesson.isFreePreview) {
        req.accessInfo = { via: 'preview', lessonId };
        return next();
      }

      // نتأكد إن الكورس نفسه موجود (لرسالة 404 صح لو متشال)
      const course = await CourseSqlite.findByPk(courseId);
      if (!course || course.isDeleted) {
        return res
          .status(404)
          .json({ success: false, message: 'الكورس غير موجود' });
      }

      // 1) صلاحية عامة على الكورس (مجاني / شراء / اشتراك)
      const courseEnt = await hasEntitlement({
        models,
        studentId,
        resource: { type: 'COURSE', id: courseId },
      });

      if (courseEnt.ok) {
        req.accessInfo = {
          ...courseEnt,
          lessonId,
        };
        return next();
      }

      // لو خطة QUOTA ولسه محتاج Claim → رجّع Forbidden مخصوص
      if (courseEnt.via === 'subscription_quota_eligible') {
        return res.status(403).json({
          success: false,
          message: 'يجب أولاً تفعيل هذا الكورس داخل الباقة (Claim)',
          code: 'SUBSCRIPTION_QUOTA_CLAIM_REQUIRED',
          data: {
            planId: courseEnt.planId,
            subscriptionId: courseEnt.subscriptionId,
            courseId,
          },
        });
      }

      // 2) حضور السنتر (StudentAttendance)
      // attendance بيسجل دايماً على lesson أصلي kind='lesson'
      // - لو الطالب بيحاول يفتح محاضرة:
      //    لازم accessMode = FULL_LESSON
      // - لو الطالب بيحاول يفتح واجب:
      //    يكفي HW_ONLY أو FULL_LESSON
      async function checkAttendanceAccess() {
        let baseLessonIdForAttendance = lessonId;
        if (kind === 'homework') {
          baseLessonIdForAttendance = lesson.parentLessonId;
          if (!baseLessonIdForAttendance) return null;
        }

        const att = await StudentAttendanceSqlite.findOne({
          where: {
            studentId,
            courseId,
            lessonId: baseLessonIdForAttendance,
          },
          order: [['id', 'DESC']],
        });
        if (!att) return null;

        // صلاحيات نوع المحتوى
        if (kind === 'lesson') {
          if (att.accessMode !== 'FULL_LESSON') return null;
        } else {
          if (!['HW_ONLY', 'FULL_LESSON'].includes(att.accessMode)) return null;
        }

        // صلاحية الوقت
        if (att.accessExpiresAt && new Date(att.accessExpiresAt) < now) {
          return null;
        }

        // صلاحية العدد
        if (att.maxViews != null && att.maxViews >= 0) {
          if ((att.viewsUsed || 0) >= att.maxViews) {
            return null;
          }
        }

        return att;
      }

      const attRow = await checkAttendanceAccess();
      if (attRow) {
        req.accessInfo = {
          via: 'attendance',
          attendanceId: attRow.id,
          lessonId,
        };
        return next();
      }

      // 3) Override يدوي (StudentLessonOverride)
      const ov = await StudentLessonOverrideSqlite.findOne({
        where: {
          studentId,
          lessonId,
        },
        order: [['id', 'DESC']],
      });

      if (ov) {
        if (!ov.expiresAt || new Date(ov.expiresAt) >= now) {
          let allowedByKind = false;
          if (kind === 'lesson' && ov.allowVideoAccess) {
            allowedByKind = true;
          }
          if (kind === 'homework' && ov.allowHomeworkAccess) {
            allowedByKind = true;
          }

          if (allowedByKind) {
            if (
              ov.maxViews != null &&
              ov.maxViews >= 0 &&
              (ov.viewsUsed || 0) >= ov.maxViews
            ) {
              // خلصت المشاهدات → مفيش سماح
            } else {
              req.accessInfo = {
                via: 'override',
                overrideId: ov.id,
                lessonId,
              };
              return next();
            }
          }
        }
      }

      // لو وصلنا هنا: مفيش أي مصدر سماح
      return res
        .status(403)
        .json({ success: false, message: 'لا تملك صلاحية الوصول لهذا الدرس' });
    } catch (e) {
      return next(e);
    }
  };
}
