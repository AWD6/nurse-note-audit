// Deduplicated, streamlined audit criteria for Maharat Nakorn Chiang Mai Hospital
// Unified from 3 Google Forms: OPD สปสช., OPD HA IT, ห้องผ่าตัดเล็ก (สปสช.) + Unified Nurse Note

export const MODULE_META = {
  NHSO: {
    code: 'NHSO',
    shortName: 'OPD สปสช.',
    fullName: 'เวชระเบียนผู้ป่วยนอก (สปสช.)',
    description: 'Profile • History • PE / Diagnosis',
  },
  HAIT: {
    code: 'HAIT',
    shortName: 'OPD HA IT',
    fullName: 'เกณฑ์คะแนน HA IT',
    description: 'เกณฑ์คะแนน 6 ข้อหลัก (เต็ม 16 คะแนน)',
  },
  MINOR_OR: {
    code: 'MINOR_OR',
    shortName: 'ห้องผ่าตัดเล็ก',
    fullName: 'ห้องผ่าตัดเล็ก (สปสช.)',
    description: 'Operative note • Informed Consent',
  },
  NURSE_NOTE: {
    code: 'NURSE_NOTE',
    shortName: 'Nurse Note',
    fullName: 'บันทึกทางการพยาบาล',
    description: 'มาตรฐานกลาง 1–8 และกลุ่มความเสี่ยง',
  },
};

// 14 OPD Units & 36 Rooms (matching HEAL-Lingua hierarchy; no room counts displayed)
export const OPD_UNITS = [
  { unit: 'หน่วยที่ 1', rooms: ['OPD 1', 'OPD 10', 'Telemedicine'] },
  { unit: 'หน่วยที่ 2', rooms: ['OPD 3', 'OPD 4'] },
  { unit: 'หน่วยที่ 3', rooms: ['OPD 6', 'OPD 7', 'Retina'] },
  { unit: 'หน่วยที่ 4', rooms: ['OPD 9', 'OPD 21', 'PCU', 'OPD เฉพาะทางนอกเวลา'] },
  { unit: 'หน่วยที่ 5', rooms: ['OPD 22', 'OPD 23', 'OPD 26'] },
  { unit: 'หน่วยที่ 6', rooms: ['OPD 101', 'รังสีรักษา'] },
  { unit: 'หน่วยที่ 7', rooms: ['EID complex'] },
  { unit: 'หน่วยที่ 8', rooms: ['OPD 27', 'OPD 28', 'OPD 29'] },
  { unit: 'หน่วยผ่าตัดเล็ก', rooms: ['OR Minor ชั้น 3', 'OR Minor ชั้น 10', 'OPD 2'] },
  { unit: 'ฉุกเฉิน', rooms: ['Triage', 'ER', 'OPD นอกเวลา'] },
  { unit: 'สังเกตอาการ', rooms: ['หอผู้ป่วยสังเกตอาการ'] },
  { unit: 'เคมีบำบัด', rooms: ['ห้องให้ยาเคมีบำบัด', 'OPD 24', 'OPD 110', 'EKG', 'ศูนย์สุขใจ'] },
  { unit: 'บริการแพทย์ฉุกเฉิน', rooms: ['EMS', 'Refer', 'Injection Room', 'Dressing Room', 'CSC'] },
  { unit: 'อื่นๆ', rooms: ['อื่นๆ'] },
];

export function findUnitByRoom(roomName) {
  for (const grp of OPD_UNITS) {
    if (grp.rooms.includes(roomName)) return grp.unit;
  }
  return 'อื่นๆ';
}

