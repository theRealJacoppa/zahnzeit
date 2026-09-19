# Zahnzeit – Projektkontext

Übergabe-Dokument, damit in einem neuen Chat ohne Rückfragen weitergearbeitet werden kann.
Stand: 19.09.2026

---

## 1. Was die App ist

Eine Webapp, die beim Aufbau einer täglichen Zahnputzroutine unterstützt. Läuft als
Webapp auf dem iPhone (Safari → „Zum Home-Bildschirm"), gehostet über **GitHub Pages**.
Die App ist öffentlich, alle Daten bleiben lokal auf dem Gerät — das ist so gewollt.
Es gibt keinen Server, kein Konto, keine Anmeldung.

Vier Ansichten:

| Ansicht | Zweck |
|---|---|
| **Heute** | Startseite. Führt durch die Routine, die gerade dran ist. |
| **Statistik** | Routine-Wert 0–100, Verlauf, Aufschlüsselung. |
| **Einstellungen** | Timerlänge, Bausteine, Tageszeiten, Daten. |
| **Putz-Timer** | Vollbild, öffnet sich aus „Heute". Kein eigener Tab. |

Kern des Timers ist das **KAI-Format**: Kauflächen → Außenflächen → Innenflächen,
jeweils oben und unten, also 6 Phasen, mit animiertem 3D-Kiefermodell.

---

## 2. Dateien

```
index.html              Gerüst: Markup aller Seiten, Tableiste, Timer-Ansichten
css/app.css             Sämtliches CSS, Farbtoken auf :root
js/
  app.js                Einstieg: Seitenwechsel, Erscheinungsbild, Verdrahtung
  store.js              Datenmodell, localStorage, Tageszuordnung
  score.js              Der Routine-Wert und die Zahlen für die Statistik
  today.js              Seite „Heute"
  stats.js              Seite „Statistik"
  settings.js           Seite „Einstellungen"
  runner.js             Der Vollbild-Ablauf durch eine Routine
  confetti.js           Der Jubel am Ende
  model3d.js            Das 3D-Kiefermodell
  kai.js                Die sechs Phasen und ihre Beschriftungen
  ui.js                 Blätter, Hinweise, Datumsformate, Escaping
test/
  suggest.mjs           Prüft die Vorschlagslogik gegen konkrete Uhrzeiten
                        (node test/suggest.mjs – braucht nichts installiert)
three.module.min.js     Three.js r186, lokal (nicht per CDN, damit es offline läuft)
three.core.js           Gehört zu Three.js r186
zahn-2d.html            Ältere 2D-Fassung, nur noch Sicherheitsnetz
.claude/launch.json     Startkonfiguration für den Entwicklungsserver
```

Alles muss ins Repo, damit GitHub Pages funktioniert. Kein Build-Schritt, keine
Abhängigkeiten außer Three.js.

---

## 3. Starten und testen

**Doppelklick auf `index.html` funktioniert nicht** — Browser blockieren ES-Module bei
`file://`. Die Seite zeigt dann nach 2,5 Sekunden einen Hinweis plus Link zur 2D-Version.

```bash
cd /Users/jakob.kreisberger/Claude/zahn_app && python3 -m http.server 8731
```

Dann `http://localhost:8731` öffnen. Auf GitHub Pages läuft es direkt.

**Beim Entwickeln:** `python3 -m http.server` sendet `Last-Modified`, der Browser cacht
dann CSS und JS und zeigt Änderungen nicht an. Entweder hart neu laden oder einen Server
mit `Cache-Control: no-store` benutzen.

Beim Testen in einem **versteckten Tab** drosselt der Browser auf ~1 Bild/s. Dann laufen
alle Übergänge (Kieferöffnung, Ein-/Ausblenden, das Blatt von unten) sehr langsam und
Bildschirmfotos zeigen Zwischenzustände. Das ist kein Fehler im Code.

---

## 4. Das Datenmodell

Alles unter einem einzigen localStorage-Schlüssel `zz-v2`:

```js
{
  version: 2,
  settings: {
    sound, theme ('auto'|'light'|'dark'), hapticCues,
    items:  [ { id, name, icon, mode, seconds } ],
    blocks: [ { id, name, icon, hint, items: [itemId, …] } ]
  },
  log: { "2026-09-19": { morning: { brush: { at, timed, sec } } } }
}
```

**Baustein (item)** — etwas, das man tut. `mode` ist eines von:

| mode | Verhalten |
|---|---|
| `kai` | Der geführte Putz-Timer mit Kiefermodell, sechs Phasen |
| `timer` | Einfacher Countdown mit großem Ring |
| `check` | Nur ein Haken, kein Timer |

**Block** — eine benannte Tageszeit mit eigener Bausteinliste. `hint` ist die Richtzeit
als Stunde (0–23), **keine harte Grenze**.

Beides ist vollständig über die Einstellungen anleg-, umbenenn- und löschbar.
Vorbelegt sind fünf Bausteine (Putzen, Zahnseide, Interdentalbürste, Zungenreiniger,
Mundspülung) und drei Blöcke (Morgens 7, Mittags 13, Abends 21).

Die alte Ton-Einstellung aus der Timer-only-Fassung (`zz-sound`) wird beim ersten Start
übernommen.

---

## 5. Die Tageszuordnung — der Kern der Bedienlogik

Das Problem: Der Nutzer geht mal um 6:00 morgens schlafen und steht mal um 6:00 morgens
auf. Dieselbe Uhrzeit kann Abend- oder Morgenroutine bedeuten. Feste Uhrzeitfenster
scheitern daran.

Drei Bausteine in `store.js` lösen das:

**`suggestSession(now)` rät, was gerade dran ist.** Bewertet wird nicht der Block allein,
sondern das Paar aus **Block und Tag** — „Abends von gestern" und „Abends von heute" sind
zwei verschiedene Dinge. Die Rangfolge:

| Lage | Punkte |
|---|---|
| fällig (ab `EARLY_H` = 1,5 h davor) und noch offen | 200 − Stunden seit fällig |
| Richtzeit kommt erst noch | 100 − Stunden bis dahin |
| länger als `STALE_H` = 8 h überfällig | negativ |
| bereits vollständig | −300 |

Entscheidend ist, dass **fällig und offen** klaren Vorrang hat. Ohne das gewinnt um kurz
vor 3 Uhr nachts die Morgenroutine (4 h entfernt) knapp gegen den überfälligen, offenen
Abend (5,75 h her) — genau der Fall, der in der Bedienung verwirrt hat. Die 8-Stunden-
Grenze sorgt umgekehrt dafür, dass man abends um sieben nicht die vergessene
Morgenroutine vorgeschlagen bekommt.

**`dayForBlock(block, now)` entscheidet, zu welchem Tag eine Sitzung zählt.** Liegt
„heute um `hint` Uhr" oder „gestern um `hint` Uhr" näher an jetzt? Dadurch landet die
Abendroutine um 3 Uhr nachts beim Vortag — der Tag endet, wenn man schlafen geht, nicht
um Mitternacht. In die Zukunft wird nie verschoben.

**`nightGap(now)` erkennt, wann die App raten müsste, und lässt sie stattdessen fragen.**
Liegt „jetzt" zwischen dem letzten Block von gestern und dem ersten von heute, und ist
gestern Abend noch offen, erscheint auf „Heute" die Karte *„Es ist 2:47 Uhr – hast du
seitdem geschlafen?"* mit zwei Antworten. Die Antwort gilt acht Stunden
(`setNightAnswer` / `nightAnswer`). Das ist die einzige Stelle, an der die App aktiv
nachfragt, statt eine Annahme zu treffen.

Der gewählte Tag steht auf „Heute" immer als eigener Chip neben dem Blocknamen und wird
**hervorgehoben, sobald er nicht der heutige ist**.

`test/suggest.mjs` prüft all das gegen konkrete Uhrzeiten. Wer an den Schwellen dreht,
sollte den Test danach laufen lassen.

### Was liegen geblieben ist

`catchUp()` in `today.js` sucht den jüngsten Block der letzten beiden Tage, dessen
Richtzeit zwischen 2 und 18 Stunden zurückliegt und der noch nicht fertig ist. Er
erscheint als eigene Karte mit *Nachtragen* / *War nichts*. Ein „War nichts"
(`dismissBlock`) nimmt ihn nur aus der Rückfrage — für den Routine-Wert zählt der Tag
weiterhin so, wie er wirklich war. Solange die Nachtfrage offen ist, wird diese Karte
unterdrückt, damit nicht zwei Rückfragen nebeneinander stehen.

## 6. Der Routine-Wert (`score.js`)

Eine Zahl von 0 bis 100 aus drei Teilen:

| Anteil | Was | Wie |
|---|---|---|
| 60 % | **Vollständigkeit** | Geplant gegen erledigt, exponentiell gewichtet |
| 25 % | **Verlässlichkeit** | Anteil der Tage, an denen ≥ 80 % geschafft war |
| 15 % | **Serie** | Aktuelle Strähne, voll ab 21 Tagen |

Stellschrauben oben in der Datei: `HALF_LIFE` 14 Tage (danach zählt ein Tag halb),
`WINDOW` 60 Tage Blickfeld, `RAMP` 21 Tage, `GOOD_DAY` 0.8, `GRACE_H` 2 Stunden.
Bausteine sind unterschiedlich gewichtet (`WEIGHT`): Putzen 3, Countdown 1.5, Abhaken 1.

Zwei Eigenschaften, die für das Gefühl entscheidend sind:

- **Der laufende Tag wird nie bestraft.** Ein Block zählt erst, wenn seine Richtzeit
  plus zwei Stunden Kulanz vorbei ist. Morgens um 8 zieht die noch offene Abendroutine
  den Wert also nicht herunter.
- **Aufbauphase.** In den ersten 21 aufgezeichneten Tagen wird der Wert gedämpft
  (Faktor 0.55 → 1.0), damit er nicht nach einem einzigen guten Tag bei 90 steht.

Bewusst **nicht** die Streuung der Tagesquoten als Maß für Regelmäßigkeit: Das hätte
gleichmäßiges Mittelmaß (jeden Tag 50 %) mit voller Punktzahl belohnt.

---

## 7. Der Routine-Ablauf (`runner.js`)

Einmal gestartet, bleibt die Routine im Vollbild, bis sie durch ist. Es gibt **eine**
Ansicht (`#run`) mit vier Bühnen, von denen immer genau eine sichtbar ist:

| Bühne | wofür |
|---|---|
| `rsKai` | der geführte Putzvorgang mit Kiefermodell |
| `rsTimer` | Countdown mit großem Ring |
| `rsCheck` | nur abhaken, großes Symbol |
| `rsDone` | Abschlussbild |

Oben läuft die **Schrittkette** mit (`.rdot`): erledigt, aktuell, offen — und sie ist
antippbar, um gezielt zu springen.

Damit kein Schritt endlos wiederkehrt, merkt sich der Ablauf in `run.visited`, was schon
einmal angeboten wurde. `nextOpen()` überspringt alles, was erledigt oder schon dran war;
gibt es nichts mehr, kommt das Abschlussbild.

**Konfetti gibt es nur, wenn der Block wirklich vollständig ist.** Wer Schritte auslässt,
bekommt „Bis hierher geschafft" mit der ehrlichen Zahl. Bei eingeschaltetem „Bewegung
reduzieren" fällt der Jubel ganz aus, die Meldung trägt dann allein.

Verlassen geht über das ✕ oben links und fragt nach, solange etwas offen ist. Bereits
Erledigtes bleibt in jedem Fall eingetragen.

Einstieg ist immer `startRun({ key, block, fromId, onFinish })`. Nur der Kreis in der
Schrittzeile auf „Heute" hakt direkt ab, ohne den Ablauf zu öffnen.

## 8. Wie das 3D-Modell funktioniert

Liegt vollständig in `model3d.js`, nach außen nur `createJaw(canvas)` mit
`{ ok, render(now, dt, state), resize(), setTheme(dark) }`. Das Modell wird erst beim
ersten Öffnen des Timers erzeugt, damit die App nicht beim Start WebGL hochfährt — der
Hell/Dunkel-Zustand wird deshalb in `timer.js` gemerkt und nachgereicht.

**Zahnbogen.** Grundform ist eine Ellipse (`BASE = {rx:100, ry:165}`, Ausschnitt 186°–354°),
also tief-U statt flachem Bogen. Die 14 Zähne pro Kiefer werden **nach Bogenlänge**
verteilt, nicht nach Winkel — dadurch sitzen sie lückenlos. Die Bogengröße wird aus der
Summe der Zahnbreiten zurückgerechnet, d. h. andere Zahnmaße skalieren den Bogen mit.

**Zahnformen.** Vier Typen (`incisor`, `canine`, `premolar`, `molar`) mit eigener Kontur
in Aufsicht. Der 3D-Körper entsteht, indem die Kontur über sieben Ringe hochgezogen wird
(Zahnhals schmal, Äquatorwölbung, Verjüngung zur Krone) und oben mit einem Höckerrelief
geschlossen wird: vier Höcker beim Molaren, zwei beim Prämolaren, Spitze beim Eckzahn,
Schneidekante beim Frontzahn.

**Zahnfleisch.** Ein Querschnitt (15 Stützpunkte) wird viermal per Chaikin-Verfahren
abgerundet und entlang des Bogens geloftet (150 Ringe). Beide Enden laufen in eine
gerundete Kuppe mit einzelnem Spitzenpunkt aus.

**Kieferbewegung.** Beide Kiefer hängen an einem gemeinsamen Scharnier hinter den
Zahnreihen (`HINGE`), wie ein Kiefergelenk. Geöffnet wird je Phase unterschiedlich weit
(`OPEN`), wobei der aktive Kiefer den größeren Anteil übernimmt (`SHARE`).

**Kamera.** Steht **fest**. Position ergibt sich aus `VIEW.elev` und einer Distanz, die
aus dem Seitenverhältnis berechnet wird (`fitDistance`), damit im Hochformat der ganze
Mund ins Bild passt. Bewegt wird nur der Kiefer.

**Neigung (`TIP`).** Kleine Neigung des ganzen Modells zum aktiven Kiefer hin. Notwendig,
weil Kau- und Innenflächen des Oberkiefers aus einer starr waagrechten Sicht geometrisch
nicht sichtbar sind. `0` setzen schaltet sie ab.

**Darstellung.** **Keine Beleuchtung.** Alle Materialien sind `MeshBasicMaterial`, Tone
Mapping ist aus. Die Form kommt über eine Kontur: eine Kopie jeder Geometrie, deren
Punkte entlang der Normalen nach außen gerückt und nur von innen gerendert werden
(`outlineGeometry`, Zähne 0.28, Zahnfleisch 0.38).

**Bürste.** Flache orange Kapsel, hängt am aktiven Kiefer und wandert **einmal** über die
Fläche (kein Hin und Zurück). Blendet beim Pausieren aus und an derselben Stelle wieder
ein. Zahnmaße werden entlang des Bogens interpoliert (`sizeAt`), damit sie nicht zwischen
Zahnhöhen springt.

### Stellschrauben

```js
VIEW  = { elev: 6, rad: 76 }                         // Kamerahöhe in Grad, Bildradius
OPEN  = { aussen: 7, kau: 44, innen: 64, fertig: 2 } // Kieferöffnung in Grad
TIP   = { aussen: 0, kau: 16, innen: 30, fertig: -2 }// Neigung des Modells
SHARE = { aussen: .5, kau: .8, innen: .58 }          // Anteil des aktiven Kiefers
BITE  = 9                                            // Zusammenrücken zum Lächeln
PAL   = { enamel, gum, outline, brush }              // vier Farben je Hell/Dunkel-Modus
```

Die Timerdauer kommt nicht mehr aus einer Konstante, sondern aus `item.seconds` des
Bausteins (in den Einstellungen einstellbar, 1–10 Minuten in 30-Sekunden-Schritten).

---

## 9. Farben

Alle Farbtoken liegen auf `:root` in `css/app.css`, für Dunkel unter
`prefers-color-scheme` und zusätzlich unter `[data-theme="dark"]`, weil sich der Modus
in den Einstellungen fest setzen lässt.

Die beiden Diagrammfarben `--c1` / `--c2` sind **nicht frei gewählt**: Sie sind für hell
(`#C8622F` / `#00897B`) und dunkel (`#CE6B36` / `#00A08D`) getrennt gegen die jeweilige
Fläche geprüft — Helligkeitsband, Sättigung, Abstand bei Farbfehlsichtigkeit (ΔE ≥ 8)
und Kontrast. Eine dritte Serie nicht dazuerfinden, ohne das Paar neu zu prüfen.

**Achtung Namenskollision:** `.seg` gehört den Fortschrittssegmenten des Timers. Die
Segmente im Säulendiagramm heißen deshalb `.part`.

**Waagrechte Balken:** Eine Liste (`.hbars`) ist **ein** Grid, die Zeilen (`.hbar`) sind
`display:contents`. Nur so teilen sich alle Zeilen dieselben Spalten und die Balken
beginnen untereinander, ausgerichtet am längsten Namen. Jede Zeile als eigenes Grid zu
setzen sieht im Code richtig aus, ergibt aber ausgefranste Balkenanfänge.

**Zeiträume in der Aufschlüsselung** werden auf das begrenzt, was aufgezeichnet ist
(`eff` in `stats.js`). Sonst rechnet sie in der ersten Woche gegen 30 Kalendertage und
meldet 3 %, obwohl nichts versäumt wurde.

---

## 10. Entscheidungen, die schon gefallen sind

Das hier bitte **nicht** wieder einführen — wurde ausprobiert und ausdrücklich verworfen:

- **Keine Kamerafahrt.** Eine frühere Fassung ließ die Kamera pro Fläche umherfliegen und
  heranzoomen. Wurde als übertrieben abgelehnt. Die Kamera bleibt fest, der ganze Kiefer
  ist immer vollständig im Bild.
- **Keine 180°-Drehung des Modells** für die Innenflächen. Getestet und verworfen;
  stattdessen klappt der Kiefer dort weiter auf (`OPEN.innen`).
- **Gegenkiefer nicht ausblenden und nicht verblassen.** Beide Kiefer sind immer voll sichtbar.
- **Zähne nicht einfärben.** Farbige Markierungen der aktiven Fläche (eingefärbte Zähne wie
  auch halbtransparente Markierungsflächen darüber) sahen beide komisch aus und sind raus.
  Die aktive Stelle zeigt allein die Bürste.
- **Keine Beleuchtung.** Richtungslichter und Umgebungslicht (IBL) wurden beide probiert.
  Richtungslichter erzeugten harte Schattenkanten an Zahnfleisch und Bürste, IBL nahm dem
  Modell Kontrast und Tiefe. Die flache Darstellung ist das gewünschte Ergebnis.
- **Keine Kontur an der Bürste**, kein Leucht-/Glow-Effekt um sie herum.
- **Kein fertiges 3D-Modell aus dem Netz.** Recherchiert: die brauchbaren sind CC-BY mit
  Login-Pflicht und über 1 Mio. Dreiecken, ohne Blender nicht handybrauchbar.
- **Keine festen Uhrzeitfenster für die Tageszeiten.** Siehe Abschnitt 5 — scheitert am
  unregelmäßigen Schlafrhythmus des Nutzers.
- **Der Timer ist kein eigener Tab.** Er öffnet sich als Vollbild aus „Heute", damit das
  Modell den ganzen Bildschirm bekommt.
- **Manuell abgehaktes zählt voll**, wird aber als „von Hand" markiert und in der
  Statistik getrennt ausgewiesen. Kein Punktabzug dafür.
- **Der Ablauf bleibt im Vollbild, bis die Routine durch ist** — auch über reine
  Abhak-Schritte hinweg. Früher öffnete jeder Schritt seinen eigenen Timer und warf einen
  zwischendurch auf „Heute" zurück; das zerriss den Ablauf.
- **Konfetti nur bei Vollständigkeit.** Ein Jubel für eine halb erledigte Routine wäre
  eine Lüge und würde den Abschluss entwerten.

Gewünschtes Erscheinungsbild insgesamt: warm, ästhetisch, flache Illustration.

---

## 11. Was sonst noch drin ist

- **Ton:** kurze Sinus-Töne beim Phasenwechsel, ein hellerer bei jedem erledigten Schritt,
  eine Tonfolge am Ende der ganzen Routine. Abschaltbar über die Glocke oder die Einstellungen.
- **Vibration** beim Abhaken und an denselben Stellen wie der Ton, abschaltbar.
- **Wake Lock:** Bildschirm bleibt an, solange ein Timer läuft.
- **Zeitrechnung** läuft über `Date.now()`, nicht über Frames — der Putz-Timer bleibt
  korrekt, wenn die App kurz in den Hintergrund geht.
- **Render-Schleife läuft nur**, solange der Ablauf offen ist, und zeichnet das Modell
  nur auf der Putz-Bühne.
- **Verlassen des Ablaufs** fragt nach, solange noch Schritte offen sind.
- **Export / Import** der kompletten Daten als JSON-Datei.
- **Zurückkommen aus dem Hintergrund** lässt die Automatik neu raten, welcher Block dran ist.

---

## 12. Was noch offen ist

Ideen, über die noch nicht entschieden wurde:

1. **Erinnerungen.** Ohne Server nur über lokale Benachrichtigungen möglich, die iOS für
   Webapps stark einschränkt. Müsste erst geprüft werden.
2. **Mehrere Personen** auf einem Gerät.
3. **Zahnarzttermine** als eigener Bereich mit Intervall-Erinnerung.
4. **Bürstenwechsel** alle drei Monate erinnern.
5. **Wochenrückblick** als eigene Ansicht statt nur Zahlen.
