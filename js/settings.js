/* =====================================================================
   settings.js — alles Einstellbare.

   Der Aufbau folgt dem, was man am häufigsten sucht: erst die Dauer des
   Putz-Timers, dann Ton und Aussehen, dann die Routine selbst
   (Bausteine und Tageszeiten), zuletzt die Daten.
   ===================================================================== */

import * as S from './store.js';
import { $, esc, openSheet, closeSheet, confirmSheet, toast, durLabel,
         clockLabel, clamp } from './ui.js';

const page = $('#pg-set');
let applyTheme = () => {};
export const bindTheme = fn => { applyTheme = fn; };

const ICONS = ['🪥','🧵','🪡','👅','🫧','🦷','💧','⏱','🌅','☀️','🌙','⭐','🌿','🧊','✨','🫙','🧴','🔆','🌆','🛏'];
const MODE_NOTE = {
  kai:   'Führt in sechs Phasen durch Kau-, Außen- und Innenflächen, mit dem Kiefermodell.',
  timer: 'Ein einfacher Countdown mit großem Ring – gut fürs Spülen.',
  check: 'Nur ein Haken in der Liste, ohne Timer.'
};

/* =============================== Seite =============================== */

export function render(){
  const st = S.settings();
  const kai = S.items().find(i => i.mode === 'kai');

  page.innerHTML = `
    <div class="topbar"><div><h1>Einstellungen</h1>
      <p class="sub">Leg fest, was zu deiner Routine gehört.</p></div></div>

    ${kai ? `<h2>Putz-Timer</h2>
    <div class="rows">
      <div class="row">
        <span class="emoji">${esc(kai.icon)}</span>
        <span class="lbl"><b>Dauer</b><small>6 × ${Math.round(kai.seconds/6)} Sek. je Fläche</small></span>
        ${stepper('kaiSec', kai.seconds, durLabel(kai.seconds))}
      </div>
    </div>` : ''}

    <h2>Allgemein</h2>
    <div class="rows">
      ${toggleRow('sound',  '🔔', 'Ton', 'Signal beim Phasenwechsel und am Ende', st.sound)}
      ${toggleRow('haptic', '📳', 'Vibration', 'Kurzes Feedback beim Abhaken', st.hapticCues)}
      <div class="row">
        <span class="emoji">🎨</span>
        <span class="lbl"><b>Erscheinungsbild</b><small>Hell, dunkel oder wie das System</small></span>
      </div>
      <div style="padding:0 15px 14px">
        <div class="seg-ctl" id="themeCtl" style="margin:0">
          ${[['auto','System'],['light','Hell'],['dark','Dunkel']].map(([v,l]) =>
            `<button data-v="${v}" class="${st.theme===v?'on':''}">${l}</button>`).join('')}
        </div>
      </div>
    </div>

    <h2>Bausteine</h2>
    <p class="sub" style="margin:-4px 4px 9px">Was du überhaupt tun kannst. Welche davon wann dran sind,
       legst du darunter bei den Tageszeiten fest.</p>
    <div class="rows">
      ${S.items().map(i => `
        <button class="row" data-item="${esc(i.id)}">
          <span class="emoji">${esc(i.icon)}</span>
          <span class="lbl"><b>${esc(i.name)}</b>
            <small>${esc(i.mode === 'check' ? 'Zum Abhaken' : durLabel(i.seconds) +
                    (i.mode === 'kai' ? ' · geführt' : ' · Countdown'))}</small></span>
          <span class="val">${esc(usedIn(i.id))}</span>
          <span class="chev">›</span>
        </button>`).join('')}
      <button class="row" id="addItem">
        <span class="emoji" style="color:var(--accent)">＋</span>
        <span class="lbl"><b style="color:var(--accent)">Baustein hinzufügen</b></span>
      </button>
    </div>

    <h2>Tageszeiten</h2>
    <p class="sub" style="margin:-4px 4px 9px">Die Richtzeit ist keine feste Grenze – die App nutzt sie nur,
       um zu raten, was gerade dran ist. Umstellen kannst du immer mit einem Tipp.</p>
    <div class="rows">
      ${S.blocks().map(b => `
        <button class="row" data-block="${esc(b.id)}">
          <span class="emoji">${esc(b.icon)}</span>
          <span class="lbl"><b>${esc(b.name)}</b>
            <small>ca. ${clockLabel(b.hint)} · ${b.items.length ? b.items.length + ' Baustein' + (b.items.length>1?'e':'') : 'nichts geplant'}</small></span>
          <span class="val">${b.items.map(id => esc(S.itemById(id)?.icon ?? '')).join(' ')}</span>
          <span class="chev">›</span>
        </button>`).join('')}
      <button class="row" id="addBlock">
        <span class="emoji" style="color:var(--accent)">＋</span>
        <span class="lbl"><b style="color:var(--accent)">Tageszeit hinzufügen</b></span>
      </button>
    </div>

    <h2>Daten</h2>
    <div class="rows">
      <button class="row" id="exp"><span class="emoji">📤</span>
        <span class="lbl"><b>Exportieren</b><small>Alles als Datei sichern</small></span><span class="chev">›</span></button>
      <button class="row" id="imp"><span class="emoji">📥</span>
        <span class="lbl"><b>Importieren</b><small>Sicherung zurückspielen</small></span><span class="chev">›</span></button>
      <button class="row" id="delLog"><span class="emoji">🧹</span>
        <span class="lbl"><b style="color:#C0392B">Verlauf löschen</b><small>Routine bleibt, Statistik wird leer</small></span></button>
      <button class="row" id="delAll"><span class="emoji">⚠️</span>
        <span class="lbl"><b style="color:#C0392B">Alles zurücksetzen</b><small>Auch Bausteine und Tageszeiten</small></span></button>
    </div>

    <h2>Der Routine-Wert</h2>
    <div class="card">
      <p class="sub">Er besteht zu 60 % aus der <b>Vollständigkeit</b> (wie viel vom Geplanten
        erledigt wurde), zu 25 % aus der <b>Verlässlichkeit</b> (an wie vielen Tagen es wirklich
        geschafft war) und zu 15 % aus der aktuellen <b>Serie</b>. Ältere Tage zählen weniger:
        nach 14 Tagen noch halb, nach einem Monat noch ein Viertel. Blickfeld sind 60 Tage.</p>
      <p class="sub" style="margin-top:9px">Der laufende Tag wird nie bestraft – ein Block zählt erst,
        wenn seine Richtzeit zwei Stunden zurückliegt. In den ersten drei Wochen ist der Wert
        gedämpft, damit er sich seinen Stand erst verdienen muss.</p>
      <p class="sub" style="margin-top:9px;color:var(--ink-dim);font-size:12px">
        Alle Daten bleiben auf diesem Gerät. Es gibt keinen Server und kein Konto.</p>
    </div>
    <input type="file" id="impFile" accept="application/json,.json" style="display:none">
    <div style="height:8px"></div>`;

  wire(kai);
}

