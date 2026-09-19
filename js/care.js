/* =====================================================================
   care.js — Erinnerungen mit langem Intervall: der Bürstenkopf alle drei
   Monate, die Kontrolle beim Zahnarzt alle sechs.

   Das ist bewusst dieselbe Mechanik wie bei der Nachtfrage und dem
   Nachtrag-Hinweis: eine Karte auf „Heute", wenn etwas dran ist. Eine
   echte Benachrichtigung gibt es nicht und kann es nicht geben — iOS
   erlaubt Webapps keine zeitgesteuerten Mitteilungen, und Web Push
   bräuchte einen Server, den diese App bewusst nicht hat. Bei etwas, das
   alle drei Monate fällig ist, reicht das aber: Man öffnet die App
   ohnehin täglich, und ein paar Tage Unschärfe spielen keine Rolle.

   Alle Angaben sind frei einstellbar, genau wie Bausteine und Tageszeiten
   auch. `last` ist der Tag der letzten Erledigung im selben Format wie die
   Tagesschlüssel (YYYY-MM-DD) — damit passt es direkt in ein Datumsfeld.
   ===================================================================== */

import * as S from './store.js';
import { $, esc, openSheet, closeSheet, confirmSheet, toast, buzz, ICONS } from './ui.js';

const DAY      = 864e5;
const SNOOZE_D = 7;      // „Später" verstummt so viele Tage

/* ----------------------------- Datumsrechnen ----------------------------- */

const daysInMonth = (y, m) => new Date(y, m+1, 0).getDate();

/* Monatsgenau weiterzählen, Überlauf geklemmt: der 31. Januar plus einen
   Monat ist der 28. Februar, nicht der 3. März. */
export function addMonths(d, n){
  const x = new Date(d.getFullYear(), d.getMonth() + n, 1);
  x.setDate(Math.min(d.getDate(), daysInMonth(x.getFullYear(), x.getMonth())));
  return x;
}
const midnight = d => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
const daysBetween = (a, b) => Math.round((midnight(b) - midnight(a)) / DAY);

/* ------------------------------- Zustand ------------------------------- */

/* off   – abgeschaltet
   setup – eingeschaltet, aber ohne Datum: kann noch nicht erinnern
   due    – fällig (`over` = Tage seit der Fälligkeit, 0 = heute)
   ok     – noch Zeit (`over` negativ) */
export function status(c, now = new Date()){
  if (!c.on)    return { state:'off' };
  if (!c.last)  return { state:'setup' };
  const due = addMonths(S.parseDay(c.last), c.months);
  const over = daysBetween(due, now);
  return { state: over >= 0 ? 'due' : 'ok', due, over };
}

/* Die eine Erinnerung, die auf „Heute" nach oben soll — oder keine.
   Fälliges schlägt Einzurichtendes, und länger Überfälliges geht vor. */
export function top(now = new Date()){
  let best = null;
  for (const c of S.care()){
    const st = status(c, now);
    if (st.state !== 'due' && st.state !== 'setup') continue;
    if (c.snoozed && (now - c.snoozed) < SNOOZE_D * DAY) continue;
    const rang = st.state === 'due' ? 1000 + st.over : 0;
    if (!best || rang > best.rang) best = { care:c, st, rang };
  }
  return best;
}

export function markDone(c, now = new Date()){
  c.last = S.dayKey(now);
  c.snoozed = 0;
  S.commit();
}

/* ------------------------------- Die Karte ------------------------------- */

const dmy = d => `${d.getDate()}.${d.getMonth()+1}.${d.getFullYear()}`;
const monate = n => n === 1 ? 'jeden Monat' : `alle ${n} Monate`;

