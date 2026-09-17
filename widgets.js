// widgets.ts — reusable hands-on components. Any mode, any collection.
//
// Why this file exists: every hands-on used to be reimplemented per mode
// (quiz order vs lesson order, debug tap-the-line vs lesson spot, quiz
// options vs trivia vs lesson predict). Same interaction, three codebases.
// These mounts are parameterized by ELEMENTS and CALLBACKS — no global IDs,
// no scoring, no lives, no XP. Game rules stay with the caller.
import { esc, highlight, showIndicator, clearIndicator } from './util.js';
import { insertionIndex, movePlacedAt, normOut } from './logic.js';
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
/* Option grid: lettered answer buttons. Covers quiz options, trivia,
   lesson predict gates and lesson quiz steps — they differ only in styling
   and what happens on pick. Returns the buttons for later marking. */
export function mountOptions(box, labels, onPick, o) {
    const cls = (o && o.btnClass) || 'opt';
    const ctaFirst = !o || o.ctaFirst !== false;
    const animate = !o || o.animate !== false;
    const keyHint = !o || o.keyHint !== false;
    box.innerHTML = '';
    return labels.map((t, i) => {
        const btn = document.createElement('button');
        btn.className = cls + (cls === 'opt' && ctaFirst && i === 0 ? ' answer-cta' : '');
        btn.setAttribute('aria-label', 'Answer ' + (LETTERS[i] || String(i + 1)) + ': ' + t);
        if (cls === 'opt') {
            btn.innerHTML = '<span class="optkey">' + (LETTERS[i] || '?') + '</span><span class="flex-1">' + esc(t) + '</span>'
                + (keyHint ? '<span class="text-[11px] mono" style="opacity:.4">' + (i + 1) + '</span>' : '');
        }
        else {
            const pre = document.createElement('span');
            pre.style.whiteSpace = 'pre-wrap';
            pre.textContent = t;
            btn.appendChild(pre);
        }
        btn.onclick = () => onPick(i, btn);
        if (animate) {
            btn.style.animationDelay = (i * 0.06) + 's';
            btn.classList.add('rise');
        }
        box.appendChild(btn);
        return btn;
    });
}
/* Grade an option grid after a pick: highlight the right answer, mark the
   wrong pick, dim the rest, freeze the grid. */
export function markOptions(btns, correctIdx, pickedIdx) {
    btns.forEach((b, i) => {
        b.classList.remove('answer-cta');
        if (i === correctIdx)
            b.classList.add('correct');
        else if (i === pickedIdx)
            b.classList.add('wrong');
        else
            b.classList.add('dim');
        b.disabled = true;
    });
}
/* Tap-the-line list: numbered code rows. Covers debug cases and lesson spot
   steps — same tap, different stakes (caller decides). */
