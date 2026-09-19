/* =====================================================================
   store.js — Datenmodell, Ablage, Tageszuordnung

   Alles liegt unter einem einzigen localStorage-Schlüssel. Es gibt keinen
   Server; die Daten verlassen das Gerät nie.

   Zwei Begriffe, die hier ständig vorkommen:

   • Baustein (item)  – etwas, das man tut: putzen, Zahnseide, spülen.
   • Block            – eine Tageszeit mit einer Liste von Bausteinen.
                        Ein Block hat keine harte Uhrzeitgrenze, nur eine
                        Richtzeit (`hint`), an der sich die App orientiert,
                        wenn sie rät, was gerade dran ist.
   ===================================================================== */

const KEY = 'zz-v2';
const LEGACY_SOUND = 'zz-sound';

/* ----------------------------- Vorgaben ----------------------------- */

export const ITEM_MODES = {
  kai:   'Geführter Putz-Timer',
  timer: 'Einfacher Countdown',
  check: 'Nur abhaken'
};

const DEFAULTS = () => ({
  version: 2,
  settings: {
    sound: true,
    theme: 'auto',                 // auto | light | dark
    hapticCues: true,
    items: [
      { id:'brush',  name:'Zähne putzen',       icon:'🪥', mode:'kai',   seconds:180 },
      { id:'floss',  name:'Zahnseide',          icon:'🧵', mode:'check', seconds:60  },
      { id:'inter',  name:'Interdentalbürste',  icon:'🪡', mode:'check', seconds:60  },
      { id:'tongue', name:'Zungenreiniger',     icon:'👅', mode:'check', seconds:20  },
      { id:'rinse',  name:'Mundspülung',        icon:'🫧', mode:'timer', seconds:30  }
    ],
    blocks: [
      { id:'morning', name:'Morgens', icon:'🌅', hint:7,  items:['brush','tongue'] },
      { id:'noon',    name:'Mittags', icon:'☀️', hint:13, items:[] },
      { id:'evening', name:'Abends',  icon:'🌙', hint:21, items:['brush','floss','rinse'] }
    ],
    /* Erinnerungen mit langem Abstand (care.js). `last` ist ein Tagesschlüssel
       oder null — ohne Datum kann nicht erinnert werden, danach fragt die App
       einmal auf „Heute". */
    care: [
      { id:'head',    name:'Bürstenkopf wechseln', icon:'🪥', months:3, last:null, on:true, snoozed:0 },
      { id:'dentist', name:'Zahnarzt-Kontrolle',   icon:'🦷', months:6, last:null, on:true, snoozed:0 }
    ]
  },
  /* log["2026-09-19"].morning.brush = { at, timed, sec } */
  log: {},
  /* Gemerkte Antworten auf Rückfragen — nichts davon fließt in den Wert ein */
  ui: {}
});

/* ------------------------------ Laden ------------------------------- */

function migrate(raw){
  const d = DEFAULTS();
  if (!raw) {
    /* Ton-Einstellung aus der Timer-only-Fassung übernehmen */
    if (localStorage.getItem(LEGACY_SOUND) === 'off') d.settings.sound = false;
    return d;
  }
  /* Fehlende Felder auffüllen, ohne Vorhandenes zu überschreiben */
  const s = Object.assign({}, d.settings, raw.settings || {});
  if (!Array.isArray(s.items)  || !s.items.length)  s.items  = d.settings.items;
  if (!Array.isArray(s.blocks) || !s.blocks.length) s.blocks = d.settings.blocks;
  s.items = s.items.map(i => Object.assign({ mode:'check', seconds:60, icon:'•' }, i));
  s.blocks = s.blocks.map(b => Object.assign({ hint:12, icon:'•', items:[] }, b,
                          { items: (b.items || []).filter(id => s.items.some(i => i.id === id)) }));
  if (!Array.isArray(s.care)) s.care = d.settings.care;
  s.care = s.care.map(c => Object.assign({ icon:'⏱', months:3, last:null, on:true, snoozed:0 }, c));
  return { version:2, settings:s,
           log: raw.log && typeof raw.log === 'object' ? raw.log : {},
           ui:  raw.ui  && typeof raw.ui  === 'object' ? raw.ui  : {} };
}

