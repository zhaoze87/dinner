import { v4 as uuid } from 'uuid';
import { db } from './store.js';
import { makeInviteCode, createStarterMenus } from './seed.js';
import {
  leaderMenus,
  seedLeaderMenus,
  parseMenuBody,
  applyMenuPatch,
} from './menus.js';
import { computeWeights, pickWeighted, localDate, WEIGHT_RULES } from './engine.js';
import {
  parseFeishuWebhook,
  parseShareOrigin,
  buildInviteUrl,
  maskWebhook,
  sendFeishuOpenTable,
  sendFeishuResult,
  sendFeishuFailed,
} from './feishu.js';

const PRESENCE_TTL = 30000;
const REVEAL_MS = 5200;

export async function findGroup(code) {
  const key = String(code || '').trim().toUpperCase();
  const data = await db.read();
  return data.groups.find((g) => g.code === key) || null;
}

export async function findUser(id) {
  const data = await db.read();
  return data.users.find((u) => u.id === id) || null;
}

export function requireLeader(group, userId) {
  return group && group.leaderId === userId;
}

export function memberOf(group, userId) {
  return group?.members.some((m) => m.userId === userId);
}

export function publicUser(user) {
  return { id: user.id, name: user.name, createdAt: user.createdAt };
}

export function getGroupMenus(data, group) {
  return leaderMenus(data, group.leaderId);
}

function ensurePresence(group) {
  if (!group.presence) group.presence = {};
}

function pushNotify(group, payload) {
  if (!group.notifies) group.notifies = [];
  const item = { id: uuid(), at: Date.now(), ...payload };
  group.notifies.push(item);
  if (group.notifies.length > 30) group.notifies = group.notifies.slice(-30);
  group.updatedAt = Date.now();
  return item;
}

function touchPresence(group, userId) {
  ensurePresence(group);
  group.presence[userId] = Date.now();
  group.updatedAt = Date.now();
}

function isOnline(group, userId) {
  ensurePresence(group);
  return Date.now() - (group.presence[userId] || 0) < PRESENCE_TTL;
}

export function resolveSessionTiming(group) {
  const session = group.session;
  if (!session || session.status !== 'revealing') return false;
  const revealAt = session.result?.revealAt;
  if (!revealAt || Date.now() < revealAt) return false;
  session.status = 'completed';
  const winner = session.result?.winner;
  pushNotify(group, {
    type: 'result',
    title: '今晚就它了',
    message: winner ? `${winner.emoji} ${winner.name}` : '出菜了',
  });
  group.updatedAt = Date.now();
  return true;
}

function publicWeightRows(menus, history) {
  // 对外不带投票加成，避免从权重变化反推个人选择
  return computeWeights(menus, [], history);
}

function redactResult(result, menus, history) {
  if (!result) return null;
  const { weights: _hidden, ...rest } = result;
  return { ...rest, weights: publicWeightRows(menus, history) };
}

export async function snapshot(group, viewerId = null) {
  await db.write((data) => {
    const g = data.groups.find((x) => x.id === group.id);
    if (g) resolveSessionTiming(g);
  });
  const fresh = await findGroup(group.code);
  const data = await db.read();
  const users = data.users;
  const session = fresh.session;
  const votes = session?.votes || [];
  const menus = getGroupMenus(data, fresh);
  const leader = users.find((u) => u.id === fresh.leaderId);
  const displayWeights = publicWeightRows(menus, fresh.history);
  const myVotes = viewerId ? votes.filter((v) => v.userId === viewerId) : [];
  return {
    id: fresh.id,
    code: fresh.code,
    name: fresh.name,
    leaderId: fresh.leaderId,
    leaderName: leader?.name || '团长',
    createdAt: fresh.createdAt,
    updatedAt: fresh.updatedAt || fresh.createdAt,
    members: fresh.members.map((m) => {
      const user = users.find((u) => u.id === m.userId);
      return {
        userId: m.userId,
        name: user?.name || '未知',
        joinedAt: m.joinedAt,
        isLeader: m.userId === fresh.leaderId,
        online: isOnline(fresh, m.userId),
      };
    }),
    menus,
    menuOwnerId: fresh.leaderId,
    history: [...fresh.history].sort((a, b) => b.at - a.at),
    session: session
      ? {
          id: session.id,
          status: session.status,
          startedAt: session.startedAt,
          startedBy: session.startedBy,
          // 只回自己的选票明细；他人仅知「谁已选」
          votes: myVotes,
          votedUserIds: votes.map((v) => v.userId),
          voteCount: votes.length,
          ready: session.ready,
          result: redactResult(session.result, menus, fresh.history),
          weights: displayWeights,
        }
      : null,
    weights: session ? undefined : displayWeights,
    rules: WEIGHT_RULES,
    today: localDate(),
    hasFeishuWebhook: Boolean(fresh.feishuWebhook),
    feishuWebhookMasked: viewerId === fresh.leaderId ? maskWebhook(fresh.feishuWebhook) : '',
  };
}