const usedIn = id => {
  const n = S.blocks().filter(b => b.items.includes(id)).length;
  return n ? n + '×' : '–';
};

function toggleRow(key, icon, title, note, on){
  return `<div class="row">
    <span class="emoji">${icon}</span>
    <span class="lbl"><b>${esc(title)}</b><small>${esc(note)}</small></span>
    <label class="sw"><input type="checkbox" data-tg="${key}" ${on ? 'checked' : ''}><i></i></label>
  </div>`;
}
function stepper(id, v, label){
  return `<span class="stepper" data-st="${id}">
    <button data-d="-1" aria-label="weniger">−</button>
    <span class="v">${esc(label)}</span>
    <button data-d="1" aria-label="mehr">＋</button>
  </span>`;
}

/* ============================ Verknüpfen ============================ */

function wire(kai){
  page.querySelectorAll('[data-tg]').forEach(cb => cb.onchange = () => {
    const st = S.settings();
    if (cb.dataset.tg === 'sound')  st.sound = cb.checked;
    if (cb.dataset.tg === 'haptic') st.hapticCues = cb.checked;
    S.commit();
  });

  page.querySelectorAll('#themeCtl button').forEach(b => b.onclick = () => {
    S.settings().theme = b.dataset.v; S.commit(); applyTheme(); render();
  });

  const stEl = page.querySelector('[data-st="kaiSec"]');
  if (stEl && kai) stEl.querySelectorAll('button').forEach(b => b.onclick = () => {
    /* In 30-Sekunden-Schritten, damit die sechs Phasen glatt aufgehen */
    kai.seconds = clamp(kai.seconds + (+b.dataset.d)*30, 60, 600);
    S.commit(); render();
  });

  page.querySelectorAll('[data-item]').forEach(b => b.onclick = () => itemSheet(b.dataset.item));
  page.querySelectorAll('[data-block]').forEach(b => b.onclick = () => blockSheet(b.dataset.block));
  $('#addItem', page).onclick  = () => itemSheet(null);
  $('#addBlock', page).onclick = () => blockSheet(null);

  $('#exp', page).onclick = doExport;
  $('#imp', page).onclick = () => $('#impFile', page).click();
  $('#impFile', page).onchange = doImport;

  $('#delLog', page).onclick = async () => {
    if (await confirmSheet({ title:'Verlauf löschen?',
        note:'Alle aufgezeichneten Tage werden entfernt. Deine Bausteine und Tageszeiten bleiben. Das lässt sich nicht rückgängig machen.',
        ok:'Verlauf löschen', danger:true })){
      S.wipeLog(); toast('Verlauf gelöscht');
    }
  };
  $('#delAll', page).onclick = async () => {
    if (await confirmSheet({ title:'Alles zurücksetzen?',
        note:'Verlauf, Bausteine, Tageszeiten und Einstellungen gehen auf den Auslieferungszustand zurück. Das lässt sich nicht rückgängig machen.',
        ok:'Alles zurücksetzen', danger:true })){
      S.wipeAll(); applyTheme(); toast('Zurückgesetzt'); render();
    }
  };
}

