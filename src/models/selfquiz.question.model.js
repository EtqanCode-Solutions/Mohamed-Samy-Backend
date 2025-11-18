import { DataTypes } from 'sequelize';

export function defineSelfQuizQuestionModel(sequelize, tableName = 'selfquiz_questions') {
  return sequelize.define('SelfQuizQuestion', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    chapterId: { type: DataTypes.INTEGER, allowNull: false },

    kind: { type: DataTypes.STRING, allowNull: false, defaultValue: 'mcq' }, // حالياً MCQ
    body: { type: DataTypes.TEXT, allowNull: false },
    imageUrl: { type: DataTypes.STRING, allowNull: true },
    explanation: { type: DataTypes.TEXT, allowNull: true },

    orderIndex: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    isDeleted: { type: DataTypes.BOOLEAN, defaultValue: false },

    createdAtLocal: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updatedAtLocal: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  }, {
    tableName,
    timestamps: false,
    indexes: [
      { fields: ['chapterId'] },
      { fields: ['orderIndex'] },
      { fields: ['isDeleted'] },
    ],
  });
}
