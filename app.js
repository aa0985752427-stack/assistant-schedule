/* ============================================================
   助理排班系統 — 純前端邏輯
   資料儲存於 localStorage，無需後端。
   ============================================================ */

// ---------- 設定 ----------
const ASSISTANTS = [
  { name: '霞', color: 'var(--a-xia)',  hex: '#e08a7d' },
  { name: '嵐', color: 'var(--a-lan)',  hex: '#5fb0aa' },
  { name: '偲', color: 'var(--a-si)',   hex: '#b083c9' },
  { name: '琳', color: 'var(--a-lin)',  hex: '#e0a24f' },
  { name: '阡', color: 'var(--a-qian)', hex: '#6f97d6' },
];

const SHIFTS = [
  { key: 'morning', label: '早班', time: '9:30–18:30' },
  { key: 'evening', label: '晚班', time: '11:30–20:30' },
];

const SHIFT_HOURS = 8;      // 每班工時（9小時工時 − 1小時午休）
const WEEKLY_TARGET = 40;   // 每人每週目標工時

// 醫師固定班表（0=週日 ... 6=週六）
// shifts: 該醫師當天出現在哪些班別（用於「套用建議」與日曆標記）
const DOCTORS = {
  chen: { label: '陳醫師', className: 'doc-chen',
    days: { 1: ['morning'], 3: ['morning', 'evening'], 5: ['morning', 'evening'] } },
  yu:   { label: '宇醫師', className: 'doc-yu',
    days: { 1: ['evening'], 4: ['morning', 'evening'] } }, // 週一 14:00-20:30 歸晚班時段
};

const STORAGE_KEY = 'assistant-schedule-v1';

// ---------- 狀態 ----------
let viewYear, viewMonth;   // 目前檢視的年 / 月(0-11)
let schedule = load();     // { 'YYYY-MM-DD': { morning:[名字...], evening:[...] } }

// ---------- 工具函式 ----------
function pad(n) { return String(n).padStart(2, '0'); }
function dateKey(y, m, d) { return `${y}-${pad(m + 1)}-${pad(d)}`; }
function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }

function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
  catch { return {}; }
}
function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(schedule)); }

function getCell(key) {
  if (!schedule[key]) schedule[key] = { morning: [], evening: [] };
  return schedule[key];
}

function assistantByName(name) { return ASSISTANTS.find(a => a.name === name); }

// ---------- 指派切換 ----------
function toggleAssign(key, shiftKey, name) {
  const cell = getCell(key);
  const arr = cell[shiftKey];
  const idx = arr.indexOf(name);
  if (idx >= 0) arr.splice(idx, 1);
  else arr.push(name);
  save();
  render();
}

// ---------- 渲染：說明列 ----------
function renderLegend() {
  const box = document.getElementById('assistantLegend');
  box.innerHTML = '';
  ASSISTANTS.forEach(a => {
    const chip = document.createElement('span');
    chip.className = 'legend-chip';
    chip.style.background = a.hex;
    chip.textContent = a.name;
    box.appendChild(chip);
  });
}

