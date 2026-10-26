// The daily board shows the top ten. Outside that ten, the signed-in player's
// best score stays visible with the rank above it and the rank below it. Another
// score of theirs, such as the one in the personal box, is shown the same way.
// The best official bot stays visible on its own. A gap marker stands in for
// skipped ranks.

export function rankOf(rows, id) {
  if (!id) return null;
  const index = rows.findIndex((row) => row.id === id);
  return index === -1 ? null : index + 1;
}

export function topAndPins(ranked, { player = null, bot = null, extra = null } = {}) {
  const top = ranked.slice(0, 10);
  const shown = new Set(top.map((row) => row.id));
  const extras = [];

  function pin(row, highlighted) {
    if (!row) return;
    const rank = rankOf(ranked, row.id);
    if (!rank || rank <= top.length) return;
    if (shown.has(row.id)) {
      if (!highlighted) return;
      const existing = extras.find((item) => item.row.id === row.id);
      if (existing) existing.highlighted = true;
      return;
    }
    const start = highlighted ? Math.max(top.length + 1, rank - 1) : rank;
    const end = highlighted ? Math.min(ranked.length, rank + 1) : rank;
    for (let place = start; place <= end; place += 1) {
      const entry = ranked[place - 1];
      if (!entry || shown.has(entry.id)) continue;
      shown.add(entry.id);
      extras.push({
        row: entry,
        rank: place,
        highlighted: highlighted && entry.id === row.id,
      });
    }
  }

  pin(player, true);
  if (extra && extra.id !== player?.id) pin(extra, true);
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
