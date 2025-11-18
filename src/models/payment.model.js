// src/models/payment.model.js
import { DataTypes } from 'sequelize';

/**
 * Payment Model — يمثل عمليات الدفع الخاصة بالطلبات (نقدي، كارت، محفظة...إلخ)
 */
export function definePaymentModel(sequelize, tableName = 'payments') {
  return sequelize.define('Payment', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

    orderId: { type: DataTypes.INTEGER, allowNull: false },
    amountCents: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    currency: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'EGP' },

    method: {
      type: DataTypes.ENUM('manual_cash', 'manual_bank', 'card', 'wallet', 'kiosk'),
      allowNull: false,
      defaultValue: 'manual_cash',
      comment: 'طريقة الدفع المستخدمة',
    },

    status: {
      type: DataTypes.ENUM('pending', 'paid', 'failed', 'refunded'),
      allowNull: false,
      defaultValue: 'pending',
    },

    provider: { type: DataTypes.STRING(50), defaultValue: 'manual' },
    providerRef: { type: DataTypes.STRING(255) },

    createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updatedAtLocal: { type: DataTypes.DATE },
  }, {
    tableName,
    timestamps: false,
    indexes: [
      { fields: ['orderId'] },
      { fields: ['status'] },
    ],
  });
}