export async function groupsLedBy(leaderId) {
  const data = await db.read();
  return data.groups.filter((g) => g.leaderId === leaderId);
}

function purgeMemberFromSession(group, memberId) {
  if (!group.session) return;
  group.session.votes = group.session.votes.filter((v) => v.userId !== memberId);
  group.session.ready = group.session.ready.filter((id) => id !== memberId);
}

export async function kickMember(group, memberId) {
  if (memberId === group.leaderId) return { error: '不能剔除团长' };
  if (!memberOf(group, memberId)) return { error: '这个人不在本桌' };
  const target = await findUser(memberId);
  await db.write((data) => {
    const g = data.groups.find((x) => x.id === group.id);
    g.members = g.members.filter((m) => m.userId !== memberId);
    purgeMemberFromSession(g, memberId);
    pushNotify(g, {
      type: 'member-kick',
      title: '有人被请离本桌',
      message: target ? `${target.name} 被团长请走了` : '一名团员被请走了',
    });
    g.updatedAt = Date.now();
  });
  return { ok: true, target };
}

export async function createUser(name) {
  const data = await db.read();
  const matches = data.users.filter((u) => u.name === name);
  if (matches.length) {
    // 同名：优先菜单更丰富的；一样多时优先含「餐厅」分类（真实录入）的
    return matches.reduce((best, cur) => {
      const curN = cur.menus?.length || 0;
      const bestN = best.menus?.length || 0;
      if (curN !== bestN) return curN > bestN ? cur : best;
      const curReal = (cur.menus || []).some((m) => m.category === '餐厅');
      const bestReal = (best.menus || []).some((m) => m.category === '餐厅');
      if (curReal !== bestReal) return curReal ? cur : best;
      return (cur.createdAt || 0) >= (best.createdAt || 0) ? cur : best;
    });
  }
  const user = { id: uuid(), name, createdAt: Date.now(), menus: [] };
  await db.write((d) => d.users.push(user));
  return user;
}

export async function createGroup(userId, name) {
  const user = await findUser(userId);
  if (!user) return { error: '请先报上名号' };

  const led = await groupsLedBy(user.id);
  if (led.length) {
    const existing = led.sort(
      (a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt),
    )[0];
    const trimmed = String(name || '').trim().slice(0, 20);
    if (trimmed && trimmed !== existing.name) {
      await db.write((data) => {
        const g = data.groups.find((x) => x.id === existing.id);
        if (g) {
          g.name = trimmed;
          g.updatedAt = Date.now();
        }
      });
    }
    return { group: await findGroup(existing.code), reused: true };
  }

  let code = makeInviteCode();
  while (await findGroup(code)) code = makeInviteCode();
  const group = {
    id: uuid(),
    code,
    name: String(name || '').trim().slice(0, 20) || '今晚的饭局',
    leaderId: user.id,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    members: [{ userId: user.id, joinedAt: Date.now() }],
    history: [],
    session: null,
    notifies: [],
    presence: {},
    feishuWebhook: '',
    shareOrigin: '',
  };
  await db.write((data) => {
    const leader = data.users.find((u) => u.id === user.id);
    seedLeaderMenus(leader);
    data.groups.push(group);
  });
  return { group: await findGroup(code), reused: false };
}

export async function joinGroup(userId, code) {
  const user = await findUser(userId);
  const group = await findGroup(code);
  if (!user) return { error: '请先报上名号' };
  if (!group) return { error: '邀请码不对，这桌不存在' };
  let joined = false;
  await db.write((data) => {
    const g = data.groups.find((x) => x.code === group.code);
    if (!memberOf(g, user.id)) {
      g.members.push({ userId: user.id, joinedAt: Date.now() });
      joined = true;
      pushNotify(g, {
        type: 'member-join',
        title: '有人入座了',
        message: `${user.name} 拉开椅子坐下`,
      });
    }
    touchPresence(g, user.id);
  });
  return { group: await findGroup(code), joined };
}

