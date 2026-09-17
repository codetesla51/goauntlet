// lessons.ts — split from app.ts. Shared names come via import/export; inline onclick handlers are exposed on window by boot.ts.
import { $, setText, esc, highlight, beep, sfx, toast, xpBurst, pulse, copyText, showCopyFallback, showPlayHandoff } from './util.js';
import { LESSONS, PROJECTS, ALGOS } from './content.js';
import { S, save, touchActive, bumpQuest } from './state.js';
import { updateHUD, showLevelUp, confetti, level } from './ui.js';
import { normOut } from './logic.js';
import { mountArrange, mountCodeLines, mountOptions, mountTypeAnswer, mountTrace, mountScheduler } from './widgets.js';
/* Lessons are their own content model in data/lessons.json — never derived from quiz cards.
   Step kinds: read (lesson text + optional code) · run/fix (edit code, compile, match goal output)
   · order (drag or tap lines into running order). No lives, no grades, no wrong answers. */
let lesId = '';
let lesIdx = 0;
let lesPredicted = false;
let lesVizIdx = 0;
let flowKind = 'lesson';
let P = 'les';
function FLOWS() { return flowKind === 'lesson' ? LESSONS : flowKind === 'project' ? PROJECTS : ALGOS; }
function doneMap() { return flowKind === 'lesson' ? S.lessonsDone : flowKind === 'project' ? S.projectsDone : S.algosDone; }
function stepMap() { return flowKind === 'lesson' ? S.lessonStep : flowKind === 'project' ? S.projectStep : S.algoStep; }
function flowWord() { return flowKind === 'lesson' ? 'Lesson' : flowKind === 'project' ? 'Project' : 'Algorithm'; }
function zoneEl(which) {
    const ids = flowKind === 'lesson'
        ? { zone: 'lessonZone', picker: 'lessonPicker', player: 'lessonPlayer', list: 'lessonList' }
        : flowKind === 'project'
            ? { zone: 'buildZone', picker: 'projectPicker', player: 'projectPlayer', list: 'projectList' }
            : { zone: 'algoZone', picker: 'algoPicker', player: 'algoPlayer', list: 'algoList' };
    return $(ids[which]);
}
let lesStepDone = false;
let lesClaimed = {};
/* Arrange widgets (order + build steps) are shared components (widgets.ts):
   the engine only owns the green prefix + the step's line list. */
