import {
  NHSO_SECTIONS,
  HAIT_ITEMS,
  MINOR_OR_SECTIONS,
  NURSE_NOTE_SECTIONS,
  RISK_GROUPS,
} from './criteria.js';
import { computeAuditSummary, formatThaiDate } from './scoring.js';

// Connected Google Sheet & Apps Script Web App URL
export const GOOGLE_SHEET_CONFIG = {
  sheetUrl: 'https://docs.google.com/spreadsheets/d/1RF8dJNC26eohppeePjGmQuMlcTuo__hm5W7EzSanE_s/edit?gid=0#gid=0',
  webAppUrl: 'https://script.google.com/macros/s/AKfycbx8zfjdu2tGHLe8J-QEdT54hOPHGVzr2ldOEbcCn7yoY30XFahA0FoXWK5exRcOd3OoyQ/exec',
};

const STORAGE_KEY = 'maharat_nurse_note_audits_v4';

function buildDemoAudits() {
  const fillPass = (sections, overrides = {}) => {
    const ans = {};
    for (const sec of sections) {
      for (const item of sec.items) {
        const passOpt = item.options.find((o) => o.kind === 'pass');
        ans[item.id] = passOpt ? passOpt.value : item.options[0].value;
      }
    }
    return { ...ans, ...overrides };
  };

  const fillRiskNoProblem = (overrides = {}) => {
    const ans = {};
    for (const g of RISK_GROUPS) {
      ans[g.screenItem.id] = 'ถูกต้อง';
      for (const f of g.followUpItems) ans[f.id] = 'ไม่มีปัญหานี้';
    }
    return { ...ans, ...overrides };
  };

  return [
    {
      id: 'demo-1',
      nnId: 'NN-691117-A101',
      isDemo: true,
      auditDate: '2026-11-17',
      hnEncrypted: '',
      patientType: 'old',
      gender: 'female',
      age: 48,
      unit: 'หน่วยที่ 1',
      room: 'OPD 1',
      auditor: 'พว.สุนิสา ใจดี',
      selectedModules: ['NHSO', 'HAIT'],
      answers: {
        ...fillPass(NHSO_SECTIONS, {
          nhso_h1_dur: 'เป็นผู้ป่วยเก่า',
          nhso_h6_vac: 'ไม่อยู่ในเกณฑ์',
          nhso_h7_drug: 'ไม่มี',
          nhso_pe6_wh: 'ไม่มี',
        }),
        hait_1: '1',
        hait_2: '2',
        hait_3: '2',
        hait_4: '4',
        hait_5: '4',
        hait_6: '3',
        ...fillPass(NURSE_NOTE_SECTIONS, {
          nn_4_2: 'ไม่มีการทำหัตถการ',
          nn_6_2: 'ไม่มีการฝึกทักษะ',
          nn_7_3: 'ไม่มีการส่งต่อ',
        }),
        ...fillRiskNoProblem(),
      },
      feedback: 'บันทึกครบถ้วนดีมาก ขาดบันทึกน้ำหนัก/ส่วนสูงในส่วน PE',
      createdAt: '2026-11-17T09:30:00.000Z',
    },
    {
      id: 'demo-2',
      nnId: 'NN-691118-B204',
      isDemo: true,
      auditDate: '2026-11-18',
      hnEncrypted: '',
      patientType: 'new',
      gender: 'male',
      age: 35,
      unit: 'หน่วยผ่าตัดเล็ก',
      room: 'OR Minor ชั้น 3',
      auditor: 'พว.สุนิสา ใจดี',
      selectedModules: ['MINOR_OR'],
      answers: {
        ...fillPass(MINOR_OR_SECTIONS, {
          or_ic3: 'ไม่มี',
          or_ic7: 'ไม่มี',
        }),
        ...fillPass(NURSE_NOTE_SECTIONS, {
          nn_1_2_1: 'เป็นผู้ป่วยใหม่',
          nn_3_2: 'ไม่ถูกต้อง',
          nn_5_2: 'ไม่ถูกต้อง',
          nn_7_3: 'ไม่มีการส่งต่อ',
        }),
        ...fillRiskNoProblem({
          nn_pain_dx: 'ถูกต้อง',
          nn_pain_care: 'ถูกต้อง',
          nn_pain_eval: 'ไม่ถูกต้อง',
        }),
      },
      feedback: 'Informed Consent ขาดพยาน/เวลา; Pain score > 0 แต่ไม่ครบกระบวนการ',
      createdAt: '2026-11-18T11:15:00.000Z',
    },
    {
      id: 'demo-3',
      nnId: 'NN-691118-C309',
      isDemo: true,
      auditDate: '2026-11-18',
      hnEncrypted: '',
      patientType: 'old',
      gender: 'female',
      age: 67,
      unit: 'หน่วยที่ 5',
      room: 'OPD 22',
      auditor: 'พว.กนกวรรณ ศรีสุข',
      selectedModules: ['HAIT'],
      answers: {
        hait_1: '1',
        hait_2: '1',
        hait_3: '1',
        hait_4: '3',
        hait_5: '3',
        hait_6: '2',
        ...fillPass(NURSE_NOTE_SECTIONS, {
          nn_1_1: 'ไม่มี',
          nn_3_2: 'ไม่ถูกต้อง',
          nn_4_2: 'ไม่มีการทำหัตถการ',
          nn_5_1: 'ไม่ถูกต้อง',
          nn_6_2: 'ไม่มีการฝึกทักษะ',
          nn_7_3: 'ไม่มีการส่งต่อ',
          nn_8_3: 'ไม่มี',
        }),
        ...fillRiskNoProblem({
          nn_fall_dx: 'ถูกต้อง',
          nn_fall_care: 'ไม่ถูกต้อง',
          nn_fall_eval: 'ไม่ถูกต้อง',
        }),
      },
      feedback: 'ไม่ระบุวัน/เวลาแรกรับ; ลายมือชื่ออ่านไม่ออก; ประเมิน Falling ไม่ครบ',
      createdAt: '2026-11-18T14:05:00.000Z',
    },
    {
      id: 'demo-4',
      nnId: 'NN-691119-D412',
      isDemo: true,
      auditDate: '2026-11-19',
      hnEncrypted: '',
      patientType: 'old',
      gender: 'male',
      age: 52,
      unit: 'หน่วยผ่าตัดเล็ก',
      room: 'OR Minor ชั้น 10',
      auditor: 'พว.กนกวรรณ ศรีสุข',
      selectedModules: ['MINOR_OR'],
      answers: {
        ...fillPass(MINOR_OR_SECTIONS),
        ...fillPass(NURSE_NOTE_SECTIONS, { nn_7_3: 'ไม่มีการส่งต่อ' }),
        ...fillRiskNoProblem(),
      },
      feedback: 'บันทึกครบถ้วนดีมาก',
      createdAt: '2026-11-19T13:45:00.000Z',
    },
    {
      id: 'demo-5',
      nnId: 'NN-691120-E518',
      isDemo: true,
      auditDate: '2026-11-20',
      hnEncrypted: '',
      patientType: 'old',
      gender: 'female',
      age: 59,
      unit: 'เคมีบำบัด',
      room: 'ห้องให้ยาเคมีบำบัด',
      auditor: 'พว.สุนิสา ใจดี',
      selectedModules: ['NHSO'],
      answers: {
        ...fillPass(NHSO_SECTIONS, {
          nhso_h1_dur: 'เป็นผู้ป่วยเก่า',
          nhso_h6_vac: 'ไม่อยู่ในเกณฑ์',
        }),
        ...fillPass(NURSE_NOTE_SECTIONS, { nn_7_3: 'ไม่มีการส่งต่อ' }),
        ...fillRiskNoProblem(),
      },
      feedback: 'บันทึกครบถ้วนดีมาก',
      createdAt: '2026-11-20T09:10:00.000Z',
    },
  ];
}

