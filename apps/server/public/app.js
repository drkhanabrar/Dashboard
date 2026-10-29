'use strict';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const state = { user: null, summary: null, screens: [], devices: [], license: null, view: 'overview', selectedScreenId: null, system: null };
const WIDGETS = {
  clock: { label: 'Clock', icon: '◷', config: { showSeconds: false, format24: true } },
  date: { label: 'Date', icon: '▦', config: { locale: 'en-IN' } },
  calendar: { label: 'Calendar', icon: '▤', config: { events: [] } },
  weather: { label: 'Weather', icon: '☼', config: { city: 'Set location', latitude: 0, longitude: 0 } },
  announcement: { label: 'Announcement', icon: '◉', config: { text: 'Welcome to MirrorForge.' } },
  photo: { label: 'Photo', icon: '▧', config: { url: '', caption: '' } },
  notes: { label: 'Notes', icon: '✎', config: { text: 'Your notes here.' } }
};
const titles = { overview: 'Overview', screens: 'Screens', devices: 'Display devices', license: 'Licence & plans', settings: 'Server settings', 'screen-detail': 'Screen editor' };
let toastTimer;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
function shortDate() {
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date());
}
function showToast(message, error = false) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.toggle('error', error);
  toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 4200);
}
async function api(url, options = {}) {
  const headers = { ...(options.body instanceof FormData ? {} : { 'content-type': 'application/json' }), ...(options.headers || {}) };
  const response = await fetch(url, { credentials: 'same-origin', ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(body.error || `Request failed (${response.status})`);
    err.status = response.status;
    throw err;
  }
  return body;
}
function setAuthMode(mode) {
  $('#app-shell').classList.add('hidden');
  $('#auth-screen').classList.remove('hidden');
  const setup = mode === 'setup';
  $('#auth-card').innerHTML = setup ? `
    <p class="eyebrow">FIRST-RUN CONFIGURATION</p>
    <h2>Create your owner account</h2>
    <p class="auth-intro">This account controls your screens, devices and licences. Setup is available only on the PC running MirrorForge.</p>
    <form id="setup-form">
      <div class="field"><label for="setup-username">Administrator username</label><input id="setup-username" name="username" autocomplete="username" minlength="3" maxlength="40" required placeholder="e.g. mirroradmin"></div>
      <div class="field"><label for="setup-password">Password</label><input id="setup-password" name="password" type="password" autocomplete="new-password" minlength="12" maxlength="200" required placeholder="At least 12 characters"><span class="field-help">Use a unique password. The server stores a one-way password hash.</span></div>
      <button class="button button-primary" type="submit">Create secure workspace <span>→</span></button>
    </form>
    <div class="auth-note">Your first screen will be created automatically. Do not expose the server to the internet until you complete this setup.</div>
  ` : `
    <p class="eyebrow">WELCOME BACK</p>
    <h2>Sign in to MirrorForge</h2>
    <p class="auth-intro">Manage your displays from one private workspace.</p>
    <form id="login-form">
      <div class="field"><label for="login-username">Username</label><input id="login-username" name="username" autocomplete="username" required placeholder="Administrator username"></div>
      <div class="field"><label for="login-password">Password</label><input id="login-password" name="password" type="password" autocomplete="current-password" required placeholder="Your password"></div>
      <button class="button button-primary" type="submit">Sign in <span>→</span></button>
    </form>
    <div class="auth-note">Sign-in is rate-limited and uses an HTTP-only session cookie. If you lose your password, use the documented local recovery procedure.</div>
  `;
  const form = $('#setup-form');
  if (form) form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = $('button[type="submit"]', form); button.disabled = true; button.textContent = 'Creating account…';
    try { await api('/api/setup', { method: 'POST', body: JSON.stringify({ username: $('#setup-username').value, password: $('#setup-password').value }) }); await finishLogin(); }
    catch (err) { showAuthError(err.message); button.disabled = false; button.textContent = 'Create secure workspace →'; }
  });
  const login = $('#login-form');
  if (login) login.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = $('button[type="submit"]', login); button.disabled = true; button.textContent = 'Signing in…';
    try { await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: $('#login-username').value, password: $('#login-password').value }) }); await finishLogin(); }
    catch (err) { showAuthError(err.message); button.disabled = false; button.textContent = 'Sign in →'; }
  });
}
function showAuthError(message) {
  let el = $('.auth-error', $('#auth-card'));
  if (!el) { el = document.createElement('div'); el.className = 'auth-error'; el.style.cssText = 'margin-top:14px;padding:11px 12px;border:1px solid #673947;border-radius:8px;background:#301a27;color:#ffb5bc;font-size:11px;line-height:1.5'; $('#auth-card').append(el); }
  el.textContent = message;
}
async function finishLogin() {
  const response = await api('/api/auth/me');
  state.user = response.user;
  $('#auth-screen').classList.add('hidden'); $('#app-shell').classList.remove('hidden');
  $('#user-name').textContent = state.user.username; $('#user-avatar').textContent = state.user.username.slice(0, 2).toUpperCase();
  await refreshData();
  await renderView('overview');
}
async function bootstrap() {
  try {
    const { setupComplete } = await api('/api/setup/status');
    if (!setupComplete) { setAuthMode('setup'); return; }
    try { await finishLogin(); } catch (err) { if (err.status === 401) setAuthMode('login'); else throw err; }
  } catch (err) {
    $('#auth-screen').classList.remove('hidden');
    $('#auth-card').innerHTML = `<p class="eyebrow">SERVER CONNECTION</p><h2>Cannot reach the server</h2><p class="auth-intro">${escapeHtml(err.message)}</p><button class="button button-primary" id="retry-bootstrap">Try again</button>`;
    $('#auth-card').innerHTML += '<div class="auth-note">If you are opening this on another device, complete first-run setup locally on the server PC first.</div>';
    $('#retry-bootstrap').addEventListener('click', bootstrap);
  }
}
async function refreshData() {
  const [summary, screenResult, license, deviceResult] = await Promise.all([
    api('/api/dashboard/summary'), api('/api/screens'), api('/api/license'), api('/api/devices')
  ]);
  state.summary = summary; state.screens = screenResult.screens; state.license = license; state.devices = deviceResult.devices;
  $('#nav-screen-count').textContent = state.screens.length;
}
function setActiveView(view) {
  state.view = view;
  $$('.view').forEach((section) => section.classList.toggle('hidden', section.id !== `view-${view}`));
  $$('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.view === view || (view === 'screen-detail' && item.dataset.view === 'screens')));
  $('#page-title').textContent = titles[view] || 'MirrorForge';
  $('#top-eyebrow').textContent = view === 'screen-detail' ? 'DISPLAY CONFIGURATION' : 'YOUR WORKSPACE';
  $('#sidebar').classList.remove('open');
}
async function renderView(view) {
  if (view !== 'screen-detail') state.selectedScreenId = null;
  setActiveView(view);
  if (view === 'overview') return renderOverview();
  if (view === 'screens') return renderScreens();
  if (view === 'screen-detail') return renderScreenDetail();
  if (view === 'devices') return renderDevices();
  if (view === 'license') return renderLicense();
  if (view === 'settings') return renderSettings();
}
function screenCard(screen) {
  const count = screen.widgets?.length || 0;
  return `<article class="screen-card">
    <div class="screen-preview"><div class="preview-frame"><div class="preview-tile"><span>LOCAL TIME</span><strong>09:41</strong></div><div class="preview-tile"><span>WEATHER</span><strong>24°</strong></div><div class="preview-tile"><span>YOUR DISPLAY</span><strong>${escapeHtml(screen.name)}</strong></div></div><span class="screen-chip"><span class="pulse-dot"></span> READY</span></div>
    <div class="screen-card-body"><div class="screen-card-head"><div><h4>${escapeHtml(screen.name)}</h4><p>${escapeHtml(screen.description || 'Custom display screen')}</p></div><button class="icon-button" data-action="edit-screen" data-id="${screen.id}" title="Edit screen" aria-label="Edit screen">↗</button></div>
    <div class="screen-meta"><span>▦ ${count} widget${count === 1 ? '' : 's'}</span><span>◷ ${escapeHtml(new Date(screen.updatedAt || screen.createdAt).toLocaleDateString())}</span></div>
    <div class="screen-card-actions"><button class="button button-secondary button-small" data-action="edit-screen" data-id="${screen.id}">Configure</button><button class="button button-quiet button-small" data-action="open-screen" data-url="${escapeHtml(screen.displayUrl)}">Open display ↗</button></div></div>
  </article>`;
}
function emptyState(icon, title, body, buttonLabel, action) {
  return `<div class="empty-state"><div class="empty-icon">${icon}</div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(body)}</p><button class="button button-primary" data-action="${action}">${escapeHtml(buttonLabel)} <span>→</span></button></div>`;
}
async function renderOverview() {
  const summary = state.summary || { screens: 0, widgets: 0, devices: 0, license: { name: 'Free' } };
  const screensHtml = state.screens.length ? `<div class="screen-grid">${state.screens.slice(0, 3).map(screenCard).join('')}</div>` : emptyState('▦', 'Create your first screen', 'Start with a clock, calendar, weather and photo layout. You can assign it to any display later.', 'Create a screen', 'create-screen');
  $('#view-overview').innerHTML = `
    <div class="welcome-row"><div><p class="eyebrow">YOUR DISPLAY NETWORK</p><h2>Good to see you, ${escapeHtml(state.user.username)}.</h2><p>Your screens are managed from one place. Make changes here and every connected display will pick them up automatically.</p></div><div class="date-chip"><span>◷</span><span><strong>${escapeHtml(shortDate())}</strong><br><span class="muted">Local server time</span></span></div></div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-top"><span>Total screens</span><span class="stat-icon">▦</span></div><div class="stat-value">${summary.screens}</div><div class="stat-foot">Configured dashboards</div></div>
      <div class="stat-card"><div class="stat-top"><span>Widgets</span><span class="stat-icon">◫</span></div><div class="stat-value">${summary.widgets}</div><div class="stat-foot">Across all screens</div></div>
      <div class="stat-card"><div class="stat-top"><span>Display devices</span><span class="stat-icon">▣</span></div><div class="stat-value">${summary.devices}</div><div class="stat-foot">Unique display links</div></div>
      <div class="stat-card"><div class="stat-top"><span>Current plan</span><span class="stat-icon">◇</span></div><div class="stat-value" style="font-size:24px">${escapeHtml(summary.license.name)}</div><div class="stat-foot">${escapeHtml(state.license?.license?.status || 'free')} licence status</div></div>
    </div>
    <div class="section-heading"><div><h3>Your screens</h3><p>Open a screen to configure its layout and widgets.</p></div><button class="button button-secondary button-small" data-action="navigate-screens">View all screens ↗</button></div>
    ${screensHtml}
    <div class="section-heading"><div><h3>Quick start</h3><p>Get your first display connected.</p></div></div>
    <div class="settings-grid">
      <div class="panel"><div class="panel-head"><div><h3>01 / Configure a screen</h3><p>Create widgets and arrange their content.</p></div><span class="stat-icon">▦</span></div><div class="panel-body"><p class="muted-text" style="font-size:12px;line-height:1.7;margin:0 0 15px">Add a clock, date, calendar, weather, announcements, photo or notes widgets. Each screen gets a private, unguessable display URL.</p><button class="button button-secondary button-small" data-action="navigate-screens">Manage screens →</button></div></div>
      <div class="panel"><div class="panel-head"><div><h3>02 / Connect a device</h3><p>Give a TV, tablet or mirror its own URL.</p></div><span class="stat-icon">▣</span></div><div class="panel-body"><p class="muted-text" style="font-size:12px;line-height:1.7;margin:0 0 15px">Register each display, choose its screen, then open its display URL on the device. For internet access, use HTTPS through a secure tunnel.</p><button class="button button-secondary button-small" data-action="navigate-devices">Set up devices →</button></div></div>
    </div>`;
}
async function renderScreens() {
  $('#view-screens').innerHTML = `
    <div class="welcome-row"><div><p class="eyebrow">LAYOUT MANAGEMENT</p><h2>Every display, one workspace.</h2><p>Create individual screens for home, office, family calendar, digital signage or a dedicated smart mirror.</p></div><button class="button button-primary" data-action="create-screen">＋ New screen</button></div>
    <div id="create-screen-panel" class="panel hidden" style="margin-bottom:18px"><div class="panel-head"><div><h3>New screen</h3><p>Give the dashboard a name and optional description.</p></div></div><div class="panel-body"><form id="create-screen-form" class="inline-form"><div class="field" style="flex:1;min-width:190px"><label for="screen-name">Screen name</label><input id="screen-name" maxlength="80" required placeholder="e.g. Family Mirror"></div><div class="field" style="flex:2;min-width:220px"><label for="screen-description">Description</label><input id="screen-description" maxlength="250" placeholder="What should this display show?"></div><button class="button button-primary" type="submit">Create screen</button><button class="button button-quiet" type="button" data-action="cancel-create-screen">Cancel</button></form></div></div>
    ${state.screens.length ? `<div class="screen-grid">${state.screens.map(screenCard).join('')}</div>` : emptyState('▦', 'No screens yet', 'Create a dashboard to start using MirrorForge.', 'Create a screen', 'create-screen')}`;
  $('#create-screen-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try { const result = await api('/api/screens', { method: 'POST', body: JSON.stringify({ name: $('#screen-name').value, description: $('#screen-description').value }) }); await refreshData(); showToast('Screen created.'); state.selectedScreenId = result.screen.id; await renderView('screen-detail'); }
    catch (err) { showToast(err.message, true); }
  });
}
async function renderScreenDetail() {
  const screen = state.screens.find((item) => item.id === state.selectedScreenId);
  if (!screen) return renderView('screens');
  const widgetRows = screen.widgets.length ? `<div class="widget-list">${screen.widgets.map(widgetEditor).join('')}</div>` : emptyState('◫', 'This screen is empty', 'Add your first widget below. You can keep each widget simple or configure its JSON settings.', 'Add a widget', 'focus-add-widget');
  $('#view-screen-detail').innerHTML = `
    <div class="screen-detail-top"><div><div class="breadcrumb"><button data-action="navigate-screens">Screens</button><span>/</span><span>${escapeHtml(screen.name)}</span></div><h2>${escapeHtml(screen.name)}</h2><p>${escapeHtml(screen.description || 'Configure widget content for this display.')}</p></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="button button-secondary" data-action="copy-url" data-url="${escapeHtml(screen.displayUrl)}">Copy display URL</button><button class="button button-primary" data-action="open-screen" data-url="${escapeHtml(screen.displayUrl)}">Preview ↗</button></div></div>
    <div class="settings-grid" style="margin-bottom:18px"><div class="panel"><div class="panel-head"><div><h3>Screen details</h3><p>Name and description shown in the workspace.</p></div></div><div class="panel-body"><form id="screen-details-form" class="widget-form-grid"><div class="field"><label for="detail-name">Name</label><input id="detail-name" maxlength="80" required value="${escapeHtml(screen.name)}"></div><div class="field"><label for="detail-description">Description</label><input id="detail-description" maxlength="250" value="${escapeHtml(screen.description)}"></div><button class="button button-secondary button-small" type="submit">Save screen details</button></form></div></div>
    <div class="panel"><div class="panel-head"><div><h3>Display URL</h3><p>Use this URL on a trusted device or kiosk browser.</p></div><span class="status-pill">TOKEN PROTECTED</span></div><div class="panel-body"><div class="code-box" id="screen-url">${escapeHtml(location.origin + screen.displayUrl)}</div><p class="field-help" style="margin-top:10px">Treat this URL like a credential. Anyone with the link can view this screen, but cannot edit it.</p></div></div></div>
    <div class="section-heading"><div><h3>Widgets <span class="muted">(${screen.widgets.length})</span></h3><p>Edit content and settings. Config is a JSON object.</p></div></div>
    ${screen.widgets.length ? widgetRows : '<div class="panel" style="margin-bottom:18px"><div class="panel-body"><p class="muted-text" style="margin:0 0 15px">Add a widget to start building this screen.</p></div></div>'}
    <div id="add-widget-panel" class="panel" style="margin-top:18px"><div class="panel-head"><div><h3>＋ Add a widget</h3><p>Choose a widget type and configure its initial content.</p></div></div><div class="panel-body"><form id="add-widget-form" class="inline-form"><div class="field" style="min-width:160px"><label for="widget-type">Widget type</label><select id="widget-type">${Object.entries(WIDGETS).map(([key, info]) => `<option value="${key}">${info.label}</option>`).join('')}</select></div><div class="field" style="flex:1;min-width:180px"><label for="widget-title">Title</label><input id="widget-title" maxlength="80" placeholder="Widget title"></div><div class="field" style="flex:2;min-width:220px"><label for="widget-config">Config JSON</label><input id="widget-config" placeholder='{"text":"Hello"}'></div><button class="button button-primary" type="submit">Add widget</button></form><p class="field-help" style="margin-top:12px">Weather uses latitude/longitude. Photo expects a local media path such as <code>/media/your-image.jpg</code>. You can upload images in Server settings.</p></div></div>
    <div class="section-heading" style="margin-top:23px"><div><h3>Danger zone</h3><p>Deleting this screen also deletes its widgets and assigned display devices.</p></div><button class="button button-danger button-small" data-action="delete-screen" data-id="${screen.id}">Delete screen</button></div>`;
  $('#screen-details-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try { await api(`/api/screens/${screen.id}`, { method: 'PATCH', body: JSON.stringify({ name: $('#detail-name').value, description: $('#detail-description').value }) }); await refreshData(); showToast('Screen details saved.'); await renderScreenDetail(); }
    catch (err) { showToast(err.message, true); }
  });
  $('#add-widget-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const type = $('#widget-type').value;
    let config = WIDGETS[type].config;
    const text = $('#widget-config').value.trim();
    if (text) { try { config = JSON.parse(text); } catch { showToast('Config must be valid JSON.', true); return; } }
    try { await api(`/api/screens/${screen.id}/widgets`, { method: 'POST', body: JSON.stringify({ type, title: $('#widget-title').value || WIDGETS[type].label, config }) }); await refreshData(); showToast('Widget added.'); await renderScreenDetail(); }
    catch (err) { showToast(err.message, true); }
  });
  $('#widget-type').addEventListener('change', () => { $('#widget-title').value = WIDGETS[$('#widget-type').value].label; $('#widget-config').value = JSON.stringify(WIDGETS[$('#widget-type').value].config); });
  $$('.widget-save-form').forEach((form) => form.addEventListener('submit', async (event) => {
    event.preventDefault(); const id = form.dataset.widgetId; let config;
    try { config = JSON.parse($('textarea[name="config"]', form).value || '{}'); } catch { showToast('Config JSON is invalid.', true); return; }
    try { await api(`/api/widgets/${id}`, { method: 'PATCH', body: JSON.stringify({ title: $('input[name="title"]', form).value, config }) }); await refreshData(); showToast('Widget saved.'); await renderScreenDetail(); }
    catch (err) { showToast(err.message, true); }
  }));
}
function widgetEditor(widget) {
  const info = WIDGETS[widget.type] || { label: widget.type, icon: '◫' };
  return `<article class="widget-editor"><div class="widget-editor-head"><span class="widget-icon">${info.icon}</span><div><strong>${escapeHtml(widget.title)}</strong><small>${escapeHtml(info.label)} · ID ${widget.id}</small></div><span class="spacer"></span><button class="icon-button" type="button" title="Delete widget" aria-label="Delete widget" data-action="delete-widget" data-id="${widget.id}">×</button></div><form class="widget-save-form" data-widget-id="${widget.id}"><div class="widget-form-grid"><div class="field"><label>Title</label><input name="title" maxlength="80" value="${escapeHtml(widget.title)}" required></div><div class="field"><label>Config JSON</label><textarea name="config" spellcheck="false">${escapeHtml(JSON.stringify(widget.config, null, 2))}</textarea><span class="field-help">${widget.type === 'weather' ? 'Example: {"city":"Nirmal","latitude":19.1,"longitude":78.3}' : widget.type === 'photo' ? 'Example: {"url":"/media/photo.jpg","caption":"Family"}' : widget.type === 'calendar' ? 'Use events: [{"date":"2026-10-29","title":"Example"}]' : 'Edit the object to change this widget content.'}</span></div><button class="button button-secondary button-small" type="submit">Save widget</button></div></form></article>`;
}
async function renderDevices() {
  const options = state.screens.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
  $('#view-devices').innerHTML = `
    <div class="welcome-row"><div><p class="eyebrow">CONNECTED DISPLAYS</p><h2>Give every screen a device.</h2><p>Register each TV, tablet, mirror or kiosk as a separate display. Device links can be revoked at any time.</p></div></div>
    <div class="panel" style="margin-bottom:18px"><div class="panel-head"><div><h3>Register a display device</h3><p>Creates a dedicated, revocable display URL.</p></div></div><div class="panel-body">${state.screens.length ? `<form id="device-form" class="inline-form"><div class="field" style="flex:1;min-width:180px"><label for="device-name">Device name</label><input id="device-name" maxlength="80" required placeholder="e.g. Living room Android TV"></div><div class="field" style="flex:1;min-width:180px"><label for="device-screen">Assigned screen</label><select id="device-screen">${options}</select></div><button class="button button-primary" type="submit">＋ Register device</button></form>` : '<p class="muted-text" style="margin:0;font-size:12px">Create a screen first, then register a display device.</p>'}</div></div>
    <div class="panel"><div class="panel-head"><div><h3>Registered devices</h3><p>Copy the display URL and open it in the device browser or packaged client.</p></div><span class="status-pill">${state.devices.length} REGISTERED</span></div>
    ${state.devices.length ? `<div class="table-wrap"><table><thead><tr><th>Device</th><th>Assigned screen</th><th>Last seen</th><th>Display URL</th><th></th></tr></thead><tbody>${state.devices.map((d) => `<tr><td><strong>${escapeHtml(d.name)}</strong></td><td>${escapeHtml(d.screenName)}</td><td>${d.lastSeenAt ? escapeHtml(new Date(d.lastSeenAt + 'Z').toLocaleString()) : 'Not yet connected'}</td><td><button class="button button-quiet button-small" data-action="copy-url" data-url="${escapeHtml(d.displayUrl)}">Copy URL</button></td><td><button class="button button-danger button-small" data-action="delete-device" data-id="${d.id}">Revoke</button></td></tr>`).join('')}</tbody></table></div>` : `<div class="panel-body">${emptyState('▣', 'No devices registered', 'Register a device to create its dedicated display URL.', state.screens.length ? 'Register device' : 'Create screen', state.screens.length ? 'focus-device-form' : 'navigate-screens')}</div>`}</div>
    <div class="settings-grid" style="margin-top:18px"><div class="panel"><div class="panel-head"><h3>On a device in your home</h3></div><div class="panel-body"><p class="muted-text" style="font-size:12px;line-height:1.8;margin:0">Open the PC's LAN address and assigned port from the same Wi-Fi network. Example: <code>http://192.168.1.20:4173/display/TOKEN</code>. Keep the PC awake and let the app through the Windows firewall on private networks.</p></div></div><div class="panel"><div class="panel-head"><h3>When away from home</h3></div><div class="panel-body"><p class="muted-text" style="font-size:12px;line-height:1.8;margin:0">Publish the server through HTTPS using Cloudflare Tunnel or a trusted reverse proxy. Do not forward the port directly to the public internet without HTTPS and a security review.</p></div></div></div>`;
  $('#device-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try { const result = await api('/api/devices', { method: 'POST', body: JSON.stringify({ name: $('#device-name').value, screenId: Number($('#device-screen').value) }) }); await refreshData(); showToast('Device registered.'); await renderDevices(); if (result.device) await copyToClipboard(location.origin + result.device.displayUrl, false); }
    catch (err) { showToast(err.message, true); }
  });
}
async function renderLicense() {
  const license = state.license?.license || { tier: 'free', name: 'Free', status: 'free', maxScreens: 2, maxWidgetsPerScreen: 10, maxDevices: 3, features: [] };
  const tierRows = [
    ['Home', 'home', '5 screens', '10 devices', 'For family displays and home mirrors.'],
    ['Pro', 'pro', '20 screens', '50 devices', 'For larger homes and multi-room installations.'],
    ['Commercial', 'commercial', '100 screens', '250 devices', 'For business signage and managed installations.']
  ];
  $('#view-license').innerHTML = `
    <div class="welcome-row"><div><p class="eyebrow">PRODUCT ACTIVATION</p><h2>Licence & plans</h2><p>Tier checks are enforced by the local server. Paid activation keys are issued by your separately configured MirrorForge License Issuer.</p></div></div>
    <div class="license-hero"><div class="license-card"><span class="license-tier"><span class="pulse-dot"></span> CURRENT TIER</span><h2>${escapeHtml(license.name || 'Free')}</h2><p>${license.status === 'active' ? 'This installation has an activated, signed licence.' : license.status === 'expired' ? 'The saved licence has expired. The server has reverted to Free tier limits.' : license.status === 'invalid' ? 'The saved licence could not be verified and is not being trusted.' : 'You are currently using MirrorForge Free. Activate a signed licence to increase usage limits.'}</p><div class="feature-list"><span class="feature-tag">${license.maxScreens} screens</span><span class="feature-tag">${license.maxWidgetsPerScreen} widgets / screen</span><span class="feature-tag">${license.maxDevices} devices</span></div></div>
    <div class="panel"><div class="panel-head"><div><h3>Licence issuer</h3><p>Address of your separately hosted activation service.</p></div></div><div class="panel-body"><form id="issuer-form" class="widget-form-grid"><div class="field"><label for="issuer-url">Issuer URL</label><input id="issuer-url" type="url" maxlength="500" value="${escapeHtml(state.license?.issuerUrl || 'http://127.0.0.1:4180')}" required></div><button class="button button-secondary button-small" type="submit">Save issuer URL</button></form><p class="field-help" style="margin-top:10px">Use localhost only when the issuer service runs on this same PC. For remote activation, use an HTTPS URL.</p><hr style="border:0;border-top:1px solid #20344a;margin:17px 0"><form id="activate-form" class="widget-form-grid"><div class="field"><label for="license-key">Licence key</label><input id="license-key" autocomplete="off" maxlength="100" placeholder="MFORGE-XXXXX-XXXXX-XXXXX" required></div><button class="button button-primary" type="submit">Activate licence <span>→</span></button></form>${license.status === 'active' ? '<button id="deactivate-license" class="button button-quiet button-small" type="button" style="margin-top:12px">Deactivate this installation</button>' : ''}</div></div></div>
    <div class="section-heading"><div><h3>Available tiers</h3><p>Limits are enforced by the server, not just hidden in the interface.</p></div></div>
    <div class="tier-grid">${tierRows.map(([name, tier, screens, devices]) => `<article class="tier-card"><h3>${name}</h3><div class="tier-price">${screens}</div><p>${tier === 'home' ? 'Essential family and home display features.' : tier === 'pro' ? 'More displays and advanced layout options.' : 'Commercial deployment and higher capacity.'}</p><ul><li>${devices}</li><li>Server-side activation</li><li>Signed licence payload</li><li>${tier === 'commercial' ? 'Commercial-use feature flag' : 'Standard widget library'}</li></ul></article>`).join('')}</div>
    <div class="panel" style="margin-top:17px"><div class="panel-head"><div><h3>Security model</h3><p>Licence keys are never generated in the client app.</p></div></div><div class="panel-body"><p class="muted-text" style="font-size:12px;line-height:1.8;margin:0">The separate issuer stores only a hash of each human-readable key, limits activations, and signs tier claims with Ed25519. The dashboard contains the public verification key only. Keep the issuer private key and administrator token on your trusted server and outside GitHub.</p></div></div>`;
  $('#issuer-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try { await api('/api/license/config', { method: 'PATCH', body: JSON.stringify({ issuerUrl: $('#issuer-url').value.trim() }) }); await refreshData(); showToast('Licence issuer URL saved.'); await renderLicense(); }
    catch (err) { showToast(err.message, true); }
  });
  $('#activate-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try { await api('/api/license/activate', { method: 'POST', body: JSON.stringify({ licenseKey: $('#license-key').value.trim() }) }); await refreshData(); showToast('Licence activated successfully.'); await renderLicense(); }
    catch (err) { showToast(err.message, true); }
  });
  $('#deactivate-license')?.addEventListener('click', async () => {
    if (!confirm('Deactivate this installation? This may release a paid activation seat.')) return;
    try { const result = await api('/api/license/deactivate', { method: 'POST', body: '{}' }); await refreshData(); showToast(result.message || 'Licence deactivated.'); await renderLicense(); }
    catch (err) { showToast(err.message, true); }
  });
}
async function renderSettings() {
  let system = state.system;
  try { system = await api('/api/admin/system'); state.system = system; } catch {}
  const localUrl = `${location.origin}`;
  $('#view-settings').innerHTML = `
    <div class="welcome-row"><div><p class="eyebrow">SELF-HOSTED INSTANCE</p><h2>Server settings</h2><p>Check your instance details, upload media and follow the safe remote-access path.</p></div></div>
<<<<<<< HEAD
    <div class="settings-grid"><div class="panel"><div class="panel-head"><div><h3>Instance information</h3><p>Local server configuration.</p></div><span class="status-pill">RUNNING</span></div><div class="panel-body"><div class="setting-row"><span>Product version</span><strong>${escapeHtml(system?.version || '1.0.0')}</strong></div><div class="setting-row"><span>Local URL</span><strong>${escapeHtml(localUrl)}</strong></div><div class="setting-row"><span>Port</span><strong>${escapeHtml(system?.port || location.port || '80')}</strong></div><div class="setting-row"><span>Network addresses</span><strong>${escapeHtml(system?.addresses?.join(', ') || 'See desktop launch log')}</strong></div><div class="setting-row"><span>Plan</span><strong>${escapeHtml(state.license?.license?.name || 'Free')}</strong></div></div></div>
=======
    <div class="settings-grid"><div class="panel"><div class="panel-head"><div><h3>Instance information</h3><p>Local server configuration.</p></div><span class="status-pill">RUNNING</span></div><div class="panel-body"><div class="setting-row"><span>Product version</span><strong>${escapeHtml(system?.version || '1.0.1')}</strong></div><div class="setting-row"><span>Local URL</span><strong>${escapeHtml(localUrl)}</strong></div><div class="setting-row"><span>Port</span><strong>${escapeHtml(system?.port || location.port || '80')}</strong></div><div class="setting-row"><span>Network addresses</span><strong>${escapeHtml(system?.addresses?.join(', ') || 'See desktop launch log')}</strong></div><div class="setting-row"><span>Plan</span><strong>${escapeHtml(state.license?.license?.name || 'Free')}</strong></div></div></div>
>>>>>>> 1f9b19d (Fix V1 builds and add legacy iOS 9 client)
    <div class="panel"><div class="panel-head"><div><h3>Upload a photo</h3><p>Images stay in this server's local media folder.</p></div></div><div class="panel-body"><form id="upload-form" class="widget-form-grid"><div class="field"><label for="media-file">Image file</label><input type="file" id="media-file" accept="image/jpeg,image/png,image/webp,image/gif" required></div><span class="field-help">JPG, PNG, WEBP or GIF. Maximum 10 MB per file.</span><button class="button button-secondary" type="submit">Upload image</button></form><div id="upload-result" class="hidden" style="margin-top:14px"></div></div></div>
    <div class="panel"><div class="panel-head"><div><h3>Remote access</h3><p>Reach your displays outside your home network.</p></div></div><div class="panel-body"><p class="muted-text" style="font-size:12px;line-height:1.8;margin:0 0 14px">Use a secure HTTPS tunnel to the local server. This works even when the ISP places your router behind CGNAT. Complete initial setup on the server PC before making the service reachable remotely.</p><div class="code-box">cloudflared tunnel --url http://127.0.0.1:${escapeHtml(system?.port || location.port || '4173')}</div><p class="field-help" style="margin-top:10px">The command above is a quick test only. For ongoing use, create a named tunnel and configure a domain, access policy and startup service.</p><button class="button button-quiet button-small" data-action="open-docs">Open deployment guide ↗</button></div></div>
    <div class="panel"><div class="panel-head"><div><h3>Backup & recovery</h3><p>Protect the database and media library.</p></div></div><div class="panel-body"><p class="muted-text" style="font-size:12px;line-height:1.8;margin:0">Data is stored in your operating system's MirrorForge user-data directory. Back up <code>mirrorforge.sqlite</code> and the <code>media</code> folder together while the app is closed. Keep a separate copy before every upgrade.</p></div></div></div>`;
  $('#upload-form').addEventListener('submit', async (event) => {
    event.preventDefault(); const file = $('#media-file').files[0]; if (!file) return;
    const data = new FormData(); data.append('image', file);
    try { const result = await api('/api/media', { method: 'POST', body: data }); const box = $('#upload-result'); box.classList.remove('hidden'); box.innerHTML = `<p class="field-help">Upload complete. Use this URL in a Photo widget:</p><div class="code-box">${escapeHtml(result.url)}</div><p><button class="button button-quiet button-small" data-action="copy-url" data-url="${escapeHtml(result.url)}">Copy media URL</button></p>`; showToast('Image uploaded.'); }
    catch (err) { showToast(err.message, true); }
  });
}
async function copyToClipboard(value, showMessage = true) {
  const full = value.startsWith('http') ? value : `${location.origin}${value}`;
  try { await navigator.clipboard.writeText(full); if (showMessage) showToast('Copied to clipboard.'); }
  catch { const textarea = document.createElement('textarea'); textarea.value = full; document.body.append(textarea); textarea.select(); const ok = document.execCommand('copy'); textarea.remove(); if (showMessage) showToast(ok ? 'Copied to clipboard.' : full, !ok); }
}
async function actionHandler(event) {
  const target = event.target.closest('[data-action]'); if (!target) return;
  const action = target.dataset.action;
  try {
    if (action === 'navigate-screens') return renderView('screens');
    if (action === 'navigate-devices') return renderView('devices');
    if (action === 'create-screen') { await renderView('screens'); $('#create-screen-panel')?.classList.remove('hidden'); $('#screen-name')?.focus(); return; }
    if (action === 'cancel-create-screen') { $('#create-screen-panel')?.classList.add('hidden'); return; }
    if (action === 'edit-screen') { state.selectedScreenId = Number(target.dataset.id); return renderView('screen-detail'); }
    if (action === 'open-screen') { const url = target.dataset.url; window.open(`${location.origin}${url}`, '_blank', 'noopener,noreferrer'); return; }
    if (action === 'copy-url') { await copyToClipboard(target.dataset.url || ''); return; }
    if (action === 'delete-screen') { if (!confirm('Delete this screen, its widgets and all devices assigned to it? This cannot be undone.')) return; await api(`/api/screens/${target.dataset.id}`, { method: 'DELETE' }); await refreshData(); showToast('Screen deleted.'); return renderView('screens'); }
    if (action === 'delete-widget') { if (!confirm('Delete this widget?')) return; await api(`/api/widgets/${target.dataset.id}`, { method: 'DELETE' }); await refreshData(); showToast('Widget deleted.'); return renderView('screen-detail'); }
    if (action === 'delete-device') { if (!confirm('Revoke this device link? The display will no longer load its screen.')) return; await api(`/api/devices/${target.dataset.id}`, { method: 'DELETE' }); await refreshData(); showToast('Device link revoked.'); return renderView('devices'); }
    if (action === 'focus-add-widget') { $('#add-widget-panel')?.scrollIntoView({ behavior: 'smooth' }); return; }
    if (action === 'focus-device-form') { $('#device-name')?.focus(); return; }
    if (action === 'open-docs') { showToast('See README.md and docs/DEPLOYMENT.md in the source package.'); return; }
  } catch (err) { showToast(err.message, true); }
}

$$('.nav-item').forEach((item) => item.addEventListener('click', () => renderView(item.dataset.view)));
document.addEventListener('click', actionHandler);
$('#mobile-menu').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
$('#logout-button').addEventListener('click', async () => { try { await api('/api/auth/logout', { method: 'POST', body: '{}' }); } catch {} state.user = null; setAuthMode('login'); });
bootstrap();
