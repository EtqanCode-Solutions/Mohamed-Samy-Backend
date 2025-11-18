import { DataTypes } from "sequelize";

export function defineCenterModel(sequelize, tableName = "centers") {
  return sequelize.define(
    "Center",
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },

      code: { type: DataTypes.STRING, allowNull: true }, // كود اختياري، فريد لو حبيت
      name: { type: DataTypes.STRING, allowNull: false }, // اسم السنتر
      region: { type: DataTypes.STRING, allowNull: false }, // محافظة/منطقة
      city: { type: DataTypes.STRING, allowNull: true },
      addressLine: { type: DataTypes.STRING, allowNull: false }, // العنوان

      // موقع اختياري
      mapsUrl: { type: DataTypes.STRING(2048), allowNull: true },

      // مستويات مدعومة (أولى/تانية/تالتة — نصوص عربية موحدة)
      levelsSupported: { type: DataTypes.JSON, allowNull: true }, // Array<string>

      // مواعيد: [{ weekday:0..6, from:"HH:mm", to:"HH:mm", note?, level? }]
      schedule: { type: DataTypes.JSON, allowNull: true },

      // مسئول السنتر
      managerName: { type: DataTypes.STRING, allowNull: true },
      managerPhone: { type: DataTypes.STRING, allowNull: true },
      whatsapp: { type: DataTypes.STRING, allowNull: true },
      email: { type: DataTypes.STRING, allowNull: true },

      isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
      isDeleted: { type: DataTypes.BOOLEAN, defaultValue: false },

      createdAtLocal: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
      updatedAtLocal: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    },
    {
      tableName,
      timestamps: false,
      indexes: [
        { fields: ["region"] },
        { fields: ["city"] },
        { fields: ["isActive"] },
        { fields: ["isDeleted"] },
        // لو عايز الكود يكون فريد:
        // { unique: true, fields: ['code'] },
      ],
    }
  );
}
