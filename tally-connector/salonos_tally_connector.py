#!/usr/bin/env python3
"""
SalonOS Tally Connector (Python)
--------------------------------
Lets SalonOS (https://digitalca.co.in) talk to TallyPrime / Tally.ERP 9 through Tally's own XML
server. Browsers may not read Tally's replies directly, so this small relay runs on the same
computer as the browser, forwards SalonOS's requests to Tally and passes Tally's answers back.
It only accepts requests from the SalonOS website, only talks to the one Tally address it was
given, and stores nothing except its own settings and a short log.

Same job as SalonOS-Tally-Connector.ps1, for computers where Windows (Smart App Control) blocks
downloaded PowerShell / .bat files. Needs Python 3.8+ (python.org — tick "Add python.exe to PATH").

  Install (one time):  double-click this file, or run  python salonos_tally_connector.py
                       It asks where Tally is (Enter = this computer), copies itself to
                       %LOCALAPPDATA%\\SalonOS\\TallyConnector, starts hidden and starts with Windows.
  Remove:              python salonos_tally_connector.py --uninstall
  Run in a window:     python salonos_tally_connector.py --run --console

In Tally first: F1 Help > Settings > Connectivity > Client/Server configuration:
TallyPrime acts as = Both (or Server), Enable ODBC = Yes, Port = 9000.
"""
import argparse
import json
import os
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

VERSION = "2.0"
SITE = "https://digitalca.co.in"
ALLOW_ORIGINS = {"https://digitalca.co.in", "https://www.digitalca.co.in", "http://localhost:8765", "http://127.0.0.1:8765"}
APP_DIR = os.path.join(os.environ.get("LOCALAPPDATA") or os.path.expanduser("~"), "SalonOS", "TallyConnector")
SCRIPT = os.path.join(APP_DIR, "salonos_tally_connector.py")
CFG_FILE = os.path.join(APP_DIR, "config.json")
PID_FILE = os.path.join(APP_DIR, "connector.pid")
LOG_FILE = os.path.join(APP_DIR, "connector.log")
RUN_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"
RUN_NAME = "SalonOS Tally Connector"
DEFAULTS = {"tally_host": "127.0.0.1", "tally_port": 9000, "port": 9123, "token": ""}
CONSOLE = False


def log(msg):
    line = time.strftime("%Y-%m-%d %H:%M:%S ") + msg
    if CONSOLE:
        print(line, flush=True)
    try:
        os.makedirs(APP_DIR, exist_ok=True)
        if os.path.exists(LOG_FILE) and os.path.getsize(LOG_FILE) > 512 * 1024:
            os.replace(LOG_FILE, LOG_FILE + ".old")
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except OSError:
        pass


def load_cfg():
    cfg = dict(DEFAULTS)
    try:
        with open(CFG_FILE, encoding="utf-8") as f:
            cfg.update(json.load(f))
    except (OSError, ValueError):
        pass
    return cfg


def save_cfg(cfg):
    os.makedirs(APP_DIR, exist_ok=True)
    with open(CFG_FILE, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2)


# ── The relay ─────────────────────────────────────────────────────────────────────────────────
PING = ('<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE>'
        '<ID>SalonOSPing</ID></HEADER><BODY><DESC><TDL><TDLMESSAGE><COLLECTION NAME="SalonOSPing" ISINITIALIZE="Yes">'
        '<TYPE>Company</TYPE><FETCH>NAME</FETCH></COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>')


