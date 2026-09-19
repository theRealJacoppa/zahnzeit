/* =====================================================================
   stats.js — die Statistikseite.

   Aufbau von oben nach unten: erst die eine Zahl, die zählt, dann die
   Zerlegung, die sie erklärt, dann der Verlauf, dann die Aufschlüsselung
   nach Block und Baustein.

   Zu den Farben: Diagramme benutzen --c1 und --c2. Das Paar ist für hell
   und dunkel getrennt geprüft (Helligkeitsband, Sättigung, Abstand bei
   Farbfehlsichtigkeit, Kontrast zur Fläche) — siehe Kommentar in app.css.
   Keine dritte Serie dazuerfinden, ohne das Paar neu zu prüfen.
   ===================================================================== */

import * as S from './store.js';
import * as SC from './score.js';
import { $, esc, pct, dateShort, weekdayS, monthName, relDay } from './ui.js';

const page = $('#pg-stats');
let span = 30;                       // Zeitraum für die Aufschlüsselungen

const RING_R = 44, RING_C = 2*Math.PI*RING_R;

function headline(sc){
  if (sc.fresh)         return ['Noch nichts aufgezeichnet', 'Die erste erledigte Routine startet die Zählung.'];
  if (sc.value < 30)    return ['Der Anfang ist gemacht',    'Jeder Tag zählt jetzt mehr als jeder andere später.'];
  if (sc.value < 50)    return ['Es wird eine Gewohnheit',   'Dranbleiben – der Wert wächst mit der Regelmäßigkeit.'];
  if (sc.value < 70)    return ['Solide Routine',            'Die Lücken sind es, die noch Punkte kosten.'];
  if (sc.value < 85)    return ['Sehr verlässlich',          'Nur noch Feinschliff bis nach oben.'];
  if (sc.value < 100)   return ['Fast makellos',             'Eine lückenlose Woche, dann stehst du bei 100.'];
  return ['Makellos', 'Besser geht es nicht.'];
}

/* ------------------------------ Heatmap ------------------------------ */

function heat(now){
  const WEEKS = 16;
  /* Bis zum Ende der laufenden Woche auffüllen, damit die letzte Spalte
     vollständig ist und „heute" nicht am Rand klebt */
  const dow = (now.getDay() + 6) % 7;                 // Montag = 0
  const end = S.addDays(now, 6 - dow);
  const start = S.addDays(end, -(WEEKS*7 - 1));
  const todayKey = S.dayKey(now);

  const cols = [];
  let labels = '', lastMonth = -1;
  for (let w = 0; w < WEEKS; w++){
    let cells = '';
    const colStart = S.addDays(start, w*7);
    for (let d = 0; d < 7; d++){
      const day = S.addDays(colStart, d), key = S.dayKey(day);
      if (day > now){ cells += '<span class="cell future"></span>'; continue; }
      const st = SC.dayStats(key, now);
      const q = st.soll ? st.quote : -1;
      const lvl = q < 0 ? 0 : q === 0 ? 0 : q < 0.35 ? 1 : q < 0.7 ? 2 : q < 1 ? 3 : 4;
      const label = q < 0 ? `${dateShort(day)} nichts geplant`
                          : `${weekdayS(day)}, ${dateShort(day)} · ${pct(q)} · ${st.done}/${st.total}`;
      cells += `<span class="cell${key === todayKey ? ' today' : ''}" data-l="${lvl}"
                      title="${esc(label)}"></span>`;
    }
    /* Monatswechsel oben markieren */
    const m = colStart.getMonth();
    labels += `<span style="width:16px;flex:none;font-size:9.5px;color:var(--ink-dim);text-align:left">${
      m !== lastMonth && colStart.getDate() <= 7 ? esc(monthName(m).slice(0,3)) : ''}</span>`;
    if (m !== lastMonth && colStart.getDate() <= 7) lastMonth = m;
    cols.push(`<div class="col">${cells}</div>`);
  }
  return `<div class="heatwrap">
      <div class="heatdays"><span>Mo</span><span></span><span>Mi</span><span></span>
        <span>Fr</span><span></span><span>So</span></div>
      <div class="heat" id="heatScroll">${cols.join('')}</div>
    </div>
    <div class="legend">
      <span>weniger</span>
      <span class="sw2"><i style="background:var(--heat-0)"></i><i style="background:var(--heat-1)"></i>
        <i style="background:var(--heat-2)"></i><i style="background:var(--heat-3)"></i>
        <i style="background:var(--heat-4)"></i></span>
      <span>mehr</span>
      <span style="margin-left:auto">16 Wochen</span>
    </div>`;
}

/* --------------------------- Säulen: 14 Tage --------------------------- */

