import { v4 as uuidv4 } from 'uuid';
import { isMysqlUp } from '../config/db.js';

/**
 * performOperation: طبقة CRUD عامة تعمل على موديلين (sqliteModel + mysqlModel)
 * @param {object} opts
 *  - modelName: اسم الموديل (مفتاح في modelsMap)
 *  - sqliteModel, mysqlModel
 *  - op: 'create'|'update'|'delete'
 *  - data, where
 *  - outboxModel: موديل outbox (على SQLite)
 */
export async function performOperation(opts) {
  const { modelName, sqliteModel, mysqlModel, op, data = {}, where = {}, outboxModel } = opts;
  const operationId = uuidv4();

  let sqliteResult;

  // 1) اكتب على SQLite أولاً لضمان الدوام المحلي
  if (op === 'create') {
    sqliteResult = await sqliteModel.create({ ...data });
  } else if (op === 'update') {
    await sqliteModel.update({ ...data, updatedAtLocal: new Date() }, { where });
    sqliteResult = await sqliteModel.findOne({ where });
  } else if (op === 'delete') {
    sqliteResult = await sqliteModel.findOne({ where });
    await sqliteModel.destroy({ where });
  } else {
    throw new Error('Unsupported operation: ' + op);
  }

  // 2) حاول الكتابة على MySQL الآن
  try {
    if (await isMysqlUp()) {
      if (op === 'create') {
        await mysqlModel.create({ ...data });
      } else if (op === 'update') {
        await mysqlModel.update({ ...data }, { where });
      } else if (op === 'delete') {
        await mysqlModel.destroy({ where });
      }
      return sqliteResult;
    }
  } catch (e) {
    // السقوط للصندوق الخارجي
    console.warn(`[replicator] MySQL failed. Enqueue to outbox.`, e.message);
  }

  // 3) MySQL غير متاح → خزّن العملية في outbox لإعادة المحاولة
  await outboxModel.create({
    operationId,
    modelName,
    op,
    payload: { data, where },
  });

  return sqliteResult;
}
