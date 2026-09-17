// quiz.ts — split from app.ts. Shared names come via import/export; inline onclick handlers are exposed on window by boot.ts.
import { $, setText, esc, norm, highlight, beep, sfx, toast, xpBurst, pulse, copyText, showCopyFallback } from './util.js';
import { DECKS, CARDS, TRIVIA, DEBUG, ORDER, LESSONS, PROJECTS, rankBlurb, rankNext } from './content.js';
import type { Card, TriviaQ, DebugCase, OrderQ } from './content.js';
import { S, G, save, persistUI, touchActive, bumpQuest } from './state.js';
import { updateHUD, renderAch, unlock, checkAch, level, rankFor, confetti, needRevive, syncTabs, quip, showLevelUp, updateDeckProgress } from './ui.js';
import { interleave, memorize, dueValue, freshFirst, mergeTriviaOrder, num } from './logic.js';
import { mountArrange, mountCodeLines, mountOptions, markOptions } from './widgets.js';
import type { ArrangeCtl } from './widgets.js';
import { setMode, goCards } from './boot.js';
import { lesNext } from './lessons.js';
// Quiz-owned mutable state (single owner: this module rebinds these).
let queue: Card[] = [];
let idx = 0, flipped = false, locked = false;
let speedTimer = 0, speedLeft = 60, speedScore = 0;
let reviewMode = false;
let trivTimer = 0;
const TIER: Record<string, number> = { rookie: 0, gopher: 1, boss: 2 };
let lastTier = -1, clearedPaid = false;
let attempted: Record<string, boolean> = {};
function isBoss(c: Card, i: number): boolean { return c.diff==='boss' || (i%10===9); }
function filteredCards(): Card[] { return CARDS.filter(c=>c.deck===G.deckId && (G.diff==='all'||c.diff===G.diff)); }
function cur(){ return queue[idx%queue.length]; }
function tierName(t: number): string { return ['ROOKIE','GOPHER','BOSS'][t]||''; }
function renderStages(){
  const el=$('stageDots'); if(!el || !queue.length) return;
  const seen: Record<string, boolean> = {}; queue.forEach(c=>seen[TIER[c.diff]||0]=true);
  const tiers=Object.keys(seen).map(Number).sort((a,b)=>a-b);
  const mine=TIER[cur().diff]||0;
  el.innerHTML=tiers.map(t=>{
    const cards=queue.filter(c=>(TIER[c.diff]||0)===t);
    const done=cards.length>0 && cards.every(c=>attempted[c.id]);
    return '<span title="'+tierName(t)+(done?' cleared':'')+'" style="display:inline-block;width:9px;height:9px;border-radius:99px;border:1px solid '+(done?'var(--text)':'var(--line-strong)')+';background:'+(done?'var(--text)':t===mine?'var(--muted)':'transparent')+'"></span>';
  }).join('')+'<span style="margin-left:2px">'+tierName(mine)+'</span>';
  if(mine>lastTier){
    lastTier=mine;
    if(mine===1){ toast('STAGE 2 — Gopher tier. Harder problems now.','lightning'); sfx.coin(); }
    if(mine===2){ toast('FINAL STAGE — Boss problems. Triple stakes.','skull'); sfx.coin(); confetti(40); }
  }
  const top=tiers[tiers.length-1];
  if(top===2 && G.mode!=='speed' && tierCleared(top) && !clearedPaid){
    clearedPaid=true; S.xp+=25; S.coins+=10; save(); updateHUD();
    toast('Deck cleared! +25 XP bonus.','trophy'); confetti(120); sfx.level();
  }
}
function tierCleared(t: number): boolean { const cards=queue.filter(c=>(TIER[c.diff]||0)===t); return cards.length>0 && cards.every(c=>attempted[c.id]); }
function renderDecks(){
  const el=$('deckList'); el.innerHTML='';
  DECKS.forEach(d=>{
    const n=CARDS.filter(c=>c.deck===d.id).length;
    const m=CARDS.filter(c=>c.deck===d.id && S.mastered[c.id]).length;
    const pct=n?Math.round(m/n*100):0;
    const lesDone=LESSONS.filter(l=>l.deck===d.id && S.lessonsDone[l.id]).length+PROJECTS.filter(p=>p.deck===d.id && S.projectsDone[p.id]).length;
    const lesTot=LESSONS.filter(l=>l.deck===d.id).length+PROJECTS.filter(p=>p.deck===d.id).length;
    const b=document.createElement('button');
    b.className='deck-row'+(d.id===G.deckId?' sel':'');
    b.setAttribute('aria-label', d.name+' deck, '+m+' of '+n+' mastered');
    b.dataset.tip = d.desc;
    b.innerHTML='<span class="deck-ico"><i class="ph-fill '+d.icon+'"></i></span>'
      +'<span class="min-w-0 flex-1"><span class="block font-bold text-[13.5px] leading-tight">'+d.name+'</span>'
      +'<span class="block text-[11px] truncate" style="color:var(--muted);">'+d.desc+(lesTot?' · '+lesDone+'/'+lesTot+' lessons':'')+'</span></span>'
      +'<span class="mono text-[11px] font-bold flex-none" style="color:var(--muted);">'+m+'/'+n+'</span>';
    b.onclick=()=>{ G.deckId=d.id; refreshCards(); beep(700,.05); };
    el.appendChild(b);
  });
  const d=DECKS.find(x=>x.id===G.deckId) ?? DECKS[0];
  if(reviewMode){
    const n=CARDS.filter(c=>(S.mistakes[c.id]||0)>0).length;
    setText('deckChip', 'REVIEW · ' + n + ' left');
  } else setText('deckChip', d.name);
}
/* Deck/difficulty changes re-seed the current card mode: Quiz rebuilds its
   queue, Speed restarts its 60s run — never a silent hop between modes. */
