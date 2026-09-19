/* =====================================================================
   today.js — die Seite, die durch die aktuelle Routine führt.

   Oben steht immer sichtbar, welcher Block gerade angenommen wird. Der
   Vorschlag kommt aus store.suggestBlock(); ein Tipp darauf öffnet ein
   Blatt, in dem sich Block und Tag umstellen lassen. Solange nichts von
   Hand umgestellt wurde, folgt die Seite weiter dem Vorschlag.
   ===================================================================== */

import * as S from './store.js';
import * as SC from './score.js';
import { $, esc, relDay, dateLong, toast, openSheet, closeSheet, buzz, clockLabel } from './ui.js';
import { startRun } from './runner.js';

const page = $('#pg-today');

/* Was gerade angezeigt wird. `auto` bedeutet: dem Vorschlag folgen. */
const view = { auto:true, blockId:null, dayKey:null };

function resolve(){
  const now = new Date();
  if (view.auto){
    const sug = S.suggestSession(now);
    view.blockId = sug?.block.id ?? S.blocks()[0]?.id ?? null;
    view.dayKey  = sug?.key ?? S.dayKey(now);
  }
  let block = S.blockById(view.blockId);
  if (!block){ block = S.blocks()[0] || null; view.blockId = block?.id ?? null; }
  if (!view.dayKey) view.dayKey = S.dayKey(now);
  return { block, key: view.dayKey, now };
}

/* Block und Tag bewusst setzen — damit verlässt die Seite die Automatik */
function choose(blockId, key){
  view.blockId = blockId; view.dayKey = key; view.auto = false;
  render();
}

/* Nächster noch offener Schritt eines Blocks */
function nextStep(key, block){
  if (!block) return null;
  for (const id of block.items) if (!S.entry(key, block.id, id)) return S.itemById(id);
  return null;
}

/* ------------------------------ Ausführen ------------------------------

   Es gibt nur noch einen Einstieg: den Vollbild-Ablauf. Er bleibt offen,
   bis der Block durch ist — auch über reine Abhak-Schritte hinweg. Wer
   nur schnell einen Haken setzen will, tippt auf den Kreis in der Zeile;
   das läuft an dieser Stelle vorbei. */
function runStep(key, block, item){
  startRun({ key, block, fromId: item?.id ?? null, onFinish: render });
}

/* Schritt von Hand abhaken bzw. den Haken wieder wegnehmen.
   Das Wegnehmen braucht eine Rückmeldung, sonst wirkt ein versehentlicher
   Tipp auf einen erledigten Schritt wie ein Fehler der App. */
function toggleStep(key, block, item){
  const had = S.entry(key, block.id, item.id);
  S.toggleDone(key, block.id, item.id, { timed:false });
  buzz(had ? 8 : 14);
  if (had) toast(`${item.name}: Haken entfernt`);
}

/* -------------------------------- Blatt -------------------------------- */

