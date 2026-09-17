// boot.ts — split from app.ts. Shared names come via import/export; inline onclick handlers are exposed on window by boot.ts.
import { $, toast, beep } from './util.js';
import { DECKS, CARDS, loadContent, showContentError, contentManifest } from './content.js';
import { G, persistUI, migrateProgress, reconcileContent } from './state.js';
import { updateHUD, renderAch, syncTabs, updateShop, syncDeckCard, exportProgress, importProgressFile } from './ui.js';
import { buildQueue, startTrivia, startDebug, startOrder, resetReviewMode, speedTimer, trivTimer, syncReviewBtn } from './quiz.js';
import { renderLessonPicker, renderProjectPicker, renderAlgoPicker, lesHighlight, lesSyncScroll } from './lessons.js';
function goCards() {
    clearInterval(speedTimer);
    clearInterval(trivTimer);
    if (G.mode !== 'quiz' && G.mode !== 'speed')
        G.mode = 'quiz';
    syncTabs();
    persistUI();
    syncDeckCard();
    $('flipScene').classList.remove('hidden');
    $('deckProg').classList.remove('hidden');
    $('speedHud').classList.add('hidden');
    ['triviaZone', 'debugZone', 'buildZone', 'orderZone', 'lessonZone', 'algoZone'].forEach(id => $(id).classList.add('hidden'));
}
/* Single source of truth for which zone is visible. boot() and setMode()
   must agree, or fresh loads show the static skeleton next to real content. */
function syncZones() {
    ['triviaZone', 'debugZone', 'buildZone', 'orderZone', 'lessonZone', 'algoZone'].forEach(id => $(id).classList.add('hidden'));
    const cards = (G.mode === 'quiz' || G.mode === 'speed');
    $('flipScene').classList.toggle('hidden', !cards);
    $('quizHead').classList.toggle('hidden', !cards);
    $('deckProg').classList.toggle('hidden', !cards);
    $('speedHud').classList.toggle('hidden', G.mode !== 'speed');
}
function setMode(m) {
    G.mode = m;
    clearInterval(speedTimer);
    clearInterval(trivTimer);
    resetReviewMode();
    syncReviewBtn();
    syncTabs();
    persistUI();
    syncDeckCard();
    syncZones();
    if (m === 'learn')
        renderLessonPicker();
    else if (m === 'speed')
        startSpeed();
    else if (m === 'quiz')
        buildQueue();
    else if (m === 'trivia')
        startTrivia();
    else if (m === 'debug')
        startDebug();
    else if (m === 'build')
        renderProjectPicker();
    else if (m === 'order')
        startOrder();
    else if (m === 'algo')
        renderAlgoPicker();
    else
        buildQueue();
    beep(600, .05);
    try {
        $('modeRow').scrollIntoView({ block: 'nearest' });
    }
    catch (_) { }
    updateShop();
}
document.querySelectorAll('.mode-tab').forEach(t => t.onclick = () => setMode(t.dataset.mode ?? 'learn'));
/* Guided-flow editor wiring, both players (elements are static; content loads later).
   Guarded: a stale cached page must never kill startup before boot() runs. */
