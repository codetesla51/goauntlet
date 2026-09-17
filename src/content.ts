// content.ts — split from app.ts. Shared names come via import/export; inline onclick handlers are exposed on window by boot.ts.
import { toast, setText } from './util.js';
interface Deck { id: string; name: string; icon: string; desc: string; }
interface Card { id: string; deck: string; diff: string; tags: string; q: string; code: string; a: string; explain: string; options: string[]; }
interface TriviaQ { id: string; q: string; a: string; explain: string; options: string[]; }
interface DebugCase { id: string; title: string; desc: string; diff: string; code: string[] | string; bug: number; bugName: string; explain: string; }
interface OrderQ { id: string; deck: string; tags: string; q: string; lines: string[]; explain: string; }
// Lessons are a separate teaching model: hand-holding steps, zero quiz. Never derived from cards.
interface LesStep { kind: string; title: string; text: string; code?: string; expected?: string; goal?: string; lines?: string[]; hint?: string; bug?: number; bugName?: string; decoys?: string[]; predict?: { options: string[]; answer: number }; viz?: VizShow; quiz?: { options: string[]; answer: number; why: string }; trace?: TraceShow; sched?: SchedShow; typeA?: TypeShow; }
interface VizFrame { low: number; high: number; mid: number; found: number; note: string }
interface VizShow { nums: number[]; target: number; frames: VizFrame[] }
/* Generic trace frames: captioned lanes of cells (memory snapshots, channel
   buffers, variable rows). Rendered by widgets.mountTrace. */
interface TraceLane { label: string; cells: string[]; hi: number[] }
interface TraceFrame { caption: string; lanes: TraceLane[] }
interface TraceShow { frames: TraceFrame[] }
/* Scheduler sim ("you are the scheduler"): click a goroutine to run its next
   op; sends block on full buffers, recvs block on empty ones. Rendered by
   widgets.mountScheduler. Values are strings; vars default to "0". */
interface SchedOp { gor: number; label: string; send?: { ch: string; val: string }; recv?: { ch: string; into: string }; set?: { k: string; v: string }; add?: { k: string; by: number }; print?: string }
interface SchedGoal { type: string; anyOf?: string[][]; needAll?: boolean }
interface SchedShow { goroutines: string[]; channels: Record<string, number>; ops: SchedOp[]; goal: SchedGoal; success: string; stuckHint?: string }
/* Typed answer: the learner types the exact output instead of tapping one. */
interface TypeShow { answer: string; why: string }
interface Lesson { id: string; name: string; icon: string; desc: string; deck: string; steps: LesStep[]; }
interface SaveState {
  v: number;
  xp: number; coins: number; streak: number; best: number; hearts: number;
  mastered: Record<string, boolean>; seen: number; correct: number; wrong: number;
  quest: number; questDay: string; ach: Record<string, boolean>; shield: boolean;
  starred: Record<string, boolean>; bestSpeed: number;
  trivBest: number; trivDone: number; trivOrder: string[]; trivIdx: number; trivScore: number;
  dbgSolved: number; dbgDone: number; dbgOrder: string[]; dbgIdx: number;
  dayStreak: number; lastDay: string; lastActiveDay: string; deckId: string; diff: string; mode: string;
  score: Record<string, number>; mistakes: Record<string, number>;
  lessonsDone: Record<string, boolean>; lessonStep: Record<string, number>;
  projectsDone: Record<string, boolean>; projectStep: Record<string, number>;
  algosDone: Record<string, boolean>; algoStep: Record<string, number>;
  memory: Record<string, { s: number; due: number }>;
  seenIds: Record<string, boolean>;
  questHistory: Record<string, number>; questPaidDay: string;
  _questPaid?: boolean;
}
interface Confetto { x: number; y: number; vx: number; vy: number; g: number; s: number; c: string; r: number; vr: number; life: number; }
/* Content manifest: everything a save file can point AT. Reconciling the
   save against it is what makes adding topics safe (new ids simply arrive
   fresh) and removing topics clean (stale keys get pruned, counts stay true). */
