'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const { openDatabase } = require('./db.cjs');
const { TIERS, getLicense, verifySignedLicense } = require('./license.cjs');
const { createAuthToken, verifyAuthToken } = require('./auth.cjs');

const ALLOWED_WIDGETS = new Set(['clock', 'date', 'calendar', 'weather', 'announcement', 'photo', 'notes']);
const safeName = (value, fallback, max = 80) => String(value ?? '').trim().replace(/[\u0000-\u001f]/g, '').slice(0, max) || fallback;
const token = (bytes = 24) => crypto.randomBytes(bytes).toString('hex');
const isLoopback = (req) => {
  const remote = String(req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
  const host = String(req.hostname || '').toLowerCase();
  return ['127.0.0.1', '::1', 'localhost'].includes(remote) && ['127.0.0.1', 'localhost'].includes(host);
};
const json = (res, code, payload) => res.status(code).json(payload);

function defaultDataDir() {
  if (process.env.DATA_DIR) return path.resolve(process.env.DATA_DIR);
  if (process.env.MIRRORFORGE_DATA_DIR) return path.resolve(process.env.MIRRORFORGE_DATA_DIR);
  return path.join(os.homedir(), '.mirrorforge');
}

function parseBearer(req) {
  const value = req.headers.authorization || '';
  return value.startsWith('Bearer ') ? value.slice(7) : null;
}

function createApp(options = {}) {
  const dataDir = path.resolve(options.dataDir || defaultDataDir());
  const store = openDatabase(dataDir);
  const db = store.db;
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', process.env.TRUST_PROXY === '1' ? 1 : false);
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'", 'https://api.open-meteo.com'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'self'"]
      }
    },
    crossOriginEmbedderPolicy: false
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  const staticDir = path.join(__dirname, '..', 'public');
  const mediaDir = path.join(dataDir, 'media');
  fs.mkdirSync(mediaDir, { recursive: true });
  app.use('/media', express.static(mediaDir, { maxAge: '1d', fallthrough: false, index: false }));
  app.use(express.static(staticDir, { index: 'index.html', etag: true, maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0 }));

  const authSecret = store.getSetting('auth_secret');
  function auth(req, res, next) {
    const rawToken = req.cookies?.mirrorforge_session || parseBearer(req);
    const session = verifyAuthToken(rawToken, authSecret);
    if (!session) return json(res, 401, { error: 'Authentication required.' });
    const user = db.prepare('SELECT id, username FROM users WHERE id=?').get(session.sub);
    if (!user) return json(res, 401, { error: 'Session user was not found.' });
    req.user = user;
    next();
  }
  const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many login attempts. Try again in 15 minutes.' } });
  const setupComplete = () => Boolean(db.prepare('SELECT id FROM users LIMIT 1').get());
  const publicAppUrl = (req) => `${req.protocol}://${req.get('host')}`;
  const screenById = (id) => db.prepare('SELECT * FROM screens WHERE id=?').get(Number(id));
  const listWidgets = (screenId) => db.prepare('SELECT * FROM widgets WHERE screen_id=? ORDER BY grid_y, grid_x, id').all(screenId).map(mapWidget);
  const mapWidget = (w) => ({ id: w.id, screenId: w.screen_id, type: w.type, title: w.title, config: safeJson(w.config_json), grid: { x: w.grid_x, y: w.grid_y, w: w.grid_w, h: w.grid_h } });
  const mapScreen = (s, includeWidgets = true) => ({ id: s.id, name: s.name, description: s.description, createdAt: s.created_at, updatedAt: s.updated_at, publicToken: s.public_token, displayUrl: `/display/${s.public_token}`, ...(includeWidgets ? { widgets: listWidgets(s.id) } : {}) });
  const currentLicense = () => getLicense(db);
  const refreshStoredLicense = async () => {
    const record = db.prepare('SELECT payload_json FROM active_license WHERE id=1').get();
    const baseUrl = String(store.getSetting('license_api_url') || process.env.LICENSE_API_URL || '').replace(/\/$/, '');
    if (!record || !baseUrl) return;
    let payload;
    try { payload = JSON.parse(record.payload_json); } catch { return; }
    if (!payload.licenseId) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(`${baseUrl}/v1/validate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ licenseId: payload.licenseId, deviceId: store.installationId(), product: 'mirrorforge' }), signal: controller.signal });
      const data = await response.json().catch(() => ({}));
      if (response.ok && verifySignedLicense(data.payload, data.signature) && data.payload.deviceId === store.installationId() && data.payload.licenseId === payload.licenseId && TIERS[String(data.payload.tier || '').toLowerCase()] && data.payload.product === 'mirrorforge') {
        db.prepare('UPDATE active_license SET payload_json=?,signature=?,activated_at=CURRENT_TIMESTAMP WHERE id=1').run(JSON.stringify(data.payload), data.signature);
      } else if (response.status === 403 || response.status === 404) {
        db.prepare('DELETE FROM active_license WHERE id=1').run();
      }
    } catch { /* retain the signed licence for its configured offline grace period */ }
    finally { clearTimeout(timeout); }
  };
  const licenseRefreshTimer = setInterval(refreshStoredLicense, 6 * 60 * 60 * 1000);
  if (typeof licenseRefreshTimer.unref === 'function') licenseRefreshTimer.unref();
  queueMicrotask(() => refreshStoredLicense().catch(() => {}));
  const maxWidgetsForScreen = () => currentLicense().maxWidgetsPerScreen;
  const createWidget = db.prepare('INSERT INTO widgets(screen_id,type,title,config_json,grid_x,grid_y,grid_w,grid_h) VALUES (?,?,?,?,?,?,?,?)');

  app.get('/api/health', (req, res) => json(res, 200, { ok: true, product: 'MirrorForge', version: '1.0.0', timestamp: new Date().toISOString() }));
  app.get('/api/setup/status', (req, res) => json(res, 200, { setupComplete: setupComplete() }));
  app.post('/api/setup', async (req, res) => {
    if (setupComplete()) return json(res, 409, { error: 'Initial setup has already been completed.' });
    if (!isLoopback(req)) return json(res, 403, { error: 'Initial setup is only available from the PC running MirrorForge. Open http://127.0.0.1:4173 on that PC.' });
    const username = safeName(req.body?.username, '', 40).toLowerCase();
    const password = String(req.body?.password || '');
    if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username)) return json(res, 400, { error: 'Username must be 3–40 characters and use letters, numbers, dot, underscore or hyphen.' });
    if (password.length < 12 || password.length > 200) return json(res, 400, { error: 'Use a password between 12 and 200 characters.' });
    const tx = db.transaction(() => {
      const result = db.prepare('INSERT INTO users(username,password_hash) VALUES (?,?)').run(username, bcrypt.hashSync(password, 12));
      const screen = db.prepare('INSERT INTO screens(name,description,public_token) VALUES (?,?,?)').run('Home Mirror', 'Your first dashboard screen', token(24));
      const screenId = Number(screen.lastInsertRowid);
      createWidget.run(screenId, 'clock', 'Current Time', '{}', 1, 1, 6, 2);
      createWidget.run(screenId, 'date', 'Today', '{}', 7, 1, 6, 2);
      createWidget.run(screenId, 'calendar', 'Upcoming', '{}', 1, 3, 6, 3);
      createWidget.run(screenId, 'announcement', 'Welcome', JSON.stringify({ text: 'Welcome to MirrorForge. Edit this widget to add your message.' }), 7, 3, 6, 3);
      return Number(result.lastInsertRowid);
    });
    try {
      const id = tx();
      const session = createAuthToken(id, authSecret);
      res.cookie('mirrorforge_session', session, { httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: 7 * 24 * 60 * 60 * 1000, path: '/' });
      return json(res, 201, { ok: true, user: { id, username }, message: 'Setup complete.' });
    } catch (err) {
      return json(res, 500, { error: err.code === 'SQLITE_CONSTRAINT_UNIQUE' ? 'That username is already taken.' : 'Setup could not be completed.' });
    }
  });
  app.post('/api/auth/login', loginLimiter, async (req, res) => {
    const username = safeName(req.body?.username, '', 40).toLowerCase();
    const password = String(req.body?.password || '');
    const user = db.prepare('SELECT id,username,password_hash FROM users WHERE username=?').get(username);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) return json(res, 401, { error: 'Incorrect username or password.' });
    const session = createAuthToken(user.id, authSecret);
    res.cookie('mirrorforge_session', session, { httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: 7 * 24 * 60 * 60 * 1000, path: '/' });
    return json(res, 200, { ok: true, user: { id: user.id, username: user.username } });
  });
  app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('mirrorforge_session', { httpOnly: true, sameSite: 'lax', secure: req.secure, path: '/' });
    return json(res, 200, { ok: true });
  });
  app.get('/api/auth/me', auth, (req, res) => json(res, 200, { user: req.user }));

  app.get('/api/dashboard/summary', auth, (req, res) => {
    const license = currentLicense();
    json(res, 200, {
      screens: db.prepare('SELECT COUNT(*) AS count FROM screens').get().count,
      widgets: db.prepare('SELECT COUNT(*) AS count FROM widgets').get().count,
      devices: db.prepare('SELECT COUNT(*) AS count FROM devices').get().count,
      license: { tier: license.tier, status: license.status, name: license.name }
    });
  });
  app.get('/api/screens', auth, (req, res) => json(res, 200, { screens: db.prepare('SELECT * FROM screens ORDER BY id DESC').all().map((s) => mapScreen(s)) }));
  app.post('/api/screens', auth, (req, res) => {
    const license = currentLicense();
    const current = db.prepare('SELECT COUNT(*) AS count FROM screens').get().count;
    if (current >= license.maxScreens) return json(res, 402, { error: `${license.name} tier supports up to ${license.maxScreens} screens. Activate another tier to increase this limit.` });
    const name = safeName(req.body?.name, 'New Screen');
    const description = safeName(req.body?.description, '', 250);
    const result = db.prepare('INSERT INTO screens(name,description,public_token) VALUES (?,?,?)').run(name, description, token(24));
    return json(res, 201, { screen: mapScreen(screenById(result.lastInsertRowid)) });
  });
  app.patch('/api/screens/:id', auth, (req, res) => {
    const screen = screenById(req.params.id);
    if (!screen) return json(res, 404, { error: 'Screen not found.' });
    const name = safeName(req.body?.name, screen.name);
    const description = safeName(req.body?.description, screen.description, 250);
    db.prepare('UPDATE screens SET name=?,description=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(name, description, screen.id);
    return json(res, 200, { screen: mapScreen(screenById(screen.id)) });
  });
  app.delete('/api/screens/:id', auth, (req, res) => {
    const screen = screenById(req.params.id);
    if (!screen) return json(res, 404, { error: 'Screen not found.' });
    db.prepare('DELETE FROM screens WHERE id=?').run(screen.id);
    return json(res, 200, { ok: true });
  });
  app.post('/api/screens/:id/widgets', auth, (req, res) => {
    const screen = screenById(req.params.id);
    if (!screen) return json(res, 404, { error: 'Screen not found.' });
    const count = db.prepare('SELECT COUNT(*) AS count FROM widgets WHERE screen_id=?').get(screen.id).count;
    if (count >= maxWidgetsForScreen()) return json(res, 402, { error: `${currentLicense().name} tier supports ${maxWidgetsForScreen()} widgets per screen.` });
    const type = String(req.body?.type || 'clock').toLowerCase();
    if (!ALLOWED_WIDGETS.has(type)) return json(res, 400, { error: 'Unsupported widget type.' });
    const title = safeName(req.body?.title, type[0].toUpperCase() + type.slice(1), 80);
    let config = req.body?.config;
    if (!config || typeof config !== 'object' || Array.isArray(config)) config = {};
    const configText = JSON.stringify(config).slice(0, 20000);
    const result = createWidget.run(screen.id, type, title, configText, 1 + ((count % 2) * 6), 1 + Math.floor(count / 2) * 2, 6, type === 'calendar' ? 3 : 2);
    db.prepare('UPDATE screens SET updated_at=CURRENT_TIMESTAMP WHERE id=?').run(screen.id);
    const widget = db.prepare('SELECT * FROM widgets WHERE id=?').get(result.lastInsertRowid);
    return json(res, 201, { widget: mapWidget(widget) });
  });
  app.patch('/api/widgets/:id', auth, (req, res) => {
    const widget = db.prepare('SELECT * FROM widgets WHERE id=?').get(Number(req.params.id));
    if (!widget) return json(res, 404, { error: 'Widget not found.' });
    const title = safeName(req.body?.title, widget.title, 80);
    let config = req.body?.config;
    if (config === undefined) config = safeJson(widget.config_json);
    if (!config || typeof config !== 'object' || Array.isArray(config)) return json(res, 400, { error: 'Widget config must be a JSON object.' });
    const configText = JSON.stringify(config);
    if (configText.length > 20000) return json(res, 413, { error: 'Widget config is too large.' });
    const grid = req.body?.grid || {};
    const clamp = (v, min, max, fallback) => Number.isInteger(Number(v)) && Number(v) >= min && Number(v) <= max ? Number(v) : fallback;
    db.prepare('UPDATE widgets SET title=?,config_json=?,grid_x=?,grid_y=?,grid_w=?,grid_h=? WHERE id=?').run(title, configText,
      clamp(grid.x, 1, 12, widget.grid_x), clamp(grid.y, 1, 24, widget.grid_y), clamp(grid.w, 1, 12, widget.grid_w), clamp(grid.h, 1, 8, widget.grid_h), widget.id);
    db.prepare('UPDATE screens SET updated_at=CURRENT_TIMESTAMP WHERE id=?').run(widget.screen_id);
    return json(res, 200, { widget: mapWidget(db.prepare('SELECT * FROM widgets WHERE id=?').get(widget.id)) });
  });
  app.delete('/api/widgets/:id', auth, (req, res) => {
    const widget = db.prepare('SELECT * FROM widgets WHERE id=?').get(Number(req.params.id));
    if (!widget) return json(res, 404, { error: 'Widget not found.' });
    db.prepare('DELETE FROM widgets WHERE id=?').run(widget.id);
    return json(res, 200, { ok: true });
  });

  app.get('/api/devices', auth, (req, res) => {
    const devices = db.prepare(`SELECT d.*, s.name AS screen_name FROM devices d JOIN screens s ON s.id=d.screen_id ORDER BY d.id DESC`).all().map((d) => ({
      id: d.id, name: d.name, screenId: d.screen_id, screenName: d.screen_name, lastSeenAt: d.last_seen_at, createdAt: d.created_at, displayUrl: `/display/${d.device_token}`
    }));
    json(res, 200, { devices });
  });
  app.post('/api/devices', auth, (req, res) => {
    const name = safeName(req.body?.name, 'Display device');
    const screenId = Number(req.body?.screenId);
    if (!screenById(screenId)) return json(res, 400, { error: 'Select a valid screen.' });
    const license = currentLicense();
    const count = db.prepare('SELECT COUNT(*) AS count FROM devices').get().count;
    if (count >= license.maxDevices) return json(res, 402, { error: `${license.name} tier supports up to ${license.maxDevices} registered display devices.` });
    const result = db.prepare('INSERT INTO devices(name,screen_id,device_token) VALUES (?,?,?)').run(name, screenId, token(24));
    const device = db.prepare('SELECT d.*,s.name AS screen_name FROM devices d JOIN screens s ON s.id=d.screen_id WHERE d.id=?').get(result.lastInsertRowid);
    json(res, 201, { device: { id: device.id, name: device.name, screenId: device.screen_id, screenName: device.screen_name, displayUrl: `/display/${device.device_token}` } });
  });
  app.delete('/api/devices/:id', auth, (req, res) => {
    const result = db.prepare('DELETE FROM devices WHERE id=?').run(Number(req.params.id));
    if (!result.changes) return json(res, 404, { error: 'Device not found.' });
    json(res, 200, { ok: true });
  });

  app.get('/api/license', auth, (req, res) => json(res, 200, { license: currentLicense(), activationConfigured: Boolean(store.getSetting('license_api_url') || process.env.LICENSE_API_URL), issuerUrl: store.getSetting('license_api_url') || process.env.LICENSE_API_URL || 'http://127.0.0.1:4180' }));
  app.patch('/api/license/config', auth, (req, res) => {
    const candidate = String(req.body?.issuerUrl || '').trim();
    if (!candidate || candidate.length > 500) return json(res, 400, { error: 'Enter the license issuer URL.' });
    let parsed;
    try { parsed = new URL(candidate); } catch { return json(res, 400, { error: 'License issuer URL is not valid.' }); }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return json(res, 400, { error: 'Issuer URL must use HTTP or HTTPS and must not contain credentials.' });
    store.setSetting('license_api_url', parsed.toString().replace(/\/$/, ''));
    json(res, 200, { ok: true, issuerUrl: store.getSetting('license_api_url') });
  });
  app.post('/api/license/activate', auth, async (req, res) => {
    const licenseKey = String(req.body?.licenseKey || '').trim();
    if (!licenseKey || licenseKey.length > 100) return json(res, 400, { error: 'Enter a valid licence key.' });
    const baseUrl = String(store.getSetting('license_api_url') || process.env.LICENSE_API_URL || '').replace(/\/$/, '');
    if (!baseUrl) return json(res, 503, { error: 'The licence issuer URL is not configured. Save it in Licence & plans.' });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`${baseUrl}/v1/activate`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ licenseKey, deviceId: store.installationId(), product: 'mirrorforge' }), signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return json(res, response.status, { error: data.error || 'Activation failed.' });
      if (!verifySignedLicense(data.payload, data.signature)) return json(res, 502, { error: 'The licence issuer returned an invalid signature. No licence was saved.' });
      if (data.payload.deviceId !== store.installationId() || data.payload.product !== 'mirrorforge') return json(res, 502, { error: 'The licence was issued for a different product or installation.' });
      db.prepare('INSERT INTO active_license(id,payload_json,signature) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET payload_json=excluded.payload_json, signature=excluded.signature, activated_at=CURRENT_TIMESTAMP').run(JSON.stringify(data.payload), data.signature);
      json(res, 200, { ok: true, license: currentLicense() });
    } catch (err) {
      json(res, 502, { error: err.name === 'AbortError' ? 'Licence issuer timed out.' : 'Could not reach the licence issuer. Check its URL and connection.' });
    } finally { clearTimeout(timeout); }
  });
  app.post('/api/license/deactivate', auth, async (req, res) => {
    const row = db.prepare('SELECT payload_json FROM active_license WHERE id=1').get();
    if (!row) return json(res, 200, { ok: true, seatReleased: true, license: currentLicense() });
    let payload;
    try { payload = JSON.parse(row.payload_json); } catch { payload = {}; }
    const baseUrl = String(store.getSetting('license_api_url') || process.env.LICENSE_API_URL || '').replace(/\/$/, '');
    let seatReleased = false;
    if (baseUrl && payload.licenseId) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch(`${baseUrl}/v1/deactivate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ licenseId: payload.licenseId, deviceId: store.installationId(), product: 'mirrorforge' }), signal: controller.signal });
        if (!response.ok && response.status !== 404) return json(res, 502, { error: 'The issuer could not release this activation. The local licence was kept so you can retry.' });
        seatReleased = true;
      } catch {
        return json(res, 502, { error: 'Could not reach the issuer. The local licence was kept so you can retry deactivation while online.' });
      } finally { clearTimeout(timeout); }
    }
    db.prepare('DELETE FROM active_license WHERE id=1').run();
    json(res, 200, { ok: true, seatReleased, license: currentLicense(), message: seatReleased ? 'Licence deactivated and activation seat released.' : 'Local licence removed; the issuer was not configured, so a remote activation seat may remain reserved.' });
  });

  const weatherLimiter = rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false });
  app.get('/api/weather', weatherLimiter, async (req, res) => {
    const latitude = Number(req.query.latitude);
    const longitude = Number(req.query.longitude);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return json(res, 400, { error: 'Valid latitude and longitude are required.' });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const url = new URL('https://api.open-meteo.com/v1/forecast');
      url.searchParams.set('latitude', latitude); url.searchParams.set('longitude', longitude);
      url.searchParams.set('current', 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m');
      url.searchParams.set('timezone', 'auto');
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) return json(res, 502, { error: 'Weather provider is temporarily unavailable.' });
      const data = await response.json();
      return json(res, 200, { current: data.current, timezone: data.timezone, units: data.current_units });
    } catch {
      return json(res, 502, { error: 'Weather data could not be fetched. Check the server internet connection.' });
    } finally { clearTimeout(timeout); }
  });

  app.get('/api/public/screens/:token', (req, res) => {
    const value = String(req.params.token || '');
    const device = db.prepare('SELECT * FROM devices WHERE device_token=?').get(value);
    let screen;
    if (device) {
      db.prepare('UPDATE devices SET last_seen_at=CURRENT_TIMESTAMP WHERE id=?').run(device.id);
      screen = screenById(device.screen_id);
    } else {
      screen = db.prepare('SELECT * FROM screens WHERE public_token=?').get(value);
    }
    if (!screen) return json(res, 404, { error: 'Display link is invalid or has been revoked.' });
    json(res, 200, { screen: { id: screen.id, name: screen.name, description: screen.description, widgets: listWidgets(screen.id) } });
  });

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, mediaDir),
    filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}.${({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' })[file.mimetype] || 'bin'}`)
  });
  const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024, files: 1 }, fileFilter: (req, file, cb) => {
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype)) return cb(new Error('Only JPG, PNG, WEBP and GIF images are allowed.'));
    cb(null, true);
  } });
  app.post('/api/media', auth, (req, res, next) => upload.single('image')(req, res, (err) => {
    if (err) return json(res, err.code === 'LIMIT_FILE_SIZE' ? 413 : 400, { error: err.message || 'Image upload failed.' });
    next();
  }), (req, res) => {
    if (!req.file) return json(res, 400, { error: 'Choose an image file.' });
    json(res, 201, { url: `/media/${req.file.filename}`, filename: req.file.filename, size: req.file.size });
  });

  app.get('/display/:token', (req, res) => res.sendFile(path.join(staticDir, 'display.html')));
  app.get('/api/admin/system', auth, (req, res) => json(res, 200, {
    version: '1.0.0', host: process.env.HOST || '0.0.0.0', port: Number(process.env.PORT || 4173), dataDir,
    addresses: Object.values(os.networkInterfaces()).flat().filter((n) => n && n.family === 'IPv4' && !n.internal).map((n) => n.address)
  }));

  app.use((req, res) => json(res, 404, { error: 'Not found.' }));
  app.use((err, req, res, next) => {
    console.error('[MirrorForge]', err?.stack || err);
    if (res.headersSent) return next(err);
    json(res, 500, { error: 'Unexpected server error.' });
  });
  app.locals.store = store;
  app.locals.close = () => { clearInterval(licenseRefreshTimer); db.close(); };
  return app;
}

