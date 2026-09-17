// content.ts — split from app.ts. Shared names come via import/export; inline onclick handlers are exposed on window by boot.ts.
import { toast, setText } from './util.js';
function contentManifest() {
    const rec = (ls) => {
        const o = {};
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
let DECKS = [];
let CARDS = [];
const RANKS = [
    [1, 'Hatchling', 'Fresh out of the shell. Everything compiles on the second try.', 'ph-bug'],
    [2, 'Burrow Scout', 'Leaves the burrow. Knows where the errors live.', 'ph-lightbulb'],
    [3, 'Loop Runner', 'Runs laps around for loops. for is a lifestyle.', 'ph-timer'],
    [4, 'Channel Surfer', 'Rides unbuffered channels without wiping out.', 'ph-lightning'],
    [5, 'Goroutine Gladiator', 'A hundred thousand goroutines enter. All of them finish.', 'ph-medal'],
    [7, 'Gopher Knight', 'Sworn protector of the build. vet is clean.', 'ph-hammer'],
    [10, 'Go Master', 'The gopher bows to no one. Ships on Fridays.', 'ph-trophy'],
];
function rankBlurb(l) { let r = RANKS[0][2]; for (const [lv, , b] of RANKS) {
    if (l >= lv)
        r = b;
} return r; }
function rankNext(l, xp) {
    for (const [lv, name] of RANKS) {
        if (lv > l)
            return name + ' · ' + ((lv - 1) * 200 - xp) + ' XP to go';
    }
    return 'MAX RANK — touch grass';
}
let TRIVIA = [];
let DEBUG = [];
let ORDER = [];
let LESSONS = [];
let PROJECTS = [];
let ALGOS = [];
/* Content lives in data/*.json so a typo in one card can never block tsc.
   Each file loads independently; each item validates independently.
   Bad item => skipped with a console warning, good items still play. */
function isStr(x) { return typeof x === 'string'; }
function isStrArr(x) { return Array.isArray(x) && x.every(isStr); }
function asRec(x) {
    return (typeof x === 'object' && x !== null && !Array.isArray(x)) ? x : null;
}
function pickStr(r, k, fb = '') {
    const v = r[k];
    return isStr(v) ? v : fb;
}
function validDeck(x) {
    const r = asRec(x);
    if (!r)
        return null;
    if (!isStr(r['id']) || !r['id'])
        return null;
    return { id: r['id'], name: pickStr(r, 'name', r['id']), icon: pickStr(r, 'icon', 'ph-book'), desc: pickStr(r, 'desc', '') };
}
function validCard(x) {
    const r = asRec(x);
    if (!r)
        return null;
    if (!isStr(r['id']) || !r['id'])
        return null;
    if (!isStr(r['q']) || !r['q'] || !isStr(r['a']) || !r['a'])
        return null;
    if (!isStrArr(r['options']) || r['options'].length < 2)
        return null;
    return {
        id: r['id'],
        deck: pickStr(r, 'deck', 'basics'), diff: pickStr(r, 'diff', 'gopher'),
        tags: pickStr(r, 'tags', ''), q: r['q'], code: pickStr(r, 'code', ''),
        a: r['a'], explain: pickStr(r, 'explain', ''),
        options: r['options'],
    };
}
function validTrivia(x) {
    const r = asRec(x);
    if (!r)
        return null;
    if (!isStr(r['id']) || !r['id'])
        return null;
    if (!isStr(r['q']) || !r['q'] || !isStr(r['a']) || !r['a'])
        return null;
    if (!isStrArr(r['options']) || r['options'].length < 2)
        return null;
    return { id: r['id'], q: r['q'], a: r['a'], explain: pickStr(r, 'explain', ''), options: r['options'] };
}
function validDebug(x) {
    const r = asRec(x);
    if (!r)
        return null;
    if (!isStr(r['id']) || !r['id'])
        return null;
    if (!isStr(r['title']) || !r['title'])
        return null;
    const code = r['code'];
    const lines = isStr(code) ? code.split('\n') : isStrArr(code) ? code : null;
    if (!lines || !lines.length)
        return null;
    const bug = r['bug'];
    if (typeof bug !== 'number' || bug < 0 || bug >= lines.length)
        return null;
    return {
        id: r['id'],
        title: r['title'], desc: pickStr(r, 'desc', ''), diff: pickStr(r, 'diff', 'gopher'),
        code: isStr(code) ? code : lines,
        bug: bug, bugName: pickStr(r, 'bugName', 'bug'), explain: pickStr(r, 'explain', ''),
    };
}
function validOrder(x) {
    const r = asRec(x);
    if (!r)
        return null;
    if (!isStr(r['id']) || !r['id'])
        return null;
    if (!isStr(r['q']) || !r['q'])
        return null;
    if (!isStrArr(r['lines']) || r['lines'].length < 2)
        return null;
    return {
        id: r['id'],
        deck: pickStr(r, 'deck', 'basics'), tags: pickStr(r, 'tags', ''), q: r['q'],
        lines: r['lines'], explain: pickStr(r, 'explain', ''),
    };
}
const LES_KINDS = ['read', 'run', 'fix', 'order', 'spot', 'build', 'visual', 'quiz', 'trace', 'sched', 'type'];
function validLesStep(x) {
    const r = asRec(x);
    if (!r)
        return null;
    if (!isStr(r['kind']) || LES_KINDS.indexOf(r['kind']) === -1)
        return null;
    if (!isStr(r['title']) || !r['title'] || !isStr(r['text']) || !r['text'])
        return null;
    const kind = r['kind'];
    const step = { kind, title: r['title'], text: r['text'] };
    if (r['code'] !== undefined) {
        if (!isStr(r['code']))
            return null;
        step.code = r['code'];
    }
    if (r['hint'] !== undefined) {
        if (!isStr(r['hint']))
            return null;
        step.hint = r['hint'];
    }
    if (kind === 'run' || kind === 'fix') {
        if (!isStr(r['code']) || !r['code'] || !isStr(r['expected']))
            return null;
        step.code = r['code'];
        step.expected = r['expected'];
        if (isStr(r['goal']))
            step.goal = r['goal'];
    }
    if (kind === 'order') {
        if (!isStrArr(r['lines']) || r['lines'].length < 2)
            return null;
        step.lines = r['lines'];
    }
    if (kind === 'spot') {
        if (!isStr(r['code']) || !r['code'])
            return null;
        const n = r['code'].split('\n').length;
        if (typeof r['bug'] !== 'number' || r['bug'] < 0 || r['bug'] >= n)
            return null;
        step.code = r['code'];
        step.bug = r['bug'];
        if (isStr(r['bugName']))
            step.bugName = r['bugName'];
    }
    if (kind === 'build') {
        if (!isStrArr(r['lines']) || r['lines'].length < 2)
            return null;
        if (!isStrArr(r['decoys']) || r['decoys'].length < 1)
            return null;
        step.lines = r['lines'];
        step.decoys = r['decoys'];
    }
    if (r['predict'] !== undefined) {
        const p = asRec(r['predict']);
        if (!p)
            return null;
        if (!isStrArr(p['options']) || p['options'].length < 2)
            return null;
        const ans = p['answer'];
        if (typeof ans !== 'number' || ans < 0 || ans >= p['options'].length)
            return null;
        if ((kind === 'run' || kind === 'fix') && isStr(r['expected']) && p['options'][ans] !== r['expected'])
            return null;
        step.predict = { options: p['options'], answer: ans };
    }
    if (kind === 'quiz') {
        const q = asRec(r['quiz']);
        if (!q)
            return null;
        if (!isStrArr(q['options']) || q['options'].length < 2)
            return null;
        const ans = q['answer'];
        if (typeof ans !== 'number' || ans < 0 || ans >= q['options'].length)
            return null;
        if (!isStr(q['why']) || !q['why'])
            return null;
        step.quiz = { options: q['options'], answer: ans, why: q['why'] };
    }
    if (kind === 'visual') {
        const v = asRec(r['viz']);
        if (!v)
            return null;
        const nums = v['nums'];
        if (!Array.isArray(nums) || nums.length < 2 || !nums.every((n) => typeof n === 'number'))
            return null;
        if (typeof v['target'] !== 'number')
            return null;
        const fr = v['frames'];
        if (!Array.isArray(fr) || fr.length < 2)
            return null;
        const n = nums.length;
        const frames = [];
        for (const f of fr) {
            const rec = asRec(f);
            if (!rec)
                return null;
            const low = rec['low'], high = rec['high'], mid = rec['mid'];
            const found = rec['found'] === undefined ? -1 : rec['found'];
            if (typeof low !== 'number' || typeof high !== 'number' || typeof mid !== 'number' || typeof found !== 'number')
                return null;
            if (low < 0 || high >= n || low > high)
                return null;
            if (mid !== -1 && (mid < low || mid > high))
                return null;
            if (found !== -1 && (found < 0 || found >= n))
                return null;
            if (!isStr(rec['note']) || !rec['note'])
                return null;
            frames.push({ low, high, mid, found, note: rec['note'] });
        }
        step.viz = { nums: nums, target: v['target'], frames };
    }
    if (kind === 'type') {
        const a = asRec(r['typeA']);
        if (!a)
            return null;
        if (!isStr(a['answer']) || !a['answer'])
            return null;
        if (!isStr(a['why']) || !a['why'])
            return null;
        step.typeA = { answer: a['answer'], why: a['why'] };
    }
    if (kind === 'trace') {
        const t = asRec(r['trace']);
        if (!t)
            return null;
        const fr = t['frames'];
        if (!Array.isArray(fr) || fr.length < 2)
            return null;
        const frames = [];
        for (const f of fr) {
            const rec = asRec(f);
            if (!rec)
                return null;
            if (!isStr(rec['caption']) || !rec['caption'])
                return null;
            const ln = rec['lanes'];
            if (!Array.isArray(ln) || ln.length < 1)
                return null;
            const lanes = [];
            for (const l of ln) {
                const lr = asRec(l);
                if (!lr)
                    return null;
                if (!isStr(lr['label']))
                    return null;
                if (!isStrArr(lr['cells']) || lr['cells'].length < 1)
                    return null;
                const hi = lr['hi'];
                if (hi !== undefined && (!Array.isArray(hi) || !hi.every((n) => typeof n === 'number')))
                    return null;
                const cells = lr['cells'];
                for (const h of (hi || [])) {
                    if (h < 0 || h >= cells.length)
                        return null;
                }
                lanes.push({ label: lr['label'], cells, hi: (hi || []) });
            }
            frames.push({ caption: rec['caption'], lanes });
        }
        step.trace = { frames };
    }
    if (kind === 'sched') {
        const g = asRec(r['sched']);
        if (!g)
            return null;
        const gors = g['goroutines'];
        if (!isStrArr(gors) || gors.length < 2)
            return null;
        const ch = asRec(g['channels']);
        if (!ch)
            return null;
        for (const k of Object.keys(ch)) {
            if (typeof ch[k] !== 'number' || ch[k] < 0)
                return null;
        }
        const ops = g['ops'];
        if (!Array.isArray(ops) || ops.length < 1)
            return null;
        const nG = gors.length;
        for (const o of ops) {
            const rec = asRec(o);
            if (!rec)
                return null;
            if (typeof rec['gor'] !== 'number' || rec['gor'] < 0 || rec['gor'] >= nG)
                return null;
            if (!isStr(rec['label']) || !rec['label'])
                return null;
            if (rec['send'] === undefined && rec['recv'] === undefined && rec['set'] === undefined && rec['add'] === undefined && rec['print'] === undefined)
                return null;
            const se = asRec(rec['send']);
            if (rec['send'] !== undefined && (!se || !isStr(se['ch']) || !isStr(se['val'])))
                return null;
            const re = asRec(rec['recv']);
            if (rec['recv'] !== undefined && (!re || !isStr(re['ch']) || !isStr(re['into'])))
                return null;
            const st = asRec(rec['set']);
            if (rec['set'] !== undefined && (!st || !isStr(st['k']) || !isStr(st['v'])))
                return null;
            const ad = asRec(rec['add']);
            if (rec['add'] !== undefined && (!ad || !isStr(ad['k']) || typeof ad['by'] !== 'number'))
                return null;
            if (rec['print'] !== undefined && !isStr(rec['print']))
                return null;
        }
        const go = asRec(g['goal']);
        if (!go)
            return null;
        if (!isStr(go['type']) || ['drain', 'deadlock', 'logs'].indexOf(go['type']) === -1)
            return null;
        if (go['type'] === 'logs') {
            const ao = go['anyOf'];
            if (!Array.isArray(ao) || !ao.length || !ao.every((l) => Array.isArray(l) && l.every(isStr)))
                return null;
        }
        if (!isStr(g['success']) || !g['success'])
            return null;
        step.sched = g;
    }
    return step;
}
function validLesson(x) {
    const r = asRec(x);
    if (!r)
        return null;
    if (!isStr(r['id']) || !r['id'] || !isStr(r['name']) || !r['name'])
        return null;
    if (!Array.isArray(r['steps']))
        return null;
    const steps = [];
    r['steps'].forEach((s, i) => {
        const v = validLesStep(s);
        if (v)
            steps.push(v);
        else
            console.warn('[content] skip lesson ' + String(r['id']) + ' step[' + i + ']', s);
    });
    if (!steps.length)
        return null;
    return { id: r['id'], name: r['name'], icon: pickStr(r, 'icon', 'ph-book-open'), desc: pickStr(r, 'desc', ''), deck: pickStr(r, 'deck', ''), steps };
}
async function fetchJson(path) {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok)
        throw new Error(path + ': HTTP ' + res.status);
    return res.json();
}
function takeValid(raw, fn, label, warns) {
    if (!Array.isArray(raw)) {
        warns.push(label + ' is not an array — skipped whole file');
        return [];
    }
    const out = [];
    raw.forEach((item, i) => {
        const v = fn(item);
        if (v)
            out.push(v);
        else {
            warns.push(label + '[' + i + '] invalid — skipped');
            console.warn('[content] skip ' + label + '[' + i + ']', item);
        }
    });
    return out;
}
async function loadContent() {
    const warns = [];
    const jobs = [
        ['data/decks.json', validDeck],
        ['data/cards.json', validCard],
        ['data/trivia.json', validTrivia],
        ['data/debug.json', validDebug],
        ['data/order.json', validOrder],
        ['data/lessons.json', validLesson],
        ['data/projects.json', validLesson],
        ['data/algo.json', validLesson],
    ];
    const loaded = {};
    await Promise.all(jobs.map(async ([path, fn]) => {
        try {
            loaded[path] = takeValid(await fetchJson(path), fn, path, warns);
        }
        catch (e) {
            warns.push(path + ' failed to load (' + (e instanceof Error ? e.message : String(e)) + ')');
            console.warn('[content] ' + path + ' failed', e);
            loaded[path] = [];
        }
    }));
    DECKS = loaded['data/decks.json'].filter(d => d.id);
    CARDS = loaded['data/cards.json'];
    TRIVIA = loaded['data/trivia.json'];
    DEBUG = loaded['data/debug.json'];
    ORDER = loaded['data/order.json'];
    LESSONS = loaded['data/lessons.json'];
    PROJECTS = (loaded['data/projects.json'] || []);
    ALGOS = (loaded['data/algo.json'] || []);
    return warns;
}
function showContentError(msg) {
    try {
        setText('qText', msg);
    }
    catch (_) { }
    try {
        setText('trivQ', msg);
    }
    catch (_) { }
    try {
        setText('dbgTitle', msg);
    }
    catch (_) { }
    toast('Content failed to load — serve over http (npx serve .).', 'warning');
}
export { DECKS, CARDS, TRIVIA, DEBUG, ORDER, LESSONS, PROJECTS, ALGOS, RANKS, rankBlurb, rankNext, validDeck, validCard, validTrivia, validDebug, validOrder, validLesson, validLesStep, takeValid, fetchJson, loadContent, showContentError, contentManifest };
