import { api } from './api.js';

const POLL_MS = 2000;

export function startRoomSync({ code, userId, onGroup, onNotify, onKicked, onError }) {
  let since = Date.now();
  let alive = true;
  let timer;

  async function poll() {
    if (!alive) return;
    try {
      const data = await api(
        `/api/groups/${encodeURIComponent(code)}/sync?userId=${encodeURIComponent(userId)}&since=${since}`,
      );
      if (data.kicked) {
        onKicked?.({ message: data.message });
        stop();
        return;
      }
      if (data.group) onGroup?.(data.group);
      if (data.notifies?.length) {
        since = Math.max(since, ...data.notifies.map((n) => n.at));
        data.notifies.forEach((item) => onNotify?.(item));
      }
    } catch (err) {
      onError?.(err.message);
    }
  }

  function stop() {
    alive = false;
    if (timer) clearInterval(timer);
  }

  poll();
  timer = setInterval(poll, POLL_MS);
  return stop;
}

async function act(path, body) {
  const data = await api(path, { method: 'POST', body });
  return data.group;
}

export const roomActions = {
  start: (code, userId) =>
    act(`/api/groups/${code}/session/start`, { userId, origin: window.location.origin }),
  vote: (code, userId, menuId) => act(`/api/groups/${code}/session/vote`, { userId, menuId }),
  lock: (code, userId) => act(`/api/groups/${code}/session/lock`, { userId }),
  ready: (code, userId) => act(`/api/groups/${code}/session/ready`, { userId }),
  forceDraw: (code, userId) => act(`/api/groups/${code}/session/force-draw`, { userId }),
  close: (code, userId) => act(`/api/groups/${code}/session/close`, { userId }),
  kick: (code, userId, memberId) =>
    api(`/api/groups/${code}/members/${memberId}?userId=${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      body: { userId },
    }).then((data) => data.group),
  saveFeishu: (code, userId, webhook) =>
    api(`/api/groups/${code}/feishu`, {
      method: 'PUT',
      body: { userId, webhook, origin: window.location.origin },
    }).then((data) => data.group),
  notifyFeishu: (code, userId) =>
    api(`/api/groups/${code}/feishu/notify`, {
      method: 'POST',
      body: { userId, origin: window.location.origin },
    }).then((data) => data.group),
};
