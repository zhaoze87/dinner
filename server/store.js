import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { migrateMenuOwnership } from './menus.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const dbFile = path.join(dataDir, 'db.json');
const BLOB_PATHNAME = 'kaifan-db.json';

const empty = () => ({ users: [], groups: [] });

// ── Vercel Blob ───────────────────────────────────────────────────────────────

function hasBlobToken() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

async function blobLoad() {
  const { get } = await import('@vercel/blob');

  try {
    const result = await get(BLOB_PATHNAME, { access: 'private', useCache: false });
    if (!result || result.statusCode === 404) return null;
    // Collect stream into text
    const chunks = [];
    const reader = result.stream.getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (value) chunks.push(Buffer.from(value));
      if (done) break;
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return null;
  }
}

async function blobSave(data) {
  const { put } = await import('@vercel/blob');
  await put(BLOB_PATHNAME, JSON.stringify(data), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

// ── Local file ────────────────────────────────────────────────────────────────

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

// ── Unified load / save ───────────────────────────────────────────────────────

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

// ── Public API ────────────────────────────────────────────────────────────────

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
