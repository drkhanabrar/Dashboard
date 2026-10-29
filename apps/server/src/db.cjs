'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');

function openDatabase(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'media'), { recursive: true });
  const db = new Database(path.join(dataDir, 'mirrorforge.sqlite'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS screens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      public_token TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS widgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      screen_id INTEGER NOT NULL REFERENCES screens(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      config_json TEXT NOT NULL DEFAULT '{}',
      grid_x INTEGER NOT NULL DEFAULT 1,
      grid_y INTEGER NOT NULL DEFAULT 1,
      grid_w INTEGER NOT NULL DEFAULT 6,
      grid_h INTEGER NOT NULL DEFAULT 2,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      screen_id INTEGER NOT NULL REFERENCES screens(id) ON DELETE CASCADE,
      device_token TEXT NOT NULL UNIQUE,
      last_seen_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS active_license (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      payload_json TEXT NOT NULL,
      signature TEXT NOT NULL,
      activated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  const getSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
  const putSetting = db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES (?,?)');
  putSetting.run('auth_secret', crypto.randomBytes(48).toString('base64url'));
  putSetting.run('installation_id', crypto.randomUUID());
  putSetting.run('instance_secret', crypto.randomBytes(32).toString('hex'));
  return {
    db,
    dataDir,
    getSetting(key) { return getSetting.get(key)?.value ?? null; },
    setSetting(key, value) { db.prepare('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, String(value)); },
    installationId() { return getSetting.get('installation_id')?.value; }
  };
}
module.exports = { openDatabase };
