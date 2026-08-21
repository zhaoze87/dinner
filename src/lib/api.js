const KEY = 'kaifan-user';
const ROOM_KEY = 'kaifan-room';

export function loadUser() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    return null;
  }
}

export function saveUser(user) {
  localStorage.setItem(KEY, JSON.stringify(user));
  return user;
}

export function clearUser() {
  localStorage.removeItem(KEY);
}

export function loadRoom() {
  try {
    return JSON.parse(localStorage.getItem(ROOM_KEY) || 'null');
  } catch {
    return null;
  }
}

export function saveRoom(group) {
  if (!group?.code) return null;
  const room = { code: group.code, name: group.name || '今晚的饭局' };
  localStorage.setItem(ROOM_KEY, JSON.stringify(room));
  return room;
}

export function clearRoom() {
  localStorage.removeItem(ROOM_KEY);
}

export async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '请求失败');
  return data;
}
