const SUPABASE_URL = 'https://lftlcepnsvvhoaopnqjf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmdGxjZXBuc3Z2aG9hb3BucWpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NjA4OTIsImV4cCI6MjA5MDEzNjg5Mn0.bUUXG0DHhUcpeeogMKqM2LOiBvHmlbwO8ukB1qqnyQE';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const STATE = {
  currentRole: 'inspector',
  selectedRequestType: 'visit',
  session: null,
  profile: null,
  requests: [],
  teachers: [],
  pendingTeachers: [],
  visits: [],
  reports: [],
  scores: [],
  deferredPrompt: null,
};

const REQUEST_TYPE_MAP = {
  visit: { label: 'زيارة صفية', badge: 'badge-visit' },
  accompaniment: { label: 'مرافقة بيداغوجية', badge: 'badge-accomp' },
  accomp: { label: 'مرافقة بيداغوجية', badge: 'badge-accomp' },
  administrative: { label: 'استفسار إداري', badge: 'badge-admin' },
  admin: { label: 'استفسار إداري', badge: 'badge-admin' },
  complaint: { label: 'شكوى', badge: 'badge-complaint' },
  report: { label: 'تقرير', badge: 'badge-report' },
};

const VISIT_TYPE_MAP = {
  classroom: 'زيارة صفية',
  guidance: 'زيارة توجيهية',
  followup: 'زيارة تتبع',
  evaluation: 'زيارة تقييم'
};

function qs(sel, root = document) { return root.querySelector(sel); }
function qsa(sel, root = document) { return [...root.querySelectorAll(sel)]; }
function escapeHtml(str = '') {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('ar-MA', { year: 'numeric', month: 'long', day: 'numeric' });
}
function statusClass(status) {
  return ({ pending: 'status-pending', in_progress: 'status-inprogress', closed: 'status-closed', rejected: 'status-closed', scheduled: 'status-pending', completed: 'status-inprogress', report_written: 'status-closed', follow_up_required: 'status-inprogress' })[status] || 'status-pending';
}
function statusLabel(status) {
  return ({ pending: 'معلق', in_progress: 'قيد المعالجة', closed: 'مغلق', rejected: 'مرفوض', scheduled: 'مجدولة', completed: 'منجزة', report_written: 'أنجز التقرير', follow_up_required: 'متابعة مطلوبة', approved: 'مقبول' })[status] || status;
}
function scoreBadge(score) {
  if (score >= 85) return ['ممتاز', 'score-excellent'];
  if (score >= 70) return ['جيد', 'score-good'];
  if (score >= 50) return ['يحتاج تتبع', 'score-watch'];
  return ['مستعجل', 'score-risk'];
}

function showToast(msg, isSticky = false) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  if (!isSticky) {
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => t.classList.remove('show'), 3200);
  }
}

function setRole(role, btn) {
  STATE.currentRole = role;
  qsa('.role-tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const email = qs('#login-email');
  if (email) email.value = role === 'inspector' ? 'inspector@taalim.ma' : 'teacher@taalim.ma';
}

function showScreen(name) {
  qsa('.screen').forEach(s => {
    s.classList.remove('active');
    s.style.display = 'none';
  });
  const target = qs(`#screen-${name}`);
  if (!target) return;
  target.classList.add('active');
  target.style.display = 'flex';
}

function inspectorTab(tabId, linkEl) {
  if (window.event) window.event.preventDefault();
  qsa('#screen-inspector .tab-panel').forEach(p => p.classList.remove('active'));
  qsa('#inspector-sidebar .nav-item').forEach(n => n.classList.remove('active'));
  qs(`#tab-${tabId}`)?.classList.add('active');
  linkEl?.classList.add('active');
}

function teacherTab(tabId, linkEl) {
  if (window.event) window.event.preventDefault();
  qsa('#screen-teacher .tab-panel').forEach(p => p.classList.remove('active'));
  qsa('#screen-teacher .nav-item').forEach(n => n.classList.remove('active'));
  qs(`#tab-${tabId}`)?.classList.add('active');
  linkEl?.classList.add('active');
}

function toggleRegister(show) {
  if (show) {
    qs('#screen-login').style.display = 'none';
    qs('#screen-login').classList.remove('active');
    qs('#screen-register').style.display = 'flex';
    qs('#screen-register').classList.add('active');
  } else {
    qs('#screen-register').style.display = 'none';
    qs('#screen-register').classList.remove('active');
    qs('#screen-login').style.display = 'flex';
    qs('#screen-login').classList.add('active');
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const full_name = qs('#reg-name').value.trim();
  const som = qs('#reg-som').value.trim();
  const email = qs('#reg-email').value.trim();
  const password = qs('#reg-password').value;
  if (!full_name || !som || !email || !password) {
    showToast('يرجى إكمال جميع الحقول.');
    return;
  }
  showToast('جاري إرسال طلب الانضمام...');
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name, som, role: 'teacher' } }
  });
  if (error) {
    showToast('❌ ' + error.message);
    return;
  }
  showToast('✅ تم إنشاء الحساب. بانتظار موافقة المفتش.');
  e.target.reset();
  setTimeout(() => toggleRegister(false), 1400);
}

async function handleLogin(e) {
  e.preventDefault();
  const email = qs('#login-email').value.trim();
  const password = qs('#login-password').value;
  if (!email || !password) return;
  showToast('جاري تسجيل الدخول...');
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    showToast('❌ ' + error.message);
    return;
  }
  STATE.session = data.session;
  await bootstrapUser();
}

async function logout() {
  await supabase.auth.signOut();
  STATE.session = null;
  STATE.profile = null;
  showScreen('login');
}

