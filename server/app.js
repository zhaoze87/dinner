import express from 'express';
import cors from 'cors';
import { db } from './store.js';
import {
  findGroup,
  findUser,
  publicUser,
  snapshot,
  createUser,
  createGroup,
  joinGroup,
  syncGroup,
  kickMember,
  startSession,
  voteSession,
  lockSession,
  readySession,
  forceDrawSession,
  closeSession,
  addMenu,
  updateMenu,
  deleteMenu,
  leaderMenus,
} from './services.js';

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

function asyncRoute(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function fail(res, result, status = 400) {
  if (result?.error) return res.status(status).json({ error: result.error });
  return false;
}

app.get('/api/health', asyncRoute(async (_req, res) => {
  res.json({ ok: true, name: '开饭', storage: db.usesRedis() ? 'redis' : 'file' });
}));

app.post('/api/users', asyncRoute(async (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 12);
  if (!name) return res.status(400).json({ error: '请输入称呼' });
  const user = await createUser(name);
  res.json({ user: publicUser(user) });
}));

app.get('/api/users/:id', asyncRoute(async (req, res) => {
  const user = await findUser(req.params.id);
  if (!user) return res.status(404).json({ error: '找不到这个人' });
  res.json({ user: publicUser(user) });
}));

app.post('/api/groups', asyncRoute(async (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 20) || '今晚的饭局';
  const result = await createGroup(req.body?.userId, name);
  if (fail(res, result)) return;
  res.json({ group: await snapshot(result.group) });
}));

app.post('/api/groups/join', asyncRoute(async (req, res) => {
  const result = await joinGroup(req.body?.userId, req.body?.code);
  if (fail(res, result, result.error === '邀请码不对，这桌不存在' ? 404 : 400)) return;
  res.json({ group: await snapshot(result.group) });
}));

app.get('/api/groups/:code', asyncRoute(async (req, res) => {
  const group = await findGroup(req.params.code);
  if (!group) return res.status(404).json({ error: '这桌已经散了' });
  res.json({ group: await snapshot(group) });
}));

app.get('/api/groups/:code/sync', asyncRoute(async (req, res) => {
  const since = Number(req.query.since || 0);
  const result = await syncGroup(req.params.code, req.query.userId, since);
  if (result.kicked) {
    return res.json({ kicked: true, message: result.message || '你已被移出本桌' });
  }
  if (fail(res, result, result.error === '这桌已经散了' ? 404 : 400)) return;
  res.json(result);
}));

app.delete('/api/groups/:code/members/:memberId', asyncRoute(async (req, res) => {
  const group = await findGroup(req.params.code);
  const actor = await findUser(req.body?.userId || req.query.userId);
  if (!group || group.leaderId !== actor?.id) {
    return res.status(403).json({ error: '只有团长能剔除团员' });
  }
  const result = await kickMember(group, req.params.memberId);
  if (fail(res, result)) return;
  res.json({ ok: true, group: await snapshot(await findGroup(group.code)) });
}));

app.post('/api/groups/:code/session/start', asyncRoute(async (req, res) => {
  const result = await startSession(req.params.code, req.body?.userId);
  if (fail(res, result, result.error?.includes('团长') ? 403 : 400)) return;
  res.json(result);
}));

app.post('/api/groups/:code/session/vote', asyncRoute(async (req, res) => {
  const result = await voteSession(req.params.code, req.body?.userId, req.body?.menuId);
  if (fail(res, result)) return;
  res.json(result);
}));

app.post('/api/groups/:code/session/lock', asyncRoute(async (req, res) => {
  const result = await lockSession(req.params.code, req.body?.userId);
  if (fail(res, result, 403)) return;
  res.json(result);
}));

app.post('/api/groups/:code/session/ready', asyncRoute(async (req, res) => {
  const result = await readySession(req.params.code, req.body?.userId);
  if (fail(res, result)) return;
  res.json(result);
}));

app.post('/api/groups/:code/session/force-draw', asyncRoute(async (req, res) => {
  const result = await forceDrawSession(req.params.code, req.body?.userId);
  if (fail(res, result, 403)) return;
  res.json(result);
}));

app.post('/api/groups/:code/session/close', asyncRoute(async (req, res) => {
  const result = await closeSession(req.params.code, req.body?.userId);
  if (fail(res, result, 403)) return;
  res.json(result);
}));

app.get('/api/users/:id/menus', asyncRoute(async (req, res) => {
  const user = await findUser(req.params.id);
  if (!user) return res.status(404).json({ error: '找不到这个人' });
  const data = await db.read();
  res.json({ menus: leaderMenus(data, user.id), ownerId: user.id });
}));

app.post('/api/users/:id/menus', asyncRoute(async (req, res) => {
  const result = await addMenu(req.params.id, req.body);
  if (fail(res, result, 403)) return;
  res.json({ menu: result.menu });
}));

app.put('/api/users/:id/menus/:menuId', asyncRoute(async (req, res) => {
  const result = await updateMenu(req.params.id, req.params.menuId, req.body);
  if (fail(res, result, 403)) return;
  res.json({ menu: result.menu });
}));

app.delete('/api/users/:id/menus/:menuId', asyncRoute(async (req, res) => {
  const result = await deleteMenu(
    req.params.id,
    req.params.menuId,
    req.body?.userId || req.query.userId,
  );
  if (fail(res, result, 403)) return;
  res.json({ ok: true });
}));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: '服务器开小差了' });
});

export default app;
