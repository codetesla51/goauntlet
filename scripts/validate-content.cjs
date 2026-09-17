#!/usr/bin/env node
// Validate data/*.json without running tsc.
// Usage: npm run validate:content  (or: node scripts/validate-content.js)
// A bad card must fail HERE with a clear message — never block app.js emit.
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'data');
let errors = 0;
let warnings = 0;
const fail = (m) => { errors++; console.error('  ✗ ' + m); };
const warn = (m) => { warnings++; console.warn('  ! ' + m); };
const ok = (m) => console.log('  ✓ ' + m);

function read(name) {
  const p = path.join(DIR, name);
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    fail(name + ' does not parse: ' + e.message);
    return null;
  }
}

const decks = read('decks.json');
const cards = read('cards.json');
const trivia = read('trivia.json');
const debug = read('debug.json');
const order = read('order.json');
const lessons = read('lessons.json');

const deckIds = new Set();
console.log('decks.json');
if (Array.isArray(decks)) {
  decks.forEach((d, i) => {
    if (!d || typeof d.id !== 'string' || !d.id) return fail(`decks[${i}] missing id`);
    if (deckIds.has(d.id)) return fail(`decks[${i}] duplicate id "${d.id}"`);
    deckIds.add(d.id);
    if (!d.name) warn(`decks[${i}] ("${d.id}") missing name`);
  });
  ok(decks.length + ' decks');
} else if (decks !== null) fail('decks.json is not an array');

console.log('cards.json');
if (Array.isArray(cards)) {
  const seenQ = new Set();
  const seenId = new Set();
  cards.forEach((c, i) => {
    const tag = `cards[${i}]`;
    if (!c || typeof c.id !== 'string' || !c.id) return fail(tag + ' missing stable id (never renumber: append new ids)');
    if (seenId.has(c.id)) return fail(tag + ` duplicate id "${c.id}"`);
    seenId.add(c.id);
    if (!c || typeof c.q !== 'string' || !c.q) return fail(tag + ' missing q');
    if (typeof c.a !== 'string' || !c.a) return fail(tag + ' missing a');
    if (!Array.isArray(c.options) || c.options.length < 2) return fail(tag + ' needs options[>=2]');
    if (!c.options.includes(c.a)) warn(tag + ' answer not in options: ' + JSON.stringify(c.q.slice(0, 50)));
    if (seenQ.has(c.q)) warn(tag + ' duplicate question text');
    seenQ.add(c.q);
    if (c.deck && !deckIds.has(c.deck)) warn(tag + ` unknown deck "${c.deck}"`);
    if (c.diff && !['rookie', 'gopher', 'boss'].includes(c.diff)) warn(tag + ` unknown diff "${c.diff}"`);
    if (!c.explain) warn(tag + ' missing explain');
  });
  ok(cards.length + ' cards');
} else if (cards !== null) fail('cards.json is not an array');

console.log('trivia.json');
if (Array.isArray(trivia)) {
  const seenTriv = new Set();
  trivia.forEach((t, i) => {
    const tag = `trivia[${i}]`;
    if (!t || typeof t.id !== 'string' || !t.id) return fail(tag + ' missing stable id');
    if (seenTriv.has(t.id)) return fail(tag + ` duplicate id "${t.id}"`);
    seenTriv.add(t.id);
    if (!t || typeof t.q !== 'string' || !t.q) return fail(tag + ' missing q');
    if (typeof t.a !== 'string' || !t.a) return fail(tag + ' missing a');
    if (!Array.isArray(t.options) || t.options.length < 2) return fail(tag + ' needs options[>=2]');
    if (!t.options.includes(t.a)) warn(tag + ' answer not in options');
  });
  ok(trivia.length + ' trivia');
} else if (trivia !== null) fail('trivia.json is not an array');

console.log('debug.json');
if (Array.isArray(debug)) {
  const seenDbg = new Set();
  debug.forEach((d, i) => {
    const tag = `debug[${i}]`;
    if (!d || typeof d.id !== 'string' || !d.id) return fail(tag + ' missing stable id');
    if (seenDbg.has(d.id)) return fail(tag + ` duplicate id "${d.id}"`);
    seenDbg.add(d.id);
    if (!d || typeof d.title !== 'string' || !d.title) return fail(tag + ' missing title');
    const lines = typeof d.code === 'string' ? d.code.split('\n') : d.code;
    if (!Array.isArray(lines) || !lines.length || !lines.every((l) => typeof l === 'string'))
      return fail(tag + ' code must be string or string[]');
    if (typeof d.bug !== 'number' || d.bug < 0 || d.bug >= lines.length)
      return fail(tag + ` bug index ${d.bug} out of range (0..${lines.length - 1})`);
    if (!d.bugName) warn(tag + ' missing bugName');
    if (!d.explain) warn(tag + ' missing explain');
  });
  ok(debug.length + ' debug cases');
} else if (debug !== null) fail('debug.json is not an array');

