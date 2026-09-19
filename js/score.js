/* =====================================================================
   score.js — der Routine-Wert von 0 bis 100 und alles, was die
   Statistikseite an Zahlen braucht.

   Der Wert setzt sich aus drei Teilen zusammen:

     Vollständigkeit  60 %  Wie viel von dem, was geplant war, ist passiert?
                            Gewichtet mit einer Halbwertszeit von 14 Tagen:
                            gestern zählt voll, vor zwei Wochen halb, vor
                            einem Monat ein Viertel.
     Verlässlichkeit  25 %  An wie vielen Tagen war das Geplante wirklich
                            geschafft (mindestens 80 %)? Gleich gewichtet.
     Serie            15 %  Aktuelle Strähne guter Tage, voll ab 21 Tagen.

   Das Ganze wird am Anfang gedämpft (`maturity`), damit der Wert nicht
   nach einem einzigen guten Tag bei 90 steht. Nach 21 aufgezeichneten
   Tagen ist die Dämpfung weg.

   Wichtig für das Gefühl: Der laufende Tag wird nicht bestraft. Ein Block
   zählt erst, wenn seine Richtzeit plus zwei Stunden Kulanz vorbei ist.
   Morgens um 8 zieht die noch offene Abendroutine den Wert also nicht runter.
   ===================================================================== */

import * as S from './store.js';

const HALF_LIFE = 14;     // Tage, nach denen ein Tag nur noch halb zählt
const WINDOW    = 60;     // so weit blickt der Wert zurück
const RAMP      = 21;     // Tage bis zur vollen Serie und zur vollen Reife
const GOOD_DAY  = 0.8;    // ab hier gilt ein Tag als geschafft
const GRACE_H   = 2;      // Kulanz nach der Richtzeit eines Blocks

const WEIGHT = { kai: 3, timer: 1.5, check: 1 };
const weightOf = item => WEIGHT[item?.mode] ?? 1;
const clamp = (v, a=0, b=1) => Math.max(a, Math.min(b, v));

/* ---------------------- Erfüllungsgrad eines Tages ---------------------- */

/* Liefert { soll, ist, quote, timed, gesamt } für einen Tagesschlüssel.
   `soll` ist 0, wenn an dem Tag (noch) nichts fällig war — solche Tage
   fließen gar nicht in die Rechnung ein. */
export function dayStats(key, now = new Date()){
  const isToday = key === S.dayKey(now);
  const rec = S.log()[key] || {};
  let soll = 0, ist = 0, done = 0, total = 0, timed = 0;

  for (const b of S.blocks()){
    if (!b.items.length) continue;
    const got = rec[b.id] || {};
    const touched = b.items.some(id => got[id]);
    if (isToday && !touched){
      /* Noch nicht angefasst und die Richtzeit ist noch nicht durch?
         Dann ist der Block schlicht noch nicht dran. */
      const due = new Date(now); due.setHours((b.hint ?? 12) + GRACE_H, 0, 0, 0);
      if (now < due) continue;
    }
    for (const id of b.items){
      const item = S.itemById(id); if (!item) continue;
      const w = weightOf(item);
      soll += w; total++;
      if (got[id]){ ist += w; done++; if (got[id].timed) timed++; }
    }
  }
  return { soll, ist, done, total, timed, quote: soll ? ist/soll : 0 };
}

/* Alle Tage vom ersten Eintrag bis heute, lückenlos, ältester zuerst. */
export function trackedDays(now = new Date()){
  const keys = Object.keys(S.log()).sort();
  if (!keys.length) return [];
  const first = S.parseDay(keys[0]), today = new Date(now); today.setHours(0,0,0,0);
  const out = [];
  for (let d = first; d <= today; d = S.addDays(d, 1)) out.push(S.dayKey(d));
  return out;
}

/* ------------------------------ Der Wert ------------------------------ */

