import { Router } from 'express';
import { Op } from 'sequelize';
import { requireAuth } from '../middlewares/auth.js';
import { normalizeLevel } from '../utils/levels.js';

export default function createStudentActivityRouter(models) {
  const router = Router();

  const {
    StudentSqlite,
    CourseSqlite,
    LessonSqlite,
    StudentLessonProgressSqlite,
    StudentAttendanceSqlite,
    ExamAttemptSqlite,
    ExamSqlite,
  } = models;

  // ========== دالة مشتركة ترجع تقرير النشاط لطالب معيّن ==========
  async function buildStudentActivity(studentId) {
    const student = await StudentSqlite.findByPk(studentId);
    if (!student) return null;

    const levelNorm =
      normalizeLevel(student.year) || student.year || null;

    // كورسات نفس السنة تقريبًا
    const courseWhere = { isDeleted: false };
    if (levelNorm) {
      courseWhere.level = levelNorm;
    }

    const [courses, progRows, attRows, examAttempts] =
      await Promise.all([
        CourseSqlite.findAll({
          where: courseWhere,
          attributes: ['id', 'title'],
        }),
        StudentLessonProgressSqlite.findAll({
          where: { studentId },
          order: [
            ['lastSeenAt', 'DESC'],
            ['updatedAtLocal', 'DESC'],
          ],
        }),
        StudentAttendanceSqlite.findAll({
          where: { studentId },
          order: [['attendedAt', 'DESC']],
        }),
        ExamAttemptSqlite.findAll({
          where: { studentId },
          order: [
            ['submittedAt', 'DESC'],
            ['id', 'DESC'],
          ],
        }),
      ]);

    const courseIds = courses.map((c) => Number(c.id));
    const courseMap = new Map(
      courses.map((c) => [Number(c.id), c]),
    );

    const lessonWhereBase = { isDeleted: false };
    if (courseIds.length) {
      lessonWhereBase.courseId = { [Op.in]: courseIds };
    }

    // كل المحاضرات (kind = 'lesson')
    const allLessons = await LessonSqlite.findAll({
      where: { ...lessonWhereBase, kind: 'lesson' },
      attributes: ['id', 'courseId', 'title'],
    });

    const allHomeworkLessons = await LessonSqlite.findAll({
      where: {
        ...lessonWhereBase,
        parentLessonId: { [Op.ne]: null },
      },
      attributes: ['id', 'courseId', 'title', 'createdAt'],
      order: [['id', 'DESC']],
      limit: 10,
    });

    const lessonIds = allLessons.map((l) => Number(l.id));
    const hwLessonIds = allHomeworkLessons.map((l) =>
      Number(l.id),
    );

    const lessonMap = new Map(
      allLessons.map((l) => [Number(l.id), l]),
    );

    const progressByLessonId = new Map();
    progRows.forEach((p) => {
      progressByLessonId.set(Number(p.lessonId), p);
    });

    // ===== Summary: Lectures =====
    const totalLectures = lessonIds.length;

    const watchedLectures = lessonIds.filter((id) => {
      const p = progressByLessonId.get(id);
      if (!p) return false;
      if (p.fullyWatched) return true;
      const duration = Number(p.durationSecCached || 0) || 0;
      const watched = Number(p.maxWatchedSec || 0) || 0;
      return duration > 0 && watched / duration >= 0.9;
    }).length;

    // ===== Summary: Homeworks =====
    const totalHomeworks = hwLessonIds.length;

    const solvedHomeworks = hwLessonIds.filter((id) => {
      const p = progressByLessonId.get(id);
      if (!p) return false;
      if (p.fullyWatched) return true;
      const duration = Number(p.durationSecCached || 0) || 0;
      const watched = Number(p.maxWatchedSec || 0) || 0;
      return duration > 0 && watched / duration >= 0.9;
    }).length;

    // ===== Summary: Exams =====
    const submittedAttempts = examAttempts.filter(
      (a) => a.submittedAt,
    );
    const solvedExams = submittedAttempts.length;

    let avgScore = 0;
    if (solvedExams > 0) {
      const sumScore = submittedAttempts.reduce(
        (sum, a) => sum + (Number(a.score) || 0),
        0,
      );
      avgScore = Math.round(sumScore / solvedExams);
    }

    // ===== lastActive + streak =====
    const activityDatesRaw = [];

    progRows.forEach((p) => {
      const dt =
        p.lastSeenAt || p.completedAt || p.updatedAtLocal;
      if (dt) activityDatesRaw.push(new Date(dt));
    });

    attRows.forEach((a) => {
      const dt =
        a.attendedAt || a.createdAt || a.updatedAtLocal;
      if (dt) activityDatesRaw.push(new Date(dt));
    });

    examAttempts.forEach((a) => {
      if (a.submittedAt)
        activityDatesRaw.push(new Date(a.submittedAt));
    });

    let lastActiveAt = null;
    if (activityDatesRaw.length) {
      lastActiveAt = new Date(
        Math.max(
          ...activityDatesRaw.map((d) => d.getTime()),
        ),
      );
    }

    const dayKeys = new Set(
      activityDatesRaw.map((d) =>
        d.toISOString().slice(0, 10),
      ),
    );

    const today = new Date();
    const base = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );

    let streakDays = 0;
    for (let i = 0; i < 365; i++) {
      const d = new Date(base);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      if (dayKeys.has(key)) streakDays++;
      else break;
    }

    const summary = {
      watchedLectures,
      totalLectures,
      solvedHomeworks,
      totalHomeworks,
      solvedExams,
      avgScore,
      streakDays,
      lastActiveAt: lastActiveAt
        ? lastActiveAt.toISOString()
        : null,
    };

    // ===== recentExams =====
    const examIds = Array.from(
      new Set(
        submittedAttempts
          .filter((a) => a.examId != null)
          .map((a) => Number(a.examId)),
      ),
    );

    let examMap = new Map();
    if (examIds.length) {
      const exams = await ExamSqlite.findAll({
        where: { id: { [Op.in]: examIds } },
        attributes: ['id', 'title'],
      });
      examMap = new Map(
        exams.map((e) => [Number(e.id), e]),
      );
    }

    const recentExams = submittedAttempts
      .slice()
      .sort((a, b) => {
        const da = new Date(
          a.submittedAt || a.startedAt || 0,
        ).getTime();
        const db = new Date(
          b.submittedAt || b.startedAt || 0,
        ).getTime();
        return db - da;
      })
      .slice(0, 3)
      .map((a) => {
        const exam = examMap.get(Number(a.examId));
        const scoreVal = Number(a.score ?? 0);
        let status = 'pending';
        if (a.submittedAt) {
          status = scoreVal >= 60 ? 'passed' : 'failed';
        }
        return {
          id: Number(a.examId),
          title:
            exam?.title || `امتحان رقم ${a.examId}`,
          date: (
            a.submittedAt ||
            a.startedAt ||
            new Date()
          ).toISOString(),
          score: scoreVal,
          maxScore: 100,
          status,
        };
      });

    // ===== recentLectures =====
    const lectureItems = [];
    for (const p of progRows) {
      const l = lessonMap.get(Number(p.lessonId));
      if (!l) continue;
      const course = courseMap.get(Number(l.courseId));
      const duration =
        Number(p.durationSecCached ?? 0) || 0;
      const watched =
        Number(p.maxWatchedSec ?? 0) || 0;
      let percent = 0;
      if (duration > 0) {
        percent = Math.round((watched / duration) * 100);
      } else if (p.fullyWatched) {
        percent = 100;
      }
      const lastWatchedAt =
        p.lastSeenAt ||
        p.updatedAtLocal ||
        p.firstStartedAt ||
        new Date();

      lectureItems.push({
        id: Number(l.id),
        title: l.title,
        course: course?.title || '',
        progressPercent: percent,
        lastWatchedAt,
      });
    }

    lectureItems.sort(
      (a, b) =>
        new Date(b.lastWatchedAt).getTime() -
        new Date(a.lastWatchedAt).getTime(),
    );

    const recentLectures = lectureItems
      .slice(0, 3)
      .map((l) => ({
        id: l.id,
        title: l.title,
        course: l.course,
        progressPercent: l.progressPercent,
        lastWatchedAt: new Date(
          l.lastWatchedAt,
        ).toISOString(),
      }));

    // ===== recentHomeworks =====
    const hwItems = [];
    for (const hw of allHomeworkLessons) {
      const p = progressByLessonId.get(Number(hw.id));
      const course = courseMap.get(Number(hw.courseId));
      const duration =
        Number(p?.durationSecCached ?? 0) || 0;
      const watched =
        Number(p?.maxWatchedSec ?? 0) || 0;
      const ratio = duration > 0 ? watched / duration : 0;

      let status = 'missing';
      let submittedAt = null;

      if (p) {
        if (p.fullyWatched || ratio >= 0.9) {
          status = 'submitted';
          submittedAt =
            p.completedAt ||
            p.lastSeenAt ||
            p.updatedAtLocal ||
            null;
        } else if (watched > 0) {
          status = 'review';
          submittedAt =
            p.lastSeenAt || p.updatedAtLocal || null;
        }
      }

      hwItems.push({
        id: Number(hw.id),
        title: hw.title,
        course: course?.title || '',
        status,
        submittedAt,
        grade: null,
      });
    }

    hwItems.sort((a, b) => {
      const da = a.submittedAt
        ? new Date(a.submittedAt).getTime()
        : 0;
      const db = b.submittedAt
        ? new Date(b.submittedAt).getTime()
        : 0;
      return db - da;
    });

    const recentHomeworks = hwItems
      .slice(0, 5)
      .map((h) => ({
        id: h.id,
        title: h.title,
        course: h.course,
        status: h.status,
        submittedAt: h.submittedAt
          ? new Date(h.submittedAt).toISOString()
          : null,
        grade: h.grade,
      }));

    return {
      summary,
      recentExams,
      recentLectures,
      recentHomeworks,
    };
  }

  // ========== الطالب نفسه ==========
  router.get('/me', requireAuth, async (req, res, next) => {
    try {
      const studentId = Number(req.user?.id);
      if (!studentId || req.user?.role !== 'student') {
        return res.status(403).json({
          success: false,
          message: 'مصرّح للطلاب فقط',
        });
      }

      const data = await buildStudentActivity(studentId);
      if (!data) {
        return res.status(404).json({
          success: false,
          message: 'الحساب غير موجود',
        });
      }

      return res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  });

  // ========== أدمن: تقرير طالب معيّن ==========
  router.get('/admin/:id', requireAuth, async (req, res, next) => {
    try {
      const role = req.user?.role;
      if (role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'مصرّح للأدمن فقط',
        });
      }

      const studentId = Number(req.params.id);
      if (!studentId || Number.isNaN(studentId)) {
        return res.status(400).json({
          success: false,
          message: 'id غير صالح',
        });
      }

      const data = await buildStudentActivity(studentId);
      if (!data) {
        return res.status(404).json({
          success: false,
          message: 'الحساب غير موجود',
        });
      }

      return res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