function refreshCards(): void {
  persistUI(); reviewMode = false; syncReviewBtn();
  if (G.mode === 'speed') { renderDecks(); startSpeed(); }
  else { goCards(); buildQueue(); renderDecks(); }
}
function buildQueue(){
  let pool;
  if(reviewMode){
    pool=CARDS.filter(c=>(S.mistakes[c.id]||0)>0);
    if(!pool.length){ toast('No mistakes yet — clean slate.','check-circle'); reviewMode=false; syncReviewBtn(); pool=filteredCards(); }
  } else pool=filteredCards();
  if(!pool.length) pool=CARDS.filter(c=>c.deck===G.deckId);
  if(!reviewMode){
    const fresh=pool.filter(c=>!S.mastered[c.id]);
    if(fresh.length) pool=fresh;
  }
  const byTier: Card[][]=[[],[],[]];
  pool.forEach(c=>byTier[TIER[c.diff]||0].push(c));
  queue=[];
  byTier.forEach(tier=>{ queue=queue.concat(interleave(tier.filter(c=>(S.mistakes[c.id]||0)>0),tier.filter(c=>!((S.mistakes[c.id]||0)>0)))); });
  if(!queue.length) queue=[...pool];
  // Spaced repetition: unseen and due cards surface first (stable sort keeps the interleave).
  const nowMs=Date.now();
  queue.sort((a,b)=>dueValue(S.memory,a.id,nowMs)-dueValue(S.memory,b.id,nowMs));
  idx=0; lastTier=-1; clearedPaid=false; attempted={};
  setText('cardTotal', queue.length);
  renderCard(); updateDeckProgress();
}
function shuffleQueue(){ buildQueue(); toast('Deck shuffled.','shuffle'); }
function renderCard(){
  const c=cur(); if(!c) return;
  flipped=false; locked=false;
  $('flipInner').classList.remove('flipped');
  setText('cardNum', (idx%queue.length)+1);
  setText('qText', c.q);
  $('qCode').innerHTML=highlight(c.code||'').split('\n').map((ln,i)=>'<span class="crow"><span class="cno">'+(i+1)+'</span><span>'+(ln||' ')+'</span></span>').join('');
  $('qCodeWrap').style.display=c.code?'':'none';
  const sc=S.score[c.id]||0;
  setText('qTags', '// '+(c.tags||c.deck)+(S.mastered[c.id]?' · mastered':sc===1?' · one more correct to master':''));
  const boss=isBoss(c,idx);
  $('bossBadge').classList.toggle('hidden',!boss);
  const pill=$('qDiff');
  pill.textContent=c.diff.toUpperCase()+(boss&&c.diff!=='boss'?' · BOSS':'');
  pill.className='chip '+(c.diff==='boss'?'inv':'dim');
  $('hintLine').classList.add('hidden');
  $('resultBox').classList.add('hidden');
  $('resultBox').innerHTML='';
  setText('aText', c.a);
  setText('aExplain', c.explain||'');
  $('revealBtn').style.display=(G.mode==='learn')?'':'none';
  $('starBtn').innerHTML = S.starred[c.id]
    ? '<i class="ph-fill ph-star"></i> Starred'
    : '<i class="ph-bold ph-star"></i> Star';
  renderOptions(c);
  updateDeckProgress();
  renderStages();
}
function renderOptions(c: Card): void {
  const order=[...c.options].sort(()=>Math.random()-.5);
  mountOptions($('quizOpts'), order, (i)=>pickAnswer(norm(order[i])===norm(c.a), ($('quizOpts').children[i] as HTMLButtonElement)));
}
/* Tap an option (or press 1-4 / A-D). That's it. */
function pickAnswer(ok: boolean, btn: HTMLButtonElement): void {
  if(needRevive()) return; if(locked) return; locked=true;
  attempted[cur().id]=true;
  const c=cur();
  const btns=([...$('quizOpts').children] as HTMLButtonElement[]);
  const pickedIdx=btns.indexOf(btn);
  let correctIdx=-1;
  btns.forEach((b,i)=>{ if(norm(b.querySelector('span:nth-child(2)')?.textContent)===norm(c.a)) correctIdx=i; });
  markOptions(btns, correctIdx, ok?-1:pickedIdx);
  const boss=isBoss(c,idx);
  if(ok && S.mistakes[c.id]>0) S.mistakes[c.id]--;
  award(ok, boss?3:1, false);
  if(ok){ cardMastery(c.id); if(boss){ unlock('boss'); toast('Boss defeated — triple XP.','skull'); confetti(90); } }
  else cardMiss(c.id);
  save(); updateHUD();
  if(G.mode==='speed'){
    if(ok){ speedScore++; setText('speedScore', speedScore); }
    setTimeout(()=>{ if(reviewMode) buildQueue(); else { idx=(idx+1)%queue.length; renderCard(); } }, 850);
  } else {
    showResult(ok);
  }
}
function award(ok: boolean, mult: number, forgiving: boolean): number {
  mult=mult||1; forgiving=!!forgiving;
  if(ok){
    touchActive();
    const gained=20*mult*G.combo+(S.streak>=4?10:0);
    const before=level();
    S.xp+=gained; S.coins+=5*mult+(G.combo>1?G.combo*2:0);
    S.streak++; S.best=Math.max(S.best,S.streak);
    pulse($('hudStreak').parentElement);
    if(S.streak===3) toast('Warming up — 3 in a row.','fire');
    else if(S.streak===8){ toast('Unstoppable — 8 streak.','fire'); confetti(100); }
    else if(S.streak===15){ toast('Gopher legend — 15 streak.','trophy'); confetti(150); }
    S.correct++; S.seen++;
    if(S.streak%3===0){ G.combo=Math.min(4,G.combo+1); pulse($('hudCombo').parentElement); }
    sfx.good(); xpBurst('+'+gained+' XP');
    if(S.streak>0 && S.streak%5===0) confetti(60);
    checkAch();
    if(rankFor(level())!==rankFor(before)) toast('New rank: '+rankFor(level())+' — '+rankBlurb(level()),'trophy');
    if(level()>before) setTimeout(showLevelUp,450);
    save(); updateHUD(); return gained;
  }
  S.wrong++; S.seen++;
  if(forgiving){ S.streak=0; G.combo=1; sfx.bad(); }
  else if(S.shield){ S.shield=false; toast('Shield absorbed the hit.','shield-check'); sfx.coin(); }
  else{
    S.hearts=Math.max(0,S.hearts-1); S.streak=0; G.combo=1; sfx.bad();
    const hp=$('hudHearts').parentElement; if(hp){ hp.classList.remove('beat'); void hp.offsetWidth; hp.classList.add('beat'); }
    const fi=$('flipInner'); if(fi){ fi.classList.remove('shake'); void fi.offsetWidth; fi.classList.add('shake'); }
    if(S.hearts<=0){ save(); updateHUD(); setTimeout(()=>{ try{ const om=$<HTMLDialogElement>('overModal'); if(!om.open) om.showModal(); }catch(_){} },600); return -1; }
  }
  save(); updateHUD(); return 0;
}
function cardMastery(id: string): void {
  S.score[id]=(S.score[id]||0)+1;
  memorize(S.memory, id, true, Date.now());
  if(S.score[id]>=2 && !S.mastered[id]){ S.mastered[id]=true; bumpQuest(1); }
}
function cardMiss(id: string): void { S.score[id]=0; S.mistakes[id]=(S.mistakes[id]||0)+1; if(S.mastered[id]) delete S.mastered[id]; memorize(S.memory, id, false, Date.now()); }
function showResult(ok: boolean): void {
  const c=cur();
  const box=$('resultBox');
  box.classList.remove('hidden');
  box.style.borderColor=ok?'#3FA67A':'#E04836';
  box.innerHTML='<p class="font-extrabold flex items-center gap-2">'
    +'<i class="ph-fill '+(ok?'ph-check-circle':'ph-x-circle')+' text-xl" style="color:'+(ok?'#3FA67A':'#E04836')+'"></i>'
    +(ok?'Correct. Nicely done.':quip()+' The correct answer is highlighted above.')+'</p>'
    +'<p class="text-[13.5px] leading-relaxed mt-1.5" style="color:var(--muted);">'+esc(c.explain||'')+'</p>'
    +'<button onclick="nextCard()" class="btn btn-sm mt-3 btn-bump btn-primary">Next card <i class="ph-bold ph-arrow-right"></i></button>';
  box.querySelector('button')?.focus({preventScroll:true});
}
function flipCard(){
  if(G.mode!=='learn'||locked) return;
  flipped=!flipped;
  $('flipInner').classList.toggle('flipped',flipped);
  sfx.flip();
}
function studyConfirm(){
  attempted[cur().id]=true;
  touchActive();
  S.xp+=5; S.coins+=1; S.seen++;
  save(); updateHUD(); sfx.coin(); xpBurst('+5 XP');
  idx=(idx+1)%queue.length; renderCard(); popCard('slide-l');
}
let trivLeft = 15, trivScore = 0, trivIdx = 0, trivLocked = false;
let trivOrder: TriviaQ[] = [];
const TRIV_TIME=15;
/* Seen-rotation: mark what gets shown; starters deal unseen first. */
function markSeen(id: string): void {
  if (!S.seenIds[id]) { S.seenIds[id] = true; save(); }
}
/* Trivia session persists across mode hops and reloads: order + position +
   score live in S. Resume only when every saved id still exists. */
