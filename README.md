# Zahnzeit

Eine Webapp, die beim Aufbau einer täglichen Zahnputzroutine hilft.

Kern ist ein Putz-Timer im **KAI-Format** (Kauflächen → Außenflächen → Innenflächen,
jeweils oben und unten) mit einem animierten 3D-Kiefermodell, an dem man sieht, welche
Fläche gerade dran ist. Drumherum: eine Tagesansicht, die durch die eigene Routine führt,
frei anlegbare Bausteine und Tageszeiten, Erinnerungen mit langem Abstand (Bürstenkopf,
Zahnarzt) und eine Statistik mit einem Routine-Wert von 0 bis 100.

Die App läuft **ohne Netz**: Ein Service Worker legt sie beim ersten Start vollständig
ab, danach startet sie auch im Funkloch.

## Daten

**Alles bleibt auf dem Gerät.** Es gibt keinen Server, kein Konto und keine Anmeldung;
gespeichert wird ausschließlich im `localStorage` des Browsers. Der Code ist öffentlich,
die Daten sind es nicht. Über die Einstellungen lässt sich alles als JSON sichern und
zurückspielen.

## Auf dem iPhone benutzen

Die Seite in Safari öffnen, Teilen-Symbol antippen, **„Zum Home-Bildschirm"**. Danach
startet sie im Vollbild wie eine App.

## Selbst starten

Kein Build-Schritt, keine Abhängigkeiten außer Three.js (liegt im Repo). Ein Doppelklick
auf `index.html` funktioniert allerdings nicht — Browser blockieren ES-Module bei
`file://`. Also über einen lokalen Server:

```bash
python3 devserver.py
```

Dann `http://localhost:8731` öffnen. (`python3 -m http.server` tut es auch, cacht beim
Entwickeln aber CSS und Module — `devserver.py` schickt deshalb `Cache-Control: no-store`.)

Die kniffligen Stellen haben eigene Tests — die Tageszuordnung, der Routine-Wert und
die Erinnerungen. Sie brauchen nichts Installiertes:

```bash
node test/all.mjs
```

## Aufbau

`CONTEXT.md` beschreibt das Projekt vollständig: Datenmodell, die Tageszuordnung,
die Formel hinter dem Routine-Wert, das prozedural gebaute Kiefermodell und die
Entscheidungen, die bewusst so getroffen wurden.

## Drittanbieter

[Three.js](https://threejs.org) r186 (MIT-Lizenz), als `three.module.min.js` und
`three.core.js` im Repo abgelegt, damit die App ohne CDN auskommt.