interface ContentManifest {
  cards: string[];
  seen: string[];
  lessons: Record<string, number>;
  projects: Record<string, number>;
  algos: Record<string, number>;
}
function contentManifest(): ContentManifest {
  const rec = (ls: Lesson[]): Record<string, number> => {
    const o: Record<string, number> = {};
    ls.forEach((l) => { o[l.id] = l.steps.length; });
    return o;
  };
  return {
    cards: CARDS.map((c) => c.id),
    seen: [...TRIVIA.map((t) => t.id), ...DEBUG.map((d) => d.id), ...ORDER.map((o) => o.id)],
    lessons: rec(LESSONS),
    projects: rec(PROJECTS),
    algos: rec(ALGOS),
  };
}
let DECKS: Deck[] = [];
let CARDS: Card[] = [];
const RANKS: [number, string, string, string][] = [
  [1,'Hatchling','Fresh out of the shell. Everything compiles on the second try.','ph-bug'],
  [2,'Burrow Scout','Leaves the burrow. Knows where the errors live.','ph-lightbulb'],
  [3,'Loop Runner','Runs laps around for loops. for is a lifestyle.','ph-timer'],
  [4,'Channel Surfer','Rides unbuffered channels without wiping out.','ph-lightning'],
  [5,'Goroutine Gladiator','A hundred thousand goroutines enter. All of them finish.','ph-medal'],
  [7,'Gopher Knight','Sworn protector of the build. vet is clean.','ph-hammer'],
  [10,'Go Master','The gopher bows to no one. Ships on Fridays.','ph-trophy'],
];
function rankBlurb(l: number): string { let r: string = RANKS[0][2]; for(const [lv,,b] of RANKS){ if(l>=lv) r=b; } return r; }
function rankNext(l: number, xp: number): string {
  for(const [lv, name] of RANKS){ if(lv > l) return name + ' · ' + ((lv - 1) * 200 - xp) + ' XP to go'; }
  return 'MAX RANK — touch grass';
}
let TRIVIA: TriviaQ[] = [];
let DEBUG: DebugCase[] = [];
let ORDER: OrderQ[] = [];
let LESSONS: Lesson[] = [];
let PROJECTS: Lesson[] = [];
let ALGOS: Lesson[] = [];
/* Content lives in data/*.json so a typo in one card can never block tsc.
   Each file loads independently; each item validates independently.
   Bad item => skipped with a console warning, good items still play. */