export function compute(now = new Date()){
  const all = trackedDays(now);
  const todayKey = S.dayKey(now);
  const days = all.slice(-WINDOW).map(key => ({ key, ...dayStats(key, now) }));
  const relevant = days.filter(d => d.soll > 0);

  if (!relevant.length){
    return { value:0, completeness:0, consistency:0, streakScore:0, maturity:0,
             streak:0, best:bestStreak(now), days, tracked:all.length, fresh:true };
  }

  /* Gewicht eines Tages: exponentiell fallend, heute = 1 */
  const wOf = key => Math.pow(0.5, Math.max(0, (S.parseDay(todayKey) - S.parseDay(key)) / 864e5) / HALF_LIFE);

  let wSum = 0, qSum = 0;
  for (const d of relevant){ const w = wOf(d.key); wSum += w; qSum += w * d.quote; }
  const completeness = clamp(qSum / wSum);

  /* Verlässlichkeit: an wie vielen Tagen war es tatsächlich geschafft?
     Bewusst nicht die Streuung der Quoten — die hätte gleichmäßiges
     Mittelmaß (jeden Tag 50 %) mit voller Punktzahl belohnt. */
  let gSum = 0;
  for (const d of relevant) if (d.quote >= GOOD_DAY) gSum += wOf(d.key);
  const consistency = clamp(gSum / wSum);

  const streak = currentStreak(now);
  const streakScore = clamp(streak / RAMP);
  const maturity = clamp(all.length / RAMP);

  const raw = 0.60*completeness + 0.25*consistency + 0.15*streakScore;
  const value = Math.round(100 * raw * (0.55 + 0.45*maturity));

  return { value, completeness, consistency, streakScore, maturity,
           streak, best: bestStreak(now), days, tracked: all.length, fresh:false };
}

/* Wert, wie er vor `back` Tagen gewesen wäre — für den Trendpfeil. */
export function valueDaysAgo(back, now = new Date()){
  const then = S.addDays(now, -back);
  then.setHours(23, 59, 0, 0);
  return compute(then).value;
}

/* ------------------------------- Serien ------------------------------- */

export function currentStreak(now = new Date()){
  const todayKey = S.dayKey(now);
  let n = 0;
  for (let d = new Date(now); ; d = S.addDays(d, -1)){
    const key = S.dayKey(d), st = dayStats(key, now);
    if (key === todayKey){
      /* Der laufende Tag bricht die Serie nicht — er verlängert sie nur,
         wenn er schon geschafft ist. */
      if (st.soll > 0 && st.quote >= GOOD_DAY) n++;
      continue;
    }
    if (st.soll > 0 && st.quote >= GOOD_DAY) n++; else break;
    if (n > 400) break;
  }
  return n;
}

export function bestStreak(now = new Date()){
  let best = 0, run = 0;
  for (const key of trackedDays(now)){
    const st = dayStats(key, now);
    if (st.soll > 0 && st.quote >= GOOD_DAY){ run++; best = Math.max(best, run); }
    else if (key !== S.dayKey(now)) run = 0;
  }
  return best;
}

/* ---------------------- Reihen für die Statistik ---------------------- */

/* Die letzten `n` Tage, ältester zuerst — auch solche ohne jeden Eintrag. */
export function series(n, now = new Date()){
  const out = [];
  for (let i = n-1; i >= 0; i--){
    const key = S.dayKey(S.addDays(now, -i));
    out.push({ key, date: S.parseDay(key), ...dayStats(key, now) });
  }
  return out;
}

/* Quote je Block über `n` Tage */
export function byBlock(n, now = new Date()){
  return S.blocks().filter(b => b.items.length).map(b => {
    let done = 0, total = 0;
    for (let i = 0; i < n; i++){
      const key = S.dayKey(S.addDays(now, -i));
      if (i === 0){
        const due = new Date(now); due.setHours((b.hint ?? 12) + GRACE_H, 0, 0, 0);
        const got = S.log()[key]?.[b.id] || {};
        if (now < due && !b.items.some(id => got[id])) continue;
      }
      const p = S.blockProgress(key, b.id);
      done += p.done; total += p.total;
    }
    return { block:b, done, total, quote: total ? done/total : 0 };
  });
}

/* Quote je Baustein über `n` Tage — ein Baustein kann in mehreren Blöcken stecken */
export function byItem(n, now = new Date()){
  const rows = new Map();
  for (const item of S.items()) rows.set(item.id, { item, done:0, total:0, timed:0 });
  for (let i = 0; i < n; i++){
    const key = S.dayKey(S.addDays(now, -i));
    for (const b of S.blocks()){
      if (!b.items.length) continue;
      if (i === 0){
        const due = new Date(now); due.setHours((b.hint ?? 12) + GRACE_H, 0, 0, 0);
        const got = S.log()[key]?.[b.id] || {};
        if (now < due && !b.items.some(id => got[id])) continue;
      }
      for (const id of b.items){
        const r = rows.get(id); if (!r) continue;
        r.total++;
        const e = S.entry(key, b.id, id);
        if (e){ r.done++; if (e.timed) r.timed++; }
      }
    }
  }
  return [...rows.values()].filter(r => r.total > 0)
                           .map(r => ({ ...r, quote: r.done/r.total }));
}

export const GOOD = GOOD_DAY;
export const RAMP_DAYS = RAMP;
