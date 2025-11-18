// src/models/subscription-consumption.model.js
import { DataTypes } from 'sequelize';

export function defineSubscriptionConsumptionModel(sequelize, tableName = 'subscription_consumptions') {
  const SubscriptionConsumption = sequelize.define('SubscriptionConsumption', {
    id:             { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    subscriptionId: { type: DataTypes.INTEGER, allowNull: false },
    courseId:       { type: DataTypes.INTEGER, allowNull: false },
    consumedAt:     { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  }, {
    tableName,
    timestamps: false,
    indexes: [
      { fields: ['subscriptionId'] },
      { fields: ['courseId'] },
      { unique: true, fields: ['subscriptionId', 'courseId'] }, // منع تكرار نفس الكورس
    ],
  });

  return SubscriptionConsumption;
}
