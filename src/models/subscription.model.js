import { DataTypes } from 'sequelize';

export function defineSubscriptionModel(sequelize, tableName = 'subscriptions') {
  return sequelize.define('Subscription', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

    studentId: { type: DataTypes.INTEGER, allowNull: false },
    planId:    { type: DataTypes.INTEGER, allowNull: false },

    status: { type: DataTypes.ENUM('pending','active','expired','canceled'), allowNull: false, defaultValue: 'pending' },
    startsAt: { type: DataTypes.DATE },
    endsAt:   { type: DataTypes.DATE },

    orderId:     { type: DataTypes.INTEGER },       // مرجع للطلب
    externalRef: { type: DataTypes.STRING(255) },    // مرجع من بوابة دفع لو لزم

    createdAt:   { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updatedAtLocal: { type: DataTypes.DATE },
  }, {
    tableName, timestamps: false,
    indexes: [{ fields: ['studentId'] }, { fields: ['planId'] }, { fields: ['status'] }],
  });
}
