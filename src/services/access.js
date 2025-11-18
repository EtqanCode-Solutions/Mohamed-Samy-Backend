// src/services/access.js
import { normalizeLevel } from '../utils/levels.js';

/**
 * Helper: check if [start, end] تشمل الآن (بالـ ms)
 */
function isInRange(start, end, nowMs) {
  const s = start ? new Date(start).getTime() : null;
  const e = end ? new Date(end).getTime() : null;
  const t = nowMs ?? Date.now();
  if (s != null && t < s) return false;
  if (e != null && t > e) return false;
  return true;
}

function categoryMatches(scopeValue, category) {
  if (!scopeValue || !category) return false;

  const cat = String(category).trim();
  if (!cat) return false;

  try {
    const parsed = JSON.parse(scopeValue);
    if (Array.isArray(parsed)) {
      return parsed.some((c) => String(c).trim() === cat);
    }
  } catch {
    // لو مش JSON هنتعامل معها كـ single value
  }

  return String(scopeValue).trim() === cat;
}

function courseListMatches(includeCourseIds, courseId) {
  if (!includeCourseIds || !courseId) return false;
  try {
    const parsed = JSON.parse(includeCourseIds);
    if (!Array.isArray(parsed)) return false;
    const cid = Number(courseId);
    return parsed.some((id) => Number(id) === cid);
  } catch {
    return false;
  }
}

/**
 * المصدر الرئيسي لتحديد صلاحية الطالب على Resource
 * resource.type:
 *  - 'COURSE' → resource.id = courseId
 *  - 'EXAM'   → resource.category, resource.isFree, ...
 */
