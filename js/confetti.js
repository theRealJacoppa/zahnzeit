/* =====================================================================
   confetti.js — der kleine Jubel am Ende einer vollständigen Routine.

   Bewusst klein gehalten: rechteckige Schnipsel, Schwerkraft, Drehung,
   fertig. Die Farben kommen aus denselben Tokens wie der Rest der App,
   damit es nicht wie ein Fremdkörper wirkt.

   Wer „Bewegung reduzieren" eingestellt hat, bekommt nichts davon —
   dann trägt die Abschlussmeldung allein.
   ===================================================================== */

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function palette(){
  const cs = getComputedStyle(document.documentElement);
  const v = n => cs.getPropertyValue(n).trim();
  return [v('--accent'), v('--accent-2'), v('--c2'), v('--good'), v('--warn')]
         .filter(Boolean);
}

/* Startet den Jubel auf `canvas` und gibt eine Funktion zum Abräumen zurück. */
export function confetti(canvas, { count = 110 } = {}){
  const ctx = canvas?.getContext?.('2d');
  if (!ctx || reduced()) return () => {};

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return () => {};
  canvas.width = w * dpr; canvas.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const cols = palette();
  const P = [];
  /* Weit gestreute Starthöhen statt eines einzigen Schwungs: so regnet es
     über mehrere Sekunden herunter, statt in einem Rutsch durchzufallen. */
  for (let i = 0; i < count; i++) P.push({
    x: w * (0.05 + 0.9 * Math.random()),
    y: -20 - Math.random() * h * 1.1,
    vx: (Math.random() - 0.5) * 50,
    vy: 40 + Math.random() * 90,
    s: 5 + Math.random() * 6,
    flat: 0.34 + Math.random() * 0.5,
    spin: Math.random() * Math.PI * 2,
    vspin: 2 + Math.random() * 5,
    rot: Math.random() * Math.PI,
    vrot: (Math.random() - 0.5) * 3.2,
    sway: 0.7 + Math.random() * 1.5,        // Flatterfrequenz
    phase: Math.random() * Math.PI * 2,
    col: cols[i % cols.length]
  });

  const G = 110;                            // sanfte Schwerkraft, langer Fall
  let prev = performance.now(), stopped = false, t = 0;

  function frame(now){
    if (stopped) return;
    const dt = Math.min(0.05, (now - prev) / 1000); prev = now; t += dt;
    ctx.clearRect(0, 0, w, h);
    let alive = 0;
    for (const p of P){
      p.vy += G * dt; p.vx *= 0.99;
      p.x += (p.vx + Math.sin(t * p.sway + p.phase) * 26) * dt;
      p.y += p.vy * dt;
      p.rot += p.vrot * dt; p.spin += p.vspin * dt;
      if (p.y > h + 40) continue;
      alive++;
      if (p.y < -30) continue;
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      /* Die Höhe schwankt mit der Eigendrehung – das sieht aus wie ein
         Plättchen, das sich im Fallen um die eigene Achse dreht. */
      const face = Math.max(0.12, Math.abs(Math.cos(p.spin)));
      ctx.fillStyle = p.col;
      ctx.fillRect(-p.s / 2, -p.s * p.flat * face / 2, p.s, p.s * p.flat * face);
      ctx.restore();
    }
    if (alive) requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, w, h);
  }
  requestAnimationFrame(frame);
  return () => { stopped = true; try { ctx.clearRect(0, 0, w, h); } catch(e){} };
}
