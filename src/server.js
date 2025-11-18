// src/server.js
import { ENV } from "./config/env.js";
import { initApp } from "./app.js";
import { initDatabases, getSqlite, getMysql } from "./config/db.js";
import { registerModels } from "./models/index.js";
import { buildModelsMap } from "./stores.js";
import { startPeriodicSync } from "./services/sync-worker.js";

const PORT = Number(process.env.PORT || 3000);

/**
 * Sync آمن لِـ SQLite — بدون alter
 * نضبط ترتيب إنشاء الجداول بحيث الـ FK-critical تبقى موجودة قبل اللي بيعتمدوا عليها.
 */
async function syncSqliteSafely(models) {
  // بناخد كل الموديلات اللي بتنتهي بـ Sqlite
  const entries = Object.entries(models).filter(([key]) =>
    key.endsWith("Sqlite")
  );
  const map = Object.fromEntries(entries);

  // ترتيب مبدئي منطقي:
  // 1. جداول أساسية ومستقلة (Users, Students, Centers...)
  // 2. جداول المحتوى (Courses, Lessons...)
  // 3. جداول الاشتراكات والفلوس
  // 4. جداول attendance/override/progress اللي بتشير للطالب/الدرس
  // 5. الباقي
  const ordered = [
    // أنظمة داخليّة
    "OutboxSqlite",
    "PasswordResetSqlite",

    // الأساسيات
    "UserSqlite",
    "CenterSqlite",
    "StudentSqlite",
    "DeviceSessionSqlite",
    "NotificationSqlite",

    // كورسات / دروس
    "CourseSqlite",
    "LessonSqlite",
    "MapBankSqlite",
    "MapBankItemSqlite",

    // أسئلة المجتمع و FAQ و SelfQuiz (مش critical للـ access logic بس نضيفها)
    "CommunityQuestionSqlite",
    "CommunityAnswerSqlite",
    "FaqSqlite",
    "SelfQuizChapterSqlite",
    "SelfQuizQuestionSqlite",
    "SelfQuizChoiceSqlite",
    "SelfQuizCompletionSqlite",

    // فلوس / اشتراكات / شراء
    "PlanSqlite",
    "SubscriptionSqlite",
     "SubscriptionConsumptionSqlite",
    "OrderSqlite",
    "OrderItemSqlite",
    "PaymentSqlite",
    "EnrollmentSqlite",
    "WalletSqlite",
    "WalletTxSqlite",
    "TopupSqlite",
    "VoucherSqlite",

    // الجداول الجديدة المتعلقة بالمنطق التربوي
    "StudentAttendanceSqlite",
    "StudentLessonOverrideSqlite",
    "StudentLessonProgressSqlite",


        // QR Snippets + Student QR Views
    "QrSnippetSqlite",
    "StudentQrViewSqlite",

        "StudentCertificateSqlite",




  "TrueFalseQuestionSqlite",
  "McqRushQuestionSqlite",
  "FastAnswerQuestionSqlite",
  "FlipCardCountrySqlite",
  "FlipCardQuestionSqlite",
  "BattleFriendQuestionSqlite",
  "GameSessionSqlite",

];

  // sync بالترتيب المحدد
  for (const key of ordered) {
    const model = map[key];
    if (model && typeof model.sync === "function") {
      await model.sync(); // مهم: بدون alter على SQLite
    }
  }

  // أي موديلات SQLite إضافية غير مذكورة في القائمة (احتياطي)
  for (const [key, model] of entries) {
    if (!ordered.includes(key) && typeof model.sync === "function") {
      await model.sync();
    }
  }
}

/**
 * Sync لِـ MySQL — alter مسموح
 * هنا نسمح لـ Sequelize إنه يعدّل الأعمدة.
 */
async function syncMysqlAlter(models) {
  try {
    const mysql = getMysql();
    await mysql.sync({ alter: true });
  } catch (e) {
    console.warn("⚠️ MySQL sync skipped/failed:", e.message);
  }
}

const start = async () => {
  try {
    // 1) Databases
    await initDatabases();

    // 2) Models
    const models = registerModels();

    // 3) SQLite sync (بدون alter)
    await syncSqliteSafely(models);

    // 4) MySQL sync (يسمح alter)
    await syncMysqlAlter(models);

    // 5) Build map (لو محتاج للـ replicator/worker)
    const modelsMap = buildModelsMap(models);

    // 6) App
    const app = await initApp(models, modelsMap);

    // 7) Worker
    startPeriodicSync(modelsMap, ENV.SYNC_INTERVAL_MS);

    app.listen(PORT, () => {
      console.log(`🚀 etqan-replicator listening on port ${PORT}`);
    });
  } catch (e) {
    console.error("❌ Failed to start:", e);
    process.exit(1);
  }
};

start();
