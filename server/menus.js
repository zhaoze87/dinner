import { createStarterMenus } from './seed.js';

export function ensureUserMenus(user) {
  if (!user.menus) user.menus = [];
  return user.menus;
}

export function leaderMenus(data, leaderId) {
  const user = data.users.find((u) => u.id === leaderId);
  if (!user) return [];
  return ensureUserMenus(user);
}

export function seedLeaderMenus(user) {
  const menus = ensureUserMenus(user);
  if (menus.length === 0) {
    user.menus = createStarterMenus();
  }
  return user.menus;
}

export function parseMenuBody(body) {
  const name = String(body?.name || '').trim().slice(0, 16);
  if (!name) return { error: '菜名不能空' };
  return {
    menu: {
      name,
      emoji: String(body?.emoji || '🍽️').slice(0, 4),
      category: String(body?.category || '未分类').slice(0, 8),
      desc: String(body?.desc || '').slice(0, 40),
      baseWeight: Math.max(1, Math.min(50, Number(body?.baseWeight) || 10)),
    },
  };
}

export function applyMenuPatch(menu, body) {
  if (body.name != null) menu.name = String(body.name).trim().slice(0, 16);
  if (body.emoji != null) menu.emoji = String(body.emoji).slice(0, 4);
  if (body.category != null) menu.category = String(body.category).slice(0, 8);
  if (body.desc != null) menu.desc = String(body.desc).slice(0, 40);
  if (body.baseWeight != null) {
    menu.baseWeight = Math.max(1, Math.min(50, Number(body.baseWeight) || 10));
  }
}

export function migrateMenuOwnership(data) {
  let changed = false;

  for (const user of data.users) {
    if (!user.menus) {
      user.menus = [];
      changed = true;
    }
  }

  for (const group of data.groups) {
    if (!Array.isArray(group.menus) || group.menus.length === 0) continue;
    const leader = data.users.find((u) => u.id === group.leaderId);
    if (!leader) continue;

    const library = ensureUserMenus(leader);
    const known = new Set(library.map((m) => m.id));
    for (const menu of group.menus) {
      if (!known.has(menu.id)) {
        library.push(menu);
        known.add(menu.id);
        changed = true;
      }
    }
    delete group.menus;
    changed = true;
  }

  return changed;
}