let data;
try { data = migrate(JSON.parse(localStorage.getItem(KEY) || 'null')); }
catch(e){ data = DEFAULTS(); }

const listeners = new Set();
let saveTimer = 0;

function persist(){
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch(e){}
  }, 120);
}
/* Änderungen bündeln: ein `commit()` je Benutzeraktion, nicht je Feld */
export function commit(){ persist(); listeners.forEach(fn => fn()); }
export function onChange(fn){ listeners.add(fn); return () => listeners.delete(fn); }

export const settings = () => data.settings;
export const log      = () => data.log;
export const items    = () => data.settings.items;
export const care     = () => data.settings.care;
export const blocks   = () => data.settings.blocks;
export const itemById = id => data.settings.items.find(i => i.id === id) || null;
export const blockById= id => data.settings.blocks.find(b => b.id === id) || null;

/* --------------------------- Tagesschlüssel -------------------------- */

export const dayKey = d => {
  const p = n => String(n).padStart(2,'0');
  return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate());
};
export const parseDay = k => { const [y,m,d] = k.split('-').map(Number); return new Date(y, m-1, d); };
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };

/* Welchem Tag gehört eine Session, die JETZT in `block` stattfindet?

   Nicht der Kalendertag entscheidet, sondern die Richtzeit des Blocks: Wir
   vergleichen, ob „heute um hint Uhr" oder „gestern um hint Uhr" näher an
   der aktuellen Uhrzeit liegt. Dadurch landet die Abendroutine um 3 Uhr
   nachts beim Vortag — der Tag endet, wenn man schlafen geht, nicht um
   Mitternacht. In die Zukunft wird nie verschoben. */
export function dayForBlock(block, now = new Date()){
  const at = (offset) => {
    const d = addDays(now, offset);
    d.setHours(block?.hint ?? 12, 0, 0, 0);
    return d;
  };
  const today = Math.abs(now - at(0)), yest = Math.abs(now - at(-1));
  return dayKey(yest < today ? addDays(now, -1) : now);
}

/* Wie lange ist ein Block schon fällig?  > 0 heißt: Richtzeit ist vorbei. */
const EARLY_H = 1.5;   // so lange vor der Richtzeit gilt ein Block schon als dran
const STALE_H = 8;     // so lange danach wird er noch aktiv vorgeschlagen

/* Welche Sitzung ist gerade wahrscheinlich dran?
   Bewertet wird nicht der Block allein, sondern das Paar aus Block UND Tag —
   „Abends von gestern" und „Abends von heute" sind zwei verschiedene Dinge.
   Was fällig und noch offen ist, hat klaren Vorrang vor allem, was erst
   später kommt; das ist der Unterschied, der nachts um drei zählt. */
export function suggestSession(now = new Date()){
  const bs = blocks().filter(b => b.items.length);
  if (!bs.length) return null;
  let best = null, bestScore = -Infinity;

  for (const b of bs){
    for (const off of [0, -1]){                     // heute und gestern
      const day = addDays(now, off);
      const at = new Date(day); at.setHours(b.hint ?? 12, 0, 0, 0);
      const over = (now - at) / 36e5;
      if (off === -1 && over <= 0) continue;        // „gestern in der Zukunft" gibt es nicht
      const key = dayKey(day);
      const p = blockProgress(key, b.id);

      let s;
      if (p.done >= p.total)                            s = -300;          // schon fertig
      else if (over >= -EARLY_H && over <= STALE_H)     s = 200 - over;    // jetzt dran
      else if (over < -EARLY_H)                         s = 100 + over;    // kommt noch
      else                                              s = -100 - over;   // zu lange her

      if (s > bestScore){ bestScore = s; best = { block:b, key }; }
    }
  }
  return best;
}

