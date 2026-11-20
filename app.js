import {
  MODULE_META,
  OPD_UNITS,
  NHSO_SECTIONS,
  HAIT_ITEMS,
  MINOR_OR_SECTIONS,
  NURSE_NOTE_SECTIONS,
  RISK_GROUPS,
  QUICK_FEEDBACK_CHIPS,
  getAllItemsMap,
} from './criteria.js';
import {
  computeAuditSummary,
  computeDashboardStats,
  PASS_THRESHOLD,
  formatThaiDate,
  getTodayIso,
  parseIsoParts,
  buildIsoDate,
} from './scoring.js';
import {
  GOOGLE_SHEET_CONFIG,
  loadAudits,
  saveAudits,
  upsertAudit,
  deleteAudit,
  clearDemoAudits,
  pushAuditToGoogleSheet,
  pullAuditsFromGoogleSheet,
  exportAuditsToExcel,
} from './storage.js';
import {
  generateNurseNoteId,
  encryptHn,
  decryptHn,
  unlockAdmin,
  lockAdmin,
  isAdminUnlocked,
} from './crypto.js';

if (window.Chart && window.ChartDataLabels) {
  window.Chart.register(window.ChartDataLabels);
}

const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

// ============================================================
// App State
// ============================================================
let currentView = 'audit'; // 'audit' | 'dashboard' | 'history'
let audits = loadAudits();
let chartInstances = {};
let decryptedHnCache = new Map(); // RAM-only decrypted HN cache when Admin unlocked

async function refreshDecryptedHnCache() {
  decryptedHnCache.clear();
  if (!isAdminUnlocked()) return;
  for (const a of audits) {
    if (a.hnEncrypted) {
      const plain = await decryptHn(a.hnEncrypted);
      if (plain) decryptedHnCache.set(a.id, plain);
    }
  }
}

function createBlankDraft(keepContext = null) {
  const dateIso = keepContext?.auditDate || getTodayIso();
  return {
    id: 'audit-' + Date.now(),
    nnId: generateNurseNoteId(dateIso),
    isNew: true,
    auditDate: dateIso,
    hnInput: '',
    hnEncrypted: '',
    patientType: 'old',
    gender: '',
    age: '',
    unit: keepContext?.unit || '',
    room: keepContext?.room || '',
    customRoom: keepContext?.customRoom || '',
    auditor: keepContext?.auditor || '',
    selectedModules: keepContext?.selectedModules ? [...keepContext.selectedModules] : ['NHSO'],
    answers: {},
    hait4Note: '',
    feedback: '',
  };
}

let draft = createBlankDraft();
let activeStep = 'info';

let dashFilter = { unit: 'ALL', room: 'ALL', module: 'ALL', dateFrom: '', dateTo: '' };
let historyFilter = { unit: 'ALL', room: 'ALL', module: 'ALL', search: '' };

// ============================================================
// Helpers
// ============================================================
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getRoomsForUnit(unitName) {
  const found = OPD_UNITS.find((u) => u.unit === unitName);
  return found ? found.rooms : [];
}

function getEffectiveDraftRoom() {
  if (draft.room === 'อื่นๆ') return draft.customRoom?.trim() || 'อื่นๆ';
  return draft.room || '';
}

function showToast(message, type = 'success') {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  const styles =
    type === 'error'
      ? 'bg-rose-600 text-white'
      : type === 'info'
        ? 'bg-slate-800 text-white'
        : 'bg-brand-700 text-white';
  el.className = `${styles} px-4 py-2.5 rounded-xl shadow-lg text-xs sm:text-sm font-medium pointer-events-auto transition-all`;
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(6px)';
    setTimeout(() => el.remove(), 200);
  }, 2600);
}

function scoreBadgeClass(pct) {
  if (pct === null || pct === undefined) return 'bg-slate-100 text-slate-500';
  if (pct >= PASS_THRESHOLD) return 'bg-emerald-50 text-emerald-700 border border-emerald-200/80';
  if (pct >= 60) return 'bg-amber-50 text-amber-700 border border-amber-200/80';
  return 'bg-rose-50 text-rose-700 border border-rose-200/80';
}

function destroyCharts() {
  Object.values(chartInstances).forEach((c) => {
    try {
      c?.destroy();
    } catch {
      // ignore
    }
  });
  chartInstances = {};
}

// Clean Thai Buddhist Era Date Selector HTML (DD / MM / YYYY พ.ศ.)
function renderThaiDatePicker(prefix, isoValue, allowEmpty = false) {
  const hasVal = Boolean(isoValue);
  const parts = hasVal ? parseIsoParts(isoValue) : null;
  const currentYearBE = new Date().getFullYear() + 543;
  const years = [];
  for (let y = currentYearBE - 4; y <= currentYearBE + 3; y++) years.push(y);

  const maxDay = parts ? new Date(parts.yearCE, parts.month, 0).getDate() : 31;
  const days = [];
  for (let d = 1; d <= maxDay; d++) days.push(d);

  return `
    <div class="flex items-center gap-1.5" data-thai-date="${prefix}">
      <select id="${prefix}-day" class="rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500">
        ${allowEmpty ? `<option value="" ${!hasVal ? 'selected' : ''}>วัน</option>` : ''}
        ${days.map((d) => `<option value="${d}" ${parts && parts.day === d ? 'selected' : ''}>${String(d).padStart(2, '0')}</option>`).join('')}
      </select>
      <span class="text-slate-300 text-xs">/</span>
      <select id="${prefix}-month" class="rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500">
        ${allowEmpty ? `<option value="" ${!hasVal ? 'selected' : ''}>เดือน</option>` : ''}
        ${THAI_MONTHS_SHORT.map((m, idx) => `<option value="${idx + 1}" ${parts && parts.month === idx + 1 ? 'selected' : ''}>${m}</option>`).join('')}
      </select>
      <span class="text-slate-300 text-xs">/</span>
      <select id="${prefix}-year" class="rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500">
        ${allowEmpty ? `<option value="" ${!hasVal ? 'selected' : ''}>พ.ศ.</option>` : ''}
        ${years.map((y) => `<option value="${y}" ${parts && parts.yearBE === y ? 'selected' : ''}>${y}</option>`).join('')}
      </select>
      ${
        !allowEmpty
          ? `<button type="button" id="${prefix}-today" class="px-2.5 py-2 rounded-xl text-xs font-medium text-brand-700 bg-brand-50 hover:bg-brand-100 transition whitespace-nowrap">วันนี้</button>`
          : ''
      }
    </div>
  `;
}

function bindThaiDatePicker(prefix, currentIso, onChange, allowEmpty = false) {
  const dayEl = document.getElementById(`${prefix}-day`);
  const monthEl = document.getElementById(`${prefix}-month`);
  const yearEl = document.getElementById(`${prefix}-year`);
  const todayBtn = document.getElementById(`${prefix}-today`);
  if (!dayEl || !monthEl || !yearEl) return;

  const update = () => {
    const d = dayEl.value;
    const m = monthEl.value;
    const y = yearEl.value;
    if (allowEmpty && (!d || !m || !y)) {
      if (!d && !m && !y) onChange('');
      return;
    }
    const todayParts = parseIsoParts(currentIso || getTodayIso());
    const iso = buildIsoDate(y || todayParts.yearBE, m || todayParts.month, d || todayParts.day);
    onChange(iso);
  };

  dayEl.addEventListener('change', update);
  monthEl.addEventListener('change', update);
  yearEl.addEventListener('change', update);
  todayBtn?.addEventListener('click', () => onChange(getTodayIso()));
}

function getOrderedSteps() {
  const steps = [{ id: 'info', label: 'ข้อมูลทั่วไป', icon: 'user-round' }];
  if (draft.selectedModules.includes('NHSO')) steps.push({ id: 'NHSO', label: 'OPD สปสช.', icon: 'file-text' });
  if (draft.selectedModules.includes('HAIT')) steps.push({ id: 'HAIT', label: 'OPD HA IT', icon: 'award' });
  if (draft.selectedModules.includes('MINOR_OR')) steps.push({ id: 'MINOR_OR', label: 'ห้องผ่าตัดเล็ก', icon: 'scissors' });
  steps.push({ id: 'NURSE_NOTE', label: 'Nurse Note', icon: 'stethoscope' });
  steps.push({ id: 'RISK', label: 'Pain / Fall / PI', icon: 'shield-alert' });
  steps.push({ id: 'SUMMARY', label: 'สรุป & บันทึก', icon: 'check-circle-2' });
  return steps;
}

function applySilentAutoNa() {
  const ans = draft.answers;
  if (draft.patientType === 'old' && !ans['nhso_h1_dur']) ans['nhso_h1_dur'] = 'เป็นผู้ป่วยเก่า';
  if (draft.patientType === 'new' && !ans['nn_1_2_1']) ans['nn_1_2_1'] = 'เป็นผู้ป่วยใหม่';
  const ageNum = draft.age !== '' ? Number(draft.age) : null;
  if (draft.gender === 'male' || (ageNum !== null && (ageNum < 11 || ageNum > 60))) {
    if (!ans['nhso_h6_lmp']) ans['nhso_h6_lmp'] = 'ไม่อยู่ในเกณฑ์';
  }
  if (ageNum !== null && ageNum > 14 && !ans['nhso_h6_vac']) {
    ans['nhso_h6_vac'] = 'ไม่อยู่ในเกณฑ์';
  }
  if (ageNum !== null && ageNum < 5 && !ans['nhso_pe5_bp']) {
    ans['nhso_pe5_bp'] = 'อายุน้อยกว่า 5 ปี';
  }
}

// ============================================================
// Render Orchestrator
// ============================================================
function updateSheetPill() {
  const pill = document.getElementById('sheet-status-pill');
  if (!pill) return;
  if (GOOGLE_SHEET_CONFIG.sheetUrl) {
    pill.href = GOOGLE_SHEET_CONFIG.sheetUrl;
    pill.classList.remove('hidden');
    pill.classList.add('sm:inline-flex');
  } else {
    pill.classList.add('hidden');
    pill.classList.remove('sm:inline-flex');
  }
}

function render() {
  destroyCharts();
  updateSheetPill();

  document.querySelectorAll('.nav-btn').forEach((btn) => {
    const isActive = btn.dataset.view === currentView;
    btn.className = `nav-btn px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium flex items-center gap-1.5 transition whitespace-nowrap ${
      isActive ? 'bg-white text-brand-800 shadow-xs' : 'text-slate-500 hover:text-slate-800'
    }`;
  });

  const root = document.getElementById('app-root');
  if (currentView === 'audit') {
    root.innerHTML = renderAuditView();
    bindAuditEvents();
  } else if (currentView === 'dashboard') {
    root.innerHTML = renderDashboardView();
    bindDashboardEvents();
    renderDashboardCharts();
  } else if (currentView === 'history') {
    root.innerHTML = renderHistoryView();
    bindHistoryEvents();
  }

  if (window.lucide) window.lucide.createIcons();
}

