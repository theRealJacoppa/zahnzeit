/* =====================================================================
   runner.js — der Vollbild-Ablauf durch eine Routine.

   Eine Routine wird am Stück durchgezogen: einmal gestartet, führt die
   Ansicht von Schritt zu Schritt und geht erst wieder zu, wenn alles
   erledigt ist (oder man bewusst abbricht). Jeder Bausteintyp bekommt
   seine eigene Bühne:

       kai    – der geführte Putzvorgang mit Kiefermodell
       timer  – ein Countdown mit großem Ring
       check  – nur ein großer Haken

   Oben läuft die Schrittkette mit, damit jederzeit sichtbar ist, was noch
   kommt. Am Ende gibt es Konfetti — aber nur, wenn wirklich alles erledigt
   wurde; wer Schritte auslässt, bekommt eine ehrlichere Abschlussmeldung.
   ===================================================================== */

import * as S from './store.js';
import { PHASES, S_NAME, A_NAME, TIPS } from './kai.js';
import { createJaw } from './model3d.js';
import { confetti } from './confetti.js';
import { $, esc, mmss, durLabel, confirmSheet, buzz } from './ui.js';

const view = $('#run');

/* ----------------------------- Ton & Bildschirm ----------------------------- */

let soundOn = true, actx = null, wakeLock = null;
export const setSound = v => { soundOn = v; $('#runSound').textContent = v ? '🔔' : '🔕'; };

function beep(freq, when=0, dur=0.16, gain=0.16){
  if (!soundOn || !actx) return;
  const t = actx.currentTime + when;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = 'sine'; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(actx.destination);
  o.start(t); o.stop(t + dur + 0.05);
}
function initAudio(){
  if (!actx){ const C = window.AudioContext || window.webkitAudioContext; if (C) actx = new C(); }
  if (actx && actx.state === 'suspended') actx.resume();
}
const cuePhase = () => { beep(660,0); beep(880,0.13); buzz(10); };
const cueStep  = () => { beep(784,0); beep(1046,0.12); buzz(14); };
const cueAll   = () => { beep(660,0); beep(880,0.14); beep(1175,0.28); beep(1568,0.44,0.5,0.2); buzz([16,70,16,70,26]); };

async function lockScreen(){
  try { if ('wakeLock' in navigator && !wakeLock) wakeLock = await navigator.wakeLock.request('screen'); } catch(e){}
}
function unlockScreen(){ try { wakeLock && wakeLock.release(); } catch(e){} wakeLock = null; }
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && run.open) lockScreen();
});

/* -------------------------------- Zustand -------------------------------- */

const run = {
  open:false, key:null, block:null, ids:[], i:-1,
  item:null, mode:null, visited:null, onFinish:null, doneScreen:false
};

/* Putzvorgang */
const kai = { running:false, elapsed:0, startWall:0, lastPhase:-1, totalMs:180000, over:false };
/* Countdown */
const cd  = { running:false, left:0, total:30, tid:0, over:false };

const segs = PHASES.map(() => {
  const d = document.createElement('div'); d.className = 'seg';
  const i = document.createElement('i'); d.appendChild(i);
  $('#segs').appendChild(d); return i;
});

/* ------------------------------ Kiefermodell ------------------------------ */

let jaw = null, jawTried = false, jawDark = false, loopOn = false;
let lastNow = performance.now(), firstFrame = true;

function ensureJaw(){
  if (jawTried) return jaw;
  jawTried = true;
  try { jaw = createJaw($('#scene')); } catch(e){ jaw = null; }
  if (!jaw || !jaw.ok){
    $('#scene').style.display = 'none';
    $('#fallback').style.display = 'grid';
    $('#loading').classList.add('gone');
    jaw = null;
  } else {
    jaw.setTheme(jawDark);
  }
  return jaw;
}
export function setJawTheme(dark){ jawDark = dark; if (jaw) jaw.setTheme(dark); }

/* ============================ Schrittkette ============================ */

