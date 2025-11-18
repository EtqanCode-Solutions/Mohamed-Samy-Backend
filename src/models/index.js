// src/models/index.js
import { getSqlite, getMysql } from "../config/db.js";

// الأساسيات
import { defineUserModel } from "./user.model.js";
import { defineOutboxModel } from "./outbox.js";
import { defineClientModel } from "./example.client.js";
import { defineStudentModel } from "./student.model.js";
import { defineStudentCertificateModel } from './student-certificate.model.js';

import { definePasswordResetModel } from "./password-reset.model.js";

// كورسات/محاضرات
import { defineCourseModel } from "./course.model.js";
import { defineLessonModel } from "./lesson.model.js";

// شراء/اشتراك/وصول
import { definePlanModel } from "./plan.model.js";
import { defineSubscriptionModel } from "./subscription.model.js";
import { defineOrderModel } from "./order.model.js";
import { defineOrderItemModel } from "./order-item.model.js";
import { definePaymentModel } from "./payment.model.js";
import { defineEnrollmentModel } from "./enrollment.model.js";

// المحفظة/الشحن/الفاوتشر
import { defineWalletModel } from "./wallet.model.js";
import { defineWalletTxModel } from "./wallet-tx.model.js";
import { defineTopupModel } from "./topup.model.js";
import { defineVoucherModel } from "./voucher.model.js";

// Community
import { defineCommunityQuestionModel } from "./community.question.model.js";
import { defineCommunityAnswerModel } from "./community.answer.model.js";

// FAQ
import { defineFaqModel } from "./faq.model.js";

// Self-Quiz
import { defineSelfQuizChapterModel } from "./selfquiz.chapter.model.js";
import { defineSelfQuizQuestionModel } from "./selfquiz.question.model.js";
import { defineSelfQuizChoiceModel } from "./selfquiz.choice.model.js";
import { defineSelfQuizCompletionModel } from "./selfquiz.completion.model.js";

// Map Bank
import { defineMapBankModel } from "./mapbank.bank.model.js";
import { defineMapBankItemModel } from "./mapbank.item.model.js";

// Device / Centers
import { defineDeviceSessionModel } from "./device-session.model.js";
import { defineCenterModel } from "./center.model.js";

// NEW: Attendance / Override / Progress
import { defineStudentAttendanceModel } from "./student-attendance.model.js";
import { defineStudentLessonOverrideModel } from "./student-lesson-override.model.js";
import { defineStudentLessonProgressModel } from "./student-lesson-progress.model.js";

import { defineSubscriptionConsumptionModel } from './subscription-consumption.model.js';


import { defineExamModel } from "./exam.model.js";
import { defineExamQuestionModel } from "./exam-question.model.js";
import { defineExamAttemptModel } from "./exam-attempt.model.js";


// NEW: QR Snippets + Student QR Views
import { defineQrSnippetModel } from "./qr-snippet.model.js";
import { defineStudentQrViewModel } from "./student-qr-view.model.js";



import { defineNotificationModel } from "./notification.model.js";



import {
  defineTrueFalseQuestionModel,
  defineMcqRushQuestionModel,
  defineFastAnswerQuestionModel,
  defineFlipCardCountryModel,
  defineFlipCardQuestionModel,
  defineBattleFriendQuestionModel,
  defineGameSessionModel,
} from "./games.models.js";