// ============================================================
// VIEW 1: MINIMAL AUDIT FORM
// ============================================================
function renderAuditView() {
  const summary = computeAuditSummary(draft);
  const effectiveRoom = getEffectiveDraftRoom();

  return `
    <div class="space-y-6 pb-16">
      <!-- Ultra-Slim Sticky Score Bar -->
      <div class="bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/80 shadow-xs px-4 py-3 sticky top-[72px] z-20">
        <div class="flex flex-wrap items-center justify-between gap-2.5">
          <div class="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
            <span class="font-bold text-slate-900 font-mono text-xs bg-slate-100 px-2 py-0.5 rounded-md">${esc(draft.nnId)}</span>
            <span class="text-slate-300">•</span>
            <span class="text-slate-500">${formatThaiDate(draft.auditDate)}</span>
            ${
              draft.unit || effectiveRoom
                ? `<span class="text-slate-300">•</span><span class="text-brand-700 font-medium">${esc(draft.unit || '-')} / ${esc(effectiveRoom || '-')}</span>`
                : ''
            }
          </div>

          <div class="flex flex-wrap items-center gap-1.5">
            ${
              summary.modules.NHSO
                ? `<span class="text-xs px-2.5 py-1 rounded-lg font-medium ${scoreBadgeClass(summary.modules.NHSO.pct)}">สปสช. ${summary.modules.NHSO.pct ?? '-'}%</span>`
                : ''
            }
            ${
              summary.modules.HAIT
                ? `<span class="text-xs px-2.5 py-1 rounded-lg font-medium ${scoreBadgeClass(summary.modules.HAIT.pct)}">HA IT ${summary.modules.HAIT.pct ?? '-'}%</span>`
                : ''
            }
            ${
              summary.modules.MINOR_OR
                ? `<span class="text-xs px-2.5 py-1 rounded-lg font-medium ${scoreBadgeClass(summary.modules.MINOR_OR.pct)}">OR เล็ก ${summary.modules.MINOR_OR.pct ?? '-'}%</span>`
                : ''
            }
            <span class="text-xs px-2.5 py-1 rounded-lg font-medium ${scoreBadgeClass(summary.modules.NURSE_NOTE.pct)}">Nurse Note ${summary.modules.NURSE_NOTE.pct ?? '-'}%</span>
            <span class="text-xs sm:text-sm px-3 py-1 rounded-lg font-bold ${
              summary.overallPct === null
                ? 'bg-slate-100 text-slate-500'
                : summary.passed
                  ? 'bg-brand-700 text-white'
                  : 'bg-rose-600 text-white'
            }">รวม ${summary.overallPct ?? '-'}%</span>
          </div>
        </div>
      </div>

      <!-- Single Scroll Flow -->
      ${renderStepInfo()}
      ${draft.selectedModules.includes('NHSO') ? renderBinaryModuleStep('OPD สปสช.', NHSO_SECTIONS, 'NHSO') : ''}
      ${draft.selectedModules.includes('HAIT') ? renderHaitStep() : ''}
      ${draft.selectedModules.includes('MINOR_OR') ? renderBinaryModuleStep('ห้องผ่าตัดเล็ก (สปสช.)', MINOR_OR_SECTIONS, 'MINOR_OR') : ''}
      ${renderBinaryModuleStep('บันทึกทางการพยาบาล (Nurse Note)', NURSE_NOTE_SECTIONS, 'NURSE_NOTE')}
      ${renderRiskStep()}
      ${renderSummaryStep(summary)}

      <!-- Bottom Save Actions -->
      <div class="flex flex-wrap items-center justify-end gap-2.5 pt-2">
        <button
          id="btn-save-audit"
          class="px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 shadow-xs flex items-center gap-1.5 transition"
        >
          <i data-lucide="save" class="w-4 h-4"></i>
          บันทึกผลประเมิน
        </button>
        <button
          id="btn-save-and-new"
          class="px-5 py-2.5 rounded-xl bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 shadow-xs flex items-center gap-1.5 transition"
        >
          <i data-lucide="plus" class="w-4 h-4"></i>
          บันทึก &amp; ประเมินรายถัดไป
        </button>
      </div>
    </div>
  `;
}

function renderStepInfo() {
  const selectableModules = ['NHSO', 'HAIT', 'MINOR_OR'];
  const unitRooms = getRoomsForUnit(draft.unit);
  const showCustomRoom = draft.unit === 'อื่นๆ' || draft.room === 'อื่นๆ';

  return `
    <div class="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 sm:p-7 space-y-6">
      <div class="flex items-center justify-between gap-2">
        <div>
          <h2 class="text-base sm:text-lg font-bold text-slate-900">ข้อมูลการประเมิน</h2>
          <p class="text-xs text-slate-400 mt-0.5">เลือกหน่วย ห้องตรวจ และชุดเกณฑ์ที่ต้องการประเมิน</p>
        </div>
        <button id="btn-reset-draft" class="text-xs text-slate-400 hover:text-rose-600 flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-rose-50 transition">
          <i data-lucide="rotate-ccw" class="w-3.5 h-3.5"></i>
          เริ่มใหม่
        </button>
      </div>

      <!-- Row 1: Date (พ.ศ.) & HN & Auditor -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label class="block text-xs font-medium text-slate-500 mb-1.5">วันที่ทำการประเมิน (วัน/เดือน/พ.ศ.) <span class="text-rose-500">*</span></label>
          ${renderThaiDatePicker('audit-date', draft.auditDate, false)}
        </div>

        <div>
          <label class="block text-xs font-medium text-slate-500 mb-1.5">
            HN <span class="text-slate-400 font-normal">(ไม่บังคับ • เข้ารหัส PDPA)</span>
          </label>
          <input id="inp-hn" type="text" placeholder="ไม่บังคับ — ส่งขึ้น Sheet เป็น ${esc(draft.nnId)}" value="${esc(draft.hnInput || '')}" class="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500" />
          <p class="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
            <i data-lucide="lock" class="w-3 h-3 text-emerald-600"></i>
            <span>Nurse Note ID: <strong class="font-mono text-slate-600">${esc(draft.nnId)}</strong></span>
          </p>
        </div>

        <div>
          <label class="block text-xs font-medium text-slate-500 mb-1.5">ผู้ประเมิน</label>
          <input id="inp-auditor" type="text" placeholder="ชื่อ-นามสกุลผู้ประเมิน" value="${esc(draft.auditor)}" class="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500" />
        </div>
      </div>

      <!-- Row 2: Unit & Room (No room count, no "จุดบริการ") -->
      <div class="grid grid-cols-1 sm:grid-cols-2 ${showCustomRoom ? 'lg:grid-cols-3' : ''} gap-4 pt-2 border-t border-slate-100">
        <div>
          <label class="block text-xs font-medium text-slate-500 mb-1.5">หน่วย <span class="text-rose-500">*</span></label>
          <select id="inp-unit" class="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500">
            <option value="">เลือกหน่วย</option>
            ${OPD_UNITS.map(
              (u) => `<option value="${esc(u.unit)}" ${draft.unit === u.unit ? 'selected' : ''}>${esc(u.unit)}</option>`
            ).join('')}
          </select>
        </div>

        <div>
          <label class="block text-xs font-medium text-slate-500 mb-1.5">ห้องตรวจ <span class="text-rose-500">*</span></label>
          <select id="inp-room" ${!draft.unit ? 'disabled' : ''} class="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm bg-white disabled:bg-slate-50 disabled:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500">
            <option value="">${draft.unit ? 'เลือกห้องตรวจ' : 'เลือกหน่วยก่อน'}</option>
            ${unitRooms.map((r) => `<option value="${esc(r)}" ${draft.room === r ? 'selected' : ''}>${esc(r)}</option>`).join('')}
          </select>
        </div>

        ${
          showCustomRoom
            ? `
          <div>
            <label class="block text-xs font-medium text-slate-500 mb-1.5">ระบุชื่อห้องตรวจ <span class="text-rose-500">*</span></label>
            <input id="inp-custom-room" type="text" placeholder="ระบุชื่อห้องตรวจ..." value="${esc(draft.customRoom || '')}" class="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500" />
          </div>
        `
            : ''
        }
      </div>

      <!-- Row 3: Modules -->
      <div class="pt-2 border-t border-slate-100">
        <label class="block text-xs font-medium text-slate-500 mb-2.5">
          เกณฑ์ที่ประเมิน <span class="text-rose-500">*</span>
          <span class="text-slate-400 font-normal ml-1">(เลือกได้มากกว่า 1 ชุด • รวม Nurse Note อัตโนมัติ)</span>
        </label>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          ${selectableModules
            .map((code) => {
              const m = MODULE_META[code];
              const checked = draft.selectedModules.includes(code);
              return `
                <button
                  type="button"
                  data-toggle-module="${code}"
                  class="module-toggle text-left p-3.5 rounded-xl border transition flex items-start gap-3 ${
                    checked
                      ? 'border-brand-600 bg-brand-50/50 ring-1 ring-brand-600/20'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }"
                >
                  <div class="w-4 h-4 mt-0.5 rounded border flex items-center justify-center shrink-0 ${
                    checked ? 'bg-brand-700 border-brand-700 text-white' : 'border-slate-300 bg-white'
                  }">
                    ${checked ? '<i data-lucide="check" class="w-3 h-3"></i>' : ''}
                  </div>
                  <div>
                    <div class="font-semibold text-sm text-slate-900">${m.shortName}</div>
                    <div class="text-xs text-slate-400 mt-0.5">${m.description}</div>
                  </div>
                </button>
              `;
            })
            .join('')}
        </div>
      </div>
    </div>
  `;
}

function renderBinaryModuleStep(pageTitle, sections, moduleCode) {
  return `
    <div class="space-y-4">
      <div class="flex items-center justify-between gap-2 px-1">
        <h2 class="text-base sm:text-lg font-bold text-slate-900">${esc(pageTitle)}</h2>
        <button
          type="button"
          data-pass-module="${moduleCode}"
          class="pass-mod-btn px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200/80 hover:bg-emerald-100 text-xs font-semibold flex items-center gap-1.5 transition"
        >
          <i data-lucide="check-check" class="w-3.5 h-3.5"></i>
          ผ่านทั้งหมดที่ยังว่าง
        </button>
      </div>

      ${sections
        .map((sec) => {
          const unanswered = sec.items.filter((i) => !draft.answers[i.id]).length;
          return `
            <div class="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
              <div class="px-5 py-3 bg-slate-50/70 border-b border-slate-100 flex items-center justify-between gap-2">
                <h3 class="font-semibold text-sm text-slate-800">${esc(sec.title)}</h3>
                <div class="flex items-center gap-2.5">
                  <span class="text-[11px] font-medium ${unanswered === 0 ? 'text-emerald-600' : 'text-slate-400'}">
                    ${unanswered === 0 ? 'ครบแล้ว' : `ว่าง ${unanswered}`}
                  </span>
                  <button
                    type="button"
                    data-pass-section="${sec.id}"
                    class="pass-sec-btn text-xs font-medium text-emerald-700 hover:underline"
                  >
                    ผ่านทั้งหมวด
                  </button>
                </div>
              </div>
              <div class="divide-y divide-slate-100/80">
                ${sec.items.map((item) => renderQuestionRow(item)).join('')}
              </div>
            </div>
          `;
        })
        .join('')}
    </div>
  `;
}