export async function syncGroup(code, userId, since = 0) {
  const group = await findGroup(code);
  if (!group) return { error: '这桌已经散了' };
  if (!memberOf(group, userId)) return { error: '你不在本桌', kicked: true };
  let completedNow = false;
  await db.write((data) => {
    const g = data.groups.find((x) => x.code === group.code);
    completedNow = resolveSessionTiming(g);
    touchPresence(g, userId);
  });
  if (completedNow) await maybeNotifyFeishuOutcome(code);
  const fresh = await findGroup(code);
  if (!memberOf(fresh, userId)) {
    return { kicked: true, message: '你已被移出本桌' };
  }
  const notifies = (fresh.notifies || []).filter((n) => n.at > since);
  return { group: await snapshot(fresh, userId), notifies };
}

async function rememberShareOrigin(code, origin) {
  const shareOrigin = parseShareOrigin(origin);
  if (!shareOrigin) return '';
  await db.write((d) => {
    const g = d.groups.find((x) => x.code === String(code || '').toUpperCase());
    if (g) g.shareOrigin = shareOrigin;
  });
  return shareOrigin;
}

async function notifyGroupOpened(group, origin) {
  if (!group?.feishuWebhook) return { skipped: true };
  const shareOrigin = parseShareOrigin(origin) || group.shareOrigin || '';
  const leader = await findUser(group.leaderId);
  return sendFeishuOpenTable({
    webhook: group.feishuWebhook,
    groupName: group.name,
    leaderName: leader?.name || '团长',
    code: group.code,
    shareUrl: buildInviteUrl(shareOrigin, group.code),
  });
}

/** 出菜/失败结果只通知一次，避免多人轮询重复发飞书 */
async function maybeNotifyFeishuOutcome(code) {
  const group = await findGroup(code);
  if (!group?.feishuWebhook || !group.session) return { skipped: true };
  const { status, feishuResultSent } = group.session;
  if (feishuResultSent) return { skipped: true };
  if (status !== 'completed' && status !== 'failed') return { skipped: true };

  let payload = null;
  await db.write((d) => {
    const g = d.groups.find((x) => x.code === String(code || '').toUpperCase());
    if (!g?.feishuWebhook || !g.session || g.session.feishuResultSent) return;
    if (g.session.status === 'completed') {
      g.session.feishuResultSent = true;
      payload = {
        kind: 'result',
        webhook: g.feishuWebhook,
        groupName: g.name,
        winner: g.session.result?.winner || null,
        forced: Boolean(g.session.result?.forced),
      };
      pushNotify(g, {
        type: 'feishu',
        title: '结果已通知飞书群',
        message: g.session.result?.winner
          ? `${g.session.result.winner.emoji} ${g.session.result.winner.name}`
          : '今晚结果已发到飞书群',
      });
    } else if (g.session.status === 'failed') {
      g.session.feishuResultSent = true;
      payload = {
        kind: 'failed',
        webhook: g.feishuWebhook,
        groupName: g.name,
      };
      pushNotify(g, {
        type: 'feishu',
        title: '结果已通知飞书群',
        message: '开抽失败已发到飞书群',
      });
    }
  });
  if (!payload) return { skipped: true };
  if (payload.kind === 'result') {
    return sendFeishuResult({
      webhook: payload.webhook,
      groupName: payload.groupName,
      winner: payload.winner,
      forced: payload.forced,
    });
  }
  return sendFeishuFailed({
    webhook: payload.webhook,
    groupName: payload.groupName,
  });
}

export async function updateFeishuWebhook(code, userId, webhook, origin) {
  const group = await findGroup(code);
  if (!group || !requireLeader(group, userId)) return { error: '只有团长能设置飞书通知' };
  const parsed = parseFeishuWebhook(webhook);
  if (parsed.error) return { error: parsed.error };
  const shareOrigin = await rememberShareOrigin(group.code, origin);
  await db.write((d) => {
    const g = d.groups.find((x) => x.code === group.code);
    g.feishuWebhook = parsed.webhook;
    if (shareOrigin) g.shareOrigin = shareOrigin;
    g.updatedAt = Date.now();
  });
  return { group: await snapshot(await findGroup(group.code), userId) };
}

