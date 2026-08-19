import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { migrateMenuOwnership } from './menus.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const dbFile = path.join(dataDir, 'db.json');
const DB_KEY = 'kaifan:db';

const empty = () => ({
  users: [],
  groups: [],
});

function redisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

let redisClient;

async function getRedis() {
  if (redisClient) return redisClient;
  const config = redisConfig();
  if (!config) return null;
  const { Redis } = await import('@upstash/redis');
  redisClient = new Redis(config);
  return redisClient;
}

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

let fileCache = null;

async function load() {
  const redis = await getRedis();
  if (redis) {
    const data = (await redis.get(DB_KEY)) || empty();
    if (migrateMenuOwnership(data)) await save(data);
    return data;
  }
  if (!fileCache) {
    fileCache = loadFile();
    if (migrateMenuOwnership(fileCache)) saveFile(fileCache);
  }
  return fileCache;
}

async function save(data) {
  const redis = await getRedis();
  if (redis) {
    await redis.set(DB_KEY, data);
    return;
  }
  fileCache = data;
  saveFile(data);
}

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
  usesRedis() {
    return Boolean(redisConfig());
  },
};