export const QUICK_FEEDBACK_CHIPS = [
  'ไม่ระบุวัน/เวลาแรกรับ',
  'ไม่ระบุระยะเวลาอาการสำคัญ (ผู้ป่วยใหม่)',
  'ไม่บันทึกประวัติการแพ้ยา',
  'ไม่ระบุข้อวินิจฉัยทางการพยาบาล',
  'ไม่บันทึกการประเมินซ้ำ',
  'บันทึก DMETHOD ไม่ครบถ้วน',
  'ไม่บันทึกคำแนะนำ/การนัดตรวจ',
  'ลายมือชื่ออ่านไม่ออก',
  'Pain score > 0 แต่ไม่ครบกระบวนการ',
  'ประเมิน Falling / Pressure Injury ไม่ครบ',
  'Informed Consent ขาดพยาน/เวลา',
  'บันทึกครบถ้วนดีมาก',
];

const OPT_HAVE = [
  { value: 'มี', label: 'มี', kind: 'pass' },
  { value: 'ไม่มี', label: 'ไม่มี', kind: 'fail' },
];

const OPT_CORRECT = [
  { value: 'ถูกต้อง', label: 'ถูกต้อง', kind: 'pass' },
  { value: 'ไม่ถูกต้อง', label: 'ไม่ถูกต้อง', kind: 'fail' },
];

const OPT_HAVE_WITH_NA = (naLabel) => [
  { value: 'มี', label: 'มี', kind: 'pass' },
  { value: 'ไม่มี', label: 'ไม่มี', kind: 'fail' },
  { value: naLabel, label: naLabel, kind: 'na' },
];

const OPT_CORRECT_WITH_NA = (naLabel) => [
  { value: 'ถูกต้อง', label: 'ถูกต้อง', kind: 'pass' },
  { value: 'ไม่ถูกต้อง', label: 'ไม่ถูกต้อง', kind: 'fail' },
  { value: naLabel, label: naLabel, kind: 'na' },
];