function isStr(x: unknown): x is string { return typeof x === 'string'; }
function isStrArr(x: unknown): x is string[] { return Array.isArray(x) && (x as unknown[]).every(isStr); }
function asRec(x: unknown): Record<string, unknown> | null {
  return (typeof x === 'object' && x !== null && !Array.isArray(x)) ? (x as Record<string, unknown>) : null;
}
function pickStr(r: Record<string, unknown>, k: string, fb = ''): string {
  const v = r[k]; return isStr(v) ? v : fb;
}
function validDeck(x: unknown): Deck | null {
  const r = asRec(x); if (!r) return null;
  if (!isStr(r['id']) || !r['id']) return null;
  return { id: r['id'], name: pickStr(r, 'name', r['id'] as string), icon: pickStr(r, 'icon', 'ph-book'), desc: pickStr(r, 'desc', '') };
}
function validCard(x: unknown): Card | null {
  const r = asRec(x); if (!r) return null;
  if (!isStr(r['id']) || !r['id']) return null;
  if (!isStr(r['q']) || !r['q'] || !isStr(r['a']) || !r['a']) return null;
  if (!isStrArr(r['options']) || (r['options'] as string[]).length < 2) return null;
  return {
    id: r['id'] as string,
    deck: pickStr(r, 'deck', 'basics'), diff: pickStr(r, 'diff', 'gopher'),
    tags: pickStr(r, 'tags', ''), q: r['q'] as string, code: pickStr(r, 'code', ''),
    a: r['a'] as string, explain: pickStr(r, 'explain', ''),
    options: r['options'] as string[],
  };
}
function validTrivia(x: unknown): TriviaQ | null {
  const r = asRec(x); if (!r) return null;
  if (!isStr(r['id']) || !r['id']) return null;
  if (!isStr(r['q']) || !r['q'] || !isStr(r['a']) || !r['a']) return null;
  if (!isStrArr(r['options']) || (r['options'] as string[]).length < 2) return null;
  return { id: r['id'] as string, q: r['q'] as string, a: r['a'] as string, explain: pickStr(r, 'explain', ''), options: r['options'] as string[] };
}
function validDebug(x: unknown): DebugCase | null {
  const r = asRec(x); if (!r) return null;
  if (!isStr(r['id']) || !r['id']) return null;
  if (!isStr(r['title']) || !r['title']) return null;
  const code = r['code'];
  const lines = isStr(code) ? code.split('\n') : isStrArr(code) ? (code as string[]) : null;
  if (!lines || !lines.length) return null;
  const bug = r['bug'];
  if (typeof bug !== 'number' || bug < 0 || bug >= lines.length) return null;
  return {
    id: r['id'] as string,
    title: r['title'] as string, desc: pickStr(r, 'desc', ''), diff: pickStr(r, 'diff', 'gopher'),
    code: isStr(code) ? (code as string) : (lines as string[]),
    bug: bug as number, bugName: pickStr(r, 'bugName', 'bug'), explain: pickStr(r, 'explain', ''),
  };
}
function validOrder(x: unknown): OrderQ | null {
  const r = asRec(x); if (!r) return null;
  if (!isStr(r['id']) || !r['id']) return null;
  if (!isStr(r['q']) || !r['q']) return null;
  if (!isStrArr(r['lines']) || (r['lines'] as string[]).length < 2) return null;
  return {
    id: r['id'] as string,
    deck: pickStr(r, 'deck', 'basics'), tags: pickStr(r, 'tags', ''), q: r['q'] as string,
    lines: r['lines'] as string[], explain: pickStr(r, 'explain', ''),
  };
}
const LES_KINDS = ['read', 'run', 'fix', 'order', 'spot', 'build', 'visual', 'quiz', 'trace', 'sched', 'type'];
function validLesStep(x: unknown): LesStep | null {
  const r = asRec(x); if (!r) return null;
  if (!isStr(r['kind']) || LES_KINDS.indexOf(r['kind'] as string) === -1) return null;
  if (!isStr(r['title']) || !r['title'] || !isStr(r['text']) || !r['text']) return null;
  const kind = r['kind'] as string;
  const step: LesStep = { kind, title: r['title'] as string, text: r['text'] as string };
  if (r['code'] !== undefined) { if (!isStr(r['code'])) return null; step.code = r['code'] as string; }
  if (r['hint'] !== undefined) { if (!isStr(r['hint'])) return null; step.hint = r['hint'] as string; }
  if (kind === 'run' || kind === 'fix') {
    if (!isStr(r['code']) || !r['code'] || !isStr(r['expected'])) return null;
    step.code = r['code'] as string; step.expected = r['expected'] as string;
    if (isStr(r['goal'])) step.goal = r['goal'] as string;
  }
  if (kind === 'order') {
    if (!isStrArr(r['lines']) || (r['lines'] as string[]).length < 2) return null;
    step.lines = r['lines'] as string[];
  }
  if (kind === 'spot') {
    if (!isStr(r['code']) || !r['code']) return null;
    const n = (r['code'] as string).split('\n').length;
    if (typeof r['bug'] !== 'number' || r['bug'] < 0 || r['bug'] >= n) return null;
    step.code = r['code'] as string;
    step.bug = r['bug'] as number;
    if (isStr(r['bugName'])) step.bugName = r['bugName'] as string;
  }
  if (kind === 'build') {
    if (!isStrArr(r['lines']) || (r['lines'] as string[]).length < 2) return null;
    if (!isStrArr(r['decoys']) || (r['decoys'] as string[]).length < 1) return null;
    step.lines = r['lines'] as string[];
    step.decoys = r['decoys'] as string[];
  }
  if (r['predict'] !== undefined) {
    const p = asRec(r['predict']); if (!p) return null;
    if (!isStrArr(p['options']) || (p['options'] as string[]).length < 2) return null;
    const ans = p['answer'];
    if (typeof ans !== 'number' || ans < 0 || ans >= (p['options'] as string[]).length) return null;
    if ((kind === 'run' || kind === 'fix') && isStr(r['expected']) && (p['options'] as string[])[ans as number] !== (r['expected'] as string)) return null;
    step.predict = { options: p['options'] as string[], answer: ans as number };
  }
  if (kind === 'quiz') {
    const q = asRec(r['quiz']); if (!q) return null;
    if (!isStrArr(q['options']) || (q['options'] as string[]).length < 2) return null;
    const ans = q['answer'];
    if (typeof ans !== 'number' || ans < 0 || ans >= (q['options'] as string[]).length) return null;
    if (!isStr(q['why']) || !q['why']) return null;
    step.quiz = { options: q['options'] as string[], answer: ans as number, why: q['why'] as string };
  }
  if (kind === 'visual') {
    const v = asRec(r['viz']); if (!v) return null;
    const nums = v['nums'];
    if (!Array.isArray(nums) || nums.length < 2 || !(nums as unknown[]).every((n) => typeof n === 'number')) return null;
    if (typeof v['target'] !== 'number') return null;
    const fr = v['frames'];
    if (!Array.isArray(fr) || (fr as unknown[]).length < 2) return null;
    const n = (nums as number[]).length;
    const frames: VizFrame[] = [];
    for (const f of fr as unknown[]) {
      const rec = asRec(f); if (!rec) return null;
      const low = rec['low'], high = rec['high'], mid = rec['mid'];
      const found = rec['found'] === undefined ? -1 : rec['found'];
      if (typeof low !== 'number' || typeof high !== 'number' || typeof mid !== 'number' || typeof found !== 'number') return null;
      if (low < 0 || high >= n || low > high) return null;
      if (mid !== -1 && (mid < low || mid > high)) return null;
      if (found !== -1 && (found < 0 || found >= n)) return null;
      if (!isStr(rec['note']) || !rec['note']) return null;
      frames.push({ low, high, mid, found, note: rec['note'] as string });
    }
    step.viz = { nums: nums as number[], target: v['target'] as number, frames };
  }
  if (kind === 'type') {
    const a = asRec(r['typeA']); if (!a) return null;
    if (!isStr(a['answer']) || !a['answer']) return null;
    if (!isStr(a['why']) || !a['why']) return null;
    step.typeA = { answer: a['answer'] as string, why: a['why'] as string };
  }
  if (kind === 'trace') {
    const t = asRec(r['trace']); if (!t) return null;
    const fr = t['frames'];
    if (!Array.isArray(fr) || (fr as unknown[]).length < 2) return null;
    const frames: TraceFrame[] = [];
    for (const f of fr as unknown[]) {
      const rec = asRec(f); if (!rec) return null;
      if (!isStr(rec['caption']) || !rec['caption']) return null;
      const ln = rec['lanes'];
      if (!Array.isArray(ln) || (ln as unknown[]).length < 1) return null;
      const lanes: TraceLane[] = [];
      for (const l of ln as unknown[]) {
        const lr = asRec(l); if (!lr) return null;
        if (!isStr(lr['label'])) return null;
        if (!isStrArr(lr['cells']) || (lr['cells'] as string[]).length < 1) return null;
        const hi = lr['hi'];
        if (hi !== undefined && (!Array.isArray(hi) || !(hi as unknown[]).every((n) => typeof n === 'number'))) return null;
        const cells = lr['cells'] as string[];
        for (const h of ((hi as number[]) || [])) { if (h < 0 || h >= cells.length) return null; }
        lanes.push({ label: lr['label'] as string, cells, hi: ((hi as number[]) || []) });
      }
      frames.push({ caption: rec['caption'] as string, lanes });
    }
    step.trace = { frames };
  }
  if (kind === 'sched') {
    const g = asRec(r['sched']); if (!g) return null;
    const gors = g['goroutines'];
    if (!isStrArr(gors) || (gors as string[]).length < 2) return null;
    const ch = asRec(g['channels']); if (!ch) return null;
    for (const k of Object.keys(ch)) { if (typeof ch[k] !== 'number' || (ch[k] as number) < 0) return null; }
    const ops = g['ops'];
    if (!Array.isArray(ops) || (ops as unknown[]).length < 1) return null;
    const nG = (gors as string[]).length;
    for (const o of ops as unknown[]) {
      const rec = asRec(o); if (!rec) return null;
      if (typeof rec['gor'] !== 'number' || (rec['gor'] as number) < 0 || (rec['gor'] as number) >= nG) return null;
      if (!isStr(rec['label']) || !rec['label']) return null;
      if (rec['send'] === undefined && rec['recv'] === undefined && rec['set'] === undefined && rec['add'] === undefined && rec['print'] === undefined) return null;
      const se = asRec(rec['send']); if (rec['send'] !== undefined && (!se || !isStr(se['ch']) || !isStr(se['val']))) return null;
      const re = asRec(rec['recv']); if (rec['recv'] !== undefined && (!re || !isStr(re['ch']) || !isStr(re['into']))) return null;
      const st = asRec(rec['set']); if (rec['set'] !== undefined && (!st || !isStr(st['k']) || !isStr(st['v']))) return null;
      const ad = asRec(rec['add']); if (rec['add'] !== undefined && (!ad || !isStr(ad['k']) || typeof ad['by'] !== 'number')) return null;
      if (rec['print'] !== undefined && !isStr(rec['print'])) return null;
    }
    const go = asRec(g['goal']); if (!go) return null;
    if (!isStr(go['type']) || ['drain', 'deadlock', 'logs'].indexOf(go['type'] as string) === -1) return null;
    if (go['type'] === 'logs') {
      const ao = go['anyOf'];
      if (!Array.isArray(ao) || !(ao as unknown[]).length || !(ao as unknown[]).every((l) => Array.isArray(l) && (l as unknown[]).every(isStr))) return null;
    }
    if (!isStr(g['success']) || !g['success']) return null;
    step.sched = g as unknown as SchedShow;
  }
  return step;
}
function validLesson(x: unknown): Lesson | null {
  const r = asRec(x); if (!r) return null;
  if (!isStr(r['id']) || !r['id'] || !isStr(r['name']) || !r['name']) return null;
  if (!Array.isArray(r['steps'])) return null;
  const steps: LesStep[] = [];
  (r['steps'] as unknown[]).forEach((s, i) => {
    const v = validLesStep(s);
    if (v) steps.push(v);
    else console.warn('[content] skip lesson ' + String(r['id']) + ' step[' + i + ']', s);
  });
  if (!steps.length) return null;
  return { id: r['id'] as string, name: r['name'] as string, icon: pickStr(r, 'icon', 'ph-book-open'), desc: pickStr(r, 'desc', ''), deck: pickStr(r, 'deck', ''), steps };
}
async function fetchJson(path: string): Promise<unknown> {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(path + ': HTTP ' + res.status);
  return res.json();
}
function takeValid<T>(raw: unknown, fn: (x: unknown) => T | null, label: string, warns: string[]): T[] {
  if (!Array.isArray(raw)) { warns.push(label + ' is not an array — skipped whole file'); return []; }
  const out: T[] = [];
  (raw as unknown[]).forEach((item, i) => {
    const v = fn(item);
    if (v) out.push(v);
    else { warns.push(label + '[' + i + '] invalid — skipped'); console.warn('[content] skip ' + label + '[' + i + ']', item); }
  });
  return out;
}
async function loadContent(): Promise<string[]> {
  const warns: string[] = [];
  const jobs: Array<[string, (x: unknown) => Deck | Card | TriviaQ | DebugCase | OrderQ | Lesson | null]> = [
    ['data/decks.json', validDeck],
    ['data/cards.json', validCard],
    ['data/trivia.json', validTrivia],
    ['data/debug.json', validDebug],
    ['data/order.json', validOrder],
    ['data/lessons.json', validLesson],
    ['data/projects.json', validLesson],
    ['data/algo.json', validLesson],
  ];
  const loaded: Record<string, Array<Deck | Card | TriviaQ | DebugCase | OrderQ | Lesson>> = {};
  await Promise.all(jobs.map(async ([path, fn]) => {
    try {
      loaded[path] = takeValid(await fetchJson(path), fn, path, warns);
    } catch (e) {
      warns.push(path + ' failed to load (' + (e instanceof Error ? e.message : String(e)) + ')');
      console.warn('[content] ' + path + ' failed', e);
      loaded[path] = [];
    }
  }));
  DECKS = (loaded['data/decks.json'] as Deck[]).filter(d => d.id);
  CARDS = loaded['data/cards.json'] as Card[];
  TRIVIA = loaded['data/trivia.json'] as TriviaQ[];
  DEBUG = loaded['data/debug.json'] as DebugCase[];
  ORDER = loaded['data/order.json'] as OrderQ[];
  LESSONS = loaded['data/lessons.json'] as Lesson[];
  PROJECTS = (loaded['data/projects.json'] || []) as Lesson[];
  ALGOS = (loaded['data/algo.json'] || []) as Lesson[];
  return warns;
}
function showContentError(msg: string): void {
  try { setText('qText', msg); } catch (_) {}
  try { setText('trivQ', msg); } catch (_) {}
  try { setText('dbgTitle', msg); } catch (_) {}
  toast('Content failed to load — serve over http (npx serve .).', 'warning');
}

export { Deck, Card, TriviaQ, DebugCase, OrderQ, Lesson, LesStep, TraceLane, TraceFrame, TraceShow, SchedOp, SchedGoal, SchedShow, TypeShow, SaveState, Confetto, ContentManifest,
  DECKS, CARDS, TRIVIA, DEBUG, ORDER, LESSONS, PROJECTS, ALGOS, RANKS,
  rankBlurb, rankNext, validDeck, validCard, validTrivia, validDebug,
  validOrder, validLesson, validLesStep, takeValid, fetchJson, loadContent, showContentError, contentManifest };