async function bootstrapUser() {
  const { data: sessionData } = await supabase.auth.getSession();
  STATE.session = sessionData.session;
  if (!STATE.session?.user) {
    showScreen('login');
    return;
  }
  const { data: profile, error } = await supabase.from('profiles').select('*').eq('id', STATE.session.user.id).single();
  if (error || !profile) {
    showToast('تعذر جلب الملف الشخصي. تأكد من تشغيل SQL أولاً.', true);
    console.error(error);
    return;
  }
  STATE.profile = profile;
  if (profile.role === 'teacher' && profile.status === 'pending') {
    await supabase.auth.signOut();
    showScreen('login');
    showToast('⏳ الحساب في انتظار موافقة المفتش.');
    return;
  }
  if (profile.role === 'teacher' && profile.status === 'rejected') {
    await supabase.auth.signOut();
    showScreen('login');
    showToast('❌ تم رفض طلب الانضمام.');
    return;
  }

  if (profile.role === 'inspector') {
    hydrateInspectorShell(profile);
    showScreen('inspector');
    await loadInspectorData();
  } else {
    hydrateTeacherShell(profile);
    showScreen('teacher');
    await loadTeacherData();
  }
}

function hydrateInspectorShell(profile) {
  qs('#inspector-sidebar .user-name').textContent = profile.full_name || 'مفتش';
  qs('#inspector-sidebar .user-role-tag').textContent = 'مفتش تربوي';
  qs('#inspector-sidebar .user-avatar').textContent = (profile.full_name || 'م').trim().charAt(0);
}

function hydrateTeacherShell(profile) {
  const fullName = profile.full_name || 'أستاذ';
  const initial = fullName.trim().charAt(0) || 'أ';
  qs('#teacher-sidebar-name').textContent = fullName;
  qs('#teacher-sidebar-avatar').textContent = initial;
  qs('#teacher-welcome-title').textContent = `مرحباً، ${fullName} 👋`;
  qs('#teacher-profile-avatar').textContent = initial;
  qs('#teacher-profile-name').textContent = fullName;
  qs('#teacher-profile-email').textContent = profile.email || STATE.session.user.email || '—';
  qs('#teacher-profile-som').textContent = profile.som || '—';

  const pdetail = qsa('.profile-details-grid .pdetail-val');
  if (pdetail[0]) pdetail[0].textContent = profile.school_name || 'غير محددة';
  if (pdetail[1]) pdetail[1].textContent = profile.directorate || 'غير محددة';
  if (pdetail[6]) pdetail[6].textContent = 'المفتش المكلف';
}

async function loadTeacherData() {
  await Promise.all([loadMyRequests(), loadMyVisits(), loadMyReports(), loadMyScores()]);
  renderTeacherOverview();
  renderTeacherReports();
}

async function loadInspectorData() {
  await Promise.all([loadPendingTeachers(), loadAllTeachers(), loadAllRequests(), loadAllVisits(), loadAllReports(), loadAllScores()]);
  renderInspectorOverview();
  renderInspectorTickets();
  renderTeachersGrid();
  renderInspectorReports();
}

async function loadPendingTeachers() {
  const { data, error } = await supabase.from('profiles').select('*').eq('role', 'teacher').eq('status', 'pending').order('created_at', { ascending: false });
  if (!error) STATE.pendingTeachers = data || [];
}
async function loadAllTeachers() {
  const { data, error } = await supabase.from('profiles').select('*').eq('role', 'teacher').in('status', ['approved', 'pending', 'rejected']).order('full_name');
  if (!error) STATE.teachers = data || [];
}
async function loadAllRequests() {
  const { data, error } = await supabase.from('teacher_requests').select('*, profiles!teacher_requests_teacher_id_fkey(full_name,school_name)').order('created_at', { ascending: false });
  if (!error) STATE.requests = data || [];
}
async function loadMyRequests() {
  const { data, error } = await supabase.from('teacher_requests').select('*').order('created_at', { ascending: false });
  if (!error) STATE.requests = data || [];
}
async function loadAllVisits() {
  const { data, error } = await supabase.from('inspection_visits').select('*, teacher:profiles!inspection_visits_teacher_id_fkey(full_name,school_name)').order('visit_date', { ascending: false });
  if (!error) STATE.visits = data || [];
}
async function loadMyVisits() {
  const { data, error } = await supabase.from('inspection_visits').select('*').order('visit_date', { ascending: false });
  if (!error) STATE.visits = data || [];
}
async function loadAllReports() {
  const { data, error } = await supabase.from('visit_reports').select('*, teacher:profiles!visit_reports_teacher_id_fkey(full_name,school_name)').order('created_at', { ascending: false });
  if (!error) STATE.reports = data || [];
}
async function loadMyReports() {
  const { data, error } = await supabase.from('visit_reports').select('*').order('created_at', { ascending: false });
  if (!error) STATE.reports = data || [];
}
async function loadAllScores() {
  const { data, error } = await supabase.from('performance_scores').select('*').order('created_at', { ascending: false });
  if (!error) STATE.scores = data || [];
}
async function loadMyScores() {
  const { data, error } = await supabase.from('performance_scores').select('*').order('created_at', { ascending: false });
  if (!error) STATE.scores = data || [];
}

