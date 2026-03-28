/* ══════════════════════════════════════════════════════════
   منظومة التفتيش التربوي — المملكة المغربية
   app.js — Full state management, no demo data
   Storage: localStorage (simulates a real DB for MVP)
══════════════════════════════════════════════════════════ */

// ─── STORAGE KEYS ───────────────────────────────────────
const KEYS = {
  SETUP_DONE:   'mtit_setup_done',
  INSPECTOR:    'mtit_inspector',
  TEACHERS:     'mtit_teachers',
  TICKETS:      'mtit_tickets',
  REPORTS:      'mtit_reports',
  VISITS:       'mtit_visits',
  CURRENT_USER: 'mtit_current_user',
};

// ─── STATE ──────────────────────────────────────────────
let APP = {
  inspector:   null,   // { name, email, pass, id, province, district, region, level, cardId }
  teachers:    [],     // [{ id, name, email, pass, school, grade, subject, color }]
  tickets:     [],     // [{ id, teacherId, teacherName, school, type, title, desc, subject, unit, notes, preferredDate, status, inspectorNote, createdAt }]
  reports:     [],     // [{ id, teacherId, teacherName, school, grade, title, semester, subject, status, inspectorNote, submittedAt, deadline }]
  visits:      [],     // [{ id, ticketId, teacherId, date, status }]
  currentUser: null,   // { role: 'inspector'|'teacher', id }
};

let selectedRequestType = 'visit';
let activeTicketId = null;
let activeReportId = null;
let activeLoginRole = 'inspector';
let activeTeacherId = null;
let reportAttachment = null;

// Palette for teacher avatars
const COLORS = [
  '#C41E3A','#006233','#1D4ED8','#D97706','#7C3AED',
  '#0891B2','#16A34A','#9333EA','#E11D48','#0369A1',
  '#DC2626','#059669','#B45309','#4338CA','#0F766E',
];

// ─── PERSISTENCE ────────────────────────────────────────
function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch(e) {}
}
function load(key, def = null) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : def;
  } catch(e) { return def; }
}
function loadAll() {
  APP.inspector   = load(KEYS.INSPECTOR, null);
  APP.teachers    = load(KEYS.TEACHERS, []);
  APP.tickets     = load(KEYS.TICKETS, []);
  APP.reports     = load(KEYS.REPORTS, []);
  APP.visits      = load(KEYS.VISITS, []);
  APP.currentUser = load(KEYS.CURRENT_USER, null);
}
function saveAll() {
  save(KEYS.INSPECTOR,  APP.inspector);
  save(KEYS.TEACHERS,   APP.teachers);
  save(KEYS.TICKETS,    APP.tickets);
  save(KEYS.REPORTS,    APP.reports);
  save(KEYS.VISITS,     APP.visits);
}

// ─── INIT ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadAll();
  const setupDone = load(KEYS.SETUP_DONE, false);
  if (!setupDone) {
    showScreen('setup');
  } else if (APP.currentUser) {
    // Resume session
    APP.currentUser.role === 'inspector' ? enterInspector() : enterTeacher(APP.currentUser.id);
  } else {
    showScreen('login');
  }

  // Set today's date for request form
  const today = new Date().toISOString().split('T')[0];
  const reqDate = document.getElementById('req-date');
  if (reqDate) reqDate.value = today;
});

// ─── SCREEN HELPERS ─────────────────────────────────────
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => {
    s.style.display = 'none';
    s.classList.remove('active');
  });
  const el = document.getElementById(`screen-${name}`);
  if (el) { el.style.display = 'flex'; el.classList.add('active'); }
}

// ════════════════════════════════════════════════════════
// SETUP WIZARD
// ════════════════════════════════════════════════════════
let setupTeachers = []; // temp list during setup

function goStep(n) {
  if (n === 2 && !validateSetupStep1()) return;
  if (n === 3) buildConfirmStep();

  document.querySelectorAll('.setup-step').forEach(s => s.classList.remove('active'));
  document.getElementById(`step-${n}`).classList.add('active');

  document.querySelectorAll('.step-dot').forEach((d, i) => {
    d.classList.remove('active', 'done');
    if (i + 1 < n) d.classList.add('done');
    if (i + 1 === n) d.classList.add('active');
  });
}

function validateSetupStep1() {
  const fields = ['s-insp-name','s-insp-id','s-insp-region','s-insp-province','s-insp-district','s-insp-level','s-insp-email','s-insp-pass'];
  for (const id of fields) {
    const el = document.getElementById(id);
    if (!el || !el.value.trim()) {
      el && el.focus();
      showToast('⚠ يُرجى ملء جميع الحقول الإلزامية');
      return false;
    }
  }
  if (document.getElementById('s-insp-pass').value.length < 6) {
    showToast('⚠ كلمة المرور يجب أن تكون 6 أحرف على الأقل');
    return false;
  }
  return true;
}

function addTeacher() {
  const name    = v('t-name');
  const email   = v('t-email');
  const pass    = v('t-pass');
  const school  = v('t-school');
  const grade   = v('t-grade');
  const subject = v('t-subject');

  if (!name || !email || !pass || !school || !grade) {
    showToast('⚠ يُرجى ملء الحقول الإلزامية للأستاذ');
    return;
  }
  if (setupTeachers.find(t => t.email === email)) {
    showToast('⚠ هذا البريد الإلكتروني مسجل بالفعل');
    return;
  }

  const teacher = {
    id: genId(), name, email, pass, school, grade, subject,
    color: COLORS[setupTeachers.length % COLORS.length]
  };
  setupTeachers.push(teacher);
  renderSetupTeachersList();
  clearFields(['t-name','t-email','t-pass','t-school','t-grade','t-subject']);
  showToast(`✅ تمت إضافة الأستاذ(ة) ${name}`);
}

function removeSetupTeacher(id) {
  setupTeachers = setupTeachers.filter(t => t.id !== id);
  renderSetupTeachersList();
}

function renderSetupTeachersList() {
  const list  = document.getElementById('teachers-preview-list');
  const empty = document.getElementById('preview-empty');
  if (!list) return;
  if (setupTeachers.length === 0) {
    empty && (empty.style.display = 'flex');
    list.innerHTML = '';
    return;
  }
  empty && (empty.style.display = 'none');
  list.innerHTML = setupTeachers.map(t => `
    <div class="preview-teacher-row">
      <div class="ptr-avatar" style="background:${t.color}">${initial(t.name)}</div>
      <div class="ptr-info">
        <div class="ptr-name">${t.name}</div>
        <div class="ptr-meta">${t.school} — ${t.grade}${t.subject ? ' — ' + t.subject : ''}</div>
      </div>
      <button class="ptr-del" onclick="removeSetupTeacher('${t.id}')">حذف</button>
    </div>`).join('');
}

function buildConfirmStep() {
  const insp = {
    name:     v('s-insp-name'),
    cardId:   v('s-insp-id'),
    region:   v('s-insp-region'),
    province: v('s-insp-province'),
    district: v('s-insp-district'),
    level:    v('s-insp-level'),
    email:    v('s-insp-email'),
    pass:     v('s-insp-pass'),
  };
  const cc = document.getElementById('confirm-cards');
  if (!cc) return;
  cc.innerHTML = `
    <div class="confirm-card">
      <div class="cc-title">🏛️ بيانات المفتش التربوي</div>
      <div class="cc-grid">
        <div class="cc-item"><label>الاسم الكامل</label><span>${insp.name}</span></div>
        <div class="cc-item"><label>رقم البطاقة</label><span>${insp.cardId}</span></div>
        <div class="cc-item"><label>الجهة</label><span>${insp.region}</span></div>
        <div class="cc-item"><label>النيابة</label><span>${insp.province}</span></div>
        <div class="cc-item"><label>الدائرة</label><span>${insp.district}</span></div>
        <div class="cc-item"><label>المرحلة</label><span>${insp.level}</span></div>
        <div class="cc-item"><label>البريد الإلكتروني</label><span>${insp.email}</span></div>
      </div>
    </div>
    <div class="confirm-card">
      <div class="cc-title">👨‍🏫 الأساتذة المضافون</div>
      <div class="cc-teachers-count">${setupTeachers.length}</div>
      <div class="cc-teachers-sub">أستاذ/ة سيتم تسجيله/ها في المنظومة</div>
      ${setupTeachers.length === 0 ? '<p style="color:rgba(255,255,255,.4);font-size:.82rem;margin-top:6px">يمكن إضافة الأساتذة لاحقاً من لوحة التحكم</p>' : ''}
    </div>`;
}

