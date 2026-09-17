// Shared mutable session state. Single owner: other modules read G.* / S.*
// and mutate S.* freely, but rebinding scalars goes through G (ESM-safe).
import type { SaveState, ContentManifest } from './content.js';
import { CARDS } from './content.js';
import { migrateStores } from './logic.js';
import { num, dayKey, nextStreak } from './logic.js';
/* Save schema version. Bump when SaveState gains/loses fields and add the
   step to migrateSaveVersion — old installs then upgrade without losing a
   single XP, and new topics never disturb anyone's state. */
const SAVE_VERSION = 2;
let S: SaveState = load() || {v: SAVE_VERSION, xp:0, coins:0, streak:0, best:0, hearts:3, mastered:{}, seen:0, correct:0, wrong:0, quest:0, questDay:dayStr(), ach:{}, shield:false, starred:{}, bestSpeed:0, trivBest:0, trivDone:0, trivOrder:[], trivIdx:0, trivScore:0, dbgSolved:0, dbgDone:0, dayStreak:0, lastDay:dayStr(), lastActiveDay:'', deckId:'basics', diff:'all', mode:'learn', score:{}, mistakes:{}, lessonsDone:{}, lessonStep:{}, projectsDone:{}, projectStep:{}, algosDone:{}, algoStep:{}, memory:{}, seenIds:{}, questHistory:{}, questPaidDay:''};
export const G = { mode: 'learn', deckId: 'basics', diff: 'all', combo: 1 };
S.score=S.score||{}; S.mistakes=S.mistakes||{};
S.lessonsDone=S.lessonsDone||{}; S.lessonStep=S.lessonStep||{}; S.projectsDone=S.projectsDone||{}; S.projectStep=S.projectStep||{}; S.algosDone=S.algosDone||{}; S.algoStep=S.algoStep||{}; S.memory=S.memory||{}; S.seenIds=S.seenIds||{};
S.trivBest=S.trivBest||0; S.trivDone=S.trivDone||0; S.dbgSolved=S.dbgSolved||0; S.dbgDone=S.dbgDone||0;
S.questHistory=S.questHistory||{}; S.questPaidDay=S.questPaidDay||'';
/* Lives persist across reloads: a game-over sticks until revive/shop.
   Fresh saves start at 3 (default literal); each new day refills to 3. */
sanitizeSave();
G.deckId=S.deckId||'basics'; G.diff=S.diff||'all';
if(!['learn','quiz','trivia','debug','build','order','speed','algo'].includes(S.mode)) S.mode='learn';
G.mode=S.mode;
function dayStr(off = 0){
  // Calendar-day math (noon-anchored): Date.now()+off*864e5 drifts across
  // DST transitions, so yesterday's key can be wrong one day a year.
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + off);
  return dayKey(d.getFullYear(), d.getMonth() + 1, d.getDate());
}
function trimHistory(h: Record<string, number>): void {
  const keys = Object.keys(h).sort();
  while (keys.length > 30) { delete h[keys.shift() as string]; }
}
function load(): SaveState | null {
  let s: SaveState | null = null;
  try{ s=JSON.parse(localStorage.getItem('gopher-arena-v4') || 'null') || JSON.parse(localStorage.getItem('gopher-arena-v3') || 'null'); }catch(e){ s=null; }
  if(!s || typeof s !== 'object') return null;
  const raw = s as unknown as Record<string, unknown>;
  if (typeof raw.v === 'number' && (raw.v as number) > SAVE_VERSION) {
    // Save is from a NEWER app (downgrade): park it untouched, start fresh.
    try{ localStorage.setItem('gopher-arena-v4-future', JSON.stringify(s)); }catch(_){}
    return null;
  }
  migrateSaveVersion(raw);
  if(s){
    const today=dayStr();
    // Daily quest rollover: archive yesterday's count so history persists,
    // then reset today's counter. Streak itself is NOT touched here — merely
    // opening the app must never earn or extend anything.
    if(s.questDay && s.questDay!==today){
      s.questHistory[s.questDay] = Math.max(s.questHistory[s.questDay] || 0, num(s.quest));
      trimHistory(s.questHistory);
      s.quest=0; s.questDay=today; s.hearts=3;
      s._questPaid = false;
    } else if(!s.questDay){ s.quest=0; s.questDay=today; }
    s.lastDay=today;
    try{ localStorage.setItem('gopher-arena-v4', JSON.stringify(s)); }catch(_){}
  }
  return s;
}
function save(){ localStorage.setItem('gopher-arena-v4', JSON.stringify(S)); }
/* Coerce every numeric field after load/import: one NaN anywhere (notably
   coins) silently disables every guard and price in the game. */