function renderInspectorOverview() {
  const approvedTeachers = STATE.teachers.filter(t => t.status === 'approved').length;
  const reportsCount = STATE.reports.length;
  const pendingReqs = STATE.requests.filter(r => r.status === 'pending').length + STATE.pendingTeachers.length;
  const scheduledVisits = STATE.visits.filter(v => v.status === 'scheduled').length;
  qsa('#tab-overview .stat-num').forEach((el, idx) => {
    const values = [approvedTeachers, reportsCount, pendingReqs, scheduledVisits];
    el.dataset.target = values[idx] || 0;
    el.textContent = values[idx] || 0;
  });

  // inject approvals block into overview if missing
  let approvals = qs('#inspector-approvals-overview');
  if (!approvals) {
    approvals = document.createElement('div');
    approvals.id = 'inspector-approvals-overview';
    approvals.className = 'section-card';
    approvals.style.marginBottom = '24px';
    qs('#tab-overview .activity-card')?.before(approvals);
  }
  approvals.innerHTML = `
    <div class="card-header">
      <h3 class="card-title">طلبات الانضمام الجديدة</h3>
      <button class="btn-text" onclick="inspectorTab('tickets', document.querySelector('#inspector-sidebar .nav-item:nth-child(2)'))">الانتقال إلى الطلبات ←</button>
    </div>
    ${STATE.pendingTeachers.length ? `<div class="approvals-grid">${STATE.pendingTeachers.slice(0,4).map(renderApprovalCard).join('')}</div>` : `<div class="empty-state">لا توجد طلبات انضمام معلقة حالياً.</div>`}
  `;

  // update recent activity to reflect real data
  const activity = qs('#tab-overview .activity-list');
  if (activity) {
    const merged = [
      ...STATE.pendingTeachers.slice(0, 2).map(t => ({ icon: t.full_name?.[0] || 'ج', name: t.full_name, school: t.school_name || '—', desc: 'طلب انضمام جديد إلى المنصة', badge: 'طلب انضمام', cls: 'badge-admin', time: formatDate(t.created_at) })),
      ...STATE.requests.slice(0, 3).map(r => ({ icon: (r.profiles?.full_name || r.teacher?.full_name || 'ط')[0], name: r.profiles?.full_name || r.teacher?.full_name || 'أستاذ', school: r.profiles?.school_name || r.teacher?.school_name || '—', desc: r.subject, badge: REQUEST_TYPE_MAP[r.request_type]?.label || r.request_type, cls: REQUEST_TYPE_MAP[r.request_type]?.badge || 'badge-report', time: formatDate(r.created_at) }))
    ].slice(0,5);
    activity.innerHTML = merged.length ? merged.map(item => `
      <div class="activity-row">
        <div class="activity-avatar">${escapeHtml(item.icon)}</div>
        <div class="activity-body">
          <div class="activity-name">${escapeHtml(item.name)} <span class="activity-school">— ${escapeHtml(item.school)}</span></div>
          <div class="activity-desc">${escapeHtml(item.desc)}</div>
        </div>
        <div class="activity-meta">
          <span class="ticket-badge ${item.cls}">${escapeHtml(item.badge)}</span>
          <span class="activity-time">${escapeHtml(item.time)}</span>
        </div>
      </div>`).join('') : `<div class="empty-state">لا توجد نشاطات حديثة.</div>`;
  }
}

function renderApprovalCard(t) {
  return `
  <div class="section-card">
    <div class="section-title">${escapeHtml(t.full_name || 'بدون اسم')}</div>
    <div class="kv-list">
      <div class="kv-row"><div class="kv-key">البريد</div><div class="kv-val">${escapeHtml(t.email || '—')}</div></div>
      <div class="kv-row"><div class="kv-key">رقم التأجير</div><div class="kv-val">${escapeHtml(t.som || '—')}</div></div>
      <div class="kv-row"><div class="kv-key">تاريخ الطلب</div><div class="kv-val">${escapeHtml(formatDate(t.created_at))}</div></div>
    </div>
    <div class="inline-actions">
      <button class="btn-success" onclick="approveTeacher('${t.id}')">قبول</button>
      <button class="btn-danger" onclick="rejectTeacher('${t.id}')">رفض</button>
    </div>
  </div>`;
}

function renderInspectorTickets() {
  const body = qs('#tickets-body');
  if (!body) return;
  const rows = [];
  rows.push(...STATE.pendingTeachers.map(t => `
    <tr data-status="pending">
      <td><div class="table-user"><div class="table-avatar">${escapeHtml((t.full_name || 'ج').charAt(0))}</div><span>${escapeHtml(t.full_name || 'طلب انضمام')}</span></div></td>
      <td><span class="ticket-badge badge-admin">طلب انضمام</span></td>
      <td>${escapeHtml(t.school_name || 'غير محددة')}</td>
      <td>${escapeHtml(formatDate(t.created_at))}</td>
      <td><span class="status-badge status-pending">معلق</span></td>
      <td><button class="btn-action" onclick="openApprovalModal('${t.id}')">معالجة</button></td>
    </tr>`));
  rows.push(...STATE.requests.map(r => `
    <tr data-status="${escapeHtml(r.status)}">
      <td><div class="table-user"><div class="table-avatar">${escapeHtml((r.profiles?.full_name || r.teacher?.full_name || 'أ')[0])}</div><span>${escapeHtml(r.profiles?.full_name || r.teacher?.full_name || 'أستاذ')}</span></div></td>
      <td><span class="ticket-badge ${REQUEST_TYPE_MAP[r.request_type]?.badge || 'badge-report'}">${escapeHtml(REQUEST_TYPE_MAP[r.request_type]?.label || r.request_type)}</span></td>
      <td>${escapeHtml(r.profiles?.school_name || r.teacher?.school_name || '—')}</td>
      <td>${escapeHtml(formatDate(r.created_at))}</td>
      <td><span class="status-badge ${statusClass(r.status)}">${escapeHtml(statusLabel(r.status))}</span></td>
      <td><button class="btn-action" onclick="openRequestModal('${r.id}')">معالجة</button></td>
    </tr>`));
  body.innerHTML = rows.length ? rows.join('') : `<tr><td colspan="6"><div class="empty-state">لا توجد طلبات.</div></td></tr>`;

  const btns = qsa('.filter-btn');
  if (btns[0]) btns[0].textContent = `الكل (${rows.length})`;
  if (btns[1]) btns[1].textContent = `معلق (${STATE.pendingTeachers.length + STATE.requests.filter(r => r.status === 'pending').length})`;
  if (btns[2]) btns[2].textContent = `قيد المعالجة (${STATE.requests.filter(r => r.status === 'in_progress').length})`;
  if (btns[3]) btns[3].textContent = `مغلق (${STATE.requests.filter(r => ['closed','rejected'].includes(r.status)).length})`;
}

function renderInspectorReports() {
  const summaryNums = qsa('#tab-reports .rsummary-num');
  if (summaryNums[0]) summaryNums[0].textContent = STATE.reports.length;
  if (summaryNums[1]) summaryNums[1].textContent = STATE.reports.filter(r => !r.official_number).length;
  if (summaryNums[2]) summaryNums[2].textContent = Math.max(STATE.teachers.filter(t => t.status === 'approved').length - STATE.reports.length, 0);
  const grid = qs('#tab-reports .reports-grid');
  if (!grid) return;
  grid.innerHTML = STATE.reports.length ? STATE.reports.map(r => `
    <div class="report-row-card submitted">
      <div class="rcard-avatar">${escapeHtml((r.teacher?.full_name || 'أ')[0])}</div>
      <div class="rcard-body">
        <div class="rcard-name">${escapeHtml(r.teacher?.full_name || 'أستاذ')}</div>
        <div class="rcard-school">${escapeHtml(r.teacher?.school_name || '—')}</div>
      </div>
      <div class="rcard-meta">
        <span class="rcard-date">رُفع: ${escapeHtml(formatDate(r.created_at))}</span>
        <span class="rcard-status green">${escapeHtml(r.official_number || 'تقرير رسمي')}</span>
      </div>
      <button class="rcard-btn" onclick="printVisitReport('${r.id}')">PDF رسمي</button>
    </div>`).join('') : `<div class="empty-state">لا توجد تقارير بعد.</div>`;
}

