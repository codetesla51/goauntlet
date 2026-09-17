// ui.ts — split from app.ts. Shared names come via import/export; inline onclick handlers are exposed on window by boot.ts.
import { $, setText, toast, sfx, copyText, showPlayHandoff } from './util.js';
import { S, G, save, dayStr, ensureToday, replaceState, SAVE_VERSION } from './state.js';
import { displayStreak } from './logic.js';
import { rankBlurb, rankNext, RANKS, CARDS, LESSONS } from './content.js';
import { renderDecks, cur, syncReviewBtn } from './quiz.js';
const ACH_DEFS = [
    { id: 'first', icon: 'ph-drop', name: 'First blood', desc: 'Answer one card right' },
    { id: 'streak5', icon: 'ph-fire', name: 'On fire', desc: 'Reach a 5 streak' },
    { id: 'streak10', icon: 'ph-rocket-launch', name: 'Unstoppable', desc: 'Reach a 10 streak' },
    { id: 'rich', icon: 'ph-coins', name: 'Gopher banker', desc: 'Hold 200 coins' },
    { id: 'scholar', icon: 'ph-graduation-cap', name: 'Scholar', desc: 'Master 15 cards' },
    { id: 'speed', icon: 'ph-timer', name: 'Speed demon', desc: 'Score 5 in one speed run' },
    { id: 'boss', icon: 'ph-skull', name: 'Boss slayer', desc: 'Nail a boss card' },
];
const QUIPS = ['Ouch. The gopher felt that one.', 'Wrong burrow. Dig again.', 'The compiler is laughing. Politely.', 'Nope. Even gofmt winced.', 'That answer has a data race with the truth.', 'Nil-pointer dereference... of confidence.', 'The gopher buried that one. Next!', 'Close! (Not close.)', 'Your streak just filed for retirement.', 'That one goes in the mistakes burrow. I will quiz you again.', 'The GC just collected your dignity.', 'Panic: runtime error. Just kidding. But no.', 'Wrong. But confidently wrong - respect.', 'The channel is closed on that answer.'];
function level() { return Math.floor(S.xp / 200) + 1; }
function rankFor(l) { let r = RANKS[0][1]; for (const [lv, name] of RANKS) {
    if (l >= lv)
        r = name;
} return r; }
function needRevive() { if (S.hearts > 0)
    return false; try {
    const om = $('overModal');
    if (!om.open)
        om.showModal();
}
catch (_) { } return true; }
function buyShield() {
    if (S.shield)
        return toast('Shield already active — it forgives your next mistake.', 'shield-check');
    if (S.coins < 50)
        return toast('Need 50 coins for a shield.', 'coins');
    S.coins -= 50;
    S.shield = true;
    save();
    updateHUD();
    sfx.coin();
    toast('Shield equipped.', 'shield-check');
}
function buyHeart() { if (S.coins < 40)
    return toast('Need 40 coins.', 'coins'); if (S.hearts >= 5)
    return toast('Lives are already full.', 'heart'); S.coins -= 40; S.hearts++; save(); updateHUD(); sfx.coin(); toast('Extra life acquired.', 'heart'); }
