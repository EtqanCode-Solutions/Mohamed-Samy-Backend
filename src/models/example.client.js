import { DataTypes } from 'sequelize';

/** مثال موديل Client — نفس التعريف يُسجل على SQLite و MySQL */
export function defineClientModel(sequelize) {
  return sequelize.define('Client', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    code: { type: DataTypes.STRING },
    name: { type: DataTypes.STRING, allowNull: false },
    phone: { type: DataTypes.STRING },
    notes: { type: DataTypes.TEXT },
    updatedAtLocal: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'clients',
    timestamps: false,
    indexes: [{ fields: ['code'] }, { fields: ['name'] }],
  });
}