function columns(now){
  const rows = SC.series(14, now);
  const todayKey = S.dayKey(now), yestKey = S.dayKey(S.addDays(now, -1));
  const bars = rows.map(r => {
    if (!r.soll) return `<div class="c" title="${esc(dateShort(r.date))} · nichts geplant"><span class="zero"></span></div>`;
    const h = Math.max(3, r.quote*100);
    const tShare = r.done ? r.timed/r.done : 0;
    const label = `${relDay(r.key, todayKey, yestKey)} · ${pct(r.quote)}` +
                  (r.done ? ` · ${r.timed} mit Timer, ${r.done - r.timed} von Hand` : ' · nichts erledigt');
    return `<div class="c">
        <span class="tip">${esc(label)}</span>
        <span class="stack" style="height:${h}%">
          ${r.done ? `<span class="part t" style="height:${tShare*100}%"></span>
                      <span class="part m" style="height:${(1-tShare)*100}%"></span>`
                   : '<span class="zero"></span>'}
        </span>
      </div>`;
  }).join('');
  /* Jeden zweiten Tag beschriften, rückwärts gezählt – damit heute immer dransteht */
  const last = rows.length - 1;
  const axis = rows.map((r,i) =>
    `<span>${(last - i) % 2 === 0 ? esc(String(r.date.getDate())) : ''}</span>`).join('');
  return `<div class="colchart">${bars}</div><div class="axis">${axis}</div>
    <div class="legend">
      <span class="key"><i style="background:var(--c1)"></i>mit Timer geführt</span>
      <span class="key"><i style="background:var(--c2)"></i>von Hand abgehakt</span>
    </div>`;
}

/* ------------------------- Waagrechte Balken ------------------------- */

/* Eine Liste = ein Grid, damit alle Balken an derselben Stelle beginnen */
const hbars = rows => `<div class="hbars">` + rows.map(r => `
  <div class="hbar">
    <span class="nm">${esc(r.icon)} ${esc(r.name)}</span>
    <span class="t"><b class="track"><i style="width:${Math.round(r.quote*100)}%"></i></b></span>
    <span class="p">${pct(r.quote)}</span>
  </div>`).join('') + `</div>`;

/* ------------------------------ Zeichnen ------------------------------ */