function revive() { S.hearts = 3; S.streak = 0; G.combo = 1; save(); updateHUD(); toast('Revived with 3 lives.', 'heart'); }
function unlock(id) {
    if (S.ach[id])
        return;
    S.ach[id] = true;
    save();
    renderAch();
    const def = ACH_DEFS.find(x => x.id === id);
    toast('Achievement unlocked: ' + (def ? def.name : id) + '.', 'trophy');
    sfx.coin();
    confetti(50);
}
function checkAch() {
    if (S.correct >= 1)
        unlock('first');
    if (S.streak >= 5)
        unlock('streak5');
    if (S.streak >= 10)
        unlock('streak10');
    if (S.coins >= 200)
        unlock('rich');
    if (Object.keys(S.mastered).length >= 15)
        unlock('scholar');
}
function renderAch() {
    const el = $('achList');
    el.innerHTML = '';
    ACH_DEFS.forEach(a => {
        const got = !!S.ach[a.id];
        el.innerHTML += '<div class="ach' + (got ? '' : ' locked') + '">'
            + '<i class="ph-fill ' + a.icon + '"></i>'
            + '<span><span class="block font-bold text-[12.5px] leading-tight">' + a.name + (got ? ' · Done' : '') + '</span>'
            + '<span class="block text-[11.5px]" style="color:var(--muted);">' + a.desc + '</span></span></div>';
    });
}
function updateHUD() {
    ensureToday();
    const l = level(), xpIn = S.xp % 200, pct = (xpIn / 200 * 100) + '%';
    setText('hudLevel', l);
    setText('hudLevelM', l);
    setText('hudXp', xpIn);
    $('xpBar').style.width = pct;
    $('xpBarM').style.width = pct;
    setText('hudRank', rankFor(l));
    setText('rankTitle', rankFor(l).toUpperCase());
    setText('rankNext', rankNext(l, S.xp));
    setText('levelBadge', 'LVL ' + l);
    setText('hudStreak', S.streak);
    setText('hudHearts', S.hearts);
    setText('hudCoins', S.coins);
    setText('hudCombo', '×' + G.combo);
    setText('statMastered', Object.keys(S.mastered).length);
    setText('statBest', S.best);
    const tot = S.correct + S.wrong;
    setText('statAcc', tot ? Math.round(S.correct / tot * 100) + '%' : '–');
    setText('statTriv', S.trivBest || 0);
    setText('statDbg', S.dbgSolved || 0);
    setText('statDays', displayStreak(S.dayStreak || 0, S.lastActiveDay || '', S.questDay || dayStr()));
    const lesDone = Object.keys(S.lessonsDone).length;
    setText('statLessons', lesDone + '/' + LESSONS.length);
    $('lessonsBar').style.width = (LESSONS.length ? lesDone / LESSONS.length * 100 : 0) + '%';
    setText('questCount', S.quest);
    $('questBar').style.width = (S.quest / 8 * 100) + '%';
    setText('questState', S.quest >= 8 ? 'Complete!' : 'In progress…');
    // Quest reward pays once per day, keyed by the quest's own day — a plain
    // boolean survives reloads with the wrong value (yesterday's true blocks
    // today's payout, or a crash before save double-pays). questPaidDay can't.
    if (S.quest >= 8 && S.questPaidDay !== S.questDay) {
        S.questPaidDay = S.questDay;
        S._questPaid = true;
        S.xp += 150;
        S.coins += 30;
        save();
        toast('Daily quest complete — +150 XP.', 'scroll');
        confetti(100);
    }
    $('shieldLine').classList.toggle('hidden', !S.shield);
    const pips = $('comboPips');
    pips.innerHTML = '';
    for (let i = 0; i < 4; i++)
        pips.innerHTML += '<span class="h-3 flex-1 rounded-full" style="background:' + (i < G.combo ? 'var(--muted)' : 'var(--line)') + '"></span>';
    setText('mistakeCount', Object.keys(S.mistakes).filter(k => S.mistakes[k] > 0).length);
    setText('statTotalXp', S.xp.toLocaleString('en-US'));
    syncReviewBtn();
    updateShop();
    renderDecks();
}
function updateDeckProgress() {
    const total = CARDS.filter(c => c.deck === G.deckId).length;
    const m = CARDS.filter(c => c.deck === G.deckId && S.mastered[c.id]).length;
    const pct = total ? Math.round(m / total * 100) : 0;
    $('deckBar').style.width = pct + '%';
    setText('deckPct', pct + '%');
}
function updateShop() {
    const cards = G.mode === 'quiz' || G.mode === 'speed';
    $('shopShield').disabled = G.mode === 'trivia' || S.shield || S.coins < 50;
    $('shopHeart').disabled = G.mode === 'trivia' || S.coins < 40 || S.hearts >= 5;
    $('shopSkip').disabled = !cards || S.coins < 30;
    setText('shopNote', G.mode === 'learn' ? 'Lessons need no power-ups — just press Run.' : G.mode === 'build' ? 'Projects need no power-ups — just press Run.' : G.mode === 'algo' ? 'Algorithms need no power-ups — just press Run.' : G.mode === 'trivia' ? 'Power-ups rest in Trivia — no lives at stake.' : !cards ? 'Skip only works in Quiz and Speed.' : 'Power-ups work in Quiz and Speed.');
}
function tryPlayground() {
    const code = cur().code || '';
    window.open('https://go.dev/play/', '_blank');
    copyText(code).then(ok => showPlayHandoff(code, ok));
}
function openHelp() { $('helpModal').showModal(); }
const cvs = $('confetti');
const ctx = cvs.getContext('2d');
let parts = [];
let confettiRun = false;
function sizeCanvas() { cvs.width = innerWidth; cvs.height = innerHeight; }
addEventListener('resize', sizeCanvas);
sizeCanvas();
function confetti(n = 80) {
    try {
        if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches)
            return;
    }
    catch (_) { }
    const colors = ['#f5f5f4', '#D9A441', '#3FA67A', '#E04836', '#7DD3FC'];
    void 0;
    for (let i = 0; i < n; i++)
        parts.push({ x: innerWidth / 2 + (Math.random() - .5) * 260, y: innerHeight * 0.32, vx: (Math.random() - .5) * 11, vy: Math.random() * -9 - 2, g: .32, s: Math.random() * 7 + 3, c: colors[i % colors.length], r: Math.random() * Math.PI, vr: (Math.random() - .5) * .3, life: 90 + Math.random() * 40 });
    if (!confettiRun) {
        confettiRun = true;
        requestAnimationFrame(tickConf);
    }
}
function tickConf() {
    ctx.clearRect(0, 0, cvs.width, cvs.height);
    parts = parts.filter(p => p.life > 0 && p.y < innerHeight + 30);
    parts.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.g;
        p.r += p.vr;
        p.life--;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6);
        ctx.restore();
    });
    if (parts.length)
        requestAnimationFrame(tickConf);
    else {
        confettiRun = false;
        ctx.clearRect(0, 0, cvs.width, cvs.height);
    }
}
function syncDeckCard() {
    // Worlds, difficulty, shuffle, review and deck progress drive Quiz/Speed
    // cards only — hidden elsewhere instead of sitting around dimmed.
    const cards = G.mode === 'quiz' || G.mode === 'speed';
    $('deckCard').classList.toggle('hidden', !cards);
    $('deckQuizOnly').classList.toggle('hidden', !cards);
    $('deckProg').classList.toggle('hidden', !cards);
    $('reviewBtn').classList.toggle('hidden', !cards);
    $('shuffleBtn').classList.toggle('hidden', !cards);
}
function syncTabs() { document.querySelectorAll('.mode-tab').forEach(t => t.classList.toggle('on', t.dataset.mode === G.mode)); }
export { level, rankFor, updateHUD, updateDeckProgress, renderAch, unlock, checkAch, buyShield, buyHeart, revive, updateShop, syncTabs, syncDeckCard, confetti, tryPlayground, openHelp, needRevive, quip, showLevelUp, ACH_DEFS };
/* Moved to owning module. */
function quip() { return QUIPS[Math.floor(Math.random() * QUIPS.length)]; }
function showLevelUp() {
    setText('lvlNum', level());
    setText('lvlRank', rankFor(level()));
    setText('lvlBlurb', rankBlurb(level()));
    $('levelModal').showModal();
    sfx.level();
    confetti(160);
}
/* Progress portability: download the whole save, restore it anywhere. */
export function exportProgress() {
    try {
        const blob = new Blob([JSON.stringify(S)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'goauntlet-' + dayStr() + '.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        toast('Progress exported — keep the file safe.', 'download');
    }
    catch (e) {
        toast('Export failed in this browser.', 'warning');
    }
}
export function importProgressFile(input) {
    const f = input.files && input.files[0];
    if (!f)
        return;
    const rd = new FileReader();
    rd.onload = () => {
        try {
            const obj = JSON.parse(String(rd.result || '{}'));
            if (!obj || typeof obj.xp !== 'number' || typeof obj.mastered !== 'object')
                throw new Error('bad file');
            if (typeof obj.v === 'number' && obj.v > SAVE_VERSION) {
                toast('That backup is from a NEWER app — open it there, or update this copy first.', 'warning');
                return;
            }
            replaceState(obj);
            toast('Progress imported — reloading.', 'upload');
            setTimeout(() => location.reload(), 600);
        }
        catch (e) {
            toast('That file is not a progress backup.', 'warning');
        }
    };
    rd.readAsText(f);
    input.value = '';
}