// ============================================================
// MODULE 1: OPD สปสช. (NHSO) — Deduplicated
// ============================================================
export const NHSO_SECTIONS = [
  {
    id: 'nhso_profile',
    title: '1. Patient’s Profile',
    items: [
      { id: 'nhso_p1_name', label: '1.1 ชื่อ-นามสกุลผู้ป่วยถูกต้อง', options: OPT_HAVE },
      { id: 'nhso_p1_hn', label: '1.2 เลขที่โรงพยาบาล (HN) ถูกต้อง', options: OPT_HAVE },
      { id: 'nhso_p1_sexage', label: '1.3 เพศ และอายุถูกต้อง', options: OPT_HAVE },
      { id: 'nhso_p1_dob', label: '1.4 วัน/เดือน/ปีเกิดถูกต้อง', options: OPT_HAVE },
      { id: 'nhso_p2_addr', label: '2.1 ข้อมูลที่อยู่ปัจจุบัน', options: OPT_HAVE },
      { id: 'nhso_p2_cid', label: '2.2 เลขที่บัตรประชาชน / หนังสือเดินทาง / ใบต่างด้าว', options: OPT_HAVE },
      { id: 'nhso_p3_relname', label: '3.1 ชื่อ-นามสกุลญาติ/ผู้ติดต่อกรณีฉุกเฉิน', options: OPT_HAVE },
      { id: 'nhso_p3_reltype', label: '3.2 ความสัมพันธ์ของญาติ/ผู้ติดต่อกรณีฉุกเฉิน', options: OPT_HAVE },
      { id: 'nhso_p3_reladdr', label: '3.3 ที่อยู่ญาติ/ผู้ติดต่อกรณีฉุกเฉิน', options: OPT_HAVE },
      { id: 'nhso_p3_reltel', label: '3.4 เบอร์โทรศัพท์ญาติ/ผู้ติดต่อกรณีฉุกเฉิน', options: OPT_HAVE },
      { id: 'nhso_p4_allergy', label: '4. ข้อมูลประวัติการแพ้ยา/การแพ้อื่น ๆ', options: OPT_HAVE },
      { id: 'nhso_p5_blood', label: '5. ข้อมูลหมู่เลือด', options: OPT_HAVE },
      { id: 'nhso_p6_date', label: '6.1 วัน/เดือน/ปี ที่บันทึกข้อมูล', options: OPT_HAVE },
      { id: 'nhso_p6_recorder', label: '6.2 ชื่อ-นามสกุลผู้บันทึกข้อมูล', options: OPT_HAVE },
      { id: 'nhso_p7_header', label: '7. ชื่อ-นามสกุล และ HN ทุกหน้าของเวชระเบียน', options: OPT_HAVE },
    ],
  },
  {
    id: 'nhso_history',
    title: '2. History (การซักประวัติ)',
    items: [
      { id: 'nhso_h1_dx', label: '1.1 Chief complaint : ชื่อโรค', options: OPT_HAVE },
      { id: 'nhso_h1_obj', label: '1.2 Chief complaint : ปัญหา/วัตถุประสงค์ที่มา รพ.', options: OPT_HAVE },
      { id: 'nhso_h1_sym', label: '1.3 Chief complaint : อาการ', options: OPT_HAVE },
      {
        id: 'nhso_h1_dur',
        label: '1.4 กรณีผู้ป่วยใหม่ ระบุระยะเวลาที่มีอาการ (วัน/เดือน/ปี/ชม./นาที)',
        options: OPT_HAVE_WITH_NA('เป็นผู้ป่วยเก่า'),
      },
      { id: 'nhso_h2_pi', label: '2. แพทย์บันทึก Present illness', options: OPT_HAVE },
      { id: 'nhso_h3_ud', label: '3.1 บันทึก Underlying disease', options: OPT_HAVE },
      { id: 'nhso_h3_rx', label: '3.2 บันทึกการรักษาที่ได้รับในปัจจุบัน', options: OPT_HAVE },
      { id: 'nhso_h4_past', label: '4. แพทย์หรือพยาบาลบันทึก Past illness', options: OPT_HAVE },
      // Note: Allergy (formerly History #5) removed as duplicate of Profile #4
      { id: 'nhso_h6_social', label: '5.1 บันทึก Family / Personal / Social / Working History', options: OPT_HAVE },
      {
        id: 'nhso_h6_lmp',
        label: '5.2 เพศหญิงอายุ 11–60 ปี บันทึกประวัติประจำเดือน',
        options: OPT_HAVE_WITH_NA('ไม่อยู่ในเกณฑ์'),
      },
      {
        id: 'nhso_h6_vac',
        label: '5.3 เด็กอายุ 0–14 ปี บันทึก Vaccination และ Growth development',
        options: OPT_HAVE_WITH_NA('ไม่อยู่ในเกณฑ์'),
      },
      { id: 'nhso_h7_smoke', label: '6.1 บันทึกการสูบบุหรี่ของผู้ป่วย/ครอบครัว', options: OPT_HAVE },
      { id: 'nhso_h7_alc', label: '6.2 บันทึกการดื่มสุราของผู้ป่วย/ครอบครัว', options: OPT_HAVE },
      { id: 'nhso_h7_drug', label: '6.3 บันทึกการใช้สารเสพติด (จำนวน ความถี่ ระยะเวลา)', options: OPT_HAVE },
    ],
  },
  {
    id: 'nhso_pe',
    title: '3. Physical Examination / Diagnosis',
    items: [
      { id: 'nhso_pe1_dt', label: '1. วัน/เดือน/ปี และเวลาที่แพทย์ตรวจประเมินครั้งแรก', options: OPT_HAVE },
      { id: 'nhso_pe2_insp', label: '2. บันทึกการตรวจร่างกายโดยการ ดู หรือ เคาะ', options: OPT_HAVE_WITH_NA('ไม่มีความจำเป็น/NA') },
      { id: 'nhso_pe3_palp', label: '3. บันทึกการตรวจร่างกายโดยการ คลำ หรือ ฟัง', options: OPT_HAVE_WITH_NA('ไม่มีความจำเป็น/NA') },
      { id: 'nhso_pe4_pr', label: '4.1 บันทึก Pulse rate', options: OPT_HAVE },
      { id: 'nhso_pe4_rr', label: '4.2 บันทึก Respiration rate', options: OPT_HAVE },
      { id: 'nhso_pe4_temp', label: '4.3 บันทึก Temperature', options: OPT_HAVE },
      {
        id: 'nhso_pe5_bp',
        label: '5. บันทึก Blood Pressure',
        options: OPT_HAVE_WITH_NA('อายุน้อยกว่า 5 ปี'),
      },
      {
        id: 'nhso_pe6_wh',
        label: '6. บันทึกน้ำหนัก และส่วนสูง',
        options: OPT_HAVE_WITH_NA('มีข้อจำกัดในการชั่ง/วัด'),
      },
      { id: 'nhso_pe7_term', label: '7.1 สรุปคำวินิจฉัยโรคเป็น Clinical term', options: OPT_HAVE },
      { id: 'nhso_pe7_align', label: '7.2 คำวินิจฉัยสอดคล้องกับการซักประวัติและตรวจร่างกาย', options: OPT_HAVE },
      {
        id: 'nhso_pe7_chronic',
        label: '7.3 ผู้ป่วยโรคเรื้อรัง วินิจฉัยสอดคล้องกับการรักษาครั้งก่อน',
        options: OPT_HAVE_WITH_NA('ไม่ใช่โรคเรื้อรัง'),
      },
    ],
  },
];

