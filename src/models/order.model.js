// src/models/order.model.js
import { DataTypes } from 'sequelize';

export function defineOrderModel(sequelize, tableName = 'orders') {
  return sequelize.define('Order', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

    studentId:  { type: DataTypes.INTEGER, allowNull: false },
    status:     { type: DataTypes.ENUM('draft','pending','paid','failed','canceled','refunded'), allowNull: false, defaultValue: 'pending' },
    totalCents: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    currency:   { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'EGP' },

    // بوابة الدفع لو أونلاين
    provider:   { type: DataTypes.STRING(50), defaultValue: 'manual' },
    providerRef:{ type: DataTypes.STRING(255) },

    createdAt:  { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updatedAtLocal: { type: DataTypes.DATE },
  }, { tableName, timestamps: false, indexes: [{ fields: ['studentId'] }, { fields: ['status'] }] });
}

// src/models/order-item.model.js
export function defineOrderItemModel(sequelize, tableName = 'order_items') {
  return sequelize.define('OrderItem', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

    orderId:   { type: DataTypes.INTEGER, allowNull: false },

    // نوع العنصر: كورس فردي أو خطة اشتراك
    itemType:  { type: DataTypes.ENUM('COURSE','PLAN'), allowNull: false },
    itemId:    { type: DataTypes.INTEGER, allowNull: false },

    title:     { type: DataTypes.STRING(255) },
    priceCents:{ type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },

  }, { tableName, timestamps: false, indexes: [{ fields: ['orderId'] }, { fields: ['itemType','itemId'] }] });
}

// src/models/payment.model.js
export function definePaymentModel(sequelize, tableName = 'payments') {
  return sequelize.define('Payment', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

    orderId:   { type: DataTypes.INTEGER, allowNull: false },
    amountCents:{ type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    currency:  { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'EGP' },

    method:    { type: DataTypes.ENUM('manual_cash','manual_bank','card','wallet','kiosk'), allowNull: false, defaultValue: 'manual_cash' },
    status:    { type: DataTypes.ENUM('pending','paid','failed','refunded'), allowNull: false, defaultValue: 'pending' },

    provider:  { type: DataTypes.STRING(50), defaultValue: 'manual' },
    providerRef:{ type: DataTypes.STRING(255) },

    createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updatedAtLocal: { type: DataTypes.DATE },
  }, { tableName, timestamps: false, indexes: [{ fields: ['orderId'] }, { fields: ['status'] }] });
}
