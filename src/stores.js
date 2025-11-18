// src/stores.js
import { isMysqlUp } from "./config/db.js";

/**
 * models: اللي راجع من registerModels()
 * مهم جداً:
 * لازم تكون معرّف في registerModels موديلات الـ MySQL المقابلة
 * زي WalletMysql و WalletTxMysql و TopupMysql و VoucherMysql و PlanMysql
 */
export function buildModelsMap(models) {
  const {
    OutboxSqlite,
    ClientSqlite,
    ClientMysql,
    StudentSqlite,
    StudentMysql,
    PlanSqlite,
    PlanMysql,
    WalletSqlite,
    WalletMysql,
    WalletTxSqlite,
    WalletTxMysql,
    TopupSqlite,
    TopupMysql,
    VoucherSqlite,
    VoucherMysql,
    NotificationSqlite,
    NotificationMysql,

    // 🔴 زوّد دول:
    StudentAttendanceSqlite,
    StudentAttendanceMysql,
    StudentLessonProgressSqlite,
    StudentLessonProgressMysql,
    QrSnippetSqlite,
    QrSnippetMysql,
    StudentQrViewSqlite,
    StudentQrViewMysql,
    ExamSqlite,
    ExamMysql,
    ExamAttemptSqlite,
    ExamAttemptMysql,

        StudentCertificateSqlite,
    StudentCertificateMysql,
  } = models;

  return {
    Client: { sqliteModel: ClientSqlite, mysqlModel: ClientMysql },
    Student: { sqliteModel: StudentSqlite, mysqlModel: StudentMysql },
    Plan: { sqliteModel: PlanSqlite, mysqlModel: PlanMysql },
    Wallet: { sqliteModel: WalletSqlite, mysqlModel: WalletMysql },
    WalletTx: { sqliteModel: WalletTxSqlite, mysqlModel: WalletTxMysql },
    TopupRequest: { sqliteModel: TopupSqlite, mysqlModel: TopupMysql },
    Voucher: { sqliteModel: VoucherSqlite, mysqlModel: VoucherMysql },

    Notification: {
      sqliteModel: NotificationSqlite,
      mysqlModel: NotificationMysql,
    },

    // 🔴 نفس اسم modelName اللي بتبعته في performOperation
    StudentAttendance: {
      sqliteModel: StudentAttendanceSqlite,
      mysqlModel: StudentAttendanceMysql,
    },
    StudentLessonProgress: {
      sqliteModel: StudentLessonProgressSqlite,
      mysqlModel: StudentLessonProgressMysql,
    },
    QrSnippet: {
      sqliteModel: QrSnippetSqlite,
      mysqlModel: QrSnippetMysql,
    },
    StudentQrView: {
      sqliteModel: StudentQrViewSqlite,
      mysqlModel: StudentQrViewMysql,
    },
    Exam: {
      sqliteModel: ExamSqlite,
      mysqlModel: ExamMysql,
    },
    ExamAttempt: {
      sqliteModel: ExamAttemptSqlite,
      mysqlModel: ExamAttemptMysql,
    },
    StudentCertificate: {
      sqliteModel: StudentCertificateSqlite,
      mysqlModel: StudentCertificateMysql,
    },
    __helpers: {
      Outbox: OutboxSqlite,
      isMysqlUp,
    },
  };
}