// ============================================================
// MODULE 2: OPD HA IT (Rubric 6 ข้อ)
// ============================================================
export const HAIT_ITEMS = [
  {
    id: 'hait_1',
    label: 'ข้อ 1 วันเวลาที่มารับบริการ',
    maxScore: 1,
    options: [
      { value: '0', label: '0 คะแนน : ไม่บันทึกวันหรือเวลาที่มารับบริการ', score: 0, kind: 'fail' },
      { value: '1', label: '1 คะแนน : บันทึกวันและเวลาที่มารับบริการครบถ้วน', score: 1, kind: 'pass' },
    ],
  },
  {
    id: 'hait_2',
    label: 'ข้อ 2 อาการสำคัญ',
    maxScore: 2,
    options: [
      { value: '0', label: '0 คะแนน : ไม่บันทึกอาการสำคัญหรือเหตุผลที่มา', score: 0, kind: 'fail' },
      { value: '1', label: '1 คะแนน : บันทึกอาการสำคัญแต่ไม่ระบุระยะเวลา หรือเหตุผลไม่มีความหมาย', score: 1, kind: 'partial' },
      { value: '2', label: '2 คะแนน : บันทึกอาการสำคัญพร้อมระยะเวลา หรือเหตุผลที่มาแยกรายละเอียดได้', score: 2, kind: 'pass' },
    ],
  },
  {
    id: 'hait_3',
    label: 'ข้อ 3 ประวัติการเจ็บป่วย',
    maxScore: 2,
    options: [
      { value: '0', label: '0 คะแนน : ไม่มีบันทึกประวัติการเจ็บป่วย', score: 0, kind: 'fail' },
      { value: '1', label: '1 คะแนน : บันทึกประวัติปัจจุบัน + โรคประจำตัวหรือประวัติอดีต', score: 1, kind: 'partial' },
      { value: '2', label: '2 คะแนน : บันทึกประวัติปัจจุบัน + โรคประจำตัว/อดีต + ประวัติส่วนตัว/ปัจจัยเสี่ยง', score: 2, kind: 'pass' },
    ],
  },
  {
    id: 'hait_4',
    label: 'ข้อ 4 ผลการตรวจร่างกาย และผลการตรวจชันสูตร',
    hint: 'กรณีไม่ได้ตรวจชันสูตรเลย ถือว่าให้คะแนน 4 ได้',
    maxScore: 4,
    allowNote: true,
    options: [
      { value: '0', label: '0 คะแนน : ไม่บันทึกผลการตรวจร่างกาย', score: 0, kind: 'fail' },
      { value: '1', label: '1 คะแนน : บันทึกผลการตรวจร่างกายเพียง 1 ระบบ', score: 1, kind: 'partial' },
      { value: '2', label: '2 คะแนน : บันทึกผลการตรวจร่างกาย 2 ระบบ', score: 2, kind: 'partial' },
      { value: '3', label: '3 คะแนน : ตรวจร่างกาย > 2 ระบบ แต่ไม่บันทึกผลชันสูตรทั้งที่มีผล', score: 3, kind: 'partial' },
      { value: '4', label: '4 คะแนน : ตรวจร่างกาย > 2 ระบบ และมีบันทึกผลการตรวจชันสูตร', score: 4, kind: 'pass' },
    ],
  },
  {
    id: 'hait_5',
    label: 'ข้อ 5 คำวินิจฉัยโรค',
    maxScore: 4,
    options: [
      { value: 'NA', label: 'NA : ผู้ป่วยไม่มีโรคใดๆ อยู่เลย', score: null, kind: 'na' },
      { value: '0', label: '0 คะแนน : ไม่บันทึกคำวินิจฉัยโรค หรือใช้รหัส ICD', score: 0, kind: 'fail' },
      { value: '1', label: '1 คะแนน : บันทึกคำวินิจฉัยโรคไม่ครบตามจำนวนโรคทั้งหมด', score: 1, kind: 'partial' },
      { value: '2', label: '2 คะแนน : บันทึกครบแต่บางคำกำกวม ขาดรายละเอียด', score: 2, kind: 'partial' },
      { value: '3', label: '3 คะแนน : บันทึกครบแต่บางคำเป็นคำย่อ หรืออ่านไม่ออก', score: 3, kind: 'partial' },
      { value: '4', label: '4 คะแนน : บันทึกคำวินิจฉัยโรคครบถ้วน ชัดเจนตามปัจจุบัน', score: 4, kind: 'pass' },
    ],
  },
  {
    id: 'hait_6',
    label: 'ข้อ 6 การรักษา',
    maxScore: 3,
    options: [
      { value: 'NA', label: 'NA : กรณีไม่มีการรักษาใดๆ', score: null, kind: 'na' },
      { value: '0', label: '0 คะแนน : ไม่บันทึก หรือเขียนไม่มีรายละเอียด เช่น RM, same, ยาเดิม', score: 0, kind: 'fail' },
      { value: '1', label: '1 คะแนน : บันทึกการรักษา แต่ขาดรายละเอียดส่วนใหญ่', score: 1, kind: 'partial' },
      { value: '2', label: '2 คะแนน : บันทึกการรักษา แต่ขาดรายละเอียดปลีกย่อย', score: 2, kind: 'partial' },
      { value: '3', label: '3 คะแนน : บันทึกการรักษาครบถ้วนทุกรายละเอียด', score: 3, kind: 'pass' },
    ],
  },
];