export function mountCodeLines(box, rows, onPick, o) {
    const animate = !o || o.animate !== false;
    box.innerHTML = '';
    return rows.map((r, i) => {
        const b = document.createElement('button');
        b.className = 'codeline';
        b.setAttribute('aria-label', r.aria);
        b.innerHTML = '<span class="ln">' + r.gutter + '</span><span class="lc">' + r.codeHtml + '</span>';
        b.onclick = () => onPick(i, b);
        if (animate) {
            b.style.animationDelay = (i * 0.04) + 's';
            b.classList.add('rise');
        }
        box.appendChild(b);
        return b;
    });
}
export function mountArrange(h) {
    const grip = h.poolGripHtml || '::';
    const ctl = {
        pool: [...h.pool],
        placed: h.placed ? [...h.placed] : [],
        paint,
        reset(pool) { ctl.pool = [...pool]; ctl.placed = []; commit(); },
        undoLast() {
            const li = ctl.placed.pop();
            if (li === undefined)
                return;
            ctl.pool.push(li);
            if (h.sortPoolOnRemove)
                ctl.pool.sort((a, b) => a - b);
            commit();
        },
    };
    // Drag payload lives in the closure (never global): two arrangers can
    // coexist (e.g. lesson player + order zone) without stealing drops.
    let drag = null;
    let dropPos = -1;
    function commit() {
        h.onInput();
        if (!ctl.pool.length && !h.isLocked() && h.onPoolDrained)
            h.onPoolDrained();
        paint();
    }
    function tapPool(item) {
        if (h.isLocked())
            return;
        if (h.guardPlace && !h.guardPlace())
            return;
        ctl.pool = ctl.pool.filter((x) => x !== item);
        ctl.placed.push(item);
        commit();
    }
    function tapPlaced(pos) {
        if (h.isLocked() || pos < 0 || pos >= ctl.placed.length)
            return;
        const li = ctl.placed[pos];
        ctl.placed.splice(pos, 1);
        ctl.pool.push(li);
        if (h.sortPoolOnRemove)
            ctl.pool.sort((a, b) => a - b);
        commit();
    }
    function dropAt(pos) {
        const d = drag;
        drag = null;
        if (!d || h.isLocked())
            return;
        clearIndicator();
        dropPos = -1;
        if (d.src === 'pool') {
            if (h.guardPlace && !h.guardPlace())
                return;
            ctl.pool = ctl.pool.filter((x) => x !== d.i);
            ctl.placed.splice(Math.max(0, Math.min(pos, ctl.placed.length)), 0, d.i);
        }
        else {
            ctl.placed = movePlacedAt(ctl.placed, d.i, pos);
        }
        commit();
    }
    function paint() {
        const locked = h.isLocked();
        const good = h.goodPrefix();
        const full = locked && h.lockedMarks();
        h.poolEl.innerHTML = '';
        h.poolEl.ondragover = (e) => e.preventDefault();
        h.poolEl.ondrop = (e) => {
            e.preventDefault();
            if (!drag || drag.src === 'pool') {
                drag = null;
                return;
            }
            const mv = ctl.placed.splice(drag.i, 1)[0];
            ctl.pool.push(mv);
            if (h.sortPoolOnRemove)
                ctl.pool.sort((a, b) => a - b);
            drag = null;
            commit();
        };
        ctl.pool.forEach((li) => {
            const b = document.createElement('button');
            b.className = 'codeline';
            b.draggable = true;
            b.setAttribute('aria-label', 'Line: ' + h.lines[li]);
            b.innerHTML = '<span class="grip">' + grip + '</span><span class="lc">' + highlight(h.lines[li]) + '</span>';
            b.onclick = () => tapPool(li);
            b.ondragstart = (e) => { drag = { src: 'pool', i: li }; try {
                e.dataTransfer && e.dataTransfer.setData('text/plain', 'p' + li);
            }
            catch (_) { } };
            b.ondragend = () => { drag = null; };
            b.disabled = locked;
            h.poolEl.appendChild(b);
        });
        const pl = h.placedEl;
        pl.innerHTML = '';
        if (!ctl.placed.length) {
            pl.innerHTML = h.emptyHtml || ('<p class="text-[12.5px] p-3" style="color:var(--muted);">' + esc(h.emptyText) + '</p>');
        }
        ctl.placed.forEach((li, pos) => {
            const b = document.createElement('button');
            b.className = 'codeline' + (full ? (h.isCorrectAt(pos, li) ? ' good' : ' bad') : (pos < good ? ' good' : ''));
            b.draggable = true;
            b.setAttribute('aria-label', 'Placed ' + (pos + 1) + ': ' + h.lines[li]);
            b.innerHTML = '<span class="ln">' + (pos + 1) + '</span><span class="lc">' + highlight(h.lines[li]) + '</span>';
            b.onclick = () => tapPlaced(pos);
            b.ondragstart = (e) => { drag = { src: 'placed', i: pos }; try {
                e.dataTransfer && e.dataTransfer.setData('text/plain', 's' + pos);
            }
            catch (_) { } };
            b.ondragend = () => { drag = null; clearIndicator(); dropPos = -1; };
            b.ondragover = (e) => e.preventDefault();
            b.ondrop = (e) => { e.preventDefault(); e.stopPropagation(); dropAt(dropPos >= 0 ? dropPos : pos); };
            b.disabled = locked;
            pl.appendChild(b);
        });
        pl.ondragover = (e) => {
            e.preventDefault();
            if (locked)
                return;
            const rows = [...pl.children].filter((x) => x.classList && x.classList.contains('codeline'));
            const mids = rows.map((r) => { const b = r.getBoundingClientRect(); return b.top + b.height / 2; });
            dropPos = insertionIndex(mids, e.clientY);
            showIndicator(pl, dropPos);
        };
        // Parent handler covers gaps/empty space; row handlers stopPropagation.
        pl.ondrop = (e) => { e.preventDefault(); dropAt(dropPos >= 0 ? dropPos : ctl.placed.length); };
        pl.ondragleave = () => { clearIndicator(); };
        if (h.undoBtn)
            h.undoBtn.disabled = !ctl.placed.length;
    }
    paint();
    return ctl;
}
/* Typed answer: the learner types the exact output instead of tapping one.
   Recall beats recognition — this is the strict cousin of predict gates.
   Retries are unlimited (lesson style: wrong costs nothing). */