console.log('order.json');
if (Array.isArray(order)) {
  const seenOrd = new Set();
  order.forEach((o, i) => {
    const tag = `order[${i}]`;
    if (!o || typeof o.id !== 'string' || !o.id) return fail(tag + ' missing stable id');
    if (seenOrd.has(o.id)) return fail(tag + ` duplicate id "${o.id}"`);
    seenOrd.add(o.id);
    if (!o || typeof o.q !== 'string' || !o.q) return fail(tag + ' missing q');
    if (!Array.isArray(o.lines) || o.lines.length < 2) return fail(tag + ' needs lines[>=2]');
  });
  ok(order.length + ' order puzzles');
} else if (order !== null) fail('order.json is not an array');

console.log('lessons.json');
function checkFlows(file, flows) {
  if (!Array.isArray(flows)) { if (flows !== null) fail(file + ' is not an array'); return; }
  const ids = new Set();
  flows.forEach((l, i) => {
    const tag = `${file}[${i}]`;
    if (!l || typeof l.id !== 'string' || !l.id) return fail(tag + ' missing id');
    if (ids.has(l.id)) return fail(tag + ` duplicate id "${l.id}"`);
    ids.add(l.id);
    if (typeof l.name !== 'string' || !l.name) return fail(tag + ' missing name');
    if (!Array.isArray(l.steps) || !l.steps.length) return fail(tag + ' needs steps[>=1]');
    if (l.deck && !deckIds.has(l.deck)) warn(tag + ` unknown deck "${l.deck}"`);
    l.steps.forEach((s, j) => {
      const stag = `${tag} steps[${j}]`;
      if (!s || !['read', 'run', 'fix', 'order', 'spot', 'build', 'visual', 'quiz', 'trace', 'sched', 'type'].includes(s.kind)) return fail(stag + ' bad kind (read|run|fix|order|spot|build|visual|quiz|trace|sched|type)');
      if (typeof s.title !== 'string' || !s.title) return fail(stag + ' missing title');
      if (typeof s.text !== 'string' || !s.text) return fail(stag + ' missing text');
      if (s.kind === 'run' || s.kind === 'fix') {
        if (typeof s.code !== 'string' || !s.code) return fail(stag + ' needs code');
        if (typeof s.expected !== 'string') return fail(stag + ' needs expected');
      }
      if (s.kind === 'order') {
        if (!Array.isArray(s.lines) || s.lines.length < 2) return fail(stag + ' needs lines[>=2]');
      }
      if (s.kind === 'spot') {
        if (typeof s.code !== 'string' || !s.code) return fail(stag + ' needs code');
        const n = s.code.split('\n').length;
        if (typeof s.bug !== 'number' || s.bug < 0 || s.bug >= n)
          return fail(stag + ` bug index ${s.bug} out of range (0..${n - 1})`);
      }
      if (s.kind === 'build') {
        if (!Array.isArray(s.lines) || s.lines.length < 2) return fail(stag + ' needs lines[>=2]');
        if (!Array.isArray(s.decoys) || s.decoys.length < 1) return fail(stag + ' needs decoys[>=1]');
      }
      if (s.predict !== undefined) {
        const p = s.predict;
        if (!p || !Array.isArray(p.options) || p.options.length < 2) return fail(stag + ' predict needs options[>=2]');
        if (typeof p.answer !== 'number' || p.answer < 0 || p.answer >= p.options.length) return fail(stag + ' predict.answer out of range');
        if ((s.kind === 'run' || s.kind === 'fix') && p.options[p.answer] !== s.expected) return fail(stag + ' predict.answer must equal expected');
      }
      if (s.kind === 'visual') {
        const v = s.viz;
        if (!v || !Array.isArray(v.nums) || v.nums.length < 2 || !v.nums.every((n) => typeof n === 'number')) return fail(stag + ' viz needs nums[>=2]');
        if (typeof v.target !== 'number') return fail(stag + ' viz needs numeric target');
        if (!Array.isArray(v.frames) || v.frames.length < 2) return fail(stag + ' viz needs frames[>=2]');
        const n = v.nums.length;
        for (let k = 0; k < v.frames.length; k++) {
          const f = v.frames[k];
          const ftag = stag + ` frames[${k}]`;
          if (!f || typeof f.low !== 'number' || typeof f.high !== 'number' || typeof f.mid !== 'number') return fail(ftag + ' needs low/high/mid');
          if (f.low < 0 || f.high >= n || f.low > f.high) return fail(ftag + ' low/high out of range');
          if (f.mid !== -1 && (f.mid < f.low || f.mid > f.high)) return fail(ftag + ' mid outside [low,high]');
          const found = f.found === undefined ? -1 : f.found;
          if (found !== -1 && (typeof found !== 'number' || found < 0 || found >= n)) return fail(ftag + ' found out of range');
          if (typeof f.note !== 'string' || !f.note) return fail(ftag + ' missing note');
        }
      }
      if (s.kind === 'quiz') {
        const q = s.quiz;
        if (!q || !Array.isArray(q.options) || q.options.length < 2) return fail(stag + ' quiz needs options[>=2]');
        if (typeof q.answer !== 'number' || q.answer < 0 || q.answer >= q.options.length) return fail(stag + ' quiz.answer out of range');
        if (typeof q.why !== 'string' || !q.why) return fail(stag + ' quiz needs why');
      }
      if (s.kind === 'type') {
        const a = s.typeA;
        if (!a || typeof a.answer !== 'string' || !a.answer) return fail(stag + ' type needs typeA.answer');
        if (!a || typeof a.why !== 'string' || !a.why) return fail(stag + ' type needs typeA.why');
      }
      if (s.kind === 'trace') {
        const t = s.trace;
        if (!t || !Array.isArray(t.frames) || t.frames.length < 2) return fail(stag + ' trace needs frames[>=2]');
        t.frames.forEach((f, k) => {
          const ftag = stag + ` frames[${k}]`;
          if (!f || typeof f.caption !== 'string' || !f.caption) return fail(ftag + ' missing caption');
          if (!f || !Array.isArray(f.lanes) || !f.lanes.length) return fail(ftag + ' needs lanes[>=1]');
          f.lanes.forEach((l, j) => {
            if (!l || typeof l.label !== 'string') return fail(ftag + ` lanes[${j}] needs label`);
            if (!l || !Array.isArray(l.cells) || !l.cells.length || !l.cells.every((c) => typeof c === 'string')) return fail(ftag + ` lanes[${j}] needs cells[>=1]`);
            (l.hi || []).forEach((h) => { if (typeof h !== 'number' || h < 0 || h >= l.cells.length) fail(ftag + ` lanes[${j}] hi out of range`); });
          });
        });
      }
      if (s.kind === 'sched') {
        const g = s.sched;
        if (!g || !Array.isArray(g.goroutines) || g.goroutines.length < 2) return fail(stag + ' sched needs goroutines[>=2]');
        if (!g || !g.channels || typeof g.channels !== 'object') return fail(stag + ' sched needs channels');
        if (!g || !Array.isArray(g.ops) || !g.ops.length) return fail(stag + ' sched needs ops[>=1]');
        (g.ops || []).forEach((o, k) => {
          if (!o || typeof o.gor !== 'number' || typeof o.label !== 'string' || !o.label) return fail(stag + ` ops[${k}] needs gor+label`);
          if (o.send === undefined && o.recv === undefined && o.set === undefined && o.add === undefined && o.print === undefined) return fail(stag + ` ops[${k}] needs an effect`);
        });
        if (!g || !g.goal || !['drain', 'deadlock', 'logs'].includes(g.goal.type)) return fail(stag + ' sched needs goal.type drain|deadlock|logs');
        if (!g || typeof g.success !== 'string' || !g.success) return fail(stag + ' sched needs success');
      }
      if (!s.hint) warn(stag + ' missing hint');
    });
  });
  const nSteps = flows.reduce((n, l) => n + (Array.isArray(l.steps) ? l.steps.length : 0), 0);
  ok(flows.length + ' ' + file.replace('.json', '') + ', ' + nSteps + ' steps');
}
const projects = read('projects.json');
const algos = read('algo.json');
checkFlows('lessons.json', lessons);
checkFlows('projects.json', projects);
checkFlows('algo.json', algos);

console.log(`\n${errors} error(s), ${warnings} warning(s)`);
process.exit(errors ? 1 : 0);
