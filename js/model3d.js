/* =====================================================================
   model3d.js — das animierte Kiefermodell.

   Prozedural gebaut, ohne Beleuchtung: alle Flächen sind flach eingefärbt,
   die Form kommt über eine Kontur. Die Kamera steht fest, bewegt wird der
   Kiefer. Warum das so ist und was schon verworfen wurde, steht in
   CONTEXT.md, Abschnitt 5 und 7 — bitte dort nachlesen, bevor hier etwas
   Grundsätzliches geändert wird.

   Nach außen gibt es nur `createJaw(canvas)`:
       ok            – false, wenn WebGL nicht verfügbar ist
       render(now, dt, { idx, prog, running, idle })
       resize()
       setTheme(dark)
   ===================================================================== */

import * as THREE from '../three.module.min.js';
import { PHASES } from './kai.js';

export function createJaw(canvas){

/* ======================= Zahn- & Bogenmaße =======================
   Lokales Zahnsystem: x = seitlich, y < 0 = außen (bukkal),
                       y > 0 = innen (lingual), z = nach oben          */
const KIND = ['incisor','incisor','canine','premolar','premolar','molar','molar'];
const DIMS = {
  upper:{ w:[13.6,11.0,10.6,10.6,10.8,13.8,13.2], h:[7.6,7.0,10.0,11.2,11.6,13.6,13.2],
          c:[15.5,13.5,16.0,12.5,12.2,11.8,11.2] },
  lower:{ w:[ 8.6, 9.4,10.0,10.6,11.0,13.6,13.0], h:[6.6,6.8, 9.4,10.4,10.8,12.6,12.2],
          c:[12.5,13.0,15.0,12.0,11.8,11.2,10.8] }
};
const BASE  = { rx:100, ry:165 };
const SPAN  = { upper:[186,354], lower:[186,354] };
const T_GAP = 0.65, NT = 14, JAW_GAP = 44;

let seed = 20260919;
const rnd = () => { seed = (seed*1103515245 + 12345) & 0x7fffffff; return seed/0x7fffffff; };

function arcTable(rx, ry, a0deg, a1deg){
  const steps = 1200, A0 = a0deg*Math.PI/180, A1 = a1deg*Math.PI/180, t = [{th:A0, s:0}];
  let px = rx*Math.cos(A0), py = ry*Math.sin(A0), s = 0;
  for (let i=1;i<=steps;i++){
    const th = A0 + (A1-A0)*i/steps, x = rx*Math.cos(th), y = ry*Math.sin(th);
    s += Math.hypot(x-px, y-py); px = x; py = y; t.push({th, s});
  }
  return t;
}
function thetaAt(t, s){
  s = Math.max(0, Math.min(t[t.length-1].s, s));
  let lo = 0, hi = t.length-1;
  while (hi - lo > 1){ const m = (lo+hi) >> 1; if (t[m].s <= s) lo = m; else hi = m; }
  const a = t[lo], b = t[hi], k = (b.s - a.s) ? (s - a.s)/(b.s - a.s) : 0;
  return a.th + (b.th - a.th)*k;
}
const ARCH = {};
function layout(name){
  const D = DIMS[name], [a0,a1] = SPAN[name];
  const ws=[], hs=[], cs=[], kinds=[];
  for (let i=0;i<NT;i++){
    const k = Math.round(Math.abs(i-(NT-1)/2) - 0.5);
    ws.push(D.w[k]); hs.push(D.h[k]); cs.push(D.c[k]); kinds.push(KIND[k]);
  }
  const need = ws.reduce((a,b)=>a+b,0) + T_GAP*(NT-1);
  const base = arcTable(BASE.rx, BASE.ry, a0, a1);
  const f = need / base[base.length-1].s;
  const rx = BASE.rx*f, ry = BASE.ry*f;
  const A = { rx, ry, a0, a1, ws, hs, cs, kinds, hMax:Math.max(...hs) };
  A.tbl = arcTable(rx, ry, a0, a1);
  A.len = A.tbl[A.tbl.length-1].s;
  /* Zähne der Reihe nach auf der Bogenlänge verteilen */
  A.teeth = []; let s = 0;
  for (let i=0;i<NT;i++){
    const u = (s + ws[i]/2)/A.len; s += ws[i] + T_GAP;
    const q = A_point(A, u, 0);
    A.teeth.push({ u, kind:kinds[i], w:ws[i], h:hs[i], ch:cs[i],
                   x:q.x, y:q.y, nx:q.nx, ny:q.ny, rot:q.rot,
                   back:(kinds[i]==='molar'||kinds[i]==='premolar') });
  }
  ARCH[name] = A; return A;
}
function A_point(A, u, offset){
  const th = thetaAt(A.tbl, u*A.len);
  let nx = Math.cos(th)/A.rx, ny = Math.sin(th)/A.ry;
  const L = Math.hypot(nx,ny); nx/=L; ny/=L;
  return { x: A.rx*Math.cos(th) + nx*offset, y: A.ry*Math.sin(th) + ny*offset,
           nx, ny, rot: Math.atan2(nx, -ny) };
}
layout('upper'); layout('lower');

/* ======================= Zahnkontur (Aufsicht) ======================= */
function outline(kind, w, h, per=14){
  const W = w/2, H = h/2, segs = [];
  const cub = (p0,c1,c2,p1) => segs.push([p0,c1,c2,p1]);
  const quad = (p0,c,p1) => cub(p0,
      [p0[0]+2/3*(c[0]-p0[0]), p0[1]+2/3*(c[1]-p0[1])],
      [p1[0]+2/3*(c[0]-p1[0]), p1[1]+2/3*(c[1]-p1[1])], p1);
  if (kind === 'incisor'){
    cub([-W,-H*0.05],[-W*0.99,-H*0.85],[-W*0.55,-H],[0,-H]);
    cub([0,-H],[W*0.55,-H],[W*0.99,-H*0.85],[W,-H*0.05]);
    cub([W,-H*0.05],[W*0.8,H*0.95],[W*0.3,H*0.55],[0,H*0.5]);
    cub([0,H*0.5],[-W*0.3,H*0.55],[-W*0.8,H*0.95],[-W,-H*0.05]);
  } else if (kind === 'canine'){
    cub([-W,H*0.18],[-W*0.95,-H*0.3],[-W*0.5,-H*0.88],[0,-H]);
    cub([0,-H],[W*0.5,-H*0.88],[W*0.95,-H*0.3],[W,H*0.18]);
    cub([W,H*0.18],[W*0.82,H*0.92],[-W*0.82,H*0.92],[-W,H*0.18]);
  } else if (kind === 'premolar'){
    cub([0,-H],[W*0.72,-H*0.97],[W*0.99,-H*0.5],[W*0.9,H*0.02]);
    cub([W*0.9,H*0.02],[W*0.82,H*0.6],[W*0.42,H*0.97],[0,H*0.9]);
    cub([0,H*0.9],[-W*0.42,H*0.97],[-W*0.82,H*0.6],[-W*0.9,H*0.02]);
    cub([-W*0.9,H*0.02],[-W*0.99,-H*0.5],[-W*0.72,-H*0.97],[0,-H]);
  } else {
    quad([-W*0.42,-H*0.96],[0,-H*0.74],[W*0.42,-H*0.96]);
    quad([W*0.42,-H*0.96],[W*0.98,-H*0.86],[W*0.95,-H*0.3]);
    quad([W*0.95,-H*0.3],[W*0.8,0],[W*0.95,H*0.3]);
    quad([W*0.95,H*0.3],[W*0.98,H*0.86],[W*0.42,H*0.96]);
    quad([W*0.42,H*0.96],[0,H*0.74],[-W*0.42,H*0.96]);
    quad([-W*0.42,H*0.96],[-W*0.98,H*0.86],[-W*0.95,H*0.3]);
    quad([-W*0.95,H*0.3],[-W*0.8,0],[-W*0.95,-H*0.3]);
    quad([-W*0.95,-H*0.3],[-W*0.98,-H*0.86],[-W*0.42,-H*0.96]);
  }
  const pts = [];
  for (const [p0,c1,c2,p1] of segs){
    for (let i=0;i<per;i++){
      const t = i/per, m = 1-t;
      pts.push([ m*m*m*p0[0] + 3*m*m*t*c1[0] + 3*m*t*t*c2[0] + t*t*t*p1[0],
                 m*m*m*p0[1] + 3*m*m*t*c1[1] + 3*m*t*t*c2[1] + t*t*t*p1[1] ]);
    }
  }
  return pts;
}

/* Höckerrelief der Kaufläche: 0 = Fissur/Tal, 1 = Höckerspitze */
function cusp(kind, su, sv){
  if (kind === 'incisor')  return Math.max(0, 1 - 1.15*sv*sv - 0.55*Math.pow(Math.abs(su),6));
  if (kind === 'canine')   return Math.max(0, 1 - 0.9*(su*su*1.5 + sv*sv*0.9));
  if (kind === 'premolar'){
    const b = Math.exp(-Math.pow((sv+0.48)/0.46,2)), l = Math.exp(-Math.pow((sv-0.48)/0.46,2));
    return Math.max(b,l) * (1 - 0.3*su*su);
  }
  let m = 0;
  for (const [cu,cv] of [[-0.52,-0.5],[0.52,-0.5],[-0.52,0.5],[0.52,0.5]])
    m = Math.max(m, Math.exp(-(Math.pow((su-cu)/0.6,2) + Math.pow((sv-cv)/0.6,2))));
  return m;
}

/* ======================= Zahn als 3D-Körper ======================= */
const RINGS = [
  {f:-0.55,s:0.80,c:0},   {f:-0.12,s:0.93,c:0},   {f:0.10,s:1.00,c:0},
  {f: 0.45,s:0.99,c:0},   {f: 0.70,s:0.95,c:.18}, {f:0.86,s:0.88,c:.6}, {f:0.95,s:0.74,c:.93}
];
function toothGeometry(kind, w, h, ch){
  const pts = outline(kind, w, h), n = pts.length;
  const W = w/2, H = h/2;
  const topZ = (u,v) => {
    const su = Math.max(-1,Math.min(1,u/W)), sv = Math.max(-1,Math.min(1,v/H));
    return ch*(0.80 + 0.20*cusp(kind,su,sv));
  };
  const pos = [], iB = [], iL = [], iO = [];
  for (const r of RINGS)
    for (let i=0;i<n;i++){
      const u = pts[i][0]*r.s, v = pts[i][1]*r.s, zf = ch*r.f;
      pos.push(u, v, zf + (topZ(u,v) - zf)*r.c);
    }
  const R = RINGS.length;
  for (let k=0;k<R-1;k++){
    const occl = k >= R-2;
    for (let i=0;i<n;i++){
      const j = (i+1)%n;
      const a = k*n+i, b = k*n+j, c = (k+1)*n+j, d = (k+1)*n+i;
      const tgt = occl ? iO : (((pts[i][1]+pts[j][1])/2 < 0) ? iB : iL);
      tgt.push(a,b,c, a,c,d);
    }
  }
  /* Kaufläche: zwei innere Ringe + Mittelpunkt */
  const top = RINGS[R-1], capScales = [top.s*0.58, top.s*0.22];
  let prev = (R-1)*n;
  for (const sc of capScales){
    const off = pos.length/3;
    for (let i=0;i<n;i++){
      const u = pts[i][0]*sc, v = pts[i][1]*sc;
      pos.push(u, v, topZ(u,v) - ch*0.012);
    }
    for (let i=0;i<n;i++){
      const j = (i+1)%n;
      iO.push(prev+i, prev+j, off+j, prev+i, off+j, off+i);
    }
    prev = off;
  }
  const ctr = pos.length/3;
  pos.push(0, 0, topZ(0,0) - ch*0.03);
  for (let i=0;i<n;i++) iO.push(prev+i, prev+(i+1)%n, ctr);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(iB.concat(iL, iO));
  g.addGroup(0, iB.length, 0);
  g.addGroup(iB.length, iL.length, 1);
  g.addGroup(iB.length + iL.length, iO.length, 2);
  g.computeVertexNormals();
  return g;
}

/* ======================= Zahnfleisch ======================= */
function gumGeometry(A){
  const GW = A.hMax/2 + 4.2, BD = 11;
  /* Querschnitt grob setzen und dann mehrfach die Ecken abrunden (Chaikin),
     damit das Zahnfleisch keine harten Kanten bekommt */
  let prof = [
    [-GW,-BD],[-GW,-4.0],[-GW,-0.6],[-GW*0.96,1.4],[-GW*0.86,2.8],[-GW*0.66,2.7],
    [-GW*0.4,2.3],[0,2.1],[GW*0.4,2.3],[GW*0.66,2.7],[GW*0.86,2.8],[GW*0.96,1.4],
    [GW,-0.6],[GW,-4.0],[GW,-BD]
  ];
  for (let it=0; it<4; it++){
    const out = [];
    for (let i=0;i<prof.length;i++){
      const a = prof[i], b = prof[(i+1)%prof.length];
      out.push([a[0]*0.75 + b[0]*0.25, a[1]*0.75 + b[1]*0.25]);
      out.push([a[0]*0.25 + b[0]*0.75, a[1]*0.25 + b[1]*0.75]);
    }
    prof = out;
  }
  const m = prof.length, S = 150, CAP = 7, R = GW*0.95;
  const rings = [];
  const ring = (cx, cy, nx, ny, scale) => {
    const r = [];
    for (const [v,z] of prof) r.push([cx - nx*v*scale, cy - ny*v*scale, z*scale]);
    rings.push(r);
  };
  const apex = [];
  const q0 = A_point(A, 0, 0), q0b = A_point(A, 0.004, 0);
  const q1 = A_point(A, 1, 0), q1b = A_point(A, 0.996, 0);
  const t0 = [q0.x - q0b.x, q0.y - q0b.y], L0 = Math.hypot(t0[0],t0[1]);
  const t1 = [q1.x - q1b.x, q1.y - q1b.y], L1 = Math.hypot(t1[0],t1[1]);
  /* gerundete Kappe am Anfang – die Spitze ist ein einzelner Punkt,
     sonst entstehen entartete Dreiecke und dadurch fleckige Schatten */
  apex.push([q0.x + t0[0]/L0*R, q0.y + t0[1]/L0*R, 0]);
  for (let k=CAP;k>=1;k--){
    const u = k/(CAP+1), d = R*Math.sin(u*Math.PI/2), sc = Math.cos(u*Math.PI/2);
    ring(q0.x + t0[0]/L0*d, q0.y + t0[1]/L0*d, q0.nx, q0.ny, sc);
  }
  for (let i=0;i<=S;i++){
    const q = A_point(A, i/S, 0);
    ring(q.x, q.y, q.nx, q.ny, 1);
  }
  /* gerundete Kappe am Ende */
  for (let k=1;k<=CAP;k++){
    const u = k/(CAP+1), d = R*Math.sin(u*Math.PI/2), sc = Math.cos(u*Math.PI/2);
    ring(q1.x + t1[0]/L1*d, q1.y + t1[1]/L1*d, q1.nx, q1.ny, sc);
  }
  apex.push([q1.x + t1[0]/L1*R, q1.y + t1[1]/L1*R, 0]);
  const pos = [], idx = [];
  for (const r of rings) for (const pnt of r) pos.push(pnt[0], pnt[1], pnt[2]);
  for (let i=0;i<rings.length-1;i++)
    for (let j=0;j<m;j++){
      const j2 = (j+1)%m;
      const a = i*m+j, b = i*m+j2, c = (i+1)*m+j2, d = (i+1)*m+j;
      idx.push(a,b,c, a,c,d);
    }
  /* Spitzen anfügen und die Kappen dorthin schließen */
  const aStart = pos.length/3; pos.push(apex[0][0], apex[0][1], apex[0][2]);
  const aEnd   = pos.length/3; pos.push(apex[1][0], apex[1][1], apex[1][2]);
  const lastRing = (rings.length-1)*m;
  for (let j=0;j<m;j++){
    const j2 = (j+1)%m;
    idx.push(aStart, j2, j);
    idx.push(aEnd, lastRing+j, lastRing+j2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}


/* ======================= Szene ======================= */
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:true });
} catch(e){
  return { ok:false, render(){}, resize(){}, setTheme(){} };
}
if (!renderer) return { ok:false, render(){}, resize(){}, setTheme(){} };

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 3000);
camera.up.set(0,0,1);