function saveTriv(): void {
  S.trivOrder = trivOrder.map(t => t.id);
  S.trivIdx = trivIdx; S.trivScore = trivScore;
  save();
}
function startTrivia(){
  if (!TRIVIA.length) return;
  $('triviaZone').classList.remove('hidden');
  const allIds = TRIVIA.map(t => t.id);
  const savedValid=(S.trivOrder || []).filter(id => TRIVIA.some(t => t.id === id));
  if(savedValid.length){
    // Resume: same order (so the saved position still points at the same
    // question) and same session score; newly-added questions are appended
    // shuffled instead of wiping progress. Position/score survive reloads
    // and mode hops via saveTriv().
    const mergedIds = mergeTriviaOrder(S.trivOrder || [], allIds);
    trivOrder=mergedIds.map(id => TRIVIA.find(t => t.id === id) as TriviaQ);
    trivIdx=trivOrder.length ? num(S.trivIdx) % trivOrder.length : 0;
    trivScore=num(S.trivScore);
  } else {
    trivOrder=freshFirst(TRIVIA,t=>t.id,S.seenIds).sort(()=>Math.random()-.5);
    trivIdx=0; trivScore=0;
  }
  setText('trivTotal', trivOrder.length);
  renderTrivia();
}
function renderTrivia(){
  clearInterval(trivTimer);
  const t=trivOrder[trivIdx%trivOrder.length];
  trivLocked=false; trivLeft=TRIV_TIME;
  setText('trivNum', (trivIdx%trivOrder.length)+1);
  setText('trivScore', trivScore);
  setText('trivQ', t.q);
  $('trivResult').classList.add('hidden'); $('trivResult').innerHTML='';
  const order=[...t.options].sort(()=>Math.random()-.5);
  mountOptions($('trivOpts'), order, (i,btn)=>triviaPick(norm(order[i])===norm(t.a), btn), {keyHint:false, ctaFirst:false});
  paintTriv();
  saveTriv();
  trivTimer=setInterval(()=>{ trivLeft-=0.2; paintTriv(); if(trivLeft<=0){ clearInterval(trivTimer); triviaTimeout(); } },200);
}
function paintTriv(){
  $('trivBar').style.width=Math.max(0,trivLeft/TRIV_TIME*100)+'%';
  $('trivBar').style.background=trivLeft<=5?'#E04836':'var(--muted)';
}
function lockTriv(){ trivLocked=true; clearInterval(trivTimer); ([...$('trivOpts').children] as unknown as HTMLButtonElement[]).forEach(b=>b.disabled=true); }
function triviaPick(ok: boolean, btn: HTMLButtonElement): void {
  if(needRevive()) return; if(trivLocked) return; lockTriv();
  const t=trivOrder[trivIdx%trivOrder.length];
  const btns=([...$('trivOpts').children] as HTMLButtonElement[]);
  const pickedIdx=btns.indexOf(btn);
  let correctIdx=-1;
  btns.forEach((b,i)=>{ if(norm(b.querySelector('span:nth-child(2)')?.textContent)===norm(t.a)) correctIdx=i; });
  markOptions(btns, correctIdx, ok?-1:pickedIdx);
  markSeen(t.id);
  S.trivDone++;
  if(ok){ trivScore++; S.trivBest=Math.max(S.trivBest||0,trivScore); }
  saveTriv();
  award(ok,1,true);
  setText('trivScore', trivScore);
  trivResult(ok, ok?'Correct.':quip()+' The highlighted answer is right.', t.explain);
}
function triviaTimeout(){
  if(trivLocked) return; lockTriv();
  const t=trivOrder[trivIdx%trivOrder.length];
  markSeen(t.id);
  ([...$('trivOpts').children] as unknown as HTMLButtonElement[]).forEach(b=>{
    if(norm(b.querySelector('span:nth-child(2)')?.textContent)===norm(t.a)) b.classList.add('correct');
    else b.classList.add('dim');
  });
  S.wrong++; S.seen++; S.trivDone++; S.streak=0; G.combo=1; save(); updateHUD(); sfx.bad();
  trivResult(false, 'Time is up — the highlighted answer is right.', t.explain);
}
function trivResult(ok: boolean, head: string, explain: string): void {
  const box=$('trivResult');
  box.classList.remove('hidden');
  box.style.borderColor=ok?'#3FA67A':'#E04836';
  box.innerHTML='<p class="font-extrabold flex items-center gap-2"><i class="ph-fill '+(ok?'ph-check-circle':'ph-x-circle')+' text-xl" style="color:'+(ok?'#3FA67A':'#E04836')+'"></i>'+head+'</p>'
    +'<p class="text-[13.5px] leading-relaxed mt-1.5" style="color:var(--muted);">'+esc(explain||'')+'</p>'
    +'<button onclick="triviaNext()" class="btn btn-sm mt-3 btn-bump btn-primary">Next <i class="ph-bold ph-arrow-right"></i></button>';
}
function triviaNext(){ trivIdx=(trivIdx+1)%trivOrder.length; renderTrivia(); pulse($('trivQ')); }
let dbgIdx = 0, dbgLocked = false;
let dbgStrikes = 0;
let dbgOrder: DebugCase[] = [];
function startDebug(){
  if (!DEBUG.length) return;
  $('debugZone').classList.remove('hidden');
  const byTier: DebugCase[][]=[[],[],[]];
  DEBUG.forEach(d=>byTier[(d.diff in TIER)?TIER[d.diff]:1].push(d));
  dbgOrder=[];
  byTier.forEach(t=>{ const pool=freshFirst(t,d=>d.id,S.seenIds); pool.sort(()=>Math.random()-.5); dbgOrder=dbgOrder.concat(pool); });
  dbgIdx=0;
  setText('dbgTotal', dbgOrder.length);
  renderDebug();
}
function renderDebug(){
  const d=dbgOrder[dbgIdx%dbgOrder.length];
  dbgLocked=false;
  dbgStrikes=0;
  setText('dbgTries','2 tries');
  $('dbgBar').style.width=((dbgIdx%dbgOrder.length)+1)/dbgOrder.length*100+'%';
  setText('dbgNum', (dbgIdx%dbgOrder.length)+1);
  setText('dbgTitle', d.title);
  setText('dbgDesc', d.desc||'');
  $('dbgResult').classList.add('hidden'); $('dbgResult').innerHTML='';
  const lines=Array.isArray(d.code)?d.code:d.code.split('\n');
  mountCodeLines($('dbgLines'), lines.map((ln,i)=>({gutter:String(i+1), codeHtml:highlight(ln), aria:'Line '+(i+1)+': '+ln})), (i,b)=>dbgPick(i,b));
}
function dbgPick(i: number, btn: HTMLButtonElement): void {
  if(needRevive()) return; if(dbgLocked) return;
  const d=dbgOrder[dbgIdx%dbgOrder.length];
  markSeen(d.id);
  if(i===d.bug){
    dbgLocked=true;
    ([...$('dbgLines').children] as unknown as HTMLButtonElement[]).forEach((b,j)=>{
      b.disabled=true;
      b.classList.add(j===d.bug?'good':'dim');
    });
    S.dbgDone++; S.dbgSolved++;
    award(true,3,false);
    confetti(70);
    dbgVerdict(true,'Bug found: '+esc(d.bugName),esc(d.explain||''));
    return;
  }
  // Miss: eliminate the line, keep hunting. Two misses fail the case.
  dbgStrikes++;
  btn.disabled=true;
  btn.classList.add('dim');
  btn.classList.add('shake'); setTimeout(()=>btn.classList.remove('shake'),500);
  sfx.bad();
  if(dbgStrikes>=2){
    dbgLocked=true;
    ([...$('dbgLines').children] as unknown as HTMLButtonElement[]).forEach((b,j)=>{
      b.disabled=true;
      if(j===d.bug) b.classList.add('good');
      else if(b===btn) b.classList.add('bad');
      else b.classList.add('dim');
    });
    S.dbgDone++;
    award(false,3,false);
    setText('dbgTries','no tries left');
    dbgVerdict(false,'Out of tries! '+quip()+' Line '+(d.bug+1)+' is the culprit: '+esc(d.bugName),esc(d.explain||''));
    return;
  }
  setText('dbgTries','1 try left');
  toast('Not that line — eliminated. One try left.','hand-pointing');
}
function dbgVerdict(ok: boolean, head: string, explain: string): void {
  const box=$('dbgResult');
  box.classList.remove('hidden');
  box.style.borderColor=ok?'#3FA67A':'#E04836';
  box.innerHTML='<p class="font-extrabold flex items-center gap-2"><i class="ph-fill '+(ok?'ph-check-circle':'ph-x-circle')+' text-xl" style="color:'+(ok?'#3FA67A':'#E04836')+'"></i>'+head+'</p>'
    +'<p class="text-[13.5px] leading-relaxed mt-1.5" style="color:var(--muted);">'+explain+'</p>'
    +'<button onclick="dbgNext()" class="btn btn-sm mt-3 btn-bump btn-primary">Next case <i class="ph-bold ph-arrow-right"></i></button>';
}
function dbgHint(): void {
  if(dbgLocked) return;
  const d=dbgOrder[dbgIdx%dbgOrder.length];
  const kids=([...$('dbgLines').children] as unknown as HTMLButtonElement[]);
  const innocents=kids.filter((b,j)=>j!==d.bug && !b.disabled);
  if(innocents.length<=2){ toast('Nothing left worth sniffing out.','lightbulb'); return; }
  if(S.coins<20){ toast('Not enough coins — answer cards to earn more.','coins'); sfx.bad(); return; }
  S.coins-=20; save(); updateHUD(); sfx.coin();
  const kill=Math.max(1,Math.min(innocents.length-2,Math.floor(innocents.length/2)));
  innocents.sort(()=>Math.random()-.5).slice(0,kill).forEach(b=>{ b.disabled=true; b.classList.add('dim'); });
  toast('Sniffed out '+kill+' innocent line'+(kill>1?'s':'')+'.','lightbulb');
}
function dbgNext(){ dbgIdx=(dbgIdx+1)%dbgOrder.length; renderDebug(); pulse($('dbgTitle')); }
/* NOTE: quiz Build mode used to live here (startBuild/renderBuild/… with its
   own bld* DOM). The projects flow replaced it, its elements left
   index.html, and data/build.json was deleted — so the dead copy is gone. */