async function startServer(options = {}) {
  const host = options.host || process.env.HOST || '0.0.0.0';
  const startPort = Number(options.port ?? process.env.PORT ?? 4173);
  const app = createApp(options);
  let lastError;
  for (let port = startPort; port < startPort + 15; port++) {
    try {
      const server = await new Promise((resolve, reject) => {
        const instance = app.listen(port, host, () => resolve(instance));
        instance.once('error', reject);
      });
      server.on('close', () => { try { app.locals.close(); } catch {} });
      return { app, server, host, port: server.address().port, dataDir: path.resolve(options.dataDir || defaultDataDir()) };
    } catch (err) {
      lastError = err;
      if (err.code !== 'EADDRINUSE') break;
    }
  }
  try { app.locals.close(); } catch {}
  throw lastError || new Error('Could not start MirrorForge server.');
}

if (require.main === module) {
  startServer().then(({ host, port, dataDir }) => {
    console.log(`MirrorForge v1.0.0 server running at http://127.0.0.1:${port}`);
    console.log(`Listen address: ${host}:${port}`);
    console.log(`Data directory: ${dataDir}`);
    console.log('Complete first-run setup locally on the server PC before exposing this service to your network.');
  }).catch((err) => { console.error('MirrorForge failed to start:', err.message); process.exit(1); });
}

module.exports = { createApp, startServer, defaultDataDir };

function safeJson(text) { try { return JSON.parse(text || '{}'); } catch { return {}; } }