function paintBar(){
  const bar = $('#runBar');
  bar.innerHTML = run.ids.map((id, n) => {
    const it = S.itemById(id);
    const done = !!S.entry(run.key, run.block.id, id);
    const cls = done ? 'done' : n === run.i ? 'now' : '';
    return `<button class="rdot ${cls}" data-n="${n}" aria-label="${esc(it?.name ?? '')}">
              <span>${done ? '✓' : esc(it?.icon ?? '•')}</span>
            </button>`;
  }).join('');
  bar.querySelectorAll('.rdot').forEach(d => d.onclick = () => goto(+d.dataset.n));
}

/* ============================ Bühne: Putzen ============================ */

const fmt = ms => {
  const s = Math.max(0, Math.ceil(ms/1000));
  return Math.floor(s/60) + ':' + String(s%60).padStart(2,'0');
};

function applyPhase(idx){
  if (idx >= PHASES.length){
    $('#phaseNum').textContent = '✓';
    $('#phaseName').textContent = 'Fertig';
    $('#phaseSub').textContent = '· alle Flächen geputzt';
    $('#hint').textContent = 'Stark – zum Abschluss ausspucken, nicht nachspülen.';
    return;
  }
  const p = PHASES[idx];
  $('#phaseNum').textContent = (idx+1) + '/' + PHASES.length;
  $('#phaseName').textContent = S_NAME[p.s];
  $('#phaseSub').textContent = '· ' + A_NAME[p.a];
  $('#hint').textContent = TIPS[p.s];
}

function kaiTick(){
  const phaseMs = kai.totalMs / PHASES.length;
  if (kai.running) kai.elapsed = Math.min(kai.totalMs, Date.now() - kai.startWall);
  const idx  = Math.min(PHASES.length, Math.floor(kai.elapsed / phaseMs));
  const prog = (kai.elapsed % phaseMs) / phaseMs;
  $('#time').textContent = fmt(kai.totalMs - kai.elapsed);
  $('#time').classList.toggle('done', kai.elapsed >= kai.totalMs);
  segs.forEach((el,i) => { el.style.width = (i < idx ? 100 : i === idx ? prog*100 : 0) + '%'; });
  if (idx !== kai.lastPhase){
    if (kai.running && kai.lastPhase >= 0 && idx < PHASES.length) cuePhase();
    applyPhase(idx); kai.lastPhase = idx;
  }
  if (kai.running && kai.elapsed >= kai.totalMs) kaiOver();
  return { idx, prog };
}

function kaiOver(){
  kai.running = false; kai.over = true;
  unlockScreen(); cueStep();
  setCtl();
}
function kaiStart(){
  initAudio();
  if (kai.elapsed >= kai.totalMs){ kai.elapsed = 0; kai.lastPhase = -1; kai.over = false; }
  kai.startWall = Date.now() - kai.elapsed;
  kai.running = true; lockScreen(); setCtl();
}
function kaiPause(){ kai.running = false; unlockScreen(); setCtl(); }
function kaiReset(){
  kai.running = false; kai.elapsed = 0; kai.lastPhase = -1; kai.over = false;
  unlockScreen(); applyPhase(0); kai.lastPhase = 0; setCtl();
}

/* Die Schleife läuft nur, solange der Ablauf offen ist. */
function frame(now){
  if (!loopOn) return;
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastNow)/1000); lastNow = now;
  if (run.mode !== 'kai') return;
  const { idx, prog } = kaiTick();
  if (!jaw) return;
  jaw.render(now, dt, { idx, prog, running: kai.running,
                        idle: !kai.running && kai.elapsed === 0 });
  if (firstFrame){
    firstFrame = false;
    $('#scene').classList.add('ready');
    $('#loading').classList.add('gone');
  }
}

/* =========================== Bühne: Countdown =========================== */

const CIRC = 2 * Math.PI * 43;
function cdDraw(){
  const frac = cd.total ? cd.left / cd.total : 0;
  /* Bei 0 ganz ausblenden – ein runder Strichabschluss malt sonst einen
     Punkt an den Ringanfang, der wie ein Rest aussieht. */
  $('#mvBar').style.opacity = frac < 0.004 ? '0' : '1';
  $('#mvBar').style.strokeDasharray = `${CIRC*frac} ${CIRC}`;
  $('#mvNum').textContent = cd.left >= 60 ? mmss(cd.left) : Math.ceil(cd.left);
}
function cdStop(){ clearInterval(cd.tid); cd.tid = 0; cd.running = false; }
function cdTick(){
  cd.left = Math.max(0, cd.left - 0.1);
  cdDraw();
  if (cd.left <= 0){
    cdStop(); cd.over = true;
    unlockScreen(); cueStep(); setCtl();
  }
}
function cdStart(){
  initAudio(); lockScreen();
  if (cd.left <= 0){ cd.left = cd.total; cd.over = false; }
  cd.running = true;
  clearInterval(cd.tid); cd.tid = setInterval(cdTick, 100);
  setCtl();
}

