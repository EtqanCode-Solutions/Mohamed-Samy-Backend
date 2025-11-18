// src/models/exam.model.js
import { DataTypes } from 'sequelize';

export function defineExamModel(sequelize, tableName = 'exams') {
  const Exam = sequelize.define('Exam', {
    id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    title:       { type: DataTypes.STRING(255), allowNull: false },
    description: { type: DataTypes.TEXT },

    level:       { type: DataTypes.STRING(255) },   // سهل/متوسط/صعب (اختياري)
    category:    { type: DataTypes.STRING(255) },   // مادة

    // ✅ اختياري: ربط بالكورس/المحاضرة
    courseId:    { type: DataTypes.INTEGER, allowNull: true },
    lessonId:    { type: DataTypes.INTEGER, allowNull: true },

    grade:       { type: DataTypes.STRING(64), allowNull: false }, // الصف (أولى/تانية/ثالثة)

    durationMin: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 20 },
    isFree:      { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },

    status:      {
      type: DataTypes.ENUM('draft', 'published', 'archived'), 
      allowNull: false,
      defaultValue: 'published',
    },

    isDeleted:      { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    publishedAt:    { type: DataTypes.DATE },
    updatedAtLocal: { type: DataTypes.DATE },
    createdAt:      { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  }, {
    tableName,
    timestamps: false,
    indexes: [
      { fields: ['status'] },
      { fields: ['category'] },
      { fields: ['level'] },
      { fields: ['grade'] },
      { fields: ['isDeleted'] },

      // ✅ مهم للربط بالمحاضرة
      { fields: ['courseId'] },
      { fields: ['lessonId'] },
    ],
  });

  return Exam;
}

export default defineExamModel;
