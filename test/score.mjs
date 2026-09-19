/* Prüft, wann ein Block in den Routine-Wert einfließt — und wann noch nicht.
   Der heikle Fall ist Mitternacht: Um 0:30 schlägt die App die Abendroutine
   weiterhin als „Abends von gestern" vor. Solange sie das tut, darf die
   Statistik den Tag nicht schon als versäumt abrechnen.
   Aufruf: node test/score.mjs */

const store = {};
globalThis.localStorage = {
  getItem: k => store[k] ?? null,
  setItem: (k,v) => store[k] = v,
  removeItem: k => delete store[k]
};
const S  = await import('../js/store.js');
const SC = await import('../js/score.js');

const K = d => `2026-09-${String(d).padStart(2,'0')}`;
const at = (day, h, m=0) => new Date(2026, 8, day, h, m);
const morgens = { brush:{at:1,timed:true}, tongue:{at:1,timed:true} };
const abends  = { brush:{at:1,timed:true}, floss:{at:1,timed:true}, rinse:{at:1,timed:true} };

/* 5.–17.9. lückenlos, am 18.9. ist der Morgen erledigt und der Abend offen */
function setup(){
  const l = S.log();
  for (const k of Object.keys(l)) delete l[k];
  for (let d = 5; d <= 17; d++) l[K(d)] = { morning:morgens, evening:abends };
  l[K(18)] = { morning:morgens };
}

let bad = 0;
const check = (name, got, want) => {
  const ok = got === want;
  if (!ok) bad++;
  console.log(`${ok ? '✓' : '✗'}  ${name.padEnd(46)} → ${got}${ok ? '' : `   ERWARTET ${want}`}`);
};

console.log('--- Der 18.9. mit offenem Abend, von verschiedenen Zeitpunkten aus ---');
for (const [name, now, wantQuote, wantStreak] of [
  ['18.9. 20:00 · Abend noch nicht fällig', at(18,20),    '1.00', 14],
  ['18.9. 23:30 · Kulanz abgelaufen',       at(18,23,30), '0.42', 13],
  ['19.9. 00:30 · noch „Abends von gestern"', at(19,0,30), '1.00', 14],
  ['19.9. 06:00 · immer noch',              at(19,6),     '1.00', 14],
  ['19.9. 09:30 · Abend gehört jetzt heute', at(19,9,30), '0.42',  0],
]){
  setup();
  check(name, SC.dayStats(K(18), now).quote.toFixed(2), wantQuote);
  check('   Serie dabei', SC.currentStreak(now), wantStreak);
}

console.log('\n--- Was weiterhin bestraft werden muss ---');
setup();
/* Der Morgen des 18.9. wäre versäumt — daran ändert die Nachtregel nichts */
delete S.log()[K(18)].morning;
check('19.9. 02:00 · Morgen von gestern versäumt', SC.dayStats(K(18), at(19,2)).quote.toFixed(2), '0.00');

setup();
check('18.9. 19:00 · Morgen von heute zählt schon', SC.dayStats(K(18), at(18,19)).quote.toFixed(2), '1.00');
delete S.log()[K(18)].morning;
check('18.9. 19:00 · und zwar auch als Lücke',      SC.dayStats(K(18), at(18,19)).quote.toFixed(2), '0.00');

setup();
/* Nur der Morgen ist um 8 fällig: Putzen 3 + Zungenreiniger 1 */
check('18.9. 08:00 · nur der Morgen ist fällig',   SC.dayStats(K(18), at(18,8)).soll,  4);
delete S.log()[K(18)].morning;
check('18.9. 08:00 · offen und noch nicht fällig',  SC.dayStats(K(18), at(18,8)).soll,  0);

console.log(bad ? `\n${bad} Abweichung(en)` : '\nAlle Fälle wie erwartet.');
process.exit(bad ? 1 : 0);