export async function hasEntitlement({ models, studentId, resource }) {
  const {
    SubscriptionSqlite,
    PlanSqlite,
    EnrollmentSqlite,
    CourseSqlite,
    StudentSqlite,
    SubscriptionConsumptionSqlite,
  } = models;

  if (!studentId) return { ok: false, via: null, reason: 'NO_STUDENT' };
  if (!resource || !resource.type) {
    return { ok: false, via: null, reason: 'NO_RESOURCE' };
  }

  const type = String(resource.type).toUpperCase();

  // --------------------------------------------------
  // 1) COURSE
  // --------------------------------------------------
  if (type === 'COURSE') {
    const courseId = Number(resource.id);
    if (!courseId) return { ok: false, via: null, reason: 'COURSE_ID_INVALID' };

    const course = await CourseSqlite.findByPk(courseId);
    if (!course || course.isDeleted) {
      return { ok: false, via: null, reason: 'COURSE_NOT_FOUND' };
    }

    // مجاني بالكامل
    if (course.isFree) {
      return { ok: true, via: 'free', scope: 'free', courseId };
    }

    const nowMs = Date.now();

    // شراء فردي (Enrollment)
    const enr = await EnrollmentSqlite.findOne({
      where: { studentId, courseId },
    });
    if (enr && isInRange(enr.startsAt, enr.endsAt, nowMs)) {
      return {
        ok: true,
        via: 'enrollment',
        scope: 'course',
        courseId,
        enrollmentId: enr.id,
      };
    }

    // اشتراكات نشطة
    const subs = await SubscriptionSqlite.findAll({
      where: { studentId, status: 'active' },
      order: [['id', 'DESC']],
      limit: 30,
    });

    const courseGrade =
      normalizeLevel(course.level) || (course.level || '').trim() || null;
    const courseCategory = (course.category || '').trim() || null;

    for (const sub of subs) {
      if (!isInRange(sub.startsAt, sub.endsAt, nowMs)) continue;

      const plan = await PlanSqlite.findByPk(sub.planId);
      if (!plan || !plan.isActive) continue;

      const scopeType = String(plan.scopeType || '').toUpperCase();

      // درجة الخطة (المرحلة الدراسية) من scopeStage أو من scopeValue لو كان scopeType=GRADE قديم
      let planGrade = null;
      if (plan.scopeStage) {
        planGrade =
          normalizeLevel(plan.scopeStage) ||
          String(plan.scopeStage).trim() ||
          null;
      }
      if (!planGrade && scopeType === 'GRADE' && plan.scopeValue) {
        planGrade =
          normalizeLevel(plan.scopeValue) ||
          String(plan.scopeValue).trim() ||
          null;
      }

      // لو الخطة مربوطة بمرحلة معينة والكورس من مرحلة مختلفة → تجاهل الخطة
      if (planGrade && courseGrade && planGrade !== courseGrade) continue;

      // هل الخطة تغطي هذا الكورس؟
      let covers = false;
      let scope = null;

      if (
        scopeType === 'ALL' ||
        scopeType === 'GRADE' ||
        scopeType === 'STAGE'
      ) {
        covers = true;
        scope = 'all';
      } else if (
        scopeType === 'CATEGORY' ||
        scopeType === 'SUBJECT'
      ) {
        if (courseCategory && categoryMatches(plan.scopeValue, courseCategory)) {
          covers = true;
          scope = 'category';
        }
      } else if (scopeType === 'COURSE_LIST') {
        if (courseListMatches(plan.includeCourseIds, courseId)) {
          covers = true;
          scope = 'course_list';
        }
      }

      if (!covers) continue;

      const planKind = String(plan.kind || 'UNLIMITED').toUpperCase();

      // UNLIMITED → دخول مباشر
      if (planKind === 'UNLIMITED') {
        return {
          ok: true,
          via: 'subscription',
          scope,
          planKind: 'UNLIMITED',
          planId: plan.id,
          subscriptionId: sub.id,
          courseId,
        };
      }

      // QUOTA → لازم يكون تم استهلاك الكورس من الباقة قبل كده
      if (planKind === 'QUOTA' && SubscriptionConsumptionSqlite) {
        const consumed = await SubscriptionConsumptionSqlite.findOne({
          where: { subscriptionId: sub.id, courseId },
        });

        if (consumed) {
          return {
            ok: true,
            via: 'subscription',
            scope,
            planKind: 'QUOTA',
            consumed: true,
            planId: plan.id,
            subscriptionId: sub.id,
            courseId,
          };
        }

        // لسه ما استهلكش → Eligible بس محتاج Claim
        return {
          ok: false,
          via: 'subscription_quota_eligible',
          scope,
          planKind: 'QUOTA',
          consumed: false,
          planId: plan.id,
          subscriptionId: sub.id,
          courseId,
          nextAction: 'claim-required',
          reason: 'COURSE_NOT_CONSUMED_YET',
        };
      }

      // أي نوع تاني نعامله كـ Unlimited احتياطيًا
      return {
        ok: true,
        via: 'subscription',
        scope,
        planKind,
        planId: plan.id,
        subscriptionId: sub.id,
        courseId,
      };
    }

    return { ok: false, via: null, reason: 'NO_ACCESS' };
  }

  // --------------------------------------------------
  // 2) EXAM
  // --------------------------------------------------
  if (type === 'EXAM') {
    // لو الامتحان Free من الأساس
    if (resource.isFree) {
      return { ok: true, via: 'free', scope: 'free' };
    }

    const nowMs = Date.now();

    const student = await StudentSqlite.findByPk(studentId);
    const studentGrade =
      normalizeLevel(student?.year) || student?.year || null;
    const examCategory = resource.category || null;

    const subs = await SubscriptionSqlite.findAll({
      where: { studentId, status: 'active' },
      order: [['id', 'DESC']],
      limit: 30,
    });

    for (const sub of subs) {
      if (!isInRange(sub.startsAt, sub.endsAt, nowMs)) continue;

      const plan = await PlanSqlite.findByPk(sub.planId);
      if (!plan || !plan.isActive) continue;

      const scopeType = String(plan.scopeType || '').toUpperCase();

      // درجة الخطة
      let planGrade = null;
      if (plan.scopeStage) {
        planGrade =
          normalizeLevel(plan.scopeStage) ||
          String(plan.scopeStage).trim() ||
          null;
      }
      if (!planGrade && scopeType === 'GRADE' && plan.scopeValue) {
        planGrade =
          normalizeLevel(plan.scopeValue) ||
          String(plan.scopeValue).trim() ||
          null;
      }

      if (planGrade && studentGrade && planGrade !== studentGrade) continue;

      // تغطية الامتحان
      if (
        scopeType === 'ALL' ||
        scopeType === 'GRADE' ||
        scopeType === 'STAGE'
      ) {
        return {
          ok: true,
          via: 'subscription',
          scope: 'all',
          planId: plan.id,
          subscriptionId: sub.id,
        };
      }

      if (
        (scopeType === 'CATEGORY' || scopeType === 'SUBJECT') &&
        examCategory &&
        categoryMatches(plan.scopeValue, examCategory)
      ) {
        return {
          ok: true,
          via: 'subscription',
          scope: 'category',
          planId: plan.id,
          subscriptionId: sub.id,
        };
      }
    }

    return { ok: false, via: null, reason: 'NO_ACCESS' };
  }

  // أنواع موارد أخرى لاحقًا
  return { ok: false, via: null, reason: 'UNSUPPORTED_RESOURCE' };
}

/**
 * Wrapper بسيط:
 * يحاول يجيب صلاحية الطالب على كورس محدد باستخدام hasEntitlement
 */
export async function canAccessCourse({ models, studentId, courseId }) {
  const result = await hasEntitlement({
    models,
    studentId,
    resource: { type: 'COURSE', id: courseId },
  });

  if (!result.ok) {
    return { ok: false, reason: result.reason || 'NO_ACCESS' };
  }
  return result;
}

/**
 * Wrapper خفيف لمحاضرة واحدة:
 * - لو الدرس preview مجاني → مسموح
 * - وإلا نستخدم canAccessCourse
 * (Attendance / Override بتتطبق في middleware)
 */
export async function canAccessLesson({
  models,
  studentId,
  courseId,
  lessonId,
}) {
  const { LessonSqlite } = models;

  const lesson = await LessonSqlite.findOne({
    where: { id: lessonId, courseId, isDeleted: false },
  });
  if (!lesson) return { ok: false, reason: 'LESSON_NOT_FOUND' };

  if (lesson.isFreePreview) {
    return { ok: true, via: 'FREE_PREVIEW', lessonId };
  }

  const courseResult = await canAccessCourse({
    models,
    studentId,
    courseId,
  });

  if (!courseResult.ok) {
    return { ok: false, reason: courseResult.reason || 'NO_ACCESS' };
  }

  return {
    ...courseResult,
    lessonId,
  };
}