function pickerSheet(){
  const now = new Date();
  const days = [0,-1,-2].map(o => S.dayKey(S.addDays(now, o)));
  const todayKey = days[0], yestKey = days[1];

  const blockChips = S.blocks().map(b => {
    const p = S.blockProgress(view.dayKey, b.id);
    const done = p.total && p.done >= p.total;
    return `<button class="chip ${b.id === view.blockId ? 'on' : ''}" data-b="${esc(b.id)}">
              ${esc(b.icon)} ${esc(b.name)}
              ${b.items.length ? `<span style="opacity:.7;font-weight:500">${done ? '✓' : p.done + '/' + p.total}</span>`
                               : '<span style="opacity:.55;font-weight:500">leer</span>'}
            </button>`;
  }).join('');

  const dayChips = days.map(k =>
    `<button class="chip ${k === view.dayKey ? 'on' : ''}" data-d="${k}">${esc(relDay(k, todayKey, yestKey))}</button>`
  ).join('');

  openSheet(
    `<h3>Was machst du gerade?</h3>
     <p class="note">Die App rät anhand der Uhrzeit. Stimmt es nicht, stell es hier um —
     ein spät gewählter Abendblock wird automatisch dem Vortag zugeordnet.</p>
     <div class="field"><label>Block</label><div class="chips" id="pkB">${blockChips}</div></div>
     <div class="field"><label>Tag</label><div class="chips" id="pkD">${dayChips}</div>
       <p class="hlp">Nur zum Nachtragen. Normalerweise bleibt es auf dem Tag, den die App gewählt hat.</p></div>
     <div class="sheetbtns">
       <button class="btn" id="pkAuto">Automatik</button>
       <button class="btn btn-primary" id="pkOk">Übernehmen</button>
     </div>`,
    p => {
      p.querySelectorAll('#pkB .chip').forEach(c => c.onclick = () => {
        view.blockId = c.dataset.b;
        /* Tag mitziehen, solange man nicht bewusst nachträgt */
        if (view.dayKey === S.dayKey(now) || view.auto)
          view.dayKey = S.dayForBlock(S.blockById(view.blockId), now);
        view.auto = false;
        closeSheet(); render();
      });
      p.querySelectorAll('#pkD .chip').forEach(c => c.onclick = () => {
        view.dayKey = c.dataset.d; view.auto = false;
        closeSheet(); render();
      });
      p.querySelector('#pkAuto').onclick = () => { view.auto = true; closeSheet(); render(); };
      p.querySelector('#pkOk').onclick   = () => { closeSheet(); render(); };
    });
}

/* --------------------------- Was noch offen ist ---------------------------

   Sucht den jüngsten Block der letzten beiden Tage, dessen Richtzeit vorbei
   und der noch nicht fertig ist — und der nicht ohnehin gerade eingestellt
   ist. Genau das soll auf „Heute" nach oben, statt still im Verlauf zu
   verschwinden. Ein „War nichts" nimmt ihn nur aus der Rückfrage; für den
   Routine-Wert zählt der Tag weiterhin so, wie er wirklich war. */
function catchUp(now){
  const out = [];
  for (const off of [-1, 0]){
    const day = S.addDays(now, off), key = S.dayKey(day);
    for (const b of S.blocks()){
      if (!b.items.length) continue;
      if (key === view.dayKey && b.id === view.blockId) continue;
      if (S.isDismissed(key, b.id)) continue;
      const at = new Date(day); at.setHours(b.hint ?? 12, 0, 0, 0);
      const over = (now - at) / 36e5;
      if (over < 2 || over > 18) continue;          // noch nicht dran bzw. zu lange her
      const p = S.blockProgress(key, b.id);
      if (p.done >= p.total) continue;
      out.push({ block:b, key, over, p });
    }
  }
  out.sort((a, b) => a.over - b.over);              // das Frischeste zuerst
  return out[0] || null;
}

/* Die Nachtfrage. Nur wenn die Lage wirklich mehrdeutig ist und noch keine
   Antwort vorliegt — sie soll ja nicht jeden Abend erscheinen. */
function nightCard(now){
  const gap = S.nightGap(now);
  if (!gap || S.nightAnswer(now)) return '';
  const uhr = now.toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit' });
  return `<div class="ask" id="askNight">
      <div class="ask-top">
        <span class="ask-icon">🌙</span>
        <span class="lbl"><b>Es ist ${esc(uhr)} Uhr</b>
          <small>Hast du seitdem geschlafen?</small></span>
      </div>
      <p class="ask-note">Davon hängt ab, ob das gleich als
        <b>${esc(gap.late.name)} von gestern</b> zählt oder als
        <b>${esc(gap.early.name)} von heute</b>.</p>
      <div class="ask-btns">
        <button class="btn" data-slept="0">Nein, noch wach</button>
        <button class="btn btn-primary" data-slept="1">Ja, schon auf</button>
      </div>
    </div>`;
}