function savePartitionedIndex(audits) {
  const index = {};
  for (const a of audits) {
    const u = a.unit || 'ไม่ระบุหน่วย';
    const r = a.room || 'ไม่ระบุห้องตรวจ';
    if (!index[u]) index[u] = {};
    if (!index[u][r]) index[u][r] = [];
    index[u][r].push(a);
  }
  localStorage.setItem('maharat_nurse_note_partitioned_v4', JSON.stringify(index));
}

export function loadAudits() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  const demos = buildDemoAudits();
  saveAudits(demos);
  return demos;
}

export function saveAudits(audits) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(audits));
  savePartitionedIndex(audits);
}

export function upsertAudit(record) {
  // PDPA safeguard: never persist plaintext hn
  const sanitized = { ...record };
  delete sanitized.hn;

  const audits = loadAudits();
  const idx = audits.findIndex((a) => a.id === sanitized.id);
  if (idx >= 0) {
    audits[idx] = { ...sanitized, updatedAt: new Date().toISOString() };
  } else {
    audits.unshift({ ...sanitized, createdAt: new Date().toISOString() });
  }
  saveAudits(audits);
  return audits;
}

export function deleteAudit(id) {
  const audits = loadAudits().filter((a) => a.id !== id);
  saveAudits(audits);
  return audits;
}