/* ============================== Steuerung ============================== */

const stages = ['rsKai','rsTimer','rsCheck','rsDone'];
function showStage(id){
  stages.forEach(s => $('#' + s).classList.toggle('on', s === id));
}
function btn(el, label, show = true){
  el.style.display = show ? '' : 'none';
  if (show) el.textContent = label;
}

/* Beschriftet die drei Knöpfe passend zur aktuellen Bühne. */
function setCtl(){
  const aux = $('#runAux'), main = $('#runMain'), skip = $('#runSkip');
  const last = remaining() === 0;

  if (run.doneScreen){
    btn(aux, '', false); btn(skip, '', false);
    btn(main, 'Fertig');
    return;
  }
  if (run.mode === 'kai'){
    btn(aux, '↺', !kai.over);
    btn(skip, '↦', !kai.over);
    btn(main, kai.over ? (last ? 'Abschließen ✓' : 'Weiter ›')
                       : kai.running ? 'Pause'
                       : kai.elapsed > 0 ? 'Weiter' : 'Putzen starten');
  } else if (run.mode === 'timer'){
    btn(aux, 'Auslassen', !cd.over);
    btn(skip, '', false);
    btn(main, cd.over ? (last ? 'Abschließen ✓' : 'Weiter ›')
                      : cd.running ? 'Pause'
                      : cd.left < cd.total ? 'Weiter' : 'Starten');
  } else if (run.mode === 'check'){
    btn(aux, 'Auslassen', true);
    btn(skip, '', false);
    btn(main, last ? 'Erledigt ✓ · Abschließen' : 'Erledigt ✓');
  }
}

/* Wie viele Schritte danach noch anstehen */
function remaining(){
  const n = run.ids.length;
  let c = 0;
  for (let k = 1; k <= n; k++){
    const j = (run.i + k) % n, id = run.ids[j];
    if (S.entry(run.key, run.block.id, id) || run.visited.has(id)) continue;
    c++;
  }
  return c;
}

function nextOpen(){
  const n = run.ids.length;
  for (let k = 1; k <= n; k++){
    const j = (run.i + k) % n, id = run.ids[j];
    if (S.entry(run.key, run.block.id, id)) continue;
    if (run.visited.has(id)) continue;
    return j;
  }
  return -1;
}

/* ============================== Ablauf ============================== */

function goto(n){
  if (n < 0 || n >= run.ids.length) return finish();
  run.i = n;
  const item = S.itemById(run.ids[n]);
  if (!item) return advance();
  run.item = item; run.mode = item.mode; run.doneScreen = false;
  run.visited.add(item.id);

  if (item.mode === 'kai'){
    kai.totalMs = Math.max(30, item.seconds) * 1000;
    kaiReset();
    showStage('rsKai');
    ensureJaw();
    if (jaw) jaw.resize();
  } else if (item.mode === 'timer'){
    cdStop();
    cd.total = Math.max(5, item.seconds); cd.left = cd.total; cd.over = false;
    $('#mvGlyph').textContent = item.icon;
    $('#mvName').textContent = item.name;
    $('#mvHint').textContent = durLabel(item.seconds) + ' – der Ton sagt Bescheid.';
    cdDraw();
    showStage('rsTimer');
  } else {
    $('#ckGlyph').textContent = item.icon;
    $('#ckName').textContent = item.name;
    $('#ckHint').textContent = 'Kein Timer – tippe auf Erledigt, wenn du durch bist.';
    showStage('rsCheck');
  }
  paintBar();
  setCtl();
}

function stepDone(timed, sec){
  S.setDone(run.key, run.block.id, run.item.id, { timed, sec: sec || 0 });
  paintBar();
  advance();
}
function advance(){
  const n = nextOpen();
  n < 0 ? finish() : goto(n);
}