// ============================================================
// MODULE 3: ห้องผ่าตัดเล็ก (MINOR_OR)
// ============================================================
export const MINOR_OR_SECTIONS = [
  {
    id: 'or_operative',
    title: 'Operative Note (บันทึกการทำผ่าตัด)',
    items: [
      { id: 'or_op1', label: '1. บันทึกชื่อ-นามสกุลผู้ป่วยชัดเจน', options: OPT_HAVE },
      { id: 'or_op2', label: '2. บันทึกสิ่งที่ตรวจพบจากการผ่าตัด', options: OPT_HAVE },
      { id: 'or_op3', label: '3. บันทึกวิธีการผ่าตัด', options: OPT_HAVE },
      { id: 'or_op4', label: '4. บันทึกวิธีการให้ยาชา หรือยาระงับความรู้สึก', options: OPT_HAVE },
      { id: 'or_op5', label: '5. บันทึกผลการผ่าตัด/วินิจฉัยหลังผ่าตัด/ภาวะแทรกซ้อน (ตัดชิ้นเนื้อระบุรอผล Pathology)', options: OPT_HAVE },
      { id: 'or_op6', label: '6. บันทึกวัน/เดือน/ปี และเวลาเริ่มต้น–สิ้นสุดการผ่าตัด', options: OPT_HAVE },
      { id: 'or_op7', label: '7. ลายมืออ่านออกได้ และลงลายมือชื่อแพทย์/ผู้รับผิดชอบชัดเจน', options: OPT_HAVE },
    ],
  },
  {
    id: 'or_consent',
    title: 'Informed Consent (บันทึกการรับทราบและยินยอม)',
    items: [
      { id: 'or_ic1', label: '1. บันทึกชื่อ-นามสกุลผู้ป่วยถูกต้องชัดเจน', options: OPT_HAVE },
      { id: 'or_ic2', label: '2. ลายมือชื่อ/ลายพิมพ์นิ้วมือ (ระบุนิ้ว/เจ้าของ) และชื่อ-นามสกุลผู้ยินยอม', options: OPT_HAVE },
      { id: 'or_ic3', label: '3. ลายมือชื่อพยาน ชื่อ-นามสกุล และความสัมพันธ์ (มาคนเดียวให้ระบุว่ามาคนเดียว)', options: OPT_HAVE },
      { id: 'or_ic4', label: '4. บันทึกเหตุผลความจำเป็นที่ต้องทำการผ่าตัด', options: OPT_HAVE },
      { id: 'or_ic5', label: '5. บันทึกการให้ข้อมูลเกี่ยวกับภาวะแทรกซ้อนที่อาจเกิดขึ้นโดยสังเขป', options: OPT_HAVE },
      { id: 'or_ic6', label: '6. ระบุลายมือชื่อผู้ให้ข้อมูล หรือรายละเอียดของการทำผ่าตัด', options: OPT_HAVE },
      { id: 'or_ic7', label: '7. ระบุวัน/เดือน/ปี และเวลาที่รับทราบและยินยอมให้ทำการรักษา', options: OPT_HAVE },
    ],
  },
];