const tilt = new THREE.Group(), spin = new THREE.Group(), shift = new THREE.Group();
scene.add(tilt); tilt.add(spin); spin.add(shift);

const PAL = {
  light:{ enamel:0xFFFCF6, gum:0xE0A091, outline:0xB68A72, brush:0xDC6A1C },
  dark: { enamel:0xF2E9DA, gum:0xA0655A, outline:0x5E4335, brush:0xFF9A45 }
};
let pal = PAL.light;

/* Keine Beleuchtung: alle Flächen sind flach eingefärbt (MeshBasicMaterial).
   Damit gibt es keine Schattenkanten und keine Glanzstellen. Die Form der
   einzelnen Zähne kommt stattdessen über eine feine Kontur (siehe outlineGeometry). */

function enamel(){ return new THREE.MeshBasicMaterial({ color: pal.enamel }); }
function outlineMat(){ return new THREE.MeshBasicMaterial({ color: pal.outline, side: THREE.BackSide }); }
/* Kontur: Kopie der Form, deren Punkte entlang ihrer Normalen nach außen gerückt
   und nur von innen gezeigt werden – ergibt einen gleichmäßig dicken Rand. */
function outlineGeometry(geo, d){
  const g = geo.clone(), p = g.attributes.position, n = g.attributes.normal;
  for (let i=0;i<p.count;i++)
    p.setXYZ(i, p.getX(i) + n.getX(i)*d, p.getY(i) + n.getY(i)*d, p.getZ(i) + n.getZ(i)*d);
  p.needsUpdate = true;
  g.clearGroups();
  return g;
}
const MAT = {};
for (const name of ['upper','lower']){
  MAT[name] = {
    enamel: enamel(),
    gum: new THREE.MeshBasicMaterial({ color: pal.gum, side: THREE.DoubleSide }),
    line: outlineMat()
  };
}

