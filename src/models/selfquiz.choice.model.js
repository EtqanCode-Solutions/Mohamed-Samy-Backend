import { DataTypes } from 'sequelize';

export function defineSelfQuizChoiceModel(sequelize, tableName = 'selfquiz_choices') {
  return sequelize.define('SelfQuizChoice', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    questionId: { type: DataTypes.INTEGER, allowNull: false },

    label: { type: DataTypes.TEXT, allowNull: false },
    imageUrl: { type: DataTypes.STRING, allowNull: true },
    isCorrect: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

    orderIndex: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },

    createdAtLocal: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updatedAtLocal: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  }, {
    tableName,
    timestamps: false,
    indexes: [
      { fields: ['questionId'] },
      { fields: ['orderIndex'] },
      { fields: ['isCorrect'] },
    ],
  });
}