let lesOrdCtl = null;
let lesBldCtl = null;
// Leading correct run, painted green after a check so retry keeps what's right.
let lesOrdGood = 0;
let lesBldGood = 0;
let lesBldAll = [];
let lesSpotBtns = [];
/* Shuffle line indexes, guaranteeing a real shuffle (never pre-solved). */
function shuffledLines(n) {
    const pool = Array.from({ length: n }, (_, i) => i).sort(() => Math.random() - .5);
    if (n > 1 && pool.every((v, i) => v === i))
        pool.reverse();
    return pool;
}
function curLesson() {
    for (const l of FLOWS())
        if (l.id === lesId)
            return l;
    return null;
}
function curLesStep() {
    const l = curLesson();
    if (!l || !l.steps.length)
        return null;
    return l.steps[Math.min(lesIdx, l.steps.length - 1)];
}
function renderLessonPicker() { renderFlowPicker('lesson'); }
function renderProjectPicker() { renderFlowPicker('project'); }
function renderAlgoPicker() { renderFlowPicker('algo'); }
function renderFlowPicker(kind) {
    flowKind = kind;
    P = kind === 'lesson' ? 'les' : kind === 'project' ? 'pro' : 'alg';
    zoneEl('zone').classList.remove('hidden');
    zoneEl('player').classList.add('hidden');
    zoneEl('picker').classList.remove('hidden');
    const box = zoneEl('list');
    box.innerHTML = '';
    if (!FLOWS().length) {
        box.innerHTML = '<p class="text-[14px] p-4" style="color:var(--muted);">Nothing here yet — check data/' + (flowKind === 'lesson' ? 'lessons' : 'projects') + '.json, then reload.</p>';
        return;
    }
    FLOWS().forEach((l, n) => {
        const done = !!doneMap()[l.id];
        const at = Math.min(stepMap()[l.id] || 0, l.steps.length - 1);
        const label = done ? 'Done · replay' : (at > 0 ? 'Continue · step ' + (at + 1) + '/' + l.steps.length : 'Start · ' + l.steps.length + ' steps');
        const b = document.createElement('button');
        b.className = 'deck-row';
        b.setAttribute('aria-label', l.name + ', ' + label);
        b.dataset.tip = l.desc;
        b.innerHTML = '<span class="deck-ico"><i class="ph-fill ' + l.icon + '"></i></span>'
            + '<span class="min-w-0 flex-1"><span class="block font-bold text-[13.5px] leading-tight">' + (n + 1) + '. ' + esc(l.name) + (done ? ' · Done' : '') + '</span>'
            + '<span class="block text-[11px] truncate" style="color:var(--muted);">' + esc(l.desc) + '</span></span>'
            + '<span class="mono text-[11px] font-bold flex-none" style="color:var(--muted);">' + label + '</span>';
        b.onclick = () => startFlow(l.id);
        box.appendChild(b);
    });
}
function startFlow(id) {
    lesId = id;
    const l = curLesson();
    if (!l)
        return;
    lesIdx = doneMap()[id] ? 0 : Math.min(stepMap()[id] || 0, l.steps.length - 1);
    zoneEl('picker').classList.add('hidden');
    zoneEl('player').classList.remove('hidden');
    renderLesStep();
    beep(700, .05);
}
function lesBack() {
    persistLesStep();
    renderFlowPicker(flowKind);
}
function persistLesStep() {
    if (lesId && !doneMap()[lesId]) {
        stepMap()[lesId] = lesIdx;
        save();
    }
}
function claimLesXP(key, xp, coins) {
    if (lesClaimed[key])
        return;
    lesClaimed[key] = true;
    touchActive();
    const before = level();
    S.xp += xp;
    S.coins += coins;
    save();
    updateHUD();
    sfx.coin();
    xpBurst('+' + xp + ' XP');
    if (level() > before)
        setTimeout(showLevelUp, 450);
}
function renderLesStep() {
    const l = curLesson();
    const s = curLesStep();
    if (!l || !s) {
        renderFlowPicker(flowKind);
        return;
    }
    // Reading IS the step for read kinds; interactive kinds unlock Next on completion.
    lesStepDone = s.kind === 'read' ? true : !!lesClaimed[flowKind + ':' + lesId + ':' + lesIdx];
    persistLesStep();
    setText(P + 'Name', l.name.toUpperCase());
    setText(P + 'Num', lesIdx + 1);
    setText(P + 'Total', l.steps.length);
    $(P + 'Bar').style.width = ((lesIdx + 1) / l.steps.length * 100) + '%';
    setText(P + 'Title', s.title);
    $(P + 'Text').innerHTML = s.text.split('\n\n').map(p => '<p>' + esc(p) + '</p>').join('');
    $(P + 'ReadWrap').classList.toggle('hidden', !(s.kind === 'read' && !!s.code));
    $(P + 'EditWrap').classList.toggle('hidden', !(s.kind === 'run' || s.kind === 'fix'));
    $(P + 'OrderWrap').classList.toggle('hidden', s.kind !== 'order');
    $(P + 'SpotWrap').classList.toggle('hidden', s.kind !== 'spot');
    $(P + 'BuildWrap').classList.toggle('hidden', s.kind !== 'build');
    $(P + 'VizWrap').classList.toggle('hidden', s.kind !== 'visual');
    $(P + 'QuizWrap').classList.toggle('hidden', s.kind !== 'quiz');
    // Component kinds (type/trace/sched) mount into one shared Stage per
    // player instead of needing bespoke static markup per kind per flow.
    const staged = s.kind === 'type' || s.kind === 'trace' || s.kind === 'sched';
    $(P + 'Stage').classList.toggle('hidden', !staged);
    $(P + 'Stage').innerHTML = '';
    $(P + 'Verdict').classList.add('hidden');
    $(P + 'Verdict').innerHTML = '';
    $(P + 'HintLine').classList.add('hidden');
    if (s.kind === 'read' && s.code) {
        $(P + 'ReadCode').innerHTML = highlight(s.code).split('\n').map((ln, i) => '<span class="crow"><span class="cno">' + (i + 1) + '</span><span>' + (ln || ' ') + '</span></span>').join('');
    }
    if (s.kind === 'visual' && s.viz) {
        lesVizIdx = 0;
        paintLesViz();
    }
    if (s.kind === 'quiz' && s.quiz)
        paintLesQuiz();
    if (s.kind === 'run' || s.kind === 'fix') {
        ($(P + 'Code')).value = s.code || '';
        lesHighlight();
        setText(P + 'Goal', s.goal || s.expected || '');
        setText(P + 'Out', lesStepDone ? 'Step complete — press Run to play some more.' : 'Press Run to compile your code.');
        // Predict-first gate: Run stays locked until the player calls the starter's output.
        const gated = !!s.predict && !lesStepDone;
        lesPredicted = !gated;
        ($(P + 'RunBtn')).disabled = gated;
        paintLesPredict(gated);
    }
    if (s.kind === 'order' && s.lines) {
        lesOrdGood = 0;
        lesOrdCtl = mountArrange({
            poolEl: $(P + 'OrdPool'), placedEl: $(P + 'OrdPlaced'), undoBtn: $(P + 'OrdUndo'),
            lines: s.lines, emptyText: 'Nothing placed yet — tap a line above.',
            sortPoolOnRemove: false, isLocked: () => false,
            goodPrefix: () => lesOrdGood, lockedMarks: () => false, isCorrectAt: () => false,
            onInput: () => { lesOrdGood = 0; $(P + 'Verdict').classList.add('hidden'); beep(500, .05); },
            pool: shuffledLines(s.lines.length),
        });
    }
    if (s.kind === 'spot' && s.code)
        paintLesSpot();
    if (s.kind === 'type' && s.typeA) {
        const ta = s.typeA;
        mountTypeAnswer($(P + 'Stage'), {
            answer: ta.answer, why: ta.why,
            onPass: (why) => lesStepComplete('Typed, not tapped. ' + why),
            onFail: () => sfx.bad(),
        });
    }
    if (s.kind === 'trace' && s.trace) {
        mountTrace($(P + 'Stage'), {
            title: (l ? l.name : flowKind) + ' — trace',
            show: s.trace,
            onFinish: () => lesStepComplete('You watched the whole thing — now you think in frames.'),
        });
    }
    if (s.kind === 'sched' && s.sched) {
        mountScheduler($(P + 'Stage'), {
            show: s.sched,
            onPass: (msg) => lesStepComplete(msg),
            onStuck: (msg) => { lesShowVerdict(false, msg, ''); sfx.bad(); },
            onTick: () => beep(700, .04),
        });
    }
    if (s.kind === 'build' && s.lines) {
        lesBldAll = s.lines.concat(s.decoys || []);
        lesBldGood = 0;
        lesBldCtl = mountArrange({
            poolEl: $(P + 'BldPool'), placedEl: $(P + 'BldPlaced'), undoBtn: $(P + 'BldUndo'),
            lines: lesBldAll, emptyText: 'Nothing placed yet — tap a line above. Watch for decoys.',
            sortPoolOnRemove: false, isLocked: () => false,
            goodPrefix: () => lesBldGood, lockedMarks: () => false, isCorrectAt: () => false,
            onInput: () => { lesBldGood = 0; $(P + 'Verdict').classList.add('hidden'); beep(500, .05); },
            pool: shuffledLines(lesBldAll.length),
        });
    }
    syncLesNav();
}
/* Predict-first gate (shared by render + Reset): mounting fresh options asks
   the question again and re-locks Run; hiding keeps a locked-in/completed
   prediction standing. Top-level so lesReset can re-arm the same gate. */