export function sanitizeSave(): void {
  S.xp = num(S.xp); S.coins = num(S.coins); S.streak = num(S.streak); S.best = num(S.best);
  S.seen = num(S.seen); S.correct = num(S.correct); S.wrong = num(S.wrong);
  S.quest = Math.min(8, num(S.quest)); S.hearts = num(S.hearts, 3); S.bestSpeed = num(S.bestSpeed);
  S.trivBest = num(S.trivBest); S.trivDone = num(S.trivDone);
  S.trivOrder = (S.trivOrder || []).filter((x) => typeof x === 'string');
  S.trivIdx = num(S.trivIdx); S.trivScore = num(S.trivScore);
  S.dbgSolved = num(S.dbgSolved); S.dbgDone = num(S.dbgDone);
  S.dayStreak = num(S.dayStreak, 0);
  S.questHistory = S.questHistory || {}; S.questPaidDay = S.questPaidDay || '';
  S.lastActiveDay = S.lastActiveDay || '';
  // Compat: old saves only had the boolean. If it says "paid" and the quest
  // is complete, assume it was paid for the quest's own day — never re-pay
  // on import/upgrade.
  if (S._questPaid && !S.questPaidDay && S.quest >= 8 && S.questDay) S.questPaidDay = S.questDay;
  trimHistory(S.questHistory);
}
function persistUI(){ S.deckId=G.deckId; S.diff=G.diff; S.mode=G.mode; save(); }

/* Forward migration: every save carries v. Old or unversioned saves gain new
   fields with sensible values (nothing resets); the stamp makes it one-time.
   Pure over the passed object (never saves) so node tests can drive it. */
function migrateSaveVersion(s: Record<string, unknown>): boolean {
  let dirty = false;
  const rec = (k: string): Record<string, unknown> => {
    if (typeof s[k] !== 'object' || s[k] === null || Array.isArray(s[k])) { s[k] = {}; dirty = true; }
    return s[k] as Record<string, unknown>;
  };
  rec('mastered'); rec('starred'); rec('score'); rec('mistakes'); rec('seenIds');
  rec('lessonsDone'); rec('lessonStep'); rec('projectsDone'); rec('projectStep');
  rec('algosDone'); rec('algoStep'); rec('ach'); rec('memory'); rec('questHistory');
  if (typeof s['v'] !== 'number' || (s['v'] as number) < SAVE_VERSION) {
    if (typeof s['lastActiveDay'] !== 'string' || !s['lastActiveDay']) {
      s['lastActiveDay'] = typeof s['lastDay'] === 'string' ? s['lastDay'] : '';
      if (typeof s['dayStreak'] !== 'number' || !s['dayStreak']) s['dayStreak'] = s['lastActiveDay'] ? 1 : 0;
      dirty = true;
    }
    if (typeof s['questPaidDay'] !== 'string') { s['questPaidDay'] = ''; dirty = true; }
    if (s['_questPaid'] && !s['questPaidDay'] && num(s['quest']) >= 8 && typeof s['questDay'] === 'string') {
      s['questPaidDay'] = s['questDay'];
    }
    if (!Array.isArray(s['trivOrder'])) { s['trivOrder'] = []; dirty = true; }
    if (typeof s['trivIdx'] !== 'number') { s['trivIdx'] = 0; dirty = true; }
    if (typeof s['trivScore'] !== 'number') { s['trivScore'] = 0; dirty = true; }
    s['v'] = SAVE_VERSION;
    dirty = true;
  }
  return dirty;
}

/* Content sync: prune progress pointing at removed topics, clamp resumed
   steps to their new lengths. Adding topics needs nothing (new ids arrive
   fresh); this keeps removals and edits from haunting counts. Saves only
   when dirty — and only the live save (tests pass their own object). */
function reconcileContent(m: ContentManifest, s: SaveState = S): boolean {
  let dirty = false;
  const keep = new Set(m.cards);
  const stores = [s.mastered, s.starred, s.score, s.mistakes] as Array<Record<string, unknown>>;
  for (const store of stores) {
    if (!store) continue;
    for (const k of Object.keys(store)) { if (!keep.has(k)) { delete store[k]; dirty = true; } }
  }
  const seenKeep = new Set(m.seen);
  if (s.seenIds) for (const k of Object.keys(s.seenIds)) { if (!seenKeep.has(k)) { delete s.seenIds[k]; dirty = true; } }
  const flows: Array<[Record<string, boolean> | undefined, Record<string, number> | undefined, Record<string, number>]> = [
    [s.lessonsDone, s.lessonStep, m.lessons],
    [s.projectsDone, s.projectStep, m.projects],
    [s.algosDone, s.algoStep, m.algos],
  ];
  for (const [done, steps, counts] of flows) {
    if (done) for (const k of Object.keys(done)) { if (!(k in counts)) { delete done[k]; dirty = true; } }
    if (steps) for (const k of Object.keys(steps)) {
      if (!(k in counts)) { delete steps[k]; dirty = true; continue; }
      const max = Math.max(0, (counts[k] || 1) - 1);
      if (typeof steps[k] !== 'number' || steps[k] > max) { steps[k] = Math.min(Math.max(0, num(steps[k])), max); dirty = true; }
      if (done && done[k]) { delete steps[k]; dirty = true; }
    }
  }
  if (dirty && s === S) save();
  return dirty;
}

