// util.ts — split from app.ts. Shared names come via import/export; inline onclick handlers are exposed on window by boot.ts.
// Dependency-free: safe to import from Node tests.
let soundOn = true;
let AC = null;
function beep(freq = 600, dur = .12, type = 'sine', vol = .05) {
    if (!soundOn)
        return;
    try {
        AC = AC || new (window.AudioContext || window.webkitAudioContext)();
        const o = AC.createOscillator(), g = AC.createGain();
        o.type = type;
        o.frequency.value = freq;
        g.gain.value = vol;
        o.connect(g);
        g.connect(AC.destination);
        o.start();
        g.gain.exponentialRampToValueAtTime(.0001, AC.currentTime + dur);
        o.stop(AC.currentTime + dur);
    }
    catch (e) { }
}
const sfx = {
    flip: () => beep(440, .08, 'triangle'),
    good: () => { beep(660, .1); setTimeout(() => beep(990, .15), 90); },
    bad: () => beep(170, .25, 'sawtooth', .04),
    coin: () => { beep(1240, .06, 'sine', .04); setTimeout(() => beep(1660, .1, 'sine', .04), 70); },
    level: () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, .16, 'triangle', .06), i * 110)); },
};
function toggleSound() { soundOn = !soundOn; const el = document.querySelector('#soundBtn i'); if (el)
    el.className = soundOn ? 'ph-bold ph-speaker-high' : 'ph-bold ph-speaker-slash'; }
function setText(id, v) { $(id).textContent = String(v); }
function $(id) {
    const el = document.getElementById(id);
    if (!el)
        throw new Error('missing element #' + id);
    return el;
}
if (typeof window !== 'undefined')
    window.addEventListener('error', function (e) { try {
        toast('Something broke: ' + (e.message || 'unknown error'), 'bug');
    }
    catch (_) { } });
/* Honest clipboard: modern API, legacy fallback, manual modal. Never claims success it didn't get. */
function fallbackCopy(t) {
    try {
        const ta = document.createElement('textarea');
        ta.value = t;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return ok;
    }
    catch (_) {
        return false;
    }
}
function copyText(t) {
    const txt = t || '';
    try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            return navigator.clipboard.writeText(txt).then(() => true).catch(() => fallbackCopy(txt));
        }
    }
    catch (_) { }
    return Promise.resolve(fallbackCopy(txt));
}
function showCopyFallback(code) {
    try {
        const box = document.getElementById('copyBox');
        if (box) {
            box.value = code;
            box.focus();
            box.select();
        }
        const dlg = document.getElementById('copyModal');
        if (dlg && !dlg.open)
            dlg.showModal();
    }
    catch (_) { }
    toast('Copy was blocked — grab the code below.', 'warning');
}
/* Playground handoff: go.dev/play always opens with ITS starter code — it
   cannot be prefilled by URL — so the transfer is clipboard + paste. A 2s
   toast is too easy to miss, so this modal stays until dismissed and always
   shows the code for manual copy as backup. */
function showPlayHandoff(code, copied) {
    try {
        const box = document.getElementById('copyBox');
        if (box) {
            box.value = code;
            box.focus();
            box.select();
        }
        const title = document.getElementById('copyTitle');
        if (title)
            title.textContent = copied ? 'Code copied — now paste it' : 'Copy blocked — grab it here';
        const msg = document.getElementById('copyMsg');
        if (msg)
            msg.textContent = copied
                ? 'The Playground opened in a new tab with its own starter code. Switch to it and paste (Ctrl+V / Cmd+V) to run YOUR code. Your code is also below as backup.'
                : 'Your browser refused clipboard access AND the Playground opened with its own starter code. Copy your code below, switch to the Playground tab, and paste (Ctrl+V / Cmd+V).';
        const dlg = document.getElementById('copyModal');
        if (dlg && !dlg.open)
            dlg.showModal();
    }
    catch (_) { }
    toast(copied ? 'Code copied — paste it into the Playground tab.' : 'Copy was blocked — grab the code below.', copied ? 'play' : 'warning');
}
function norm(s) { return (s || '').trim().replace(/\s+/g, ' '); }
function highlight(src) {
    const s = esc(src);
    const re = /(\/\/[^\n]*)|("(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`|'(?:[^'\\\n]|\\.)*')|\b(func|package|import|var|const|type|struct|interface|map|chan|go|select|case|default|if|else|for|range|return|defer|panic|switch|break|continue|fallthrough|iota|nil|true|false|new|make|len|cap|append|copy|delete)\b|\b(fmt|http|json|sync|time|strings|slices|maps|os|errors|context|strconv|template|testing)\b|\b(\d[\d_]*(?:\.\d+)?)\b|([A-Za-z_]\w*)(?=\s*\()/g;
    let out = '', last = 0;
    let m;
    while ((m = re.exec(s))) {
        out += s.slice(last, m.index);
        const tok = m[0];
        if (m[1])
            out += '<span class="tok-c">' + tok + '</span>';
        else if (m[2])
            out += '<span class="tok-s">' + tok + '</span>';
        else if (m[3])
            out += '<span class="tok-k">' + tok + '</span>';
        else if (m[4])
            out += '<span class="tok-f">' + tok + '</span>';
        else if (m[5])
            out += '<span class="tok-n">' + tok + '</span>';
        else if (m[6])
            out += '<span class="tok-p">' + tok + '</span>';
        else
            out += tok;
        last = m.index + tok.length;
    }
    return out + s.slice(last);
}
function pulse(el) { if (!el)
    return; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
function toast(msg, icon) {
    document.querySelectorAll('.arena-toast').forEach(t => t.remove());
    const t = document.createElement('div');
    t.className = 'arena-toast pop-in fixed left-1/2 top-4 z-[99] pl-3 pr-4 py-2.5 font-bold text-[13px] flex items-center gap-2.5';
    t.setAttribute('role', 'status');
    t.setAttribute('aria-live', 'polite');
    t.style.transform = 'translateX(-50%)';
    t.style.color = 'var(--text)';
    t.style.background = 'var(--surface-2)';
    t.style.border = '1px solid var(--line-strong)';
    t.style.borderRadius = 'var(--r-sm)';
    t.style.boxShadow = '0 12px 40px -8px rgba(0,0,0,.7)';
    t.style.maxWidth = '92vw';
    t.innerHTML = '<i class="ph-fill ph-' + (icon || 'info') + ' text-lg"></i><span>' + esc(msg) + '</span>';
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 320); }, 2100);
}
function xpBurst(txt) {
    const s = document.createElement('div');
    s.className = 'xp-float fixed left-1/2 top-[32%] font-extrabold text-[19px] mono px-4 py-1 rounded-full';
    s.style.background = 'var(--surface-2)';
    s.style.color = 'var(--text)';
    s.style.border = '1px solid var(--line-strong)';
    s.textContent = txt;
    $('xpLayer').appendChild(s);
    setTimeout(() => s.remove(), 1150);
}
function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
/* One floating tooltip for every [data-tip]: CSS-only tips clip inside
   scroll containers (the tab bar scrolls), so a fixed box follows the
   pointer instead. Hover, keyboard focus and touch all feed it. */