// ============================================================
// UNIFIED NURSE NOTE CORE — Deduplicated (removed 1.3, 8.1, merged 6.2/6.3)
// ============================================================
export const NURSE_NOTE_SECTIONS = [
  {
    id: 'nn_1',
    title: '1. การประเมินแรกรับและปัญหาสำคัญ',
    items: [
      { id: 'nn_1_1', label: '1.1 บันทึกวัน/เดือน/ปี และเวลาแรกรับ', options: OPT_HAVE },
      { id: 'nn_1_2_1', label: '1.2 บันทึกชื่อโรค', options: OPT_HAVE_WITH_NA('เป็นผู้ป่วยใหม่') },
      { id: 'nn_1_2_2', label: '1.3 บันทึกวัตถุประสงค์ของการมาโรงพยาบาล', options: OPT_HAVE },
      { id: 'nn_1_2_3', label: '1.4 บันทึกอาการ/ปัญหาสำคัญที่มาโรงพยาบาล', options: OPT_HAVE },
    ],
  },
  {
    id: 'nn_2',
    title: '2. ข้อวินิจฉัยทางการพยาบาล',
    items: [
      { id: 'nn_2_1', label: '2.1 ระบุข้อวินิจฉัยทางการพยาบาลถูกต้องสอดคล้องกับปัญหา', options: OPT_CORRECT },
    ],
  },
  {
    id: 'nn_3',
    title: '3. กิจกรรมการพยาบาล',
    items: [
      { id: 'nn_3_1', label: '3.1 ระบุกิจกรรมการพยาบาลครอบคลุมอาการแสดง/ปัญหา/ข้อวินิจฉัยทางการพยาบาล', options: OPT_CORRECT },
      { id: 'nn_3_2', label: '3.2 มีการประเมินซ้ำในช่วงเวลาที่เหมาะสม', options: OPT_CORRECT },
      { id: 'nn_3_3', label: '3.3 ระบุกิจกรรมการพยาบาลที่ตอบสนองหรือกิจกรรมที่สำคัญ', options: OPT_CORRECT },
    ],
  },
  {
    id: 'nn_4',
    title: '4. การประเมินการตอบสนองต่อการรักษาพยาบาล',
    items: [
      {
        id: 'nn_4_1',
        label: '4.1 บันทึกการเปลี่ยนแปลงของการเจ็บป่วยที่ตอบสนองต่อการพยาบาล/การรักษา',
        options: OPT_CORRECT_WITH_NA('ไม่มีอาการเปลี่ยนแปลง'),
      },
      {
        id: 'nn_4_2',
        label: '4.2 บันทึกการตรวจหรือการให้การรักษาที่สำคัญ เช่น การทำหัตถการต่างๆ',
        options: OPT_CORRECT_WITH_NA('ไม่มีการทำหัตถการ'),
      },
    ],
  },
  {
    id: 'nn_5',
    title: '5. การให้ข้อมูลระหว่างการรักษาพยาบาล (DMETHOD)',
    items: [
      {
        id: 'nn_5_1',
        label: '5.1 ให้ข้อมูลที่จำเป็นและช่วยเหลือด้านร่างกาย อารมณ์ จิตใจ (DMETHOD ตัว H)',
        options: OPT_CORRECT,
      },
      {
        id: 'nn_5_2',
        label: '5.2 ให้คำปรึกษาเหมาะสมสอดคล้องกับความต้องการผู้ป่วย/ครอบครัว (M/E/H/T/D/O)',
        options: OPT_CORRECT,
      },
    ],
  },
  {
    id: 'nn_6',
    title: '6. การเตรียมความพร้อมดูแลต่อเนื่อง (Discharge Plan)',
    items: [
      {
        id: 'nn_6_1',
        label: '6.1 ระบุปัญหา/ความต้องการ/อาการของผู้ป่วยที่ต้องดูแลต่อเนื่องที่บ้าน (ตัว D)',
        options: OPT_CORRECT,
      },
      {
        id: 'nn_6_2',
        label: '6.2 ให้ความรู้/ฝึกทักษะการดูแลตนเองและประเมินความก้าวหน้าของผู้ป่วย/ครอบครัว',
        options: OPT_CORRECT_WITH_NA('ไม่มีการฝึกทักษะ'),
      },
    ],
  },
  {
    id: 'nn_7',
    title: '7. การจำหน่ายผู้ป่วย',
    items: [
      { id: 'nn_7_1', label: '7.1 บันทึกคำแนะนำก่อนกลับบ้าน', options: OPT_HAVE },
      { id: 'nn_7_2', label: '7.2 บันทึกการนัดตรวจครั้งต่อไป (ระบุ วัน/เดือน/ปี หรือช่วงเวลา)', options: OPT_HAVE },
      { id: 'nn_7_3', label: '7.3 บันทึกการส่งต่อสถานบริการอื่น (ถ้ามี)', options: OPT_HAVE_WITH_NA('ไม่มีการส่งต่อ') },
    ],
  },
  {
    id: 'nn_8',
    title: '8. เวลาการดูแลและลายมือชื่อผู้บันทึก',
    items: [
      { id: 'nn_8_2', label: '8.1 บันทึกวัน/เดือน/ปี และเวลาระหว่างการดูแล', options: OPT_HAVE },
      { id: 'nn_8_3', label: '8.2 บันทึกลายมือชื่อที่อ่านออกได้', options: OPT_HAVE },
    ],
  },
];