function renderTeachersGrid(filter = '') {
  const grid = qs('#teachers-grid');
  if (!grid) return;
  const f = filter.trim();
  const teachers = STATE.teachers.filter(t => (t.full_name || '').includes(f) || (t.school_name || '').includes(f) || (t.som || '').includes(f));
  grid.innerHTML = teachers.length ? teachers.map(t => {
    const relatedScore = STATE.scores.find(s => s.teacher_id === t.id);
    const latestVisit = STATE.visits.find(v => v.teacher_id === t.id);
    const score = relatedScore?.overall_score ?? 0;
    const [scoreText, scoreCls] = scoreBadge(Number(score));
    return `
      <div class="teacher-card">
        <div class="tc-top">
          <div class="tc-avatar" style="background:${t.status === 'approved' ? '#166534' : (t.status === 'pending' ? '#D97706' : '#DC2626')}">${escapeHtml((t.full_name || 'أ').charAt(0))}</div>
          <div>
            <div class="tc-name">${escapeHtml(t.full_name || '—')}</div>
            <div class="tc-school">${escapeHtml(t.school_name || 'غير محددة')}</div>
          </div>
        </div>
        <div class="tc-grade">${escapeHtml(statusLabel(t.status))} — SOM: ${escapeHtml(t.som || '—')}</div>
        <div class="tc-report-status"><span>المؤشر</span><span class="score-badge ${scoreCls}">${Number(score).toFixed(0)}/100 • ${scoreText}</span></div>
        <div class="small muted">آخر زيارة: ${escapeHtml(latestVisit ? formatDate(latestVisit.visit_date) : 'لا توجد')}</div>
        <div class="inline-actions">
          ${t.status === 'pending' ? `<button class="btn-success" onclick="approveTeacher('${t.id}')">قبول</button><button class="btn-danger" onclick="rejectTeacher('${t.id}')">رفض</button>` : ''}
          ${t.status === 'approved' ? `<button class="btn-action" onclick="openVisitModal('${t.id}')">جدولة زيارة</button><button class="btn-action btn-view" onclick="openScoreModal('${t.id}')">تحديث المؤشر</button>` : ''}
        </div>
      </div>`;
  }).join('') : `<div class="empty-state">لا يوجد أساتذة مطابقون.</div>`;

  let visitsSection = qs('#teachers-visits-section');
  if (!visitsSection) {
    visitsSection = document.createElement('div');
    visitsSection.id = 'teachers-visits-section';
    visitsSection.className = 'section-card';
    visitsSection.style.marginTop = '20px';
    grid.parentElement.appendChild(visitsSection);
  }
  visitsSection.innerHTML = `
    <div class="card-header"><h3 class="card-title">الزيارات المجدولة والمنجزة</h3></div>
    ${STATE.visits.length ? `<div class="visits-grid">${STATE.visits.slice(0,8).map(v => renderVisitCard(v, true)).join('')}</div>` : `<div class="empty-state">لا توجد زيارات بعد.</div>`}
  `;
}

function renderVisitCard(v, inspectorMode = false) {
  return `
  <div class="section-card">
    <div class="section-title">${escapeHtml(VISIT_TYPE_MAP[v.visit_type] || v.visit_type)}</div>
    <div class="kv-list">
      <div class="kv-row"><div class="kv-key">الأستاذ</div><div class="kv-val">${escapeHtml(v.teacher?.full_name || '—')}</div></div>
      <div class="kv-row"><div class="kv-key">التاريخ</div><div class="kv-val">${escapeHtml(formatDate(v.visit_date))}</div></div>
      <div class="kv-row"><div class="kv-key">المادة</div><div class="kv-val">${escapeHtml(v.subject || '—')}</div></div>
      <div class="kv-row"><div class="kv-key">الحالة</div><div class="kv-val"><span class="status-badge ${statusClass(v.status)}">${escapeHtml(statusLabel(v.status))}</span></div></div>
    </div>
    ${inspectorMode ? `<div class="inline-actions"><button class="btn-action" onclick="openReportModal('${v.id}')">تحرير تقرير</button></div>` : ''}
  </div>`;
}