def make_handler(cfg):
    tally_url = "http://%s:%s" % (cfg["tally_host"], cfg["tally_port"])

    def call_tally(xml, timeout=120):
        req = urllib.request.Request(tally_url, data=xml.encode("utf-8"), method="POST",
                                     headers={"Content-Type": "text/xml; charset=utf-8"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read().decode("utf-8", errors="replace")

    class Handler(BaseHTTPRequestHandler):
        server_version = "SalonOSTallyConnector/" + VERSION

        def log_message(self, fmt, *args):  # keep the default access log quiet
            pass

        def _send(self, status, body, ctype="application/json; charset=utf-8"):
            data = body.encode("utf-8") if isinstance(body, str) else body
            origin = self.headers.get("Origin")
            self.send_response(status)
            if origin and origin in ALLOW_ORIGINS:
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, X-SalonOS-Token")
            self.send_header("Access-Control-Allow-Private-Network", "true")
            self.send_header("Access-Control-Max-Age", "600")
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def _json(self, status, obj):
            self._send(status, json.dumps(obj))

        def _allowed(self):
            origin = self.headers.get("Origin")
            if origin and origin not in ALLOW_ORIGINS:
                log("Refused a request from %s (not SalonOS)" % origin)
                self._json(403, {"ok": False, "error": "This connector only accepts requests from SalonOS."})
                return False
            if cfg.get("token") and self.headers.get("X-SalonOS-Token") != cfg["token"]:
                self._json(401, {"ok": False, "error": "Wrong or missing connector token."})
                return False
            return True

        def do_OPTIONS(self):
            self._send(204, b"")

        def do_GET(self):
            if not self._allowed():
                return
            path = self.path.split("?")[0].rstrip("/")
            if path in ("", "/status"):
                ok, err = False, ""
                try:
                    call_tally(PING, timeout=8)
                    ok = True
                except Exception as e:  # Tally closed / XML server off
                    err = str(e)
                self._json(200, {"ok": True, "connector": VERSION, "runtime": "python", "tally": tally_url,
                                 "tallyReachable": ok, "error": err, "background": not CONSOLE})
                return
            self._json(404, {"ok": False, "error": "Unknown address."})

        def do_POST(self):
            if not self._allowed():
                return
            if self.path.split("?")[0].rstrip("/") != "/tally":
                self._json(404, {"ok": False, "error": "Unknown address."})
                return
            n = int(self.headers.get("Content-Length") or 0)
            if n > 50 * 1024 * 1024:
                self._json(413, {"ok": False, "error": "Request too large."})
                return
            xml = self.rfile.read(n).decode("utf-8", errors="replace")
            if not xml.lstrip().upper().startswith("<ENVELOPE"):
                self._json(400, {"ok": False, "error": "Only Tally XML envelopes are forwarded."})
                return
            try:
                answer = call_tally(xml)
                kind = "import" if "<TALLYREQUEST>IMPORT" in xml.upper().replace(" ", "") else "export"
                log("Forwarded a Tally %s request (%.1f KB)" % (kind, len(xml) / 1024))
                self._send(200, answer, "text/xml; charset=utf-8")
            except Exception as e:
                log("Tally did not answer: %s" % e)
                self._json(502, {"ok": False, "error": "Tally is not reachable at %s - is Tally open with a company loaded "
                                 "and its XML/ODBC server on port %s enabled? (%s)" % (tally_url, cfg["tally_port"], e)})

    return Handler


class DualStackServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = False


def serve(cfg):
    handler = make_handler(cfg)
    servers = []
    try:
        servers.append(DualStackServer(("127.0.0.1", int(cfg["port"])), handler))
    except OSError as e:
        log("Port %s is already in use - is the connector already running? (%s)" % (cfg["port"], e))
        return 1
    try:  # browsers may try localhost as ::1 first
        import socket
        class V6(DualStackServer):
            address_family = socket.AF_INET6
        servers.append(V6(("::1", int(cfg["port"])), handler))
    except OSError:
        pass
    try:
        with open(PID_FILE, "w") as f:
            f.write(str(os.getpid()))
    except OSError:
        pass
    log("SalonOS Tally Connector %s (Python) listening on http://localhost:%s -> Tally at http://%s:%s"
        % (VERSION, cfg["port"], cfg["tally_host"], cfg["tally_port"]))
    for s in servers[1:]:
        threading.Thread(target=s.serve_forever, daemon=True).start()
    try:
        servers[0].serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


# ── Install / uninstall (Windows) ─────────────────────────────────────────────────────────────
NO_WINDOW = 0x08000000 if os.name == "nt" else 0
DETACHED = 0x00000008 if os.name == "nt" else 0


def pythonw():
    exe = sys.executable or "python"
    w = os.path.join(os.path.dirname(exe), "pythonw.exe")
    return w if os.path.exists(w) else exe


def stop_running():
    """Stops a running Python connector (pid file) and the older PowerShell connector."""
    try:
        with open(PID_FILE) as f:
            pid = int(f.read().strip())
        if pid != os.getpid():
            subprocess.run(["taskkill", "/PID", str(pid), "/F"], capture_output=True, creationflags=NO_WINDOW)
    except (OSError, ValueError):
        pass
    if os.name == "nt":
        ps = ("Get-CimInstance Win32_Process -Filter \"Name='powershell.exe'\" | Where-Object { $_.CommandLine -like "
              "'*SalonOS-Tally-Connector.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }")
        try:
            subprocess.run(["powershell", "-NoProfile", "-Command", ps], capture_output=True, timeout=30, creationflags=NO_WINDOW)
        except (OSError, subprocess.SubprocessError):
            pass
        startup = os.path.join(os.environ.get("APPDATA", ""), r"Microsoft\Windows\Start Menu\Programs\Startup", "SalonOS Tally Connector.lnk")
        try:
            os.remove(startup)  # the PowerShell connector's start-up entry
        except OSError:
            pass
    time.sleep(1)


def set_autostart(enable):
    if os.name != "nt":
        return
    import winreg
    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, RUN_KEY, 0, winreg.KEY_SET_VALUE) as k:
        if enable:
            winreg.SetValueEx(k, RUN_NAME, 0, winreg.REG_SZ, '"%s" "%s" --run' % (pythonw(), SCRIPT))
        else:
            try:
                winreg.DeleteValue(k, RUN_NAME)
            except OSError:
                pass


def status(port):
    try:
        with urllib.request.urlopen("http://127.0.0.1:%s/status" % port, timeout=10) as r:
            return json.loads(r.read().decode("utf-8"))
    except Exception:
        return None


def own_source():
    try:
        with open(os.path.abspath(__file__), encoding="utf-8") as f:
            return f.read()
    except (NameError, OSError):  # started with python -c "exec(...)" — fetch the current copy
        with urllib.request.urlopen(SITE + "/tally-connector/salonos_tally_connector.py", timeout=30) as r:
            return r.read().decode("utf-8")


def install(tally_host=None, interactive=True):
    print()
    print("  SalonOS Tally Connector %s (Python) - one-time install for this computer" % VERSION)
    print("  ---------------------------------------------------------------------")
    print("  After this it starts by itself whenever Windows starts. You only need to open Tally.")
    print()
    cfg = load_cfg()
    if tally_host is None and interactive:
        print("  Where is Tally?")
        print("    - On THIS computer:               just press Enter")
        print("    - On another PC / office server:  type its IP address (for example 192.168.1.20)")
        tally_host = input("  Tally computer [this one]: ").strip()
    tally_host = (tally_host or "").strip() or "127.0.0.1"
    if not all(c.isalnum() or c in ".-" for c in tally_host):
        print("  '%s' is not a computer name or IP address - run it again." % tally_host)
        return 1
    cfg["tally_host"] = tally_host
    os.makedirs(APP_DIR, exist_ok=True)
    src = own_source()
    stop_running()
    with open(SCRIPT, "w", encoding="utf-8") as f:
        f.write(src)
    save_cfg(cfg)
    set_autostart(True)
    subprocess.Popen([pythonw(), SCRIPT, "--run"], cwd=APP_DIR, close_fds=True,
                     creationflags=(DETACHED | NO_WINDOW) if os.name == "nt" else 0)
    st = None
    for _ in range(15):
        time.sleep(0.7)
        st = status(cfg["port"])
        if st:
            break
    print()
    if not st:
        print("  Installed, but the connector did not answer yet. Restart the computer, then click")
        print("  Check connection in SalonOS. (Log: %s)" % LOG_FILE)
        return 1
    print("  Installed. The SalonOS Tally Connector is running and will start with Windows.")
    if st.get("tallyReachable"):
        print('  Tally is answering. In SalonOS click "Check connection".')
    else:
        print("  Tally is not answering at %s yet - open Tally with your company;" % st.get("tally"))
        print("  SalonOS connects by itself within a few seconds.")
    return 0


def uninstall():
    stop_running()
    set_autostart(False)
    for p in (SCRIPT, CFG_FILE, PID_FILE):
        try:
            os.remove(p)
        except OSError:
            pass
    print("  The SalonOS Tally Connector is stopped and will no longer start with Windows.")
    return 0


def main():
    global CONSOLE
    ap = argparse.ArgumentParser(description="SalonOS Tally Connector")
    ap.add_argument("--run", action="store_true", help="run the connector (used at Windows start-up)")
    ap.add_argument("--console", action="store_true", help="with --run: show activity in this window")
    ap.add_argument("--install", action="store_true", help="install without questions (Tally on this PC unless --tally-host)")
    ap.add_argument("--uninstall", action="store_true")
    ap.add_argument("--tally-host")
    ap.add_argument("--tally-port", type=int)
    args = ap.parse_args()
    if args.run:
        CONSOLE = args.console
        cfg = load_cfg()
        if args.tally_host:
            cfg["tally_host"] = args.tally_host
        if args.tally_port:
            cfg["tally_port"] = args.tally_port
        return serve(cfg)
    if args.uninstall:
        code = uninstall()
    else:
        code = install(args.tally_host, interactive=not args.install)
    if not args.install and not args.uninstall and sys.stdin and sys.stdin.isatty():
        try:
            input("\n  Press Enter to close this window.")
        except EOFError:
            pass
    return code


if __name__ == "__main__":
    sys.exit(main())
