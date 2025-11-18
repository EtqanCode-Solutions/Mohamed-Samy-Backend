// src/models/student-lesson-progress.model.js
import { DataTypes } from 'sequelize';

export function defineStudentLessonProgressModel(sequelize, tableName = 'student_lesson_progress') {
  return sequelize.define('StudentLessonProgress', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

    studentId: { type: DataTypes.INTEGER, allowNull: false },
    lessonId:  { type: DataTypes.INTEGER, allowNull: false },
    courseId:  { type: DataTypes.INTEGER, allowNull: false },

    lastPositionSec:   { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    maxWatchedSec:     { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    durationSecCached: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },

    fullyWatched: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    completedAt:  { type: DataTypes.DATE, allowNull: true },

    firstStartedAt: { type: DataTypes.DATE, allowNull: true },
    lastSeenAt:     { type: DataTypes.DATE, allowNull: true },

    deviceSessionId: { type: DataTypes.INTEGER, allowNull: true },
    ipAddr:          { type: DataTypes.STRING(64), allowNull: true },
    userAgent:       { type: DataTypes.STRING(255), allowNull: true },

    createdAt:      { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updatedAtLocal: { type: DataTypes.DATE },
  }, {
    tableName,
    timestamps: false,
    indexes: [
      { fields: ['studentId', 'lessonId'], unique: true },
      { fields: ['courseId'] },
      { fields: ['fullyWatched'] },
    ],
  });
}