function renderTeacherOverview() {
  const cards = qsa('#tab-t-overview .tsummary-num');
  const submittedReports = STATE.reports.length;
  const openRequests = STATE.requests.filter(r => ['pending','in_progress'].includes(r.status)).length;
  const upcomingVisits = STATE.visits.filter(v => ['scheduled','follow_up_required'].includes(v.status)).length;
  const latestScore = STATE.scores[0]?.overall_score ?? 0;
  const vals = [submittedReports, openRequests, upcomingVisits, `${Number(latestScore).toFixed(0)}%`];
  cards.forEach((c, i) => { if (vals[i] !== undefined) c.textContent = vals[i]; });

  const reqList = qs('#tab-t-overview .my-requests-list');
  reqList.innerHTML = STATE.requests.length ? STATE.requests.slice(0,5).map(r => `
    <div class="mreq-item">
      <div class="mreq-type"><span class="ticket-badge ${REQUEST_TYPE_MAP[r.request_type]?.badge || 'badge-report'}">${escapeHtml(REQUEST_TYPE_MAP[r.request_type]?.label || r.request_type)}</span></div>
      <div class="mreq-desc">${escapeHtml(r.subject)}</div>
      <div class="mreq-date">${escapeHtml(formatDate(r.created_at))}</div>
      <div><span class="status-badge ${statusClass(r.status)}">${escapeHtml(statusLabel(r.status))}</span></div>
    </div>`).join('') : `<div class="empty-state">لا توجد طلبات مرسلة بعد.</div>`;

  let scoreSection = qs('#teacher-score-section');
  if (!scoreSection) {
    scoreSection = document.createElement('div');
    scoreSection.id = 'teacher-score-section';
    scoreSection.className = 'section-card';
    scoreSection.style.marginTop = '20px';
    qs('#tab-t-overview .my-requests-section').after(scoreSection);
  }
  const score = Number(latestScore || 0);
  const [label, cls] = scoreBadge(score);
  const latest = STATE.scores[0];
  scoreSection.innerHTML = `
    <div class="card-header"><h3 class="card-title">مؤشر الأداء المهني</h3></div>
    ${latest ? `
      <div class="score-grid">
        <div class="section-card"><div class="score-big">${score.toFixed(0)}/100</div><div class="score-badge ${cls}">${label}</div></div>
        <div class="section-card"><div class="kv-list">
          <div class="kv-row"><div class="kv-key">الالتزام بالتقارير</div><div class="kv-val">${latest.reports_commitment}/100</div></div>
          <div class="kv-row"><div class="kv-key">التفاعل</div><div class="kv-val">${latest.responsiveness}/100</div></div>
          <div class="kv-row"><div class="kv-key">التقدم بعد الزيارات</div><div class="kv-val">${latest.inspection_progress}/100</div></div>
          <div class="kv-row"><div class="kv-key">استكمال الإداري</div><div class="kv-val">${latest.admin_completion}/100</div></div>
        </div></div>
      </div>` : `<div class="empty-state">لم يُحدَّث المؤشر بعد من طرف المفتش.</div>`}
  `;

  let visitsSection = qs('#teacher-visits-section');
  if (!visitsSection) {
    visitsSection = document.createElement('div');
    visitsSection.id = 'teacher-visits-section';
    visitsSection.className = 'section-card';
    visitsSection.style.marginTop = '20px';
    scoreSection.after(visitsSection);
  }
  visitsSection.innerHTML = `
    <div class="card-header"><h3 class="card-title">زياراتي</h3></div>
    ${STATE.visits.length ? `<div class="visits-grid">${STATE.visits.slice(0,6).map(v => renderVisitCard(v, false)).join('')}</div>` : `<div class="empty-state">لا توجد زيارات مسجلة حتى الآن.</div>`}
  `;
}

function renderTeacherReports() {
  const list = qs('#tab-t-reports .teacher-reports-list');
  if (!list) return;
  list.innerHTML = STATE.reports.length ? STATE.reports.map(r => {
    const avg = [r.planning_score, r.class_management_score, r.didactics_score, r.assessment_score].filter(v => typeof v === 'number');
    const mean = avg.length ? (avg.reduce((a,b)=>a+b,0) / avg.length) : 0;
    return `
      <div class="treport-card approved">
        <div class="treport-icon">📄</div>
        <div class="treport-body">
          <div class="treport-title">${escapeHtml(r.official_number || 'تقرير زيارة')}</div>
          <div class="treport-sub">معدل المحاور: ${mean.toFixed(0)}/100</div>
          <div class="treport-meta">أُنشئ بتاريخ: ${escapeHtml(formatDate(r.created_at))}</div>
        </div>
        <div class="treport-status">
          <span class="rcard-status green">جاهز للطباعة</span>
          <button class="rcard-btn" onclick="printVisitReport('${r.id}')">PDF رسمي</button>
        </div>
      </div>`;
  }).join('') : `<div class="empty-state">لا توجد تقارير زيارة بعد.</div>`;
}

function filterTeachers(val) { renderTeachersGrid(val); }
function filterTickets(status, btn) {
  qsa('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  qsa('#tickets-body tr[data-status]').forEach(row => {
    row.style.display = status === 'all' || row.dataset.status === status ? '' : 'none';
  });
}

function selectRequestType(card, type) {
  qsa('.rtype-card').forEach(c => c.classList.remove('active'));
  card.classList.add('active');
  STATE.selectedRequestType = type;
}

async function submitRequest() {
  const subject = qs('#req-title').value.trim();
  const preferred_date = qs('#req-date').value;
  const message = qs('#req-desc').value.trim();
  if (!subject || !preferred_date || !message) {
    showToast('يرجى ملء جميع الحقول الإلزامية.');
    return;
  }
  const request_type = ({ visit:'visit', accomp:'accompaniment', admin:'administrative', complaint:'complaint' })[STATE.selectedRequestType] || 'visit';
  const { error } = await supabase.from('teacher_requests').insert([{
    teacher_id: STATE.profile.id,
    request_type,
    subject,
    message,
    preferred_date,
    status: 'pending'
  }]);
  if (error) {
    showToast('❌ ' + error.message);
    return;
  }
  showToast('✅ تم إرسال الطلب بنجاح.');
  resetForm();
  await loadMyRequests();
  renderTeacherOverview();
  teacherTab('t-overview', qs('#screen-teacher .nav-item:first-child'));
}

function resetForm() {
  ['req-title', 'req-date', 'req-subject', 'req-unit', 'req-desc', 'req-notes'].forEach(id => { const el = qs(`#${id}`); if (el) el.value = ''; });
  const firstCard = qs('.rtype-card');
  if (firstCard) selectRequestType(firstCard, 'visit');
}

function openAppModal({ title, body, footer = '' }) {
  qs('#app-modal-title').innerHTML = title;
  qs('#app-modal-body').innerHTML = body;
  qs('#app-modal-footer').innerHTML = footer;
  qs('#app-modal').classList.add('open');
}
function closeAppModal() { qs('#app-modal').classList.remove('open'); }

function openApprovalModal(teacherId) {
  const t = STATE.pendingTeachers.find(x => x.id === teacherId);
  if (!t) return;
  openAppModal({
    title: 'معالجة طلب الانضمام',
    body: `
      <div class="kv-list">
        <div class="kv-row"><div class="kv-key">الاسم</div><div class="kv-val">${escapeHtml(t.full_name || '—')}</div></div>
        <div class="kv-row"><div class="kv-key">البريد</div><div class="kv-val">${escapeHtml(t.email || '—')}</div></div>
        <div class="kv-row"><div class="kv-key">SOM</div><div class="kv-val">${escapeHtml(t.som || '—')}</div></div>
        <div class="kv-row"><div class="kv-key">التاريخ</div><div class="kv-val">${escapeHtml(formatDate(t.created_at))}</div></div>
      </div>`,
    footer: `<button class="btn-danger" onclick="rejectTeacher('${t.id}')">رفض</button><button class="btn-success" onclick="approveTeacher('${t.id}')">قبول</button>`
  });
}