let ordIdx = 0, ordLocked = false;
let ordTries = 2;
let ordGood = 0;
let ordOrder: OrderQ[] = [];
let ordCtl: ArrangeCtl | null = null;
function updateOrdCount(){ if(!ordCtl) return; const t=ordCtl.placed.length+ordCtl.pool.length; const el=$('ordCount'); if(el) el.textContent=ordCtl.placed.length+'/'+t+' placed'; }
function startOrder(){
  if (!ORDER.length) return;
  $('orderZone').classList.remove('hidden');
  ordOrder=freshFirst(ORDER,o=>o.id,S.seenIds).sort(()=>Math.random()-.5);
  ordIdx=0;
  ordTries=2; ordGood=0;
  setText('ordTotal', ordOrder.length);
  renderOrder();
}
function renderOrder(){
  const o=ordOrder[ordIdx%ordOrder.length];
  ordLocked=false;
  setText('ordNum', (ordIdx%ordOrder.length)+1);
  setText('ordQ', o.q);
  const pool=o.lines.map((_,i)=>i).sort(()=>Math.random()-.5);
  if(pool.every((v,i)=>v===i)) pool.reverse();
  ordGood=0;
  ordCtl=mountArrange({
    poolEl:$('ordPool'), placedEl:$('ordPlaced'), undoBtn:null,
    lines:o.lines, emptyText:'',
    emptyHtml:'<p class="text-[12.5px] rounded-xl p-3" style="border:1px dashed var(--line-strong);color:var(--muted);">Tap the lines above in execution order…</p>',
    poolGripHtml:'<i class="ph ph-dots-six-vertical"></i>',
    sortPoolOnRemove:true, isLocked:()=>ordLocked,
    guardPlace:()=>!needRevive(),
    goodPrefix:()=>ordGood, lockedMarks:()=>true, isCorrectAt:(pos,li)=>li===pos,
    onInput:()=>{ ordGood=0; $('ordResult').classList.add('hidden'); updateOrdCount(); beep(700,.04); },
    onPoolDrained:()=>gradeOrder(),
    pool,
  });
  updateOrdCount();
  setText('ordTries',ordTries+' '+(ordTries===1?'try':'tries'));
  $('ordBar').style.width=((ordIdx%ordOrder.length)+1)/ordOrder.length*100+'%';
  $('ordResult').classList.add('hidden'); $('ordResult').innerHTML='';
}
function undoOrd(){ if(ordCtl) ordCtl.undoLast(); }
/* Reset stays on the SAME puzzle and asks it fresh: new shuffle, tries back
   to 2, result cleared. Must work even when locked (after a fail/success),
   otherwise the button looks dead exactly when the player needs it. */
