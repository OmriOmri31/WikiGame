// Throwaway: a deliberately failing test to prove CI blocks the merge. Never merge this.
import test from 'node:test';
import assert from 'node:assert/strict';

test('deliberately fails', () => {
  assert.equal(1 + 1, 3);
});
