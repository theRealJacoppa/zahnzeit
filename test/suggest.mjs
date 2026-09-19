/* Prüft die Vorschlagslogik gegen konkrete Uhrzeiten. */
const store = {};
globalThis.localStorage = {
  getItem: k => store[k] ?? null,
  setItem: (k,v) => store[k] = v,
  removeItem: k => delete store[k]
};
const S = await import('../js/store.js');

const d = (day, h, m=0) => new Date(2026, 8, day, h, m);   // September 2026
const K = day => `2026-09-${String(day).padStart(2,'0')}`;

const setLog = obj => { const l = S.log(); for (const k of Object.keys(l)) delete l[k]; Object.assign(l, obj); };
const voll = { brush:{at:1,timed:true}, tongue:{at:1,timed:true} };
const vollAbend = { brush:{at:1,timed:true}, floss:{at:1,timed:true}, rinse:{at:1,timed:true} };

const cases = [
  ['So 02:45 · alles offen',            d(19,2,45), {},                                    'evening', K(18)],
  ['So 02:45 · gestern Abend erledigt', d(19,2,45), { [K(18)]: { evening: vollAbend } },    'morning', K(19)],
  ['So 00:30 · alles offen',            d(19,0,30), {},                                    'evening', K(18)],
  ['So 08:00 · alles offen',            d(19,8,0),  {},                                    'morning', K(19)],
  ['So 08:00 · Morgen erledigt',        d(19,8,0),  { [K(19)]: { morning: voll } },         'evening', K(19)],
  ['So 22:00 · Morgen erledigt',        d(19,22,0), { [K(19)]: { morning: voll } },         'evening', K(19)],
  // Morgen ist um 19:00 zwölf Stunden überfällig – den putzt man abends nicht nach
  ['So 19:00 · Morgen vergessen',       d(19,19,0), {},                                    'evening', K(19)],
  ['So 07:30 · alles offen',            d(19,7,30), {},                                    'morning', K(19)],
  // 06:00 ist echt mehrdeutig: Aufstehen ist wahrscheinlicher, deshalb „Morgens" –
  // und genau hier fragt die Nachtlücke nach (siehe unten)
  ['So 06:00 · gestern Abend offen',    d(19,6,0),  {},                                    'morning', K(19)],
  ['So 12:00 · Morgen erledigt',        d(19,12,0), { [K(19)]: { morning: voll } },         'evening', K(19)],
];

let bad = 0;
for (const [name, now, log, wantBlock, wantKey] of cases){
  setLog(log);
  const r = S.suggestSession(now);
  const ok = r?.block.id === wantBlock && r?.key === wantKey;
  if (!ok) bad++;
  console.log(`${ok ? '✓' : '✗'}  ${name.padEnd(36)} → ${r?.block.id}/${r?.key}` +
              (ok ? '' : `   ERWARTET ${wantBlock}/${wantKey}`));
}

console.log('\n--- Nachtlücke (fragt die App nach?) ---');
for (const [name, now, log, wantAsk] of [
  ['02:45 · gestern Abend offen',    d(19,2,45), {},                                 true],
  ['02:45 · gestern Abend erledigt', d(19,2,45), { [K(18)]: { evening: vollAbend } }, false],
  ['08:00',                          d(19,8,0),  {},                                 false],
  ['22:00',                          d(19,22,0), {},                                 false],
  ['00:30 · gestern Abend offen',    d(19,0,30), {},                                 true],
  ['06:00 · gestern Abend offen',    d(19,6,0),  {},                                 true],
  ['06:00 · gestern Abend erledigt', d(19,6,0),  { [K(18)]: { evening: vollAbend } }, false],
]){
  setLog(log);
  const g = S.nightGap(now);
  const ok = !!g === wantAsk;
  if (!ok) bad++;
  console.log(`${ok ? '✓' : '✗'}  ${name.padEnd(36)} → ${g ? 'fragt nach' : 'fragt nicht'}`);
}
console.log(bad ? `\n${bad} Abweichung(en)` : '\nAlle Fälle wie erwartet.');