function renderQuestionRow(item) {
  const currentVal = draft.answers[item.id] || '';
  return `
    <div class="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:bg-slate-50/50 transition">
      <div class="text-sm text-slate-700 flex-1">
        ${esc(item.label)}
        ${!currentVal ? '<span class="text-rose-400 ml-1">•</span>' : ''}
      </div>
      <div class="flex flex-wrap items-center gap-1.5 shrink-0">
        ${item.options
          .map((opt) => {
            const active = currentVal === opt.value;
            let cls = 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-800';
            if (active) {
              if (opt.kind === 'pass') cls = 'bg-emerald-600 text-white border-emerald-600';
              else if (opt.kind === 'fail') cls = 'bg-rose-600 text-white border-rose-600';
              else cls = 'bg-slate-600 text-white border-slate-600';
            }
            return `
              <button
                type="button"
                data-qid="${item.id}"
                data-val="${esc(opt.value)}"
                class="ans-btn seg-btn px-3 py-1.5 rounded-lg border text-xs font-medium ${cls}"
              >
                ${esc(opt.label)}
              </button>
            `;
          })
          .join('')}
      </div>
    </div>
  `;
}

function renderHaitStep() {
  const haitSummary = computeAuditSummary(draft).modules.HAIT;
  return `
    <div class="space-y-4">
      <div class="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 flex items-center justify-between gap-3">
        <div>
          <h2 class="text-base sm:text-lg font-bold text-slate-900">เกณฑ์คะแนน HA IT</h2>
          <p class="text-xs text-slate-400">คำนวณคะแนนอัตโนมัติ (หักข้อ NA ออกจากคะแนนเต็ม)</p>
        </div>
        <div class="text-right">
          <div class="text-xl font-bold text-brand-700">${haitSummary.score} / ${haitSummary.maxApplicable}</div>
          <div class="text-xs text-slate-400">${haitSummary.pct ?? '-'}%</div>
        </div>
      </div>

      ${HAIT_ITEMS.map((item) => {
        const currentVal = draft.answers[item.id] ?? '';
        return `
          <div class="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-2.5">
            <div class="flex items-center justify-between gap-2">
              <h3 class="font-semibold text-sm text-slate-900">${esc(item.label)}</h3>
              <span class="text-[11px] text-slate-400 font-medium">เต็ม ${item.maxScore}</span>
            </div>
            ${item.hint ? `<p class="text-xs text-brand-700">${esc(item.hint)}</p>` : ''}

            <div class="space-y-1.5 pt-1">
              ${item.options
                .map((opt) => {
                  const active = String(currentVal) === String(opt.value);
                  let activeStyle = 'border-slate-200/80 bg-white hover:bg-slate-50 text-slate-600';
                  if (active) {
                    if (opt.kind === 'pass') activeStyle = 'border-emerald-500 bg-emerald-50/70 text-emerald-900 font-medium';
                    else if (opt.kind === 'fail') activeStyle = 'border-rose-500 bg-rose-50/70 text-rose-900 font-medium';
                    else if (opt.kind === 'na') activeStyle = 'border-slate-500 bg-slate-100 text-slate-900 font-medium';
                    else activeStyle = 'border-brand-600 bg-brand-50/70 text-brand-900 font-medium';
                  }
                  return `
                    <button
                      type="button"
                      data-qid="${item.id}"
                      data-val="${esc(opt.value)}"
                      class="ans-btn w-full text-left px-3.5 py-2 rounded-xl border text-xs sm:text-sm transition flex items-center gap-2.5 ${activeStyle}"
                    >
                      <span class="w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 ${active ? 'border-current' : 'border-slate-300'}">
                        ${active ? '<span class="w-1.5 h-1.5 rounded-full bg-current"></span>' : ''}
                      </span>
                      <span>${esc(opt.label)}</span>
                    </button>
                  `;
                })
                .join('')}
            </div>

            ${
              item.allowNote
                ? `<input id="inp-hait4-note" type="text" placeholder="หมายเหตุเพิ่มเติม (ถ้ามี)" value="${esc(draft.hait4Note || '')}" class="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs mt-1 focus:outline-none focus:ring-2 focus:ring-brand-500/30" />`
                : ''
            }
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderRiskStep() {
  return `
    <div class="space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-2 px-1">
        <h2 class="text-base sm:text-lg font-bold text-slate-900">ประเมินความเสี่ยง (Pain • Falling • Pressure Injury)</h2>
        <button
          type="button"
          id="btn-risk-all-none"
          class="px-3.5 py-1.5 rounded-xl bg-slate-800 text-white hover:bg-slate-900 text-xs font-medium flex items-center gap-1.5 transition"
        >
          <i data-lucide="zap" class="w-3.5 h-3.5"></i>
          ไม่มีปัญหาทั้ง 3 กลุ่ม
        </button>
      </div>

      ${RISK_GROUPS.map((grp) => {
        const allItems = [grp.screenItem, ...grp.followUpItems];
        return `
          <div class="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div class="px-5 py-3 bg-slate-50/70 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 class="font-semibold text-sm text-slate-900">${esc(grp.title)}</h3>
                <p class="text-[11px] text-slate-400">${esc(grp.hint)}</p>
              </div>
              <div class="flex items-center gap-2">
                <button type="button" data-risk-skip="${grp.id}" class="risk-skip-btn px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 text-xs font-medium">ไม่มีปัญหานี้</button>
                <button type="button" data-risk-pass="${grp.id}" class="risk-pass-btn px-2.5 py-1 rounded-lg border border-emerald-200 bg-emerald-50/70 text-emerald-700 hover:bg-emerald-100 text-xs font-medium">บันทึกถูกต้องครบ</button>
              </div>
            </div>
            <div class="divide-y divide-slate-100/80">
              ${allItems.map((item) => renderQuestionRow(item)).join('')}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderSummaryStep(summary) {
  const itemsMap = getAllItemsMap();
  const failedItems = [];
  for (const [id, val] of Object.entries(draft.answers)) {
    const meta = itemsMap.get(id);
    if (!meta) continue;
    if (meta.moduleCode !== 'NURSE_NOTE' && !draft.selectedModules.includes(meta.moduleCode)) continue;
    const opt = meta.options.find((o) => o.value === String(val));
    if (opt && (opt.kind === 'fail' || opt.kind === 'partial')) {
      failedItems.push({ label: meta.label, val: opt.label, moduleCode: meta.moduleCode });
    }
  }

  return `
    <div class="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 sm:p-7 space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <h2 class="text-base sm:text-lg font-bold text-slate-900">สรุปผลการประเมิน</h2>
          <p class="text-xs text-slate-500 mt-0.5">
            ID <strong class="font-mono">${esc(draft.nnId)}</strong> • ${formatThaiDate(draft.auditDate)} • ${esc(draft.unit || '-')} / ${esc(getEffectiveDraftRoom() || '-')}
          </p>
        </div>
        <div class="text-right">
          <div class="text-3xl font-bold ${summary.passed ? 'text-emerald-600' : 'text-rose-600'}">${summary.overallPct ?? '-'}%</div>
          <div class="text-[11px] text-slate-400">${summary.passed ? 'ผ่านเกณฑ์ (≥80%)' : 'ต้องปรับปรุง (<80%)'}</div>
        </div>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        ${Object.entries(summary.modules)
          .map(
            ([code, m]) => `
          <div class="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
            <div class="text-xs text-slate-500">${MODULE_META[code].shortName}</div>
            <div class="text-xl font-bold mt-1 ${m.pct === null ? 'text-slate-400' : m.pct >= PASS_THRESHOLD ? 'text-emerald-600' : 'text-rose-600'}">${m.pct ?? '-'}%</div>
            <div class="text-[11px] text-slate-400 mt-0.5">
              ${code === 'HAIT' ? `${m.score}/${m.maxApplicable} คะแนน` : `ผ่าน ${m.pass} • ไม่ผ่าน ${m.fail}`}
            </div>
          </div>
        `
          )
          .join('')}
      </div>

      ${
        failedItems.length > 0
          ? `
        <div class="rounded-xl border border-rose-100 bg-rose-50/50 p-4">
          <h3 class="text-xs font-bold text-rose-800 mb-2">ข้อบกพร่องที่พบ (${failedItems.length} รายการ)</h3>
          <ul class="space-y-1 text-xs text-rose-900 list-disc pl-5 max-h-44 overflow-y-auto">
            ${failedItems.map((f) => `<li><strong>[${MODULE_META[f.moduleCode].shortName}]</strong> ${esc(f.label)} (${esc(f.val)})</li>`).join('')}
          </ul>
        </div>
      `
          : `
        <div class="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3.5 text-xs font-medium text-emerald-700 flex items-center gap-2">
          <i data-lucide="check-circle-2" class="w-4 h-4"></i>
          ไม่พบข้อบกพร่องในข้อที่ประเมินทั้งหมด
        </div>
      `
      }

      <div class="space-y-2">
        <label class="block text-xs font-semibold text-slate-600">ข้อเสนอแนะ</label>
        <div class="flex flex-wrap gap-1.5">
          ${QUICK_FEEDBACK_CHIPS.map(
            (chip) => `
            <button type="button" data-chip="${esc(chip)}" class="chip-btn px-2.5 py-1 rounded-full text-[11px] border border-slate-200 bg-white text-slate-600 hover:border-brand-400 hover:text-brand-700 transition">
              + ${esc(chip)}
            </button>
          `
          ).join('')}
        </div>
        <textarea id="inp-feedback" rows="3" placeholder="ระบุข้อเสนอแนะเพิ่มเติม..." class="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40">${esc(draft.feedback || '')}</textarea>
      </div>
    </div>
  `;
}

function bindAuditEvents() {
  bindThaiDatePicker('audit-date', draft.auditDate, (iso) => {
    draft.auditDate = iso;
    render();
  });

  document.getElementById('inp-unit')?.addEventListener('change', (e) => {
    draft.unit = e.target.value;
    const rooms = getRoomsForUnit(draft.unit);
    draft.room = rooms.length === 1 ? rooms[0] : '';
    draft.customRoom = '';
    if (draft.unit === 'หน่วยผ่าตัดเล็ก' && !draft.selectedModules.includes('MINOR_OR')) {
      draft.selectedModules = ['MINOR_OR'];
    }
    render();
  });
  document.getElementById('inp-room')?.addEventListener('change', (e) => {
    draft.room = e.target.value;
    render();
  });
  document.getElementById('inp-custom-room')?.addEventListener('input', (e) => {
    draft.customRoom = e.target.value;
  });

  document.querySelectorAll('.module-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const code = btn.dataset.toggleModule;
      if (draft.selectedModules.includes(code)) {
        if (draft.selectedModules.length === 1) return;
        draft.selectedModules = draft.selectedModules.filter((m) => m !== code);
      } else {
        draft.selectedModules.push(code);
      }
      render();
    });
  });

  document.getElementById('inp-hn')?.addEventListener('input', (e) => {
    draft.hnInput = e.target.value;
  });
  document.getElementById('inp-auditor')?.addEventListener('input', (e) => {
    draft.auditor = e.target.value;
  });
  document.querySelectorAll('.ptype-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      draft.patientType = btn.dataset.ptype;
      applySilentAutoNa();
      render();
    });
  });
  document.getElementById('inp-gender')?.addEventListener('change', (e) => {
    draft.gender = e.target.value;
    applySilentAutoNa();
    render();
  });
  document.getElementById('inp-age')?.addEventListener('change', (e) => {
    draft.age = e.target.value;
    applySilentAutoNa();
    render();
  });
  document.getElementById('btn-reset-draft')?.addEventListener('click', () => {
    draft = createBlankDraft();
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  document.querySelectorAll('.ans-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      draft.answers[btn.dataset.qid] = btn.dataset.val;
      const y = window.scrollY;
      render();
      window.scrollTo(0, y);
    });
  });
  document.getElementById('inp-hait4-note')?.addEventListener('input', (e) => {
    draft.hait4Note = e.target.value;
  });

  document.querySelectorAll('.pass-sec-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const allSecs = [...NHSO_SECTIONS, ...MINOR_OR_SECTIONS, ...NURSE_NOTE_SECTIONS];
      const sec = allSecs.find((s) => s.id === btn.dataset.passSection);
      if (!sec) return;
      for (const item of sec.items) {
        const passOpt = item.options.find((o) => o.kind === 'pass');
        if (passOpt) draft.answers[item.id] = passOpt.value;
      }
      const y = window.scrollY;
      render();
      window.scrollTo(0, y);
    });
  });

  document.querySelectorAll('.pass-mod-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const code = btn.dataset.passModule;
      const secs =
        code === 'NHSO' ? NHSO_SECTIONS : code === 'MINOR_OR' ? MINOR_OR_SECTIONS : NURSE_NOTE_SECTIONS;
      for (const sec of secs) {
        for (const item of sec.items) {
          if (!draft.answers[item.id]) {
            const passOpt = item.options.find((o) => o.kind === 'pass');
            if (passOpt) draft.answers[item.id] = passOpt.value;
          }
        }
      }
      const y = window.scrollY;
      render();
      window.scrollTo(0, y);
    });
  });

  document.querySelectorAll('.risk-skip-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const grp = RISK_GROUPS.find((g) => g.id === btn.dataset.riskSkip);
      if (!grp) return;
      draft.answers[grp.screenItem.id] = 'ถูกต้อง';
      for (const f of grp.followUpItems) draft.answers[f.id] = 'ไม่มีปัญหานี้';
      const y = window.scrollY;
      render();
      window.scrollTo(0, y);
    });
  });
  document.querySelectorAll('.risk-pass-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const grp = RISK_GROUPS.find((g) => g.id === btn.dataset.riskPass);
      if (!grp) return;
      draft.answers[grp.screenItem.id] = 'ถูกต้อง';
      for (const f of grp.followUpItems) draft.answers[f.id] = 'ถูกต้อง';
      const y = window.scrollY;
      render();
      window.scrollTo(0, y);
    });
  });
  document.getElementById('btn-risk-all-none')?.addEventListener('click', () => {
    for (const grp of RISK_GROUPS) {
      draft.answers[grp.screenItem.id] = 'ถูกต้อง';
      for (const f of grp.followUpItems) draft.answers[f.id] = 'ไม่มีปัญหานี้';
    }
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
  });

  document.querySelectorAll('.chip-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const chip = btn.dataset.chip;
      draft.feedback = draft.feedback ? `${draft.feedback}; ${chip}` : chip;
      const y = window.scrollY;
      render();
      window.scrollTo(0, y);
    });
  });
  document.getElementById('inp-feedback')?.addEventListener('input', (e) => {
    draft.feedback = e.target.value;
  });

  const handleSave = async (startNext) => {
    const finalRoom = getEffectiveDraftRoom();
    if (!draft.unit || !finalRoom) {
      showToast('กรุณาเลือกหน่วยและห้องตรวจ', 'error');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // Encrypt optional HN with RSA-OAEP-256 Public Key (PDPA Safe — never store plaintext HN)
    let hnEncrypted = draft.hnEncrypted || '';
    if (draft.hnInput && draft.hnInput.trim()) {
      hnEncrypted = await encryptHn(draft.hnInput.trim());
    }

    const nnId = draft.nnId || generateNurseNoteId(draft.auditDate);
    const recordToSave = {
      ...draft,
      nnId,
      hnEncrypted,
      room: finalRoom,
      isNew: undefined,
      isDemo: false,
    };
    delete recordToSave.hnInput;
    delete recordToSave.hn;

    const summary = computeAuditSummary(recordToSave);
    audits = upsertAudit(recordToSave);
    await refreshDecryptedHnCache();

    const syncRes = await pushAuditToGoogleSheet(recordToSave, summary);
    const syncedMsg = syncRes.ok ? 'และส่งเข้า Google Sheet แล้ว' : 'เรียบร้อยแล้ว';

    if (startNext) {
      draft = createBlankDraft(draft);
      showToast(`บันทึก ${nnId} ${syncedMsg}`);
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      draft = createBlankDraft();
      currentView = 'history';
      showToast(`บันทึก ${nnId} ${syncedMsg}`);
      render();
    }
  };

  document.getElementById('btn-save-audit')?.addEventListener('click', () => handleSave(false));
  document.getElementById('btn-save-and-new')?.addEventListener('click', () => handleSave(true));
}

