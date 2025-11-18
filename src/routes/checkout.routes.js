// src/routes/checkout.routes.js
import { Router } from "express";
import { performOperation } from "../services/replicator.js";
import { canAccessCourse } from "../services/access.js"; // ✅ عشان نمنع الشراء المكرر

export function createCheckoutRouter(models) {
  const router = Router();

  const {
    OutboxSqlite,

    CourseSqlite,

    OrderSqlite,
    OrderMysql,
    OrderItemSqlite,
    OrderItemMysql,
    PaymentSqlite,
    PaymentMysql,

    EnrollmentSqlite,
    EnrollmentMysql,

    SubscriptionSqlite,
    SubscriptionMysql,
    PlanSqlite,

    WalletSqlite,
    WalletMysql,
    WalletTxSqlite,
    WalletTxMysql,
    SubscriptionConsumptionSqlite,
    SubscriptionConsumptionMysql,
  } = models;

  // دالة مساعدة: هل لدى الطالب اشتراك نشط في هذه الخطة؟
  async function hasActivePlanSubscription(studentId, planId) {
    const subs = await SubscriptionSqlite.findAll({
      where: { studentId, planId, status: "active" },
    });

    if (!subs.length) return false;

    const now = Date.now();
    return subs.some((s) => {
      const startMs = s.startsAt ? new Date(s.startsAt).getTime() : 0;
      const endMs = s.endsAt ? new Date(s.endsAt).getTime() : 0;

      if (!startMs && !endMs) return true;
      if (startMs && !endMs) return startMs <= now;
      if (!startMs && endMs) return now <= endMs;
      return startMs <= now && now <= endMs;
    });
  }

  // ---------------------------------
  // 1) إنشاء طلب شراء كورس فردي (دفع يدوي/offline)
  // ---------------------------------
  router.post("/purchase-course", async (req, res, next) => {
    try {
      const studentId = req.user?.id;
      const courseId = Number(req.body?.courseId);
      if (!studentId || !courseId) {
        return res
          .status(400)
          .json({ success: false, message: "بيانات ناقصة" });
      }

      const course = await CourseSqlite.findByPk(courseId);
      if (!course || course.isDeleted) {
        return res
          .status(404)
          .json({ success: false, message: "الكورس غير موجود" });
      }

      const price = course.isFree ? 0 : course.priceCents || 0;
      const currency = "EGP";

      // 1) Order
      const order = await performOperation({
        modelName: "Order",
        sqliteModel: OrderSqlite,
        mysqlModel: OrderMysql,
        op: "create",
        data: {
          studentId,
          status: price > 0 ? "pending" : "paid",
          totalCents: price,
          currency,
          provider: "manual",
          updatedAtLocal: new Date(),
        },
        outboxModel: OutboxSqlite,
      });

      // 2) OrderItem
      await performOperation({
        modelName: "OrderItem",
        sqliteModel: OrderItemSqlite,
        mysqlModel: OrderItemMysql,
        op: "create",
        data: {
          orderId: order.id,
          itemType: "COURSE",
          itemId: course.id,
          title: course.title,
          priceCents: price,
        },
        outboxModel: OutboxSqlite,
      });

      // 3) Payment (pending/manual)
      const payment = await performOperation({
        modelName: "Payment",
        sqliteModel: PaymentSqlite,
        mysqlModel: PaymentMysql,
        op: "create",
        data: {
          orderId: order.id,
          amountCents: price,
          currency,
          method: "manual_cash",
          status: price > 0 ? "pending" : "paid",
          provider: "manual",
          updatedAtLocal: new Date(),
        },
        outboxModel: OutboxSqlite,
      });

      // FREE course? grant immediately
      if (price === 0) {
        await performOperation({
          modelName: "Enrollment",
          sqliteModel: EnrollmentSqlite,
          mysqlModel: EnrollmentMysql,
          op: "create",
          data: {
            studentId,
            courseId,
            source: "purchase",
            startsAt: new Date(),
          },
          outboxModel: OutboxSqlite,
        });
      }

      return res.json({
        success: true,
        data: { orderId: order.id, paymentId: payment.id },
        nextAction: price > 0 ? "confirm-payment" : "access-granted",
      });
    } catch (e) {
      next(e);
    }
  });

  // ---------------------------------
  // 2) دفع فوري من المحفظة (COURSE)
  // ---------------------------------
  router.post("/pay-with-wallet", async (req, res, next) => {
    try {
      const studentId = req.user?.id;
      const courseId = Number(req.body?.courseId);
      if (!studentId || !courseId) {
        return res
          .status(400)
          .json({ success: false, message: "بيانات ناقصة" });
      }

      // ✅ 0) منع الشراء المكرر
      const accessInfo = await canAccessCourse({
        models,
        studentId,
        courseId,
      });
      if (accessInfo.ok) {
        return res.status(409).json({
          success: false,
          message: "أنت بالفعل تمتلك هذا الكورس",
          reason: accessInfo.via || "ALREADY_OWNED",
        });
      }

      // 1) هات الكورس
      const course = await CourseSqlite.findByPk(courseId);
      if (!course || course.isDeleted) {
        return res
          .status(404)
          .json({ success: false, message: "الكورس غير موجود" });
      }

      const priceCents = course.isFree ? 0 : course.priceCents || 0;
      const currency = "EGP";

      // 2) هات المحفظة
      let wallet = await WalletSqlite.findOne({
        where: { studentId },
      });
      if (!wallet) {
        return res.status(400).json({
          success: false,
          message: "لا توجد محفظة لهذا الطالب (اشحن أولاً)",
        });
      }

      // 3) تأكد من الرصيد
      if (priceCents > 0 && wallet.balanceCents < priceCents) {
        return res.status(400).json({
          success: false,
          message: "الرصيد غير كافٍ في المحفظة",
          walletBalanceCents: wallet.balanceCents,
          requiredCents: priceCents,
        });
      }

      // 4) أنشئ Order بحالة paid
      const order = await performOperation({
        modelName: "Order",
        sqliteModel: OrderSqlite,
        mysqlModel: OrderMysql,
        op: "create",
        data: {
          studentId,
          status: "paid",
          totalCents: priceCents,
          currency,
          provider: "wallet_balance",
          updatedAtLocal: new Date(),
        },
        outboxModel: OutboxSqlite,
      });

      // 5) أنشئ OrderItem
      await performOperation({
        modelName: "OrderItem",
        sqliteModel: OrderItemSqlite,
        mysqlModel: OrderItemMysql,
        op: "create",
        data: {
          orderId: order.id,
          itemType: "COURSE",
          itemId: course.id,
          title: course.title,
          priceCents: priceCents,
        },
        outboxModel: OutboxSqlite,
      });

      // 6) سجل Payment مدفوع بالمحفظة
      const payment = await performOperation({
        modelName: "Payment",
        sqliteModel: PaymentSqlite,
        mysqlModel: PaymentMysql,
        op: "create",
        data: {
          orderId: order.id,
          amountCents: priceCents,
          currency,
          method: "wallet_balance",
          status: "paid",
          provider: "wallet_balance",
          updatedAtLocal: new Date(),
        },
        outboxModel: OutboxSqlite,
      });

      // 7) خصم من المحفظة + WalletTx
      if (priceCents > 0) {
        const newBalance = wallet.balanceCents - priceCents;

        await performOperation({
          modelName: "Wallet",
          sqliteModel: WalletSqlite,
          mysqlModel: WalletMysql,
          op: "update",
          where: { id: wallet.id },
          data: {
            balanceCents: newBalance,
            updatedAtLocal: new Date(),
          },
          outboxModel: OutboxSqlite,
        });

        await performOperation({
          modelName: "WalletTx",
          sqliteModel: WalletTxSqlite,
          mysqlModel: WalletTxMysql,
          op: "create",
          data: {
            walletId: wallet.id,
            type: "DEBIT",
            reason: "COURSE_PURCHASE",
            amountCents: priceCents,
            refType: "ORDER",
            refId: order.id,
            createdAt: new Date(),
          },
          outboxModel: OutboxSqlite,
        });

        wallet.balanceCents = newBalance;
      }

      // 8) فعّل الـ Enrollment فورًا
      await performOperation({
        modelName: "Enrollment",
        sqliteModel: EnrollmentSqlite,
        mysqlModel: EnrollmentMysql,
        op: "create",
        data: {
          studentId,
          courseId,
          source: "purchase",
          startsAt: new Date(),
        },
        outboxModel: OutboxSqlite,
      });

      return res.json({
        success: true,
        message: "تم الدفع وفتح الكورس",
        data: {
          orderId: order.id,
          paymentId: payment.id,
          newWalletBalanceCents: wallet.balanceCents,
        },
        nextAction: "access-granted",
      });
    } catch (e) {
      next(e);
    }
  });

  // 2-bis) دفع فوري من المحفظة لخطة اشتراك (PLAN)
  router.post("/pay-with-wallet/plan", async (req, res, next) => {
    try {
      const studentId = req.user?.id;
      const planId = Number(req.body?.planId);
      if (!studentId || !planId) {
        return res.status(400).json({ success: false, message: "بيانات ناقصة" });
      }

      const plan = await PlanSqlite.findByPk(planId);
      if (!plan || !plan.isActive) {
        return res.status(404).json({ success: false, message: "الخطة غير متاحة" });
      }

      // ✅ منع شراء نفس الخطة لو عنده اشتراك نشط
      const alreadySub = await hasActivePlanSubscription(studentId, plan.id);
      if (alreadySub) {
        return res.status(409).json({
          success: false,
          message: "لديك اشتراك نشط بالفعل في هذه الباقة",
          reason: "ALREADY_SUBSCRIBED",
        });
      }

      // هات المحفظة
      let wallet = await WalletSqlite.findOne({ where: { studentId } });
      if (!wallet) {
        return res.status(400).json({ success: false, message: "لا توجد محفظة لهذا الطالب (اشحن أولاً)" });
      }

      const priceCents = plan.priceCents || 0;
      const currency = plan.currency || "EGP";

      if (priceCents > 0 && wallet.balanceCents < priceCents) {
        return res.status(400).json({
          success: false,
          message: "الرصيد غير كافٍ في المحفظة",
          walletBalanceCents: wallet.balanceCents,
          requiredCents: priceCents,
        });
      }

      // Order مدفوع
      const order = await performOperation({
        modelName: "Order",
        sqliteModel: OrderSqlite,
        mysqlModel: OrderMysql,
        op: "create",
        data: {
          studentId,
          status: "paid",
          totalCents: priceCents,
          currency,
          provider: "wallet_balance",
          updatedAtLocal: new Date(),
        },
        outboxModel: OutboxSqlite,
      });

      // OrderItem: PLAN
      await performOperation({
        modelName: "OrderItem",
        sqliteModel: OrderItemSqlite,
        mysqlModel: OrderItemMysql,
        op: "create",
        data: {
          orderId: order.id,
          itemType: "PLAN",
          itemId: plan.id,
          title: plan.name,
          priceCents: priceCents,
        },
        outboxModel: OutboxSqlite,
      });

      // Payment
      const payment = await performOperation({
        modelName: "Payment",
        sqliteModel: PaymentSqlite,
        mysqlModel: PaymentMysql,
        op: "create",
        data: {
          orderId: order.id,
          amountCents: priceCents,
          currency,
          method: "wallet_balance",
          status: "paid",
          provider: "wallet_balance",
          updatedAtLocal: new Date(),
        },
        outboxModel: OutboxSqlite,
      });

      // خصم من المحفظة + WalletTx
      if (priceCents > 0) {
        const newBalance = wallet.balanceCents - priceCents;

        await performOperation({
          modelName: "Wallet",
          sqliteModel: WalletSqlite,
          mysqlModel: WalletMysql,
          op: "update",
          where: { id: wallet.id },
          data: { balanceCents: newBalance, updatedAtLocal: new Date() },
          outboxModel: OutboxSqlite,
        });

        await performOperation({
          modelName: "WalletTx",
          sqliteModel: WalletTxSqlite,
          mysqlModel: WalletTxMysql,
          op: "create",
          data: {
            walletId: wallet.id,
            type: "DEBIT",
            reason: "PLAN_SUBSCRIPTION",
            amountCents: priceCents,
            refType: "ORDER",
            refId: order.id,
            createdAt: new Date(),
          },
          outboxModel: OutboxSqlite,
        });

        wallet.balanceCents = newBalance;
      }

      // إنشاء Subscription فوري
      const startsAt = new Date();
      const endsAt = new Date(startsAt.getTime() + (plan.periodDays || 30) * 86400_000);

      await performOperation({
        modelName: "Subscription",
        sqliteModel: SubscriptionSqlite,
        mysqlModel: SubscriptionMysql,
        op: "create",
        data: {
          studentId,
          planId: plan.id,
          status: "active",
          startsAt,
          endsAt,
          orderId: order.id,
          updatedAtLocal: new Date(),
        },
        outboxModel: OutboxSqlite,
      });

      return res.json({
        success: true,
        message: "تم الدفع من المحفظة وتفعيل الاشتراك",
        data: { orderId: order.id, paymentId: payment.id, newWalletBalanceCents: wallet.balanceCents },
        nextAction: "access-granted",
      });
    } catch (e) {
      next(e);
    }
  });

  // ---------------------------------
  // 3) تأكيد دفع يدوي (أدمن/سنتر)
  // ---------------------------------
  router.post("/manual/confirm", async (req, res, next) => {
    try {
      const orderId = Number(req.body?.orderId);
      if (!orderId) {
        return res
          .status(400)
          .json({ success: false, message: "orderId مطلوب" });
      }

      const order = await OrderSqlite.findByPk(orderId);
      if (!order) {
        return res
          .status(404)
          .json({ success: false, message: "الطلب غير موجود" });
      }

      // mark payment + order as paid
      await performOperation({
        modelName: "Payment",
        sqliteModel: PaymentSqlite,
        mysqlModel: PaymentMysql,
        op: "update",
        where: { orderId },
        data: { status: "paid", updatedAtLocal: new Date() },
        outboxModel: OutboxSqlite,
      });

      await performOperation({
        modelName: "Order",
        sqliteModel: OrderSqlite,
        mysqlModel: OrderMysql,
        op: "update",
        where: { id: orderId },
        data: { status: "paid", updatedAtLocal: new Date() },
        outboxModel: OutboxSqlite,
      });

      //  تأكيد الدفع اليدوي (أدمن/سنتر)   فعّل Enrollment لكل كورس في الطلب
      const items = await OrderItemSqlite.findAll({
        where: { orderId, itemType: "COURSE" },
      });

      for (const it of items) {
        await performOperation({
          modelName: "Enrollment",
          sqliteModel: EnrollmentSqlite,
          mysqlModel: EnrollmentMysql,
          op: "create",
          data: {
            studentId: order.studentId,
            courseId: it.itemId,
            source: "purchase",
            startsAt: new Date(),
          },
          outboxModel: OutboxSqlite,
        });
      }

      return res.json({
        success: true,
        message: "تم تأكيد الدفع ومنح الوصول",
      });
    } catch (e) {
      next(e);
    }
  });

  // ---------------------------------
  // 4) الاشتراك في خطة (plan) manual
  // ---------------------------------
  router.post("/subscribe", async (req, res, next) => {
    try {
      const studentId = req.user?.id;
      const planId = Number(req.body?.planId);
      if (!studentId || !planId) {
        return res
          .status(400)
          .json({ success: false, message: "بيانات ناقصة" });
      }

      const plan = await PlanSqlite.findByPk(planId);
      if (!plan || !plan.isActive) {
        return res
          .status(404)
          .json({ success: false, message: "الخطة غير متاحة" });
      }

      // ✅ منع اشتراك مكرر في نفس الخطة
      const alreadySub = await hasActivePlanSubscription(studentId, plan.id);
      if (alreadySub) {
        return res.status(409).json({
          success: false,
          message: "لديك اشتراك نشط بالفعل في هذه الباقة",
          reason: "ALREADY_SUBSCRIBED",
        });
      }

      const price = plan.priceCents || 0;
      const currency = plan.currency || "EGP";

      const order = await performOperation({
        modelName: "Order",
        sqliteModel: OrderSqlite,
        mysqlModel: OrderMysql,
        op: "create",
        data: {
          studentId,
          status: price > 0 ? "pending" : "paid",
          totalCents: price,
          currency,
          provider: "manual",
          updatedAtLocal: new Date(),
        },
        outboxModel: OutboxSqlite,
      });

      await performOperation({
        modelName: "OrderItem",
        sqliteModel: OrderItemSqlite,
        mysqlModel: OrderItemMysql,
        op: "create",
        data: {
          orderId: order.id,
          itemType: "PLAN",
          itemId: plan.id,
          title: plan.name,
          priceCents: price,
        },
        outboxModel: OutboxSqlite,
      });

      const payment = await performOperation({
        modelName: "Payment",
        sqliteModel: PaymentSqlite,
        mysqlModel: PaymentMysql,
        op: "create",
        data: {
          orderId: order.id,
          amountCents: price,
          currency,
          method: "manual_cash",
          status: price > 0 ? "pending" : "paid",
          provider: "manual",
          updatedAtLocal: new Date(),
        },
        outboxModel: OutboxSqlite,
      });

      // مجاني → فعّل الاشتراك فورًا
      if (price === 0) {
        const startsAt = new Date();
        const endsAt = new Date(
          startsAt.getTime() +
            (plan.periodDays || 30) * 24 * 60 * 60 * 1000
        );

        await performOperation({
          modelName: "Subscription",
          sqliteModel: SubscriptionSqlite,
          mysqlModel: SubscriptionMysql,
          op: "create",
          data: {
            studentId,
            planId: plan.id,
            status: "active",
            startsAt,
            endsAt,
            orderId: order.id,
            updatedAtLocal: new Date(),
          },
          outboxModel: OutboxSqlite,
        });
      }

      return res.json({
        success: true,
        data: { orderId: order.id, paymentId: payment.id },
        nextAction: price > 0 ? "confirm-payment" : "access-granted",
      });
    } catch (e) {
      next(e);
    }
  });

  // ---------------------------------
  // 5) تأكيد يدوي لاشتراك (أدمن)
  // ---------------------------------
  router.post("/manual/confirm-subscription", async (req, res, next) => {
    try {
      const orderId = Number(req.body?.orderId);
      if (!orderId) {
        return res
          .status(400)
          .json({ success: false, message: "orderId مطلوب" });
      }

      const order = await OrderSqlite.findByPk(orderId);
      if (!order) {
        return res
          .status(404)
          .json({ success: false, message: "الطلب غير موجود" });
      }

      const item = await OrderItemSqlite.findOne({
        where: { orderId, itemType: "PLAN" },
      });
      if (!item) {
        return res.status(400).json({
          success: false,
          message: "العنصر ليس خطة اشتراك",
        });
      }

      const plan = await PlanSqlite.findByPk(item.itemId);
      if (!plan) {
        return res
          .status(404)
          .json({ success: false, message: "الخطة غير موجودة" });
      }

      // mark paid
      await performOperation({
        modelName: "Payment",
        sqliteModel: PaymentSqlite,
        mysqlModel: PaymentMysql,
        op: "update",
        where: { orderId },
        data: { status: "paid", updatedAtLocal: new Date() },
        outboxModel: OutboxSqlite,
      });
      await performOperation({
        modelName: "Order",
        sqliteModel: OrderSqlite,
        mysqlModel: OrderMysql,
        op: "update",
        where: { id: orderId },
        data: { status: "paid", updatedAtLocal: new Date() },
        outboxModel: OutboxSqlite,
      });

      const startsAt = new Date();
      const endsAt = new Date(
        startsAt.getTime() +
          (plan.periodDays || 30) * 24 * 60 * 60 * 1000
      );

      await performOperation({
        modelName: "Subscription",
        sqliteModel: SubscriptionSqlite,
        mysqlModel: SubscriptionMysql,
        op: "create",
        data: {
          studentId: order.studentId,
          planId: plan.id,
          status: "active",
          startsAt,
          endsAt,
          orderId,
          updatedAtLocal: new Date(),
        },
        outboxModel: OutboxSqlite,
      });

      return res.json({
        success: true,
        message: "تم تفعيل الاشتراك",
      });
    } catch (e) {
      next(e);
    }
  });

  // --- استعلام صلاحية الدخول لكورس ---
  router.get('/access/course/:id', async (req, res, next) => {
    try {
      const studentId = req.user?.id;
      const courseId = Number(req.params.id);
      if (!studentId || !courseId) {
        return res.status(400).json({ success: false, message: 'بيانات ناقصة' });
      }

      const result = await hasEntitlement({ models, studentId, resource: { type: 'COURSE', id: courseId } });
      return res.json({ success: true, data: result });
    } catch (e) { next(e); }
  });

  // --- استهلاك كورس من باقة QUOTA ---
  router.post('/subscriptions/claim-course', async (req, res, next) => {
    try {
      const studentId = req.user?.id;
      const courseId = Number(req.body?.courseId);
      if (!studentId || !courseId) {
        return res.status(400).json({ success: false, message: 'بيانات ناقصة' });
      }

      const course = await CourseSqlite.findByPk(courseId);
      if (!course || course.isDeleted) {
        return res.status(404).json({ success: false, message: 'الكورس غير موجود' });
      }

      const access = await hasEntitlement({ models, studentId, resource: { type: 'COURSE', id: courseId } });

      if (access.ok) return res.json({ success: true, message: 'لديك وصول بالفعل', data: access });

      if (access.via !== 'subscription_quota_eligible' || access.planKind !== 'QUOTA') {
        return res.status(403).json({ success: false, message: 'غير مؤهل للاستهلاك من باقة' });
      }

      const subId = access.subscriptionId;
      const planId = access.planId;

      const sub = await SubscriptionSqlite.findByPk(subId);
      const plan = await PlanSqlite.findByPk(planId);
      if (!sub || !plan || String(plan.kind) !== 'QUOTA') {
        return res.status(400).json({ success: false, message: 'الاشتراك غير صالح للاستهلاك' });
      }

      const now = Date.now();
      const s = sub.startsAt ? new Date(sub.startsAt).getTime() : 0;
      const e = sub.endsAt   ? new Date(sub.endsAt).getTime()   : 0;
      if (!(s <= now && now <= e)) {
        return res.status(400).json({ success: false, message: 'الاشتراك غير نشط' });
      }

      const count = await SubscriptionConsumptionSqlite.count({ where: { subscriptionId: sub.id } });
      if (count >= (plan.quotaCount || 0)) {
        return res.status(400).json({ success: false, message: 'تم استنفاد الحصة لهذه الباقة' });
      }

      await performOperation({
        modelName: 'SubscriptionConsumption',
        sqliteModel: SubscriptionConsumptionSqlite,
        mysqlModel: SubscriptionConsumptionMysql,
        op: 'create',
        data: { subscriptionId: sub.id, courseId, consumedAt: new Date() },
        outboxModel: OutboxSqlite,
      });

      return res.json({ success: true, message: 'تم استهلاك الكورس من باقة الحصص', data: { subscriptionId: sub.id, courseId } });
    } catch (e) { next(e); }
  });

  // --- اشتراكات الطالب في الباقات (للـ UI) ---
  router.get('/subscriptions/my-plans', async (req, res, next) => {
    try {
      const studentId = req.user?.id;
      if (!studentId) {
        return res.status(401).json({ success: false, message: 'غير مصرح' });
      }

      const subs = await SubscriptionSqlite.findAll({
        where: { studentId },
        order: [['startsAt', 'DESC']],
      });

      const now = Date.now();

      const data = subs.map((s) => {
        const startsAt = s.startsAt ? new Date(s.startsAt) : null;
        const endsAt = s.endsAt ? new Date(s.endsAt) : null;

        let activeNow = String(s.status) === 'active';
        if (activeNow && startsAt && endsAt) {
          const sm = startsAt.getTime();
          const em = endsAt.getTime();
          activeNow = sm <= now && now <= em;
        }

        return {
          id: s.id,
          planId: s.planId,
          status: s.status,
          startsAt,
          endsAt,
          activeNow,
        };
      });

      return res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  });



    // ---------------------------------
  // 6) الكورسات اللي الطالب اشتراها (مشترياتي)
  // ---------------------------------
  router.get('/my-courses', async (req, res, next) => {
    try {
      const studentId = req.user?.id;
      if (!studentId) {
        return res.status(401).json({
          success: false,
          message: 'غير مصرح',
        });
      }

      // نجيب كل الطلبات المدفوعه للطالب (حد أقصى 100 طلب)
      const orders = await OrderSqlite.findAll({
        where: { studentId, status: 'paid' },
        order: [['updatedAtLocal', 'DESC']],
        limit: 100,
      });

      if (!orders.length) {
        return res.json({
          success: true,
          data: { items: [] },
        });
      }

      const orderIds = orders.map((o) => o.id);

      // العناصر اللي نوعها COURSE
      const items = await OrderItemSqlite.findAll({
        where: {
          orderId: orderIds,
          itemType: 'COURSE',
        },
        order: [['id', 'DESC']],
      });

      if (!items.length) {
        return res.json({
          success: true,
          data: { items: [] },
        });
      }

      // الكورسات المستخدمة في الـ items
      const courseIds = Array.from(
        new Set(items.map((it) => it.itemId).filter(Boolean))
      );

      const courses = await CourseSqlite.findAll({
        where: { id: courseIds },
      });

      const courseMap = new Map();
      for (const c of courses) {
        courseMap.set(c.id, c);
      }

      const orderMap = new Map();
      for (const o of orders) {
        orderMap.set(o.id, o);
      }

      const result = [];
      for (const it of items) {
        const course = courseMap.get(it.itemId);
        const order = orderMap.get(it.orderId);

        // لو الكورس اتحذف / مش موجود → نتجاهله
        if (!course || course.isDeleted) continue;

        const purchasedAt =
          order?.updatedAtLocal ||
          order?.createdAt ||
          it.createdAt ||
          new Date();

        const priceCents = Number(it.priceCents) || 0;
        const priceEGP = Math.round(priceCents / 100);

        result.push({
          courseId: course.id,
          title: course.title,
          coverUrl: course.coverImageUrl || null, // لو عندك حقل للصورة
          priceCents,
          priceEGP,
          purchasedAt,
        });
      }

      return res.json({
        success: true,
        data: { items: result },
      });
    } catch (e) {
      next(e);
    }
  });

  return router;
}

export default createCheckoutRouter;