function openRequestModal(requestId) {
  const r = STATE.requests.find(x => x.id === requestId);
  if (!r) return;
  openAppModal({
    title: 'معالجة الطلب',
    body: `
      <div class="kv-list">
        <div class="kv-row"><div class="kv-key">الأستاذ</div><div class="kv-val">${escapeHtml(r.profiles?.full_name || r.teacher?.full_name || '—')}</div></div>
        <div class="kv-row"><div class="kv-key">النوع</div><div class="kv-val">${escapeHtml(REQUEST_TYPE_MAP[r.request_type]?.label || r.request_type)}</div></div>
        <div class="kv-row"><div class="kv-key">الموضوع</div><div class="kv-val">${escapeHtml(r.subject)}</div></div>
        <div class="kv-row"><div class="kv-key">الوصف</div><div class="kv-val">${escapeHtml(r.message)}</div></div>
        <div class="kv-row"><div class="kv-key">التاريخ المفضل</div><div class="kv-val">${escapeHtml(formatDate(r.preferred_date))}</div></div>
      </div>
      <label class="form-label" style="margin-top:16px;">رد المفتش</label>
      <textarea id="modal-reply" class="form-textarea" rows="4" placeholder="أدخل الرد أو الملاحظات">${escapeHtml(r.inspector_reply || '')}</textarea>
    `,
    footer: `
      <button class="btn-outline" onclick="updateRequestStatus('${r.id}','closed')">إغلاق</button>
      <button class="btn-success" onclick="updateRequestStatus('${r.id}','in_progress')">قيد المعالجة</button>
    `
  });
}

async function updateRequestStatus(requestId, status) {
  const inspector_reply = qs('#modal-reply')?.value.trim() || null;
  const { error } = await supabase.from('teacher_requests').update({ status, inspector_reply }).eq('id', requestId);
  if (error) {
    showToast('❌ ' + error.message);
    return;
  }
  closeAppModal();
  await loadAllRequests();
  renderInspectorTickets();
  showToast('✅ تم تحديث حالة الطلب.');
}

async function approveTeacher(teacherId) {
  const { error } = await supabase.from('profiles').update({ status: 'approved' }).eq('id', teacherId);
  if (error) { showToast('❌ ' + error.message); return; }
  closeAppModal();
  await Promise.all([loadPendingTeachers(), loadAllTeachers()]);
  renderInspectorOverview();
  renderInspectorTickets();
  renderTeachersGrid();
  showToast('✅ تم قبول الأستاذ.');
}
async function rejectTeacher(teacherId) {
  const { error } = await supabase.from('profiles').update({ status: 'rejected' }).eq('id', teacherId);
  if (error) { showToast('❌ ' + error.message); return; }
  closeAppModal();
  await Promise.all([loadPendingTeachers(), loadAllTeachers()]);
  renderInspectorOverview();
  renderInspectorTickets();
  renderTeachersGrid();
  showToast('✅ تم رفض الطلب.');
}

function openVisitModal(teacherId) {
  const t = STATE.teachers.find(x => x.id === teacherId);
  if (!t) return;
  openAppModal({
    title: 'جدولة زيارة تفتيش',
    body: `
      <div class="pending-banner">${escapeHtml(t.full_name)} — ${escapeHtml(t.school_name || 'غير محددة')}</div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">نوع الزيارة</label><select id="visit-type" class="form-input"><option value="classroom">زيارة صفية</option><option value="guidance">زيارة توجيهية</option><option value="followup">زيارة تتبع</option><option value="evaluation">زيارة تقييم</option></select></div>
        <div class="form-group"><label class="form-label">التاريخ</label><input id="visit-date" class="form-input" type="date"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">المادة</label><input id="visit-subject" class="form-input" type="text" placeholder="اللغة العربية"></div>
        <div class="form-group"><label class="form-label">المستوى</label><input id="visit-level" class="form-input" type="text" placeholder="السادس ابتدائي"></div>
      </div>
      <div class="form-group full"><label class="form-label">عنوان الحصة</label><input id="visit-lesson" class="form-input" type="text" placeholder="مثال: القراءة الوظيفية"></div>
      <div class="form-group full"><label class="form-label">ملاحظات</label><textarea id="visit-notes" class="form-textarea" rows="4"></textarea></div>
    `,
    footer: `<button class="btn-success" onclick="createVisit('${t.id}')">حفظ الزيارة</button>`
  });
}

async function createVisit(teacherId) {
  const payload = {
    teacher_id: teacherId,
    inspector_id: STATE.profile.id,
    visit_type: qs('#visit-type').value,
    visit_date: qs('#visit-date').value,
    subject: qs('#visit-subject').value.trim() || null,
    level: qs('#visit-level').value.trim() || null,
    lesson_title: qs('#visit-lesson').value.trim() || null,
    notes: qs('#visit-notes').value.trim() || null,
    status: 'scheduled'
  };
  if (!payload.visit_date) { showToast('حدد تاريخ الزيارة.'); return; }
  const { error } = await supabase.from('inspection_visits').insert([payload]);
  if (error) { showToast('❌ ' + error.message); return; }
  closeAppModal();
  await loadAllVisits();
  renderInspectorOverview();
  renderTeachersGrid();
  showToast('✅ تمت جدولة الزيارة.');
}