let tipBox = null;
function tipEl() {
    if (!tipBox) {
        tipBox = document.createElement('div');
        tipBox.id = 'tipBox';
        tipBox.setAttribute('role', 'tooltip');
        document.body.appendChild(tipBox);
    }
    return tipBox;
}
function placeTip(x, y) {
    const b = tipEl();
    const w = b.offsetWidth || 200, h = b.offsetHeight || 30;
    const lx = Math.min(Math.max(8, x - w / 2), window.innerWidth - w - 8);
    let ly = y - h - 14;
    if (ly < 8)
        ly = y + 20;
    b.style.left = lx + 'px';
    b.style.top = ly + 'px';
}
function showTipFor(el, x, y) {
    const b = tipEl();
    b.textContent = el.dataset.tip || '';
    b.classList.add('show');
    placeTip(x, y);
}
function hideTip() { if (tipBox)
    tipBox.classList.remove('show'); }
function tipTarget(e) {
    const t = e.target;
    return (t && t.closest ? t.closest('[data-tip]') : null);
}
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    document.addEventListener('mouseover', (e) => { const t = tipTarget(e); if (t)
        showTipFor(t, e.clientX, e.clientY); });
    document.addEventListener('mousemove', (e) => {
        const t = tipTarget(e);
        if (!t) {
            hideTip();
            return;
        }
        if (tipBox && tipBox.classList.contains('show')) {
            if (tipBox.textContent !== (t.dataset.tip || ''))
                tipBox.textContent = t.dataset.tip || '';
            placeTip(e.clientX, e.clientY);
        }
        else
            showTipFor(t, e.clientX, e.clientY);
    });
    document.addEventListener('mouseout', (e) => {
        const from = tipTarget(e);
        const rel = e.relatedTarget;
        const to = rel && rel.closest ? rel.closest('[data-tip]') : null;
        if (from && from !== to)
            hideTip();
    });
    document.addEventListener('scroll', hideTip, true);
    document.addEventListener('focusin', (e) => {
        const t = tipTarget(e);
        if (!t)
            return;
        const r = t.getBoundingClientRect();
        showTipFor(t, r.left + r.width / 2, r.top);
    });
    document.addEventListener('focusout', hideTip);
}
export { $, setText, esc, norm, highlight, beep, toggleSound, sfx, pulse, toast, xpBurst, showIndicator, clearIndicator, copyText, showCopyFallback, showPlayHandoff };
/* Drop-insertion indicator shared by Order mode and lesson widgets. */
function showIndicator(pl, idx) {
    clearIndicator();
    const rows = [...pl.children].filter(x => x.classList && x.classList.contains('codeline'));
    if (idx >= rows.length) {
        const d = document.createElement('div');
        d.id = 'dropEnd';
        d.className = 'drop-line';
        pl.appendChild(d);
    }
    else
        rows[idx].classList.add('drop-before');
}
function clearIndicator() { document.querySelectorAll('.drop-before').forEach(x => x.classList.remove('drop-before')); const e = document.getElementById('dropEnd'); if (e)
    e.remove(); }