export function render(){
  const now = new Date();
  const sc = SC.compute(now);
  const [h1, h2] = headline(sc);
  const trend = sc.tracked >= 9 ? sc.value - SC.valueDaysAgo(7, now) : null;
  const dash = RING_C * (sc.value/100);

  /* Der gewählte Zeitraum wird auf das begrenzt, was überhaupt aufgezeichnet
     ist. Sonst rechnet die Aufschlüsselung in der ersten Woche gegen 30
     Kalendertage und meldet 3 %, obwohl nichts versäumt wurde. */
  const eff = Math.min(span, Math.max(1, sc.tracked));
  const kurz = eff < span;

  const avg = (() => {
    const r = SC.series(eff, now).filter(d => d.soll);
    return r.length ? r.reduce((a,b) => a + b.quote, 0) / r.length : 0;
  })();

  const blockRows = SC.byBlock(eff, now)
      .map(r => ({ icon:r.block.icon, name:r.block.name, quote:r.quote }));
  const itemRows = SC.byItem(eff, now)
      .map(r => ({ icon:r.item.icon, name:r.item.name, quote:r.quote }))
      .sort((a,b) => b.quote - a.quote);

  const timedShare = (() => {
    const r = SC.byItem(eff, now);
    const d = r.reduce((a,b) => a + b.done, 0), t = r.reduce((a,b) => a + b.timed, 0);
    return d ? t/d : 0;
  })();

  page.innerHTML = `
    <div class="topbar"><div><h1>Statistik</h1>
      <p class="sub">Alles bleibt auf diesem Gerät.</p></div></div>

    <div class="card hero">
      <div class="ring">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <defs><linearGradient id="ringgrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="var(--accent-2)"/>
            <stop offset="100%" stop-color="var(--accent)"/>
          </linearGradient></defs>
          <circle class="track" cx="50" cy="50" r="${RING_R}"/>
          ${sc.value ? `<circle class="bar" cx="50" cy="50" r="${RING_R}"
                  stroke-dasharray="${dash.toFixed(1)} ${RING_C.toFixed(1)}"/>` : ''}
        </svg>
        <div class="num">${sc.value}</div>
      </div>
      <div class="side">
        <div class="cap">Routine-Wert</div>
        <div class="headline">${esc(h1)}</div>
        <p class="sub" style="margin-bottom:8px">${esc(h2)}</p>
        ${trend === null ? '' :
          `<span class="trend ${trend > 0 ? 'up' : trend < 0 ? 'down' : ''}">
             ${trend > 0 ? '▲' : trend < 0 ? '▼' : '▬'} ${trend > 0 ? '+' : ''}${trend} in 7 Tagen</span>`}
      </div>
    </div>

    <div class="tiles" style="margin-top:10px">
      <div class="tile"><div class="n">${sc.streak}<small> T</small></div><div class="c">Serie</div></div>
      <div class="tile"><div class="n">${sc.best}<small> T</small></div><div class="c">Rekord</div></div>
      <div class="tile"><div class="n">${Math.round(avg*100)}<small>%</small></div><div class="c">Ø erfüllt</div></div>
    </div>

    <h2>Woraus sich der Wert ergibt</h2>
    <div class="card">
      <div class="bars">
        ${bar('Vollständigkeit', sc.completeness, '60 % · geplant gegen erledigt, jüngere Tage zählen mehr')}
        ${bar('Verlässlichkeit', sc.consistency, `25 % · Anteil der Tage, an denen du ${Math.round(SC.GOOD*100)} % geschafft hast`)}
        ${bar('Serie', sc.streakScore, `15 % · voll ab ${SC.RAMP_DAYS} Tagen am Stück`)}
      </div>
      ${sc.fresh
        ? `<p class="sub" style="margin-top:13px;padding-top:12px;border-top:1px solid var(--line-2)">
             Sobald du die erste Routine abschließt, fängt die Zählung an.</p>`
        : sc.maturity < 1
        ? `<p class="sub" style="margin-top:13px;padding-top:12px;border-top:1px solid var(--line-2)">
             <b>Aufbauphase:</b> Tag ${sc.tracked} von ${SC.RAMP_DAYS}. Solange wird der Wert gedämpft,
             damit er nicht nach ein paar guten Tagen schon bei 90 steht.</p>`
        : ''}
    </div>

    <h2>Die letzten 16 Wochen</h2>
    <div class="card">${heat(now)}</div>

    <h2>Die letzten 14 Tage</h2>
    <div class="card">${columns(now)}</div>

    <h2>Aufschlüsselung</h2>
    <div class="seg-ctl" id="spanCtl">
      ${[7,30,90].map(n => `<button data-n="${n}" class="${n===span?'on':''}">${n} Tage</button>`).join('')}
    </div>
    ${kurz ? `<p class="sub" style="margin:-4px 4px 10px;font-size:12.5px">
        Bisher ${eff} ${eff === 1 ? 'Tag' : 'Tage'} aufgezeichnet – die Quoten unten beziehen
        sich darauf, nicht auf ${span} Tage.</p>` : ''}
    <div class="card">
      <div class="cap" style="font-size:12px;font-weight:700;letter-spacing:.5px;
           text-transform:uppercase;color:var(--ink-dim);margin-bottom:8px">Nach Tageszeit</div>
      ${blockRows.length ? hbars(blockRows) : '<p class="sub">Noch keine Blöcke mit Bausteinen.</p>'}
    </div>
    <div class="card">
      <div class="cap" style="font-size:12px;font-weight:700;letter-spacing:.5px;
           text-transform:uppercase;color:var(--ink-dim);margin-bottom:8px">Nach Baustein</div>
      ${itemRows.length ? hbars(itemRows) : '<p class="sub">Noch nichts geplant.</p>'}
    </div>
    <div class="card">
      <div class="row" style="padding:0">
        <span class="lbl wrap"><b>Mit Timer geführt</b>
          <small>Anteil der erledigten Schritte, bei denen der Timer lief</small></span>
        <span class="val" style="font-weight:700;color:var(--ink)">${pct(timedShare)}</span>
      </div>
    </div>
    <p class="sub" style="margin:16px 4px 6px;font-size:12.5px">
      Ein Tag gilt als geschafft, wenn ${Math.round(SC.GOOD*100)} % des Geplanten erledigt sind.
      Der laufende Tag zieht den Wert nicht herunter – ein Block zählt erst, wenn seine
      Richtzeit zwei Stunden zurückliegt.
    </p>`;

  page.querySelectorAll('#spanCtl button').forEach(b => b.onclick = () => {
    span = +b.dataset.n; render();
    page.scrollTop = page.scrollHeight;
  });
  /* Heatmap ans rechte Ende scrollen – dort steht die Gegenwart */
  const hs = $('#heatScroll', page);
  if (hs) hs.scrollLeft = hs.scrollWidth;
}

function bar(name, v, note){
  return `<div class="barrow">
    <span class="k">${esc(name)}</span><span class="v">${pct(v)}</span>
    <span class="t"><i style="width:${Math.round(v*100)}%"></i></span>
    <span class="v" style="grid-column:1/3;font-size:11.5px;color:var(--ink-dim);margin-top:-1px">${esc(note)}</span>
  </div>`;
}
