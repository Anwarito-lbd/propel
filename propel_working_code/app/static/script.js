let token = localStorage.getItem('propelToken') || '';
let selectedJob = '';
let selectedTitle = '';
const $ = (id) => document.getElementById(id);
const STAGES = ['saved', 'shortlisted', 'applied', 'interview', 'offer', 'rejected', 'archived'];

function setStatus(id, msg, cls = 'small') {
  const el = $(id);
  if (!el) return;
  el.className = cls;
  el.textContent = msg;
}

function safeHref(url) {
  try {
    const parsed = new URL(String(url || ''));
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : '#';
  } catch {
    return '#';
  }
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

async function api(path, body) {
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.detail || 'Request failed');
  return j;
}

async function signup() {
  try {
    const j = await api('/api/signup', { email: $('email').value, password: $('password').value, name: $('name').value });
    token = j.token;
    localStorage.setItem('propelToken', token);
    setStatus('authStatus', 'Signed in as ' + j.email, 'small');
  } catch (e) {
    setStatus('authStatus', e.message, 'small error');
  }
}

async function login() {
  try {
    const j = await api('/api/login', { email: $('email').value, password: $('password').value });
    token = j.token;
    localStorage.setItem('propelToken', token);
    setStatus('authStatus', 'Signed in as ' + j.email, 'small');
    loadApps();
  } catch (e) {
    setStatus('authStatus', e.message, 'small error');
  }
}

function logout() {
  localStorage.removeItem('propelToken');
  token = '';
  selectedJob = '';
  selectedTitle = '';
  location.reload();
}

async function saveProfile() {
  try {
    const fd = new FormData();
    fd.append('token', token);
    fd.append('name', $('name').value);
    fd.append('field', $('field').value);
    fd.append('target_location', $('target_location').value);
    fd.append('target_duration', $('target_duration').value);
    if ($('resume').files[0]) fd.append('resume', $('resume').files[0]);
    const r = await fetch('/api/profile', { method: 'POST', body: fd });
    const j = await r.json();
    if (!r.ok) throw new Error(j.detail || 'Could not save profile');
    setStatus('profileStatus', 'Profile saved. Resume preview: ' + (j.profile.resume_text || 'No resume uploaded yet'), 'small');
  } catch (e) {
    setStatus('profileStatus', e.message, 'small error');
  }
}

async function searchJobs() {
  if (!token) {
    setStatus('searchStatus', 'Sign up or log in first.', 'small error');
    return;
  }
  setStatus('searchStatus', 'Searching live public providers...', 'small');
  $('jobs').innerHTML = '';
  try {
    const j = await api('/api/jobs/search', {
      token,
      query: $('query').value,
      location: $('location').value,
      duration: $('duration').value,
      field: $('field').value,
      period_days: 30,
    });
    const warn = j.provider_errors.length ? '<br><span class="error">' + j.provider_errors.map(escapeHtml).join('<br>') + '</span>' : '';
    $('searchStatus').innerHTML = `${j.jobs.length} real results. ${j.provider_errors.length ? '<span class="warn">Provider warnings shown below.</span>' : ''}${warn}`;
    $('jobs').innerHTML = j.jobs.map((job) => `
      <div class="job">
        <h3>${escapeHtml(job.title)} <span class="score">${Math.round(job.score)}%</span></h3>
        <p>${escapeHtml(job.company)} • ${escapeHtml(job.location)} • <span class="pill">${escapeHtml(job.source)}</span></p>
        <a href="${escapeHtml(safeHref(job.url))}" target="_blank" rel="noreferrer">Open public source</a>
        <button onclick="selectJob('${escapeHtml(job.id)}', '${escapeHtml(job.title)}')">Select</button>
        <button onclick="saveJob('${escapeHtml(job.id)}', '${escapeHtml(job.title)}')">Save</button>
      </div>`).join('') || '<p class="warn">No fake fallback. Try a broader query or another location.</p>';
  } catch (e) {
    setStatus('searchStatus', e.message, 'small error');
  }
}

function selectJob(id, title = '') {
  selectedJob = id;
  selectedTitle = title || id;
  setStatus('selectedStatus', `Selected job: ${selectedTitle}`, 'small');
}

async function saveJob(id, title = '') {
  try {
    await api('/api/jobs/save', { token, job_id: id, status: 'saved' });
    selectJob(id, title);
    await loadApps();
  } catch (e) {
    setStatus('appsStatus', e.message, 'small error');
  }
}

async function updateAppStatus(appId, status) {
  try {
    await api('/api/applications/status', { token, application_id: appId, status });
    setStatus('appsStatus', `Updated application #${appId} to "${status}".`, 'small');
    await loadApps();
  } catch (e) {
    setStatus('appsStatus', e.message, 'small error');
  }
}

async function deleteApp(appId) {
  try {
    const r = await fetch(`/api/applications/${appId}?token=${encodeURIComponent(token)}`, { method: 'DELETE' });
    const j = await r.json();
    if (!r.ok) throw new Error(j.detail || 'Delete failed');
    setStatus('appsStatus', `Removed application #${appId}.`, 'small');
    await loadApps();
  } catch (e) {
    setStatus('appsStatus', e.message, 'small error');
  }
}

async function loadApps() {
  if (!token) {
    setStatus('appsStatus', 'Sign in to view saved applications.', 'small');
    return;
  }
  try {
    const r = await fetch('/api/applications?token=' + encodeURIComponent(token));
    const j = await r.json();
    if (!r.ok) throw new Error(j.detail);
    $('apps').innerHTML = j.applications.map((a) => `
      <div class="job">
        <b>${escapeHtml(a.title)}</b>
        <p>${escapeHtml(a.company)} • <span class="pill">${escapeHtml(a.status)}</span></p>
        <div class="row">
          <a href="${escapeHtml(safeHref(a.url))}" target="_blank" rel="noreferrer">Source</a>
          <select aria-label="Status" onchange="updateAppStatus(${a.id}, this.value)">
            ${STAGES.map((st) => `<option value="${st}" ${a.status === st ? 'selected' : ''}>${st}</option>`).join('')}
          </select>
          <button onclick="selectJob('${escapeHtml(a.job_id)}', '${escapeHtml(a.title)}')">Select</button>
          <button onclick="deleteApp(${a.id})">Remove</button>
        </div>
      </div>`).join('') || '<p class="small">No saved applications yet.</p>';
  } catch (e) {
    setStatus('appsStatus', e.message, 'small error');
  }
}

async function generateMaterial() {
  if (!token || !selectedJob) {
    $('material').textContent = 'Sign in and select a job first.';
    return;
  }
  try {
    const j = await api('/api/generate', { token, job_id: selectedJob });
    $('material').textContent = 'SHORT MESSAGE\n' + j.short_message + '\n\nCOVER LETTER\n' + j.cover_letter + '\n\nEVIDENCE\n' + JSON.stringify(j.evidence, null, 2);
  } catch (e) {
    $('material').textContent = e.message;
  }
}

async function interview() {
  if (!token || !selectedJob) {
    $('questions').innerHTML = '<p class="small error">Sign in and select a job first.</p>';
    return;
  }
  try {
    const j = await api('/api/interview', { token, job_id: selectedJob });
    $('questions').innerHTML = '<p class="small">' + escapeHtml(j.note) + '</p>' + j.questions.map((q, i) => `<p><b>Q${i + 1}.</b> ${escapeHtml(q)}</p>`).join('');
  } catch (e) {
    $('questions').innerHTML = '<p class="small error">' + escapeHtml(e.message) + '</p>';
  }
}
