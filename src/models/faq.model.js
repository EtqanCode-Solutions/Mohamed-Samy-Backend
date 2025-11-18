import { DataTypes } from 'sequelize';

/**
 * Bank أسئلة وأجوبة (FAQ)
 * - ينشؤه admin/user فقط
 * - الطالب يقرأ فقط
 * - يدعم مرفقات على الإجابة (pdf/mp4/hls/external/link...)
 */
export function defineFaqModel(sequelize, tableName = 'faq_items') {
  return sequelize.define('FaqItem', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },

    // نص السؤال والإجابة
    questionText: { type: DataTypes.TEXT, allowNull: false },
    answerText:   { type: DataTypes.TEXT, allowNull: true },

    // مرفقات مرتبطة بالإجابة (JSON Array)
    // مثال: [{kind:'pdf', url:'https://cdn.../a.pdf', mime:'application/pdf'}]
    attachments:  { type: DataTypes.JSON, allowNull: true },

    // معلومات تنظيمية
    category: { type: DataTypes.STRING, allowNull: true },
    level:    { type: DataTypes.STRING, allowNull: true }, // اختياري لو عايز تربطه بسنة/مرحلة
    status:   { type: DataTypes.STRING, allowNull: false, defaultValue: 'published' }, // draft|published
    orderIndex: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },

    isDeleted: { type: DataTypes.BOOLEAN, defaultValue: false },

    createdAtLocal: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updatedAtLocal: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  }, {
    tableName,
    timestamps: false,
    indexes: [
      { fields: ['status'] },
      { fields: ['category'] },
      { fields: ['level'] },
      { fields: ['orderIndex'] },
      { fields: ['createdAtLocal'] },
    ],
  });
}