export function mountTypeAnswer(box, o) {
    box.innerHTML = '';
    const row = document.createElement('div');
    row.className = 'flex flex-wrap gap-2';
    const inp = document.createElement('input');
    inp.className = 'input input-bordered mono flex-1';
    inp.style.minWidth = '180px';
    inp.setAttribute('aria-label', 'Type the exact output');
    inp.placeholder = o.placeholder || 'Type the exact output…';
    inp.autocomplete = 'off';
    inp.autocapitalize = 'off';
    inp.spellcheck = false;
    const btn = document.createElement('button');
    btn.className = 'btn btn-sm btn-primary btn-bump';
    btn.innerHTML = '<i class="ph-bold ph-check"></i> Check';
    const msg = document.createElement('p');
    msg.className = 'hidden mt-2 text-[13px] p-3 w-full';
    msg.style.cssText = 'background:var(--surface-2);border:1px dashed var(--line-strong);border-radius:var(--r-sm);';
    const check = () => {
        if (btn.disabled)
            return;
        if (normOut(inp.value) === normOut(o.answer)) {
            btn.disabled = true;
            inp.disabled = true;
            msg.classList.add('hidden');
            o.onPass(o.why);
        }
        else {
            msg.classList.remove('hidden');
            msg.textContent = 'Not quite — wrong answers cost nothing here. Re-read the step above, then try again.';
            inp.classList.remove('shake');
            void inp.offsetWidth;
            inp.classList.add('shake');
            o.onFail();
        }
    };
    btn.onclick = check;
    inp.onkeydown = (e) => { if (e.key === 'Enter')
        check(); };
    row.appendChild(inp);
    row.appendChild(btn);
    box.appendChild(row);
    box.appendChild(msg);
    setTimeout(() => { try {
        inp.focus({ preventScroll: true });
    }
    catch (_) { } }, 50);
}
/* Trace stepper: generic captioned frames (memory snapshots, channel states,
   variable rows). The binary-search bricks were the prototype; this is the
   general machine — frames are authored data, not code. */
export function mountTrace(box, o) {
    box.innerHTML = '';
    const frames = o.show.frames;
    let idx = 0, finished = false;
    const win = document.createElement('div');
    win.className = 'codewin';
    const bar = document.createElement('div');
    bar.className = 'codewin-bar';
    bar.innerHTML = '<span class="dot red"></span><span class="dot"></span><span class="mono">' + esc(o.title) + '</span><span class="mono text-[11px] ml-auto" style="color:var(--muted);"></span>';
    const count = bar.querySelector('span:last-child');
    const lanes = document.createElement('div');
    lanes.className = 'viz-bricks';
    lanes.style.display = 'block';
    const note = document.createElement('p');
    note.className = 'viz-note';
    win.appendChild(bar);
    win.appendChild(lanes);
    win.appendChild(note);
    const row = document.createElement('div');
    row.className = 'flex flex-wrap gap-2 mt-3';
    const prev = document.createElement('button');
    prev.className = 'btn btn-sm btn-bump btn-ghostline';
    prev.innerHTML = '<i class="ph-bold ph-caret-left"></i> Back';
    const replay = document.createElement('button');
    replay.className = 'btn btn-sm btn-bump btn-ghostline';
    replay.innerHTML = '<i class="ph-bold ph-arrow-counter-clockwise"></i> Replay';
    const next = document.createElement('button');
    next.className = 'btn btn-sm btn-bump btn-primary';
    next.innerHTML = 'Next <i class="ph-bold ph-caret-right"></i>';
    function paint() {
        const f = frames[Math.min(idx, frames.length - 1)];
        if (count)
            count.textContent = (idx + 1) + '/' + frames.length;
        note.textContent = f.caption;
        lanes.innerHTML = '';
        f.lanes.forEach((lane) => {
            const lr = document.createElement('div');
            lr.style.marginBottom = '8px';
            const lab = document.createElement('div');
            lab.className = 'mono text-[11px] font-bold';
            lab.style.color = 'var(--muted)';
            lab.textContent = lane.label;
            const cells = document.createElement('div');
            cells.style.display = 'flex';
            cells.style.flexWrap = 'wrap';
            cells.style.gap = '8px';
            cells.style.marginTop = '4px';
            lane.cells.forEach((c, i) => {
                const b = document.createElement('span');
                const empty = c === '_';
                b.className = 'viz-brick' + ((lane.hi || []).indexOf(i) !== -1 ? ' mid' : empty ? ' elim' : '');
                b.textContent = empty ? '·' : c;
                cells.appendChild(b);
            });
            lr.appendChild(lab);
            lr.appendChild(cells);
            lanes.appendChild(lr);
        });
        prev.disabled = idx <= 0;
        next.disabled = false;
    }
    prev.onclick = () => { if (idx > 0) {
        idx--;
        paint();
    } };
    replay.onclick = () => { idx = 0; paint(); };
    next.onclick = () => {
        if (idx < frames.length - 1) {
            idx++;
            paint();
            if (idx >= frames.length - 1 && !finished) {
                finished = true;
                o.onFinish();
            }
        }
        else if (!finished) {
            finished = true;
            o.onFinish();
        }
    };
    row.appendChild(prev);
    row.appendChild(replay);
    row.appendChild(next);
    box.appendChild(win);
    box.appendChild(row);
    paint();
}
/* Scheduler sim ("you ARE the scheduler"): click a goroutine to run its next
   labeled op. Sends block on full buffers, recvs block on empty ones; when
   nobody can move with ops left, that is deadlock — sometimes the mission.
   Unbuffered channels are modeled as 1-slot handoffs: identical observable
   behavior for these scenarios, none of the rendezvous bookkeeping. */