try {
    for (const codeId of ['lesCode', 'proCode', 'algCode']) {
        $(codeId).addEventListener('input', lesHighlight);
        $(codeId).addEventListener('scroll', lesSyncScroll);
        $(codeId).addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                const ta = e.target;
                const st = ta.selectionStart ?? 0;
                const en = ta.selectionEnd ?? st;
                ta.value = ta.value.slice(0, st) + '  ' + ta.value.slice(en);
                ta.selectionStart = ta.selectionEnd = st + 2;
                lesHighlight();
            }
        });
    }
}
catch (e) {
    console.warn('[init] flow editor unavailable', e);
}
async function boot() {
    try {
        const warns = await loadContent();
        if (!DECKS.length || !CARDS.length) {
            showContentError('No content loaded. Check data/*.json, then reload.');
            console.warn('[content] warnings', warns);
            return;
        }
        if (!DECKS.some(d => d.id === G.deckId))
            G.deckId = DECKS[0].id;
        migrateProgress();
        // Content sync: new topics arrive fresh, removed ones get pruned — either
        // way the save stays valid. Must run after content loads (needs the ids).
        reconcileContent(contentManifest());
        updateHUD();
        renderAch();
        syncTabs();
        updateShop();
        syncDeckCard();
        syncZones();
        if (G.mode === 'trivia')
            startTrivia();
        else if (G.mode === 'debug')
            startDebug();
        else if (G.mode === 'build')
            renderProjectPicker();
        else if (G.mode === 'order')
            startOrder();
        else if (G.mode === 'algo')
            renderAlgoPicker();
        else if (G.mode === 'speed')
            startSpeed();
        else if (G.mode === 'learn')
            renderLessonPicker();
        else
            buildQueue();
        if (warns.length) {
            console.warn('[content] skipped ' + warns.length + ' item(s)', warns);
            toast(warns.length + ' content item(s) skipped — see console.', 'warning');
        }
        // Self-diagnosis for stale caches: the script URL carries ?v=N, the footer
        // carries build N. If they disagree, say so instead of acting haunted.
        try {
            const jsV = /[?&]v=(\d+)/.exec(import.meta.url)?.[1];
            const stampEl = document.getElementById('buildStamp');
            const htmlV = stampEl && /build (\d+)/.exec(stampEl.textContent || '')?.[1];
            if (!stampEl || !htmlV) {
                document.title = 'OUTDATED — hard-reload · GOAUNTLET';
                toast('This page is outdated — hard-reload with Ctrl+Shift+R.', 'warning');
            }
            else if (jsV && jsV !== htmlV) {
                document.title = 'MISMATCH — hard-reload · GOAUNTLET';
                toast('Page (build ' + htmlV + ') and engine (build ' + jsV + ') disagree — hard-reload with Ctrl+Shift+R.', 'warning');
            }
        }
        catch (_) { }
    }
    catch (err) {
        console.error('[boot] startup failed', err);
        try {
            showContentError('Startup failed: ' + (err instanceof Error ? err.message : String(err)) + ' — reload the page.');
        }
        catch (_) { }
    }
}
{
    const eb = document.getElementById('expBtn');
    if (eb)
        eb.addEventListener('click', () => exportProgress());
    const ib = document.getElementById('impFile');
    if (ib)
        ib.addEventListener('change', () => importProgressFile(ib));
}
void boot();
/* Inline onclick="fn(...)" handlers resolve against window, not module scope —
   so every handler the HTML names is re-exported here in one place. */
import { nextCard, prevCard, skipCard, copyCode, starCard, useHint, studyConfirm, flipCard, toggleReview, shuffleQueue, triviaNext, dbgNext, ordNext, undoOrd, resetOrd, buySkip, dbgHint, startSpeed, } from './quiz.js';
import { lesBack, lesNext, lesPrev, lesHint, lesCopyRead, lesReadToPlayground, lesRun, lesReset, lesPlayground, lesCheckOrder, lesResetOrder, lesCheckBuild, lesResetBuild, lesUndoOrd, lesUndoBld, } from './lessons.js';
import { toggleSound } from './util.js';
import { buyShield, buyHeart, revive, tryPlayground, openHelp } from './ui.js';
Object.assign(window, {
    nextCard, prevCard, skipCard, copyCode, starCard, useHint, studyConfirm, flipCard,
    toggleReview, shuffleQueue, triviaNext, dbgNext,
    ordNext, undoOrd, resetOrd, buySkip, dbgHint, startSpeed, setMode,
    lesBack, lesNext, lesPrev, lesHint, lesCopyRead, lesReadToPlayground, lesRun, lesReset,
    lesPlayground, lesCheckOrder, lesResetOrder, lesCheckBuild, lesResetBuild,
    lesUndoOrd, lesUndoBld, toggleSound, buyShield, buyHeart, revive,
    tryPlayground, openHelp,
});
export { setMode, goCards };
