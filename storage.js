import { computeAuditSummary, formatThaiDate } from './scoring.js';

// Connected Google Sheet & Apps Script Web App URL
export const GOOGLE_SHEET_CONFIG = {
  sheetUrl: 'https://docs.google.com/spreadsheets/d/1RF8dJNC26eohppeePjGmQuMlcTuo__hm5W7EzSanE_s/edit?gid=0#gid=0',
  webAppUrl: 'https://script.google.com/macros/s/AKfycbx8zfjdu2tGHLe8J-QEdT54hOPHGVzr2ldOEbcCn7yoY30XFahA0FoXWK5exRcOd3OoyQ/exec',
};

const STORAGE_KEY = 'maharat_nurse_note_audits_v5';
const SETTINGS_KEY = 'maharat_nurse_note_settings_v5';

export function getSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        defaultAuditor: parsed.defaultAuditor || '',
        defaultUnit: parsed.defaultUnit || '',
        defaultRoom: parsed.defaultRoom || '',
        sheetUrl: parsed.sheetUrl || GOOGLE_SHEET_CONFIG.sheetUrl,
        webAppUrl: parsed.webAppUrl || GOOGLE_SHEET_CONFIG.webAppUrl,
      };
    }
  } catch {
    // ignore
  }
  return {
    defaultAuditor: '',
    defaultUnit: '',
    defaultRoom: '',
    sheetUrl: GOOGLE_SHEET_CONFIG.sheetUrl,
    webAppUrl: GOOGLE_SHEET_CONFIG.webAppUrl,
  };
}

export function saveSettings(newSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
  if (newSettings.sheetUrl) GOOGLE_SHEET_CONFIG.sheetUrl = newSettings.sheetUrl;
  if (newSettings.webAppUrl) GOOGLE_SHEET_CONFIG.webAppUrl = newSettings.webAppUrl;
}

// Clean up any legacy pre-production demo keys once
function clearLegacyStorage() {
  [
    'maharat_nurse_note_audits_v1',
    'maharat_nurse_note_audits_v2',
    'maharat_nurse_note_audits_v3',
    'maharat_nurse_note_audits_v4',
    'maharat_nurse_note_partitioned_v2',
    'maharat_nurse_note_partitioned_v3',
    'maharat_nurse_note_partitioned_v4',
  ].forEach((k) => localStorage.removeItem(k));
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
  localStorage.setItem('maharat_nurse_note_partitioned_v5', JSON.stringify(index));
}

export function loadAudits() {
  clearLegacyStorage();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  saveAudits([]);
  return [];
}

export function saveAudits(audits) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(audits));
  savePartitionedIndex(audits);
}

export function upsertAudit(record) {
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
    const safeRecord = { ...record };
    delete safeRecord.hn;

    const payload = {
      record: {
        ...safeRecord,
        hn: safeRecord.nnId,
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
