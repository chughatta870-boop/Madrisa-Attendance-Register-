'use strict';

/* ============ Storage Keys ============ */
const K_SETTINGS = 'mreg_settings_v1';
const K_STUDENTS = 'mreg_students_v1';
const K_ATTENDANCE = 'mreg_attendance_v1';

/* ============ State ============ */
let settings = loadJSON(K_SETTINGS, { madrissaName: 'Madrissa Attendance Register', incharge: '', address: '' });
let students = loadJSON(K_STUDENTS, []); // [{id, roll, name}]
let attendance = loadJSON(K_ATTENDANCE, {}); // { 'YYYY-MM-DD': { studentId: 'P'|'A'|'L' } }

let currentAttDate = todayStr();
let currentReportMonth = todayStr().slice(0, 7); // YYYY-MM
let editingStudentId = null;
let confirmCallback = null;

/* ============ Helpers ============ */
function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) { return fallback; }
}
function saveJSON(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { showToast('Storage error: ' + e.message); }
}
function saveSettings() { saveJSON(K_SETTINGS, settings); }
function saveStudents() { saveJSON(K_STUDENTS, students); }
function saveAttendance() { saveJSON(K_ATTENDANCE, attendance); }

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
function pad(n) { return n < 10 ? '0' + n : '' + n; }
function uid() { return 's_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function initials(name) {
  const parts = String(name).trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove('show'), 2400);
}
function daysInMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}
function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/* ============ Navigation ============ */
const views = ['dashboard', 'attendance', 'students', 'reports', 'settings'];
function goto(view) {
  views.forEach(v => {
    document.getElementById('view-' + v).classList.toggle('active', v === view);
  });
  document.querySelectorAll('.drawer-link[data-view]').forEach(el => el.classList.toggle('active', el.dataset.view === view));
  document.querySelectorAll('.bn-item[data-view]').forEach(el => el.classList.toggle('active', el.dataset.view === view));
  closeDrawer();
  if (view === 'dashboard') renderDashboard();
  if (view === 'attendance') renderAttendance();
  if (view === 'students') renderStudents();
  if (view === 'reports') renderReport();
  window.scrollTo({ top: 0, behavior: 'auto' });
}
document.querySelectorAll('[data-view]').forEach(el => el.addEventListener('click', () => goto(el.dataset.view)));
document.querySelectorAll('[data-goto]').forEach(el => el.addEventListener('click', () => goto(el.dataset.goto)));

function openDrawer() { document.getElementById('drawer').classList.add('open'); document.getElementById('drawerOverlay').classList.add('open'); }
function closeDrawer() { document.getElementById('drawer').classList.remove('open'); document.getElementById('drawerOverlay').classList.remove('open'); }
document.getElementById('menuBtn').addEventListener('click', openDrawer);
document.getElementById('drawerOverlay').addEventListener('click', closeDrawer);

/* ============ Header / Branding ============ */
function renderBranding() {
  document.getElementById('madrissaNameDisplay').textContent = settings.madrissaName || 'Madrissa Attendance Register';
  document.getElementById('inchargeDisplay').textContent = 'Incharge: ' + (settings.incharge || '--');
}

/* ============ Dashboard ============ */
function renderDashboard() {
  document.getElementById('statTotalStudents').textContent = students.length;
  const dayRec = attendance[currentAttDate] || {};
  const marked = students.filter(s => dayRec[s.id]).length;
  const present = students.filter(s => dayRec[s.id] === 'P').length;
  const absent = students.filter(s => dayRec[s.id] === 'A').length;
  document.getElementById('statTodayMarked').textContent = marked;
  document.getElementById('statPresentToday').textContent = present;
  document.getElementById('statAbsentToday').textContent = absent;

  const todayRec = attendance[todayStr()] || {};
  document.getElementById('todayDateLabel').textContent = new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });

  const list = document.getElementById('dashTodayList');
  if (students.length === 0) {
    list.innerHTML = '<p class="hint-text">No students added yet.</p>';
    return;
  }
  list.innerHTML = students.slice(0, 8).map(s => {
    const st = todayRec[s.id];
    const label = st === 'P' ? 'Present' : st === 'A' ? 'Absent' : st === 'L' ? 'Leave' : 'Not marked';
    const cls = st ? 'badge-' + st : 'badge-none';
    return `<div class="today-row"><span>${escapeHtml(s.roll)} &middot; ${escapeHtml(s.name)}</span><span class="status-badge ${cls}">${label}</span></div>`;
  }).join('') + (students.length > 8 ? `<p class="hint-text">+ ${students.length - 8} more students</p>` : '');
}