export function registerModels() {
  const sqlite = getSqlite();
  const mysql = getMysql();

  // ===== Users
  const UserSqlite = defineUserModel(sqlite, "users");
  const UserMysql  = defineUserModel(mysql,  "users");

  // ===== SQLite only
  const OutboxSqlite        = defineOutboxModel(sqlite);
  const PasswordResetSqlite = definePasswordResetModel(sqlite);

  // ===== مزدوج (SQLite + MySQL)
  const ClientSqlite  = defineClientModel(sqlite);
  const ClientMysql   = defineClientModel(mysql);

  const StudentSqlite = defineStudentModel(sqlite);
  const StudentMysql  = defineStudentModel(mysql);



    const StudentCertificateSqlite = defineStudentCertificateModel(sqlite);
  const StudentCertificateMysql  = mysql
    ? defineStudentCertificateModel(mysql)
    : null;



  const CourseSqlite  = defineCourseModel(sqlite, "courses");
  const LessonSqlite  = defineLessonModel(sqlite, "lessons");
  const CourseMysql   = defineCourseModel(mysql,  "courses");
  const LessonMysql   = defineLessonModel(mysql,  "lessons");

  const PlanSqlite         = definePlanModel(sqlite, "plans");
  const SubscriptionSqlite = defineSubscriptionModel(sqlite, "subscriptions");
  const PlanMysql          = definePlanModel(mysql,  "plans");
  const SubscriptionMysql  = defineSubscriptionModel(mysql,  "subscriptions");

  const OrderSqlite     = defineOrderModel(sqlite, "orders");
  const OrderItemSqlite = defineOrderItemModel(sqlite, "order_items");
  const PaymentSqlite   = definePaymentModel(sqlite, "payments");

  const OrderMysql     = defineOrderModel(mysql, "orders");
  const OrderItemMysql = defineOrderItemModel(mysql, "order_items");
  const PaymentMysql   = definePaymentModel(mysql, "payments");

  const EnrollmentSqlite = defineEnrollmentModel(sqlite, "enrollments");
  const EnrollmentMysql  = defineEnrollmentModel(mysql,  "enrollments");

  const WalletSqlite   = defineWalletModel(sqlite, "wallets");
  const WalletTxSqlite = defineWalletTxModel(sqlite, "wallet_tx");
  const TopupSqlite    = defineTopupModel(sqlite, "topup_requests");
  const VoucherSqlite  = defineVoucherModel(sqlite, "vouchers");

  const WalletMysql   = defineWalletModel(mysql, "wallets");
  const WalletTxMysql = defineWalletTxModel(mysql, "wallet_tx");
  const TopupMysql    = defineTopupModel(mysql, "topup_requests");
  const VoucherMysql  = defineVoucherModel(mysql, "vouchers");


  const SubscriptionConsumptionSqlite = defineSubscriptionConsumptionModel(sqlite, 'subscription_consumptions');
const SubscriptionConsumptionMysql  = defineSubscriptionConsumptionModel(mysql,  'subscription_consumptions')

  // Community
  const CommunityQuestionSqlite = defineCommunityQuestionModel(sqlite);
  const CommunityAnswerSqlite   = defineCommunityAnswerModel(sqlite);
  const CommunityQuestionMysql  = defineCommunityQuestionModel(mysql);
  const CommunityAnswerMysql    = defineCommunityAnswerModel(mysql);

  // FAQ
  const FaqSqlite = defineFaqModel(sqlite, "faq_items");
  const FaqMysql  = defineFaqModel(mysql,  "faq_items");

  // Self-Quiz
  const SelfQuizChapterSqlite    = defineSelfQuizChapterModel(sqlite, "selfquiz_chapters");
  const SelfQuizQuestionSqlite   = defineSelfQuizQuestionModel(sqlite, "selfquiz_questions");
  const SelfQuizChoiceSqlite     = defineSelfQuizChoiceModel(sqlite, "selfquiz_choices");
  const SelfQuizCompletionSqlite = defineSelfQuizCompletionModel(sqlite, "selfquiz_completions");

  const SelfQuizChapterMysql    = defineSelfQuizChapterModel(mysql, "selfquiz_chapters");
  const SelfQuizQuestionMysql   = defineSelfQuizQuestionModel(mysql, "selfquiz_questions");
  const SelfQuizChoiceMysql     = defineSelfQuizChoiceModel(mysql, "selfquiz_choices");
  const SelfQuizCompletionMysql = defineSelfQuizCompletionModel(mysql, "selfquiz_completions");

  // Map Bank
  const MapBankSqlite     = defineMapBankModel(sqlite, "map_banks");
  const MapBankItemSqlite = defineMapBankItemModel(sqlite, "map_bank_items");
  const MapBankMysql      = defineMapBankModel(mysql,  "map_banks");
  const MapBankItemMysql  = defineMapBankItemModel(mysql,  "map_bank_items");

  // Device / Centers
  const DeviceSessionSqlite = defineDeviceSessionModel(sqlite, "device_sessions");
  const DeviceSessionMysql  = defineDeviceSessionModel(mysql,  "device_sessions");

  const CenterSqlite = defineCenterModel(sqlite, "centers");
  const CenterMysql  = defineCenterModel(mysql,  "centers");

  // NEW: Attendance / Override / Progress
  const StudentAttendanceSqlite      = defineStudentAttendanceModel(sqlite, "student_attendance");
  const StudentAttendanceMysql       = defineStudentAttendanceModel(mysql,  "student_attendance");

  const StudentLessonOverrideSqlite  = defineStudentLessonOverrideModel(sqlite, "student_lesson_overrides");
  const StudentLessonOverrideMysql   = defineStudentLessonOverrideModel(mysql,  "student_lesson_overrides");

  const StudentLessonProgressSqlite  = defineStudentLessonProgressModel(sqlite, "student_lesson_progress");
  const StudentLessonProgressMysql   = defineStudentLessonProgressModel(mysql,  "student_lesson_progress");


  const ExamSqlite          = defineExamModel(sqlite, 'exams');
const ExamQuestionSqlite  = defineExamQuestionModel(sqlite, 'exam_questions');
const ExamAttemptSqlite   = defineExamAttemptModel(sqlite, 'exam_attempts');

const ExamMysql           = defineExamModel(mysql,  'exams');
const ExamQuestionMysql   = defineExamQuestionModel(mysql,  'exam_questions');
const ExamAttemptMysql    = defineExamAttemptModel(mysql,  'exam_attempts');






// ========= موديلات الألعاب (SQLite + MySQL) =========
  const TrueFalseQuestionSqlite = defineTrueFalseQuestionModel(sqlite);
  const TrueFalseQuestionMysql = defineTrueFalseQuestionModel(mysql);

  const McqRushQuestionSqlite = defineMcqRushQuestionModel(sqlite);
  const McqRushQuestionMysql = defineMcqRushQuestionModel(mysql);

  const FastAnswerQuestionSqlite = defineFastAnswerQuestionModel(sqlite);
  const FastAnswerQuestionMysql = defineFastAnswerQuestionModel(mysql);

  const FlipCardCountrySqlite = defineFlipCardCountryModel(sqlite);
  const FlipCardCountryMysql = defineFlipCardCountryModel(mysql);

  const FlipCardQuestionSqlite = defineFlipCardQuestionModel(sqlite);
  const FlipCardQuestionMysql = defineFlipCardQuestionModel(mysql);

  const BattleFriendQuestionSqlite = defineBattleFriendQuestionModel(sqlite);
  const BattleFriendQuestionMysql = defineBattleFriendQuestionModel(mysql);

const GameSessionSqlite = defineGameSessionModel(sqlite);
const GameSessionMysql  = defineGameSessionModel(mysql);



  // NEW: QR Snippets + Student QR Views
  const QrSnippetSqlite = defineQrSnippetModel(sqlite, "qr_snippets");
  const QrSnippetMysql  = defineQrSnippetModel(mysql,  "qr_snippets");

  const StudentQrViewSqlite = defineStudentQrViewModel(sqlite, "student_qr_views");
  const StudentQrViewMysql  = defineStudentQrViewModel(mysql,  "student_qr_views");


    // NEW: Notifications
  const NotificationSqlite = defineNotificationModel(sqlite, "notifications");
  const NotificationMysql  = defineNotificationModel(mysql,  "notifications");






  // ============ العلاقات ============

  // Course ↔ Lesson
  CourseSqlite.hasMany(LessonSqlite, { foreignKey: "courseId", as: "lessons" });
  LessonSqlite.belongsTo(CourseSqlite, { foreignKey: "courseId", as: "course" });

  CourseMysql.hasMany(LessonMysql, { foreignKey: "courseId", as: "lessons" });
  LessonMysql.belongsTo(CourseMysql, { foreignKey: "courseId", as: "course" });

  // Lesson self-association (محاضرة ↔ واجباتها)
  LessonSqlite.hasMany(LessonSqlite, {
    foreignKey: "parentLessonId",
    as: "homeworks",
  });
  LessonSqlite.belongsTo(LessonSqlite, {
    foreignKey: "parentLessonId",
    as: "parentLesson",
  });

  LessonMysql.hasMany(LessonMysql, {
    foreignKey: "parentLessonId",
    as: "homeworks",
  });
  LessonMysql.belongsTo(LessonMysql, {
    foreignKey: "parentLessonId",
    as: "parentLesson",
  });

  // Orders ↔ Items/Payments
  OrderSqlite.hasMany(OrderItemSqlite, { foreignKey: "orderId", as: "items" });
  OrderItemSqlite.belongsTo(OrderSqlite, { foreignKey: "orderId", as: "order" });
  OrderSqlite.hasMany(PaymentSqlite,   { foreignKey: "orderId", as: "payments" });
  PaymentSqlite.belongsTo(OrderSqlite, { foreignKey: "orderId", as: "order" });

  OrderMysql.hasMany(OrderItemMysql, { foreignKey: "orderId", as: "items" });
  OrderItemMysql.belongsTo(OrderMysql, { foreignKey: "orderId", as: "order" });
  OrderMysql.hasMany(PaymentMysql,   { foreignKey: "orderId", as: "payments" });
  PaymentMysql.belongsTo(OrderMysql, { foreignKey: "orderId", as: "order" });

  // Student ↔ Wallet
  StudentSqlite.hasOne(WalletSqlite, { foreignKey: "studentId", as: "wallet" });
  WalletSqlite.belongsTo(StudentSqlite, { foreignKey: "studentId", as: "student" });

  StudentMysql.hasOne(WalletMysql, { foreignKey: "studentId", as: "wallet" });
  WalletMysql.belongsTo(StudentMysql, { foreignKey: "studentId", as: "student" });

  // Wallet ↔ WalletTx
  WalletSqlite.hasMany(WalletTxSqlite, { foreignKey: "walletId", as: "transactions" });
  WalletTxSqlite.belongsTo(WalletSqlite, { foreignKey: "walletId", as: "wallet" });

  WalletMysql.hasMany(WalletTxMysql, { foreignKey: "walletId", as: "transactions" });
  WalletTxMysql.belongsTo(WalletMysql, { foreignKey: "walletId", as: "wallet" });

  // Student ↔ Topup
  StudentSqlite.hasMany(TopupSqlite, { foreignKey: "studentId", as: "topups" });
  TopupSqlite.belongsTo(StudentSqlite, { foreignKey: "studentId", as: "student" });

  StudentMysql.hasMany(TopupMysql, { foreignKey: "studentId", as: "topups" });
  TopupMysql.belongsTo(StudentMysql, { foreignKey: "studentId", as: "student" });

  // Community: Question ↔ Answers
  CommunityQuestionSqlite.hasMany(CommunityAnswerSqlite, {
    foreignKey: "questionId",
    as: "answers",
  });
  CommunityAnswerSqlite.belongsTo(CommunityQuestionSqlite, {
    foreignKey: "questionId",
    as: "question",
  });

  CommunityQuestionMysql.hasMany(CommunityAnswerMysql, {
    foreignKey: "questionId",
    as: "answers",
  });
  CommunityAnswerMysql.belongsTo(CommunityQuestionMysql, {
    foreignKey: "questionId",
    as: "question",
  });

  // Community: Question ↔ Student
  StudentSqlite.hasMany(CommunityQuestionSqlite, {
    foreignKey: "studentId",
    as: "questions",
  });
  CommunityQuestionSqlite.belongsTo(StudentSqlite, {
    foreignKey: "studentId",
    as: "student",
  });

  StudentMysql.hasMany(CommunityQuestionMysql, {
    foreignKey: "studentId",
    as: "questions",
  });
  CommunityQuestionMysql.belongsTo(StudentMysql, {
    foreignKey: "studentId",
    as: "student",
  });

  // Community: Answer ↔ User
  CommunityAnswerSqlite.belongsTo(UserSqlite, {
    foreignKey: "responderId",
    as: "responder",
  });
  CommunityAnswerMysql.belongsTo(UserMysql, {
    foreignKey: "responderId",
    as: "responder",
  });

  // Self-Quiz
  SelfQuizChapterSqlite.hasMany(SelfQuizQuestionSqlite, {
    foreignKey: "chapterId",
    as: "questions",
  });
  SelfQuizQuestionSqlite.belongsTo(SelfQuizChapterSqlite, {
    foreignKey: "chapterId",
    as: "chapter",
  });

  SelfQuizChapterMysql.hasMany(SelfQuizQuestionMysql, {
    foreignKey: "chapterId",
    as: "questions",
  });
  SelfQuizQuestionMysql.belongsTo(SelfQuizChapterMysql, {
    foreignKey: "chapterId",
    as: "chapter",
  });

  SelfQuizQuestionSqlite.hasMany(SelfQuizChoiceSqlite, {
    foreignKey: "questionId",
    as: "choices",
  });
  SelfQuizChoiceSqlite.belongsTo(SelfQuizQuestionSqlite, {
    foreignKey: "questionId",
    as: "question",
  });

  SelfQuizQuestionMysql.hasMany(SelfQuizChoiceMysql, {
    foreignKey: "questionId",
    as: "choices",
  });
  SelfQuizChoiceMysql.belongsTo(SelfQuizQuestionMysql, {
    foreignKey: "questionId",
    as: "question",
  });

  SelfQuizCompletionSqlite.belongsTo(StudentSqlite, {
    foreignKey: "studentId",
    as: "student",
  });
  StudentSqlite.hasMany(SelfQuizCompletionSqlite, {
    foreignKey: "studentId",
    as: "selfQuizCompletions",
  });

  SelfQuizCompletionSqlite.belongsTo(SelfQuizChapterSqlite, {
    foreignKey: "chapterId",
    as: "chapter",
  });
  SelfQuizChapterSqlite.hasMany(SelfQuizCompletionSqlite, {
    foreignKey: "chapterId",
    as: "completions",
  });

  SelfQuizCompletionMysql.belongsTo(StudentMysql, {
    foreignKey: "studentId",
    as: "student",
  });
  StudentMysql.hasMany(SelfQuizCompletionMysql, {
    foreignKey: "studentId",
    as: "selfQuizCompletions",
  });

  SelfQuizCompletionMysql.belongsTo(SelfQuizChapterMysql, {
    foreignKey: "chapterId",
    as: "chapter",
  });
  SelfQuizChapterMysql.hasMany(SelfQuizCompletionMysql, {
    foreignKey: "chapterId",
    as: "completions",
  });

  // MapBank ↔ MapBankItem
  MapBankSqlite.hasMany(MapBankItemSqlite, {
    foreignKey: "bankId",
    as: "items",
  });
  MapBankItemSqlite.belongsTo(MapBankSqlite, {
    foreignKey: "bankId",
    as: "bank",
  });

  MapBankMysql.hasMany(MapBankItemMysql, {
    foreignKey: "bankId",
    as: "items",
  });
  MapBankItemMysql.belongsTo(MapBankMysql, {
    foreignKey: "bankId",
    as: "bank",
  });

  // Student ↔ DeviceSession
  StudentSqlite.hasMany(DeviceSessionSqlite, {
    foreignKey: "studentId",
    as: "deviceSessions",
  });
  DeviceSessionSqlite.belongsTo(StudentSqlite, {
    foreignKey: "studentId",
    as: "student",
  });

  StudentMysql.hasMany(DeviceSessionMysql, {
    foreignKey: "studentId",
    as: "deviceSessions",
  });
  DeviceSessionMysql.belongsTo(StudentMysql, {
    foreignKey: "studentId",
    as: "student",
  });

  // Student ↔ Center
  StudentSqlite.belongsTo(CenterSqlite, {
    foreignKey: "centerId",
    as: "center",
  });
  CenterSqlite.hasMany(StudentSqlite, {
    foreignKey: "centerId",
    as: "students",
  });

  StudentMysql.belongsTo(CenterMysql, {
    foreignKey: "centerId",
    as: "center",
  });
  CenterMysql.hasMany(StudentMysql, {
    foreignKey: "centerId",
    as: "students",
  });



    // Student ↔ Notification
  StudentSqlite.hasMany(NotificationSqlite, {
    foreignKey: "studentId",
    as: "notifications",
  });
  NotificationSqlite.belongsTo(StudentSqlite, {
    foreignKey: "studentId",
    as: "student",
  });

  StudentMysql.hasMany(NotificationMysql, {
    foreignKey: "studentId",
    as: "notifications",
  });
  NotificationMysql.belongsTo(StudentMysql, {
    foreignKey: "studentId",
    as: "student",
  });





  // NEW ASSOCIATIONS
  // Attendance
  StudentSqlite.hasMany(StudentAttendanceSqlite, {
    foreignKey: "studentId",
    as: "attendances",
  });
  StudentAttendanceSqlite.belongsTo(StudentSqlite, {
    foreignKey: "studentId",
    as: "student",
  });
  LessonSqlite.hasMany(StudentAttendanceSqlite, {
    foreignKey: "lessonId",
    as: "attendances",
  });
  StudentAttendanceSqlite.belongsTo(LessonSqlite, {
    foreignKey: "lessonId",
    as: "lesson",
  });

  StudentMysql.hasMany(StudentAttendanceMysql, {
    foreignKey: "studentId",
    as: "attendances",
  });
  StudentAttendanceMysql.belongsTo(StudentMysql, {
    foreignKey: "studentId",
    as: "student",
  });
  LessonMysql.hasMany(StudentAttendanceMysql, {
    foreignKey: "lessonId",
    as: "attendances",
  });
  StudentAttendanceMysql.belongsTo(LessonMysql, {
    foreignKey: "lessonId",
    as: "lesson",
  });

  // Override
  StudentSqlite.hasMany(StudentLessonOverrideSqlite, {
    foreignKey: "studentId",
    as: "lessonOverrides",
  });
  StudentLessonOverrideSqlite.belongsTo(StudentSqlite, {
    foreignKey: "studentId",
    as: "student",
  });
  LessonSqlite.hasMany(StudentLessonOverrideSqlite, {
    foreignKey: "lessonId",
    as: "overrides",
  });
  StudentLessonOverrideSqlite.belongsTo(LessonSqlite, {
    foreignKey: "lessonId",
    as: "lesson",
  });

  StudentMysql.hasMany(StudentLessonOverrideMysql, {
    foreignKey: "studentId",
    as: "lessonOverrides",
  });
  StudentLessonOverrideMysql.belongsTo(StudentMysql, {
    foreignKey: "studentId",
    as: "student",
  });
  LessonMysql.hasMany(StudentLessonOverrideMysql, {
    foreignKey: "lessonId",
    as: "overrides",
  });
  StudentLessonOverrideMysql.belongsTo(LessonMysql, {
    foreignKey: "lessonId",
    as: "lesson",
  });

  // Progress
  StudentSqlite.hasMany(StudentLessonProgressSqlite, {
    foreignKey: "studentId",
    as: "lessonProgress",
  });
  StudentLessonProgressSqlite.belongsTo(StudentSqlite, {
    foreignKey: "studentId",
    as: "student",
  });
  LessonSqlite.hasMany(StudentLessonProgressSqlite, {
    foreignKey: "lessonId",
    as: "progress",
  });
  StudentLessonProgressSqlite.belongsTo(LessonSqlite, {
    foreignKey: "lessonId",
    as: "lesson",
  });

  StudentMysql.hasMany(StudentLessonProgressMysql, {
    foreignKey: "studentId",
    as: "lessonProgress",
  });
  StudentLessonProgressMysql.belongsTo(StudentMysql, {
    foreignKey: "studentId",
    as: "student",
  });
  LessonMysql.hasMany(StudentLessonProgressMysql, {
    foreignKey: "lessonId",
    as: "progress",
  });
  StudentLessonProgressMysql.belongsTo(LessonMysql, {
    foreignKey: "lessonId",
    as: "lesson",
  });


  SubscriptionSqlite.hasMany(SubscriptionConsumptionSqlite, { foreignKey: 'subscriptionId', as: 'consumptions' });
SubscriptionConsumptionSqlite.belongsTo(SubscriptionSqlite, { foreignKey: 'subscriptionId', as: 'subscription' });

SubscriptionMysql.hasMany(SubscriptionConsumptionMysql, { foreignKey: 'subscriptionId', as: 'consumptions' });
SubscriptionConsumptionMysql.belongsTo(SubscriptionMysql, { foreignKey: 'subscriptionId', as: 'subscription' });


// Exam ↔ Questions
ExamSqlite.hasMany(ExamQuestionSqlite, { foreignKey: 'examId', as: 'questions' });
ExamQuestionSqlite.belongsTo(ExamSqlite, { foreignKey: 'examId', as: 'exam' });

ExamMysql.hasMany(ExamQuestionMysql, { foreignKey: 'examId', as: 'questions' });
ExamQuestionMysql.belongsTo(ExamMysql, { foreignKey: 'examId', as: 'exam' });

// Student ↔ ExamAttempt
StudentSqlite.hasMany(ExamAttemptSqlite, { foreignKey: 'studentId', as: 'examAttempts' });
ExamAttemptSqlite.belongsTo(StudentSqlite, { foreignKey: 'studentId', as: 'student' });
ExamSqlite.hasMany(ExamAttemptSqlite, { foreignKey: 'examId', as: 'attempts' });
ExamAttemptSqlite.belongsTo(ExamSqlite, { foreignKey: 'examId', as: 'exam' });

StudentMysql.hasMany(ExamAttemptMysql, { foreignKey: 'studentId', as: 'examAttempts' });
ExamAttemptMysql.belongsTo(StudentMysql, { foreignKey: 'studentId', as: 'student' });
ExamMysql.hasMany(ExamAttemptMysql, { foreignKey: 'examId', as: 'attempts' });
ExamAttemptMysql.belongsTo(ExamMysql, { foreignKey: 'examId', as: 'exam' });




StudentSqlite.hasMany(GameSessionSqlite, {
  foreignKey: "studentId",
  as: "gameSessions",
});
GameSessionSqlite.belongsTo(StudentSqlite, {
  foreignKey: "studentId",
  as: "student",
});

StudentMysql.hasMany(GameSessionMysql, {
  foreignKey: "studentId",
  as: "gameSessions",
});
GameSessionMysql.belongsTo(StudentMysql, {
  foreignKey: "studentId",
  as: "student",
});




  // QrSnippet ↔ Course / Lesson
  CourseSqlite.hasMany(QrSnippetSqlite, {
    foreignKey: "courseId",
    as: "qrSnippets",
  });
  QrSnippetSqlite.belongsTo(CourseSqlite, {
    foreignKey: "courseId",
    as: "course",
  });

  LessonSqlite.hasMany(QrSnippetSqlite, {
    foreignKey: "lessonId",
    as: "qrSnippets",
  });
  QrSnippetSqlite.belongsTo(LessonSqlite, {
    foreignKey: "lessonId",
    as: "lesson",
  });

  CourseMysql.hasMany(QrSnippetMysql, {
    foreignKey: "courseId",
    as: "qrSnippets",
  });
  QrSnippetMysql.belongsTo(CourseMysql, {
    foreignKey: "courseId",
    as: "course",
  });

  LessonMysql.hasMany(QrSnippetMysql, {
    foreignKey: "lessonId",
    as: "qrSnippets",
  });
  QrSnippetMysql.belongsTo(LessonMysql, {
    foreignKey: "lessonId",
    as: "lesson",
  });

  // Student ↔ StudentQrView
  StudentSqlite.hasMany(StudentQrViewSqlite, {
    foreignKey: "studentId",
    as: "qrViews",
  });
  StudentQrViewSqlite.belongsTo(StudentSqlite, {
    foreignKey: "studentId",
    as: "student",
  });

  StudentMysql.hasMany(StudentQrViewMysql, {
    foreignKey: "studentId",
    as: "qrViews",
  });
  StudentQrViewMysql.belongsTo(StudentMysql, {
    foreignKey: "studentId",
    as: "student",
  });

  // Lesson / Course ↔ StudentQrView
  LessonSqlite.hasMany(StudentQrViewSqlite, {
    foreignKey: "lessonId",
    as: "qrViews",
  });
  StudentQrViewSqlite.belongsTo(LessonSqlite, {
    foreignKey: "lessonId",
    as: "lesson",
  });

  LessonMysql.hasMany(StudentQrViewMysql, {
    foreignKey: "lessonId",
    as: "qrViews",
  });
  StudentQrViewMysql.belongsTo(LessonMysql, {
    foreignKey: "lessonId",
    as: "lesson",
  });

  CourseSqlite.hasMany(StudentQrViewSqlite, {
    foreignKey: "courseId",
    as: "qrViews",
  });
  StudentQrViewSqlite.belongsTo(CourseSqlite, {
    foreignKey: "courseId",
    as: "course",
  });

  CourseMysql.hasMany(StudentQrViewMysql, {
    foreignKey: "courseId",
    as: "qrViews",
  });
  StudentQrViewMysql.belongsTo(CourseMysql, {
    foreignKey: "courseId",
    as: "course",
  });



  // ============ التصدير ============

  return {
    // أساسيات
    OutboxSqlite,
    PasswordResetSqlite,

    ClientSqlite,
    ClientMysql,
    StudentSqlite,
    StudentMysql,

    // كورسات
    CourseSqlite,
    CourseMysql,
    LessonSqlite,
    LessonMysql,

    // شراء/اشتراك/وصول
    PlanSqlite,
    PlanMysql,
    SubscriptionSqlite,
    SubscriptionMysql,

    OrderSqlite,
    OrderMysql,
    OrderItemSqlite,
    OrderItemMysql,
    PaymentSqlite,
    PaymentMysql,

    EnrollmentSqlite,
    EnrollmentMysql,

    // محفظة/شحن/فاوتشر
    WalletSqlite,
    WalletMysql,
    WalletTxSqlite,
    WalletTxMysql,
    TopupSqlite,
    TopupMysql,
    VoucherSqlite,
    VoucherMysql,

    // Community
    CommunityQuestionSqlite,
    CommunityQuestionMysql,
    CommunityAnswerSqlite,
    CommunityAnswerMysql,

    // Users
    UserSqlite,
    UserMysql,

    // FAQ
    FaqSqlite,
    FaqMysql,

    // Self-Quiz
    SelfQuizChapterSqlite,
    SelfQuizChapterMysql,
    SelfQuizQuestionSqlite,
    SelfQuizQuestionMysql,
    SelfQuizChoiceSqlite,
    SelfQuizChoiceMysql,
    SelfQuizCompletionSqlite,
    SelfQuizCompletionMysql,

    // Map Bank
    MapBankSqlite,
    MapBankMysql,
    MapBankItemSqlite,
    MapBankItemMysql,

    // Device / Centers
    DeviceSessionSqlite,
    DeviceSessionMysql,
    CenterSqlite,
    CenterMysql,

    // NEW (لمنطق الحضور والفتح والتقدم)
    StudentAttendanceSqlite,
    StudentAttendanceMysql,
    StudentLessonOverrideSqlite,
    StudentLessonOverrideMysql,
    StudentLessonProgressSqlite,
    StudentLessonProgressMysql,


      SubscriptionConsumptionSqlite,
  SubscriptionConsumptionMysql,


  ExamSqlite, ExamMysql,
ExamQuestionSqlite, ExamQuestionMysql,
ExamAttemptSqlite, ExamAttemptMysql,


    TrueFalseQuestionSqlite,
    TrueFalseQuestionMysql,
    McqRushQuestionSqlite,
    McqRushQuestionMysql,
    FastAnswerQuestionSqlite,
    FastAnswerQuestionMysql,
    FlipCardCountrySqlite,
    FlipCardCountryMysql,
    FlipCardQuestionSqlite,
    FlipCardQuestionMysql,
    BattleFriendQuestionSqlite,
    BattleFriendQuestionMysql,
    GameSessionSqlite,
    GameSessionMysql,

    QrSnippetSqlite,
    QrSnippetMysql,
    StudentQrViewSqlite,
    StudentQrViewMysql,

        NotificationSqlite,
    NotificationMysql,

    StudentCertificateSqlite,
    StudentCertificateMysql,

  };
}