function openReportModal(visitId) {
  const visit = STATE.visits.find(v => v.id === visitId);
  if (!visit) return;
  openAppModal({
    title: 'تحرير تقرير رسمي للزيارة',
    body: `
      <div class="pending-banner">${escapeHtml(VISIT_TYPE_MAP[visit.visit_type] || visit.visit_type)} — ${escapeHtml(formatDate(visit.visit_date))}</div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">الرقم الرسمي</label><input id="rep-number" class="form-input" type="text" placeholder="مثال: 2026/17"></div>
        <div class="form-group"><label class="form-label">التخطيط</label><input id="rep-plan" class="form-input" type="number" min="0" max="100" value="80"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">التدبير الصفي</label><input id="rep-class" class="form-input" type="number" min="0" max="100" value="80"></div>
        <div class="form-group"><label class="form-label">الديداكتيك</label><input id="rep-did" class="form-input" type="number" min="0" max="100" value="80"></div>
      </div>
      <div class="form-group full"><label class="form-label">التقويم</label><input id="rep-assess" class="form-input" type="number" min="0" max="100" value="80"></div>
      <div class="form-group full"><label class="form-label">نقط القوة</label><textarea id="rep-strengths" class="form-textarea" rows="3"></textarea></div>
      <div class="form-group full"><label class="form-label">ملاحظات</label><textarea id="rep-observations" class="form-textarea" rows="3"></textarea></div>
      <div class="form-group full"><label class="form-label">التوصيات</label><textarea id="rep-recommendations" class="form-textarea" rows="3"></textarea></div>
      <div class="form-group full"><label class="form-label">إجراءات التتبع</label><textarea id="rep-follow" class="form-textarea" rows="3"></textarea></div>
    `,
    footer: `<button class="btn-success" onclick="createVisitReport('${visit.id}')">حفظ التقرير</button>`
  });
}

async function createVisitReport(visitId) {
  const visit = STATE.visits.find(v => v.id === visitId);
  if (!visit) return;
  const payload = {
    visit_id: visit.id,
    teacher_id: visit.teacher_id,
    inspector_id: STATE.profile.id,
    official_number: qs('#rep-number').value.trim() || `REP/${new Date().getFullYear()}/${Math.floor(Math.random()*900+100)}`,
    planning_score: Number(qs('#rep-plan').value || 0),
    class_management_score: Number(qs('#rep-class').value || 0),
    didactics_score: Number(qs('#rep-did').value || 0),
    assessment_score: Number(qs('#rep-assess').value || 0),
    strengths: qs('#rep-strengths').value.trim() || null,
    observations: qs('#rep-observations').value.trim() || null,
    recommendations: qs('#rep-recommendations').value.trim() || null,
    followup_actions: qs('#rep-follow').value.trim() || null,
  };
  const { error } = await supabase.from('visit_reports').insert([payload]);
  if (error) { showToast('❌ ' + error.message); return; }
  await supabase.from('inspection_visits').update({ status: 'report_written' }).eq('id', visit.id);
  closeAppModal();
  await Promise.all([loadAllVisits(), loadAllReports()]);
  renderTeachersGrid();
  renderInspectorReports();
  renderInspectorOverview();
  showToast('✅ تم حفظ التقرير الرسمي.');
}

function openScoreModal(teacherId) {
  const teacher = STATE.teachers.find(t => t.id === teacherId);
  if (!teacher) return;
  openAppModal({
    title: 'تحديث مؤشر الأداء',
    body: `
      <div class="pending-banner">${escapeHtml(teacher.full_name || 'أستاذ')}</div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">الفترة</label><input id="score-period" class="form-input" type="text" value="${new Date().getFullYear()}-${new Date().getMonth()+1}"></div>
        <div class="form-group"><label class="form-label">الالتزام بالتقارير</label><input id="score-reports" class="form-input" type="number" min="0" max="100" value="80"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">التفاعل</label><input id="score-resp" class="form-input" type="number" min="0" max="100" value="80"></div>
        <div class="form-group"><label class="form-label">التقدم بعد الزيارات</label><input id="score-progress" class="form-input" type="number" min="0" max="100" value="80"></div>
      </div>
      <div class="form-group full"><label class="form-label">الاستكمال الإداري</label><input id="score-admin" class="form-input" type="number" min="0" max="100" value="80"></div>
    `,
    footer: `<button class="btn-success" onclick="savePerformanceScore('${teacher.id}')">حفظ المؤشر</button>`
  });
}

async function savePerformanceScore(teacherId) {
  const payload = {
    teacher_id: teacherId,
    period_label: qs('#score-period').value.trim() || 'فترة غير محددة',
    reports_commitment: Number(qs('#score-reports').value || 0),
    responsiveness: Number(qs('#score-resp').value || 0),
    inspection_progress: Number(qs('#score-progress').value || 0),
    admin_completion: Number(qs('#score-admin').value || 0),
  };
  const { error } = await supabase.from('performance_scores').insert([payload]);
  if (error) { showToast('❌ ' + error.message); return; }
  closeAppModal();
  await loadAllScores();
  renderTeachersGrid();
  showToast('✅ تم تحديث المؤشر.');
}