/* ============ Students CRUD ============ */
function renderStudents() {
  const q = document.getElementById('studentSearch').value.trim().toLowerCase();
  const list = document.getElementById('studentsList');
  const empty = document.getElementById('studentsEmpty');
  const filtered = students
    .filter(s => !q || s.name.toLowerCase().includes(q) || String(s.roll).toLowerCase().includes(q))
    .sort((a, b) => (a.roll + '').localeCompare(b.roll + '', undefined, { numeric: true }));

  if (students.length === 0) {
    list.innerHTML = ''; empty.classList.remove('hidden'); return;
  }
  empty.classList.add('hidden');
  if (filtered.length === 0) {
    list.innerHTML = '<p class="hint-text">No matching students.</p>';
    return;
  }
  list.innerHTML = filtered.map(s => `
    <div class="student-row">
      <div class="student-row-info">
        <div class="student-avatar">${escapeHtml(initials(s.name))}</div>
        <div>
          <div class="student-row-name">${escapeHtml(s.name)}</div>
          <div class="student-row-roll">Roll No: ${escapeHtml(s.roll)}</div>
        </div>
      </div>
      <div class="student-actions">
        <button data-edit="${s.id}" title="Edit">&#9998;</button>
        <button data-del="${s.id}" title="Delete">&#128465;</button>
      </div>
    </div>`).join('');

  list.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => openStudentModal(b.dataset.edit)));
  list.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
    const s = students.find(x => x.id === b.dataset.del);
    confirmAction(`Delete student "${s.name}"? Their attendance history will also be removed.`, () => {
      students = students.filter(x => x.id !== s.id);
      Object.keys(attendance).forEach(date => { delete attendance[date][s.id]; });
      saveStudents(); saveAttendance();
      renderStudents(); showToast('Student deleted');
    });
  }));
}
document.getElementById('studentSearch').addEventListener('input', renderStudents);
document.getElementById('addStudentBtn').addEventListener('click', () => openStudentModal(null));

function openStudentModal(id) {
  editingStudentId = id;
  const overlay = document.getElementById('studentModalOverlay');
  const title = document.getElementById('studentModalTitle');
  const rollEl = document.getElementById('modalRollNo');
  const nameEl = document.getElementById('modalStudentName');
  if (id) {
    const s = students.find(x => x.id === id);
    title.textContent = 'Edit Student';
    rollEl.value = s.roll; nameEl.value = s.name;
  } else {
    title.textContent = 'Add Student';
    rollEl.value = suggestNextRoll(); nameEl.value = '';
  }
  overlay.classList.add('open');
  setTimeout(() => nameEl.focus(), 100);
}
function suggestNextRoll() {
  const nums = students.map(s => parseInt(s.roll, 10)).filter(n => !isNaN(n));
  return nums.length ? String(Math.max(...nums) + 1) : '1';
}
function closeStudentModal() { document.getElementById('studentModalOverlay').classList.remove('open'); editingStudentId = null; }
document.getElementById('closeStudentModal').addEventListener('click', closeStudentModal);
document.getElementById('cancelStudentModal').addEventListener('click', closeStudentModal);
document.getElementById('studentModalOverlay').addEventListener('click', e => { if (e.target.id === 'studentModalOverlay') closeStudentModal(); });

