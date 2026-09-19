#!/usr/bin/env python3
"""Entwicklungsserver für Zahnzeit.

Wie `python3 -m http.server`, aber mit `Cache-Control: no-store`. Der
eingebaute Server schickt nur `Last-Modified`; der Browser hält CSS und
Module dann für frisch genug und zeigt Änderungen erst nach einem harten
Neuladen — was beim Entwickeln zuverlässig Zeit kostet, weil man den alten
Stand für einen Fehler hält.

    python3 devserver.py [Port]      # Standard: 8731

Für GitHub Pages spielt die Datei keine Rolle, dort liefert GitHub aus.
"""

import http.server
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8731


class NoStore(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()

    def log_message(self, fmt, *args):
        if '304' not in fmt % args:
            super().log_message(fmt, *args)


socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(('', PORT), NoStore) as srv:
    print(f'Zahnzeit läuft auf http://localhost:{PORT}  (Cache-Control: no-store)')
    srv.serve_forever()