export function card(t){
  if (!t) return '';
  const { care:c, st } = t;

  if (st.state === 'setup')
    return `<div class="ask" id="askCare">
        <div class="ask-top">
          <span class="ask-icon">${esc(c.icon)}</span>
          <span class="lbl"><b>${esc(c.name)}</b>
            <small>Wann war das zuletzt?</small></span>
        </div>
        <p class="ask-note">Ohne dieses Datum kann Zahnzeit nicht erinnern.
          Gedacht ist es ${esc(monate(c.months))} — ein genaues Datum lässt sich
          in den Einstellungen nachtragen.</p>
        <div class="ask-btns">
          <button class="btn" data-off>Nicht erinnern</button>
          <button class="btn btn-primary" data-done>War heute</button>
        </div>
      </div>`;

  const seit = st.over === 0 ? 'seit heute' : st.over === 1 ? 'seit gestern' : `seit ${st.over} Tagen`;
  return `<div class="ask warn" id="askCare">
      <div class="ask-top">
        <span class="ask-icon">${esc(c.icon)}</span>
        <span class="lbl"><b>${esc(c.name)}</b>
          <small>${esc(seit)} dran · ${esc(monate(c.months))}</small></span>
      </div>
      <p class="ask-note">Zuletzt am <b>${esc(dmy(S.parseDay(c.last)))}</b>.</p>
      <div class="ask-btns">
        <button class="btn" data-later>Später</button>
        <button class="btn btn-primary" data-done>Erledigt ✓</button>
      </div>
    </div>`;
}

/* Jeder Knopf endet in S.commit() — das zeichnet die aktive Seite ohnehin
   neu, die Karte verschwindet also von selbst. */
export function wireCard(root, t, now = new Date()){
  const el = $('#askCare', root);
  if (!el || !t) return;
  const c = t.care;

  el.querySelector('[data-done]').onclick = () => {
    markDone(c, now); buzz(14);
    toast(`${c.name}: auf heute gesetzt`);
  };
  const later = el.querySelector('[data-later]');
  if (later) later.onclick = () => {
    c.snoozed = Date.now(); S.commit();
    toast(`${c.name}: in ${SNOOZE_D} Tagen wieder`);
  };
  const off = el.querySelector('[data-off]');
  if (off) off.onclick = () => {
    c.on = false; S.commit();
    toast(`${c.name}: abgeschaltet`);
  };
}

/* ---------------------------- In den Einstellungen ---------------------------- */

function zeile(c, now){
  const st = status(c, now);
  const wert = st.state === 'off'   ? 'aus'
             : st.state === 'setup' ? 'kein Datum'
             : st.state === 'due'   ? (st.over === 0 ? 'heute' : `seit ${st.over} T`)
             :                        `in ${-st.over} T`;
  const unten = st.state === 'off' ? 'Erinnert nicht'
              : st.state === 'setup' ? `${monate(c.months)} · Datum fehlt noch`
              : `${monate(c.months)} · zuletzt ${dmy(S.parseDay(c.last))}`;
  const farbe = st.state === 'due' ? 'color:var(--warn);font-weight:650'
              : st.state === 'off' ? 'color:var(--ink-dim)' : '';
  return `<button class="row" data-care="${esc(c.id)}">
      <span class="emoji">${esc(c.icon)}</span>
      <span class="lbl"><b>${esc(c.name)}</b><small>${esc(unten)}</small></span>
      <span class="val" style="${farbe}">${esc(wert)}</span>
      <span class="chev">›</span>
    </button>`;
}

export function section(now = new Date()){
  return `<h2>Erinnerungen</h2>
    <p class="sub" style="margin:-4px 4px 9px">Dinge mit langem Abstand. Was fällig ist,
       erscheint als Karte auf „Heute" – Mitteilungen auf den Sperrbildschirm kann eine
       Webapp auf dem iPhone nicht verschicken.</p>
    <div class="rows">
      ${S.care().map(c => zeile(c, now)).join('')}
      <button class="row" id="addCare">
        <span class="emoji" style="color:var(--accent)">＋</span>
        <span class="lbl"><b style="color:var(--accent)">Erinnerung hinzufügen</b></span>
      </button>
    </div>`;
}

/* `rerender` ist die render()-Funktion der Einstellungsseite. */
export function wireSettings(page, rerender){
  page.querySelectorAll('[data-care]').forEach(b => b.onclick = () => sheet(b.dataset.care, rerender));
  const add = $('#addCare', page);
  if (add) add.onclick = () => sheet(null, rerender);
}

/* ------------------------------- Das Blatt ------------------------------- */

