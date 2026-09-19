/* Prüft die Erinnerungen mit langem Abstand: Monatsrechnung, Fälligkeit und
   die Rangfolge der Karte auf „Heute".
   Aufruf: node test/care.mjs */

const store = {};
globalThis.localStorage = {
  getItem: k => store[k] ?? null,
  setItem: (k,v) => store[k] = v,
  removeItem: k => delete store[k]
};
/* care.js zieht über ui.js ein paar DOM-Knoten — im Test genügen Attrappen. */
const knoten = () => ({
  classList: { add(){}, remove(){}, contains: () => false, toggle(){} },
  addEventListener(){}, querySelector: () => null, querySelectorAll: () => [],
  innerHTML: '', textContent: '', style: {}, appendChild(){}
});
globalThis.document = {
  querySelector: knoten, querySelectorAll: () => [],
  addEventListener(){}, createElement: knoten
};

const S = await import('../js/store.js');
const C = await import('../js/care.js');

const d = (y,m,day) => new Date(y, m-1, day);
let bad = 0;
const check = (name, got, want) => {
  const ok = String(got) === String(want);
  if (!ok) bad++;
  console.log(`${ok ? '✓' : '✗'}  ${name.padEnd(44)} → ${got}${ok ? '' : `   ERWARTET ${want}`}`);
};
const dmy = x => `${x.getDate()}.${x.getMonth()+1}.${x.getFullYear()}`;

console.log('--- Monate weiterzählen (Überlauf muss geklemmt werden) ---');
check('31.1.2026 + 1 Monat',  dmy(C.addMonths(d(2026,1,31), 1)),  '28.2.2026');
check('31.1.2024 + 1 Monat (Schaltjahr)', dmy(C.addMonths(d(2024,1,31), 1)), '29.2.2024');
check('31.3.2026 + 1 Monat',  dmy(C.addMonths(d(2026,3,31), 1)),  '30.4.2026');
check('15.11.2026 + 3 Monate', dmy(C.addMonths(d(2026,11,15), 3)), '15.2.2027');
check('20.6.2026 + 6 Monate',  dmy(C.addMonths(d(2026,6,20), 6)),  '20.12.2026');

console.log('\n--- Fälligkeit ---');
const kopf = { id:'head', name:'Bürstenkopf', icon:'🪥', months:3, last:'2026-06-20', on:true, snoozed:0 };
check('19.9. – einen Tag zu früh', C.status(kopf, d(2026,9,19)).state, 'ok');
check('   Tage bis dahin',         C.status(kopf, d(2026,9,19)).over,  -1);
check('20.9. – genau fällig',      C.status(kopf, d(2026,9,20)).state, 'due');
check('25.9. – überfällig',        C.status(kopf, d(2026,9,25)).over,   5);
check('ohne Datum',                C.status({ ...kopf, last:null }).state, 'setup');
check('abgeschaltet',              C.status({ ...kopf, on:false }).state,  'off');

console.log('\n--- Welche Karte kommt nach oben? ---');
const setze = arr => { const l = S.care(); l.length = 0; l.push(...arr); };
const jetzt = d(2026,9,25);

setze([{ ...kopf }, { id:'z', name:'Zahnarzt', icon:'🦷', months:6, last:null, on:true, snoozed:0 }]);
check('Fälliges schlägt Einzurichtendes', C.top(jetzt).care.id, 'head');

setze([{ ...kopf, last:'2026-06-20' },                       // 5 Tage überfällig
       { id:'z', name:'Zahnarzt', icon:'🦷', months:6, last:'2026-01-01', on:true, snoozed:0 }]);
check('Das länger Überfällige gewinnt',   C.top(jetzt).care.id, 'z');

setze([{ ...kopf, snoozed: +d(2026,9,24) }]);                // gestern „Später"
check('„Später" verstummt',               C.top(jetzt), 'null');
setze([{ ...kopf, snoozed: +d(2026,9,10) }]);                // vor 15 Tagen
check('… aber nicht für immer',           C.top(jetzt).care.id, 'head');

setze([{ ...kopf, on:false }]);
check('Abgeschaltetes taucht nie auf',    C.top(jetzt), 'null');

console.log(bad ? `\n${bad} Abweichung(en)` : '\nAlle Fälle wie erwartet.');
process.exit(bad ? 1 : 0);