document.getElementById('saveStudentModal').addEventListener('click', () => {
  const roll = document.getElementById('modalRollNo').value.trim();
  const name = document.getElementById('modalStudentName').value.trim();
  if (!name) { showToast('Please enter student name'); return; }
  if (!roll) { showToast('Please enter roll number'); return; }
  if (editingStudentId) {
    const s = students.find(x => x.id === editingStudentId);
    s.roll = roll; s.name = name;
    showToast('Student updated');
  } else {
    students.push({ id: uid(), roll, name });
    showToast('Student added');
  }
  saveStudents();
  closeStudentModal();
  renderStudents();
  renderDashboard();
});

/* ============ Confirm Dialog ============ */
function confirmAction(msg, cb) {
  document.getElementById('confirmMessage').textContent = msg;
  confirmCallback = cb;
  document.getElementById('confirmOverlay').classList.add('open');
}
document.getElementById('confirmCancel').addEventListener('click', () => { document.getElementById('confirmOverlay').classList.remove('open'); confirmCallback = null; });
document.getElementById('confirmOk').addEventListener('click', () => {
  document.getElementById('confirmOverlay').classList.remove('open');
  if (confirmCallback) confirmCallback();
  confirmCallback = null;
});

/* ============ Daily Attendance ============ */
function renderAttendance() {
  document.getElementById('attendanceDate').value = currentAttDate;
  const q = document.getElementById('attSearch').value.trim().toLowerCase();
  const list = document.getElementById('attendanceList');
  const empty = document.getElementById('attEmptyState');
  const dayRec = attendance[currentAttDate] || {};

  if (students.length === 0) { list.innerHTML = ''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');

  const filtered = students
    .filter(s => !q || s.name.toLowerCase().includes(q) || String(s.roll).toLowerCase().includes(q))
    .sort((a, b) => (a.roll + '').localeCompare(b.roll + '', undefined, { numeric: true }));

  list.innerHTML = filtered.map(s => {
    const st = dayRec[s.id];
    return `
    <div class="att-row" data-id="${s.id}">
      <div class="att-row-info">
        <div class="att-row-name">${escapeHtml(s.name)}</div>
        <div class="att-row-roll">Roll No: ${escapeHtml(s.roll)}</div>
      </div>
      <div class="att-buttons">
        <button class="att-btn p ${st === 'P' ? 'active' : ''}" data-status="P" title="Present">P</button>
        <button class="att-btn a ${st === 'A' ? 'active' : ''}" data-status="A" title="Absent">A</button>
        <button class="att-btn l ${st === 'L' ? 'active' : ''}" data-status="L" title="Leave">L</button>
      </div>
    </div>`;
  }).join('');

  list.querySelectorAll('.att-row').forEach(row => {
    const id = row.dataset.id;
    row.querySelectorAll('.att-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const status = btn.dataset.status;
        if (!attendance[currentAttDate]) attendance[currentAttDate] = {};
        const cur = attendance[currentAttDate][id];
        if (cur === status) {
          delete attendance[currentAttDate][id]; // toggle off
        } else {
          attendance[currentAttDate][id] = status;
        }
        saveAttendance();
        renderAttendance();
      });
    });
  });
}
document.getElementById('attSearch').addEventListener('input', renderAttendance);
document.getElementById('attendanceDate').addEventListener('change', e => { currentAttDate = e.target.value || todayStr(); renderAttendance(); });
document.getElementById('dateBack').addEventListener('click', () => shiftDate(-1));
document.getElementById('dateFwd').addEventListener('click', () => shiftDate(1));
document.getElementById('dateToday').addEventListener('click', () => { currentAttDate = todayStr(); renderAttendance(); });
function shiftDate(delta) {
  const d = new Date(currentAttDate + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  currentAttDate = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  renderAttendance();
}
document.querySelectorAll('[data-markall]').forEach(btn => {
  btn.addEventListener('click', () => {
    const mode = btn.dataset.markall;
    if (students.length === 0) return;
    if (!attendance[currentAttDate]) attendance[currentAttDate] = {};
    if (mode === 'clear') {
      attendance[currentAttDate] = {};
    } else {
      students.forEach(s => { attendance[currentAttDate][s.id] = mode; });
    }
    saveAttendance();
    renderAttendance();
    showToast(mode === 'clear' ? 'Cleared attendance for the day' : 'Marked all students');
  });
});

/* ============ Monthly Reports ============ */
function computeMonthlyStats(ym) {
  const dim = daysInMonth(ym);
  return students.map(s => {
    let P = 0, A = 0, L = 0;
    for (let d = 1; d <= dim; d++) {
      const date = ym + '-' + pad(d);
      const st = attendance[date] && attendance[date][s.id];
      if (st === 'P') P++; else if (st === 'A') A++; else if (st === 'L') L++;
    }
    const total = P + A + L;
    const pct = total ? Math.round((P / total) * 1000) / 10 : 0;
    return { ...s, P, A, L, total, pct };
  }).sort((a, b) => (a.roll + '').localeCompare(b.roll + '', undefined, { numeric: true }));
}

function renderReport() {
  document.getElementById('reportMonth').value = currentReportMonth;
  const q = document.getElementById('reportSearch').value.trim().toLowerCase();
  const stats = computeMonthlyStats(currentReportMonth).filter(s => !q || s.name.toLowerCase().includes(q) || String(s.roll).toLowerCase().includes(q));
  const tbody = document.getElementById('reportTbody');
  if (students.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--ink-soft);padding:20px;">No students added yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = stats.map(s => {
    const pctClass = s.pct >= 75 ? 'pct-good' : s.pct >= 50 ? 'pct-mid' : 'pct-bad';
    return `<tr>
      <td>${escapeHtml(s.roll)}</td>
      <td>${escapeHtml(s.name)}</td>
      <td>${s.P}</td>
      <td>${s.A}</td>
      <td>${s.L}</td>
      <td>${s.total}</td>
      <td class="${pctClass}">${s.pct}%</td>
    </tr>`;
  }).join('');
}
document.getElementById('reportSearch').addEventListener('input', renderReport);
document.getElementById('reportMonth').addEventListener('change', e => { currentReportMonth = e.target.value || currentReportMonth; renderReport(); });
document.getElementById('monthBack').addEventListener('click', () => shiftMonth(-1));
document.getElementById('monthFwd').addEventListener('click', () => shiftMonth(1));
function shiftMonth(delta) {
  const [y, m] = currentReportMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  currentReportMonth = d.getFullYear() + '-' + pad(d.getMonth() + 1);
  renderReport();
}