const GROUP = {};
for (const name of ['upper','lower']){
  const A = ARCH[name], g = new THREE.Group();
  const M = MAT[name];
  for (const t of A.teeth){
    const geo = toothGeometry(t.kind, t.w, t.h, t.ch);
    const mesh = new THREE.Mesh(geo, M.enamel);
    mesh.position.set(t.x, t.y, 0);
    mesh.rotation.z = t.rot + (rnd()-0.5)*0.07;
    mesh.add(new THREE.Mesh(outlineGeometry(geo, 0.28), M.line));
    g.add(mesh);
  }
  const gumGeo = gumGeometry(A);
  g.add(new THREE.Mesh(gumGeo, M.gum));
  g.add(new THREE.Mesh(outlineGeometry(gumGeo, 0.38), M.line));
  if (name === 'upper') g.rotation.y = Math.PI;
  GROUP[name] = g;
}
/* Beide Kiefer hängen an einem Scharnier hinter den Zahnreihen (wie ein Kiefergelenk) */
const HINGE = { y: 26, z: JAW_GAP*0.78 };
const PIVOT = {};
for (const name of ['upper','lower']){
  const pv = new THREE.Group();
  pv.position.set(0, HINGE.y, HINGE.z);
  GROUP[name].position.set(0, -HINGE.y, (name === 'upper' ? JAW_GAP : 0) - HINGE.z);
  pv.add(GROUP[name]); shift.add(pv); PIVOT[name] = pv;
}

