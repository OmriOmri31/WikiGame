// Run with: npm test (from web/). The interactive tutorial's script and pages.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TUTORIAL_DETOUR, TUTORIAL_PAIR, TUTORIAL_STEPS, TUTORIAL_WAY, nextTutorialStep, tutorialArticle,
} from '../src/tutorial.js';

const linksIn = (html) => [...html.matchAll(/<a href="\/wiki\/([^"]+)" title="([^"]+)">/g)].map((match) => match[2]);

test('the steps walk through a whole short game in order', () => {
  assert.deepEqual(TUTORIAL_STEPS.map((step) => step.id), [
    'start', 'goal', 'hint', 'goal-close', 'link', 'back', 'search', 'type', 'way', 'win', 'done',
  ]);
  const events = [
    'next', 'next', 'goal-open', 'goal-close', `page:${TUTORIAL_DETOUR}`, 'back', 'search-open', 'found',
    `page:${TUTORIAL_WAY}`, 'win',
  ];
  let index = 0;
  events.forEach((event) => {
    const before = index;
    index = nextTutorialStep(index, event);
    assert.equal(index, before + 1, `"${event}" should move on from ${TUTORIAL_STEPS[before].id}`);
  });
  assert.equal(TUTORIAL_STEPS[index].id, 'done');
  assert.equal(nextTutorialStep(index, 'next'), index);
});

test('other events do not skip a step', () => {
  assert.equal(nextTutorialStep(0, 'goal-open'), 0);
  assert.equal(nextTutorialStep(2, 'next'), 2);
  assert.equal(nextTutorialStep(4, 'page:חלב'), 4);
  assert.equal(nextTutorialStep(99, 'next'), 99);
});

test('every step has a short Hebrew line and something to light up', () => {
  for (const step of TUTORIAL_STEPS) {
    assert.ok(step.target, step.id);
    assert.match(step.text, /[א-ת]/, step.id);
    assert.ok(step.text.length <= 90, `${step.id} is ${step.text.length} characters`);
  }
});

test('the four pages link the way the walkthrough needs', async () => {
  const start = await tutorialArticle(TUTORIAL_PAIR.startTitle);
  assert.equal(start.title, 'פיצה');
  assert.ok(linksIn(start.html).includes(TUTORIAL_DETOUR));
  assert.ok(linksIn(start.html).includes(TUTORIAL_WAY));
  assert.ok(!linksIn(start.html).includes(TUTORIAL_PAIR.goalTitle), 'the start must not link straight to the goal');
  const way = await tutorialArticle(TUTORIAL_WAY);
  assert.ok(linksIn(way.html).includes(TUTORIAL_PAIR.goalTitle));
  const goal = await tutorialArticle(TUTORIAL_PAIR.goalTitle);
  assert.equal(goal.title, 'רומא');
  await assert.rejects(tutorialArticle('חלב'), (error) => error.code === 'missingtitle');
});

test('the word to search for appears once on the start page', async () => {
  const start = await tutorialArticle(TUTORIAL_PAIR.startTitle);
  const text = start.html.replace(/<[^>]+>/g, '');
  assert.equal(text.split(TUTORIAL_WAY).length - 1, 1);
});