/* =========================== Baustein-Blatt =========================== */

function itemSheet(id){
  const isNew = !id;
  const src = isNew ? { id:S.uid('item'), name:'', icon:'⭐', mode:'check', seconds:60 }
                    : { ...S.itemById(id) };
  const draft = { ...src };

  openSheet(
    `<h3>${isNew ? 'Neuer Baustein' : 'Baustein bearbeiten'}</h3>
     <p class="note">Was du tust. Wann es dran ist, entscheidest du bei den Tageszeiten.</p>

     <div class="field"><label>Name</label>
       <input type="text" id="fName" value="${esc(draft.name)}" placeholder="z. B. Zungenreiniger" maxlength="40"></div>

     <div class="field"><label>Symbol</label>
       <div class="chips" id="fIcons">${ICONS.map(e =>
         `<button class="chip ${e===draft.icon?'on':''}" data-e="${e}" style="font-size:19px;padding:7px 10px">${e}</button>`).join('')}</div>
     </div>

     <div class="field"><label>Art</label>
       <div class="seg-ctl" id="fMode" style="margin:0">
         ${Object.entries({kai:'Geführt', timer:'Countdown', check:'Abhaken'}).map(([v,l]) =>
           `<button data-v="${v}" class="${draft.mode===v?'on':''}">${l}</button>`).join('')}
       </div>
       <p class="hlp" id="fModeNote">${esc(MODE_NOTE[draft.mode])}</p>
     </div>

     <div class="field" id="fSecWrap" style="${draft.mode==='check'?'display:none':''}">
       <label>Dauer</label>
       <input type="range" id="fSec" min="10" max="600" step="5" value="${draft.seconds}">
       <p class="hlp"><b id="fSecLbl">${esc(durLabel(draft.seconds))}</b></p>
     </div>

     <div class="sheetbtns">
       ${isNew ? '' : '<button class="btn btn-danger" id="fDel">Löschen</button>'}
       <button class="btn btn-primary" id="fOk">${isNew ? 'Anlegen' : 'Sichern'}</button>
     </div>`,
    p => {
      const nm = p.querySelector('#fName');
      nm.oninput = () => draft.name = nm.value;
      p.querySelectorAll('#fIcons .chip').forEach(c => c.onclick = () => {
        draft.icon = c.dataset.e;
        p.querySelectorAll('#fIcons .chip').forEach(x => x.classList.toggle('on', x === c));
      });
      p.querySelectorAll('#fMode button').forEach(b => b.onclick = () => {
        draft.mode = b.dataset.v;
        p.querySelectorAll('#fMode button').forEach(x => x.classList.toggle('on', x === b));
        p.querySelector('#fModeNote').textContent = MODE_NOTE[draft.mode];
        p.querySelector('#fSecWrap').style.display = draft.mode === 'check' ? 'none' : '';
        if (draft.mode === 'kai' && draft.seconds < 60){ draft.seconds = 180; syncSec(); }
      });
      const sec = p.querySelector('#fSec');
      const syncSec = () => { sec.value = draft.seconds; p.querySelector('#fSecLbl').textContent = durLabel(draft.seconds); };
      sec.oninput = () => { draft.seconds = +sec.value; p.querySelector('#fSecLbl').textContent = durLabel(draft.seconds); };

      p.querySelector('#fOk').onclick = () => {
        draft.name = draft.name.trim();
        if (!draft.name){ nm.focus(); toast('Bitte einen Namen eingeben'); return; }
        if (draft.mode === 'kai') draft.seconds = Math.max(60, Math.round(draft.seconds/6)*6);
        const list = S.items(), i = list.findIndex(x => x.id === draft.id);
        i < 0 ? list.push(draft) : list[i] = draft;
        S.commit(); closeSheet(); render();
      };
      const del = p.querySelector('#fDel');
      if (del) del.onclick = async () => {
        const used = S.blocks().filter(b => b.items.includes(draft.id));
        closeSheet();
        if (await confirmSheet({ title:`„${draft.name}" löschen?`,
            note: used.length ? `Der Baustein wird aus ${used.length} Tageszeit${used.length>1?'en':''} entfernt. Bereits aufgezeichnete Tage bleiben erhalten.`
                              : 'Bereits aufgezeichnete Tage bleiben erhalten.',
            ok:'Löschen', danger:true })){
          S.settings().items = S.items().filter(x => x.id !== draft.id);
          for (const b of S.blocks()) b.items = b.items.filter(x => x !== draft.id);
          S.commit(); toast('Gelöscht');
        }
        render();
      };
    });
}

