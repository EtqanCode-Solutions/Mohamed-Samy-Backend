import { normalizeLevel } from '../utils/levels.js';

export async function hasEntitlement({ models, studentId, resource }) {
  const { SubscriptionSqlite, PlanSqlite, EnrollmentSqlite, StudentSqlite } = models;

  if (!studentId) return { ok:false, via:null };

  if (resource.type === 'COURSE') {
    const enr = await EnrollmentSqlite.findOne({ where: { studentId, courseId: resource.id } });
    if (enr) return { ok:true, via:'enrollment' };
    const subs = await SubscriptionSqlite.findAll({ where:{ studentId, status:'active' }, order:[['id','DESC']], limit:10 });
    const now = Date.now();
    for (const sub of subs) {
      const s = sub.startsAt ? new Date(sub.startsAt).getTime() : 0;
      const e = sub.endsAt ? new Date(sub.endsAt).getTime() : 0;
      if (!(s <= now && now <= e)) continue;
      const plan = await PlanSqlite.findByPk(sub.planId);
      if (!plan || !plan.isActive) continue;
      const S = String(plan.scopeType || '').toUpperCase();
      if (S === 'ALL') return { ok:true, via:'subscription', scope:'all' };
      if (S === 'CATEGORY' && resource.category && plan.scopeValue === resource.category)
        return { ok:true, via:'subscription', scope:'category' };
    }
    return { ok:false, via:null };
  }

  if (resource.type === 'EXAM') {
    if (resource.isFree) return { ok:true, via:'free', scope:'free' };

    const student = await StudentSqlite.findByPk(studentId);
    const studentGrade = normalizeLevel(student?.year) || student?.year || null;

    const subs = await SubscriptionSqlite.findAll({ where:{ studentId, status:'active' }, order:[['id','DESC']], limit:10 });
    const now = Date.now();
    for (const sub of subs) {
      const s = sub.startsAt ? new Date(sub.startsAt).getTime() : 0;
      const e = sub.endsAt ? new Date(sub.endsAt).getTime() : 0;
      if (!(s <= now && now <= e)) continue;
      const plan = await PlanSqlite.findByPk(sub.planId);
      if (!plan || !plan.isActive) continue;

      const S = String(plan.scopeType || '').toUpperCase();
      if (S === 'ALL') return { ok:true, via:'subscription', scope:'all' };
      if (S === 'GRADE' && studentGrade && (normalizeLevel(plan.scopeValue) === studentGrade))
        return { ok:true, via:'subscription', scope:'grade' };
      if (S === 'CATEGORY' && resource.category && plan.scopeValue === resource.category)
        return { ok:true, via:'subscription', scope:'category' };
    }
    return { ok:false, via:null };
  }

  return { ok:false, via:null };
}
