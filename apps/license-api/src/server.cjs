'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const Database = require('better-sqlite3');
const { TIERS } = require('../../server/src/license.cjs');
const { constantTimeEqual, normalizeKey, hashKey, createLicenseKey, signPayload } = require('./crypto.cjs');

function resolvePath(value, fallback) { return path.resolve(value || fallback); }
function createLicenseApp(options = {}) {
  const dbPath = resolvePath(options.dbPath || process.env.LICENSE_DB_FILE, path.join(__dirname, '..', 'data', 'licenses.sqlite'));
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS licences (
      id TEXT PRIMARY KEY,
      key_hash TEXT NOT NULL UNIQUE,
      tier TEXT NOT NULL,
      customer TEXT NOT NULL DEFAULT '',
      max_activations INTEGER NOT NULL DEFAULT 1,
      expires_at TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      activated_devices_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } } }));
  app.use(express.json({ limit: '32kb' }));
  const privateKeyFile = resolvePath(process.env.LICENSE_PRIVATE_KEY_FILE, path.join(process.cwd(), 'secrets', 'license-private.pem'));
  const privateKeyText = options.privateKey || (() => { try { return fs.readFileSync(privateKeyFile, 'utf8'); } catch { return null; } })();
  const privateKey = privateKeyText ? crypto.createPrivateKey(privateKeyText) : null;
  const activationLimiter = rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false });
  const adminAuth = (req, res, next) => {
    const expected = process.env.LICENSE_ADMIN_TOKEN || '';
    const actual = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (expected.length < 24 || !constantTimeEqual(actual, expected)) return res.status(401).json({ error: 'Issuer administrator token is missing or invalid.' });
    next();
  };
  app.get('/health', (req, res) => res.json({ ok: true, service: 'MirrorForge License Issuer', version: '1.0.0', signingReady: Boolean(privateKey) }));
  app.post('/v1/admin/licenses', adminAuth, (req, res) => {
    const tier = String(req.body?.tier || '').toLowerCase();
    if (!['home', 'pro', 'commercial'].includes(tier)) return res.status(400).json({ error: 'Tier must be home, pro or commercial.' });
    const customer = String(req.body?.customer || '').trim().slice(0, 160);
    const maxActivations = Number(req.body?.maxActivations || 1);
    if (!Number.isInteger(maxActivations) || maxActivations < 1 || maxActivations > 500) return res.status(400).json({ error: 'maxActivations must be an integer from 1 to 500.' });
    if (req.body?.expiresAt && !Number.isFinite(Date.parse(req.body.expiresAt))) return res.status(400).json({ error: 'expiresAt must be a valid ISO date.' });
    const expiresAt = req.body?.expiresAt ? new Date(req.body.expiresAt).toISOString() : null;
    let licenseKey;
    let result;
    do {
      licenseKey = createLicenseKey();
      try {
        result = db.prepare('INSERT INTO licences(id,key_hash,tier,customer,max_activations,expires_at) VALUES (?,?,?,?,?,?)').run(crypto.randomUUID(), hashKey(licenseKey), tier, customer, maxActivations, expiresAt);
      } catch (err) { if (err.code !== 'SQLITE_CONSTRAINT_UNIQUE') throw err; }
    } while (!result);
    res.status(201).json({ id: db.prepare('SELECT id FROM licences WHERE key_hash=?').get(hashKey(licenseKey)).id, licenseKey, tier, customer, maxActivations, expiresAt, status: 'active', note: 'Store this key securely. The full key is not retrievable from the issuer after this response.' });
  });
  app.get('/v1/admin/licenses', adminAuth, (req, res) => {
    const rows = db.prepare('SELECT id,tier,customer,max_activations,expires_at,status,created_at,activated_devices_json FROM licences ORDER BY created_at DESC LIMIT 500').all();
    res.json({ licenses: rows.map((row) => ({ id: row.id, tier: row.tier, customer: row.customer, maxActivations: row.max_activations, expiresAt: row.expires_at, status: row.status, createdAt: row.created_at, activations: JSON.parse(row.activated_devices_json || '[]').length })) });
  });
  app.post('/v1/admin/licenses/:id/revoke', adminAuth, (req, res) => {
    const result = db.prepare("UPDATE licences SET status='revoked' WHERE id=?").run(String(req.params.id));
    if (!result.changes) return res.status(404).json({ error: 'License record not found.' });
    res.json({ ok: true, status: 'revoked' });
  });
  app.post('/v1/activate', activationLimiter, (req, res) => {
    if (!privateKey) return res.status(503).json({ error: `License signing key is not available. Configure LICENSE_PRIVATE_KEY_FILE (${privateKeyFile}).` });
    const normalized = normalizeKey(req.body?.licenseKey);
    const deviceId = String(req.body?.deviceId || '').trim();
    const product = String(req.body?.product || '');
    if (!normalized || normalized.length < 15 || normalized.length > 80) return res.status(400).json({ error: 'License key format is invalid.' });
    if (!/^[a-f0-9-]{20,80}$/i.test(deviceId)) return res.status(400).json({ error: 'Installation identifier is invalid.' });
    if (product !== 'mirrorforge') return res.status(400).json({ error: 'Product mismatch.' });
    const record = db.prepare('SELECT * FROM licences WHERE key_hash=?').get(hashKey(normalized));
    if (!record) return res.status(404).json({ error: 'License key was not found.' });
    if (record.status !== 'active') return res.status(403).json({ error: 'This license has been revoked or disabled.' });
    if (record.expires_at && Date.parse(record.expires_at) <= Date.now()) return res.status(403).json({ error: 'This license has expired.' });
    const devices = JSON.parse(record.activated_devices_json || '[]');
    if (!devices.some((d) => d.deviceId === deviceId)) {
      if (devices.length >= record.max_activations) return res.status(403).json({ error: `Activation limit reached (${record.max_activations}). Deactivate an existing installation or increase the license seat count.` });
      devices.push({ deviceId, activatedAt: new Date().toISOString() });
      db.prepare('UPDATE licences SET activated_devices_json=? WHERE id=?').run(JSON.stringify(devices), record.id);
    }
    const payload = {
      product: 'mirrorforge', licenseId: record.id, tier: record.tier, customer: record.customer,
      deviceId, issuedAt: new Date().toISOString(), expiresAt: record.expires_at,
      features: TIERS[record.tier].features, offlineGraceDays: 7
    };
    const signature = signPayload(payload, privateKey);
    res.json({ payload, signature });
  });
  app.post('/v1/deactivate', activationLimiter, (req, res) => {
    const licenseId = String(req.body?.licenseId || '').trim();
    const deviceId = String(req.body?.deviceId || '').trim();
    if (!licenseId || !/^[a-f0-9-]{20,80}$/i.test(deviceId) || String(req.body?.product || '') !== 'mirrorforge') return res.status(400).json({ error: 'License, installation or product identifier is invalid.' });
    const record = db.prepare('SELECT id,activated_devices_json FROM licences WHERE id=?').get(licenseId);
    if (!record) return res.status(404).json({ error: 'License record was not found.' });
    const devices = JSON.parse(record.activated_devices_json || '[]');
    const nextDevices = devices.filter((device) => device.deviceId !== deviceId);
    if (nextDevices.length !== devices.length) db.prepare('UPDATE licences SET activated_devices_json=? WHERE id=?').run(JSON.stringify(nextDevices), record.id);
    return res.json({ ok: true, seatReleased: nextDevices.length !== devices.length });
  });
  app.post('/v1/validate', activationLimiter, (req, res) => {
    if (!privateKey) return res.status(503).json({ error: 'Licence signing key is not available.' });
    const licenseId = String(req.body?.licenseId || '').trim();
    const deviceId = String(req.body?.deviceId || '').trim();
    if (!licenseId || !/^[a-f0-9-]{20,80}$/i.test(deviceId) || String(req.body?.product || '') !== 'mirrorforge') return res.status(400).json({ error: 'License, installation or product identifier is invalid.' });
    const record = db.prepare('SELECT * FROM licences WHERE id=?').get(licenseId);
    if (!record) return res.status(404).json({ error: 'License record was not found.' });
    if (record.status !== 'active') return res.status(403).json({ error: 'This license has been revoked or disabled.' });
    if (record.expires_at && Date.parse(record.expires_at) <= Date.now()) return res.status(403).json({ error: 'This license has expired.' });
    const devices = JSON.parse(record.activated_devices_json || '[]');
    if (!devices.some((d) => d.deviceId === deviceId)) return res.status(403).json({ error: 'This installation is not activated for this license.' });
    const payload = { product: 'mirrorforge', licenseId: record.id, tier: record.tier, customer: record.customer, deviceId, issuedAt: new Date().toISOString(), expiresAt: record.expires_at, features: TIERS[record.tier].features, offlineGraceDays: 7 };
    res.json({ payload, signature: signPayload(payload, privateKey) });
  });
  app.use((req, res) => res.status(404).json({ error: 'Not found.' }));
  app.locals.close = () => db.close();
  return app;
}
async function startLicenseServer(options = {}) {
  const host = options.host || process.env.LICENSE_API_HOST || '127.0.0.1';
  const port = Number(options.port ?? process.env.LICENSE_API_PORT ?? 4180);
  const app = createLicenseApp(options);
  const server = await new Promise((resolve, reject) => {
    const instance = app.listen(port, host, () => resolve(instance));
    instance.once('error', reject);
  });
  server.on('close', () => { try { app.locals.close(); } catch {} });
  return { app, server, host, port: server.address().port };
}
if (require.main === module) {
  startLicenseServer().then(({ host, port }) => console.log(`MirrorForge License Issuer listening at http://${host}:${port}`)).catch((err) => { console.error('License issuer failed:', err.message); process.exit(1); });
}
module.exports = { createLicenseApp, startLicenseServer, normalizeKey, hashKey, createLicenseKey };
