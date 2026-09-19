/* =====================================================================
   ui.js — die kleinen Dinge, die alle Seiten brauchen: Blätter von
   unten, kurze Hinweise, Datumsformate, Escaping.
   ===================================================================== */

export const $  = (s, r=document) => r.querySelector(s);
export const $$ = (s, r=document) => [...r.querySelectorAll(s)];

/* Alles, was aus den Einstellungen kommt, ist frei eingegebener Text und
   wird über innerHTML eingesetzt — deshalb hier konsequent entschärfen. */
export const esc = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
export const pct = v => Math.round(v*100) + '%';

/* Die Symbolauswahl — von Bausteinen, Tageszeiten und Erinnerungen geteilt. */
export const ICONS = ['🪥','🧵','🪡','👅','🫧','🦷','💧','⏱','🌅','☀️','🌙','⭐','🌿','🧊','✨','🫙','🧴','🔆','🌆','🛏'];

/* ------------------------------ Blatt ------------------------------ */

const sheet = $('#sheet'), panel = $('#sheetPanel');
let onClose = null;

export function openSheet(html, setup){
  panel.innerHTML = '<div class="grip"></div>' + html;
  sheet.classList.add('on');
  if (setup) setup(panel);
  return panel;
}
export function closeSheet(){
  sheet.classList.remove('on');
  panel.innerHTML = '';
  const f = onClose; onClose = null; f && f();
}
export const sheetOpen = () => sheet.classList.contains('on');
sheet.addEventListener('click', e => { if (e.target.dataset.close !== undefined) closeSheet(); });

/* Ein Blatt mit Ja/Nein. Löst mit true auf, wenn bestätigt wurde. */
export function confirmSheet({ title, note, ok='Ja', cancel='Abbrechen', danger=false }){
  return new Promise(resolve => {
    let answered = false;
    openSheet(
      `<h3>${esc(title)}</h3>${note ? `<p class="note">${esc(note)}</p>` : ''}
       <div class="sheetbtns">
         <button class="btn" data-no>${esc(cancel)}</button>
         <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-yes>${esc(ok)}</button>
       </div>`,
      p => {
        p.querySelector('[data-no]').onclick  = () => { answered = true; closeSheet(); resolve(false); };
        p.querySelector('[data-yes]').onclick = () => { answered = true; closeSheet(); resolve(true); };
      });
    onClose = () => { if (!answered) resolve(false); };
  });
}

/* ----------------------------- Hinweis ----------------------------- */

const toastEl = $('#toast');
let toastTimer = 0;
export function toast(msg){
  toastEl.textContent = msg;
  toastEl.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('on'), 2100);
}

/* ------------------------------ Datum ------------------------------ */

const WD = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
const WD_S = ['So','Mo','Di','Mi','Do','Fr','Sa'];
const MO = ['Januar','Februar','März','April','Mai','Juni','Juli',
            'August','September','Oktober','November','Dezember'];

export const weekday  = d => WD[d.getDay()];
export const weekdayS = d => WD_S[d.getDay()];
export const dateLong = d => `${WD[d.getDay()]}, ${d.getDate()}. ${MO[d.getMonth()]}`;
export const dateShort= d => `${d.getDate()}.${d.getMonth()+1}.`;
export const monthName= m => MO[m];

/* „Heute" / „Gestern" / sonst das Datum */
export function relDay(key, todayKey, yestKey){
  if (key === todayKey) return 'Heute';
  if (key === yestKey)  return 'Gestern';
  const [y,m,d] = key.split('-').map(Number);
  return `${WD_S[new Date(y,m-1,d).getDay()]}, ${d}.${m}.`;
}

export const mmss = sec => Math.floor(sec/60) + ':' + String(Math.round(sec)%60).padStart(2,'0');
export function durLabel(sec){
  if (sec < 60) return sec + ' Sek.';
  const m = Math.floor(sec/60), s = sec%60;
  return s ? `${m}:${String(s).padStart(2,'0')} Min.` : `${m} Min.`;
}
export const clockLabel = h => String(h).padStart(2,'0') + ':00';

/* ------------------------------ Haptik ------------------------------ */
let hapticsOn = true;
export const setHaptics = v => { hapticsOn = v; };
export function buzz(ms = 12){
  if (hapticsOn && navigator.vibrate) { try { navigator.vibrate(ms); } catch(e){} }
}
