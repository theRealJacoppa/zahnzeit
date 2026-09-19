/* =====================================================================
   app.js — Einstieg: Seitenwechsel, Erscheinungsbild, Verdrahtung.

   Gerendert wird immer nur die sichtbare Seite. Ändert sich etwas im
   Speicher, zeichnet die aktive Seite neu — das ist bei dieser Datenmenge
   billiger und einfacher als gezielte Teilaktualisierungen.
   ===================================================================== */

import * as S from './store.js';
import { $, $$, setHaptics, sheetOpen, closeSheet } from './ui.js';
import * as Today from './today.js';
import * as Stats from './stats.js';
import * as Settings from './settings.js';
import { setSound, onSoundToggle, setJawTheme, anyTimerOpen } from './runner.js';

const PAGES = { today: Today, stats: Stats, set: Settings };
let active = 'today';

/* ---------------------------- Erscheinungsbild ---------------------------- */

const mq = matchMedia('(prefers-color-scheme: dark)');

function applyTheme(){
  const t = S.settings().theme;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  const dark = t === 'dark' || (t === 'auto' && mq.matches);
  setJawTheme(dark);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = dark ? '#231A15' : '#F7E9D8';
}
mq.addEventListener('change', applyTheme);
Settings.bindTheme(applyTheme);

/* -------------------------------- Seiten -------------------------------- */

function show(name){
  if (!PAGES[name]) return;
  active = name;
  $$('.page').forEach(p => p.classList.toggle('on', p.id === 'pg-' + name));
  $$('.tab').forEach(t => t.classList.toggle('on', t.dataset.page === name));
  PAGES[name].render();
  const pg = $('#pg-' + name);
  if (pg) pg.scrollTop = 0;
}

$('#tabs').addEventListener('click', e => {
  const t = e.target.closest('.tab');
  if (t) show(t.dataset.page);
});
/* Der Routine-Wert oben auf „Heute" führt auf die Statistik */
document.addEventListener('click', e => {
  const j = e.target.closest('[data-tab]');
  if (j) show(j.dataset.tab);
});

/* Neu zeichnen, wenn sich am Datenbestand etwas ändert */
S.onChange(() => {
  setSound(S.settings().sound);
  setHaptics(S.settings().hapticCues);
  PAGES[active]?.render();
});

/* Zurück aus dem Hintergrund: die Uhrzeit ist weitergelaufen, also kann
   ein anderer Block dran sein. */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || anyTimerOpen()) return;
  active === 'today' ? Today.refresh() : PAGES[active]?.render();
});

/* Die Zurück-Geste schließt erst das offene Blatt */
addEventListener('popstate', () => { if (sheetOpen()) closeSheet(); });

/* ---------------------------- Offline-Fähigkeit ---------------------------- */

/* Der Service Worker (sw.js) legt die App vollständig in einen Cache, damit
   sie auch ohne Netz startet. Er braucht http(s) — beim Doppelklick auf
   index.html gibt es keinen, und das soll auch nichts weiter stören. */
if ('serviceWorker' in navigator){
  const hatteSW = !!navigator.serviceWorker.controller;
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));

  /* Eine neue Fassung hat übernommen. Einmal neu laden, damit Markup und
     Module aus demselben Satz stammen — aber nicht mitten im Putzen; beim
     nächsten Start passt ohnehin wieder alles zusammen. */
  let laedtNeu = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hatteSW || laedtNeu || anyTimerOpen()) return;
    laedtNeu = true; location.reload();
  });
}

/* --------------------------------- Start -------------------------------- */

setSound(S.settings().sound);
setHaptics(S.settings().hapticCues);
onSoundToggle(on => { S.settings().sound = on; S.commit(); });
applyTheme();
show('today');

window.__zz = { store:S, show, applyTheme };
