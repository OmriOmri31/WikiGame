// The daily board shows at most ten ranked players. The signed-in player and
// the best official bot stay visible when they fall outside that ten, with a
// gap marker wherever ranks were skipped.

export function rankOf(rows, id) {
  if (!id) return null;
  const index = rows.findIndex((row) => row.id === id);
  return index === -1 ? null : index + 1;
}

export function topAndPins(ranked, { player = null, bot = null } = {}) {
  const top = ranked.slice(0, 10);
  const shown = new Set(top.map((row) => row.id));
  const extras = [];

  function pin(row, highlighted) {
    if (!row || shown.has(row.id)) return;
    const rank = rankOf(ranked, row.id);
    if (!rank || rank <= top.length) return;
    shown.add(row.id);
    extras.push({ row, rank, highlighted });
  }

  pin(player, true);
  pin(bot, false);
  extras.sort((a, b) => a.rank - b.rank);

  const blocks = [];
  let last = top.length;
  extras.forEach((item) => {
    if (item.rank > last + 1) blocks.push({ kind: 'gap', rank: item.rank });
    blocks.push({
      kind: 'row',
      row: item.row,
      rank: item.rank,
      highlighted: item.highlighted,
    });
    last = item.rank;
  });

  return { top, blocks };
}
