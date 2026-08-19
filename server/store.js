import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { migrateMenuOwnership } from './menus.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const dbFile = path.join(dataDir, 'db.json');
const BLOB_PATHNAME = 'kaifan-db.json';

const empty = () => ({ users: [], groups: [] });

// ── Vercel Blob ──────────────────────────────────────────────────────────────

function hasBlobToken() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

async function blobLoad() {
  const { list, head } = await import('@vercel/blob');
  const { blobs } = await list({ prefix: BLOB_PATHNAME });
  if (!blobs.length) return null;
  const url = blobs[0].url;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

async function blobSave(data) {
  const { put } = await import('@vercel/blob');
  await put(BLOB_PATHNAME, JSON.stringify(data), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

// ── Local file ───────────────────────────────────────────────────────────────

function ensureFile() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dbFile)) fs.writeFileSync(dbFile, JSON.stringify(empty(), null, 2));
}

function loadFile() {
  ensureFile();
  try {
    return JSON.parse(fs.readFileSync(dbFile, 'utf8'));
  } catch {
    return empty();
  }
}

function saveFile(data) {
  ensureFile();
  const tmp = `${dbFile}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, dbFile);
}

// ── Unified load / save ──────────────────────────────────────────────────────

let fileCache = null;

async function load() {
  if (hasBlobToken()) {
    const data = (await blobLoad()) || empty();
    if (migrateMenuOwnership(data)) await blobSave(data);
    return data;
  }
  if (!fileCache) {
    fileCache = loadFile();
    if (migrateMenuOwnership(fileCache)) saveFile(fileCache);
  }
  return fileCache;
}

async function save(data) {
  if (hasBlobToken()) {
    await blobSave(data);
    return;
  }
  fileCache = data;
  saveFile(data);
}

// ── Public API ───────────────────────────────────────────────────────────────

export const db = {
  async read() {
    return load();
  },
  async write(mutator) {
    const data = await load();
    mutator(data);
    await save(data);
    return data;
  },
  storageType() {
    return hasBlobToken() ? 'blob' : 'file';
  },
};
