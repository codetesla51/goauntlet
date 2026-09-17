// tests/run.mjs — unit tests for pure logic (node, no browser, no deps).
// Run: npm test
import { esc, norm, highlight } from '../util.js';
import { validCard, validLesStep, validLesson, takeValid } from '../content.js';
import { interleave, normOut, insertionIndex, movePlacedAt, memorize, dueValue, migrateStores, freshFirst, mergeTriviaOrder, num, dayKey, shiftDayKey, isYesterday, nextStreak, displayStreak } from '../logic.js';
import handler, { shapeResult } from '../api/compile.js';
import { migrateSaveVersion, reconcileContent, SAVE_VERSION } from '../state.js';

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, detail = '') {
  if (cond) { pass++; /* console.log('ok', name); */ }
  else { fail++; fails.push(name); console.log('FAIL ' + name, detail); }
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// --- format ---
ok('esc-amp-lt-gt', esc('a&<b>"c"') === 'a&amp;&lt;b&gt;"c"');
ok('norm-collapse', norm('  a   b\n c ') === 'a b c');
{
  const h = highlight('package main // hi\nfunc f() { fmt.Println("x", 42) }');
  ok('hl-keyword', h.includes('<span class="tok-k">package</span>'));
  ok('hl-string', h.includes('<span class="tok-s">"x"</span>'));
  ok('hl-comment', h.includes('<span class="tok-c">// hi</span>'));
  ok('hl-number', h.includes('<span class="tok-n">42</span>'));
  ok('hl-escapes-html', !highlight('a<b').includes('<b>'));
}

// --- validators ---
const goodCard = { id: 'basics-001', deck: 'basics', diff: 'rookie', q: 'Q?', code: '', a: 'A', explain: '', options: ['A', 'B'] };
ok('validCard-good', !!validCard(goodCard));
ok('validCard-no-id', validCard({ ...goodCard, id: undefined }) === null);
ok('validCard-one-option', validCard({ ...goodCard, options: ['A'] }) === null);
ok('validCard-no-q', validCard({ ...goodCard, q: '' }) === null);
ok('validLesStep-run-needs-expected', validLesStep({ kind: 'run', title: 't', text: 'x', code: 'c' }) === null);
ok('validLesStep-spot-bug-range', validLesStep({ kind: 'spot', title: 't', text: 'x', code: 'a\nb', bug: 5 }) === null);
ok('validLesStep-spot-ok', !!validLesStep({ kind: 'spot', title: 't', text: 'x', code: 'a\nb', bug: 1 }));
ok('validLesStep-build-needs-decoy', validLesStep({ kind: 'build', title: 't', text: 'x', lines: ['a', 'b'], decoys: [] }) === null);
ok('validLesson-drops-bad-steps', (() => {
  const l = validLesson({ id: 'x', name: 'n', steps: [{ kind: 'run', title: 't', text: 'x', code: 'c', expected: 'e' }, { kind: 'nope' }] });
  return l && l.steps.length === 1;
})());
ok('takeValid-skips-bad', (() => {
  const warns = [];
  const orig = console.warn;
  console.warn = () => {};
  const out = takeValid([goodCard, { q: 'broken' }], validCard, 'cards', warns);
  console.warn = orig;
  return out.length === 1 && warns.length === 1;
})());

// --- queue ---
{
  const w = [{ q: 'w1' }, { q: 'w2' }], r = [{ q: 'r1' }, { q: 'r2' }, { q: 'r3' }];
  ok('interleave-seeded', same(interleave(w, r, () => 0.5).map(c => c.q), ['w1', 'r1', 'r2', 'w2', 'r3']));
  const bag = interleave(w, r, Math.random).map(c => c.q).sort();
  ok('interleave-complete', same(bag, ['r1', 'r2', 'r3', 'w1', 'w2']));
  ok('interleave-empty', same(interleave([], [], () => 0.5), []));
}

// --- drop maths (mirrors the proven browser cases) ---
ok('move-down', same(movePlacedAt(['A', 'B', 'C', 'D'], 1, 3), ['A', 'C', 'B', 'D']));
ok('move-end', same(movePlacedAt(['A', 'B', 'C', 'D'], 1, 4), ['A', 'C', 'D', 'B']));
ok('move-up', same(movePlacedAt(['A', 'B', 'C', 'D'], 3, 0), ['D', 'A', 'B', 'C']));
ok('move-self-noop', same(movePlacedAt(['A', 'B', 'C', 'D'], 1, 1), ['A', 'B', 'C', 'D']));
ok('idx-above-all', insertionIndex([10, 30, 50], 5) === 0);
ok('idx-on-mid-goes-after', insertionIndex([10, 30, 50], 10) === 1);
ok('idx-between', insertionIndex([10, 30, 50], 29) === 1);
ok('idx-below-all', insertionIndex([10, 30, 50], 99) === 3);
ok('idx-empty', insertionIndex([], 5) === 0);
ok('normOut-crlf-trim', normOut('a\r\nb\n\n') === 'a\nb');

// --- memory ---
{
  const mem = {};
  memorize(mem, 'c1', true, 1000);
  ok('mem-first-ok', mem.c1.s === 1 && mem.c1.due === 1000 + 864e5, JSON.stringify(mem.c1));
  memorize(mem, 'c1', true, 2000);
  ok('mem-stretch', mem.c1.s === 2 && mem.c1.due === 2000 + 3 * 864e5, JSON.stringify(mem.c1));
  memorize(mem, 'c1', false, 3000);
  ok('mem-miss-resets', mem.c1.s === 0 && mem.c1.due === 3000, JSON.stringify(mem.c1));
  ok('due-unseen-first', dueValue({}, 'x', 9999) === 0);
  ok('due-past', dueValue({ x: { s: 1, due: 100 } }, 'x', 200) === 1);
  ok('due-future', dueValue({ x: { s: 3, due: 99999 } }, 'x', 200) === 2);
}

// --- migration ---
{
  const cards = [{ id: 'basics-001', q: 'What is Go?' }, { id: 'basics-002', q: 'Loops?' }];
  const stores = {
    mastered: { 'What is Go?': true, 'basics-002': true, 'Gone?': true },
    starred: {}, score: { 'What is Go?': 1, 'basics-001': 2 }, mistakes: { 'Loops?': 3 },
  };
  const dirty = migrateStores(stores, cards);
  ok('migrate-dirty', dirty === true);
  ok('migrate-mastered', stores.mastered['basics-001'] === true && !('What is Go?' in stores.mastered));
  ok('migrate-merge-max', stores.score['basics-001'] === 2);
  ok('migrate-orphan-dropped', !('Gone?' in stores.mastered));
  ok('migrate-mistakes', stores.mistakes['basics-002'] === 3);
  ok('migrate-clean-second-run', migrateStores(stores, cards) === false);
}

// --- rotation ---
ok('freshFirst-unseen', (() => {
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const out = freshFirst(items, t => t.id, { b: true });
  return out.length === 2 && out.every(t => t.id !== 'b');
})());
ok('freshFirst-all-seen-cycles', (() => {
  const items = [{ id: 'a' }, { id: 'b' }];
  return freshFirst(items, t => t.id, { a: true, b: true }).length === 2;
})());
ok('freshFirst-empty', freshFirst([], () => '', {}).length === 0);

// --- trivia resume (order + position + score survive reloads/mode hops) ---
ok('merge-keeps-saved-order', same(mergeTriviaOrder(['b', 'a'], ['a', 'b', 'c'], () => 0.5), ['b', 'a', 'c']));
ok('merge-drops-removed', same(mergeTriviaOrder(['a', 'gone'], ['a', 'b'], () => 0.5), ['a', 'b']));
ok('merge-appends-new', same(mergeTriviaOrder(['a'], ['a', 'b', 'c'], () => 0.5), ['a', 'b', 'c']));
ok('merge-empty-saved-returns-all', same(mergeTriviaOrder([], ['a', 'b'], () => 0.5), ['a', 'b']));
ok('merge-duplicate-save-dedupes', same(mergeTriviaOrder(['a', 'a', 'b'], ['a', 'b', 'c'], () => 0.5), ['a', 'b', 'c']));

// --- sanitize ---
ok('num-plain', num(7) === 7);
ok('num-zero-stays', num(0) === 0);
ok('num-undefined', num(undefined) === 0);
ok('num-null', num(null) === 0);
ok('num-nan', num(NaN) === 0);
ok('num-negative', num(-5) === 0);
ok('num-string', num('12') === 12);
ok('num-fallback', num(undefined, 3) === 3);
ok('num-guard-blocks-free-shield', !(num(undefined) >= 50));

// --- predict-first ---
const runStep = { kind: 'run', title: 't', text: 'x', code: 'package main\nfunc main(){}', expected: 'hi',
  predict: { options: ['ho', 'hi', 'hu'], answer: 1 } };
ok('predict-valid', (() => { const v = validLesStep(runStep); return !!v && !!v.predict && v.predict.answer === 1; })());
ok('predict-absent-ok', validLesStep({ kind: 'run', title: 't', text: 'x', code: 'c', expected: 'e' }).predict === undefined);
ok('predict-bad-index', validLesStep({ ...runStep, predict: { options: ['a', 'b'], answer: 5 } }) === null);
ok('predict-thin-options', validLesStep({ ...runStep, predict: { options: ['a'], answer: 0 } }) === null);
ok('predict-answer-must-match', validLesStep({ ...runStep, predict: { options: ['a', 'b', 'c'], answer: 0 } }) === null);

// --- visual steps ---
const vizStep = { kind: 'visual', title: 't', text: 'x', hint: 'h',
  viz: { nums: [1, 2, 3], target: 2, frames: [
    { low: 0, high: 2, mid: -1, found: -1, note: 'start' },
    { low: 1, high: 2, mid: 1, found: 1, note: 'found' },
  ] } };
ok('visual-valid', (() => { const v = validLesStep(vizStep); return !!v && !!v.viz && v.viz.frames.length === 2; })());
ok('visual-mid-outside', (() => { const c = JSON.parse(JSON.stringify(vizStep)); c.viz.frames[1].mid = 0; return validLesStep(c) === null; })());
ok('visual-thin-frames', (() => { const c = JSON.parse(JSON.stringify(vizStep)); c.viz.frames = [c.viz.frames[0]]; return validLesStep(c) === null; })());
ok('visual-missing-note', (() => { const c = JSON.parse(JSON.stringify(vizStep)); delete c.viz.frames[1].note; return validLesStep(c) === null; })());
ok('visual-bad-kind', validLesStep({ kind: 'dance', title: 't', text: 'x' }) === null);

// --- quiz steps ---
const quizStep = { kind: 'quiz', title: 't', text: 'x', hint: 'h',
  quiz: { options: ['a', 'b'], answer: 0, why: 'because' } };
ok('quiz-valid', (() => { const v = validLesStep(quizStep); return !!v && !!v.quiz && v.quiz.why === 'because'; })());
ok('quiz-bad-answer', (() => { const c = JSON.parse(JSON.stringify(quizStep)); c.quiz.answer = 7; return validLesStep(c) === null; })());
ok('quiz-missing-why', (() => { const c = JSON.parse(JSON.stringify(quizStep)); delete c.quiz.why; return validLesStep(c) === null; })());

// --- daily quest + streaks (calendar-accurate, activity-gated) ---
ok('dayKey-pads', dayKey(2026, 3, 5) === '2026-03-05');
ok('shift-back', shiftDayKey('2026-09-17', -1) === '2026-09-16');
ok('shift-month-boundary', shiftDayKey('2026-03-01', -1) === '2026-02-28');
ok('shift-year-boundary', shiftDayKey('2026-01-01', -1) === '2025-12-31');
ok('shift-forward', shiftDayKey('2026-09-17', 1) === '2026-09-18');
ok('isYesterday-true', isYesterday('2026-09-16', '2026-09-17') === true);
ok('isYesterday-same-day', isYesterday('2026-09-17', '2026-09-17') === false);
ok('isYesterday-gap', isYesterday('2026-09-15', '2026-09-17') === false);
{
  const a = nextStreak(3, '2026-09-16', '2026-09-17');
  ok('streak-extends-consecutive', a.dayStreak === 4 && a.lastActiveDay === '2026-09-17' && a.changed === true);
  const b = nextStreak(3, '2026-09-17', '2026-09-17');
  ok('streak-same-day-noop', b.dayStreak === 3 && b.changed === false);
  const c = nextStreak(3, '2026-09-15', '2026-09-17');
  ok('streak-gap-restarts', c.dayStreak === 1 && c.lastActiveDay === '2026-09-17' && c.changed === true);
  const d = nextStreak(0, '', '2026-09-17');
  ok('streak-first-day', d.dayStreak === 1 && d.changed === true);
  ok('display-active-today', displayStreak(4, '2026-09-17', '2026-09-17') === 4);
  ok('display-alive-yesterday', displayStreak(4, '2026-09-16', '2026-09-17') === 4);
  ok('display-broken-gap', displayStreak(4, '2026-09-15', '2026-09-17') === 0);
  ok('display-never-active', displayStreak(0, '', '2026-09-17') === 0);
}

// --- type/trace/sched steps ---
const typeStep = { kind: 'type', title: 't', text: 'x', typeA: { answer: '16', why: 'because' } };
ok('type-valid', (() => { const v = validLesStep(typeStep); return !!v && !!v.typeA && v.typeA.answer === '16'; })());
ok('type-missing-why', validLesStep({ kind: 'type', title: 't', text: 'x', typeA: { answer: '16' } }) === null);
const traceStep = { kind: 'trace', title: 't', text: 'x', trace: { frames: [
  { caption: 'a', lanes: [{ label: 'ch', cells: ['1', '_'], hi: [0] }] },
  { caption: 'b', lanes: [{ label: 'ch', cells: ['_', '_'], hi: [] }] },
] } };
ok('trace-valid', (() => { const v = validLesStep(traceStep); return !!v && !!v.trace && v.trace.frames.length === 2; })());
ok('trace-thin-frames', (() => { const c = JSON.parse(JSON.stringify(traceStep)); c.trace.frames = [c.trace.frames[0]]; return validLesStep(c) === null; })());
ok('trace-hi-range', (() => { const c = JSON.parse(JSON.stringify(traceStep)); c.trace.frames[0].lanes[0].hi = [5]; return validLesStep(c) === null; })());
const schedStep = { kind: 'sched', title: 't', text: 'x', sched: { goroutines: ['main', 'worker'], channels: { ch: 0 }, ops: [{ gor: 0, label: 'send', send: { ch: 'ch', val: '1' } }], goal: { type: 'drain' }, success: 'done' } };
ok('sched-valid', (() => { const v = validLesStep(schedStep); return !!v && !!v.sched; })());
ok('sched-bad-goal', (() => { const c = JSON.parse(JSON.stringify(schedStep)); c.sched.goal = { type: 'nope' }; return validLesStep(c) === null; })());
ok('sched-no-effect', (() => { const c = JSON.parse(JSON.stringify(schedStep)); c.sched.ops = [{ gor: 0, label: 'x' }]; return validLesStep(c) === null; })());

// --- /api/compile contract (served on Vercel by api/compile.js,
// locally by scripts/serve.py — same shape both ways) ---
function mockRes() {
  return { code: 0, out: null, status(c) { this.code = c; return this; }, json(o) { this.out = o; return this; } };
}
const realFetch = globalThis.fetch;
{
  const res = mockRes();
  await handler({ method: 'GET' }, res);
  ok('api-rejects-get', res.code === 405 && res.out.ok === false);
}
{
  const res = mockRes();
  await handler({ method: 'POST', body: { code: '   ' } }, res);
  ok('api-rejects-empty', res.code === 400);
}
{
  const res = mockRes();
  await handler({ method: 'POST', body: { code: 'x'.repeat(65 * 1024) } }, res);
  ok('api-rejects-big', res.code === 400);
}
{
  globalThis.fetch = async () => ({ json: async () => ({ Errors: '', Events: [] }) });
  const res = mockRes();
  await handler({ method: 'POST', body: '{"code":"package main\\n"}' }, res);
  ok('api-accepts-string-body', res.code === 200 && res.out.ok === true);
  globalThis.fetch = realFetch;
}
{
  globalThis.fetch = async () => ({ json: async () => ({ Errors: '', Events: [{ Message: 'hi\n', Kind: 'stdout' }] }) });
  const res = mockRes();
  await handler({ method: 'POST', body: { code: 'package main\nfunc main(){}\n' } }, res);
  ok('api-happy', res.code === 200 && res.out.ok === true && res.out.output === 'hi\n' && res.out.errors === '');
  globalThis.fetch = realFetch;
}
ok('api-shape-garbage', (() => { const r = shapeResult(null); return r.ok === true && r.output === '' && r.errors === ''; })());
ok('api-shape-filters-kinds', shapeResult({ Errors: 'x', Events: [{ Message: 'a', Kind: 'stdout' }, { Message: 'b', Kind: 'debug' }, { Message: 7, Kind: 'stdout' }] }).output === 'a');
{
  const err = new Error('boom'); err.name = 'AbortError';
  globalThis.fetch = async () => { throw err; };
  const res = mockRes();
  await handler({ method: 'POST', body: { code: 'x' } }, res);
  ok('api-timeout-502', res.code === 502 && /timed out/.test(res.out.error));
  globalThis.fetch = realFetch;
}
{
  const err = new TypeError('down');
  globalThis.fetch = async () => { throw err; };
  const res = mockRes();
  await handler({ method: 'POST', body: { code: 'x' } }, res);
  ok('api-unreachable-502', res.code === 502 && /unreachable/.test(res.out.error));
  globalThis.fetch = realFetch;
}

// --- save migration + content sync (new topics must never break saves) ---
ok('save-version-current', SAVE_VERSION === 2);
{
  const old = { xp: 5, mastered: { 'gone-card': true, 'basics-001': true }, lastDay: '2026-01-01' };
  const dirty = migrateSaveVersion(old);
  ok('migrate-stamps', old.v === 2 && dirty === true);
  ok('migrate-fills', old.lastActiveDay === '2026-01-01' && Array.isArray(old.trivOrder) && typeof old.questHistory === 'object' && old.questPaidDay === '');
  ok('migrate-idempotent', migrateSaveVersion(old) === false);
}
{
  const keep = { xp: 1, v: 2, lastActiveDay: '2026-09-01', questHistory: { '2026-09-01': 8 } };
  migrateSaveVersion(keep);
  ok('migrate-keeps', keep.lastActiveDay === '2026-09-01' && keep.questHistory['2026-09-01'] === 8);
}
{
  const s = { v: 2, mastered: { 'gone-card': true, 'basics-001': true }, starred: {}, score: {}, mistakes: {}, seenIds: { 'gone-t': true, 'trivia-001': true }, lessonsDone: { 'gone-les': true }, lessonStep: { 'gone-les': 3, loops: 99 }, projectsDone: {}, projectStep: {}, algosDone: {}, algoStep: {} };
  const m = { cards: ['basics-001'], seen: ['trivia-001'], lessons: { loops: 5 }, projects: {}, algos: {} };
  const dirty = reconcileContent(m, s);
  ok('reconcile-prunes', dirty === true && !('gone-card' in s.mastered) && s.mastered['basics-001'] === true);
  ok('reconcile-seen', !('gone-t' in s.seenIds) && s.seenIds['trivia-001'] === true);
  ok('reconcile-flows', !('gone-les' in s.lessonsDone) && !('gone-les' in s.lessonStep) && s.lessonStep.loops === 4);
  ok('reconcile-clean-second-run', reconcileContent(m, s) === false);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fails.length) process.exit(1);