// ---------- 渲染：月曆 ----------
function render() {
  document.getElementById('monthLabel').textContent = `${viewYear} 年 ${viewMonth + 1} 月`;

  const cal = document.getElementById('calendar');
  cal.innerHTML = '';

  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay(); // 0=日
  const total = daysInMonth(viewYear, viewMonth);
  const today = new Date();
  const weekdayNames = ['日', '一', '二', '三', '四', '五', '六'];

  // 月初空格
  for (let i = 0; i < firstWeekday; i++) {
    const empty = document.createElement('div');
    empty.className = 'day empty';
    cal.appendChild(empty);
  }

  for (let d = 1; d <= total; d++) {
    const key = dateKey(viewYear, viewMonth, d);
    const wd = new Date(viewYear, viewMonth, d).getDay();
    const cell = document.createElement('div');
    cell.className = 'day';
    if (wd === 0 || wd === 6) cell.classList.add('weekend');
    if (today.getFullYear() === viewYear && today.getMonth() === viewMonth && today.getDate() === d)
      cell.classList.add('today');

    // 日期 + 醫師標記
    const head = document.createElement('div');
    head.className = 'day-head';
    const num = document.createElement('span');
    num.className = 'day-num';
    num.textContent = d;
    num.dataset.weekday = '（' + weekdayNames[wd] + '）';
    head.appendChild(num);

    const badges = document.createElement('div');
    badges.className = 'doc-badges';
    Object.values(DOCTORS).forEach(doc => {
      if (doc.days[wd]) {
        const b = document.createElement('span');
        b.className = 'doc-badge ' + doc.className;
        b.textContent = doc.label;
        b.title = doc.label + '：' + doc.days[wd].map(s => SHIFTS.find(x => x.key === s).label).join('、');
        badges.appendChild(b);
      }
    });
    head.appendChild(badges);
    cell.appendChild(head);

    // 兩個班別
    const data = schedule[key] || { morning: [], evening: [] };
    SHIFTS.forEach(shift => {
      const block = document.createElement('div');
      block.className = 'shift-block ' + shift.key;

      const title = document.createElement('div');
      title.className = 'shift-title';
      title.innerHTML = `<span class="dot dot-${shift.key}"></span>${shift.label} <span style="color:var(--text-soft);font-weight:400">${shift.time}</span>`;
      block.appendChild(title);

      const row = document.createElement('div');
      row.className = 'chip-row';
      ASSISTANTS.forEach(a => {
        const chip = document.createElement('div');
        chip.className = 'chip';
        chip.textContent = a.name;
        const on = (data[shift.key] || []).includes(a.name);
        if (on) { chip.classList.add('on'); chip.style.background = a.hex; }
        chip.title = `${a.name} · ${shift.label}`;
        chip.addEventListener('click', () => toggleAssign(key, shift.key, a.name));
        row.appendChild(chip);
      });
      block.appendChild(row);
      cell.appendChild(block);
    });

    cal.appendChild(cell);
  }

  renderWeeklySummary();
}

// ---------- 渲染：每週工時 ----------
// 以「週一為一週開始」分組，僅計入目前檢視月份的日期
function renderWeeklySummary() {
  const box = document.getElementById('weeklySummary');
  box.innerHTML = '';

  const total = daysInMonth(viewYear, viewMonth);
  const weeks = new Map(); // 週一日期字串 -> { 名字: 時數 }

  for (let d = 1; d <= total; d++) {
    const date = new Date(viewYear, viewMonth, d);
    const wd = date.getDay();
    const offsetToMonday = (wd === 0 ? 6 : wd - 1);
    const monday = new Date(date);
    monday.setDate(date.getDate() - offsetToMonday);
    const wkKey = dateKey(monday.getFullYear(), monday.getMonth(), monday.getDate());

    if (!weeks.has(wkKey)) weeks.set(wkKey, {});
    const bucket = weeks.get(wkKey);

    const cell = schedule[dateKey(viewYear, viewMonth, d)];
    if (!cell) continue;
    SHIFTS.forEach(shift => {
      (cell[shift.key] || []).forEach(name => {
        bucket[name] = (bucket[name] || 0) + SHIFT_HOURS;
      });
    });
  }

  const sortedWeeks = [...weeks.keys()].sort();
  sortedWeeks.forEach((wkKey, i) => {
    const monday = new Date(wkKey);
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
    const bucket = weeks.get(wkKey);

    const card = document.createElement('div');
    card.className = 'week-card';
    const title = document.createElement('h4');
    title.textContent = `第 ${i + 1} 週（${monday.getMonth() + 1}/${monday.getDate()} – ${sunday.getMonth() + 1}/${sunday.getDate()}）`;
    card.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'hours-grid';
    ASSISTANTS.forEach(a => {
      const hrs = bucket[a.name] || 0;
      const item = document.createElement('div');
      item.className = 'hours-item';
      const sw = document.createElement('span');
      sw.className = 'hours-swatch'; sw.style.background = a.hex;
      const label = document.createElement('span'); label.textContent = a.name;
      const val = document.createElement('span');
      val.className = 'hours-value ' + (hrs === WEEKLY_TARGET ? 'ok' : hrs > WEEKLY_TARGET ? 'over' : 'under');
      val.textContent = `${hrs} / ${WEEKLY_TARGET} 小時`;
      item.append(sw, label, val);
      grid.appendChild(item);
    });
    card.appendChild(grid);
    box.appendChild(card);
  });
}