/* Bürstenkopf: flach eingefärbt wie das übrige Modell, in einem kräftigen Orange,
   das sich von Zahn und Zahnfleisch abhebt. Wird beim Pausieren aus- und beim
   Weitermachen wieder eingeblendet, statt zu springen. */
const brush = new THREE.Group();
{
  const head = new THREE.Mesh(
    new THREE.CapsuleGeometry(2.5, 9.5, 6, 20),
    new THREE.MeshBasicMaterial({ color: pal.brush, transparent:true, opacity:0 })
  );
  head.rotation.z = Math.PI/2;
  brush.add(head);
}
GROUP.lower.add(brush);   /* wandert beim Phasenwechsel zum aktiven Kiefer */

/* ======================= Ansicht & Kieferbewegung =======================
   Die Kamera steht fest. Bewegt wird der Kiefer: er öffnet sich weit, wenn die
   Innen- oder Kauflächen dran sind, und schließt fast, wenn außen geputzt wird. */
const VIEW = { elev: 6, rad: 76 };          // Kamerahöhe (Grad) und Bildradius
const OPEN = { aussen: 7, kau: 44, innen: 64, fertig: 2 };   // Kieferöffnung in Grad, fertig = Lächeln
/* Neigung des Modells zum aktiven Kiefer hin – ohne sie sieht man Kau- und
   Innenflächen des Oberkiefers prinzipbedingt nicht (0 = ganz aus) */