export function mountScheduler(box, o) {
    box.innerHTML = '';
    const show = o.show;
    const capOf = (ch) => Math.max(0, show.channels[ch] || 0);
    const slotOf = (ch) => Math.max(1, capOf(ch));
    let bufs = {};
    let vars = {};
    let log = [];
    let seenLogs = {};
    let finished = false;
    const fired = {};
    const reset = (keepSeen) => {
        Object.keys(fired).forEach((k) => delete fired[Number(k)]);
        bufs = {};
        Object.keys(show.channels).forEach((c) => { bufs[c] = []; });
        vars = {};
        log = [];
        if (!keepSeen)
            seenLogs = {};
        finished = false;
    };
    reset(false);
    const win = document.createElement('div');
    win.className = 'codewin';
    win.innerHTML = '<div class="codewin-bar"><span class="dot red"></span><span class="dot"></span><span class="mono">scheduler — you pick who runs next</span></div>';
    const body = document.createElement('div');
    body.style.padding = '14px 14px 6px';
    const chanBox = document.createElement('div');
    const varLine = document.createElement('p');
    varLine.className = 'mono text-[12px] mt-2';
    varLine.style.color = 'var(--muted)';
    body.appendChild(chanBox);
    body.appendChild(varLine);
    const logPre = document.createElement('pre');
    logPre.className = 'mono text-[13px] p-3';
    logPre.style.cssText = 'white-space:pre-wrap;min-height:40px;border-top:1px solid var(--line);margin-top:8px;';
    const gorBox = document.createElement('div');
    gorBox.className = 'grid gap-1.5 mt-3';
    const foot = document.createElement('div');
    foot.className = 'flex flex-wrap gap-2 mt-3';
    const resetBtn = document.createElement('button');
    resetBtn.className = 'btn btn-sm btn-bump btn-ghostline';
    resetBtn.innerHTML = '<i class="ph-bold ph-arrow-counter-clockwise"></i> Reset run';
    resetBtn.onclick = () => { reset(true); paint(); };
    function runnable(opIdx) {
        const op = show.ops[opIdx];
        if (op.send) {
            const b = bufs[op.send.ch] || [];
            if (b.length >= slotOf(op.send.ch))
                return false;
        }
        if (op.recv) {
            const b = bufs[op.recv.ch] || [];
            if (!b.length)
                return false;
        }
        return true;
    }
    // Head op of a goroutine: first unfired op (>=0 when runnable, -1 when
    // blocked, -2 when the goroutine is done).
    function headOp(g) {
        for (let i = 0; i < show.ops.length; i++) {
            if (show.ops[i].gor !== g || fired[i])
                continue;
            return runnable(i) ? i : -1;
        }
        return -2;
    }
    function runOp(i) {
        const op = show.ops[i];
        fired[i] = true;
        if (op.send) {
            (bufs[op.send.ch] = bufs[op.send.ch] || []).push(op.send.val);
        }
        if (op.recv) {
            const b = bufs[op.recv.ch] || [];
            vars[op.recv.into] = b.length ? b.shift() : '';
        }
        if (op.set)
            vars[op.set.k] = op.set.v;
        if (op.add)
            vars[op.add.k] = String((Number(vars[op.add.k] || '0')) + op.add.by);
        if (op.print)
            log.push(op.print.replace(/\{(\w+)\}/g, (_, k) => vars[k] || ''));
        o.onTick();
    }
    function allFired() { return show.ops.every((_, i) => fired[i]); }
    function anyRunnable() {
        return show.goroutines.some((_, g) => {
            const h = headOp(g);
            return h >= 0;
        });
    }
    function key(l) { return l.join('|'); }
    function judge() {
        if (finished)
            return;
        const goal = show.goal.type;
        if (allFired()) {
            if (goal === 'drain') {
                finished = true;
                o.onPass(show.success);
                return;
            }
            if (goal === 'deadlock') {
                o.onStuck('You drained every op — but the mission was to TRAP the deadlock. Reset and find the schedule where nobody can move.');
                return;
            }
            if (goal === 'logs') {
                const k = key(log);
                const hit = (show.goal.anyOf || []).some((want) => key(want) === k);
                if (hit)
                    seenLogs[k] = true;
                const need = show.goal.needAll ? (show.goal.anyOf || []).length : 1;
                if (Object.keys(seenLogs).length >= need) {
                    finished = true;
                    o.onPass(show.success);
                    return;
                }
                o.onStuck(hit
                    ? 'That schedule printed [' + log.join(', ') + '] — one outcome banked (' + Object.keys(seenLogs).length + '/' + need + '). Reset and schedule differently for the other.'
                    : 'That schedule printed [' + log.join(', ') + '] — not a winning script. Reset and schedule differently.');
                return;
            }
        }
        if (!anyRunnable()) {
            if (goal === 'deadlock') {
                finished = true;
                o.onPass(show.success);
                return;
            }
            o.onStuck(show.stuckHint || 'Deadlock: ops remain but nobody can move — every head op waits on an empty (or full) channel. Reset and feed the waiters first.');
        }
    }
    function paint() {
        chanBox.innerHTML = '';
        Object.keys(show.channels).forEach((c) => {
            const n = slotOf(c);
            const b = bufs[c] || [];
            const row = document.createElement('div');
            row.style.marginBottom = '8px';
            const lab = document.createElement('div');
            lab.className = 'mono text-[11px] font-bold';
            lab.style.color = 'var(--muted)';
            lab.textContent = c + (capOf(c) === 0 ? ' (unbuffered)' : ' (cap ' + capOf(c) + ')');
            const cells = document.createElement('div');
            cells.style.display = 'flex';
            cells.style.flexWrap = 'wrap';
            cells.style.gap = '8px';
            cells.style.marginTop = '4px';
            for (let i = 0; i < n; i++) {
                const s = document.createElement('span');
                const v = b[i];
                s.className = 'viz-brick' + (v === undefined ? ' elim' : '');
                s.textContent = v === undefined ? '·' : v;
                cells.appendChild(s);
            }
            row.appendChild(lab);
            row.appendChild(cells);
            chanBox.appendChild(row);
        });
        const keys = Object.keys(vars);
        varLine.textContent = keys.length ? 'vars: ' + keys.map((k) => k + '=' + vars[k]).join('  ') : 'vars: (none yet)';
        logPre.textContent = log.length ? log.join('\n') : 'output will land here…';
        gorBox.innerHTML = '';
        show.goroutines.forEach((g, gi) => {
            const h = finished ? -2 : headOp(gi);
            const btn = document.createElement('button');
            btn.className = 'tokbtn';
            btn.style.textAlign = 'left';
            if (h === -2) {
                btn.innerHTML = '<span class="mono" style="opacity:.35;margin-right:8px">' + g + '</span><span>done ✓</span>';
                btn.disabled = true;
                btn.classList.add('dim');
            }
            else if (h === -1) {
                const op = show.ops.filter((x) => x.gor === gi)[countFired(gi)];
                btn.innerHTML = '<span class="mono" style="opacity:.35;margin-right:8px">' + g + '</span><span>blocked: ' + esc(op ? op.label : '') + '</span>';
                btn.disabled = true;
                btn.classList.add('dim');
            }
            else {
                const op = show.ops[h];
                btn.innerHTML = '<span class="mono" style="opacity:.35;margin-right:8px">' + g + '</span><span>' + esc(op.label) + '</span>';
                btn.onclick = () => { if (finished)
                    return; runOp(h); paint(); judge(); };
            }
            gorBox.appendChild(btn);
        });
    }
    function countFired(g) {
        let n = 0;
        show.ops.forEach((op, i) => { if (op.gor === g && fired[i])
            n++; });
        return n;
    }
    foot.appendChild(resetBtn);
    box.appendChild(win);
    win.appendChild(body);
    win.appendChild(logPre);
    box.appendChild(gorBox);
    box.appendChild(foot);
    paint();
    // Opening position can already be terminal (a sprung trap): judge it so a
    // deadlock-at-start still delivers its verdict instead of silence.
    judge();
}
