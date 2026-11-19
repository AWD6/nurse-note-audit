import {
  NHSO_SECTIONS,
  HAIT_ITEMS,
  MINOR_OR_SECTIONS,
  NURSE_NOTE_SECTIONS,
  RISK_GROUPS,
  getAllItemsMap,
} from './criteria.js';

export const PASS_THRESHOLD = 80;

// Thai Buddhist Era date utilities (DD/MM/YYYY พ.ศ.)
export function formatThaiDate(isoDate) {
  if (!isoDate) return '-';
  const parts = String(isoDate).split('-');
  if (parts.length !== 3) return isoDate;
  const [y, m, d] = parts;
  const beYear = Number(y) + 543;
  if (Number.isNaN(beYear)) return isoDate;
  return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${beYear}`;
}

export function getTodayIso() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseIsoParts(isoDate) {
  const safe = isoDate && /^\d{4}-\d{2}-\d{2}$/.test(isoDate) ? isoDate : getTodayIso();
  const [y, m, d] = safe.split('-').map(Number);
  return { yearCE: y, yearBE: y + 543, month: m, day: d };
}

export function buildIsoDate(yearBE, month, day) {
  const yearCE = Number(yearBE) - 543;
  const m = Math.max(1, Math.min(12, Number(month)));
  const maxDay = new Date(yearCE, m, 0).getDate();
  const d = Math.max(1, Math.min(maxDay, Number(day)));
  return `${yearCE}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function scoreBinarySections(sections, answers) {
  let pass = 0;
  let fail = 0;
  let na = 0;
  let totalItems = 0;
  let answered = 0;

  for (const sec of sections) {
    for (const item of sec.items) {
      totalItems += 1;
      const val = answers[item.id];
      if (!val) continue;
      answered += 1;
      const opt = item.options.find((o) => o.value === val);
      if (!opt) continue;
      if (opt.kind === 'pass') pass += 1;
      else if (opt.kind === 'fail') fail += 1;
      else if (opt.kind === 'na') na += 1;
    }
  }

  const applicable = pass + fail;
  const pct = applicable > 0 ? Math.round((pass / applicable) * 1000) / 10 : null;
  return { pass, fail, na, applicable, answered, totalItems, unanswered: totalItems - answered, pct };
}

export function scoreHait(answers) {
  let score = 0;
  let maxApplicable = 0;
  let answered = 0;
  let na = 0;
  const totalItems = HAIT_ITEMS.length;

  for (const item of HAIT_ITEMS) {
    const val = answers[item.id];
    if (val === undefined || val === null || val === '') continue;
    answered += 1;
    const opt = item.options.find((o) => o.value === String(val));
    if (!opt) continue;
    if (opt.kind === 'na') na += 1;
    else {
      score += opt.score;
      maxApplicable += item.maxScore;
    }
  }

  const pct = maxApplicable > 0 ? Math.round((score / maxApplicable) * 1000) / 10 : null;
  return { score, maxApplicable, na, answered, totalItems, unanswered: totalItems - answered, pct };
}

export function scoreNurseNote(answers) {
  const core = scoreBinarySections(NURSE_NOTE_SECTIONS, answers);
  const riskPseudoSections = RISK_GROUPS.map((g) => ({
    id: g.id,
    items: [g.screenItem, ...g.followUpItems],
  }));
  const risk = scoreBinarySections(riskPseudoSections, answers);

  const pass = core.pass + risk.pass;
  const fail = core.fail + risk.fail;
  const na = core.na + risk.na;
  const applicable = pass + fail;
  const answered = core.answered + risk.answered;
  const totalItems = core.totalItems + risk.totalItems;
  const pct = applicable > 0 ? Math.round((pass / applicable) * 1000) / 10 : null;

  return { pass, fail, na, applicable, answered, totalItems, unanswered: totalItems - answered, pct, core, risk };
}

export function computeAuditSummary(audit) {
  const selected = audit.selectedModules || ['NHSO'];
  const answers = audit.answers || {};

  const modules = {};
  if (selected.includes('NHSO')) modules.NHSO = scoreBinarySections(NHSO_SECTIONS, answers);
  if (selected.includes('HAIT')) modules.HAIT = scoreHait(answers);
  if (selected.includes('MINOR_OR')) modules.MINOR_OR = scoreBinarySections(MINOR_OR_SECTIONS, answers);
  modules.NURSE_NOTE = scoreNurseNote(answers);

  const activePcts = Object.values(modules)
    .map((m) => m.pct)
    .filter((p) => p !== null);

  const overallPct =
    activePcts.length > 0
      ? Math.round((activePcts.reduce((a, b) => a + b, 0) / activePcts.length) * 10) / 10
      : null;

  const totalUnanswered = Object.values(modules).reduce((acc, m) => acc + m.unanswered, 0);
  const totalItems = Object.values(modules).reduce((acc, m) => acc + m.totalItems, 0);

  return {
    modules,
    overallPct,
    passed: overallPct !== null && overallPct >= PASS_THRESHOLD,
    totalItems,
    totalAnswered: totalItems - totalUnanswered,
    totalUnanswered,
  };
}

export function computeDashboardStats(audits) {
  const count = audits.length;
  if (count === 0) {
    return {
      count: 0,
      avgOverall: 0,
      avgNurseNote: 0,
      avgNhso: null,
      avgHait: null,
      avgMinorOr: null,
      passedCount: 0,
      failedCount: 0,
      passRate: 0,
      byUnit: [],
      byDate: [],
      topDeficiencies: [],
    };
  }

  let overallSum = 0;
  let overallN = 0;
  let nnSum = 0;
  let nnN = 0;
  let nhsoSum = 0;
  let nhsoN = 0;
  let haitSum = 0;
  let haitN = 0;
  let orSum = 0;
  let orN = 0;
  let passedCount = 0;

  const unitMap = new Map();
  const dateMap = new Map();
  const defMap = new Map();
  const itemsMap = getAllItemsMap();

  for (const audit of audits) {
    const summary = computeAuditSummary(audit);
    if (summary.overallPct !== null) {
      overallSum += summary.overallPct;
      overallN += 1;
      if (summary.passed) passedCount += 1;
    }
    if (summary.modules.NURSE_NOTE?.pct !== null) {
      nnSum += summary.modules.NURSE_NOTE.pct;
      nnN += 1;
    }
    if (summary.modules.NHSO?.pct !== null && summary.modules.NHSO?.pct !== undefined) {
      nhsoSum += summary.modules.NHSO.pct;
      nhsoN += 1;
    }
    if (summary.modules.HAIT?.pct !== null && summary.modules.HAIT?.pct !== undefined) {
      haitSum += summary.modules.HAIT.pct;
      haitN += 1;
    }
    if (summary.modules.MINOR_OR?.pct !== null && summary.modules.MINOR_OR?.pct !== undefined) {
      orSum += summary.modules.MINOR_OR.pct;
      orN += 1;
    }

    // By Unit -> Room
    const unitName = audit.unit || 'ไม่ระบุหน่วย';
    const roomName = audit.room || 'ไม่ระบุห้องตรวจ';
    if (!unitMap.has(unitName)) {
      unitMap.set(unitName, { unit: unitName, count: 0, overallSum: 0, nnSum: 0, roomsMap: new Map() });
    }
    const u = unitMap.get(unitName);
    u.count += 1;
    u.overallSum += summary.overallPct ?? 0;
    u.nnSum += summary.modules.NURSE_NOTE?.pct ?? 0;

    if (!u.roomsMap.has(roomName)) {
      u.roomsMap.set(roomName, { room: roomName, count: 0, overallSum: 0, nnSum: 0 });
    }
    const r = u.roomsMap.get(roomName);
    r.count += 1;
    r.overallSum += summary.overallPct ?? 0;
    r.nnSum += summary.modules.NURSE_NOTE?.pct ?? 0;

    // By Date (for Trend chart)
    const dKey = audit.auditDate || 'unknown';
    if (!dateMap.has(dKey)) {
      dateMap.set(dKey, { date: dKey, count: 0, overallSum: 0, nnSum: 0 });
    }
    const d = dateMap.get(dKey);
    d.count += 1;
    d.overallSum += summary.overallPct ?? 0;
    d.nnSum += summary.modules.NURSE_NOTE?.pct ?? 0;

    // Deficiencies
    const answers = audit.answers || {};
    for (const [itemId, val] of Object.entries(answers)) {
      const meta = itemsMap.get(itemId);
      if (!meta) continue;
      if (meta.moduleCode !== 'NURSE_NOTE' && !(audit.selectedModules || []).includes(meta.moduleCode)) continue;
      const opt = meta.options.find((o) => o.value === String(val));
      if (!opt) continue;
      if (opt.kind === 'fail' || (meta.moduleCode === 'HAIT' && opt.kind === 'partial')) {
        if (!defMap.has(itemId)) {
          defMap.set(itemId, {
            id: itemId,
            label: meta.label,
            moduleCode: meta.moduleCode,
            sectionTitle: meta.sectionTitle,
            count: 0,
          });
        }
        defMap.get(itemId).count += 1;
      }
    }
  }

  const byUnit = Array.from(unitMap.values())
    .map((u) => ({
      unit: u.unit,
      count: u.count,
      avgOverall: Math.round((u.overallSum / u.count) * 10) / 10,
      avgNurseNote: Math.round((u.nnSum / u.count) * 10) / 10,
      rooms: Array.from(u.roomsMap.values())
        .map((r) => ({
          room: r.room,
          count: r.count,
          avgOverall: Math.round((r.overallSum / r.count) * 10) / 10,
          avgNurseNote: Math.round((r.nnSum / r.count) * 10) / 10,
        }))
        .sort((a, b) => b.avgOverall - a.avgOverall),
    }))
    .sort((a, b) => b.avgOverall - a.avgOverall);

  const byDate = Array.from(dateMap.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({
      date: d.date,
      thaiDate: formatThaiDate(d.date),
      count: d.count,
      avgOverall: Math.round((d.overallSum / d.count) * 10) / 10,
      avgNurseNote: Math.round((d.nnSum / d.count) * 10) / 10,
    }));

  const topDeficiencies = Array.from(defMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return {
    count,
    avgOverall: overallN > 0 ? Math.round((overallSum / overallN) * 10) / 10 : 0,
    avgNurseNote: nnN > 0 ? Math.round((nnSum / nnN) * 10) / 10 : 0,
    avgNhso: nhsoN > 0 ? Math.round((nhsoSum / nhsoN) * 10) / 10 : null,
    avgHait: haitN > 0 ? Math.round((haitSum / haitN) * 10) / 10 : null,
    avgMinorOr: orN > 0 ? Math.round((orSum / orN) * 10) / 10 : null,
    passedCount,
    failedCount: overallN - passedCount,
    passRate: overallN > 0 ? Math.round((passedCount / overallN) * 1000) / 10 : 0,
    byUnit,
    byDate,
    topDeficiencies,
  };
}