const TIP  = { aussen: 0, kau: 16, innen: 30, fertig: -2 };
const BITE = 9;    // wie weit die Kiefer zum Lächeln zusammenrücken
/* Anteil der Öffnung, den der aktive Kiefer übernimmt. Bei den Innenflächen
   klappen beide weit auf, damit der Gegenkiefer die Sicht nicht verstellt. */
const SHARE = { aussen: 0.5, kau: 0.8, innen: 0.58, fertig: 0.5 };

function fitDistance(rad){                   // Hochformat: die Breite ist der Engpass
  const vt = Math.tan(camera.fov*Math.PI/360);
  return Math.max(rad/vt, rad/(vt*Math.max(0.35, camera.aspect))) * 1.03;
}
const CENTER = new THREE.Vector3(0, -ARCH.lower.ry*0.55, JAW_GAP/2);
shift.position.copy(CENTER).negate();
spin.rotation.z = 0;

function placeCamera(){
  const d = fitDistance(VIEW.rad), e = VIEW.elev*Math.PI/180;
  camera.position.set(0, -d*Math.cos(e), d*Math.sin(e));
  camera.lookAt(0,0,0);
}

const cur = { openU:0.14, openL:0.14, tip:0, bite:0, bx:0, by:0, bz:0, brot:0, fade:0 };
let started = false, brushHost = null;

