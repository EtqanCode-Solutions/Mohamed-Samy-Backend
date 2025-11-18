// src/models/student-attendance.model.js
import { DataTypes } from 'sequelize';

export function defineStudentAttendanceModel(sequelize, tableName = 'student_attendance') {
  const dialect = sequelize.getDialect?.() || 'sqlite';
  const isSqlite = dialect === 'sqlite';
  const enumType = (values) => (isSqlite ? DataTypes.STRING : DataTypes.ENUM(...values));

  return sequelize.define('StudentAttendance', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

    studentId: { type: DataTypes.INTEGER, allowNull: false },
    courseId:  { type: DataTypes.INTEGER, allowNull: false },
    lessonId:  { type: DataTypes.INTEGER, allowNull: false }, // المحاضرة الأصلية (kind='lesson')

    centerId:  { type: DataTypes.INTEGER, allowNull: true },

    accessMode: {
      type: enumType(['HW_ONLY', 'FULL_LESSON']),
      allowNull: false,
      defaultValue: 'HW_ONLY',
      comment: 'HW_ONLY = افتح الواجب فقط, FULL_LESSON = افتح المحاضرة + الواجب',
    },

    attendedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },

    recordedByUserId: { type: DataTypes.INTEGER, allowNull: true },

    // حدود الوصول
    accessExpiresAt: { type: DataTypes.DATE, allowNull: true }, // ينتهي بعد X أيام
    maxViews:        { type: DataTypes.INTEGER, allowNull: true }, // أقصى عدد مشاهدات
    viewsUsed:       { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }, // كام مشاهدة استهلك

    createdAt:      { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updatedAtLocal: { type: DataTypes.DATE },
  }, {
    tableName,
    timestamps: false,
    indexes: [
      { fields: ['studentId'] },
      { fields: ['lessonId'] },
      { fields: ['courseId'] },
      { fields: ['accessMode'] },
      { fields: ['centerId'] },
      { fields: ['accessExpiresAt'] },
    ],
  });
}
