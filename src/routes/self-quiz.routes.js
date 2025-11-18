// src/routes/self-quiz.routes.js
import { Router } from 'express';
import { Op } from 'sequelize';
import { requireAuth } from '../middlewares/auth.js';
import softAuth from '../middlewares/soft-auth.js';
import { requireRole } from '../middlewares/roles.js';
import { isAllowedHost } from '../utils/url-guard.js';
import { normalizeLevel } from '../utils/levels.js';
import { performOperation } from '../services/replicator.js'; // 👈 زي الشهادات

function validateMCQ(q) {
  const errors = [];
  if (!q.body || String(q.body).trim().length < 3) errors.push('body مطلوب (≥3)');
  if (q.imageUrl && !isAllowedHost(String(q.imageUrl))) errors.push('imageUrl غير مسموح');
  const choices = Array.isArray(q.choices) ? q.choices : [];
  if (choices.length < 2) errors.push('يلزم اختياران على الأقل');
  const correctIndex = Number.isInteger(q.correctIndex) ? q.correctIndex : -1;
  if (correctIndex < 0 || correctIndex >= choices.length) errors.push('correctIndex غير صالح');
  choices.forEach((c) => {
    if (!c || (!c.label && !c.imageUrl)) errors.push('اختيار غير صالح');
    if (c.imageUrl && !isAllowedHost(String(c.imageUrl))) errors.push('imageUrl للاختيار غير مسموح');
  });
  return errors;
}