/* ============================ Block-Blatt ============================ */

function blockSheet(id){
  const isNew = !id;
  const src = isNew ? { id:S.uid('block'), name:'', icon:'⭐', hint:12, items:[] }
                    : { ...S.blockById(id), items:[...S.blockById(id).items] };
  const draft = { ...src };

  const paint = p => {
    /* Gewählte Bausteine in ihrer Reihenfolge, darunter die übrigen */
    p.querySelector('#bChosen').innerHTML = draft.items.length
      ? draft.items.map((iid, n) => {
          const it = S.itemById(iid); if (!it) return '';
          return `<div class="row" style="padding:9px 0;border-top:1px solid var(--line-2)">
              <span class="emoji">${esc(it.icon)}</span>
              <span class="lbl"><b>${esc(it.name)}</b></span>
              <span class="reorder">
                <button data-up="${n}" ${n===0?'disabled':''}>▲</button>
                <button data-dn="${n}" ${n===draft.items.length-1?'disabled':''}>▼</button>
                <button data-rm="${n}" style="color:#C0392B">✕</button>
              </span>
            </div>`;
        }).join('')
      : '<p class="hlp" style="margin:6px 0 0">Noch nichts gewählt – dieser Block zählt dann auch nicht für den Routine-Wert.</p>';

    p.querySelector('#bPool').innerHTML = S.items()
      .filter(i => !draft.items.includes(i.id))
      .map(i => `<button class="chip" data-add="${esc(i.id)}">${esc(i.icon)} ${esc(i.name)}</button>`).join('')
      || '<span class="hlp">Alle Bausteine sind schon drin.</span>';

    p.querySelectorAll('[data-up]').forEach(b => b.onclick = () => {
      const n = +b.dataset.up; [draft.items[n-1], draft.items[n]] = [draft.items[n], draft.items[n-1]]; paint(p);
    });
    p.querySelectorAll('[data-dn]').forEach(b => b.onclick = () => {
      const n = +b.dataset.dn; [draft.items[n+1], draft.items[n]] = [draft.items[n], draft.items[n+1]]; paint(p);
    });
    p.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => {
      draft.items.splice(+b.dataset.rm, 1); paint(p);
    });
    p.querySelectorAll('[data-add]').forEach(b => b.onclick = () => {
      draft.items.push(b.dataset.add); paint(p);
    });
  };

  openSheet(
    `<h3>${isNew ? 'Neue Tageszeit' : 'Tageszeit bearbeiten'}</h3>
     <p class="note">Eine benannte Etappe deines Tages mit ihrer eigenen Liste.</p>

     <div class="field"><label>Name</label>
       <input type="text" id="bName" value="${esc(draft.name)}" placeholder="z. B. Abends" maxlength="30"></div>

     <div class="field"><label>Symbol</label>
       <div class="chips" id="bIcons">${ICONS.map(e =>
         `<button class="chip ${e===draft.icon?'on':''}" data-e="${e}" style="font-size:19px;padding:7px 10px">${e}</button>`).join('')}</div>
     </div>

     <div class="field"><label>Richtzeit</label>
       <input type="range" id="bHint" min="0" max="23" step="1" value="${draft.hint}">
       <p class="hlp">Ungefähr <b id="bHintLbl">${clockLabel(draft.hint)}</b> – keine feste Grenze.
          Die App rät damit, welcher Block gerade dran ist, und ordnet eine späte Session
          notfalls noch dem Vortag zu.</p>
     </div>

     <div class="field"><label>Bausteine in dieser Reihenfolge</label>
       <div id="bChosen"></div>
       <div style="margin-top:11px"><div class="chips" id="bPool"></div></div>
     </div>

     <div class="sheetbtns">
       ${isNew ? '' : '<button class="btn btn-danger" id="bDel">Löschen</button>'}
       <button class="btn btn-primary" id="bOk">${isNew ? 'Anlegen' : 'Sichern'}</button>
     </div>`,
    p => {
      const nm = p.querySelector('#bName');
      nm.oninput = () => draft.name = nm.value;
      p.querySelectorAll('#bIcons .chip').forEach(c => c.onclick = () => {
        draft.icon = c.dataset.e;
        p.querySelectorAll('#bIcons .chip').forEach(x => x.classList.toggle('on', x === c));
      });
      const h = p.querySelector('#bHint');
      h.oninput = () => { draft.hint = +h.value; p.querySelector('#bHintLbl').textContent = clockLabel(draft.hint); };
      paint(p);

      p.querySelector('#bOk').onclick = () => {
        draft.name = draft.name.trim();
        if (!draft.name){ nm.focus(); toast('Bitte einen Namen eingeben'); return; }
        const list = S.blocks(), i = list.findIndex(x => x.id === draft.id);
        i < 0 ? list.push(draft) : list[i] = draft;
        list.sort((a,b) => a.hint - b.hint);        /* der Tag läuft von früh nach spät */
        S.commit(); closeSheet(); render();
      };
      const del = p.querySelector('#bDel');
      if (del) del.onclick = async () => {
        closeSheet();
        if (await confirmSheet({ title:`„${draft.name}" löschen?`,
            note:'Bereits aufgezeichnete Tage bleiben erhalten, fließen aber nicht mehr in den Wert ein.',
            ok:'Löschen', danger:true })){
          S.settings().blocks = S.blocks().filter(x => x.id !== draft.id);
          S.commit(); toast('Gelöscht');
        }
        render();
      };
    });
}

/* ========================== Sichern / Laden ========================== */

function doExport(){
  const name = 'zahnzeit-' + S.dayKey(new Date()) + '.json';
  const url = URL.createObjectURL(new Blob([S.exportJSON()], { type:'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast('Sicherung erstellt');
}

function doImport(ev){
  const f = ev.target.files?.[0];
  ev.target.value = '';
  if (!f) return;
  const r = new FileReader();
  r.onload = async () => {
    if (!(await confirmSheet({ title:'Sicherung einspielen?',
        note:'Der aktuelle Stand wird dabei vollständig ersetzt.', ok:'Einspielen', danger:true }))) return;
    try { S.importJSON(String(r.result)); applyTheme(); render(); toast('Eingespielt'); }
    catch(e){ toast('Datei konnte nicht gelesen werden'); }
  };
  r.readAsText(f);
}
