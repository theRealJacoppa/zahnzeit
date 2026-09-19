/* =====================================================================
   kai.js — der Ablauf des Putzvorgangs nach der KAI-Systematik:
   Kauflächen, Außenflächen, Innenflächen; jeweils oben und unten.
   Die Gesamtdauer ist einstellbar, die sechs Phasen teilen sie gleichmäßig.
   ===================================================================== */

export const PHASES = [
  { s:'kau',    a:'upper' }, { s:'kau',    a:'lower' },
  { s:'aussen', a:'upper' }, { s:'aussen', a:'lower' },
  { s:'innen',  a:'upper' }, { s:'innen',  a:'lower' },
];
export const S_NAME = { kau:'Kauflächen', aussen:'Außenflächen', innen:'Innenflächen' };
export const A_NAME = { upper:'oben', lower:'unten' };
export const TIPS = {
  kau:    'Kleine kreisende Bewegungen auf den Kauflächen',
  aussen: 'Außen kreisen – vom Zahnfleisch zum Zahn',
  innen:  'Innen sanft auswischen, Rot nach Weiß'
};