/* Ein einziger Durchgang je Fläche: links nach rechts, ohne Zurückwandern.
   Bei den Kauflächen zuerst der linke, dann der rechte Seitenzahnbereich. */
function brushU(surface, prog){
  if (surface === 'kau')
    return (prog < 0.5) ? 0.03 + 0.26*(prog*2) : 0.71 + 0.26*((prog-0.5)*2);
  return prog;
}
/* Zahnmaße entlang des Bogens weich interpolieren – sonst springt die Bürste */
function sizeAt(A, u){
  const T = A.teeth, n = T.length;
  if (u <= T[0].u)   return { ch:T[0].ch,   h:T[0].h };
  if (u >= T[n-1].u) return { ch:T[n-1].ch, h:T[n-1].h };
  for (let i=0;i<n-1;i++)
    if (u <= T[i+1].u){
      const k = (u - T[i].u)/(T[i+1].u - T[i].u);
      return { ch: T[i].ch + (T[i+1].ch - T[i].ch)*k,
               h:  T[i].h  + (T[i+1].h  - T[i].h )*k };
    }
}
/* Zielwerte: Kieferöffnung, Neigung, Bürstenposition (im Koordinatensystem des Kiefers) */
function aim(idx, prog, idle){
  const done = idx >= PHASES.length;
  const rest = done || idle;
  const p = PHASES[Math.min(idx, PHASES.length-1)];
  const open = done ? OPEN.fertig : idle ? 20 : OPEN[p.s];
  const act = rest ? 0.5 : SHARE[p.s];
  const share = rest ? 0.5 : (p.a === 'upper' ? act : 1 - act);
  const a = {
    openU: open*share*Math.PI/180,
    openL: open*(1-share)*Math.PI/180,
    tip: (done ? TIP.fertig : idle ? 0 : (p.a === 'upper' ? -TIP[p.s] : TIP[p.s]))*Math.PI/180,
    host: rest ? null : GROUP[p.a],
    bite: done ? BITE : 0,
    smile: done
  };
  if (a.host){
    const A = ARCH[p.a];
    /* Der Oberkiefer ist gespiegelt aufgehängt – u umdrehen, damit die Bürste
       auf beiden Kiefern in dieselbe Bildrichtung wandert */
    let u = brushU(p.s, prog);
    if (p.a === 'upper') u = 1 - u;
    const sz = sizeAt(A, u);
    const off = (p.s === 'kau') ? 0 : (p.s === 'aussen' ? (sz.h/2 + 4.4) : -(sz.h/2 + 2.6));
    const b = A_point(A, u, off);
    a.bx = b.x; a.by = b.y;
    a.bz = (p.s === 'kau') ? sz.ch + 3.2 : sz.ch*0.55;
    a.brot = b.rot;
  }
  return a;
}
const lerp = (a,b,t) => a + (b-a)*t;
function lerpAngle(a,b,t){
  const d = ((b-a+Math.PI) % (2*Math.PI) + 2*Math.PI) % (2*Math.PI) - Math.PI;
  return a + d*t;
}

