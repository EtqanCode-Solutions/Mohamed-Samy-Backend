// src/models/games.models.js
import { DataTypes } from "sequelize";

/**
 * صح ولا غلط
 * table: game_true_false_questions
 */
export function defineTrueFalseQuestionModel(sequelize) {
  return sequelize.define(
    "TrueFalseQuestion",
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      text: { type: DataTypes.TEXT, allowNull: false },
      isTrue: { type: DataTypes.BOOLEAN, allowNull: false },

      // سنة / مستوى (اختياري)
      level: { type: DataTypes.STRING, allowNull: true },

      isActive: { type: DataTypes.BOOLEAN, defaultValue: true },

      createdAtLocal: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
      updatedAtLocal: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: "game_true_false_questions",
      timestamps: false,
      indexes: [
        { fields: ["level"] },
        { fields: ["isActive"] },
      ],
    }
  );
}

/**
 * MCQ Rush
 * table: game_mcq_rush_questions
 */
export function defineMcqRushQuestionModel(sequelize) {
  return sequelize.define(
    "McqRushQuestion",
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      text: { type: DataTypes.TEXT, allowNull: false },
      options: {
        type: DataTypes.JSON, // SQLite هيخزنها TEXT
        allowNull: false,
        defaultValue: [],
      },
      correctIndex: { type: DataTypes.INTEGER, allowNull: false },

      level: { type: DataTypes.STRING, allowNull: true },
      isActive: { type: DataTypes.BOOLEAN, defaultValue: true },

      createdAtLocal: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
      updatedAtLocal: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: "game_mcq_rush_questions",
      timestamps: false,
      indexes: [
        { fields: ["level"] },
        { fields: ["isActive"] },
      ],
    }
  );
}

/**
 * Fast Answer (اختيار من متعدد — 5 ثواني)
 * table: game_fast_answer_questions
 */
export function defineFastAnswerQuestionModel(sequelize) {
  return sequelize.define(
    "FastAnswerQuestion",
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      text: { type: DataTypes.TEXT, allowNull: false },
      options: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: [],
      },
      correctIndex: { type: DataTypes.INTEGER, allowNull: false },

      level: { type: DataTypes.STRING, allowNull: true },
      isActive: { type: DataTypes.BOOLEAN, defaultValue: true },

      createdAtLocal: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
      updatedAtLocal: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: "game_fast_answer_questions",
      timestamps: false,
      indexes: [
        { fields: ["level"] },
        { fields: ["isActive"] },
      ],
    }
  );
}

/**
 * Flip Card دولة
 * table: game_flipcard_countries
 */
export function defineFlipCardCountryModel(sequelize) {
  return sequelize.define(
    "FlipCardCountry",
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },

      code: { type: DataTypes.STRING, allowNull: false, unique: true }, // EGYPT, SAUDI...
      name: { type: DataTypes.STRING, allowNull: false }, // "مصر"
      flagEmoji: { type: DataTypes.STRING, allowNull: true },

      isActive: { type: DataTypes.BOOLEAN, defaultValue: true },

      createdAtLocal: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
      updatedAtLocal: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: "game_flipcard_countries",
      timestamps: false,
      indexes: [{ unique: true, fields: ["code"] }],
    }
  );
}

/**
 * Flip Card سؤال على دولة
 * table: game_flipcard_questions
 */
export function defineFlipCardQuestionModel(sequelize) {
  return sequelize.define(
    "FlipCardQuestion",
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },

      countryId: { type: DataTypes.INTEGER, allowNull: false },

      text: { type: DataTypes.TEXT, allowNull: false },
      options: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: [],
      },
      correctIndex: { type: DataTypes.INTEGER, allowNull: false },

      isActive: { type: DataTypes.BOOLEAN, defaultValue: true },

      createdAtLocal: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
      updatedAtLocal: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: "game_flipcard_questions",
      timestamps: false,
      indexes: [
        { fields: ["countryId"] },
        { fields: ["isActive"] },
      ],
    }
  );
}

/**
 * Battle Friend أسئلة التحدي
 * table: game_battle_friend_questions
 */
export function defineBattleFriendQuestionModel(sequelize) {
  return sequelize.define(
    "BattleFriendQuestion",
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },

      text: { type: DataTypes.TEXT, allowNull: false },
      options: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: [],
      },
      correctIndex: { type: DataTypes.INTEGER, allowNull: false },

      level: { type: DataTypes.STRING, allowNull: true },
      isActive: { type: DataTypes.BOOLEAN, defaultValue: true },

      createdAtLocal: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
      updatedAtLocal: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: "game_battle_friend_questions",
      timestamps: false,
      indexes: [
        { fields: ["level"] },
        { fields: ["isActive"] },
      ],
    }
  );
}

/**
 * Game Session / نتيجة جولة طالب في لعبة
 * table: game_sessions
 */
export function defineGameSessionModel(sequelize) {
  return sequelize.define(
    "GameSession",
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },

      studentId: { type: DataTypes.INTEGER, allowNull: false },
      gameKey: { type: DataTypes.STRING, allowNull: false }, // true-false / mcq-rush / fast-answer ...

      xp: { type: DataTypes.INTEGER, allowNull: false },
      score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },

      meta: { type: DataTypes.JSON, allowNull: true },

      createdAtLocal: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
      updatedAtLocal: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: "game_sessions",
      timestamps: false,
      indexes: [
        { fields: ["studentId"] },
        { fields: ["gameKey"] },
        { fields: ["studentId", "gameKey"] },
      ],
    }
  );
}