export default function createSelfQuizRouter(models) {
  const router = Router();

  const {
    // SQLite
    SelfQuizChapterSqlite,
    SelfQuizQuestionSqlite,
    SelfQuizChoiceSqlite,
    SelfQuizCompletionSqlite,
    // MySQL (تتأكد إنها معرّفة في stores.js)
    SelfQuizChapterMysql,
    SelfQuizQuestionMysql,
    SelfQuizChoiceMysql,
    // Outbox للريبليكيشن
    OutboxSqlite,
  } = models;

  // ============ Admin/User ============

  // إنشاء فصل (SQLite + MySQL)
  router.post(
    '/chapters',
    requireAuth,
    requireRole('admin', 'user'),
    async (req, res, next) => {
      try {
        const raw = req.body?.gradeLevel;
        const gradeLevel = normalizeLevel(raw);
        if (!gradeLevel) {
          return res
            .status(400)
            .json({ success: false, message: 'gradeLevel غير صالح' });
        }

        const title = String(req.body?.title || '').trim();
        if (!title) {
          return res
            .status(400)
            .json({ success: false, message: 'title مطلوب' });
        }

        const orderIndex = Number(req.body?.orderIndex || 0);
        const now = new Date();

        // 👈 استخدام performOperation بدلاً من SelfQuizChapterSqlite.create
        const created = await performOperation({
          modelName: 'SelfQuizChapter', // نفس الاسم التعريفي في stores.js
          sqliteModel: SelfQuizChapterSqlite,
          mysqlModel: SelfQuizChapterMysql,
          op: 'create',
          data: {
            gradeLevel,
            title,
            orderIndex,
            createdAtLocal: now,
            updatedAtLocal: now,
          },
          outboxModel: OutboxSqlite,
        });

        return res.json({ success: true, data: created });
      } catch (e) {
        next(e);
      }
    }
  );

  // Bulk: إنشاء عدة أسئلة مع اختياراتها في طلب واحد (SQLite + MySQL)
  // body = { questions: [{ body, imageUrl?, explanation?, orderIndex?, choices: [{label,imageUrl?, orderIndex?}], correctIndex }...] }
  router.post(
    '/chapters/:chapterId/questions/bulk',
    requireAuth,
    requireRole('admin', 'user'),
    async (req, res, next) => {
      try {
        const chapterId = Number(req.params.chapterId);
        const chapter = await SelfQuizChapterSqlite.findOne({
          where: { id: chapterId, isDeleted: false },
        });
        if (!chapter) {
          return res
            .status(404)
            .json({ success: false, message: 'الفصل غير موجود' });
        }

        const items = Array.isArray(req.body?.questions)
          ? req.body.questions
          : [];
        if (!items.length) {
          return res
            .status(400)
            .json({ success: false, message: 'questions[] مطلوب' });
        }

        const createdQuestions = [];

        for (const q of items) {
          const errs = validateMCQ(q);
          if (errs.length) {
            return res.status(400).json({ success: false, errors: errs });
          }

          const now = new Date();

          // 1) إنشاء السؤال في SQLite + MySQL
          const question = await performOperation({
            modelName: 'SelfQuizQuestion',
            sqliteModel: SelfQuizQuestionSqlite,
            mysqlModel: SelfQuizQuestionMysql,
            op: 'create',
            data: {
              chapterId,
              body: q.body.trim(),
              imageUrl: q.imageUrl ? String(q.imageUrl).trim() : null,
              explanation: q.explanation ?? null,
              orderIndex: Number.isInteger(q.orderIndex) ? q.orderIndex : 0,
              createdAtLocal: now,
              updatedAtLocal: now,
            },
            outboxModel: OutboxSqlite,
          });

          // 2) إنشاء الاختيارات واحدة واحدة في SQLite + MySQL
          const createdChoices = [];
          for (const [idx, c] of q.choices.entries()) {
            const choice = await performOperation({
              modelName: 'SelfQuizChoice',
              sqliteModel: SelfQuizChoiceSqlite,
              mysqlModel: SelfQuizChoiceMysql,
              op: 'create',
              data: {
                questionId: question.id,
                label: c.label || '',
                imageUrl: c.imageUrl ?? null,
                isCorrect: idx === Number(q.correctIndex),
                orderIndex: Number.isInteger(c.orderIndex)
                  ? c.orderIndex
                  : idx + 1,
                createdAtLocal: now,
                updatedAtLocal: now,
              },
              outboxModel: OutboxSqlite,
            });

            createdChoices.push(choice);
          }

          createdQuestions.push({ question, choices: createdChoices });
        }

        return res.json({ success: true, data: createdQuestions });
      } catch (e) {
        next(e);
      }
    }
  );

  // ============ Student ============

  // قائمة الفصول حسب الصف
  router.get('/chapters', softAuth, async (req, res, next) => {
    try {
      const levelQ = String(req.query.gradeLevel || '').trim();
      const where = { isDeleted: false };

      if (levelQ) {
        const lv = normalizeLevel(levelQ);
        if (lv) where.gradeLevel = lv;
      } else if (req.user?.level) {
        const lvUser = normalizeLevel(req.user.level) || req.user.level;
        if (lvUser) where.gradeLevel = lvUser;
      }

      const rows = await SelfQuizChapterSqlite.findAll({
        where,
        order: [
          ['orderIndex', 'ASC'],
          ['id', 'ASC'],
        ],
        attributes: [
          'id',
          'title',
          'gradeLevel',
          'orderIndex',
          'createdAtLocal',
          'updatedAtLocal',
        ],
      });
      res.json({ success: true, data: rows });
    } catch (e) {
      next(e);
    }
  });

  // وضع اللعب: أسئلة الفصل + اختياراتها بدون كشف isCorrect
  router.get('/chapters/:chapterId/play', softAuth, async (req, res, next) => {
    try {
      const chapterId = Number(req.params.chapterId);
      const chapter = await SelfQuizChapterSqlite.findOne({
        where: { id: chapterId, isDeleted: false },
      });
      if (!chapter) {
        return res
          .status(404)
          .json({ success: false, message: 'الفصل غير موجود' });
      }

      const questions = await SelfQuizQuestionSqlite.findAll({
        where: { chapterId, isDeleted: false },
        order: [
          ['orderIndex', 'ASC'],
          ['id', 'ASC'],
        ],
        attributes: ['id', 'body', 'imageUrl', 'explanation', 'orderIndex'],
      });

      const qIds = questions.map((q) => q.id);
      const choices = await SelfQuizChoiceSqlite.findAll({
        where: { questionId: { [Op.in]: qIds } },
        order: [
          ['orderIndex', 'ASC'],
          ['id', 'ASC'],
        ],
        attributes: ['id', 'questionId', 'label', 'imageUrl', 'orderIndex'], // بدون isCorrect
      });

      const byQ = new Map(qIds.map((id) => [id, []]));
      for (const c of choices) byQ.get(c.questionId).push(c);

      const payload = questions.map((q) => ({
        ...q.toJSON(),
        choices: byQ.get(q.id),
      }));

      res.json({ success: true, data: { chapter, questions: payload } });
    } catch (e) {
      next(e);
    }
  });

  // تحقق سؤال: يرجّع صح/غلط + الشرح
  router.post(
    '/attempts/check',
    requireAuth,
    requireRole('student'),
    async (req, res, next) => {
      try {
        const questionId = Number(req.body?.questionId);
        const choiceId = Number(req.body?.choiceId);
        if (!questionId || !choiceId) {
          return res.status(400).json({
            success: false,
            message: 'questionId و choiceId مطلوبان',
          });
        }

        const question = await SelfQuizQuestionSqlite.findOne({
          where: { id: questionId, isDeleted: false },
        });
        if (!question) {
          return res
            .status(404)
            .json({ success: false, message: 'السؤال غير موجود' });
        }

        const choice = await SelfQuizChoiceSqlite.findOne({
          where: { id: choiceId, questionId },
        });
        if (!choice) {
          return res.status(400).json({
            success: false,
            message: 'اختيار غير تابع للسؤال',
          });
        }

        res.json({
          success: true,
          data: {
            correct: !!choice.isCorrect,
            explanation: question.explanation ?? null,
          },
        });
      } catch (e) {
        next(e);
      }
    }
  );

  // وسم الفصل كمكتمل (هنا سايبينها على SQLite بس)
  router.post(
    '/chapters/:chapterId/complete',
    requireAuth,
    requireRole('student'),
    async (req, res, next) => {
      try {
        const chapterId = Number(req.params.chapterId);
        const { totalQuestions = 0, totalCorrect = 0 } = req.body || {};
        const studentId = Number(req.user.id);

        const chapter = await SelfQuizChapterSqlite.findOne({
          where: { id: chapterId, isDeleted: false },
        });
        if (!chapter) {
          return res
            .status(404)
            .json({ success: false, message: 'الفصل غير موجود' });
        }

        const isPerfect =
          Number(totalQuestions) > 0 &&
          Number(totalCorrect) === Number(totalQuestions);

        const [row, created] = await SelfQuizCompletionSqlite.findOrCreate({
          where: { studentId, chapterId },
          defaults: {
            studentId,
            chapterId,
            isPerfect,
            totalQuestions,
            totalCorrect,
            lastAttemptAt: new Date(),
            updatedAtLocal: new Date(),
          },
        });

        if (!created) {
          row.isPerfect = isPerfect;
          row.totalQuestions = Number(totalQuestions);
          row.totalCorrect = Number(totalCorrect);
          row.lastAttemptAt = new Date();
          row.updatedAtLocal = new Date();
          await row.save();
        }

        res.json({
          success: true,
          data: { chapterId, isPerfect, totalQuestions, totalCorrect },
        });
      } catch (e) {
        next(e);
      }
    }
  );

  // حالة فصول الطالب
  router.get(
    '/completions/my',
    requireAuth,
    requireRole('student'),
    async (req, res, next) => {
      try {
        const rows = await SelfQuizCompletionSqlite.findAll({
          where: { studentId: Number(req.user.id) },
          order: [['chapterId', 'ASC']],
        });
        res.json({ success: true, data: rows });
      } catch (e) {
        next(e);
      }
    }
  );

  // ============ CRUD إضافي (اختياري مختصر) ============
  // (لسه على SQLite فقط، لو حابب نعمل لها ريبيليكيت نضبطها بعد ما نتأكد ازاي performOperation بيعمل update/delete)

  router.patch(
    '/questions/:id',
    requireAuth,
    requireRole('admin', 'user'),
    async (req, res, next) => {
      try {
        const id = Number(req.params.id);
        const q = await SelfQuizQuestionSqlite.findByPk(id);
        if (!q || q.isDeleted) {
          return res
            .status(404)
            .json({ success: false, message: 'السؤال غير موجود' });
        }

        const patch = { updatedAtLocal: new Date() };
        ['body', 'imageUrl', 'explanation', 'orderIndex'].forEach((k) => {
          if (req.body[k] !== undefined) patch[k] = req.body[k];
        });
        await q.update(patch);
        res.json({ success: true, data: { id, ...patch } });
      } catch (e) {
        next(e);
      }
    }
  );

  router.delete(
    '/questions/:id',
    requireAuth,
    requireRole('admin', 'user'),
    async (req, res, next) => {
      try {
        const id = Number(req.params.id);
        const q = await SelfQuizQuestionSqlite.findByPk(id);
        if (!q || q.isDeleted) {
          return res
            .status(404)
            .json({ success: false, message: 'السؤال غير موجود' });
        }
        await q.update({ isDeleted: true, updatedAtLocal: new Date() });
        res.json({ success: true, message: 'تم حذف السؤال' });
      } catch (e) {
        next(e);
      }
    }
  );

  // ============ Admin: جلب أسئلة الفصل مع الاختيارات ============
  // GET /self-quiz/chapters/:chapterId/questions
  router.get(
    '/chapters/:chapterId/questions',
    requireAuth,
    requireRole('admin', 'user'),
    async (req, res, next) => {
      try {
        const chapterId = Number(req.params.chapterId);
        const chapter = await SelfQuizChapterSqlite.findOne({
          where: { id: chapterId, isDeleted: false },
        });

        if (!chapter) {
          return res
            .status(404)
            .json({ success: false, message: 'الفصل غير موجود' });
        }

        const questions = await SelfQuizQuestionSqlite.findAll({
          where: { chapterId, isDeleted: false },
          order: [
            ['orderIndex', 'ASC'],
            ['id', 'ASC'],
          ],
          attributes: ['id', 'body', 'imageUrl', 'explanation', 'orderIndex'],
        });

        const qIds = questions.map((q) => q.id);

        let choices = [];
        if (qIds.length) {
          choices = await SelfQuizChoiceSqlite.findAll({
            where: { questionId: { [Op.in]: qIds } },
            order: [
              ['orderIndex', 'ASC'],
              ['id', 'ASC'],
            ],
            attributes: [
              'id',
              'questionId',
              'label',
              'imageUrl',
              'isCorrect',
              'orderIndex',
            ],
          });
        }

        const byQ = new Map(qIds.map((id) => [id, []]));
        for (const c of choices) {
          byQ.get(c.questionId).push(c);
        }

        const payload = questions.map((q) => ({
          ...q.toJSON(),
          choices: byQ.get(q.id) || [],
        }));

        return res.json({ success: true, data: payload });
      } catch (e) {
        next(e);
      }
    }
  );

  return router;
}