function launchApp() {
  const insp = {
    id:       genId(),
    name:     v('s-insp-name'),
    cardId:   v('s-insp-id'),
    region:   v('s-insp-region'),
    province: v('s-insp-province'),
    district: v('s-insp-district'),
    level:    v('s-insp-level'),
    email:    v('s-insp-email').toLowerCase(),
    pass:     v('s-insp-pass'),
  };

  APP.inspector = insp;
  APP.teachers  = setupTeachers.map(t => ({ ...t }));
  APP.tickets   = [];
  APP.reports   = [];
  APP.visits    = [];
  saveAll();
  save(KEYS.SETUP_DONE, true);
  setupTeachers = [];

  showToast('🎉 تم إطلاق المنظومة بنجاح!');
  setTimeout(() => showScreen('login'), 900);
}

// ════════════════════════════════════════════════════════
// LOGIN
// ════════════════════════════════════════════════════════
function setLoginRole(role, btn) {
  activeLoginRole = role;
  document.querySelectorAll('.role-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('login-error').style.display = 'none';
}

function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim().toLowerCase();
  const pass  = document.getElementById('login-pass').value;
  const errEl = document.getElementById('login-error');

  // Check inspector
  if (APP.inspector && APP.inspector.email === email && APP.inspector.pass === pass) {
    APP.currentUser = { role: 'inspector', id: APP.inspector.id };
    save(KEYS.CURRENT_USER, APP.currentUser);
    errEl.style.display = 'none';
    enterInspector();
    return;
  }

  // Check teachers
  const teacher = APP.teachers.find(t => t.email.toLowerCase() === email && t.pass === pass);
  if (teacher) {
    APP.currentUser = { role: 'teacher', id: teacher.id };
    save(KEYS.CURRENT_USER, APP.currentUser);
    errEl.style.display = 'none';
    enterTeacher(teacher.id);
    return;
  }

  errEl.style.display = 'block';
}

function logout() {
  APP.currentUser = null;
  save(KEYS.CURRENT_USER, null);
  showScreen('login');
  document.getElementById('login-email').value = '';
  document.getElementById('login-pass').value  = '';
}

function resetApp() {
  if (!confirm('⚠ هل أنت متأكد من إعادة ضبط المنظومة؟ سيتم حذف جميع البيانات.')) return;
  Object.values(KEYS).forEach(k => localStorage.removeItem(k));
  location.reload();
}

// ════════════════════════════════════════════════════════
// INSPECTOR DASHBOARD
// ════════════════════════════════════════════════════════
function enterInspector() {
  showScreen('inspector');

  // Sidebar info
  setText('insp-district-label', APP.inspector.district || '—');
  setText('insp-name-sb', APP.inspector.name);
  setText('insp-avatar-sb', initial(APP.inspector.name));

  iTab('i-overview', document.querySelector('[data-tab="i-overview"]'));
  renderInspectorOverview();
}