// Smart Risk Groups (Pain / Falling / Pressure Injury)
export const RISK_GROUPS = [
  {
    id: 'risk_pain',
    title: 'Pain (ความเจ็บปวด)',
    hint: 'Pain score > 0 ต้องตั้งข้อวินิจฉัย ให้การพยาบาล และประเมินผล',
    icon: 'activity',
    screenItem: {
      id: 'nn_pain_screen',
      label: 'ประเมินระดับความเจ็บปวดและตำแหน่งที่ปวด',
      options: OPT_CORRECT,
    },
    followUpItems: [
      { id: 'nn_pain_dx', label: 'ข้อวินิจฉัยทางการพยาบาล (Pain)', options: OPT_CORRECT_WITH_NA('ไม่มีปัญหานี้') },
      { id: 'nn_pain_care', label: 'บันทึกการให้การพยาบาล (Pain)', options: OPT_CORRECT_WITH_NA('ไม่มีปัญหานี้') },
      { id: 'nn_pain_eval', label: 'บันทึกการประเมินผล (Pain)', options: OPT_CORRECT_WITH_NA('ไม่มีปัญหานี้') },
    ],
  },
  {
    id: 'risk_falling',
    title: 'Falling (ความเสี่ยงพลัดตกหกล้ม)',
    hint: 'กรณีมีความเสี่ยงต้องบันทึกครบกระบวนการ',
    icon: 'shield-alert',
    screenItem: {
      id: 'nn_fall_screen',
      label: 'ประเมินระดับความเสี่ยง Falling',
      options: OPT_CORRECT,
    },
    followUpItems: [
      { id: 'nn_fall_dx', label: 'ข้อวินิจฉัยทางการพยาบาล (Falling)', options: OPT_CORRECT_WITH_NA('ไม่มีปัญหานี้') },
      { id: 'nn_fall_care', label: 'บันทึกการให้การพยาบาล (Falling)', options: OPT_CORRECT_WITH_NA('ไม่มีปัญหานี้') },
      { id: 'nn_fall_eval', label: 'บันทึกการประเมินผล (Falling)', options: OPT_CORRECT_WITH_NA('ไม่มีปัญหานี้') },
    ],
  },
  {
    id: 'risk_pi',
    title: 'Pressure Injury (ความเสี่ยงแผลกดทับ)',
    hint: 'กรณีมีความเสี่ยงต้องบันทึกครบกระบวนการ',
    icon: 'heart-pulse',
    screenItem: {
      id: 'nn_pi_screen',
      label: 'ประเมินระดับความเสี่ยง Pressure Injury',
      options: OPT_CORRECT,
    },
    followUpItems: [
      { id: 'nn_pi_dx', label: 'ข้อวินิจฉัยทางการพยาบาล (Pressure Injury)', options: OPT_CORRECT_WITH_NA('ไม่มีปัญหานี้') },
      { id: 'nn_pi_care', label: 'บันทึกการให้การพยาบาล (Pressure Injury)', options: OPT_CORRECT_WITH_NA('ไม่มีปัญหานี้') },
      { id: 'nn_pi_eval', label: 'บันทึกการประเมินผล (Pressure Injury)', options: OPT_CORRECT_WITH_NA('ไม่มีปัญหานี้') },
    ],
  },
];

export function getAllItemsMap() {
  const map = new Map();
  const addSectionList = (sections, moduleCode) => {
    for (const sec of sections) {
      for (const item of sec.items) {
        map.set(item.id, { ...item, sectionId: sec.id, sectionTitle: sec.title, moduleCode });
      }
    }
  };
  addSectionList(NHSO_SECTIONS, 'NHSO');
  for (const item of HAIT_ITEMS) {
    map.set(item.id, { ...item, sectionId: 'hait', sectionTitle: 'เกณฑ์คะแนน HA IT', moduleCode: 'HAIT' });
  }
  addSectionList(MINOR_OR_SECTIONS, 'MINOR_OR');
  addSectionList(NURSE_NOTE_SECTIONS, 'NURSE_NOTE');
  for (const grp of RISK_GROUPS) {
    map.set(grp.screenItem.id, { ...grp.screenItem, sectionId: grp.id, sectionTitle: grp.title, moduleCode: 'NURSE_NOTE' });
    for (const item of grp.followUpItems) {
      map.set(item.id, { ...item, sectionId: grp.id, sectionTitle: grp.title, moduleCode: 'NURSE_NOTE' });
    }
  }
  return map;
}
