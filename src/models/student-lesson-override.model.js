// src/models/student-lesson-override.model.js
import { DataTypes } from 'sequelize';

export function defineStudentLessonOverrideModel(sequelize, tableName = 'student_lesson_overrides') {
  return sequelize.define('StudentLessonOverride', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

    studentId: { type: DataTypes.INTEGER, allowNull: false },
    lessonId:  { type: DataTypes.INTEGER, allowNull: false },

    // صلاحيات يدوياً من المدرّس / الأدمن
    allowVideoAccess:    { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    allowHomeworkAccess: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

    // انتهاء زمني (لو المدرس عايز يفتح بس 3 أيام مثلاً)
    expiresAt: { type: DataTypes.DATE, allowNull: true },

    // حدود المشاهدة
    maxViews:  { type: DataTypes.INTEGER, allowNull: true },          // أقصى عدد مشاهدات
    viewsUsed: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }, // كام مرة فعلاً أخد stream

    note: { type: DataTypes.STRING(255), allowNull: true },

    createdByUserId: { type: DataTypes.INTEGER, allowNull: true },

    createdAt:      { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updatedAtLocal: { type: DataTypes.DATE },
  }, {
    tableName,
    timestamps: false,
    indexes: [
      { fields: ['studentId'] },
      { fields: ['lessonId'] },
      { fields: ['expiresAt'] },
    ],
  });
}