export async function notifyFeishu(code, userId, origin) {
  const group = await findGroup(code);
  if (!group || !requireLeader(group, userId)) return { error: '只有团长能发飞书通知' };
  if (!group.feishuWebhook) return { error: '还没设置飞书 Webhook' };
  await rememberShareOrigin(group.code, origin);
  const fresh = await findGroup(code);
  const sent = await notifyGroupOpened(fresh, origin);
  if (sent?.error) return { error: sent.error };
  await db.write((d) => {
    const g = d.groups.find((x) => x.code === fresh.code);
    pushNotify(g, {
      type: 'feishu',
      title: '已通知飞书群',
      message: '开桌链接已发到飞书群',
    });
  });
  return { ok: true, group: await snapshot(await findGroup(code), userId) };
}

export async function startSession(code, userId, origin) {
  const group = await findGroup(code);
  const user = await findUser(userId);
  if (!group || !requireLeader(group, userId)) return { error: '只有团长能发起点餐' };
  if (group.session && !['completed', 'failed'].includes(group.session.status)) {
    return { error: '这轮还没结束' };
  }
  const data = await db.read();
  if (getGroupMenus(data, group).length < 2) return { error: '至少先录入两道菜' };
  await rememberShareOrigin(group.code, origin);
  await db.write((d) => {
    const g = d.groups.find((x) => x.code === code);
    g.session = {
      id: uuid(),
      status: 'voting',
      startedAt: Date.now(),
      startedBy: userId,
      votes: [],
      ready: [],
      result: null,
    };
    pushNotify(g, {
      type: 'session-start',
      title: '开饭了',
      message: `${user.name} 敲了敲桌子：今晚吃啥，大家先点个心仪的。`,
    });
  });
  const fresh = await findGroup(code);
  const sent = await notifyGroupOpened(fresh, origin);
  if (sent?.ok) {
    await db.write((d) => {
      const g = d.groups.find((x) => x.code === fresh.code);
      pushNotify(g, {
        type: 'feishu',
        title: '已通知飞书群',
        message: '开桌链接已发到飞书群',
      });
    });
  }
  return { group: await snapshot(await findGroup(code), userId) };
}

export async function voteSession(code, userId, menuId) {
  const group = await findGroup(code);
  const user = await findUser(userId);
  if (!group?.session || group.session.status !== 'voting') return { error: '现在还不能投票' };
  const data = await db.read();
  const menu = getGroupMenus(data, group).find((m) => m.id === menuId);
  if (!menu) return { error: '这道菜不在菜单上' };
  await db.write((d) => {
    const g = d.groups.find((x) => x.code === code);
    g.session.votes = g.session.votes.filter((v) => v.userId !== userId);
    g.session.votes.push({ userId, menuId, at: Date.now() });
    pushNotify(g, {
      type: 'vote',
      title: '有人已选中',
      message: `${user.name} 已选中`,
    });
  });
  return { group: await snapshot(await findGroup(code), userId) };
}

export async function lockSession(code, userId) {
  const group = await findGroup(code);
  if (!group || !requireLeader(group, userId) || group.session?.status !== 'voting') {
    return { error: '现在不能开始随机' };
  }
  await db.write((d) => {
    const g = d.groups.find((x) => x.code === code);
    g.session.status = 'spinning';
    if (!g.session.ready.includes(userId)) g.session.ready.push(userId);
    pushNotify(g, {
      type: 'spin-open',
      title: '转盘打开了',
      message: '每人点一下「参与随机」，全员到齐后按权重开抽。',
    });
  });
  return { group: await snapshot(await findGroup(code), userId) };
}

