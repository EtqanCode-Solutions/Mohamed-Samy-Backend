import { DataTypes } from 'sequelize';

/** outbox: يخزن العمليات المعلقة لتتزامن لاحقًا مع MySQL */
export function defineOutboxModel(sequelize) {
  return sequelize.define('Outbox', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    operationId: { type: DataTypes.STRING, allowNull: false, unique: true },
    modelName: { type: DataTypes.STRING, allowNull: false },
    op: { type: DataTypes.ENUM('create', 'update', 'delete'), allowNull: false },
    payload: { type: DataTypes.JSON, allowNull: false }, // { data, where }
    attempts: { type: DataTypes.INTEGER, defaultValue: 0 },
    createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'outbox',
    timestamps: false,
  });
}