function resetOrd(){ if(!ordCtl) return; ordTries=2; ordGood=0; renderOrder(); }
function gradeOrder(){
  if(!ordCtl) return;
  const o=ordOrder[ordIdx%ordOrder.length];
  markSeen(o.id);
  const placed=ordCtl.placed;
  let firstBad=0;
  while(firstBad<placed.length && placed[firstBad]===firstBad) firstBad++;
  if(placed.length===o.lines.length && firstBad===o.lines.length){
    ordLocked=true;
    ordCtl.paint();
    award(true,2,false);
    confetti(50);
    verdict('ordResult', true, 'Assembled perfectly. Runs first try.', o.explain, 'ordNext');
    return;
  }
  ordTries--;
  if(ordTries<=0){
    ordLocked=true;
    ordCtl.paint();
    let extra='<p class="text-[11px] font-bold tracking-widest mt-3 mb-1.5" style="color:var(--muted);">CORRECT ORDER</p><pre class="go-code mono"><code>'+o.lines.map((ln,i)=>'<span class="crow"><span class="cno">'+(i+1)+'</span><span>'+highlight(ln)+'</span></span>').join('')+'</code></pre>';
    award(false,2,false);
    const plz=$('ordPlaced'); plz.classList.remove('shake'); void plz.offsetWidth; plz.classList.add('shake');
    verdict('ordResult', false, quip()+' Out of tries — study the correct one.', o.explain, 'ordNext', extra);
    return;
  }
  // Retry: green prefix stays locked in, verdict guides the next move.
  ordGood=firstBad;
  ordCtl.paint();
  setText('ordTries',ordTries+' '+(ordTries===1?'try':'tries'));
  sfx.bad();
  const box=$('ordResult');
  box.classList.remove('hidden');
  box.style.borderColor='#E04836';
  box.innerHTML='<p class="font-extrabold flex items-center gap-2"><i class="ph-fill ph-x-circle text-xl" style="color:#E04836"></i>Not quite — green lines are locked in, '+ordTries+' '+(ordTries===1?'try':'tries')+' left.</p>'
    +'<p class="text-[13.5px] leading-relaxed mt-1.5" style="color:var(--muted);">'+(firstBad<placed.length?'Position '+(firstBad+1)+' is the first line out of place. What has to come before it?':'Keep placing — '+placed.length+' of '+o.lines.length+' lines down.')+'</p>';
}
function ordNext(){ ordIdx=(ordIdx+1)%ordOrder.length; ordTries=2; ordGood=0; renderOrder(); pulse($('ordQ')); }
function verdict(boxId: string, ok: boolean, head: string, explain: string, next: string, extra?: string): void {
  const box=$(boxId);
  box.classList.remove('hidden');
  box.style.borderColor=ok?'#3FA67A':'#E04836';
  box.innerHTML='<p class="font-extrabold flex items-center gap-2"><i class="ph-fill '+(ok?'ph-check-circle':'ph-x-circle')+' text-xl" style="color:'+(ok?'#3FA67A':'#E04836')+'"></i>'+head+'</p>'
    +'<p class="text-[13.5px] leading-relaxed mt-1.5" style="color:var(--muted);">'+esc(explain||'')+'</p>'
    +(extra||'')
    +'<button onclick="'+next+'()" class="btn btn-sm mt-3 btn-bump btn-primary">Next <i class="ph-bold ph-arrow-right"></i></button>';
}
function nextCard(){ sfx.flip(); if(reviewMode){ buildQueue(); } else { idx=(idx+1)%queue.length; renderCard(); } popCard('slide-l'); }
function prevCard(){ idx=(idx-1+queue.length)%queue.length; sfx.flip(); renderCard(); popCard('slide-r'); }
function skipCard(){ if(locked) return; idx=(idx+1)%queue.length; S.streak=0; G.combo=1; renderCard(); updateHUD(); popCard('slide-l'); }
function popCard(dir?: string): void { const f=$('flipInner'); f.classList.remove('pop-in','slide-l','slide-r'); void f.offsetWidth; f.classList.add(dir||'pop-in'); }
function copyCode(){ copyText(cur().code||'').then(ok=>{ if(ok) toast('Code copied.','copy'); else showCopyFallback(cur().code||''); }); }
function starCard(){ const k=cur().id; S.starred[k]=!S.starred[k]; save(); renderCard(); toast(S.starred[k]?'Starred.':'Star removed.','star'); }
function useHint(){
  if(locked){ toast('You already answered this one.','lightbulb'); return; }
  if(S.coins<20){ toast('Not enough coins — answer cards to earn more.','coins'); sfx.bad(); return; }
  S.coins-=20; save(); updateHUD(); sfx.coin();
  const c=cur();
  let dimmed=0;
  ([...$('quizOpts').children] as unknown as HTMLButtonElement[]).forEach(b=>{
    const txt=norm(b.querySelector('span:nth-child(2)')?.textContent);
    if(txt!==norm(c.a) && dimmed<2){ b.classList.add('dim'); dimmed++; }
  });
  const h=$('hintLine'); h.classList.remove('hidden');
  h.innerHTML='<b>Hint:</b> two wrong answers are faded out. Trust yourself.';
}

