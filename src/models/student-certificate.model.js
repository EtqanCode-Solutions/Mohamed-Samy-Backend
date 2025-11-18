// src/models/student-certificate.model.js
import { DataTypes } from 'sequelize';

/**
 * شهادة طالب واحدة:
 * - مقترح تستخدمها لـ: exam / course / behavior / other
 */
export function defineStudentCertificateModel(sequelize) {
  return sequelize.define(
    'StudentCertificate',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },

      // الطالب صاحب الشهادة
      studentId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },

      // عنوان الشهادة
      title: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      // وصف الشهادة (زي الـ description اللي في الفرونت)
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },

      // exam | course | behavior | other
      type: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: 'other',
      },

      // صادرة من مين (منصة المبدع / مستر فلان...)
      issuedBy: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      // تاريخ إصدار الشهادة
      issuedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },

      // سبب الشهادة
      reason: {
        type: DataTypes.TEXT,
        allowNull: true,
      },

      // اسم الكورس / الخطة (لو موجود)
      course: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      // الدرجة
      score: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },

      maxScore: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },

      // لأي بيانات إضافية عايز تخزنها JSON
      metaJson: {
        type: DataTypes.TEXT,
        allowNull: true,
      },

      // زيه زي Student: createdAtLocal / updatedAtLocal
      createdAtLocal: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },

      updatedAtLocal: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: 'student_certificates',
      timestamps: false,
      indexes: [
        { fields: ['studentId'] },
        { fields: ['type'] },
        { fields: ['issuedAt'] },
      ],
    }
  );
}