function iTab(id, el) {
  if (window.event && typeof window.event.preventDefault === 'function') window.event.preventDefault();
  document.querySelectorAll('#screen-inspector .tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('#screen-inspector .nav-item').forEach(n => n.classList.remove('active'));
  const panel = document.getElementById(`tab-${id}`);
  if (panel) panel.classList.add('active');
  if (el) el.classList.add('active');

  if (id === 'i-overview')  renderInspectorOverview();
  if (id === 'i-tickets')   renderTickets();
  if (id === 'i-reports')   renderInspectorReports();
  if (id === 'i-teachers')  renderTeachers();
}

function renderInspectorOverview() {
  // Date
  setText('today-date', todayStr());
  setText('overview-greeting', `مرحباً، ${APP.inspector.name.split(' ')[0]} 👋`);
  setText('overview-context', `${APP.inspector.district} — ${APP.inspector.province}`);

  const total    = APP.teachers.length;
  const reported = APP.reports.filter(r => r.status !== 'not_submitted').length;
  const pending  = APP.tickets.filter(t => t.status === 'pending').length;
  const visits   = APP.visits.filter(v => v.status === 'scheduled').length;

  animCount('stat-teachers', total);
  animCount('stat-reports',  reported);
  animCount('stat-pending',  pending);
  animCount('stat-visits',   visits);

  setText('stat-teachers-f', total ? `${APP.teachers.length} أستاذ في الدائرة` : 'لا يوجد أساتذة بعد');
  setText('stat-reports-f',  total ? `${Math.round(reported/Math.max(total,1)*100)}% من الإجمالي` : '—');

  // Badge
  const badge = document.getElementById('pending-badge');
  if (badge) { badge.textContent = pending; badge.style.display = pending ? 'inline' : 'none'; }

  // Activity / empty
  const hasData = APP.tickets.length || APP.reports.length;
  const emptyEl = document.getElementById('empty-overview');
  const actEl   = document.getElementById('activity-section');

  if (!total) {
    emptyEl && (emptyEl.style.display = 'flex');
    actEl   && (actEl.style.display = 'none');
  } else {
    emptyEl && (emptyEl.style.display = 'none');
    actEl   && (actEl.style.display = 'block');
    renderActivityFeed();
  }
  renderVisitsList();
}


function renderActivityFeed() {
  const feed = document.getElementById('activity-feed');
  if (!feed) return;

  const activities = [
    ...APP.tickets.slice(-5).map(t => ({ type: 'ticket', data: t, at: t.createdAt })),
    ...APP.reports.slice(-5).map(r => ({ type: 'report', data: r, at: r.submittedAt })),
  ].sort((a,b) => new Date(b.at) - new Date(a.at)).slice(0, 6);

  if (!activities.length) {
    feed.innerHTML = '<div class="feed-empty">لا توجد نشاطات بعد.</div>';
    return;
  }

  feed.innerHTML = activities.map(a => {
    const teacher = APP.teachers.find(t => t.id === a.data.teacherId) || {};
    const color   = teacher.color || COLORS[0];
    if (a.type === 'ticket') {
      const t = a.data;
      return `<div class="af-row">
        <div class="af-av" style="background:${color}">${initial(t.teacherName)}</div>
        <div class="af-body">
          <div class="af-name">${t.teacherName} <span style="color:var(--gray-400);font-weight:400">— ${t.school}</span></div>
          <div class="af-desc">${t.title}</div>
        </div>
        <div class="af-meta">
          <span class="badge ${typeBadgeClass(t.type)}">${typeLabel(t.type)}</span>
          <span class="af-time">${relTime(t.createdAt)}</span>
        </div>
      </div>`;
    } else {
      const r = a.data;
      return `<div class="af-row">
        <div class="af-av" style="background:${color}">${initial(r.teacherName)}</div>
        <div class="af-body">
          <div class="af-name">${r.teacherName} <span style="color:var(--gray-400);font-weight:400">— ${r.school}</span></div>
          <div class="af-desc">رفع تقرير: ${r.title}</div>
        </div>
        <div class="af-meta">
          <span class="badge b-report">تقرير</span>
          <span class="af-time">${relTime(r.submittedAt)}</span>
        </div>
      </div>`;
    }
  }).join('');
}

// ─── TICKETS ────────────────────────────────────────────
let currentTicketFilter = 'all';

function renderTickets(filter) {
  if (filter) currentTicketFilter = filter;
  const tbody = document.getElementById('tickets-tbody');
  const emptyEl = document.getElementById('tickets-empty');
  const tableEl = document.getElementById('tickets-table-wrap');
  if (!tbody) return;

  let list = APP.tickets.slice().reverse();
  if (currentTicketFilter !== 'all') list = list.filter(t => t.status === currentTicketFilter);

  if (!list.length) {
    emptyEl  && (emptyEl.style.display  = 'flex');
    tableEl  && (tableEl.style.display  = 'none');
    return;
  }
  emptyEl  && (emptyEl.style.display  = 'none');
  tableEl  && (tableEl.style.display  = 'block');

  tbody.innerHTML = list.map(t => `
    <tr>
      <td><div class="td-user">
        <div class="td-av" style="background:${teacherColor(t.teacherId)}">${initial(t.teacherName)}</div>
        <span>${t.teacherName}</span>
      </div></td>
      <td><span class="badge ${typeBadgeClass(t.type)}">${typeLabel(t.type)}</span></td>
      <td>${t.school}</td>
      <td>${formatDate(t.createdAt)}</td>
      <td><span class="status ${statusClass(t.status)}">${statusLabel(t.status)}</span></td>
      <td><button class="btn-act ${t.status==='pending'?'btn-act-primary':'btn-act-ghost'}" onclick="openTicketModal('${t.id}')">
        ${t.status === 'pending' ? 'معالجة' : 'عرض'}
      </button></td>
    </tr>`).join('');
}

function filterTickets(filter, btn) {
  document.querySelectorAll('.fbtn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderTickets(filter);
}

function openTicketModal(id) {
  activeTicketId = id;
  const t = APP.tickets.find(t => t.id === id);
  if (!t) return;
  const body = document.getElementById('ticket-modal-body');
  body.innerHTML = `
    <div class="ticket-detail-grid">
      <div class="tdg-row"><span class="tdg-key">المُقدِّم:</span><span class="tdg-val">${t.teacherName}</span></div>
      <div class="tdg-row"><span class="tdg-key">المؤسسة:</span><span class="tdg-val">${t.school}</span></div>
      <div class="tdg-row"><span class="tdg-key">نوع الطلب:</span><span class="tdg-val"><span class="badge ${typeBadgeClass(t.type)}">${typeLabel(t.type)}</span></span></div>
      <div class="tdg-row"><span class="tdg-key">الموضوع:</span><span class="tdg-val">${t.title}</span></div>
      <div class="tdg-row"><span class="tdg-key">التاريخ:</span><span class="tdg-val">${formatDate(t.createdAt)}</span></div>
      ${t.subject ? `<div class="tdg-row"><span class="tdg-key">المادة:</span><span class="tdg-val">${t.subject}</span></div>` : ''}
      ${t.preferredDate ? `<div class="tdg-row"><span class="tdg-key">التاريخ المقترح:</span><span class="tdg-val">${t.preferredDate}</span></div>` : ''}
      <div class="tdg-row"><span class="tdg-key">الشرح:</span><span class="tdg-val">${t.desc}</span></div>
      ${t.notes ? `<div class="tdg-row"><span class="tdg-key">ملاحظات:</span><span class="tdg-val">${t.notes}</span></div>` : ''}
    </div>
    <div class="form-group" style="margin-top:4px">
      <label class="form-label" style="color:var(--gray-700)">رد المفتش / ملاحظة</label>
      <textarea class="form-textarea" id="ticket-inspector-note" rows="3" placeholder="اكتب ردك هنا...">${t.inspectorNote||''}</textarea>
    </div>`;

  // Show/hide action buttons based on status
  const ft = document.querySelector('#modal-ticket .modal-ft');
  if (t.status !== 'pending') {
    ft.innerHTML = `<button class="btn-ghost" onclick="closeModal('modal-ticket')">إغلاق</button>`;
  } else {
    ft.innerHTML = `
      <button class="btn-danger" onclick="respondTicket('rejected')">رفض</button>
      <button class="btn-success" onclick="respondTicket('inprogress')">قبول ومعالجة</button>`;
  }
  openModal('modal-ticket');
}

function respondTicket(newStatus) {
  const idx = APP.tickets.findIndex(t => t.id === activeTicketId);
  if (idx === -1) return;
  const note = document.getElementById('ticket-inspector-note')?.value || '';
  APP.tickets[idx].status = newStatus;
  APP.tickets[idx].inspectorNote = note;
  saveAll();
  closeModal('modal-ticket');
  renderTickets();
  renderInspectorOverview();
  showToast(newStatus === 'inprogress' ? '✅ تم قبول الطلب' : '❌ تم رفض الطلب');
}

// ─── REPORTS ────────────────────────────────────────────
function renderInspectorReports() {
  const listEl   = document.getElementById('reports-list');
  const emptyEl  = document.getElementById('reports-empty');
  const chipsEl  = document.getElementById('report-chips');
  if (!listEl) return;

  const reports = APP.reports.slice().reverse();
  const approved  = reports.filter(r => r.status === 'approved').length;
  const review    = reports.filter(r => r.status === 'pending_review').length;
  const rejected  = reports.filter(r => r.status === 'rejected').length;

  if (chipsEl) chipsEl.innerHTML = `
    <span class="rsc rsc-green">✓ معتمد: ${approved}</span>
    <span class="rsc rsc-blue">⏳ للمراجعة: ${review}</span>
    <span class="rsc rsc-red">✗ مرفوض: ${rejected}</span>`;

  if (!reports.length) {
    emptyEl  && (emptyEl.style.display  = 'flex');
    listEl.style.display = 'none';
    return;
  }
  emptyEl  && (emptyEl.style.display  = 'none');
  listEl.style.display = 'flex';

  listEl.innerHTML = reports.map(r => {
    const cls = r.status === 'approved' ? 'rc-approved' : r.status === 'pending_review' ? 'rc-review' : r.status === 'rejected' ? 'rc-rejected' : 'rc-not_submitted';
    const actionBtn = r.status === 'pending_review'
      ? `<button class="btn-act btn-act-primary" onclick="openReportModal('${r.id}')">مراجعة</button>`
      : `<button class="btn-act btn-act-ghost" onclick="openReportModal('${r.id}')">عرض</button>`;
    return `<div class="report-card ${cls}">
      <div class="rc-icon">📄</div>
      <div class="rc-body">
        <div class="rc-title">${r.title}</div>
        <div class="rc-sub">${r.teacherName} — ${r.school} — ${r.grade}</div>
      </div>
      <div class="rc-meta">
        <span class="rc-date">رُفع: ${formatDate(r.submittedAt)}</span>
        <span class="status ${statusClass(r.status)}">${statusLabel(r.status)}</span>
      </div>
      <div class="rc-actions">${actionBtn}</div>
    </div>`;
  }).join('');
}

function openReportModal(id) {
  activeReportId = id;
  const r = APP.reports.find(r => r.id === id);
  if (!r) return;
  const body = document.getElementById('report-modal-body');
  body.innerHTML = `
    <div class="ticket-detail-grid">
      <div class="tdg-row"><span class="tdg-key">الأستاذ:</span><span class="tdg-val">${r.teacherName}</span></div>
      <div class="tdg-row"><span class="tdg-key">المؤسسة:</span><span class="tdg-val">${r.school}</span></div>
      <div class="tdg-row"><span class="tdg-key">المستوى:</span><span class="tdg-val">${r.grade}</span></div>
      <div class="tdg-row"><span class="tdg-key">العنوان:</span><span class="tdg-val">${r.title}</span></div>
      <div class="tdg-row"><span class="tdg-key">الدورة:</span><span class="tdg-val">${r.semester}</span></div>
      ${r.subject ? `<div class="tdg-row"><span class="tdg-key">المادة:</span><span class="tdg-val">${r.subject}</span></div>` : ''}
      <div class="tdg-row"><span class="tdg-key">الحالة:</span><span class="tdg-val"><span class="status ${statusClass(r.status)}">${statusLabel(r.status)}</span></span></div>
    </div>
    <div class="form-group" style="margin-top:4px">
      <label class="form-label" style="color:var(--gray-700)">ملاحظة المفتش</label>
      <textarea class="form-textarea" id="report-inspector-note" rows="3" placeholder="أكتب ملاحظتك على التقرير...">${r.inspectorNote||''}</textarea>
    </div>`;

  const ft = document.querySelector('#modal-report-review .modal-ft');
  if (r.status !== 'pending_review') {
    ft.innerHTML = `<button class="btn-ghost" onclick="closeModal('modal-report-review')">إغلاق</button>`;
  } else {
    ft.innerHTML = `
      <button class="btn-danger" onclick="respondReport('rejected')">رفض</button>
      <button class="btn-success" onclick="respondReport('approved')">اعتماد</button>`;
  }
  openModal('modal-report-review');
}

function respondReport(newStatus) {
  const idx = APP.reports.findIndex(r => r.id === activeReportId);
  if (idx === -1) return;
  const note = document.getElementById('report-inspector-note')?.value || '';
  APP.reports[idx].status = newStatus;
  APP.reports[idx].inspectorNote = note;
  saveAll();
  closeModal('modal-report-review');
  renderInspectorReports();
  showToast(newStatus === 'approved' ? '✅ تم اعتماد التقرير' : '❌ تم رفض التقرير');
}

// ─── TEACHERS DIRECTORY ──────────────────────────────────
function renderTeachers(filter = '') {
  const grid    = document.getElementById('teachers-grid');
  const emptyEl = document.getElementById('teachers-empty');
  const countEl = document.getElementById('teachers-count-label');
  if (!grid) return;

  const q    = filter.toLowerCase();
  const list = APP.teachers.filter(t =>
    !q ||
    t.name.includes(q) ||
    t.school.toLowerCase().includes(q) ||
    (t.grade  || '').includes(q) ||
    (t.subject|| '').includes(q)
  );

  setText('teachers-count-label', `${APP.teachers.length} أستاذ/ة مسجل/ة في الدائرة`);

  if (!list.length) {
    emptyEl && (emptyEl.style.display = 'flex');
    grid.innerHTML = '';
    return;
  }
  emptyEl && (emptyEl.style.display = 'none');

  grid.innerHTML = list.map(t => {
    const myReports = APP.reports.filter(r => r.teacherId === t.id);
    const approved  = myReports.filter(r => r.status === 'approved').length;
    const pending   = APP.tickets.filter(tk => tk.teacherId === t.id && tk.status === 'pending').length;
    return `<div class="teacher-card">
      <div class="tc-top">
        <div class="tc-av" style="background:${t.color}">${initial(t.name)}</div>
        <div><div class="tc-name">${t.name}</div><div class="tc-school">${t.school}</div></div>
      </div>
      <div class="tc-grade">${t.grade}${t.subject ? ' — ' + t.subject : ''}</div>
      <div class="tc-footer">
        <span>تقارير: ${approved} معتمد</span>
        ${pending ? `<span class="status s-pending">${pending} طلب معلق</span>` : '<span style="color:var(--green-700);font-weight:700">✓ لا طلبات معلقة</span>'}
      </div>
    </div>`;
  }).join('');
}

function addTeacherFromModal() {
  const name    = v('m-t-name');
  const email   = v('m-t-email').toLowerCase();
  const pass    = v('m-t-pass');
  const school  = v('m-t-school');
  const grade   = v('m-t-grade');
  const subject = v('m-t-subject');

  if (!name || !email || !pass || !school || !grade) {
    showToast('⚠ يُرجى ملء الحقول الإلزامية');
    return;
  }
  if (APP.teachers.find(t => t.email === email) || (APP.inspector && APP.inspector.email === email)) {
    showToast('⚠ هذا البريد الإلكتروني مسجل بالفعل');
    return;
  }

  const teacher = {
    id: genId(), name, email, pass, school, grade, subject,
    color: COLORS[APP.teachers.length % COLORS.length]
  };
  APP.teachers.push(teacher);
  saveAll();
  closeModal('modal-add-teacher');
  clearFields(['m-t-name','m-t-email','m-t-pass','m-t-school','m-t-grade','m-t-subject']);
  renderTeachers();
  renderInspectorOverview();
  showToast(`✅ تمت إضافة الأستاذ(ة) ${name} بنجاح`);
}

// ════════════════════════════════════════════════════════
// TEACHER DASHBOARD
// ════════════════════════════════════════════════════════
function enterTeacher(teacherId) {
  showScreen('teacher');
  const teacher = APP.teachers.find(t => t.id === teacherId);
  if (!teacher) { logout(); return; }

  setText('t-school-label', teacher.school);
  setText('t-name-sb', teacher.name);
  setText('t-avatar-sb', initial(teacher.name));

  tTab('t-home', document.querySelector('[data-tab="t-home"]'));
  renderTeacherHome(teacher);
}

function tTab(id, el) {
  if (window.event && typeof window.event.preventDefault === 'function') window.event.preventDefault();
  document.querySelectorAll('#screen-teacher .tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('#screen-teacher .nav-item').forEach(n => n.classList.remove('active'));
  const panel = document.getElementById(`tab-${id}`);
  if (panel) panel.classList.add('active');
  if (el) el.classList.add('active');

  const tid = APP.currentUser?.id;
  const t   = APP.teachers.find(t => t.id === tid);
  if (!t) return;

  if (id === 't-home')    renderTeacherHome(t);
  if (id === 't-reports') renderTeacherReports(t);
  if (id === 't-profile') renderTeacherProfile(t);
  if (id === 't-request') {
    const today = new Date().toISOString().split('T')[0];
    const df = document.getElementById('req-date');
    if (df && !df.value) df.value = today;
  }
}

function renderTeacherHome(teacher) {
  setText('t-greeting', `مرحباً، ${teacher.name.split(' ')[0]} 👋`);
  setText('t-school-sub', `${teacher.school} — ${teacher.grade}`);
  setText('t-today-date', todayStr());

  const myReports = APP.reports.filter(r => r.teacherId === teacher.id);
  const myTickets = APP.tickets.filter(t => t.teacherId === teacher.id);
  const myVisits  = APP.visits.filter(v => v.teacherId === teacher.id && v.status === 'scheduled');

  animCount('tsm-reports', myReports.filter(r => r.status !== 'not_submitted').length);
  animCount('tsm-pending', myTickets.filter(t => t.status === 'pending').length);
  animCount('tsm-done',    myTickets.filter(t => t.status === 'closed' || t.status === 'inprogress').length);
  animCount('tsm-visits',  myVisits.length);

  // My requests feed
  const feed = document.getElementById('my-requests-feed');
  const recent = myTickets.slice().reverse().slice(0, 5);
  if (!recent.length) {
    feed.innerHTML = '<div class="feed-empty">لا توجد طلبات مُرسَلة بعد.</div>';
  } else {
    feed.innerHTML = recent.map(t => `
      <div class="my-req-item">
        <span class="badge ${typeBadgeClass(t.type)}">${typeLabel(t.type)}</span>
        <div class="mri-desc">${t.title}</div>
        <span class="mri-date">${formatDate(t.createdAt)}</span>
        <span class="status ${statusClass(t.status)}">${statusLabel(t.status)}</span>
      </div>`).join('');
  }
}

function renderTeacherReports(teacher) {
  const listEl  = document.getElementById('my-reports-list');
  const emptyEl = document.getElementById('my-reports-empty');
  const reports = APP.reports.filter(r => r.teacherId === teacher.id).slice().reverse();

  if (!reports.length) {
    emptyEl  && (emptyEl.style.display  = 'flex');
    listEl.style.display = 'none';
    return;
  }
  emptyEl  && (emptyEl.style.display  = 'none');
  listEl.style.display = 'flex';

  listEl.innerHTML = reports.map(r => {
    const cls = r.status === 'approved' ? 'rc-approved' : r.status === 'pending_review' ? 'rc-review' : r.status === 'rejected' ? 'rc-rejected' : 'rc-not_submitted';
    const note = r.inspectorNote ? `<div class="rc-sub" style="margin-top:4px;color:var(--gray-500)">ملاحظة المفتش: ${r.inspectorNote}</div>` : '';
    return `<div class="report-card ${cls}">
      <div class="rc-icon">📄</div>
      <div class="rc-body">
        <div class="rc-title">${r.title}</div>
        <div class="rc-sub">${r.semester}${r.subject ? ' — ' + r.subject : ''}</div>
        ${note}
      </div>
      <div class="rc-meta">
        <span class="rc-date">رُفع: ${formatDate(r.submittedAt)}</span>
        <span class="status ${statusClass(r.status)}">${statusLabel(r.status)}</span>
      </div>
    </div>`;
  }).join('');
}

function renderTeacherProfile(teacher) {
  setText('pc-avatar', initial(teacher.name));
  setText('pc-name',   teacher.name);
  const grid = document.getElementById('pc-grid');
  if (!grid) return;
  const insp = APP.inspector;
  grid.innerHTML = `
    <div class="pc-item"><label>المؤسسة التعليمية</label><span>${teacher.school}</span></div>
    <div class="pc-item"><label>المستوى الدراسي</label><span>${teacher.grade}</span></div>
    <div class="pc-item"><label>المادة الدراسية</label><span>${teacher.subject || '—'}</span></div>
    <div class="pc-item"><label>البريد الإلكتروني</label><span>${teacher.email}</span></div>
    <div class="pc-item"><label>النيابة الإقليمية</label><span>${insp?.province || '—'}</span></div>
    <div class="pc-item"><label>الدائرة التعليمية</label><span>${insp?.district || '—'}</span></div>
    <div class="pc-item"><label>المفتش المختص</label><span>${insp?.name || '—'}</span></div>
    <div class="pc-item"><label>المرحلة الدراسية</label><span>${insp?.level || '—'}</span></div>`;
}

// ─── SUBMIT REQUEST ──────────────────────────────────────
function selType(el, type) {
  document.querySelectorAll('.rtype').forEach(r => r.classList.remove('active'));
  el.classList.add('active');
  selectedRequestType = type;
}

function submitRequest() {
  const title = v('req-title');
  const date  = v('req-date');
  const desc  = v('req-desc');
  if (!title || !date || !desc) {
    showToast('⚠ يُرجى ملء الحقول الإلزامية');
    return;
  }
  const teacher = APP.teachers.find(t => t.id === APP.currentUser.id);
  if (!teacher) return;

  const ticket = {
    id:            genId(),
    teacherId:     teacher.id,
    teacherName:   teacher.name,
    school:        teacher.school,
    type:          selectedRequestType,
    title,
    desc,
    subject:       v('req-subject'),
    unit:          v('req-unit'),
    notes:         v('req-notes'),
    preferredDate: date,
    status:        'pending',
    inspectorNote: '',
    createdAt:     new Date().toISOString(),
  };
  APP.tickets.push(ticket);
  saveAll();
  clearRequestForm();
  showToast('✅ تم إرسال طلبك بنجاح. سيتم الرد عليه قريباً.');
  tTab('t-home', document.querySelector('[data-tab="t-home"]'));
}

function clearRequestForm() {
  clearFields(['req-title','req-date','req-subject','req-unit','req-desc','req-notes']);
  selType(document.querySelector('.rtype'), 'visit');
}

// ─── UPLOAD REPORT ───────────────────────────────────────
function uploadReport() {
  const title   = v('rpt-title');
  const semester= v('rpt-semester');
  const subject = v('rpt-subject');
  if (!title) { showToast('⚠ يُرجى إدخال عنوان التقرير'); return; }

  const teacher = APP.teachers.find(t => t.id === APP.currentUser.id);
  if (!teacher) return;

  const report = {
    id:           genId(),
    teacherId:    teacher.id,
    teacherName:  teacher.name,
    school:       teacher.school,
    grade:        teacher.grade,
    title,
    semester,
    subject,
    status:       'pending_review',
    inspectorNote:'',
    submittedAt:  new Date().toISOString(),
  };
  APP.reports.push(report);
  saveAll();
  closeModal('modal-upload-report');
  clearFields(['rpt-title','rpt-subject']);
  renderTeacherReports(teacher);
  showToast('✅ تم رفع التقرير بنجاح. في انتظار مراجعة المفتش.');
}

// ════════════════════════════════════════════════════════
// MODALS
// ════════════════════════════════════════════════════════
function openModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.add('open');
}
function closeModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove('open');
}

// ════════════════════════════════════════════════════════
// UTILITIES
// ════════════════════════════════════════════════════════
function v(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}
function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}
function clearFields(ids) {
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
function initial(name) {
  if (!name) return '؟';
  const clean = name.replace(/أ\.\s*/,'').trim();
  return clean[0] || '؟';
}
function teacherColor(id) {
  const t = APP.teachers.find(t => t.id === id);
  return t ? t.color : COLORS[0];
}
function todayStr() {
  return new Date().toLocaleDateString('ar-MA', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
}
function formatDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('ar-MA', { day:'numeric', month:'long', year:'numeric' }); }
  catch(e) { return iso; }
}
function relTime(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)   return 'الآن';
  if (m < 60)  return `منذ ${m} دقيقة`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `منذ ${h} ساعة`;
  const d = Math.floor(h / 24);
  return `منذ ${d} يوم`;
}
function animCount(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  let c = 0; const step = Math.ceil(target / 30);
  const i = setInterval(() => {
    c = Math.min(c + step, target);
    el.textContent = c;
    if (c >= target) clearInterval(i);
  }, 22);
}