async function drawNow(code, forced) {
  const group = await findGroup(code);
  const votes = group.session.votes;
  const data = await db.read();
  const menus = getGroupMenus(data, group);
  const weights = computeWeights(menus, votes, group.history);
  const picked = pickWeighted(weights);
  const winner = menus.find((m) => m.id === picked.winnerId) || null;

  if (!winner) {
    await db.write((d) => {
      const g = d.groups.find((x) => x.code === code);
      g.session.status = 'failed';
      g.session.result = {
        reason: 'no-eligible',
        forced,
        weights,
        at: Date.now(),
        duration: 0,
      };
      pushNotify(g, {
        type: 'failed',
        title: '今天菜单都吃过了',
        message: '同一天不会抽中同一道菜。换几道新菜，或明天再来。',
      });
    });
    return;
  }

  const record = {
    id: uuid(),
    sessionId: group.session.id,
    menuId: winner.id,
    name: winner.name,
    emoji: winner.emoji,
    at: Date.now(),
    date: localDate(),
    forced,
  };

  await db.write((d) => {
    const g = d.groups.find((x) => x.code === code);
    g.session.status = 'revealing';
    g.session.result = {
      winnerId: winner.id,
      winner,
      weights,
      forced,
      at: record.at,
      duration: REVEAL_MS,
      revealAt: Date.now() + REVEAL_MS,
    };
    g.history.push(record);
    pushNotify(g, {
      type: 'drawing',
      title: '转盘转起来了',
      message: forced ? '团长不等了，按现有权重开抽。' : '全员到齐，按权重随机出菜。',
    });
  });
}

export async function readySession(code, userId) {
  const group = await findGroup(code);
  const user = await findUser(userId);
  if (!group?.session || group.session.status !== 'spinning') return { error: '还没轮到随机' };
  await db.write((d) => {
    const g = d.groups.find((x) => x.code === code);
    if (!g.session.ready.includes(userId)) g.session.ready.push(userId);
    pushNotify(g, {
      type: 'ready',
      title: '有人按下转盘',
      message: `${user.name} 已参与随机`,
    });
  });
  const fresh = await findGroup(code);
  const memberIds = fresh.members.map((m) => m.userId);
  const allReady = memberIds.every((id) => fresh.session.ready.includes(id));
  if (allReady) {
    await drawNow(code, false);
    await maybeNotifyFeishuOutcome(code);
  }
  return { group: await snapshot(await findGroup(code), userId) };
}

export async function forceDrawSession(code, userId) {
  const group = await findGroup(code);
  if (!group || !requireLeader(group, userId) || group.session?.status !== 'spinning') {
    return { error: '现在不能强抽' };
  }
  await drawNow(code, true);
  await maybeNotifyFeishuOutcome(code);
  return { group: await snapshot(await findGroup(code), userId) };
}

export async function closeSession(code, userId) {
  const group = await findGroup(code);
  if (!group || !requireLeader(group, userId)) return { error: '只有团长能收桌' };
  if (!group.session || !['completed', 'failed'].includes(group.session.status)) {
    return { error: '这轮还没结束' };
  }
  await db.write((d) => {
    const g = d.groups.find((x) => x.code === code);
    g.session = null;
    g.updatedAt = Date.now();
  });
  return { group: await snapshot(await findGroup(code), userId) };
}

export async function addMenu(userId, body) {
  const user = await findUser(userId);
  const actor = await findUser(body?.userId);
  if (!user || actor?.id !== user.id) return { error: '只能管理自己的菜单' };
  const parsed = parseMenuBody(body);
  if (parsed.error) return { error: parsed.error };
  const menu = { id: uuid(), ...parsed.menu, createdAt: Date.now() };
  await db.write((data) => leaderMenus(data, user.id).push(menu));
  const groups = await groupsLedBy(user.id);
  return { menu, groups };
}

export async function updateMenu(userId, menuId, body) {
  const user = await findUser(userId);
  const actor = await findUser(body?.userId);
  if (!user || actor?.id !== user.id) return { error: '只能管理自己的菜单' };
  const data = await db.read();
  const menu = leaderMenus(data, user.id).find((m) => m.id === menuId);
  if (!menu) return { error: '这道菜不在菜单上' };
  await db.write(() => applyMenuPatch(menu, body));
  return { menu };
}

export async function deleteMenu(userId, menuId, actorId) {
  const user = await findUser(userId);
  const actor = await findUser(actorId);
  if (!user || actor?.id !== user.id) return { error: '只能管理自己的菜单' };
  await db.write((data) => {
    const owner = data.users.find((u) => u.id === user.id);
    owner.menus = leaderMenus(data, user.id).filter((m) => m.id !== menuId);
  });
  return { ok: true };
}

export { leaderMenus, parseMenuBody, seedLeaderMenus, createStarterMenus };
