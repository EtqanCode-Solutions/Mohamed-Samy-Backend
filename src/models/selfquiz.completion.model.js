import { DataTypes } from 'sequelize';

export function defineSelfQuizCompletionModel(sequelize, tableName = 'selfquiz_completions') {
  return sequelize.define('SelfQuizCompletion', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    studentId: { type: DataTypes.INTEGER, allowNull: false },
    chapterId: { type: DataTypes.INTEGER, allowNull: false },

    isPerfect: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    totalQuestions: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    totalCorrect: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },

    lastAttemptAt: { type: DataTypes.DATE, allowNull: true },

    createdAtLocal: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updatedAtLocal: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  }, {
    tableName,
    timestamps: false,
    indexes: [
      { unique: true, fields: ['studentId','chapterId'] },
      { fields: ['isPerfect'] },
    ],
  });
}