function buildCsv() {
  const stats = computeMonthlyStats(currentReportMonth);
  const rows = [
    [settings.madrissaName || 'Madrissa'],
    ['Incharge: ' + (settings.incharge || '--')],
    ['Monthly Attendance Report - ' + monthLabel(currentReportMonth)],
    [],
    ['Roll No', 'Name', 'Present', 'Absent', 'Leave', 'Total Marked', 'Percentage'],
    ...stats.map(s => [s.roll, s.name, s.P, s.A, s.L, s.total, s.pct + '%']),
    [],
    ['Generated by M Ijaz - GHS 124/NB'],
  ];
  return rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
}

document.getElementById('reportDownloadCsv').addEventListener('click', () => {
  const csv = buildCsv();
  downloadBlob(csv, `attendance-report-${currentReportMonth}.csv`, 'text/csv');
  showToast('CSV downloaded');
});

document.getElementById('reportDownloadPdf').addEventListener('click', () => {
  goto('reports');
  setTimeout(() => window.print(), 150);
});

document.getElementById('reportShare').addEventListener('click', async () => {
  const text = buildShareText();
  await shareContent('Monthly Attendance Report', text, buildCsv(), `attendance-report-${currentReportMonth}.csv`, 'text/csv');
});
document.getElementById('qaShare').addEventListener('click', async () => {
  const text = buildShareText();
  await shareContent('Attendance Report', text, buildCsv(), `attendance-report-${currentReportMonth}.csv`, 'text/csv');
});