/* ======================= Theme ======================= */
function setTheme(dark){
  pal = dark ? PAL.dark : PAL.light;
  for (const name of ['upper','lower']){
    MAT[name].gum.color.setHex(pal.gum);
    MAT[name].enamel.color.setHex(pal.enamel);
    MAT[name].line.color.setHex(pal.outline);
  }
  brush.children[0].material.color.setHex(pal.brush);
}

/* ======================= Größe ======================= */
function resize(){
  const r = canvas.getBoundingClientRect();
  if (!r.width || !r.height) return;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / Math.max(1, r.height);
  camera.updateProjectionMatrix();
}
renderer.toneMapping = THREE.NoToneMapping;
new ResizeObserver(resize).observe(canvas);
resize();

/* ======================= Bild für Bild =======================
   Alle Zielwerte werden gedämpft angefahren, nicht gesetzt — deshalb wirkt
   die Kieferbewegung ruhig. In einem versteckten Tab drosselt der Browser
   auf ~1 Bild/s, dann dauern diese Übergänge sichtbar lange. Kein Fehler. */

function render(now, dt, st){
  const { idx, prog, running, idle } = st;
  const a = aim(idx, prog, idle);
  const k = started ? (1 - Math.pow(0.08, dt)) : 1;
  started = true;

  cur.openU = lerp(cur.openU, a.openU, k);
  cur.openL = lerp(cur.openL, a.openL, k);
  cur.tip   = lerp(cur.tip,   a.tip,   k);
  cur.bite  = lerp(cur.bite,  a.bite,  k);
  PIVOT.upper.rotation.x = -cur.openU;
  PIVOT.lower.rotation.x =  cur.openL;
  PIVOT.upper.position.z = HINGE.z - cur.bite;
  PIVOT.lower.position.z = HINGE.z + cur.bite;
  const t = now/1000;
  tilt.rotation.x = cur.tip + (a.smile ? 0.045*Math.sin(t*0.55) : 0);
  spin.rotation.z = a.smile ? 0.06*Math.sin(t*0.4) : lerp(spin.rotation.z, 0, k);

  /* Bürste hängt am aktiven Kiefer und gleitet weich */
  if (a.host && a.host !== brushHost){
    a.host.add(brush); brushHost = a.host;
    cur.bx = a.bx; cur.by = a.by; cur.bz = a.bz; cur.brot = a.brot;   /* kein Nachziehen */
    cur.fade = 0;                                                     /* am neuen Ort einblenden */
  }
  if (a.host){
    const kb = started ? (1 - Math.pow(0.02, dt)) : 1;
    cur.bx = lerp(cur.bx, a.bx, kb); cur.by = lerp(cur.by, a.by, kb);
    cur.bz = lerp(cur.bz, a.bz, kb); cur.brot = lerp(cur.brot, a.brot, kb);
    brush.position.set(cur.bx, cur.by, cur.bz);
    brush.rotation.set(0, 0, cur.brot);
  }
  cur.fade = lerp(cur.fade, (a.host && running) ? 1 : 0, 1 - Math.pow(0.004, dt));
  brush.children[0].material.opacity = cur.fade;
  brush.visible = cur.fade > 0.01;

  placeCamera();
  renderer.render(scene, camera);
}

return { ok:true, render, resize, setTheme, scene, ARCH, MAT, GROUP };
}