function sheet(id, rerender){
  const isNew = !id;
  const src = isNew ? { id:S.uid('care'), name:'', icon:'⏱', months:3, last:null, on:true, snoozed:0 }
                    : { ...S.care().find(c => c.id === id) };
  const draft = { ...src };
  const heute = S.dayKey(new Date());

  openSheet(
    `<h3>${isNew ? 'Neue Erinnerung' : 'Erinnerung bearbeiten'}</h3>
     <p class="note">Etwas, das in großem Abstand wiederkehrt. Fällt es an, steht es
       auf „Heute“ – ein Tipp auf „Erledigt“ startet den Abstand neu.</p>

     <div class="field"><label>Name</label>
       <input type="text" id="cName" value="${esc(draft.name)}"
              placeholder="z. B. Bürstenkopf wechseln" maxlength="40"></div>

     <div class="field"><label>Symbol</label>
       <div class="chips" id="cIcons">${ICONS.map(e =>
         `<button class="chip ${e===draft.icon?'on':''}" data-e="${e}"
                  style="font-size:19px;padding:7px 10px">${e}</button>`).join('')}</div>
     </div>

     <div class="field"><label>Abstand</label>
       <input type="range" id="cM" min="1" max="24" step="1" value="${draft.months}">
       <p class="hlp"><b id="cMLbl">${esc(monate(draft.months))}</b></p>
     </div>

     <div class="field"><label>Zuletzt erledigt</label>
       <input type="date" id="cLast" max="${heute}" value="${esc(draft.last ?? '')}">
       <p class="hlp" id="cNext">–</p>
     </div>

     <div class="field">
       <div class="row" style="padding:0">
         <span class="lbl"><b>Erinnern</b><small>Aus heißt: taucht nirgends mehr auf</small></span>
         <label class="sw"><input type="checkbox" id="cOn" ${draft.on ? 'checked' : ''}><i></i></label>
       </div>
     </div>

     <div class="sheetbtns">
       ${isNew ? '' : '<button class="btn btn-danger" id="cDel">Löschen</button>'}
       <button class="btn btn-primary" id="cOk">${isNew ? 'Anlegen' : 'Sichern'}</button>
     </div>`,
    p => {
      const nm = p.querySelector('#cName');
      nm.oninput = () => draft.name = nm.value;
      p.querySelectorAll('#cIcons .chip').forEach(c => c.onclick = () => {
        draft.icon = c.dataset.e;
        p.querySelectorAll('#cIcons .chip').forEach(x => x.classList.toggle('on', x === c));
      });

      const m = p.querySelector('#cM'), last = p.querySelector('#cLast');
      const vorschau = () => {
        p.querySelector('#cMLbl').textContent = monate(draft.months);
        p.querySelector('#cNext').textContent = draft.last
          ? 'Dann wieder fällig am ' + dmy(addMonths(S.parseDay(draft.last), draft.months))
          : 'Ohne Datum kann nicht erinnert werden.';
      };
      m.oninput    = () => { draft.months = +m.value; vorschau(); };
      last.oninput = () => { draft.last = last.value || null; vorschau(); };
      p.querySelector('#cOn').onchange = e => draft.on = e.target.checked;
      vorschau();

      p.querySelector('#cOk').onclick = () => {
        draft.name = draft.name.trim();
        if (!draft.name){ nm.focus(); toast('Bitte einen Namen eingeben'); return; }
        /* Ein neues Datum hebt ein früheres „Später" auf */
        if (draft.last !== src.last) draft.snoozed = 0;
        const list = S.care(), i = list.findIndex(x => x.id === draft.id);
        i < 0 ? list.push(draft) : list[i] = draft;
        S.commit(); closeSheet(); rerender();
      };
      const del = p.querySelector('#cDel');
      if (del) del.onclick = async () => {
        closeSheet();
        if (await confirmSheet({ title:`„${draft.name}" löschen?`,
            note:'Die Erinnerung verschwindet ganz. Am Verlauf deiner Routine ändert das nichts.',
            ok:'Löschen', danger:true })){
          S.settings().care = S.care().filter(x => x.id !== draft.id);
          S.commit(); toast('Gelöscht');
        }
        rerender();
      };
    });
}
