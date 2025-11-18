// src/models/order-item.model.js
import { DataTypes } from 'sequelize';

/**
 * OrderItem model — يمثل العناصر داخل الطلب (الكورس / الباقة)
 */
export function defineOrderItemModel(sequelize, tableName = 'order_items') {
  return sequelize.define('OrderItem', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

    orderId:   { type: DataTypes.INTEGER, allowNull: false },

    // نوع العنصر: كورس فردي أو خطة اشتراك
    itemType:  { type: DataTypes.ENUM('COURSE','PLAN'), allowNull: false },
    itemId:    { type: DataTypes.INTEGER, allowNull: false },

    title:     { type: DataTypes.STRING(255) },
    priceCents:{ type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },

  }, { 
    tableName,
    timestamps: false,
    indexes: [
      { fields: ['orderId'] },
      { fields: ['itemType','itemId'] },
    ],
  });
}