export function clearDemoAudits() {
  const audits = loadAudits().filter((a) => !a.isDemo);
  saveAudits(audits);
  return audits;
}

// ============================================================
// Google Sheets Sync (PDPA-Safe: sends Nurse Note ID, NEVER plaintext HN)
// ============================================================
export async function pushAuditToGoogleSheet(record, summary) {
  if (!GOOGLE_SHEET_CONFIG.webAppUrl) return { skipped: true };
  try {
    // Strip plaintext HN; put Nurse Note ID in the ID/hn column so Sheet shows NN-ID only
    const safeRecord = { ...record };
    delete safeRecord.hn;

    const payload = {
      record: {
        ...safeRecord,
        hn: safeRecord.nnId, // Column C on Google Sheet displays Nurse Note ID (PDPA safe)
        thaiDate: formatThaiDate(safeRecord.auditDate),
      },
      summary,
    };
    await fetch(GOOGLE_SHEET_CONFIG.webAppUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function pullAuditsFromGoogleSheet() {
  if (!GOOGLE_SHEET_CONFIG.webAppUrl) return { skipped: true, records: [] };
  try {
    const res = await fetch(GOOGLE_SHEET_CONFIG.webAppUrl);
    const data = await res.json();
    if (data && Array.isArray(data.records)) {
      const normalized = data.records.map((r) => {
        const clean = { ...r };
        if (!clean.nnId) clean.nnId = clean.hn || clean.id;
        delete clean.hn;
        return clean;
      });
      return { ok: true, records: normalized };
    }
    return { ok: false, records: [] };
  } catch (err) {
    return { ok: false, error: err.message, records: [] };
  }
}

// ============================================================
// Excel Export (.xlsx) — PDPA Safe (includes HN only if Admin unlocked)
// ============================================================
function sanitizeSheetName(name) {
  return String(name || 'Sheet')
    .replace(/[\\/?*[\]:]/g, '_')
    .slice(0, 31);
}

function mapSummaryRow(a, decryptedHnMap = null) {
  const s = computeAuditSummary(a);
  const row = {
    'วันที่ประเมิน (พ.ศ.)': formatThaiDate(a.auditDate),
    'Nurse Note ID': a.nnId || a.id,
  };
  if (decryptedHnMap) {
    row['HN (Admin)'] = decryptedHnMap.get(a.id) || (a.hnEncrypted ? '(ถอดรหัสไม่ได้)' : '-');
  }
  return {
    ...row,
    หน่วย: a.unit || '',
    ห้องตรวจ: a.room || '',
    ผู้ประเมิน: a.auditor || '',
    เกณฑ์ที่ประเมิน: (a.selectedModules || []).join(', '),
    'คะแนนรวม (%)': s.overallPct ?? '',
    สถานะ: s.passed ? 'ผ่าน (>=80%)' : 'ต้องปรับปรุง',
    'OPD สปสช. (%)': s.modules.NHSO?.pct ?? '',
    'HA IT (คะแนน)': s.modules.HAIT ? `${s.modules.HAIT.score}/${s.modules.HAIT.maxApplicable}` : '',
    'HA IT (%)': s.modules.HAIT?.pct ?? '',
    'OR เล็ก (%)': s.modules.MINOR_OR?.pct ?? '',
    'Nurse Note (%)': s.modules.NURSE_NOTE?.pct ?? '',
    ข้อเสนอแนะ: a.feedback || '',
  };
}

export function exportAuditsToExcel(audits, filenamePrefix = 'NurseNote_Audit', decryptedHnMap = null) {
  if (!window.XLSX) return;
  const XLSX = window.XLSX;
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(audits.map((a) => mapSummaryRow(a, decryptedHnMap))),
    'สรุปภาพรวม'
  );

  const groups = new Map();
  for (const a of audits) {
    const key = `${a.unit || 'อื่นๆ'}_${a.room || 'ไม่ระบุ'}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(a);
  }

  const used = new Set(['สรุปภาพรวม']);
  for (const [key, list] of groups.entries()) {
    let name = sanitizeSheetName(key);
    let n = 2;
    while (used.has(name)) name = sanitizeSheetName(`${key.slice(0, 27)}_${n++}`);
    used.add(name);
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(list.map((a) => mapSummaryRow(a, decryptedHnMap))),
      name
    );
  }

  XLSX.writeFile(
    wb,
    `${filenamePrefix}_${formatThaiDate(new Date().toISOString().slice(0, 10)).replace(/\//g, '-')}.xlsx`
  );
}