let clearConfetti = () => {};

function finish(){
  cdStop(); kai.running = false; unlockScreen();
  run.doneScreen = true; run.mode = null;

  const p = S.blockProgress(run.key, run.block.id);
  const all = p.done >= p.total;
  $('#dnGlyph').textContent = all ? '🎉' : '👍';
  $('#dnTitle').textContent = all ? 'Durch!' : 'Bis hierher geschafft';
  $('#dnText').textContent = all
    ? `${run.block.name} vollständig – alle ${p.total} Schritte erledigt.`
    : `${p.done} von ${p.total} Schritten. Der Rest wartet auf „Heute“.`;

  showStage('rsDone');
  paintBar();
  setCtl();
  if (all){
    cueAll();
    clearConfetti = confetti($('#confetti'));
  }
}

/* --------------------------- Öffnen / Schließen --------------------------- */

export function startRun({ key, block, fromId = null, onFinish = null } = {}){
  if (!block || !block.items.length) return;
  run.open = true; run.key = key; run.block = block;
  run.ids = [...block.items]; run.visited = new Set();
  run.i = -1; run.doneScreen = false; run.onFinish = onFinish;
  jawTried && jaw && jaw.resize();

  $('#runWho').innerHTML = `${esc(block.icon)} ${esc(block.name)}`;
  view.classList.add('on');
  loopOn = true; lastNow = performance.now(); requestAnimationFrame(frame);

  let start = fromId ? run.ids.indexOf(fromId) : -1;
  if (start < 0){
    const firstOpen = run.ids.findIndex(id => !S.entry(key, block.id, id));
    start = firstOpen < 0 ? 0 : firstOpen;
  }
  goto(start);
}

function close(){
  clearConfetti(); clearConfetti = () => {};
  cdStop(); kai.running = false; kai.elapsed = 0; kai.lastPhase = -1;
  loopOn = false; run.open = false; unlockScreen();
  view.classList.remove('on');
  const cb = run.onFinish; run.onFinish = null;
  cb && cb();
}

async function askClose(){
  if (run.doneScreen) return close();
  const p = S.blockProgress(run.key, run.block.id);
  const offen = p.total - p.done;
  if (offen > 0){
    const ok = await confirmSheet({
      title: 'Routine verlassen?',
      note: `${offen} von ${p.total} Schritten ${offen === 1 ? 'ist' : 'sind'} noch offen. ` +
            `Was du schon erledigt hast, bleibt eingetragen.`,
      ok: 'Verlassen', cancel: 'Weitermachen', danger: true
    });
    if (!ok) return;
  }
  close();
}

/* ------------------------------ Verdrahtung ------------------------------ */

$('#runMain').addEventListener('click', () => {
  if (run.doneScreen) return close();
  if (run.mode === 'kai'){
    if (kai.over) return stepDone(true, Math.round(kai.totalMs/1000));
    kai.running ? kaiPause() : kaiStart();
  } else if (run.mode === 'timer'){
    if (cd.over) return stepDone(true, cd.total);
    cd.running ? (cdStop(), setCtl()) : cdStart();
  } else if (run.mode === 'check'){
    stepDone(false, 0);
  }
});

$('#runAux').addEventListener('click', () => {
  if (run.mode === 'kai') return kaiReset();
  advance();                       /* bei Countdown und Abhaken: auslassen */
});

$('#runSkip').addEventListener('click', () => {
  if (run.mode !== 'kai') return;
  initAudio();
  const phaseMs = kai.totalMs / PHASES.length;
  const idx = Math.floor(kai.elapsed / phaseMs);
  kai.elapsed = Math.min(kai.totalMs, (idx+1) * phaseMs);
  if (kai.running) kai.startWall = Date.now() - kai.elapsed;
  else kaiTick();
});

$('#runClose').addEventListener('click', askClose);

let soundHook = null;
export const onSoundToggle = fn => { soundHook = fn; };
$('#runSound').addEventListener('click', () => {
  setSound(!soundOn);
  soundHook && soundHook(soundOn);
  if (soundOn){ initAudio(); beep(880,0,0.12); }
});

export const anyTimerOpen = () => run.open;