function buildShareText() {
  const stats = computeMonthlyStats(currentReportMonth);
  let text = `${settings.madrissaName || 'Madrissa'}\nIncharge: ${settings.incharge || '--'}\nMonthly Report - ${monthLabel(currentReportMonth)}\n\n`;
  stats.forEach(s => { text += `${s.roll}. ${s.name} - P:${s.P} A:${s.A} L:${s.L} (${s.pct}%)\n`; });
  text += `\nGenerated via Madrissa Attendance Register\nM Ijaz \u00b7 GHS 124/NB`;
  return text;
}

async function shareContent(title, text, fileContent, fileName, mime) {
  try {
    if (navigator.share) {
      if (navigator.canShare && fileContent) {
        const file = new File([fileContent], fileName, { type: mime });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ title, text, files: [file] });
          return;
        }
      }
      await navigator.share({ title, text });
    } else {
      await navigator.clipboard.writeText(text);
      showToast('Share not supported — copied to clipboard');
    }
  } catch (e) {
    if (e.name !== 'AbortError') showToast('Could not share');
  }
}

function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ============ Settings ============ */
function renderSettingsForm() {
  document.getElementById('settingMadrissaName').value = settings.madrissaName || '';
  document.getElementById('settingIncharge').value = settings.incharge || '';
  document.getElementById('settingAddress').value = settings.address || '';
}
document.getElementById('saveSettingsBtn').addEventListener('click', () => {
  settings.madrissaName = document.getElementById('settingMadrissaName').value.trim() || 'Madrissa Attendance Register';
  settings.incharge = document.getElementById('settingIncharge').value.trim();
  settings.address = document.getElementById('settingAddress').value.trim();
  saveSettings();
  renderBranding();
  showToast('Settings saved');
});

/* ============ Backup / Restore ============ */
function buildBackupObject() {
  return { app: 'madrissa-attendance-register', version: 1, exportedAt: new Date().toISOString(), settings, students, attendance };
}
function downloadBackup() {
  const data = JSON.stringify(buildBackupObject(), null, 2);
  downloadBlob(data, `madrissa-backup-${todayStr()}.json`, 'application/json');
  showToast('Backup downloaded');
}
document.getElementById('settingsDownloadBackup').addEventListener('click', downloadBackup);
document.getElementById('qaDownload').addEventListener('click', downloadBackup);
document.getElementById('backupBtn').addEventListener('click', () => { goto('settings'); });

document.getElementById('restoreFile').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data || typeof data !== 'object') throw new Error('Invalid file');
      confirmAction('Restore from this backup? Current data will be replaced.', () => {
        settings = data.settings || settings;
        students = data.students || [];
        attendance = data.attendance || {};
        saveSettings(); saveStudents(); saveAttendance();
        renderBranding(); renderSettingsForm(); renderDashboard();
        showToast('Backup restored');
      });
    } catch (err) {
      showToast('Invalid backup file');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

document.getElementById('clearAllBtn').addEventListener('click', () => {
  confirmAction('Erase ALL data (students, attendance, settings)? This cannot be undone.', () => {
    localStorage.removeItem(K_SETTINGS);
    localStorage.removeItem(K_STUDENTS);
    localStorage.removeItem(K_ATTENDANCE);
    settings = { madrissaName: 'Madrissa Attendance Register', incharge: '', address: '' };
    students = []; attendance = {};
    renderBranding(); renderSettingsForm(); renderDashboard(); renderStudents(); renderAttendance(); renderReport();
    showToast('All data erased');
  });
});

/* ============ Init ============ */
function init() {
  renderBranding();
  renderSettingsForm();
  renderDashboard();
  renderStudents();
  renderAttendance();
  renderReport();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
}
init();