/* Moved from ui.ts: quiz-queue owners live with the queue. */
function buySkip(){ if(S.coins<30) return toast('Need 30 coins.','coins'); S.coins-=30; idx=(idx+1)%queue.length; save(); updateHUD(); renderCard(); popCard('slide-l'); sfx.coin(); }
function resetReviewMode(): void { reviewMode = false; }
function toggleReview(){
  if(G.mode==='learn') setMode('quiz');
  reviewMode=!reviewMode;
  if(reviewMode && !Object.keys(S.mistakes).some(k=>S.mistakes[k]>0)){ reviewMode=false; toast('No mistakes yet — clean slate.','check-circle'); return; }
  syncReviewBtn(); buildQueue();
  if(reviewMode) toast('Review mode: your past mistakes first.','arrow-counter-clockwise');
}
function syncReviewBtn(): void { const b=$('reviewBtn'); if(b) b.classList.toggle('btn-primary', reviewMode); }

/* Moved from boot.ts: quiz-owned wiring/logic lives with the queue. */
function startSpeed(){
  G.mode='speed'; syncTabs(); buildQueue();
  $('speedHud').classList.remove('hidden');
  speedLeft=60; speedScore=0; setText('speedScore', '0');
  clearInterval(speedTimer); paintSpeed();
  speedTimer=setInterval(()=>{
    speedLeft--; paintSpeed();
    if(speedLeft<=0){
      clearInterval(speedTimer);
      S.bestSpeed=Math.max(S.bestSpeed||0,speedScore);
      if(speedScore>0) touchActive();
      const bonus=speedScore*10; S.xp+=bonus; S.coins+=speedScore*3;
      if(speedScore>=5) unlock('speed');
      save(); updateHUD(); sfx.level(); confetti(120);
      toast('Time! '+speedScore+' correct — +'+bonus+' XP bonus.','timer');
      startSpeed();
    }
  },1000);
  toast('Speed run: 60 seconds. Tap answers fast.','timer');
}
function paintSpeed(){
  setText('timerText', Math.max(0,speedLeft));
  $('timerText').style.color=speedLeft<=10?'#f87171':'';
  const tb=$('timerBadge'); tb.classList.remove('beat'); void tb.offsetWidth; if(speedLeft<=10&&speedLeft>0) tb.classList.add('beat');
  $('speedBar').style.width=(Math.max(0,speedLeft)/60*100)+'%';
  $('timerText').classList.toggle('blink', speedLeft<=10 && speedLeft>0);
}
document.querySelectorAll<HTMLButtonElement>('#diffFilter button').forEach(b=>b.onclick=()=>{
  G.diff=b.dataset.diff ?? 'all';
  document.querySelectorAll<HTMLElement>('#diffFilter button').forEach(x=>{ x.classList.remove('btn-primary'); x.classList.add('btn-ghost'); x.style.borderColor='var(--line)'; });
  b.classList.add('btn-primary'); b.classList.remove('btn-ghost'); b.style.borderColor='';
  refreshCards();
});
document.addEventListener('keydown',e=>{
  const kt=e.target as HTMLElement | null; if(kt && kt.matches('input,textarea')) return;
  if(document.querySelector('dialog[open]')) return;
  const cardMode=(G.mode==='quiz'||G.mode==='speed');
  if(['1','2','3','4','5','6','7','8','9'].includes(e.key)){
    const n=+e.key;
    if(G.mode==='debug'){ const lb=$('dbgLines').children[n-1] as HTMLElement; if(lb) lb.click(); return; }
    if(G.mode==='order'){ const pb=$('ordPool').children[n-1] as HTMLElement; if(pb) pb.click(); return; }
    const box=G.mode==='trivia'?$('trivOpts'):(cardMode?$('quizOpts'):null);
    if(box){ const b=box.children[n-1] as HTMLElement; if(b) b.click(); }
  }
  else if(['a','b','c','d','A','B','C','D'].includes(e.key)){
    const box=G.mode==='trivia'?$('trivOpts'):(cardMode?$('quizOpts'):null);
    if(box){ const b=box.children['abcd'.indexOf(e.key.toLowerCase())] as HTMLElement; if(b) b.click(); }
  }
  else if(e.key==='ArrowRight'){
    if(cardMode && !$('resultBox').classList.contains('hidden')) nextCard();
    else if(G.mode==='trivia' && !$('trivResult').classList.contains('hidden')) triviaNext();
    else if(G.mode==='debug' && !$('dbgResult').classList.contains('hidden')) dbgNext();
    else if(G.mode==='order' && !$('ordResult').classList.contains('hidden')) ordNext();
    else if(G.mode==='learn'||G.mode==='build'||G.mode==='algo'){ lesNext(); }
  }
  else if(e.key==='ArrowLeft'){ if(cardMode) prevCard(); }
  else if(e.code==='Space'||e.code==='Enter'){ e.preventDefault(); if(cardMode){ locked?nextCard():flipCard(); } }
  else if(e.key==='Backspace'){ if(G.mode==='order') undoOrd(); }
});

export { resetReviewMode, syncReviewBtn, renderDecks, cur, buildQueue, shuffleQueue, startSpeed, startTrivia,
  startDebug, startOrder, nextCard, prevCard, skipCard, copyCode, starCard,
  useHint, studyConfirm, flipCard, toggleReview,
  triviaNext, dbgNext, ordNext, undoOrd, resetOrd,
  buySkip, dbgHint, speedTimer, trivTimer };
