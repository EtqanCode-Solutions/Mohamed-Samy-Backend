// src/models/lesson.model.js
import { DataTypes } from 'sequelize';

/**
 * درس ضمن كورس — محاضرة أو واجب.
 * - kind: 'lesson' (محاضرة) أو 'homework' (واجب)
 * - parentLessonId: لو ده واجب -> بيرجع للمحاضرة الأصلية
 * ملاحظة: SQLite ما بيدعم ENUM حقيقي، فبنحوّله لـ STRING.
 */
function defineLessonModel(sequelize, tableName = 'lessons') {
  const dialect = sequelize.getDialect?.() || 'sqlite';
  const isSqlite = dialect === 'sqlite';

  // Helper: ENUM في MySQL و STRING في SQLite
  const enumType = (values) => (isSqlite ? DataTypes.STRING : DataTypes.ENUM(...values));

  const Lesson = sequelize.define('Lesson', {
    id:        { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    courseId:  { type: DataTypes.INTEGER, allowNull: false },

    // لو kind = "homework" → parentLessonId تمثل المحاضرة الأصلية
    parentLessonId: { type: DataTypes.INTEGER, allowNull: true },

    title:       { type: DataTypes.STRING(255), allowNull: false },
    description: { type: DataTypes.TEXT },

    kind: {
      type: enumType(['lesson', 'homework']),
      allowNull: false,
      defaultValue: 'lesson',
    },

    teacherNotes: { type: DataTypes.TEXT },

    provider: {
      type: DataTypes.STRING(100),
      defaultValue: () => process.env.CLOUD_DEFAULT_PROVIDER || 'generic',
    },
    streamType: {
      type: enumType(['mp4', 'hls', 'dash', 'external']),
      allowNull: false,
      defaultValue: 'mp4',
    },
    streamUrl:   { type: DataTypes.STRING(1000), allowNull: false },
    downloadUrl: { type: DataTypes.STRING(1000) },

    thumbnailUrl: { type: DataTypes.STRING(500) },

    durationSec: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },

    captions:  { type: DataTypes.JSON },  // [{lang,label,url}]
    resources: { type: DataTypes.JSON },  // [{type,title,url,size,pages}]

    // لو واجب:
    dueDate:  { type: DataTypes.DATE },
    hwStatus: { type: enumType(['pending', 'submitted', 'graded']) },

    isFreePreview: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    status:        { type: enumType(['draft', 'published', 'archived']), allowNull: false, defaultValue: 'draft' },

    orderIndex: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },

    linkExpiresAt: { type: DataTypes.DATE },
    linkVersion:   { type: DataTypes.INTEGER, defaultValue: 1 },

    isDeleted:      { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    updatedAtLocal: { type: DataTypes.DATE },
    createdAt:      { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  }, {
    tableName,
    timestamps: false,
    indexes: [
      { fields: ['courseId'] },
      { fields: ['orderIndex'] },
      { fields: ['status'] },
      { fields: ['isDeleted'] },
      { fields: ['provider'] },
      { fields: ['streamType'] },
      { name: 'lessons_kind', fields: ['kind'] },
      { name: 'lessons_parentLessonId', fields: ['parentLessonId'] },
    ],
  });

  return Lesson;
}

export default defineLessonModel;
export { defineLessonModel };
