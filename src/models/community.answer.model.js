import { DataTypes } from 'sequelize';

export function defineCommunityAnswerModel(sequelize, tableName = 'community_answers') {
  return sequelize.define('CommunityAnswer', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    questionId: { type: DataTypes.INTEGER, allowNull: false },

    // المجيب (User/Admin)
    responderId: { type: DataTypes.INTEGER, allowNull: false },
    responderRole: { type: DataTypes.STRING, allowNull: false, defaultValue: 'user' }, // admin|user

    // نص اختياري بجانب أي وسائط
    contentText: { type: DataTypes.TEXT, allowNull: true },

    // وسائط متعددة: [{kind,url,mime,provider,streamType,durationSec,thumb}]
    attachments: { type: DataTypes.JSON, allowNull: true },

    isDeleted: { type: DataTypes.BOOLEAN, defaultValue: false },
    createdAtLocal: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updatedAtLocal: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  }, {
    tableName,
    timestamps: false,
    indexes: [
      { fields: ['questionId'] },
      { fields: ['createdAtLocal'] },
    ],
  });
}