// ============================================================
// VIEW 2: EXECUTIVE DASHBOARD WITH CHARTS & % LABELS
// ============================================================
function getFilteredAuditsForDash() {
  return audits.filter((a) => {
    if (dashFilter.unit !== 'ALL' && a.unit !== dashFilter.unit) return false;
    if (dashFilter.room !== 'ALL' && a.room !== dashFilter.room) return false;
    if (dashFilter.module !== 'ALL' && !(a.selectedModules || []).includes(dashFilter.module)) return false;
    if (dashFilter.dateFrom && a.auditDate < dashFilter.dateFrom) return false;
    if (dashFilter.dateTo && a.auditDate > dashFilter.dateTo) return false;
    return true;
  });
}

function renderDashboardView() {
  const filtered = getFilteredAuditsForDash();
  const stats = computeDashboardStats(filtered);
  const availableRooms =
    dashFilter.unit === 'ALL'
      ? Array.from(new Set(audits.map((a) => a.room).filter(Boolean)))
      : Array.from(
          new Set([
            ...getRoomsForUnit(dashFilter.unit),
            ...audits.filter((a) => a.unit === dashFilter.unit).map((a) => a.room),
          ])
        ).filter(Boolean);

  const scopeTitle =
    dashFilter.room !== 'ALL'
      ? `${dashFilter.unit} › ${dashFilter.room}`
      : dashFilter.unit !== 'ALL'
        ? dashFilter.unit
        : 'ภาพรวมทุกหน่วย';

  return `
    <div class="space-y-6 pb-10">
      <!-- Minimal Filter Bar -->
      <div class="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 flex flex-wrap items-end justify-between gap-3">
        <div class="flex flex-wrap items-end gap-3">
          <div>
            <label class="block text-[11px] font-medium text-slate-400 mb-1">หน่วย</label>
            <select id="dash-unit" class="rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/30">
              <option value="ALL">ทุกหน่วย</option>
              ${OPD_UNITS.map((u) => `<option value="${esc(u.unit)}" ${dashFilter.unit === u.unit ? 'selected' : ''}>${esc(u.unit)}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="block text-[11px] font-medium text-slate-400 mb-1">ห้องตรวจ</label>
            <select id="dash-room" class="rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/30">
              <option value="ALL">ทุกห้องตรวจ</option>
              ${availableRooms.map((r) => `<option value="${esc(r)}" ${dashFilter.room === r ? 'selected' : ''}>${esc(r)}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="block text-[11px] font-medium text-slate-400 mb-1">เกณฑ์</label>
            <select id="dash-module" class="rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/30">
              <option value="ALL">ทุกเกณฑ์</option>
              <option value="NHSO" ${dashFilter.module === 'NHSO' ? 'selected' : ''}>OPD สปสช.</option>
              <option value="HAIT" ${dashFilter.module === 'HAIT' ? 'selected' : ''}>OPD HA IT</option>
              <option value="MINOR_OR" ${dashFilter.module === 'MINOR_OR' ? 'selected' : ''}>ห้องผ่าตัดเล็ก</option>
            </select>
          </div>
          <div>
            <label class="block text-[11px] font-medium text-slate-400 mb-1">ตั้งแต่วันที่ (พ.ศ.)</label>
            ${renderThaiDatePicker('dash-from', dashFilter.dateFrom, true)}
          </div>
          <div>
            <label class="block text-[11px] font-medium text-slate-400 mb-1">ถึงวันที่ (พ.ศ.)</label>
            ${renderThaiDatePicker('dash-to', dashFilter.dateTo, true)}
          </div>
        </div>

        <div class="flex items-center gap-2">
          ${
            dashFilter.unit !== 'ALL' || dashFilter.room !== 'ALL' || dashFilter.module !== 'ALL' || dashFilter.dateFrom || dashFilter.dateTo
              ? `<button id="btn-dash-clear" class="px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-500 hover:bg-slate-50">ล้างตัวกรอง</button>`
              : ''
          }
          <button id="btn-dash-pdf" class="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs sm:text-sm font-medium hover:bg-slate-800 flex items-center gap-1.5 transition">
            <i data-lucide="file-down" class="w-4 h-4"></i>
            Export PDF
          </button>
        </div>
      </div>

      <!-- KPI Summary Cards -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
          <div class="text-xs text-slate-400 font-medium">จำนวนชาร์ต (${esc(scopeTitle)})</div>
          <div class="text-3xl font-bold text-slate-900 mt-1.5">${stats.count} <span class="text-sm font-normal text-slate-400">HN</span></div>
        </div>
        <div class="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
          <div class="text-xs text-slate-400 font-medium">ความสมบูรณ์เฉลี่ยรวม</div>
          <div class="text-3xl font-bold mt-1.5 ${stats.avgOverall >= PASS_THRESHOLD ? 'text-brand-700' : 'text-rose-600'}">${stats.avgOverall}%</div>
        </div>
        <div class="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
          <div class="text-xs text-slate-400 font-medium">คะแนนเฉลี่ย Nurse Note</div>
          <div class="text-3xl font-bold mt-1.5 ${stats.avgNurseNote >= PASS_THRESHOLD ? 'text-emerald-600' : 'text-amber-600'}">${stats.avgNurseNote}%</div>
        </div>
        <div class="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
          <div class="text-xs text-slate-400 font-medium">อัตราผ่านเกณฑ์ (≥ ${PASS_THRESHOLD}%)</div>
          <div class="text-3xl font-bold text-slate-900 mt-1.5">${stats.passRate}%</div>
        </div>
      </div>

      <!-- Charts Row 1: Module Bar Chart + Pass Rate Doughnut -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div class="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-sm font-bold text-slate-800">ร้อยละความสมบูรณ์แยกตามหมวดเกณฑ์ (%)</h3>
            <span class="text-xs text-slate-400">เกณฑ์มาตรฐาน ${PASS_THRESHOLD}%</span>
          </div>
          <div class="h-64 relative">
            <canvas id="chart-modules"></canvas>
          </div>
        </div>

        <div class="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 flex flex-col">
          <h3 class="text-sm font-bold text-slate-800 mb-2">สัดส่วนผ่านเกณฑ์ vs ต้องปรับปรุง</h3>
          <div class="flex-1 h-64 relative flex items-center justify-center">
            <canvas id="chart-pass-doughnut"></canvas>
          </div>
        </div>
      </div>

      <!-- Charts Row 2: Unit/Room Horizontal Bar + Trend Line -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div class="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-sm font-bold text-slate-800">
              ${dashFilter.unit === 'ALL' ? 'เปรียบเทียบ % แยกตามหน่วย' : `เปรียบเทียบ % รายห้องตรวจ (${esc(dashFilter.unit)})`}
            </h3>
            <span class="text-xs text-slate-400">คลิกกรองจากตัวเลือกด้านบน</span>
          </div>
          <div class="h-64 relative">
            <canvas id="chart-unit-room"></canvas>
          </div>
        </div>

        <div class="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-sm font-bold text-slate-800">แนวโน้ม % ความสมบูรณ์ตามวันที่ (พ.ศ.)</h3>
            <span class="text-xs text-slate-400">คะแนนรวม vs Nurse Note</span>
          </div>
          <div class="h-64 relative">
            <canvas id="chart-trend"></canvas>
          </div>
        </div>
      </div>

      <!-- Top Deficiencies (Minimal CQI List) -->
      <div class="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5">
        <h3 class="text-sm font-bold text-slate-800 mb-3">ประเด็นที่ขาดการบันทึก / ไม่ถูกต้องบ่อยที่สุด (CQI)</h3>
        ${
          stats.topDeficiencies.length === 0
            ? '<p class="text-xs text-emerald-700 bg-emerald-50/70 p-3.5 rounded-xl">ไม่พบข้อบกพร่องในชุดข้อมูลที่เลือก</p>'
            : `
          <div class="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            ${stats.topDeficiencies
              .map((d, i) => {
                const pct = Math.round((d.count / stats.count) * 100);
                return `
                  <div class="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-slate-50/80 border border-slate-100">
                    <div class="flex items-center gap-2.5 min-w-0">
                      <span class="w-5 h-5 rounded-full bg-rose-100 text-rose-700 text-[11px] font-bold flex items-center justify-center shrink-0">${i + 1}</span>
                      <div class="min-w-0">
                        <div class="text-xs font-medium text-slate-800 truncate" title="${esc(d.label)}">${esc(d.label)}</div>
                        <div class="text-[11px] text-slate-400">${MODULE_META[d.moduleCode].shortName}</div>
                      </div>
                    </div>
                    <span class="text-xs font-bold text-rose-600 shrink-0">${pct}% (${d.count})</span>
                  </div>
                `;
              })
              .join('')}
          </div>
        `
        }
      </div>
    </div>
  `;
}

function renderDashboardCharts() {
  if (!window.Chart) return;
  const filtered = getFilteredAuditsForDash();
  const stats = computeDashboardStats(filtered);
  const fontFamily = '"IBM Plex Sans Thai", sans-serif';

  // 1. Module Bar Chart
  const modCtx = document.getElementById('chart-modules');
  if (modCtx) {
    const modLabels = ['Nurse Note', 'OPD สปสช.', 'OPD HA IT', 'ห้องผ่าตัดเล็ก'];
    const modValues = [
      stats.avgNurseNote ?? 0,
      stats.avgNhso ?? 0,
      stats.avgHait ?? 0,
      stats.avgMinorOr ?? 0,
    ];
    const modColors = modValues.map((v) => (v === 0 ? '#e2e8f0' : v >= PASS_THRESHOLD ? '#0d9488' : '#f43f5e'));

    chartInstances.modules = new window.Chart(modCtx, {
      type: 'bar',
      data: {
        labels: modLabels,
        datasets: [
          {
            data: modValues,
            backgroundColor: modColors,
            borderRadius: 10,
            maxBarThickness: 54,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          datalabels: {
            anchor: 'end',
            align: 'top',
            color: '#334155',
            font: { family: fontFamily, weight: 'bold', size: 12 },
            formatter: (v) => (v > 0 ? `${v}%` : '-'),
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 112,
            ticks: { callback: (v) => (v <= 100 ? `${v}%` : ''), font: { family: fontFamily, size: 11 } },
            grid: { color: '#f1f5f9' },
            border: { display: false },
          },
          x: {
            ticks: { font: { family: fontFamily, size: 12 } },
            grid: { display: false },
            border: { display: false },
          },
        },
      },
    });
  }

  // 2. Pass Rate Doughnut
  const donutCtx = document.getElementById('chart-pass-doughnut');
  if (donutCtx) {
    chartInstances.doughnut = new window.Chart(donutCtx, {
      type: 'doughnut',
      data: {
        labels: [`ผ่านเกณฑ์ (≥${PASS_THRESHOLD}%)`, 'ต้องปรับปรุง'],
        datasets: [
          {
            data: stats.count > 0 ? [stats.passedCount, stats.failedCount] : [1, 0],
            backgroundColor: stats.count > 0 ? ['#10b981', '#f43f5e'] : ['#e2e8f0', '#e2e8f0'],
            borderWidth: 0,
            hoverOffset: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '66%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { font: { family: fontFamily, size: 12 }, usePointStyle: true, padding: 14 },
          },
          datalabels: {
            color: '#ffffff',
            font: { family: fontFamily, weight: 'bold', size: 12 },
            formatter: (v) => {
              if (!stats.count || v === 0) return '';
              return `${Math.round((v / stats.count) * 100)}%`;
            },
          },
        },
      },
    });
  }

  // 3. Unit / Room Horizontal Bar Chart
  const urCtx = document.getElementById('chart-unit-room');
  if (urCtx) {
    let labels = [];
    let values = [];
    if (dashFilter.unit === 'ALL') {
      labels = stats.byUnit.map((u) => u.unit);
      values = stats.byUnit.map((u) => u.avgOverall);
    } else {
      const targetUnit = stats.byUnit.find((u) => u.unit === dashFilter.unit);
      labels = targetUnit ? targetUnit.rooms.map((r) => r.room) : [];
      values = targetUnit ? targetUnit.rooms.map((r) => r.avgOverall) : [];
    }

    chartInstances.unitRoom = new window.Chart(urCtx, {
      type: 'bar',
      data: {
        labels: labels.length ? labels : ['ยังไม่มีข้อมูล'],
        datasets: [
          {
            data: values.length ? values : [0],
            backgroundColor: values.map((v) => (v >= PASS_THRESHOLD ? '#14b8a6' : '#fb7185')),
            borderRadius: 8,
            maxBarThickness: 28,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          datalabels: {
            anchor: 'end',
            align: 'right',
            color: '#334155',
            font: { family: fontFamily, weight: 'bold', size: 11 },
            formatter: (v) => (v > 0 ? `${v}%` : ''),
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            max: 115,
            ticks: { callback: (v) => (v <= 100 ? `${v}%` : ''), font: { family: fontFamily, size: 11 } },
            grid: { color: '#f1f5f9' },
            border: { display: false },
          },
          y: {
            ticks: { font: { family: fontFamily, size: 11 } },
            grid: { display: false },
            border: { display: false },
          },
        },
      },
    });
  }

  // 4. Trend Line Chart
  const trendCtx = document.getElementById('chart-trend');
  if (trendCtx) {
    chartInstances.trend = new window.Chart(trendCtx, {
      type: 'line',
      data: {
        labels: stats.byDate.map((d) => d.thaiDate),
        datasets: [
          {
            label: 'คะแนนรวม (%)',
            data: stats.byDate.map((d) => d.avgOverall),
            borderColor: '#0f766e',
            backgroundColor: 'rgba(15, 118, 110, 0.1)',
            fill: true,
            tension: 0.35,
            pointRadius: 4,
          },
          {
            label: 'Nurse Note (%)',
            data: stats.byDate.map((d) => d.avgNurseNote),
            borderColor: '#6366f1',
            backgroundColor: 'transparent',
            borderDash: [4, 4],
            tension: 0.35,
            pointRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { font: { family: fontFamily, size: 11 }, usePointStyle: true },
          },
          datalabels: {
            align: 'top',
            color: '#475569',
            font: { family: fontFamily, size: 10, weight: '600' },
            formatter: (v) => `${v}%`,
          },
        },
        scales: {
          y: {
            min: 0,
            max: 112,
            ticks: { callback: (v) => (v <= 100 ? `${v}%` : ''), font: { family: fontFamily, size: 11 } },
            grid: { color: '#f1f5f9' },
            border: { display: false },
          },
          x: {
            ticks: { font: { family: fontFamily, size: 11 } },
            grid: { display: false },
            border: { display: false },
          },
        },
      },
    });
  }
}

function bindDashboardEvents() {
  document.getElementById('dash-unit')?.addEventListener('change', (e) => {
    dashFilter.unit = e.target.value;
    dashFilter.room = 'ALL';
    render();
  });
  document.getElementById('dash-room')?.addEventListener('change', (e) => {
    dashFilter.room = e.target.value;
    render();
  });
  document.getElementById('dash-module')?.addEventListener('change', (e) => {
    dashFilter.module = e.target.value;
    render();
  });
  bindThaiDatePicker('dash-from', dashFilter.dateFrom, (iso) => {
    dashFilter.dateFrom = iso;
    render();
  }, true);
  bindThaiDatePicker('dash-to', dashFilter.dateTo, (iso) => {
    dashFilter.dateTo = iso;
    render();
  }, true);

  document.getElementById('btn-dash-clear')?.addEventListener('click', () => {
    dashFilter = { unit: 'ALL', room: 'ALL', module: 'ALL', dateFrom: '', dateTo: '' };
    render();
  });
  document.getElementById('btn-dash-pdf')?.addEventListener('click', () => {
    exportDashboardPdf();
  });
}

// ============================================================
// VIEW 3: HISTORY & EXPORT (PDF + EXCEL + GOOGLE SHEET SYNC)
// ============================================================
function getFilteredAuditsForHistory() {
  const q = historyFilter.search.trim().toLowerCase();
  return audits.filter((a) => {
    if (historyFilter.unit !== 'ALL' && a.unit !== historyFilter.unit) return false;
    if (historyFilter.room !== 'ALL' && a.room !== historyFilter.room) return false;
    if (historyFilter.module !== 'ALL' && !(a.selectedModules || []).includes(historyFilter.module)) return false;
    if (!q) return true;
    const decHn = decryptedHnCache.get(a.id) || '';
    return (
      (a.nnId || a.id || '').toLowerCase().includes(q) ||
      decHn.toLowerCase().includes(q) ||
      (a.unit || '').toLowerCase().includes(q) ||
      (a.room || '').toLowerCase().includes(q) ||
      (a.auditor || '').toLowerCase().includes(q) ||
      (a.feedback || '').toLowerCase().includes(q)
    );
  });
}

function renderHistoryView() {
  const filtered = getFilteredAuditsForHistory();
  const availableRooms =
    historyFilter.unit === 'ALL'
      ? Array.from(new Set(audits.map((a) => a.room).filter(Boolean)))
      : Array.from(
          new Set([
            ...getRoomsForUnit(historyFilter.unit),
            ...audits.filter((a) => a.unit === historyFilter.unit).map((a) => a.room),
          ])
        ).filter(Boolean);

  const hasDemo = audits.some((a) => a.isDemo);
  const adminUnlocked = isAdminUnlocked();

  return `
    <div class="space-y-5 pb-10">
      <div class="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 space-y-3">
        <div class="flex flex-wrap items-center gap-2">
          <div class="relative flex-1 min-w-[200px]">
            <i data-lucide="search" class="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5"></i>
            <input id="hist-search" type="text" placeholder="${adminUnlocked ? 'ค้นหา Nurse Note ID, HN, หน่วย, ห้องตรวจ...' : 'ค้นหา Nurse Note ID, หน่วย, ห้องตรวจ, ผู้ประเมิน...'}" value="${esc(historyFilter.search)}" class="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
          </div>
          <select id="hist-unit" class="rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white">
            <option value="ALL">ทุกหน่วย</option>
            ${OPD_UNITS.map((u) => `<option value="${esc(u.unit)}" ${historyFilter.unit === u.unit ? 'selected' : ''}>${esc(u.unit)}</option>`).join('')}
          </select>
          <select id="hist-room" class="rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white">
            <option value="ALL">ทุกห้องตรวจ</option>
            ${availableRooms.map((r) => `<option value="${esc(r)}" ${historyFilter.room === r ? 'selected' : ''}>${esc(r)}</option>`).join('')}
          </select>
          <select id="hist-module" class="rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white">
            <option value="ALL">ทุกเกณฑ์</option>
            <option value="NHSO" ${historyFilter.module === 'NHSO' ? 'selected' : ''}>OPD สปสช.</option>
            <option value="HAIT" ${historyFilter.module === 'HAIT' ? 'selected' : ''}>OPD HA IT</option>
            <option value="MINOR_OR" ${historyFilter.module === 'MINOR_OR' ? 'selected' : ''}>ห้องผ่าตัดเล็ก</option>
          </select>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
          <span class="text-xs text-slate-400">แสดง ${filtered.length} รายการ</span>
          <div class="flex flex-wrap items-center gap-2">
            ${
              adminUnlocked
                ? `<button id="btn-admin-lock" class="px-3 py-1.5 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-medium hover:bg-emerald-100 flex items-center gap-1.5">
                    <i data-lucide="unlock" class="w-3.5 h-3.5"></i>
                    Admin ปลดล็อก HN อยู่ (คลิกเพื่อล็อก)
                  </button>`
                : `<button id="btn-admin-unlock" class="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-600 text-xs font-medium hover:bg-slate-100 flex items-center gap-1.5">
                    <i data-lucide="lock" class="w-3.5 h-3.5"></i>
                    ปลดล็อก HN (Admin)
                  </button>`
            }
            ${
              hasDemo
                ? `<button id="btn-clear-demo" class="px-3 py-1.5 rounded-xl border border-amber-200 bg-amber-50 text-amber-700 text-xs font-medium hover:bg-amber-100">ล้างข้อมูลตัวอย่าง</button>`
                : ''
            }
            ${
              GOOGLE_SHEET_CONFIG.webAppUrl
                ? `<button id="btn-sync-sheet" class="px-3 py-1.5 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-medium hover:bg-emerald-100 flex items-center gap-1">
                    <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>
                    ดึงข้อมูลจาก Sheet
                  </button>`
                : ''
            }
            <button id="btn-hist-excel" class="px-3.5 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-medium hover:bg-slate-50 flex items-center gap-1.5">
              <i data-lucide="file-spreadsheet" class="w-3.5 h-3.5 text-emerald-600"></i>
              Export Excel
            </button>
            <button id="btn-hist-pdf" class="px-3.5 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 flex items-center gap-1.5">
              <i data-lucide="file-down" class="w-3.5 h-3.5"></i>
              Export PDF
            </button>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="bg-slate-50/80 border-b border-slate-100 text-[11px] font-semibold text-slate-400 uppercase">
                <th class="px-4 py-3">วันที่ (พ.ศ.)</th>
                <th class="px-4 py-3">${adminUnlocked ? 'Nurse Note ID / HN' : 'Nurse Note ID'}</th>
                <th class="px-4 py-3">หน่วย / ห้องตรวจ</th>
                <th class="px-4 py-3">เกณฑ์</th>
                <th class="px-4 py-3 text-center">Nurse Note</th>
                <th class="px-4 py-3 text-center">รวม</th>
                <th class="px-4 py-3 text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 text-sm">
              ${
                filtered.length === 0
                  ? `<tr><td colspan="7" class="px-4 py-12 text-center text-sm text-slate-400">ไม่พบรายการประเมิน</td></tr>`
                  : filtered
                      .map((a) => {
                        const s = computeAuditSummary(a);
                        const nnId = a.nnId || a.id;
                        const decHn = adminUnlocked ? decryptedHnCache.get(a.id) : '';
                        return `
                          <tr class="hover:bg-slate-50/60 transition">
                            <td class="px-4 py-3 whitespace-nowrap text-xs text-slate-500">${formatThaiDate(a.auditDate)}</td>
                            <td class="px-4 py-3 whitespace-nowrap">
                              <div class="font-mono text-xs font-semibold text-slate-900">
                                ${esc(nnId)}
                                ${a.isDemo ? '<span class="ml-1 font-sans text-[10px] bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded">ตัวอย่าง</span>' : ''}
                              </div>
                              ${
                                adminUnlocked
                                  ? `<div class="text-[11px] mt-0.5 ${decHn ? 'text-emerald-700 font-semibold' : 'text-slate-400'}">${decHn ? `HN: ${esc(decHn)}` : (a.hnEncrypted ? 'ถอดรหัสไม่ได้' : 'ไม่ได้ระบุ HN')}</div>`
                                  : a.hnEncrypted
                                    ? '<div class="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1"><i data-lucide="lock" class="w-2.5 h-2.5"></i> มี HN เข้ารหัส</div>'
                                    : ''
                              }
                            </td>
                            <td class="px-4 py-3">
                              <div class="text-xs font-semibold text-slate-800">${esc(a.unit || '-')}</div>
                              <div class="text-[11px] text-slate-400">${esc(a.room || '-')}</div>
                            </td>
                            <td class="px-4 py-3">
                              <div class="flex flex-wrap gap-1">
                                ${(a.selectedModules || [])
                                  .map((m) => `<span class="text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">${MODULE_META[m].shortName}</span>`)
                                  .join('')}
                              </div>
                            </td>
                            <td class="px-4 py-3 text-center">
                              <span class="px-2 py-0.5 rounded-md text-xs font-semibold ${scoreBadgeClass(s.modules.NURSE_NOTE.pct)}">${s.modules.NURSE_NOTE.pct ?? '-'}%</span>
                            </td>
                            <td class="px-4 py-3 text-center">
                              <span class="px-2.5 py-0.5 rounded-md text-xs font-bold ${scoreBadgeClass(s.overallPct)}">${s.overallPct ?? '-'}%</span>
                            </td>
                            <td class="px-4 py-3 text-right whitespace-nowrap">
                              <button data-view-id="${a.id}" class="btn-view-detail p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-brand-700" title="ดูรายละเอียด / PDF">
                                <i data-lucide="file-text" class="w-4 h-4"></i>
                              </button>
                              <button data-edit-id="${a.id}" class="btn-edit-audit p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="แก้ไข">
                                <i data-lucide="pencil" class="w-4 h-4"></i>
                              </button>
                              <button data-del-id="${a.id}" class="btn-del-audit p-1.5 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="ลบ">
                                <i data-lucide="trash-2" class="w-4 h-4"></i>
                              </button>
                            </td>
                          </tr>
                        `;
                      })
                      .join('')
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function bindHistoryEvents() {
  document.getElementById('hist-search')?.addEventListener('input', (e) => {
    historyFilter.search = e.target.value;
    render();
    const inp = document.getElementById('hist-search');
    if (inp) {
      inp.focus();
      inp.setSelectionRange(inp.value.length, inp.value.length);
    }
  });
  document.getElementById('hist-unit')?.addEventListener('change', (e) => {
    historyFilter.unit = e.target.value;
    historyFilter.room = 'ALL';
    render();
  });
  document.getElementById('hist-room')?.addEventListener('change', (e) => {
    historyFilter.room = e.target.value;
    render();
  });
  document.getElementById('hist-module')?.addEventListener('change', (e) => {
    historyFilter.module = e.target.value;
    render();
  });
  document.getElementById('btn-admin-unlock')?.addEventListener('click', () => {
    openAdminUnlockModal();
  });
  document.getElementById('btn-admin-lock')?.addEventListener('click', () => {
    lockAdmin();
    decryptedHnCache.clear();
    showToast('ล็อกข้อมูล HN เรียบร้อยแล้ว', 'info');
    render();
  });
  document.getElementById('btn-clear-demo')?.addEventListener('click', () => {
    if (confirm('ต้องการลบข้อมูลตัวอย่างทั้งหมดหรือไม่?')) {
      audits = clearDemoAudits();
      showToast('ล้างข้อมูลตัวอย่างแล้ว');
      render();
    }
  });
  document.getElementById('btn-sync-sheet')?.addEventListener('click', async () => {
    showToast('กำลังดึงข้อมูลจาก Google Sheet...', 'info');
    const res = await pullAuditsFromGoogleSheet();
    if (res.ok) {
      const existingIds = new Set(audits.map((a) => a.id));
      let added = 0;
      for (const r of res.records) {
        if (r && r.id && !existingIds.has(r.id)) {
          audits.unshift(r);
          added++;
        }
      }
      saveAudits(audits);
      await refreshDecryptedHnCache();
      showToast(added > 0 ? `ดึงข้อมูลใหม่จาก Google Sheet เพิ่ม ${added} รายการ` : 'ข้อมูลเป็นปัจจุบันแล้ว');
      render();
    } else {
      showToast('ไม่สามารถเชื่อมต่อ Google Sheet ได้', 'error');
    }
  });
  document.getElementById('btn-hist-excel')?.addEventListener('click', () => {
    exportAuditsToExcel(
      getFilteredAuditsForHistory(),
      'NurseNote_Audit',
      isAdminUnlocked() ? decryptedHnCache : null
    );
    showToast('ส่งออกไฟล์ Excel เรียบร้อยแล้ว');
  });
  document.getElementById('btn-hist-pdf')?.addEventListener('click', () => {
    exportHistoryPdf(getFilteredAuditsForHistory());
  });

  document.querySelectorAll('.btn-view-detail').forEach((btn) => {
    btn.addEventListener('click', () => {
      const rec = audits.find((a) => a.id === btn.dataset.viewId);
      if (rec) openDetailModal(rec);
    });
  });
  document.querySelectorAll('.btn-edit-audit').forEach((btn) => {
    btn.addEventListener('click', () => {
      const rec = audits.find((a) => a.id === btn.dataset.editId);
      if (rec) {
        draft = JSON.parse(JSON.stringify(rec));
        draft.isNew = false;
        draft.hnInput = isAdminUnlocked() ? decryptedHnCache.get(rec.id) || '' : '';
        const unitRooms = getRoomsForUnit(draft.unit);
        if (draft.room && !unitRooms.includes(draft.room)) {
          draft.customRoom = draft.room;
          draft.room = 'อื่นๆ';
        }
        currentView = 'audit';
        render();
      }
    });
  });
  document.querySelectorAll('.btn-del-audit').forEach((btn) => {
    btn.addEventListener('click', () => {
      const rec = audits.find((a) => a.id === btn.dataset.delId);
      if (rec && confirm(`ลบผลการประเมิน ${rec.nnId || rec.id} วันที่ ${formatThaiDate(rec.auditDate)}?`)) {
        audits = deleteAudit(rec.id);
        decryptedHnCache.delete(rec.id);
        showToast('ลบรายการแล้ว');
        render();
      }
    });
  });
}

function openAdminUnlockModal() {
  const modal = document.getElementById('modal-root');
  modal.classList.remove('hidden');
  modal.innerHTML = `
    <div class="bg-white rounded-2xl max-w-sm w-full shadow-2xl overflow-hidden border border-slate-200">
      <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <i data-lucide="shield-check" class="w-4 h-4 text-brand-700"></i>
          <h3 class="font-bold text-sm text-slate-900">ปลดล็อกดู HN (Admin)</h3>
        </div>
        <button id="btn-close-admin" class="p-1 rounded-lg text-slate-400 hover:bg-slate-100">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>
      <form id="form-admin-unlock" class="p-5 space-y-4">
        <p class="text-xs text-slate-500">กรอกรหัสผ่าน Admin เพื่อถอดรหัสดู HN ชั่วคราว (รหัสจะไม่ถูกบันทึกไว้ในเครื่อง เมื่อปิดหรือรีเฟรชจะล็อกอัตโนมัติ)</p>
        <input id="inp-admin-pass" type="password" autocomplete="off" placeholder="รหัสผ่าน Admin" class="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
        <div class="flex justify-end gap-2">
          <button type="button" id="btn-cancel-admin" class="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50">ยกเลิก</button>
          <button type="submit" id="btn-submit-admin" class="px-4 py-2 rounded-xl bg-brand-700 text-white text-xs font-medium hover:bg-brand-800">ปลดล็อก</button>
        </div>
      </form>
    </div>
  `;
  if (window.lucide) window.lucide.createIcons();
  const close = () => modal.classList.add('hidden');
  document.getElementById('btn-close-admin')?.addEventListener('click', close);
  document.getElementById('btn-cancel-admin')?.addEventListener('click', close);
  document.getElementById('inp-admin-pass')?.focus();

  document.getElementById('form-admin-unlock')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pass = document.getElementById('inp-admin-pass')?.value || '';
    const btn = document.getElementById('btn-submit-admin');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'กำลังตรวจสอบ...';
    }
    try {
      const ok = await unlockAdmin(pass);
      if (ok) {
        await refreshDecryptedHnCache();
        close();
        showToast('ปลดล็อกสิทธิ์ Admin แล้ว — แสดง HN ที่เข้ารหัสไว้');
        render();
      } else {
        showToast('รหัสผ่าน Admin ไม่ถูกต้อง', 'error');
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'ปลดล็อก';
        }
      }
    } catch {
      showToast('เกิดข้อผิดพลาดในการถอดรหัส', 'error');
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'ปลดล็อก';
      }
    }
  });
}

// ============================================================
// DEDICATED A4 PDF EXPORT GENERATORS (100% Crisp Thai Fonts)
// ============================================================
function triggerPdfPrint(htmlContent) {
  const area = document.getElementById('pdf-print-area');
  area.innerHTML = htmlContent;
  setTimeout(() => {
    window.print();
  }, 150);
}

function exportDashboardPdf() {
  const filtered = getFilteredAuditsForDash();
  const stats = computeDashboardStats(filtered);
  const scopeLabel = [
    dashFilter.unit !== 'ALL' ? dashFilter.unit : 'ทุกหน่วย',
    dashFilter.room !== 'ALL' ? dashFilter.room : 'ทุกห้องตรวจ',
    dashFilter.module !== 'ALL' ? MODULE_META[dashFilter.module].shortName : 'ทุกเกณฑ์',
  ].join(' • ');

  const modImg = chartInstances.modules ? chartInstances.modules.toBase64Image() : '';
  const donutImg = chartInstances.doughnut ? chartInstances.doughnut.toBase64Image() : '';
  const urImg = chartInstances.unitRoom ? chartInstances.unitRoom.toBase64Image() : '';
  const trendImg = chartInstances.trend ? chartInstances.trend.toBase64Image() : '';

  const html = `
    <div style="font-family: 'IBM Plex Sans Thai', sans-serif; color: #0f172a;">
      <div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid #0f766e; padding-bottom:10px; margin-bottom:16px;">
        <div>
          <h1 style="font-size:18px; font-weight:700; margin:0;">รายงานสรุปผลการประเมินคุณภาพเวชระเบียนและ Nurse Note</h1>
          <p style="font-size:12px; color:#475569; margin:4px 0 0;">โรงพยาบาลมหาราชนครเชียงใหม่ • ขอบเขต: ${esc(scopeLabel)}</p>
        </div>
        <div style="text-align:right; font-size:11px; color:#64748b;">
          วันที่ออกรายงาน: ${formatThaiDate(getTodayIso())}
        </div>
      </div>

      <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-bottom:16px;">
        <div style="border:1px solid #e2e8f0; border-radius:10px; padding:10px;">
          <div style="font-size:11px; color:#64748b;">จำนวนชาร์ต</div>
          <div style="font-size:20px; font-weight:700;">${stats.count} HN</div>
        </div>
        <div style="border:1px solid #e2e8f0; border-radius:10px; padding:10px;">
          <div style="font-size:11px; color:#64748b;">ความสมบูรณ์รวม</div>
          <div style="font-size:20px; font-weight:700; color:#0f766e;">${stats.avgOverall}%</div>
        </div>
        <div style="border:1px solid #e2e8f0; border-radius:10px; padding:10px;">
          <div style="font-size:11px; color:#64748b;">เฉลี่ย Nurse Note</div>
          <div style="font-size:20px; font-weight:700; color:#059669;">${stats.avgNurseNote}%</div>
        </div>
        <div style="border:1px solid #e2e8f0; border-radius:10px; padding:10px;">
          <div style="font-size:11px; color:#64748b;">ผ่านเกณฑ์ (≥80%)</div>
          <div style="font-size:20px; font-weight:700;">${stats.passRate}%</div>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:1.6fr 1fr; gap:12px; margin-bottom:14px;" class="print-avoid-break">
        <div style="border:1px solid #e2e8f0; border-radius:10px; padding:10px;">
          <div style="font-size:12px; font-weight:700; margin-bottom:6px;">ร้อยละความสมบูรณ์รายหมวดเกณฑ์</div>
          ${modImg ? `<img src="${modImg}" style="width:100%; height:180px; object-fit:contain;" />` : ''}
        </div>
        <div style="border:1px solid #e2e8f0; border-radius:10px; padding:10px;">
          <div style="font-size:12px; font-weight:700; margin-bottom:6px;">สัดส่วนผ่านเกณฑ์</div>
          ${donutImg ? `<img src="${donutImg}" style="width:100%; height:180px; object-fit:contain;" />` : ''}
        </div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px;" class="print-avoid-break">
        <div style="border:1px solid #e2e8f0; border-radius:10px; padding:10px;">
          <div style="font-size:12px; font-weight:700; margin-bottom:6px;">เปรียบเทียบ % แยกตามหน่วย/ห้องตรวจ</div>
          ${urImg ? `<img src="${urImg}" style="width:100%; height:180px; object-fit:contain;" />` : ''}
        </div>
        <div style="border:1px solid #e2e8f0; border-radius:10px; padding:10px;">
          <div style="font-size:12px; font-weight:700; margin-bottom:6px;">แนวโน้ม % ตามวันที่ (พ.ศ.)</div>
          ${trendImg ? `<img src="${trendImg}" style="width:100%; height:180px; object-fit:contain;" />` : ''}
        </div>
      </div>

      ${
        stats.topDeficiencies.length
          ? `
        <div style="border:1px solid #e2e8f0; border-radius:10px; padding:12px;" class="print-avoid-break">
          <div style="font-size:12px; font-weight:700; margin-bottom:8px;">ประเด็นที่ขาดการบันทึก/ไม่ถูกต้องบ่อยที่สุด (CQI)</div>
          <table style="width:100%; border-collapse:collapse; font-size:11px;">
            <thead>
              <tr style="background:#f8fafc; border-bottom:1px solid #e2e8f0;">
                <th style="text-align:left; padding:5px;">ลำดับ</th>
                <th style="text-align:left; padding:5px;">รายการ</th>
                <th style="text-align:left; padding:5px;">หมวด</th>
                <th style="text-align:right; padding:5px;">ความถี่</th>
              </tr>
            </thead>
            <tbody>
              ${stats.topDeficiencies
                .map(
                  (d, idx) => `
                <tr style="border-bottom:1px solid #f1f5f9;">
                  <td style="padding:5px;">${idx + 1}</td>
                  <td style="padding:5px;">${esc(d.label)}</td>
                  <td style="padding:5px;">${MODULE_META[d.moduleCode].shortName}</td>
                  <td style="padding:5px; text-align:right; font-weight:700; color:#e11d48;">${d.count} ครั้ง (${Math.round((d.count / stats.count) * 100)}%)</td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      `
          : ''
      }
    </div>
  `;
  triggerPdfPrint(html);
}

function exportHistoryPdf(list) {
  const adminUnlocked = isAdminUnlocked();
  const html = `
    <div style="font-family: 'IBM Plex Sans Thai', sans-serif; color: #0f172a;">
      <div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid #0f766e; padding-bottom:10px; margin-bottom:14px;">
        <div>
          <h1 style="font-size:17px; font-weight:700; margin:0;">ทะเบียนประวัติการประเมินคุณภาพเวชระเบียนและ Nurse Note</h1>
          <p style="font-size:11px; color:#475569; margin:4px 0 0;">โรงพยาบาลมหาราชนครเชียงใหม่ • จำนวนทั้งหมด ${list.length} รายการ</p>
        </div>
        <div style="font-size:11px; color:#64748b;">วันที่พิมพ์: ${formatThaiDate(getTodayIso())}</div>
      </div>

      <table style="width:100%; border-collapse:collapse; font-size:11px;">
        <thead>
          <tr style="background:#f1f5f9; border-bottom:1.5px solid #cbd5e1;">
            <th style="text-align:left; padding:6px;">วันที่ (พ.ศ.)</th>
            <th style="text-align:left; padding:6px;">${adminUnlocked ? 'Nurse Note ID / HN' : 'Nurse Note ID'}</th>
            <th style="text-align:left; padding:6px;">หน่วย / ห้องตรวจ</th>
            <th style="text-align:left; padding:6px;">เกณฑ์</th>
            <th style="text-align:right; padding:6px;">Nurse Note</th>
            <th style="text-align:right; padding:6px;">รวม</th>
            <th style="text-align:left; padding:6px;">ข้อเสนอแนะ</th>
          </tr>
        </thead>
        <tbody>
          ${list
            .map((a) => {
              const s = computeAuditSummary(a);
              const decHn = adminUnlocked ? decryptedHnCache.get(a.id) : '';
              return `
                <tr style="border-bottom:1px solid #e2e8f0;">
                  <td style="padding:6px; white-space:nowrap;">${formatThaiDate(a.auditDate)}</td>
                  <td style="padding:6px; font-weight:700;">${esc(a.nnId || a.id)}${decHn ? `<br/><span style="font-weight:400; color:#047857;">HN: ${esc(decHn)}</span>` : ''}</td>
                  <td style="padding:6px;">${esc(a.unit || '-')} / ${esc(a.room || '-')}</td>
                  <td style="padding:6px;">${(a.selectedModules || []).map((m) => MODULE_META[m].shortName).join(', ')}</td>
                  <td style="padding:6px; text-align:right;">${s.modules.NURSE_NOTE.pct ?? '-'}%</td>
                  <td style="padding:6px; text-align:right; font-weight:700;">${s.overallPct ?? '-'}%</td>
                  <td style="padding:6px;">${esc(a.feedback || '-')}</td>
                </tr>
              `;
            })
            .join('')}
        </tbody>
      </table>
    </div>
  `;
  triggerPdfPrint(html);
}

function exportSingleAuditPdf(rec) {
  const s = computeAuditSummary(rec);
  const itemsMap = getAllItemsMap();
  const decHn = isAdminUnlocked() ? decryptedHnCache.get(rec.id) : '';
  const issues = [];
  for (const [id, val] of Object.entries(rec.answers || {})) {
    const meta = itemsMap.get(id);
    if (!meta) continue;
    if (meta.moduleCode !== 'NURSE_NOTE' && !(rec.selectedModules || []).includes(meta.moduleCode)) continue;
    const opt = meta.options.find((o) => o.value === String(val));
    if (opt && (opt.kind === 'fail' || opt.kind === 'partial')) {
      issues.push({ label: meta.label, val: opt.label, mod: MODULE_META[meta.moduleCode].shortName });
    }
  }

  const html = `
    <div style="font-family: 'IBM Plex Sans Thai', sans-serif; color: #0f172a;">
      <div style="border-bottom:2px solid #0f766e; padding-bottom:10px; margin-bottom:16px;">
        <h1 style="font-size:18px; font-weight:700; margin:0;">ใบสรุปผลการประเมินคุณภาพเวชระเบียนและ Nurse Note</h1>
        <p style="font-size:12px; color:#475569; margin:4px 0 0;">โรงพยาบาลมหาราชนครเชียงใหม่</p>
      </div>
      <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:10px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px; font-size:12px; margin-bottom:16px;">
        <div><span style="color:#64748b;">Nurse Note ID:</span> <strong>${esc(rec.nnId || rec.id)}</strong>${decHn ? `<br/><span style="color:#047857;">HN: ${esc(decHn)}</span>` : ''}</div>
        <div><span style="color:#64748b;">วันที่ประเมิน:</span> <strong>${formatThaiDate(rec.auditDate)}</strong></div>
        <div><span style="color:#64748b;">ผู้ประเมิน:</span> <strong>${esc(rec.auditor || '-')}</strong></div>
        <div><span style="color:#64748b;">หน่วย:</span> <strong>${esc(rec.unit || '-')}</strong></div>
        <div><span style="color:#64748b;">ห้องตรวจ:</span> <strong>${esc(rec.room || '-')}</strong></div>
        <div><span style="color:#64748b;">คะแนนรวม:</span> <strong style="color:#0f766e;">${s.overallPct ?? '-'}%</strong></div>
      </div>
      <div style="display:grid; grid-template-columns:repeat(${Object.keys(s.modules).length},1fr); gap:10px; margin-bottom:16px;">
        ${Object.entries(s.modules)
          .map(
            ([code, m]) => `
          <div style="border:1px solid #e2e8f0; border-radius:10px; padding:10px; text-align:center;">
            <div style="font-size:11px; color:#64748b;">${MODULE_META[code].shortName}</div>
            <div style="font-size:20px; font-weight:700;">${m.pct ?? '-'}%</div>
          </div>
        `
          )
          .join('')}
      </div>
      <div style="margin-bottom:14px;">
        <h3 style="font-size:13px; font-weight:700; margin-bottom:6px;">ข้อบกพร่องที่พบ (${issues.length} รายการ)</h3>
        ${
          issues.length === 0
            ? '<p style="font-size:12px; color:#059669;">ไม่พบข้อบกพร่อง</p>'
            : `<ul style="font-size:12px; padding-left:18px; line-height:1.6;">
                ${issues.map((i) => `<li><strong>[${i.mod}]</strong> ${esc(i.label)} — ${esc(i.val)}</li>`).join('')}
              </ul>`
        }
      </div>
      <div style="border:1px solid #e2e8f0; border-radius:10px; padding:12px;">
        <div style="font-size:12px; font-weight:700; margin-bottom:4px;">ข้อเสนอแนะ</div>
        <div style="font-size:12px; color:#334155;">${esc(rec.feedback || '-')}</div>
      </div>
    </div>
  `;
  triggerPdfPrint(html);
}

function openDetailModal(rec) {
  const s = computeAuditSummary(rec);
  const itemsMap = getAllItemsMap();
  const issues = [];
  for (const [id, val] of Object.entries(rec.answers || {})) {
    const meta = itemsMap.get(id);
    if (!meta) continue;
    if (meta.moduleCode !== 'NURSE_NOTE' && !(rec.selectedModules || []).includes(meta.moduleCode)) continue;
    const opt = meta.options.find((o) => o.value === String(val));
    if (opt && (opt.kind === 'fail' || opt.kind === 'partial')) {
      issues.push({ label: meta.label, val: opt.label, mod: MODULE_META[meta.moduleCode].shortName });
    }
  }

  const decHn = isAdminUnlocked() ? decryptedHnCache.get(rec.id) : '';
  const modal = document.getElementById('modal-root');
  modal.classList.remove('hidden');
  modal.innerHTML = `
    <div class="bg-white rounded-2xl max-w-xl w-full shadow-2xl overflow-hidden my-8 border border-slate-200">
      <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h3 class="font-bold text-sm sm:text-base text-slate-900 font-mono">${esc(rec.nnId || rec.id)}${decHn ? ` <span class="font-sans text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md ml-1">HN: ${esc(decHn)}</span>` : ''}</h3>
          <p class="text-xs text-slate-400">${formatThaiDate(rec.auditDate)} • ${esc(rec.unit || '-')} / ${esc(rec.room || '-')}</p>
        </div>
        <button id="btn-close-modal" class="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>
      <div class="p-5 space-y-4">
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          ${Object.entries(s.modules)
            .map(
              ([code, m]) => `
            <div class="p-3 rounded-xl bg-slate-50 border border-slate-100 text-center">
              <div class="text-[11px] text-slate-500">${MODULE_META[code].shortName}</div>
              <div class="text-lg font-bold mt-0.5 ${m.pct >= PASS_THRESHOLD ? 'text-emerald-600' : 'text-rose-600'}">${m.pct ?? '-'}%</div>
            </div>
          `
            )
            .join('')}
        </div>

        <div>
          <h4 class="text-xs font-bold text-slate-600 mb-1.5">ข้อบกพร่องที่พบ (${issues.length} รายการ)</h4>
          ${
            issues.length === 0
              ? '<p class="text-xs text-emerald-700 bg-emerald-50 p-3 rounded-xl">ไม่พบข้อบกพร่อง</p>'
              : `<ul class="text-xs space-y-1 list-disc pl-5 text-rose-900 bg-rose-50/70 p-3 rounded-xl max-h-48 overflow-y-auto">
                  ${issues.map((i) => `<li><strong>[${i.mod}]</strong> ${esc(i.label)} — ${esc(i.val)}</li>`).join('')}
                </ul>`
          }
        </div>

        <div>
          <h4 class="text-xs font-bold text-slate-600 mb-1">ข้อเสนอแนะ</h4>
          <p class="text-xs sm:text-sm text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-100">${esc(rec.feedback || '-')}</p>
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <button id="btn-modal-pdf" class="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 flex items-center gap-1.5">
            <i data-lucide="file-down" class="w-3.5 h-3.5"></i>
            Export PDF
          </button>
          <button id="btn-close-modal-2" class="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50">ปิด</button>
        </div>
      </div>
    </div>
  `;
  if (window.lucide) window.lucide.createIcons();

  const close = () => modal.classList.add('hidden');
  document.getElementById('btn-close-modal')?.addEventListener('click', close);
  document.getElementById('btn-close-modal-2')?.addEventListener('click', close);
  document.getElementById('btn-modal-pdf')?.addEventListener('click', () => exportSingleAuditPdf(rec));
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });
}

// ============================================================
// Init Nav
// ============================================================
document.querySelectorAll('.nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    currentView = btn.dataset.view;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
});

render();

// Silently pull shared records from Google Sheet on initial load
if (GOOGLE_SHEET_CONFIG.webAppUrl) {
  pullAuditsFromGoogleSheet().then((res) => {
    if (res.ok && res.records.length > 0) {
      const existingIds = new Set(audits.map((a) => a.id));
      let added = 0;
      for (const r of res.records) {
        if (r && r.id && !existingIds.has(r.id)) {
          audits.unshift(r);
          added++;
        }
      }
      if (added > 0) {
        saveAudits(audits);
        render();
      }
    }
  });
}