/* Der Nachtrag-Hinweis für alles, was offen liegen geblieben ist. */
function catchUpCard(cu, now, todayKey, yestKey){
  if (!cu) return '';
  const heute = cu.key === todayKey;
  const wann = esc(relDay(cu.key, todayKey, yestKey)).toLowerCase();
  const titel = heute ? `${esc(cu.block.name)} ist noch offen`
                      : `${esc(cu.block.name)} von ${wann} ist offen`;
  return `<div class="ask warn" id="askCatch">
      <div class="ask-top">
        <span class="ask-icon">${esc(cu.block.icon)}</span>
        <span class="lbl"><b>${titel}</b>
          <small>${cu.p.done} von ${cu.p.total} eingetragen · Richtzeit ${clockLabel(cu.block.hint)}</small></span>
      </div>
      <div class="ask-btns">
        <button class="btn" data-dismiss>War nichts</button>
        <button class="btn btn-primary" data-catch>Nachtragen</button>
      </div>
    </div>`;
}

/* ------------------------------- Zeichnen ------------------------------- */

export function render(){
  const { block, key, now } = resolve();
  const todayKey = S.dayKey(now), yestKey = S.dayKey(S.addDays(now, -1));
  const sc = SC.compute(now);
  const isToday = key === todayKey;

  if (!S.blocks().length){
    page.innerHTML = head(sc, now) + `
      <div class="card empty"><span class="big">🧭</span>
        Noch keine Routine angelegt.<br>Leg in den Einstellungen fest,
        was du wann machen möchtest.</div>`;
    return;
  }

  const p = block ? S.blockProgress(key, block.id) : { done:0, total:0 };
  const next = nextStep(key, block);
  const allDone = block && p.total > 0 && p.done >= p.total;

  const steps = !block || !block.items.length
    ? `<div class="card empty"><span class="big">🌿</span>
         Für <b>${esc(block?.name ?? '')}</b> ist nichts geplant.<br>
         In den Einstellungen kannst du diesem Block Bausteine geben.</div>`
    : `<div class="rows">` + block.items.map(id => {
        const it = S.itemById(id); if (!it) return '';
        const e = S.entry(key, block.id, id);
        const note = e
          ? (e.timed ? 'mit Timer · ' : 'von Hand · ') + new Date(e.at)
              .toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'}) + ' Uhr'
          : (it.mode === 'kai'   ? 'Geführter Timer · ' + Math.round(it.seconds/60) + ' Min.'
          :  it.mode === 'timer' ? 'Countdown · ' + it.seconds + ' Sek.'
          :                        'Zum Abhaken');
        return `<div class="step ${e ? 'done' : ''}" data-id="${esc(id)}">
                  <span class="tick" data-tick>✓</span>
                  <span class="emoji">${esc(it.icon)}</span>
                  <span class="lbl"><b>${esc(it.name)}</b><small>${esc(note)}</small></span>
                  ${it.mode === 'check' ? '' : '<span class="go">START</span>'}
                </div>`;
      }).join('') + `</div>`;

  const cta = !block || !block.items.length ? ''
    : allDone
      ? `<button class="btn btn-wide" style="margin-top:14px" disabled>
           ${isToday ? 'Alles erledigt ✓' : 'Vollständig ✓'}</button>`
      : `<button class="btn btn-primary btn-wide" id="cta" style="margin-top:14px">
           ${p.done === 0 ? 'Routine starten' : `Weiter mit ${esc(next.name)}`}</button>`;

  /* Die übrigen Blöcke desselben Tages, kurz zusammengefasst */
  const others = S.blocks().filter(b => b.id !== block?.id && b.items.length);
  const rest = !others.length ? '' : `<h2>Sonst an diesem Tag</h2><div class="rows">` +
    others.map(b => {
      const q = S.blockProgress(key, b.id);
      const full = q.done >= q.total;
      return `<button class="row" data-goto="${esc(b.id)}">
                <span class="emoji">${esc(b.icon)}</span>
                <span class="lbl"><b>${esc(b.name)}</b><small>Richtzeit ${clockLabel(b.hint)}</small></span>
                <span class="val" style="${full ? 'color:var(--good);font-weight:650' : ''}">
                  ${full ? 'fertig ✓' : q.done + '/' + q.total}</span>
                <span class="chev">›</span>
              </button>`;
    }).join('') + `</div>`;

  /* Der Tag steht als eigener Chip neben dem Blocknamen und wird
     hervorgehoben, sobald er nicht der heutige ist — das ist die
     Information, bei der man sich nachts um drei sonst unsicher ist. */
  const dayLabel = relDay(key, todayKey, yestKey);
  /* Die Nachtfrage hat Vorrang: solange sie offen ist, steht nichts daneben,
     was von ihr ablenkt. Der Nachtrag-Hinweis kommt danach von selbst. */
  const night = nightCard(now);
  const cu = night ? null : catchUp(now);

  page.innerHTML = head(sc, now) + night
    + catchUpCard(cu, now, todayKey, yestKey) + `
    <button class="blockpick" id="pick">
      <span class="big">${esc(block?.icon ?? '•')}</span>
      <span class="txt">
        <b>${esc(block?.name ?? 'Kein Block')}</b>
        <small>${p.total ? `${p.done} von ${p.total} erledigt` : 'nichts geplant'}</small>
      </span>
      <span class="daytag ${key === todayKey ? '' : 'past'}">${esc(dayLabel)}</span>
      <span class="chev">›</span>
    </button>
    ${view.auto ? '' :
      `<button class="backauto" id="backAuto">Von Hand gewählt · zurück zur Automatik</button>`}
    ${steps}${cta}${rest}`;

  /* --- Verknüpfungen --- */
  $('#pick', page).onclick = pickerSheet;
  const ba = $('#backAuto', page);
  if (ba) ba.onclick = () => { view.auto = true; view.dayKey = null; render(); };

  const nightEl = $('#askNight', page);
  if (nightEl){
    const gap = S.nightGap(now);
    nightEl.querySelectorAll('[data-slept]').forEach(b => b.onclick = () => {
      const slept = b.dataset.slept === '1';
      S.setNightAnswer(slept, now);
      buzz();
      choose(slept ? gap.early.id : gap.late.id, slept ? gap.earlyKey : gap.lateKey);
    });
  }
  const catchEl = $('#askCatch', page);
  if (catchEl){
    catchEl.querySelector('[data-catch]').onclick   = () => choose(cu.block.id, cu.key);
    catchEl.querySelector('[data-dismiss]').onclick = () => {
      S.dismissBlock(cu.key, cu.block.id);
      toast(`${cu.block.name}: nicht weiter nachgefragt`);
    };
  }
  const ctaEl = $('#cta', page);
  if (ctaEl) ctaEl.onclick = () => runStep(key, block, next);

  page.querySelectorAll('.step').forEach(row => {
    const it = S.itemById(row.dataset.id); if (!it) return;
    const e = () => S.entry(key, block.id, it.id);
    row.addEventListener('click', ev => {
      /* Der Kreis hakt immer nur ab, der Rest der Zeile startet den Timer */
      if (ev.target.closest('[data-tick]') || e() || it.mode === 'check')
        toggleStep(key, block, it);
      else
        runStep(key, block, it);
    });
  });
  page.querySelectorAll('[data-goto]').forEach(b => b.onclick = () => {
    view.blockId = b.dataset.goto; view.auto = false; render();
  });
}

function head(sc, now){
  const trendable = sc.tracked >= 8;
  return `<div class="topbar">
      <div>
        <h1>Heute</h1>
        <p class="sub">${esc(dateLong(now))}</p>
      </div>
      <button class="pill" data-tab="stats" style="cursor:pointer">
        <span style="color:var(--accent);font-weight:750">${sc.value}</span>
        <span style="color:var(--ink-soft)">Routine</span>
      </button>
    </div>` + (trendable ? '' : '');
}

/* Wenn die App aus dem Hintergrund zurückkommt, kann ein anderer Block
   dran sein — dann neu raten, sofern nichts von Hand gewählt wurde. */
export function refresh(){ if (view.auto) view.dayKey = null; render(); }
