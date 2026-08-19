const TZ = 'Asia/Shanghai';
const DECAY_DAYS = 7;
const BASE_WEIGHT = 10;
const VOTE_BOOST = 20;

export function localDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function daysSince(timestamp, now = Date.now()) {
  const then = localDate(new Date(timestamp));
  const today = localDate(new Date(now));
  const a = new Date(`${then}T00:00:00+08:00`).getTime();
  const b = new Date(`${today}T00:00:00+08:00`).getTime();
  return Math.round((b - a) / 86400000);
}

export function recencyMultiplier(lastPickedAt, now = Date.now()) {
  if (!lastPickedAt) return 1;
  const days = daysSince(lastPickedAt, now);
  if (days <= 0) return 0;
  return Math.min(1, Math.max(0.08, days / DECAY_DAYS));
}

export function lastPickForMenu(history, menuId) {
  const picks = history.filter((h) => h.menuId === menuId).sort((a, b) => b.at - a.at);
  return picks[0] || null;
}

export function computeWeights(menus, votes, history, now = Date.now()) {
  const today = localDate(new Date(now));
  return menus.map((menu) => {
    const pickedToday = history.some((h) => h.menuId === menu.id && h.date === today);
    const voteCount = votes.filter((v) => v.menuId === menu.id).length;
    const base = Number.isFinite(menu.baseWeight) ? menu.baseWeight : BASE_WEIGHT;
    const last = lastPickForMenu(history, menu.id);
    const recency = pickedToday ? 0 : recencyMultiplier(last?.at, now);
    const raw = base + voteCount * VOTE_BOOST;
    const weight = pickedToday ? 0 : Number((raw * recency).toFixed(2));
    return {
      menuId: menu.id,
      name: menu.name,
      emoji: menu.emoji,
      base,
      voteCount,
      recency: Number(recency.toFixed(3)),
      lastPickedAt: last?.at || null,
      lastPickedDate: last?.date || null,
      pickedToday,
      eligible: weight > 0,
      weight,
    };
  });
}

export function pickWeighted(weightRows, random = Math.random) {
  const eligible = weightRows.filter((row) => row.weight > 0);
  const total = eligible.reduce((sum, row) => sum + row.weight, 0);
  if (total <= 0) {
    return { winnerId: null, total: 0, reason: 'no-eligible' };
  }
  let cursor = random() * total;
  for (const row of eligible) {
    cursor -= row.weight;
    if (cursor <= 0) {
      return { winnerId: row.menuId, total, reason: 'ok' };
    }
  }
  return { winnerId: eligible[eligible.length - 1].menuId, total, reason: 'ok' };
}

export const WEIGHT_RULES = {
  DECAY_DAYS,
  BASE_WEIGHT,
  VOTE_BOOST,
};