// ---------- 套用醫師班表建議 ----------
// 醫師有班的班別，若當天該班別尚無助理，帶入第一位助理當佔位（可再調整）
function autoFill() {
  if (!confirm('將依醫師固定班表，在「尚無人」的班別自動帶入建議助理，是否繼續？')) return;
  const total = daysInMonth(viewYear, viewMonth);
  for (let d = 1; d <= total; d++) {
    const wd = new Date(viewYear, viewMonth, d).getDay();
    const key = dateKey(viewYear, viewMonth, d);
    const needed = new Set();
    Object.values(DOCTORS).forEach(doc => {
      (doc.days[wd] || []).forEach(s => needed.add(s));
    });
    if (needed.size === 0) continue;
    const cell = getCell(key);
    let rotate = d % ASSISTANTS.length; // 讓不同天帶入不同人，避免全部同一人
    needed.forEach(s => {
      if (cell[s].length === 0) {
        cell[s].push(ASSISTANTS[rotate % ASSISTANTS.length].name);
        rotate++;
      }
    });
  }
  save();
  render();
}

// ---------- 清除 ----------
function clearMonth() {
  if (!confirm(`確定要清除 ${viewYear} 年 ${viewMonth + 1} 月的所有排班嗎？`)) return;
  const total = daysInMonth(viewYear, viewMonth);
  for (let d = 1; d <= total; d++) delete schedule[dateKey(viewYear, viewMonth, d)];
  save();
  render();
}

// ---------- 產生文字班表 ----------
function buildText() {
  const total = daysInMonth(viewYear, viewMonth);
  const weekdayNames = ['日', '一', '二', '三', '四', '五', '六'];
  let lines = [`${viewYear} 年 ${viewMonth + 1} 月 助理班表`, ''];
  for (let d = 1; d <= total; d++) {
    const key = dateKey(viewYear, viewMonth, d);
    const cell = schedule[key];
    if (!cell || (cell.morning.length === 0 && cell.evening.length === 0)) continue;
    const wd = weekdayNames[new Date(viewYear, viewMonth, d).getDay()];
    const parts = [];
    if (cell.morning.length) parts.push(`早班：${cell.morning.join('、')}`);
    if (cell.evening.length) parts.push(`晚班：${cell.evening.join('、')}`);
    lines.push(`${viewMonth + 1}/${d}（${wd}） ${parts.join('　')}`);
  }
  if (lines.length === 2) lines.push('（本月尚未排班）');
  return lines.join('\n');
}

function exportText() {
  const text = buildText();
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `班表_${viewYear}-${pad(viewMonth + 1)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

function emailSchedule() {
  const subject = `${viewYear} 年 ${viewMonth + 1} 月 助理班表`;
  const body = buildText();
  // mailto 有長度限制，過長時提醒改用匯出
  const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  if (mailto.length > 1800) {
    alert('本月班表內容較長，請改用「匯出文字」後手動附加到 Email。');
    return;
  }
  window.location.href = mailto;
}

// ---------- 月份切換 ----------
function goMonth(delta) {
  viewMonth += delta;
  if (viewMonth < 0) { viewMonth = 11; viewYear--; }
  if (viewMonth > 11) { viewMonth = 0; viewYear++; }
  render();
}
function goToday() {
  const now = new Date();
  viewYear = now.getFullYear();
  viewMonth = now.getMonth();
  render();
}

// ---------- 初始化 ----------
function init() {
  const now = new Date();
  viewYear = now.getFullYear();
  viewMonth = now.getMonth();

  renderLegend();
  render();

  document.getElementById('prevMonth').addEventListener('click', () => goMonth(-1));
  document.getElementById('nextMonth').addEventListener('click', () => goMonth(1));
  document.getElementById('todayBtn').addEventListener('click', goToday);
  document.getElementById('autoFillBtn').addEventListener('click', autoFill);
  document.getElementById('clearBtn').addEventListener('click', clearMonth);
  document.getElementById('exportBtn').addEventListener('click', exportText);
  document.getElementById('emailBtn').addEventListener('click', emailSchedule);
}

document.addEventListener('DOMContentLoaded', init);
