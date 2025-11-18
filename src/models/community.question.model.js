import { DataTypes } from 'sequelize';

export function defineCommunityQuestionModel(sequelize, tableName = 'community_questions') {
  return sequelize.define('CommunityQuestion', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },

    // الطالب صاحب السؤال
    studentId: { type: DataTypes.INTEGER, allowNull: false },

    // محتوى السؤال (نص أساسي إلزامي)
    body: { type: DataTypes.TEXT, allowNull: false },

    // صورة اختيارية للسؤال
    imageUrl: { type: DataTypes.STRING, allowNull: true },

    status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'open' }, // open|answered|closed
    isDeleted: { type: DataTypes.BOOLEAN, defaultValue: false },

    createdAtLocal: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updatedAtLocal: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  }, {
    tableName,
    timestamps: false,
    indexes: [
      { fields: ['studentId'] },
      { fields: ['status'] },
      { fields: ['createdAtLocal'] },
    ],
  });
}
