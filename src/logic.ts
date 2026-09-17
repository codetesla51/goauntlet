// logic.ts — pure game logic: no DOM, no globals, no randomness by default.
// Pure logic only (import type is erased at runtime).
// Covered by tests/run.mjs (node, no browser needed).
import type { Card } from './content.js';

/** Weak-first interleave: one weak card per two fresh ones. rand is injectable for tests. */
export function interleave(weak: Card[], rest: Card[], rand: () => number = Math.random): Card[] {
  weak = [...weak].sort(() => rand() - .5); rest = [...rest].sort(() => rand() - .5);
  const out: Card[] = []; let wi = 0, ri = 0;
  while (wi < weak.length || ri < rest.length) {
    if (wi < weak.length) out.push(weak[wi++]);
    for (let k = 0; k < 2 && ri < rest.length; k++) out.push(rest[ri++]);
  }
  return out;
}

/** Normalize compiler/program output for goal comparison. */
export function normOut(s: string): string { return (s || '').replace(/\r\n/g, '\n').trim(); }

/**
 * Drag-drop insertion slot from pointer Y.
 * mids[i] = vertical midpoint of placed row i; returns slot in [0, mids.length].
 * Top half of a row → before it; below all rows → append.
 */
export function insertionIndex(mids: number[], y: number): number {
  for (let i = 0; i < mids.length; i++) { if (y < mids[i]) return i; }
  return mids.length;
}

/**
 * Move element within one array, compensating the shift when moving down:
 * removing index `from` pulls later slots down one, so aim one earlier.
 */
export function movePlacedAt<T>(arr: T[], from: number, to: number): T[] {
  const out = [...arr];
  const mv = out.splice(from, 1)[0];
  const at = from < to ? to - 1 : to;
  out.splice(Math.max(0, Math.min(at, out.length)), 0, mv);
  return out;
}

/* Numbers arriving from storage can't be trusted (old saves, hand edits,
   failed parses): anything non-finite or negative becomes the fallback. */
export function num(v: unknown, fb = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fb;
}
/* Spaced repetition (SM-2-lite): each card carries {streak s, due timestamp}.
   Correct answers stretch the interval; misses reset to now. Queue sorts
   unseen (0) → due (1) → scheduled (2), stable so interleaving survives. */
export interface MemEntry { s: number; due: number }
const MEM_STEPS = [0, 864e5, 3 * 864e5, 7 * 864e5, 14 * 864e5, 30 * 864e5];
export function memorize(mem: Record<string, MemEntry>, id: string, ok: boolean, now: number): void {
  const e = mem[id] || { s: 0, due: 0 };
  e.s = ok ? e.s + 1 : 0;
  e.due = now + MEM_STEPS[Math.min(e.s, MEM_STEPS.length - 1)];
  mem[id] = e;
}
export function dueValue(mem: Record<string, MemEntry>, id: string, now: number): number {
  const e = mem[id];
  if (!e) return 0;
  return e.due <= now ? 1 : 2;
}

/* Seen-rotation for Trivia/Debug/Build/Order: unseen items first so repeats
   only start after exhaustion. Pure; quiz.ts wires it to S.seenIds. */
export function freshFirst<T>(items: T[], key: (t: T) => string, seen: Record<string, boolean>): T[] {
  const fresh = items.filter(t => !seen[key(t)]);
  return fresh.length ? fresh : items.slice();
}

/* Trivia session resume: order + position + score survive reloads and mode
   hops. Saved ids that still exist keep their order (so the position still
   points at the same question); newly-added content is appended shuffled so
   it appears without wiping progress; removed ids are dropped. Pure so
   tests can drive it; quiz.ts wires it to S.trivOrder. */
export function mergeTriviaOrder(savedIds: string[], allIds: string[], rand = Math.random): string[] {
  // Dedupe defensively (hand-edited saves): first occurrence wins.
  const seen = new Set<string>();
  const valid: string[] = [];
  for (const id of (savedIds || [])) {
    if (allIds.indexOf(id) !== -1 && !seen.has(id)) { seen.add(id); valid.push(id); }
  }
  const missing = allIds.filter(id => !seen.has(id));
  const shuffled = [...missing].sort(() => rand() - .5);
  return valid.concat(shuffled);
}

/* Calendar-day keys (YYYY-MM-DD, local time). Pure so tests can drive
   streak/quest rollover without mocking Date.now.
   Why not Date.now()+off*864e5: that breaks across DST (a "day" is not
   always 86400s), so yesterday's key can be wrong one day a year. */
export function dayKey(y: number, m: number, d: number): string {
  return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}
export function shiftDayKey(day: string, delta: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day || '');
  const base = m ? new Date(+m[1], +m[2] - 1, +m[3], 12) : new Date();
  base.setHours(12, 0, 0, 0);
  base.setDate(base.getDate() + delta);
  return dayKey(base.getFullYear(), base.getMonth() + 1, base.getDate());
}
export function isYesterday(last: string, today: string): boolean {
  return !!last && !!today && shiftDayKey(today, -1) === last;
}
/* Activity-gated streak: opening the app must not extend it. Only the
   first real activity of a day moves lastActiveDay/dayStreak forward. */
export function nextStreak(dayStreak: number, lastActiveDay: string, today: string): { dayStreak: number; lastActiveDay: string; changed: boolean } {
  if (lastActiveDay === today) return { dayStreak, lastActiveDay, changed: false };
  if (isYesterday(lastActiveDay, today)) return { dayStreak: (dayStreak || 0) + 1, lastActiveDay: today, changed: true };
  return { dayStreak: 1, lastActiveDay: today, changed: true };
}
/* What the HUD should show: a streak broken by a missed day reads 0 until
   the user is active again — showing the old number would be a lie. */
export function displayStreak(dayStreak: number, lastActiveDay: string, today: string): number {
  if (lastActiveDay === today) return dayStreak || 0;
  if (isYesterday(lastActiveDay, today)) return dayStreak || 0;
  return 0;
}
/* Progress migration: old saves keyed progress by question text; stable ids
   replaced them. Pure so tests can drive it; state.ts wires it to S + CARDS. */
export function migrateStores(
  stores: { mastered: Record<string, any>; starred: Record<string, any>; score: Record<string, any>; mistakes: Record<string, any> },
  cards: Array<{ id: string; q: string }>,
): boolean {
  const byQ: Record<string, string> = {};
  const byId: Record<string, boolean> = {};
  for (const c of cards) { byQ[c.q] = c.id; byId[c.id] = true; }
  let dirty = false;
  const or = (a: any, b: any) => a || b;
  const max = (a: any, b: any) => Math.max(Number(a) || 0, Number(b) || 0);
  const pairs: Array<[Record<string, any>, (a: any, b: any) => any]> = [
    [stores.mastered, or], [stores.starred, or], [stores.score, max], [stores.mistakes, max],
  ];
  for (const [store, merge] of pairs) {
    for (const k of Object.keys(store)) {
      if (byId[k]) continue;
      dirty = true;
      const id = byQ[k];
      if (id === undefined) { delete store[k]; continue; }
      store[id] = (id in store) ? merge(store[id], store[k]) : store[k];
      delete store[k];
    }
  }
  return dirty;
}
