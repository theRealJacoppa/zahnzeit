/* Führt alle Testdateien nacheinander aus — je in einem eigenen Prozess,
   damit sie sich nicht denselben Modulzustand teilen.
   Aufruf: node test/all.mjs */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DATEIEN = ['suggest.mjs', 'score.mjs', 'care.mjs'];
let bad = 0;

for (const f of DATEIEN){
  console.log(`\n══════ ${f} ══════`);
  const r = spawnSync(process.execPath, [fileURLToPath(new URL(f, import.meta.url))],
                      { stdio: 'inherit' });
  if (r.status !== 0) bad++;
}

console.log(bad ? `\n${bad} von ${DATEIEN.length} Dateien mit Abweichungen.`
                : `\nAlle ${DATEIEN.length} Testdateien ohne Abweichung.`);
process.exit(bad ? 1 : 0);
