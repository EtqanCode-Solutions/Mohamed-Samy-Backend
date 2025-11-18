/**
 * Worker دوري يسحب عمليات outbox ويطبقها على MySQL
 * ملاحظات:
 *  - idempotency مبسطة: لو حصل Duplicate Key في create نعتبرها success.
 *  - Last write wins في update/delete.
 */
export function startPeriodicSync(modelsMap, intervalMs = 5000) {
  const timer = setInterval(() => syncOnce(modelsMap).catch(e => {
    console.error('[sync] error:', e);
  }), intervalMs);

  console.log(`🔁 Sync worker started (every ${intervalMs} ms)`);
  return () => clearInterval(timer);
}

export async function syncOnce(modelsMap) {
  const { Outbox, isMysqlUp } = modelsMap.__helpers;
  if (!await isMysqlUp()) return false;

  const batch = await Outbox.findAll({ order: [['id', 'ASC']], limit: 200 });
  if (batch.length === 0) return true;

  for (const row of batch) {
    const { id, operationId, modelName, op, payload } = row;
    const pair = modelsMap[modelName];
    if (!pair) {
      console.warn('[sync] no model map for', modelName, '→ dropping row', id);
      await row.destroy();
      continue;
    }
    const mysqlModel = pair.mysqlModel;

    try {
      if (op === 'create') {
        await mysqlModel.create(payload.data)
          .catch(err => {
            // لو تكرار مفتاح - اعتبرها تمت سابقًا
            if (/duplicate/i.test(err?.message)) return;
            throw err;
          });
      } else if (op === 'update') {
        await mysqlModel.update(payload.data, { where: payload.where });
      } else if (op === 'delete') {
        await mysqlModel.destroy({ where: payload.where });
      }
      await row.destroy(); // تمت المزامنة
      // ملاحظة: ممكن إضافة سجلّ إلى جدول logs لو حبيت
    } catch (e) {
      row.attempts = (row.attempts || 0) + 1;
      await row.save();
      console.warn('[sync] failed op', operationId, 'attempts=', row.attempts, e.message);
    }
  }
  return true;
}