async function printVisitReport(reportId) {
  const report = STATE.reports.find(r => r.id === reportId) || (await supabase.from('visit_reports').select('*').eq('id', reportId).single()).data;
  if (!report) return;
  const visit = STATE.visits.find(v => v.id === report.visit_id) || (await supabase.from('inspection_visits').select('*').eq('id', report.visit_id).single()).data;
  const teacher = STATE.teachers.find(t => t.id === report.teacher_id) || STATE.profile;
  const w = window.open('', '_blank', 'width=1100,height=900');
  const avg = [report.planning_score, report.class_management_score, report.didactics_score, report.assessment_score].filter(v => typeof v === 'number');
  const mean = avg.length ? (avg.reduce((a,b)=>a+b,0)/avg.length).toFixed(0) : '—';
  w.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>تقرير رسمي</title><style>body{font-family:Tajawal,Arial,sans-serif;direction:rtl;margin:0;padding:0;color:#111827} .wrap{padding:28px} .head{text-align:center;border-bottom:2px solid #111827;padding-bottom:12px;margin-bottom:18px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 18px}.block{margin-bottom:16px}.table{width:100%;border-collapse:collapse}.table th,.table td{border:1px solid #d1d5db;padding:8px}.footer{display:flex;justify-content:space-between;margin-top:42px}.muted{color:#6b7280}@media print{@page{size:A4;margin:12mm}}</style></head><body><div class="wrap"><div class="head"><div>المملكة المغربية</div><div>وزارة التربية الوطنية والتعليم الأولي والرياضة</div><h2>تقرير زيارة تربوية رسمي</h2><div class="muted">رقم التقرير: ${escapeHtml(report.official_number || '—')}</div></div><div class="grid"><div><strong>الأستاذ:</strong> ${escapeHtml(teacher?.full_name || '—')}</div><div><strong>رقم التأجير:</strong> ${escapeHtml(teacher?.som || '—')}</div><div><strong>المؤسسة:</strong> ${escapeHtml(teacher?.school_name || '—')}</div><div><strong>المديرية:</strong> ${escapeHtml(teacher?.directorate || '—')}</div><div><strong>نوع الزيارة:</strong> ${escapeHtml(VISIT_TYPE_MAP[visit?.visit_type] || visit?.visit_type || '—')}</div><div><strong>تاريخ الزيارة:</strong> ${escapeHtml(formatDate(visit?.visit_date))}</div><div><strong>المادة:</strong> ${escapeHtml(visit?.subject || '—')}</div><div><strong>المستوى:</strong> ${escapeHtml(visit?.level || '—')}</div><div><strong>عنوان الحصة:</strong> ${escapeHtml(visit?.lesson_title || '—')}</div><div><strong>المعدل العام:</strong> ${escapeHtml(mean)}/100</div></div><div class="block"><h4>شبكة التقويم</h4><table class="table"><tr><th>المحور</th><th>النقطة /100</th></tr><tr><td>التخطيط</td><td>${report.planning_score ?? '—'}</td></tr><tr><td>التدبير الصفي</td><td>${report.class_management_score ?? '—'}</td></tr><tr><td>الديداكتيك</td><td>${report.didactics_score ?? '—'}</td></tr><tr><td>التقويم</td><td>${report.assessment_score ?? '—'}</td></tr></table></div><div class="block"><h4>نقط القوة</h4><div>${escapeHtml(report.strengths || '—')}</div></div><div class="block"><h4>الملاحظات</h4><div>${escapeHtml(report.observations || '—')}</div></div><div class="block"><h4>التوصيات</h4><div>${escapeHtml(report.recommendations || '—')}</div></div><div class="block"><h4>إجراءات التتبع</h4><div>${escapeHtml(report.followup_actions || '—')}</div></div><div class="footer"><div>توقيع المفتش: __________________</div><div>اطلاع الأستاذ: __________________</div></div></div><script>window.onload=()=>window.print()</script></body></html>`);
  w.document.close();
}

function openUploadModal() {
  openAppModal({
    title: 'رفع تقرير إضافي',
    body: `<div class="pending-banner">الرفع هنا شكلي فقط في هذه النسخة. التقارير الرسمية تُنشأ من الزيارات عبر المفتش.</div>`,
    footer: `<button class="btn-outline" onclick="closeAppModal()">إغلاق</button>`
  });
}

function openModal(id) { qs(`#${id}`)?.classList.add('open'); }
function closeModal(id) { qs(`#${id}`)?.classList.remove('open'); }
function uploadReport() { closeModal('upload-modal'); }
function approveReport() {}
function sendReminder() { showToast('تم إرسال التذكير.'); }
function openTicketModal() {}
function acceptTicket() {}
function rejectTicket() {}

function updateDateBadges() {
  const d = new Date().toLocaleDateString('ar-MA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  if (qs('#current-date-1')) qs('#current-date-1').textContent = `📅 ${d}`;
  if (qs('#current-date-2')) qs('#current-date-2').textContent = `📅 ${d}`;
}

function initPWA() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(console.error));
  }
  const footer = qs('#screen-teacher .sidebar-footer');
  if (footer && !qs('#install-app-btn')) {
    const btn = document.createElement('button');
    btn.id = 'install-app-btn';
    btn.className = 'logout-btn install-btn';
    btn.title = 'تثبيت التطبيق';
    btn.innerHTML = '⬇';
    btn.onclick = async () => {
      if (!STATE.deferredPrompt) return;
      STATE.deferredPrompt.prompt();
      await STATE.deferredPrompt.userChoice;
      STATE.deferredPrompt = null;
      btn.style.display = 'none';
    };
    footer.appendChild(btn);
  }
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    STATE.deferredPrompt = e;
    const btn = qs('#install-app-btn');
    if (btn) btn.style.display = 'flex';
  });
}

function updateConnectivityUI() {
  const offline = !navigator.onLine;
  const indicator = qs('#offline-indicator');
  if (!indicator) return;
  indicator.classList.toggle('show', offline);
}

window.addEventListener('online', updateConnectivityUI);
window.addEventListener('offline', updateConnectivityUI);
window.addEventListener('click', e => {
  if (e.target.id === 'app-modal') closeAppModal();
});

window.setRole = setRole;
window.handleLogin = handleLogin;
window.handleRegister = handleRegister;
window.logout = logout;
window.toggleRegister = toggleRegister;
window.inspectorTab = inspectorTab;
window.teacherTab = teacherTab;
window.filterTeachers = filterTeachers;
window.filterTickets = filterTickets;
window.selectRequestType = selectRequestType;
window.submitRequest = submitRequest;
window.resetForm = resetForm;
window.openUploadModal = openUploadModal;
window.uploadReport = uploadReport;
window.approveReport = approveReport;
window.sendReminder = sendReminder;
window.openTicketModal = openTicketModal;
window.acceptTicket = acceptTicket;
window.rejectTicket = rejectTicket;
window.closeModal = closeModal;
window.closeAppModal = closeAppModal;
window.openApprovalModal = openApprovalModal;
window.openRequestModal = openRequestModal;
window.approveTeacher = approveTeacher;
window.rejectTeacher = rejectTeacher;
window.updateRequestStatus = updateRequestStatus;
window.openVisitModal = openVisitModal;
window.createVisit = createVisit;
window.openReportModal = openReportModal;
window.createVisitReport = createVisitReport;
window.printVisitReport = printVisitReport;
window.openScoreModal = openScoreModal;
window.savePerformanceScore = savePerformanceScore;
window.showToast = showToast;

document.addEventListener('DOMContentLoaded', async () => {
  updateDateBadges();
  initPWA();
  updateConnectivityUI();
  const today = new Date().toISOString().split('T')[0];
  if (qs('#req-date')) qs('#req-date').value = today;
  await bootstrapUser();
});
