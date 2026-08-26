import { computeWeights } from '../server/engine.js';

export function buildDrawAudit({ weights, votes, winnerId, forced }) {
  const eligible = weights.filter((row) => row.weight > 0);
  const total = eligible.reduce((sum, row) => sum + row.weight, 0);
  const winner = winnerId ? weights.find((row) => row.menuId === winnerId) : null;
  return {
    forced: Boolean(forced),
    total: Number(total.toFixed(2)),
    voteTotal: votes.length,
    winnerWeight: winner?.weight ?? 0,
    winnerChance: total > 0 && winner ? Number((winner.weight / total).toFixed(4)) : 0,
    weights: weights.map((row) => ({
      menuId: row.menuId,
      name: row.name,
      emoji: row.emoji,
      base: row.base,
      voteCount: row.voteCount,
      recency: row.recency,
      pickedToday: Boolean(row.pickedToday),
      weight: row.weight,
    })),
    votes: votes.map((v) => ({ userId: v.userId, menuId: v.menuId })),
  };
}

/** 开奖历史明细：优先用持久化快照，否则按当时规则重建（不含他人投票） */
export function resolveHistoryAudit(item, allHistory, menus, storedAudit = null) {
  if (storedAudit) {
    return { ...storedAudit, reconstructed: Boolean(storedAudit.reconstructed) };
  }
  const prior = allHistory.filter((h) => h.at < item.at);
  const weights = computeWeights(menus, [], prior, item.at);
  return {
    ...buildDrawAudit({
      weights,
      votes: [],
      winnerId: item.menuId,
      forced: item.forced,
    }),
    reconstructed: true,
  };
}

export function backfillHistoryAudits(history, menus) {
  let dirty = false;
  for (const item of history) {
    if (item.audit) continue;
    item.audit = resolveHistoryAudit(item, history, menus);
    dirty = true;
  }
  return dirty;
}