/* Die Lücke zwischen dem letzten Block von gestern und dem ersten von heute.
   Liegt „jetzt" darin und ist gestern Abend noch offen, ist die Lage
   mehrdeutig: Geht der Nutzer gleich schlafen oder ist er schon wieder auf?
   Das kann die App nicht wissen — sie fragt (siehe today.js). */
export function nightGap(now = new Date()){
  const bs = blocks().filter(b => b.items.length);
  if (bs.length < 2) return null;
  const sorted = [...bs].sort((a, b) => (a.hint ?? 12) - (b.hint ?? 12));
  const early = sorted[0], late = sorted[sorted.length - 1];
  if ((late.hint ?? 12) - (early.hint ?? 12) < 6) return null;   // keine echte Tagesspanne

  const yKey = dayKey(addDays(now, -1)), tKey = dayKey(now);
  const lateAt  = parseDay(yKey); lateAt.setHours(late.hint ?? 12, 0, 0, 0);
  const earlyAt = parseDay(tKey); earlyAt.setHours(early.hint ?? 12, 0, 0, 0);
  if (now < lateAt || now > earlyAt) return null;                // nicht in der Lücke

  const p = blockProgress(yKey, late.id);
  if (p.done >= p.total) return null;                            // gestern Abend ist durch
  return { late, lateKey: yKey, early, earlyKey: tKey, progress: p };
}

/* ------------------------------ Einträge ----------------------------- */

export function entry(key, blockId, itemId){
  return data.log?.[key]?.[blockId]?.[itemId] || null;
}
export function setDone(key, blockId, itemId, opts = {}){
  const day = (data.log[key] ||= {});
  const blk = (day[blockId] ||= {});
  blk[itemId] = { at: opts.at ?? Date.now(), timed: !!opts.timed, sec: opts.sec || 0 };
  commit();
}
export function clearDone(key, blockId, itemId){
  const blk = data.log?.[key]?.[blockId];
  if (!blk) return;
  delete blk[itemId];
  if (!Object.keys(blk).length) delete data.log[key][blockId];
  if (!Object.keys(data.log[key] || {}).length) delete data.log[key];
  commit();
}
export function toggleDone(key, blockId, itemId, opts){
  entry(key, blockId, itemId) ? clearDone(key, blockId, itemId) : setDone(key, blockId, itemId, opts);
}

export function blockProgress(key, blockId){
  const b = blockById(blockId);
  if (!b) return { done:0, total:0 };
  const rec = data.log?.[key]?.[blockId] || {};
  return { done: b.items.filter(id => rec[id]).length, total: b.items.length };
}

/* --------------------------- Import / Export -------------------------- */

export function exportJSON(){ return JSON.stringify(data, null, 2); }
export function importJSON(text){
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object') throw new Error('Kein gültiges Format');
  data = migrate(parsed);
  commit();
}
/* --------------------- Gemerkte Antworten auf Rückfragen --------------------- */

const ui = () => (data.ui ||= {});
const NIGHT_VALID = 8 * 36e5;   // eine Nachtantwort trägt ungefähr eine Nacht weit

export function setNightAnswer(slept, now = new Date()){
  ui().night = { at: +now, slept };
  commit();
}
export function nightAnswer(now = new Date()){
  const a = ui().night;
  return a && (now - a.at) < NIGHT_VALID ? a : null;
}
/* „War nichts" auf einen offenen Block: nur die Rückfrage verstummt,
   der Wert rechnet den Tag weiterhin so, wie er wirklich war. */
export function dismissBlock(key, blockId){
  (ui().dismissed ||= {})[key + ':' + blockId] = Date.now();
  commit();
}
export const isDismissed = (key, blockId) => !!ui().dismissed?.[key + ':' + blockId];

export function wipeLog(){ data.log = {}; data.ui = {}; commit(); }
export function wipeAll(){ data = DEFAULTS(); commit(); }

export const uid = p => p + '-' + Math.random().toString(36).slice(2, 8);
