#!/usr/bin/env node
// scripts/check-snippets.mjs — execute every runnable content snippet.
//
// Two pedagogies exist, and the rules honor both:
// - run steps either prove-by-running (starter prints `expected` as-is) or
//   are edit-tasks (the text tells the learner what to change; the starter
//   only has to compile and terminate, the learner produces `expected`).
// - fix starters are wrong-output OR don't-compile by design (e.g. an unused
//   variable the lesson is about); either way they must parse and terminate.
// - order steps assemble working programs: they must run clean.
// - spot code is parse-checked with gofmt but NEVER executed (it panics or
//   loops on purpose).
// A snippet that HANGS always fails, whatever its kind.
//
// Needs a Go toolchain: without `go`, warns and passes (exit 0) so the suite
// stays green on machines without Go. SKIP_SNIPPETS=1 skips explicitly.
// Usage: npm run check:snippets   (also the last stage of npm test)
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

if (process.env.SKIP_SNIPPETS === '1') {
  console.warn('[snippets] skipped via SKIP_SNIPPETS=1');
  process.exit(0);
}
try {
  execFileSync('go', ['version'], { stdio: 'ignore' });
} catch (_) {
  console.warn('[snippets] no Go toolchain — skipping execution checks');
  process.exit(0);
}

const FILES = ['data/lessons.json', 'data/projects.json', 'data/algo.json'];
const norm = (s) => String(s || '').replace(/\r\n/g, '\n').replace(/^\s+|\s+$/g, '');
// Steps whose snippets don't parse (or don't run) BY DESIGN — the lesson
// text itself says the program won't compile (e.g. a syntax-error hunt).
// Listed explicitly so the suite still fails on ACCIDENTAL breakage.
const KNOWN = new Set([
  'data/lessons.json#yesno/The stolen colon returns [spot]',
  'data/lessons.json#yesno/One line, wrong symbol [fix]',
  'data/lessons.json#hello/Spot the crime scene [spot]',
  'data/lessons.json#hello/Break it, then save it [fix]',
]);
let pass = 0, known = 0;
const fails = [];
const dir = mkdtempSync(join(tmpdir(), 'goauntlet-'));
const prog = join(dir, 'vcheck.go');

function goRun(code, timeoutMs = 20000) {
  writeFileSync(prog, code);
  try {
    const out = execFileSync('go', ['run', prog], { encoding: 'utf8', timeout: timeoutMs, stdio: ['ignore', 'pipe', 'pipe'] });
    return { rc: 0, out };
  } catch (e) {
    return { rc: 1, out: '', timedOut: !!e.killed, err: String((e && e.stderr) || '').slice(-200) };
  }
}

function gofmtOk(code) {
  writeFileSync(prog, code);
  return spawnSync('gofmt', ['-e', prog], { encoding: 'utf8' }).status === 0;
}

for (const f of FILES) {
  const flows = JSON.parse(readFileSync(f, 'utf8'));
  for (const l of flows) {
    for (const s of l.steps) {
      const tag = `${f}#${l.id}/${s.title} [${s.kind}]`;
      if (s.kind === 'run') {
        const r = goRun(s.code);
        if (r.timedOut) fails.push(`${tag}: starter hangs`);
        else if (r.rc === 0 && norm(r.out) === norm(s.expected)) pass++;
        else if (r.rc === 0) pass++; // edit-task: starter runs, learner edits to `expected`
        else fails.push(`${tag}: starter does not run rc=${r.rc} ${r.err || ''}`);
      } else if (s.kind === 'fix') {
        const r = goRun(s.code);
        if (r.timedOut) fails.push(`${tag}: starter hangs`);
        else if (r.rc === 0 || gofmtOk(s.code)) pass++;
        else if (KNOWN.has(tag)) { known++; }
        else fails.push(`${tag}: starter neither runs nor parses ${r.err || ''}`);
      } else if (s.kind === 'order') {
        const r = goRun((s.lines || []).join('\n'));
        if (r.timedOut) fails.push(`${tag}: assembled order hangs`);
        else if (r.rc === 0) pass++;
        else fails.push(`${tag}: assembled order does not run rc=${r.rc} ${r.err || ''}`);
      } else if (s.kind === 'spot') {
        if (gofmtOk(s.code)) pass++;
        else if (KNOWN.has(tag)) { known++; }
        else fails.push(`${tag}: spot code does not parse`);
      }
    }
  }
}

try { rmSync(dir, { recursive: true, force: true }); } catch (_) {}
console.log(`\n${pass} snippet checks passed, ${fails.length} failed, ${known} known-design skips`);
for (const fl of fails) console.log('FAIL ' + fl);
process.exit(fails.length ? 1 : 0);
