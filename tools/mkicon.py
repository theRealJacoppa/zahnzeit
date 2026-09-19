"""Erzeugt die App-Icons: flacher Zahn auf warmem Grund, in den Farben der App.

Aufruf aus dem Projektverzeichnis:

    python3 tools/mkicon.py

Ohne Fremdpaket: Die Kontur wird zu einem Polygon abgetastet, vierfach
übertastet gefüllt und von Hand als PNG geschrieben. Die Farben sind die
Token --accent und --bg-1 aus css/app.css — wer die ändert, sollte sie hier
mitziehen und die Dateien neu erzeugen."""
import zlib, struct

BG   = (0xCE, 0x6F, 0x42)   # --accent (hell)
TOOTH= (0xFD, 0xF5, 0xEA)   # --bg-1

# Zahnkontur in 0..100: runde Krone, zwei Wurzeln mit Kerbe dazwischen.
SEGS = [
 (50,8, 26,8, 14,22, 14,40), (14,40, 14,52, 16,60, 19,72), (19,72, 21,82, 24,92, 30,92),
 (30,92, 36,92, 37,82, 40,70), (40,70, 42,61, 45,58, 50,58), (50,58, 55,58, 58,61, 60,70),
 (60,70, 63,82, 64,92, 70,92), (70,92, 76,92, 79,82, 81,72), (81,72, 84,60, 86,52, 86,40),
 (86,40, 86,22, 74,8, 50,8),
]

def polygon(n=40):
    pts = []
    for x0,y0,x1,y1,x2,y2,x3,y3 in SEGS:
        for i in range(n):
            t = i/n; u = 1-t
            pts.append((u*u*u*x0 + 3*u*u*t*x1 + 3*u*t*t*x2 + t*t*t*x3,
                        u*u*u*y0 + 3*u*u*t*y1 + 3*u*t*t*y2 + t*t*t*y3))
    return pts

def render(size, inset, ss=4):
    """inset = Anteil der Kantenlänge, den das Motiv einnimmt (mittig)."""
    poly = polygon()
    n = size*ss
    pad = (1-inset)/2*n
    scale = n*inset/100
    pts = [(pad + x*scale, pad + y*scale) for x,y in poly]
    cov = bytearray(n*n)                       # 1 = Zahn
    ymin = max(0, int(min(p[1] for p in pts)))
    ymax = min(n-1, int(max(p[1] for p in pts))+1)
    m = len(pts)
    for y in range(ymin, ymax+1):
        yc = y + 0.5
        xs = []
        for i in range(m):
            x1,y1 = pts[i]; x2,y2 = pts[(i+1) % m]
            if (y1 <= yc < y2) or (y2 <= yc < y1):
                xs.append(x1 + (yc-y1)*(x2-x1)/(y2-y1))
        xs.sort()
        row = y*n
        for i in range(0, len(xs)-1, 2):
            a = max(0, int(round(xs[i]))); b = min(n, int(round(xs[i+1])))
            for x in range(a, b): cov[row+x] = 1
    # Übertastung mitteln und einfärben
    raw = bytearray()
    for y in range(size):
        raw.append(0)                          # Filtertyp „None“ je Zeile
        for x in range(size):
            s = 0
            for dy in range(ss):
                r = (y*ss+dy)*n + x*ss
                s += sum(cov[r:r+ss])
            a = s/(ss*ss)
            raw += bytes(round(BG[c] + (TOOTH[c]-BG[c])*a) for c in range(3))
    return raw

def png(path, size, inset):
    raw = render(size, inset)
    def chunk(tag, data):
        c = tag + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
    out = (b'\x89PNG\r\n\x1a\n'
           + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
           + chunk(b'IDAT', zlib.compress(bytes(raw), 9))
           + chunk(b'IEND', b''))
    open(path, 'wb').write(out)
    print(f'{path}  {size}×{size}  {len(out)} Bytes')

png('icon-512.png', 512, 0.78)
png('icon-512-maskable.png', 512, 0.56)   # Motiv in der sicheren Mitte
png('icon-192.png', 192, 0.78)
png('icon-180.png', 180, 0.78)            # apple-touch-icon fürs iPhone