function paintLesPredict(show) {
    const wrap = $(P + 'Predict');
    wrap.classList.toggle('hidden', !show);
    if (!show)
        return;
    const s = curLesStep();
    const opts = (s && s.predict && s.predict.options) || [];
    mountOptions($(P + 'PredictOpts'), opts, (i) => lesPredictPick(i), { btnClass: 'tokbtn pred-opt', animate: false });
    setText(P + 'PredictMsg', 'Study the code, then commit: what will it print?');
}
function lesPredictPick(i) {
    const s = curLesStep();
    if (!s || !s.predict)
        return;
    if (i === s.predict.answer) {
        lesPredicted = true;
        $(P + 'PredictOpts').innerHTML = '';
        setText(P + 'PredictMsg', 'Locked in — and right. Press Run to confirm it for real.');
        ($(P + 'RunBtn')).disabled = false;
        beep(880, .07);
    }
    else {
        setText(P + 'PredictMsg', 'Not quite — Run stays locked. Trace it line by line, then pick again.');
        sfx.bad();
    }
}
function syncLesNav() {
    const l = curLesson();
    const last = !!l && lesIdx >= l.steps.length - 1;
    ($(P + 'PrevBtn')).disabled = lesIdx <= 0;
    const nx = $(P + 'NextBtn');
    // Next is never hard-disabled: a locked click explains itself instead of swallowing the tap.
    nx.removeAttribute('disabled');
    nx.classList.toggle('btn-locked', !lesStepDone);
    nx.setAttribute('aria-disabled', String(!lesStepDone));
    nx.innerHTML = last ? 'Finish ' + flowKind + ' <i class="ph-bold ph-trophy"></i>' : 'Next <i class="ph-bold ph-caret-right"></i>';
}
function lesNext() {
    const l = curLesson();
    const s = curLesStep();
    if (!l || !s)
        return;
    if (!lesStepDone) {
        lesExplainLock();
        return;
    }
    if (s.kind === 'read')
        claimLesXP(flowKind + ':' + lesId + ':' + lesIdx, 10, 2);
    if (lesIdx >= l.steps.length - 1) {
        completeLesson();
        return;
    }
    lesIdx++;
    renderLesStep();
    popLes();
}
function lesExplainLock() {
    const s = curLesStep();
    const k = s ? s.kind : '';
    if (k === 'run' || k === 'fix') {
        if (s && s.predict && !lesPredicted) {
            toast('Call it first — pick what the code prints. Run unlocks after.', 'crystal-ball');
            pulse($(P + 'Predict'));
        }
        else {
            toast('Press Run and match the goal output exactly.', 'play');
            pulse($(P + 'RunBtn'));
        }
    }
    else if (k === 'order') {
        toast('Place every line in order, then Check order.', 'list-numbers');
        pulse($(P + 'OrderWrap'));
    }
    else if (k === 'build') {
        toast('Place every true line, then Check build.', 'hammer');
        pulse($(P + 'BuildWrap'));
    }
    else if (k === 'spot') {
        toast('Tap the broken line first — wrong taps cost nothing.', 'hand-pointing');
        pulse($(P + 'SpotWrap'));
    }
    else if (k === 'quiz') {
        toast('Pick an answer — wrong picks cost nothing.', 'question');
        pulse($(P + 'QuizWrap'));
    }
    else if (k === 'type') {
        toast('Type the exact output, then Check — wrong tries cost nothing.', 'keyboard');
        pulse($(P + 'Stage'));
    }
    else if (k === 'trace') {
        toast('Step through to the end — the last frame completes the step.', 'slideshow');
        pulse($(P + 'Stage'));
    }
    else if (k === 'sched') {
        toast('Run every op toward the goal — Reset rewinds a bad schedule.', 'users-three');
        pulse($(P + 'Stage'));
    }
    else
        toast('Finish this step first.', 'hand-pointing');
}
function lesPrev() {
    if (lesIdx <= 0)
        return;
    lesIdx--;
    renderLesStep();
    popLes();
}
function popLes() { const el = zoneEl('player'); el.classList.remove('pop-in'); void el.offsetWidth; el.classList.add('pop-in'); }
function completeLesson() {
    const l = curLesson();
    if (!l)
        return;
    if (!doneMap()[lesId]) {
        doneMap()[lesId] = true;
        delete stepMap()[lesId];
        touchActive();
        bumpQuest(1);
        S.xp += 25;
        S.coins += 10;
        save();
        updateHUD();
        confetti(120);
        sfx.level();
        toast(flowWord() + ' complete: ' + l.name + ' — +25 XP.', 'trophy');
    }
    lesBack();
}
/* Editor: transparent textarea over highlighted code, synced scroll, Tab inserts spaces. */
function lesHighlight() {
    // No line numbers in the overlay: the ghost text must sit EXACTLY under
    // the caret, so the highlight uses the same bare text the textarea holds.
    const v = $(P + 'Code').value;
    $(P + 'Hl').innerHTML = highlight(v) + '\n';
    lesSyncScroll();
}
function lesSyncScroll() {
    const ta = $(P + 'Code');
    const pre = $(P + 'HlWrap');
    pre.scrollTop = ta.scrollTop;
    pre.scrollLeft = ta.scrollLeft;
}
function lesShowVerdict(ok, head, sub) {
    const box = $(P + 'Verdict');
    box.classList.remove('hidden');
    box.style.borderColor = ok ? '#3FA67A' : '#E04836';
    box.innerHTML = '<p class="font-extrabold flex items-center gap-2"><i class="ph-fill ' + (ok ? 'ph-check-circle' : 'ph-x-circle') + ' text-xl" style="color:' + (ok ? '#3FA67A' : '#E04836') + '"></i>' + esc(head) + '</p>'
        + (sub ? '<p class="text-[13.5px] leading-relaxed mt-1.5" style="color:var(--muted);">' + esc(sub) + '</p>' : '');
}
async function lesRun() {
    const s = curLesStep();
    if (!s || (s.kind !== 'run' && s.kind !== 'fix'))
        return;
    // The compile round-trip is slow: if the player moved on meanwhile, drop the stale result.
    const kind = flowKind, fid = lesId, fidx = lesIdx;
    const alive = () => flowKind === kind && lesId === fid && lesIdx === fidx;
    const btn = $(P + 'RunBtn');
    btn.disabled = true;
    const code = $(P + 'Code').value;
    // Running state: dim the terminal, spin a loader, clear the stale verdict.
    // Static strings only — user code is never echoed into innerHTML.
    const out = $(P + 'Out');
    out.style.opacity = '.55';
    out.innerHTML = '$ go run main.go<br><span class="spin" aria-hidden="true"></span>compiling… (the Go sandbox can take up to a minute on slow networks)';
    $(P + 'Verdict').classList.add('hidden');
    const done = () => { btn.disabled = false; out.style.opacity = ''; };
    try {
        const ctl = new AbortController();
        // Must outlast slow networks but stay under the proxy's own timeout.
        const t = setTimeout(() => ctl.abort(), 90000);
        let res;
        try {
            res = await fetch('/api/compile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }), signal: ctl.signal });
        }
        finally {
            clearTimeout(t);
        }
        if (!res.ok)
            throw new Error('HTTP ' + res.status);
        const j = await res.json();
        if (!alive()) {
            done();
            return;
        }
        if (j.errors) {
            setText(P + 'Out', '$ go run main.go\n' + j.errors);
            lesShowVerdict(false, 'The compiler says no — good. Read the FIRST error line: it names the exact line.', (j.errors.split('\n')[0] || ''));
        }
        else {
            const got = normOut(j.output || '');
            const want = normOut(s.expected || '');
            setText(P + 'Out', '$ go run main.go\n' + (j.output || '(no output)') + '\n— exit 0');
            if (got === want)
                lesStepComplete("It ran, and the output matches the goal. That wasn't luck — that was you.");
            else
                lesShowVerdict(false, "It compiled! But the output isn't the goal yet.", 'Compare them line by line. The goal box above shows exactly what success looks like.');
        }
    }
    catch (e) {
        if (!alive()) {
            done();
            return;
        }
        setText(P + 'Out', '$ go run main.go\n…could not reach the compiler.');
        lesShowVerdict(false, 'No compiler reachable.', 'Run the app with npm run serve (it carries a compile proxy) and check your connection — slow networks can need a full minute, so try Run once more — or press Playground to run this code on go.dev.');
    }
    done();
}
function lesStepComplete(msg) {
    if (lesStepDone)
        return;
    lesStepDone = true;
    claimLesXP(flowKind + ':' + lesId + ':' + lesIdx, 10, 2);
    confetti(50);
    sfx.good();
    lesShowVerdict(true, msg, 'Next step is unlocked below.');
    syncLesNav();
}
function lesReset() {
    const s = curLesStep();
    if (!s)
        return;
    // Reset is wired to the editor panels only; non-editor steps have no code.
    if (s.kind !== 'run' && s.kind !== 'fix') {
        $(P + 'Verdict').classList.add('hidden');
        return;
    }
    ($(P + 'Code')).value = s.code || '';
    lesHighlight();
    $(P + 'Verdict').classList.add('hidden');
    if (lesStepDone) {
        // Completed steps stay completed (XP claimed once, Next unlocked):
        // Reset just restores the starter code for experimentation.
        setText(P + 'Out', 'Step complete — press Run to play some more.');
        ($(P + 'RunBtn')).disabled = false;
        paintLesPredict(false);
        return;
    }
    // Same question fresh: restore the starter code AND re-ask the prediction,
    // so Run re-locks until the player calls the output again.
    if (s.predict) {
        lesPredicted = false;
        ($(P + 'RunBtn')).disabled = true;
        paintLesPredict(true);
    }
    else {
        ($(P + 'RunBtn')).disabled = false;
        paintLesPredict(false);
    }
    setText(P + 'Out', 'Press Run to compile your code.');
}
function lesHint() {
    const s = curLesStep();
    if (!s)
        return;
    const h = $(P + 'HintLine');
    h.classList.remove('hidden');
    h.innerHTML = '<b>Hint:</b> ' + esc(s.hint || 'Read the step once more, slowly. The answer is hiding in plain sight.');
}
function lesCopyRead() {
    const s = curLesStep();
    const code = s && s.code ? s.code : '';
    copyText(code).then(ok => { if (ok)
        toast('Code copied.', 'copy');
    else
        showCopyFallback(code); });
}
function lesPlayground() {
    const ta = document.getElementById(P + 'Code');
    const code = ta && ta.value ? ta.value : '';
    window.open('https://go.dev/play/', '_blank');
    copyText(code).then(ok => showPlayHandoff(code, ok));
}
function lesReadToPlayground() {
    const s = curLesStep();
    const code = s && s.code ? s.code : '';
    window.open('https://go.dev/play/', '_blank');
    copyText(code).then(ok => showPlayHandoff(code, ok));
}
/* Order widget: fresh lesson-local drag-and-drop (tap works everywhere, drag on desktop). */
function paintLesViz() {
    const s = curLesStep();
    if (!s || !s.viz)
        return;
    const viz = s.viz;
    const f = viz.frames[Math.min(lesVizIdx, viz.frames.length - 1)];
    setText(P + 'VizTarget', viz.target);
    setText(P + 'VizCount', (lesVizIdx + 1) + '/' + viz.frames.length);
    setText(P + 'VizNote', f.note);
    const box = $(P + 'VizBricks');
    box.innerHTML = '';
    viz.nums.forEach((v, i) => {
        const elim = i < f.low || i > f.high;
        const cls = f.found === i ? 'viz-brick found' : f.mid === i ? 'viz-brick mid' : elim ? 'viz-brick elim' : 'viz-brick';
        const ptr = (i === f.low && i === f.high) ? 'L·H' : i === f.low ? 'L' : i === f.high ? 'H' : '';
        const ptrMid = f.mid === i ? (ptr ? ptr + '·M' : 'M') : ptr;
        const cell = document.createElement('span');
        cell.className = 'viz-cell';
        const b = document.createElement('span');
        b.className = cls;
        b.textContent = String(v);
        const mk = document.createElement('span');
        mk.className = 'viz-ptr';
        mk.textContent = ptrMid || '\u00a0';
        cell.appendChild(b);
        cell.appendChild(mk);
        box.appendChild(cell);
    });
    ($(P + 'VizPrev')).disabled = lesVizIdx <= 0;
    ($(P + 'VizNext')).disabled = lesVizIdx >= viz.frames.length - 1;
    $(P + 'VizPrev').onclick = () => { if (lesVizIdx > 0) {
        lesVizIdx--;
        paintLesViz();
    } };
    $(P + 'VizNext').onclick = () => {
        if (lesVizIdx < viz.frames.length - 1) {
            lesVizIdx++;
            paintLesViz();
            if (lesVizIdx >= viz.frames.length - 1)
                lesStepComplete('You watched the whole hunt — now you think in halves.');
        }
    };
    $(P + 'VizReplay').onclick = () => { lesVizIdx = 0; paintLesViz(); };
}
function paintLesQuiz() {
    const s = curLesStep();
    if (!s || !s.quiz)
        return;
    $(P + 'QuizMsg').classList.add('hidden');
    mountOptions($(P + 'QuizOpts'), s.quiz.options, (i) => lesQuizPick(i), { btnClass: 'tokbtn pred-opt', animate: false });
}
function lesQuizPick(i) {
    const s = curLesStep();
    if (!s || !s.quiz)
        return;
    const msg = $(P + 'QuizMsg');
    msg.classList.remove('hidden');
    if (i === s.quiz.answer) {
        msg.textContent = 'Right. ' + s.quiz.why;
        $(P + 'QuizOpts').innerHTML = '';
        lesStepComplete('Checked — and understood, not guessed.');
    }
    else {
        msg.textContent = 'Not quite — wrong picks cost nothing here. Re-read the step above, then pick again.';
        sfx.bad();
    }
}
function lesResetOrder() {
    const s = curLesStep();
    if (!s || !s.lines || !lesOrdCtl)
        return;
    lesOrdCtl.reset(shuffledLines(s.lines.length));
}
function lesUndoOrd() { if (lesOrdCtl)
    lesOrdCtl.undoLast(); }
function lesUndoBld() { if (lesBldCtl)
    lesBldCtl.undoLast(); }
function lesCheckOrder() {
    const s = curLesStep();
    if (!s || !s.lines || !lesOrdCtl)
        return;
    const placed = lesOrdCtl.placed;
    let firstBad = 0;
    while (firstBad < placed.length && placed[firstBad] === firstBad)
        firstBad++;
    if (placed.length === s.lines.length && firstBad === s.lines.length) {
        lesOrdGood = s.lines.length;
        lesOrdCtl.paint();
        lesStepComplete('Correct order — that program would actually run.');
        return;
    }
    lesOrdGood = firstBad;
    lesOrdCtl.paint();
    lesShowVerdict(false, 'Not quite yet — green lines are locked in.', firstBad < placed.length
        ? 'Position ' + (firstBad + 1) + ' is the first line that feels wrong. What has to come before anything can use it?'
        : 'You placed ' + placed.length + ' of ' + s.lines.length + ' lines — keep going. Hit Undo to take one back instead of starting over.');
    sfx.bad();
}
/* Spot-the-bug: lesson-local line tapping. Unlimited retries, zero penalty. */
function paintLesSpot() {
    const s = curLesStep();
    const lines = (s && s.code ? s.code : '').split('\n');
    lesSpotBtns = mountCodeLines($(P + 'SpotLines'), lines.map((ln, i) => ({ gutter: String(i + 1), codeHtml: highlight(ln), aria: 'Line ' + (i + 1) + ': ' + ln })), (i) => lesSpotPick(i));
}
function lesSpotPick(i) {
    const s = curLesStep();
    if (!s || lesStepDone)
        return;
    if (i === s.bug) {
        lesSpotBtns.forEach((b, j) => { b.disabled = true; b.classList.add(j === i ? 'good' : 'dim'); });
        lesStepComplete('Bug found: ' + (s.bugName || 'that line') + '. Eyes like that catch real bugs.');
        return;
    }
    const btn = lesSpotBtns[i];
    if (btn) {
        btn.classList.add('shake');
        setTimeout(() => btn.classList.remove('shake'), 500);
    }
    lesShowVerdict(false, 'Line ' + (i + 1) + ' is innocent.', 'The bug is sneakier. ' + (s.hint || 'Look for the line the compiler would shout about.'));
    sfx.bad();
}
function lesResetBuild() {
    if (!lesBldCtl)
        return;
    lesBldCtl.reset(shuffledLines(lesBldAll.length));
}
function lesCheckBuild() {
    const s = curLesStep();
    if (!s || !s.lines || !lesBldCtl)
        return;
    const placed = lesBldCtl.placed;
    const n = s.lines.length;
    let firstBad = 0;
    while (firstBad < placed.length && placed[firstBad] === firstBad)
        firstBad++;
    if (placed.length === n && firstBad === n) {
        lesBldGood = n;
        lesBldCtl.paint();
        lesStepComplete('Clean build — right lines, right order, decoys dodged.');
        return;
    }
    lesBldGood = firstBad;
    lesBldCtl.paint();
    const decoyAt = placed.findIndex((v) => v >= n);
    if (decoyAt !== -1)
        lesShowVerdict(false, 'Position ' + (decoyAt + 1) + ' of your build is an impostor — green lines are locked in.', 'One pool line looks right but breaks the program. Tap it to send it back, or Undo one step.');
    else if (placed.length !== n)
        lesShowVerdict(false, 'Not the whole program yet — green lines are locked in.', 'You placed ' + placed.length + ' of ' + n + ' needed lines.');
    else
        lesShowVerdict(false, 'Right lines, wrong order — green lines are locked in.', 'Position ' + (firstBad + 1) + ' is the first line out of place. What has to come before it?');
    sfx.bad();
}
export { renderLessonPicker, renderProjectPicker, renderAlgoPicker, startFlow, lesNext, lesHighlight, lesSyncScroll, lesBack, lesPrev, lesHint, lesCopyRead, lesReadToPlayground, lesRun, lesReset, lesPlayground, lesCheckOrder, lesResetOrder, lesCheckBuild, lesResetBuild, lesUndoOrd, lesUndoBld };
