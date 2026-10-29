'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const TIERS = {
  free: { name: 'Free', maxScreens: 2, maxWidgetsPerScreen: 10, maxDevices: 3, features: ['clock', 'date', 'calendar', 'weather', 'announcement', 'photo', 'notes'] },
  home: { name: 'Home', maxScreens: 5, maxWidgetsPerScreen: 24, maxDevices: 10, features: ['clock', 'date', 'calendar', 'weather', 'announcement', 'photo', 'notes'] },
  pro: { name: 'Pro', maxScreens: 20, maxWidgetsPerScreen: 50, maxDevices: 50, features: ['clock', 'date', 'calendar', 'weather', 'announcement', 'photo', 'notes'] },
  commercial: { name: 'Commercial', maxScreens: 100, maxWidgetsPerScreen: 100, maxDevices: 250, features: ['clock', 'date', 'calendar', 'weather', 'announcement', 'photo', 'notes'] }
};

function readPublicKey() {
  const keyPath = path.join(__dirname, '..', 'config', 'license-public-key.pem');
  try {
    const pem = fs.readFileSync(keyPath, 'utf8').trim();
    if (!pem || pem.includes('REPLACE_WITH')) return null;
    return crypto.createPublicKey(pem);
  } catch { return null; }
}

function verifySignedLicense(payload, signature) {
  if (!payload || typeof payload !== 'object' || typeof signature !== 'string') return false;
  const publicKey = readPublicKey();
  if (!publicKey) return false;
  try {
    return crypto.verify(null, Buffer.from(JSON.stringify(payload)), publicKey, Buffer.from(signature, 'base64'));
  } catch { return false; }
}

function getLicense(db) {
  const row = db.prepare('SELECT payload_json, signature, activated_at FROM active_license WHERE id=1').get();
  if (!row) return { tier: 'free', status: 'free', ...TIERS.free, expiresAt: null, customer: null };
  let payload;
  try { payload = JSON.parse(row.payload_json); } catch { return { tier: 'free', status: 'invalid', ...TIERS.free, expiresAt: null, customer: null }; }
  if (!verifySignedLicense(payload, row.signature)) return { tier: 'free', status: 'invalid', ...TIERS.free, expiresAt: null, customer: null };
  if (payload.product !== 'mirrorforge' || payload.deviceId !== db.prepare("SELECT value FROM settings WHERE key='installation_id'").get()?.value) {
    return { tier: 'free', status: 'invalid', ...TIERS.free, expiresAt: null, customer: null };
  }
  if (payload.expiresAt && Date.parse(payload.expiresAt) <= Date.now()) {
    return { tier: 'free', status: 'expired', ...TIERS.free, expiresAt: payload.expiresAt, customer: payload.customer || null };
  }
  const lastValidated = Date.parse(String(row.activated_at || '').replace(' ', 'T') + (String(row.activated_at || '').includes('Z') ? '' : 'Z'));
  const graceMs = Math.max(1, Math.min(30, Number(payload.offlineGraceDays) || 7)) * 24 * 60 * 60 * 1000;
  if (!Number.isFinite(lastValidated) || Date.now() - lastValidated > graceMs) {
    return { tier: 'free', status: 'offline-grace-expired', ...TIERS.free, expiresAt: payload.expiresAt || null, customer: payload.customer || null };
  }
  const tier = String(payload.tier || '').toLowerCase();
  if (!TIERS[tier] || tier === 'free') return { tier: 'free', status: 'invalid', ...TIERS.free, expiresAt: null, customer: null };
  return { tier, status: 'active', ...TIERS[tier], expiresAt: payload.expiresAt || null, customer: payload.customer || null, licenseId: payload.licenseId || null, activatedAt: row.activated_at };
}

function requireTierFeature(license, feature) {
  return license.features.includes(feature);
}
module.exports = { TIERS, getLicense, verifySignedLicense, requireTierFeature };