// Label maps
function typeLabel(type) {
  return { visit:'زيارة صفية', accomp:'مرافقة تربوية', admin:'استفسار إداري', complaint:'تظلم / شكاية' }[type] || type;
}
function typeBadgeClass(type) {
  return { visit:'b-visit', accomp:'b-accomp', admin:'b-admin', complaint:'b-complaint' }[type] || '';
}
function statusLabel(status) {
  return {
    pending:       'معلق',
    inprogress:    'قيد المعالجة',
    closed:        'مغلق',
    rejected:      'مرفوض',
    approved:      'معتمد',
    pending_review:'قيد المراجعة',
    not_submitted: 'لم يُرفع بعد',
  }[status] || status;
}
function statusClass(status) {
  return {
    pending:       's-pending',
    inprogress:    's-inprogress',
    closed:        's-closed',
    rejected:      's-rejected',
    approved:      's-approved',
    pending_review:'s-review',
    not_submitted: 's-not_submitted',
  }[status] || '';
}

// Toast
let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
}

/* ===== Improved overrides ===== */
function e(val) {
  return String(val ?? '').replace(/[&<>"']/g, s => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[s]));
}

function handleLogin(evn) {
  evn.preventDefault();
  const email = document.getElementById('login-email').value.trim().toLowerCase();
  const pass  = document.getElementById('login-pass').value;
  const errEl = document.getElementById('login-error');

  if (activeLoginRole === 'inspector') {
    if (APP.inspector && APP.inspector.email === email && APP.inspector.pass === pass) {
      APP.currentUser = { role: 'inspector', id: APP.inspector.id };
      save(KEYS.CURRENT_USER, APP.currentUser);
      errEl.style.display = 'none';
      enterInspector();
      return;
    }
  } else {
    const teacher = APP.teachers.find(t => t.email.toLowerCase() === email && t.pass === pass);
    if (teacher) {
      APP.currentUser = { role: 'teacher', id: teacher.id };
      save(KEYS.CURRENT_USER, APP.currentUser);
      errEl.style.display = 'none';
      enterTeacher(teacher.id);
      return;
    }
  }
  errEl.style.display = 'block';
}

function renderVisitsList() {
  const section = document.getElementById('visits-section');
  const listEl = document.getElementById('visits-list');
  const summary = document.getElementById('visits-summary');
  if (!section || !listEl || !summary) return;

  const visits = APP.visits.slice().sort((a,b) => new Date(a.date) - new Date(b.date));
  if (!visits.length) {
    section.style.display = 'none';
    summary.textContent = 'لا توجد زيارات';
    listEl.innerHTML = '';
    return;
  }

  section.style.display = 'block';
  summary.textContent = `${visits.filter(v => v.status === 'scheduled').length} مبرمجة / ${visits.length} إجمالاً`;
  listEl.innerHTML = visits.map(v => {
    const teacher = APP.teachers.find(t => t.id === v.teacherId) || {};
    const done = v.status === 'done';
    return `<div class="visit-item">
      <div class="visit-main">
        <div class="visit-title">${e(teacher.name || 'أستاذ')}</div>
        <div class="visit-sub">${e(teacher.school || '—')} — ${e(teacher.grade || '—')}</div>
      </div>
      <div class="visit-meta">
        <span class="visit-date">${formatDate(v.date)}</span>
        <span class="status ${done ? 's-closed' : 's-inprogress'}">${done ? 'أُنجزت' : 'مبرمجة'}</span>
      </div>
    </div>`;
  }).join('');
}

function renderInspectorOverview() {
  setText('today-date', todayStr());
  setText('overview-greeting', `مرحباً، ${APP.inspector.name.split(' ')[0]} 👋`);
  setText('overview-context', `${APP.inspector.district} — ${APP.inspector.province}`);

  const total    = APP.teachers.length;
  const reported = APP.reports.filter(r => r.status !== 'not_submitted').length;
  const pending  = APP.tickets.filter(t => t.status === 'pending').length;
  const visits   = APP.visits.filter(v => v.status === 'scheduled').length;

  animCount('stat-teachers', total);
  animCount('stat-reports',  reported);
  animCount('stat-pending',  pending);
  animCount('stat-visits',   visits);

  setText('stat-teachers-f', total ? `${APP.teachers.length} أستاذ في الدائرة` : 'لا يوجد أساتذة بعد');
  setText('stat-reports-f',  total ? `${Math.round(reported/Math.max(total,1)*100)}% من الإجمالي` : '—');

  const badge = document.getElementById('pending-badge');
  if (badge) { badge.textContent = pending; badge.style.display = pending ? 'inline' : 'none'; }

  const emptyEl = document.getElementById('empty-overview');
  const actEl   = document.getElementById('activity-section');
  if (!total) {
    emptyEl && (emptyEl.style.display = 'flex');
    actEl   && (actEl.style.display = 'none');
  } else {
    emptyEl && (emptyEl.style.display = 'none');
    actEl   && (actEl.style.display = 'block');
    renderActivityFeed();
  }
  renderVisitsList();
}

function openTicketModal(id) {
  activeTicketId = id;
  const t = APP.tickets.find(t => t.id === id);
  if (!t) return;
  const body = document.getElementById('ticket-modal-body');
  const canSchedule = ['visit','accomp'].includes(t.type);
  const existingVisit = APP.visits.find(v => v.ticketId === t.id);
  body.innerHTML = `
    <div class="ticket-detail-grid">
      <div class="tdg-row"><span class="tdg-key">المُقدِّم:</span><span class="tdg-val">${e(t.teacherName)}</span></div>
      <div class="tdg-row"><span class="tdg-key">المؤسسة:</span><span class="tdg-val">${e(t.school)}</span></div>
      <div class="tdg-row"><span class="tdg-key">نوع الطلب:</span><span class="tdg-val"><span class="badge ${typeBadgeClass(t.type)}">${typeLabel(t.type)}</span></span></div>
      <div class="tdg-row"><span class="tdg-key">الموضوع:</span><span class="tdg-val">${e(t.title)}</span></div>
      <div class="tdg-row"><span class="tdg-key">التاريخ:</span><span class="tdg-val">${formatDate(t.createdAt)}</span></div>
      ${t.subject ? `<div class="tdg-row"><span class="tdg-key">المادة:</span><span class="tdg-val">${e(t.subject)}</span></div>` : ''}
      ${t.preferredDate ? `<div class="tdg-row"><span class="tdg-key">التاريخ المقترح:</span><span class="tdg-val">${formatDate(t.preferredDate)}</span></div>` : ''}
      <div class="tdg-row"><span class="tdg-key">الشرح:</span><span class="tdg-val">${e(t.desc)}</span></div>
      ${t.notes ? `<div class="tdg-row"><span class="tdg-key">ملاحظات:</span><span class="tdg-val">${e(t.notes)}</span></div>` : ''}
      ${existingVisit ? `<div class="tdg-row"><span class="tdg-key">الزيارة:</span><span class="tdg-val">${formatDate(existingVisit.date)} — ${existingVisit.status === 'done' ? 'أُنجزت' : 'مبرمجة'}</span></div>` : ''}
    </div>
    ${canSchedule ? `<div class="form-group"><label class="form-label" style="color:var(--gray-700)">تاريخ البرمجة</label><input class="form-input" id="ticket-schedule-date" type="date" value="${existingVisit?.date || t.preferredDate || ''}" /></div>` : ''}
    <div class="form-group" style="margin-top:4px">
      <label class="form-label" style="color:var(--gray-700)">رد المفتش / ملاحظة</label>
      <textarea class="form-textarea" id="ticket-inspector-note" rows="3" placeholder="اكتب ردك هنا...">${e(t.inspectorNote || '')}</textarea>
    </div>`;

  const ft = document.querySelector('#modal-ticket .modal-ft');
  if (t.status === 'pending') {
    ft.innerHTML = `
      <button class="btn-danger" onclick="respondTicket('rejected')">رفض</button>
      <button class="btn-success" onclick="respondTicket('inprogress')">قبول ومعالجة</button>`;
  } else if (t.status === 'inprogress') {
    ft.innerHTML = `
      <button class="btn-ghost" onclick="closeModal('modal-ticket')">إغلاق</button>
      <button class="btn-success" onclick="respondTicket('closed')">تعليم كمنجز</button>`;
  } else {
    ft.innerHTML = `<button class="btn-ghost" onclick="closeModal('modal-ticket')">إغلاق</button>`;
  }
  openModal('modal-ticket');
}

function respondTicket(newStatus) {
  const idx = APP.tickets.findIndex(t => t.id === activeTicketId);
  if (idx === -1) return;
  const ticket = APP.tickets[idx];
  const note = document.getElementById('ticket-inspector-note')?.value || '';
  const scheduleDate = document.getElementById('ticket-schedule-date')?.value || '';

  ticket.status = newStatus;
  ticket.inspectorNote = note;

  if (scheduleDate && ['visit','accomp'].includes(ticket.type) && (newStatus === 'inprogress' || newStatus === 'closed')) {
    let visit = APP.visits.find(v => v.ticketId === ticket.id);
    if (!visit) {
      visit = { id: genId(), ticketId: ticket.id, teacherId: ticket.teacherId, date: scheduleDate, status: 'scheduled' };
      APP.visits.push(visit);
    } else {
      visit.date = scheduleDate;
      if (visit.status !== 'done') visit.status = 'scheduled';
    }
  }
  if (newStatus === 'closed') {
    const visit = APP.visits.find(v => v.ticketId === ticket.id);
    if (visit) visit.status = 'done';
  }

  saveAll();
  closeModal('modal-ticket');
  renderTickets();
  renderInspectorOverview();
  showToast({ inprogress:'✅ تم قبول الطلب', rejected:'❌ تم رفض الطلب', closed:'✅ تم إغلاق الطلب' }[newStatus] || '✅ تم تحديث الطلب');
}

function renderInspectorReports() {
  const listEl   = document.getElementById('reports-list');
  const emptyEl  = document.getElementById('reports-empty');
  const chipsEl  = document.getElementById('report-chips');
  if (!listEl) return;

  const reports = APP.reports.slice().reverse();
  const approved  = reports.filter(r => r.status === 'approved').length;
  const review    = reports.filter(r => r.status === 'pending_review').length;
  const rejected  = reports.filter(r => r.status === 'rejected').length;

  if (chipsEl) chipsEl.innerHTML = `
    <span class="rsc rsc-green">✓ معتمد: ${approved}</span>
    <span class="rsc rsc-blue">⏳ للمراجعة: ${review}</span>
    <span class="rsc rsc-red">✗ مرفوض: ${rejected}</span>`;

  if (!reports.length) {
    emptyEl  && (emptyEl.style.display  = 'flex');
    listEl.style.display = 'none';
    return;
  }
  emptyEl  && (emptyEl.style.display  = 'none');
  listEl.style.display = 'flex';

  listEl.innerHTML = reports.map(r => {
    const cls = r.status === 'approved' ? 'rc-approved' : r.status === 'pending_review' ? 'rc-review' : r.status === 'rejected' ? 'rc-rejected' : 'rc-not_submitted';
    const actionBtn = r.status === 'pending_review'
      ? `<button class="btn-act btn-act-primary" onclick="openReportModal('${r.id}')">مراجعة</button>`
      : `<button class="btn-act btn-act-ghost" onclick="openReportModal('${r.id}')">عرض</button>`;
    return `<div class="report-card ${cls}">
      <div class="rc-icon">📄</div>
      <div class="rc-body">
        <div class="rc-title">${e(r.title)}</div>
        <div class="rc-sub">${e(r.teacherName)} — ${e(r.school)} — ${e(r.grade)}</div>
        ${r.summary ? `<div class="rc-sub" style="margin-top:4px">${e(r.summary)}</div>` : ''}
        ${r.fileName ? `<div class="rc-sub" style="margin-top:4px">ملف: ${e(r.fileName)}</div>` : ''}
      </div>
      <div class="rc-meta">
        <span class="rc-date">رُفع: ${formatDate(r.submittedAt)}</span>
        <span class="status ${statusClass(r.status)}">${statusLabel(r.status)}</span>
      </div>
      <div class="rc-actions">${actionBtn}</div>
    </div>`;
  }).join('');
}

function openReportModal(id) {
  activeReportId = id;
  const r = APP.reports.find(r => r.id === id);
  if (!r) return;
  const body = document.getElementById('report-modal-body');
  body.innerHTML = `
    <div class="ticket-detail-grid">
      <div class="tdg-row"><span class="tdg-key">الأستاذ:</span><span class="tdg-val">${e(r.teacherName)}</span></div>
      <div class="tdg-row"><span class="tdg-key">المؤسسة:</span><span class="tdg-val">${e(r.school)}</span></div>
      <div class="tdg-row"><span class="tdg-key">المستوى:</span><span class="tdg-val">${e(r.grade)}</span></div>
      <div class="tdg-row"><span class="tdg-key">العنوان:</span><span class="tdg-val">${e(r.title)}</span></div>
      <div class="tdg-row"><span class="tdg-key">الدورة:</span><span class="tdg-val">${e(r.semester || '')}</span></div>
      ${r.subject ? `<div class="tdg-row"><span class="tdg-key">المادة:</span><span class="tdg-val">${e(r.subject)}</span></div>` : ''}
      ${r.summary ? `<div class="tdg-row"><span class="tdg-key">الملخص:</span><span class="tdg-val">${e(r.summary)}</span></div>` : ''}
      ${r.fileName ? `<div class="tdg-row"><span class="tdg-key">الملف:</span><span class="tdg-val">${e(r.fileName)}</span></div>` : ''}
      <div class="tdg-row"><span class="tdg-key">الحالة:</span><span class="tdg-val"><span class="status ${statusClass(r.status)}">${statusLabel(r.status)}</span></span></div>
    </div>
    <div class="form-group" style="margin-top:4px">
      <label class="form-label" style="color:var(--gray-700)">ملاحظة المفتش</label>
      <textarea class="form-textarea" id="report-inspector-note" rows="3" placeholder="أكتب ملاحظتك على التقرير...">${e(r.inspectorNote || '')}</textarea>
    </div>`;

  const ft = document.querySelector('#modal-report-review .modal-ft');
  if (r.status !== 'pending_review') {
    ft.innerHTML = `<button class="btn-ghost" onclick="closeModal('modal-report-review')">إغلاق</button>`;
  } else {
    ft.innerHTML = `
      <button class="btn-danger" onclick="respondReport('rejected')">رفض</button>
      <button class="btn-success" onclick="respondReport('approved')">اعتماد</button>`;
  }
  openModal('modal-report-review');
}

function respondReport(newStatus) {
  const idx = APP.reports.findIndex(r => r.id === activeReportId);
  if (idx === -1) return;
  const note = document.getElementById('report-inspector-note')?.value || '';
  APP.reports[idx].status = newStatus;
  APP.reports[idx].inspectorNote = note;
  saveAll();
  closeModal('modal-report-review');
  renderInspectorReports();
  renderInspectorOverview();
  showToast(newStatus === 'approved' ? '✅ تم اعتماد التقرير' : '❌ تم رفض التقرير');
}

function renderTeachers(filter = '') {
  const grid    = document.getElementById('teachers-grid');
  const emptyEl = document.getElementById('teachers-empty');
  if (!grid) return;
  const q = filter.trim().toLowerCase();
  const list = APP.teachers.filter(t => [t.name, t.school, t.grade || '', t.subject || '', t.email].join(' ').toLowerCase().includes(q) || !q);
  setText('teachers-count-label', `${APP.teachers.length} أستاذ/ة مسجل/ة في الدائرة`);

  if (!list.length) {
    emptyEl && (emptyEl.style.display = 'flex');
    grid.innerHTML = '';
    return;
  }
  emptyEl && (emptyEl.style.display = 'none');

  grid.innerHTML = list.map(t => {
    const myReports = APP.reports.filter(r => r.teacherId === t.id);
    const approved  = myReports.filter(r => r.status === 'approved').length;
    const pending   = APP.tickets.filter(tk => tk.teacherId === t.id && tk.status === 'pending').length;
    const scheduled = APP.visits.filter(v => v.teacherId === t.id && v.status === 'scheduled').length;
    return `<div class="teacher-card">
      <div class="tc-top">
        <div class="tc-av" style="background:${t.color}">${initial(t.name)}</div>
        <div><div class="tc-name">${e(t.name)}</div><div class="tc-school">${e(t.school)}</div></div>
      </div>
      <div class="tc-grade">${e(t.grade)}${t.subject ? ' — ' + e(t.subject) : ''}</div>
      <div class="mini-stats"><span>تقارير: ${approved}</span><span>معلقة: ${pending}</span><span>زيارات: ${scheduled}</span></div>
      <div class="tc-footer"><span>${e(t.email)}</span><button class="btn-inline" onclick="openEditTeacherModal('${t.id}')">تعديل</button></div>
    </div>`;
  }).join('');
}

function openEditTeacherModal(id) {
  const teacher = APP.teachers.find(t => t.id === id);
  if (!teacher) return;
  activeTeacherId = id;
  document.getElementById('e-t-name').value = teacher.name || '';
  document.getElementById('e-t-email').value = teacher.email || '';
  document.getElementById('e-t-pass').value = '';
  document.getElementById('e-t-school').value = teacher.school || '';
  document.getElementById('e-t-grade').value = teacher.grade || '';
  document.getElementById('e-t-subject').value = teacher.subject || '';
  openModal('modal-edit-teacher');
}

function saveTeacherEdit() {
  const idx = APP.teachers.findIndex(t => t.id === activeTeacherId);
  if (idx === -1) return;
  const email = v('e-t-email').toLowerCase();
  if (!v('e-t-name') || !email || !v('e-t-school') || !v('e-t-grade')) {
    showToast('⚠ يُرجى ملء الحقول الإلزامية');
    return;
  }
  if (APP.teachers.some((t, i) => i !== idx && t.email === email) || (APP.inspector && APP.inspector.email === email)) {
    showToast('⚠ هذا البريد الإلكتروني مستعمل');
    return;
  }
  APP.teachers[idx].name = v('e-t-name');
  APP.teachers[idx].email = email;
  APP.teachers[idx].school = v('e-t-school');
  APP.teachers[idx].grade = v('e-t-grade');
  APP.teachers[idx].subject = v('e-t-subject');
  if (v('e-t-pass')) APP.teachers[idx].pass = v('e-t-pass');
  APP.tickets.forEach(t => {
    if (t.teacherId === activeTeacherId) {
      t.teacherName = APP.teachers[idx].name;
      t.school = APP.teachers[idx].school;
    }
  });
  APP.reports.forEach(r => {
    if (r.teacherId === activeTeacherId) {
      r.teacherName = APP.teachers[idx].name;
      r.school = APP.teachers[idx].school;
      r.grade = APP.teachers[idx].grade;
    }
  });
  saveAll();
  closeModal('modal-edit-teacher');
  renderTeachers();
  renderInspectorOverview();
  showToast('✅ تم حفظ التعديلات');
}

function deleteTeacher() {
  const teacher = APP.teachers.find(t => t.id === activeTeacherId);
  if (!teacher) return;
  if (!confirm(`هل تريد حذف الأستاذ(ة) ${teacher.name}؟`)) return;
  APP.teachers = APP.teachers.filter(t => t.id !== activeTeacherId);
  APP.tickets = APP.tickets.filter(t => t.teacherId !== activeTeacherId);
  APP.reports = APP.reports.filter(r => r.teacherId !== activeTeacherId);
  APP.visits = APP.visits.filter(v => v.teacherId !== activeTeacherId);
  if (APP.currentUser?.id === activeTeacherId) {
    APP.currentUser = null;
    save(KEYS.CURRENT_USER, null);
  }
  saveAll();
  closeModal('modal-edit-teacher');
  renderTeachers();
  renderInspectorOverview();
  showToast('🗑️ تم حذف الأستاذ وجميع بياناته المرتبطة');
}

function renderTeacherHome(teacher) {
  setText('t-greeting', `مرحباً، ${teacher.name.split(' ')[0]} 👋`);
  setText('t-school-sub', `${teacher.school} — ${teacher.grade}`);
  setText('t-today-date', todayStr());

  const myReports = APP.reports.filter(r => r.teacherId === teacher.id);
  const myTickets = APP.tickets.filter(t => t.teacherId === teacher.id);
  const myVisits  = APP.visits.filter(v => v.teacherId === teacher.id && v.status === 'scheduled');

  animCount('tsm-reports', myReports.filter(r => r.status !== 'not_submitted').length);
  animCount('tsm-pending', myTickets.filter(t => t.status === 'pending').length);
  animCount('tsm-done',    myTickets.filter(t => t.status === 'closed' || t.status === 'inprogress').length);
  animCount('tsm-visits',  myVisits.length);

  const feed = document.getElementById('my-requests-feed');
  const recent = myTickets.slice().reverse().slice(0, 5);
  if (!recent.length) {
    feed.innerHTML = '<div class="feed-empty">لا توجد طلبات مُرسَلة بعد.</div>';
  } else {
    feed.innerHTML = recent.map(t => `
      <div class="my-req-item">
        <span class="badge ${typeBadgeClass(t.type)}">${typeLabel(t.type)}</span>
        <div class="mri-desc">${e(t.title)}</div>
        <span class="mri-date">${formatDate(t.createdAt)}</span>
        <span class="status ${statusClass(t.status)}">${statusLabel(t.status)}</span>
      </div>`).join('');
  }

  const vList = document.getElementById('teacher-visits-list');
  const vSummary = document.getElementById('teacher-visits-summary');
  if (vSummary) vSummary.textContent = myVisits.length ? `${myVisits.length} زيارة مبرمجة` : 'لا توجد زيارات';
  if (vList) {
    if (!myVisits.length) {
      vList.innerHTML = '<div class="feed-empty">لا توجد زيارات مبرمجة حالياً.</div>';
    } else {
      vList.innerHTML = myVisits.slice().sort((a,b) => new Date(a.date) - new Date(b.date)).map(v => `
        <div class="visit-item">
          <div class="visit-main">
            <div class="visit-title">زيارة مبرمجة</div>
            <div class="visit-sub">${e(teacher.school)} — ${e(teacher.grade)}</div>
          </div>
          <div class="visit-meta">
            <span class="visit-date">${formatDate(v.date)}</span>
            <span class="status s-inprogress">مبرمجة</span>
          </div>
        </div>`).join('');
    }
  }
}

function renderTeacherReports(teacher) {
  const listEl  = document.getElementById('my-reports-list');
  const emptyEl = document.getElementById('my-reports-empty');
  const reports = APP.reports.filter(r => r.teacherId === teacher.id).slice().reverse();

  if (!reports.length) {
    emptyEl  && (emptyEl.style.display  = 'flex');
    listEl.style.display = 'none';
    return;
  }
  emptyEl  && (emptyEl.style.display  = 'none');
  listEl.style.display = 'flex';

  listEl.innerHTML = reports.map(r => {
    const cls = r.status === 'approved' ? 'rc-approved' : r.status === 'pending_review' ? 'rc-review' : r.status === 'rejected' ? 'rc-rejected' : 'rc-not_submitted';
    const note = r.inspectorNote ? `<div class="rc-sub" style="margin-top:4px;color:var(--gray-500)">ملاحظة المفتش: ${e(r.inspectorNote)}</div>` : '';
    return `<div class="report-card ${cls}">
      <div class="rc-icon">📄</div>
      <div class="rc-body">
        <div class="rc-title">${e(r.title)}</div>
        <div class="rc-sub">${e(r.semester || '')}${r.subject ? ' — ' + e(r.subject) : ''}</div>
        ${r.summary ? `<div class="rc-sub" style="margin-top:4px">${e(r.summary)}</div>` : ''}
        ${r.fileName ? `<div class="rc-sub" style="margin-top:4px">ملف مرفق: ${e(r.fileName)}</div>` : ''}
        ${note}
      </div>
      <div class="rc-meta">
        <span class="rc-date">رُفع: ${formatDate(r.submittedAt)}</span>
        <span class="status ${statusClass(r.status)}">${statusLabel(r.status)}</span>
      </div>
    </div>`;
  }).join('');
}

function updateReportFileName(input) {
  const file = input?.files?.[0] || null;
  reportAttachment = file ? { name: file.name, size: file.size, type: file.type || '' } : null;
  setText('rpt-file-name', reportAttachment ? `${reportAttachment.name} — ${Math.max(1, Math.round(reportAttachment.size / 1024))} ك.ب` : 'لم يتم اختيار ملف');
}

function uploadReport() {
  const title    = v('rpt-title');
  const semester = v('rpt-semester');
  const subject  = v('rpt-subject');
  const summary  = v('rpt-summary');
  if (!title) { showToast('⚠ يُرجى إدخال عنوان التقرير'); return; }

  const teacher = APP.teachers.find(t => t.id === APP.currentUser.id);
  if (!teacher) return;

  const report = {
    id:           genId(),
    teacherId:    teacher.id,
    teacherName:  teacher.name,
    school:       teacher.school,
    grade:        teacher.grade,
    title,
    semester,
    subject,
    summary,
    fileName:     reportAttachment?.name || '',
    fileSize:     reportAttachment?.size || 0,
    status:       'pending_review',
    inspectorNote:'',
    submittedAt:  new Date().toISOString(),
  };
  APP.reports.push(report);
  saveAll();
  closeModal('modal-upload-report');
  clearFields(['rpt-title','rpt-subject','rpt-summary']);
  const fi = document.getElementById('rpt-file'); if (fi) fi.value = '';
  reportAttachment = null;
  setText('rpt-file-name', 'لم يتم اختيار ملف');
  renderTeacherReports(teacher);
  renderTeacherHome(teacher);
  showToast('✅ تم رفع التقرير بنجاح. في انتظار مراجعة المفتش.');
}

function exportData() {
  const payload = {
    exportedAt: new Date().toISOString(),
    inspector: APP.inspector,
    teachers: APP.teachers,
    tickets: APP.tickets,
    reports: APP.reports,
    visits: APP.visits,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `inspection_backup_${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast('✅ تم إنشاء نسخة احتياطية');
}

function triggerImport() {
  document.getElementById('import-file')?.click();
}

function importData(ev) {
  const file = ev?.target?.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data || !data.inspector || !Array.isArray(data.teachers)) throw new Error('bad');
      APP.inspector = data.inspector || null;
      APP.teachers = data.teachers || [];
      APP.tickets = data.tickets || [];
      APP.reports = data.reports || [];
      APP.visits = data.visits || [];
      saveAll();
      renderInspectorOverview();
      renderTeachers();
      renderTickets();
      renderInspectorReports();
      showToast('✅ تم استيراد البيانات بنجاح');
    } catch {
      showToast('❌ ملف النسخة الاحتياطية غير صالح');
    } finally {
      ev.target.value = '';
    }
  };
  reader.readAsText(file, 'utf-8');
}