/* Midnight guard for long sessions: the tab may stay open past 00:00, in
   which case questDay is stale until the next reload. Call before any
   quest/streak read or write (touchActive, bumpQuest, updateHUD). */
export function ensureToday(): boolean {
  const today = dayStr();
  if (S.questDay === today && S.lastDay === today) return false;
  if (S.questDay && S.questDay !== today) {
    S.questHistory[today] = S.questHistory[today] || 0;
    S.questHistory[S.questDay] = Math.max(S.questHistory[S.questDay] || 0, num(S.quest));
    trimHistory(S.questHistory);
    S.quest = 0; S.questDay = today; S.hearts = 3;
    S._questPaid = false;
  } else if (!S.questDay) { S.quest = 0; S.questDay = today; }
  S.lastDay = today;
  save();
  return true;
}

/* First real activity of the day moves the streak forward: consecutive to
   yesterday extends, any gap restarts at 1. Call from every XP-earning path
   (correct answers, lesson steps, completions) — never from mere opens. */
export function touchActive(): boolean {
  ensureToday();
  const today = dayStr();
  const nx = nextStreak(num(S.dayStreak, 0), S.lastActiveDay || '', today);
  S.dayStreak = nx.dayStreak; S.lastActiveDay = nx.lastActiveDay;
  S.questHistory[today] = Math.max(S.questHistory[today] || 0, num(S.quest));
  save();
  return nx.changed;
}

/* Single choke point for daily-quest progress so the count and its persisted
   history can never drift apart. Caps at 8/day. */
export function bumpQuest(n = 1): number {
  ensureToday();
  S.quest = Math.min(8, num(S.quest) + (n || 1));
  S.questHistory[S.questDay] = Math.max(S.questHistory[S.questDay] || 0, S.quest);
  trimHistory(S.questHistory);
  save();
  return S.quest;
}

/* One-time migration: progress used to be keyed by question text.
   Move old q-keyed entries onto stable card ids (merge on collision). */
export function migrateProgress(): boolean {
  const dirty = migrateStores({ mastered: S.mastered, starred: S.starred, score: S.score, mistakes: S.mistakes }, CARDS);
  if (dirty) save();
  return dirty;
}

/* Whole-save replace (progress import). Merges over defaults so old/partial
   files can't brick the app; live bindings keep every module in sync. */
export function replaceState(next: Partial<SaveState>): void {
  const d = dayStr();
  S = {
    v: SAVE_VERSION, xp: 0, coins: 0, streak: 0, best: 0, hearts: 3, mastered: {}, seen: 0,
    correct: 0, wrong: 0, quest: 0, questDay: d, ach: {}, shield: false,
    starred: {}, bestSpeed: 0, trivBest: 0, trivDone: 0, trivOrder: [], trivIdx: 0, trivScore: 0, dbgSolved: 0, dbgDone: 0,
    dayStreak: 0, lastDay: d, lastActiveDay: '', deckId: 'basics', diff: 'all', mode: 'learn',
    score: {}, mistakes: {}, lessonsDone: {}, lessonStep: {}, projectsDone: {}, projectStep: {}, algosDone: {}, algoStep: {}, memory: {}, seenIds: {}, questHistory: {}, questPaidDay: '',
    ...(next as Record<string, unknown>),
  } as SaveState;
  S.score = S.score || {}; S.mistakes = S.mistakes || {};
  S.lessonsDone = S.lessonsDone || {}; S.lessonStep = S.lessonStep || {}; S.projectsDone = S.projectsDone || {}; S.projectStep = S.projectStep || {}; S.algosDone = S.algosDone || {}; S.algoStep = S.algoStep || {}; S.memory = S.memory || {}; S.seenIds = S.seenIds || {};
  S.mastered = S.mastered || {}; S.starred = S.starred || {}; S.ach = S.ach || {};
  S.questHistory = S.questHistory || {}; S.questPaidDay = S.questPaidDay || '';
  if (!S.lastActiveDay && S.lastDay) S.lastActiveDay = S.lastDay;
  G.deckId = S.deckId || 'basics'; G.diff = S.diff || 'all'; G.mode = S.mode; G.combo = 1;
  if (!['learn', 'quiz', 'trivia', 'debug', 'build', 'order', 'speed', 'algo'].includes(S.mode)) { S.mode = 'learn'; G.mode = 'learn'; }
  migrateSaveVersion(S as unknown as Record<string, unknown>);
  sanitizeSave();
  save();
}

export { S, dayStr, load, save, persistUI, migrateSaveVersion, reconcileContent, SAVE_VERSION };
