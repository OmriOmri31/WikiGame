// The three kinds of free game. Older free results have no kind and count as random.
export const FREE_KINDS = ['random', 'easy', 'custom'];

export const FREE_KIND_NAMES = {
  random: 'אקראי',
  easy: 'קל',
  custom: 'בחירה שלי',
};

export function cleanFreeKind(value) {
  return FREE_KINDS.includes(value) ? value : 'random';
}
