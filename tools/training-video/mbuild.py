# Module videos: python mbuild.py <module_id|all> [--no-capture] [--lang en|hi]
# Scenes come from modules/m_*.py (dict MODS: id -> list of scenes, same format as script.py).
import sys, os, json, wave, subprocess, hashlib, asyncio, importlib, glob, html, urllib.parse
import numpy as np
from PIL import Image, ImageDraw
import imageio_ffmpeg, edge_tts
from modmeta import MODULES
FF = imageio_ffmpeg.get_ffmpeg_exe()
W, H, FPS, SR = 1280, 720, 25, 48000
VOICE = {'en': 'en-IN-NeerjaNeural', 'hi': 'hi-IN-SwaraNeural'}
OUTDIR = r'C:\Users\amir\Downloads\Software\Salon\SalonOS\guides\modules'
os.makedirs(OUTDIR, exist_ok=True)
for d in ('mt', 'mc', 'mcap'): os.makedirs(d, exist_ok=True)

def load_mods():
    mods = {}
    for f in sorted(glob.glob('modules/m_*.py')):
        name = os.path.basename(f)[:-3]
        m = importlib.import_module('modules.' + name)
        mods.update(m.MODS)
    return mods

def h8(*a): return hashlib.md5('|'.join(a).encode('utf-8')).hexdigest()[:16]

def scenes_for(mid, mods):
    meta = [m for m in MODULES if m['id'] == mid][0]
    out = [dict(id=mid + '__card', card=True, lines=[(None, meta['intro'][0], meta['intro'][1])])]
    for s in mods[mid]:
        opt = dict(meta['nav']); opt.update(s.get('opt', {}))
        out.append(dict(id=mid + '__' + s['id'], opt=opt, lines=s['lines']))
    return meta, out

# ── narration ──
async def _tts(jobs):
    sem = asyncio.Semaphore(6)
    async def one(lang, txt, base):
        if os.path.exists(base + '.wav'): return
        async with sem:
            for a in range(5):
                try:
                    await edge_tts.Communicate(txt, VOICE[lang], rate='-3%').save(base + '.mp3'); break
                except Exception as e:
                    print('tts retry', e, flush=True); await asyncio.sleep(3)
        subprocess.run([FF, '-y', '-loglevel', 'error', '-i', base + '.mp3', '-ar', str(SR), '-ac', '1', base + '.wav'], check=True)
    await asyncio.gather(*[one(*j) for j in jobs])
def tts_base(lang, txt): return 'mt/' + lang + '_' + h8(VOICE[lang], txt)

# ── captions + cards ──
CSS = open('overlays.py', encoding='utf-8').read().split('CSS = """', 1)[1].split('""" % FONT', 1)[0] % "'Segoe UI','Nirmala UI',Arial,sans-serif"
def cap_path(lang, txt): return 'mc/cap_' + h8(lang, txt) + '.png'
def render_overlays(items, cards):
    from playwright.sync_api import sync_playwright
    E = html.escape
    todo = [(l, t) for l, t in items if not os.path.exists(cap_path(l, t))]
    with sync_playwright() as p:
        b = p.chromium.launch(channel='msedge'); pg = b.new_page(viewport={'width': W, 'height': H})
        for lang, txt in todo:
            pg.set_content('<html><head><style>%s</style></head><body><div class="cap"><div class="box">%s</div></div></body></html>' % (CSS, E(txt)))
            hgt = int(pg.query_selector('.box').bounding_box()['height']) + 2
            pg.screenshot(path=cap_path(lang, txt), clip={'x': 0, 'y': 0, 'width': W, 'height': hgt}, omit_background=True)
        for path, body in cards:
            pg.set_content('<html><head><style>%s</style></head><body><div class="card">%s</div></body></html>' % (CSS, body))
            pg.screenshot(path=path)
        b.close()
def card_body(meta, lang):
    li = 1 if lang == 'hi' else 0; E = html.escape
    chips = ''.join('<span>%s</span>' % E(x) for x in meta['topics'][li])
    kick = 'मॉड्यूल वीडियो' if lang == 'hi' else 'Module video'
    who = meta['who'][li]
    return ('<div class="brand">SalonOS<small>MANAGEMENT SUITE</small></div><div class="big"><div class="kick">%s · %s</div>'
            '<div class="title">%s %s</div><div class="sub">%s</div></div><div class="list">%s</div>') % (E(kick), E(meta['group'][li]), meta['icon'], E(meta['title'][li]), E(who), chips)

# ── capture ──
def capture(scenes):
    from playwright.sync_api import sync_playwright
    rp = 'mcap/rects.json'
    res = json.load(open(rp)) if os.path.exists(rp) else {}
    with sync_playwright() as p:
        b = p.chromium.launch(channel='msedge')
        ctx = b.new_context(viewport={'width': W, 'height': H}, device_scale_factor=1.5)
        for s in scenes:
            if s.get('card'): continue
            o = dict(s['opt']); o['hl'] = [t for t, _, _ in s['lines'] if t]
            pg = ctx.new_page()
            pg.goto('http://localhost:8765/local-test/demo.html#' + urllib.parse.quote(json.dumps(o)))
            try:
                pg.wait_for_function("document.getElementById('out').textContent.startsWith('{')", timeout=60000)
                r = json.loads(pg.inner_text('#out'))
            except Exception as e:
                r = {'err': str(e)[:150]}
            pg.screenshot(path='mcap/%s.png' % s['id'])
            res[s['id']] = r
            bad = [i for i, x in enumerate(r.get('rects', [])) if not x]
            if bad or r.get('miss') or r.get('err'): print('  !!', s['id'], 'missing', bad, r.get('miss'), r.get('err'), flush=True)
            pg.close()
        b.close()
    json.dump(res, open(rp, 'w'), indent=0)
    return res

# ── compose ──
def wav(path):
    w = wave.open(path); a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16); w.close(); return a
def ease(x): x = min(1, max(0, x)); return x * x * (3 - 2 * x)
def lerp(a, b, k): return a + (b - a) * k
FULL = (640.0, 360.0, 1280.0); ACC = (255, 176, 32)
def view_for(r):
    if not r: return None
    x, y, w, h = r
    if w * h > 0.30 * W * H or w > 950: return FULL
    z = max(1.0, min(1.7, min(W * 0.5 / max(w, 1), H * 0.38 / max(h, 1))))
    vw, vh = W / z, H / z
    cx = x + w / 2; cy = y + h / 2 + vh * 0.10
    cx = min(max(cx, vw / 2), W - vw / 2); cy = min(max(cy, vh / 2), H - vh / 2)
    return (cx, cy, vw)
def cursor_sprite():
    im = Image.new('RGBA', (44, 52), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    pts = [(4, 3), (4, 38), (13, 30), (20, 46), (27, 43), (20, 28), (32, 28)]
    d.polygon([(x + 2, y + 2) for x, y in pts], fill=(0, 0, 0, 90))
    d.polygon(pts, fill=(255, 255, 255, 255), outline=(20, 20, 20, 255)); d.line(pts + [pts[0]], fill=(20, 20, 20, 255), width=2)
    return im
CUR = cursor_sprite()
def compose(meta, scenes, rects, lang, out):
    LEAD, GAP, TAIL, XFADE = 0.5, 0.4, 0.6, 0.35
    t = 0.0; plan = []
    for s in scenes:
        st = t; lines = []; cur = st + (0.4 if s.get('card') else LEAD)
        rr = [] if s.get('card') else rects.get(s['id'], {}).get('rects', [])
        ri = 0
        for i, (tg, en, hi) in enumerate(s['lines']):
            txt = en if lang == 'en' else hi
            a = wav(tts_base(lang, txt) + '.wav')
            r = None
            if tg:
                r = rr[ri] if ri < len(rr) else None; ri += 1
            lines.append(dict(t0=cur, t1=cur + len(a) / SR, audio=a, rect=r, cap=cap_path(lang, txt)))
            cur += len(a) / SR + GAP
        end = cur - GAP + TAIL
        plan.append(dict(s=s, t0=st, t1=end, lines=lines)); t = end
    TOTAL = t
    aud = np.zeros(int((TOTAL + 1) * SR), dtype=np.int32)
    for p in plan:
        for l in p['lines']:
            o = int(l['t0'] * SR); aud[o:o + len(l['audio'])] += l['audio']
    apath = 'mt/_audio_%s.wav' % lang
    w = wave.open(apath, 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(np.clip(aud, -32768, 32767).astype(np.int16).tobytes()); w.close()
    enc = subprocess.Popen([FF, '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '%dx%d' % (W, H), '-r', str(FPS), '-i', '-',
                            '-i', apath, '-map', '0:v', '-map', '1:a', '-metadata', 'title=SalonOS — ' + meta['title'][0 if lang == 'en' else 1],
                            '-c:v', 'libx264', '-preset', 'medium', '-crf', '31', '-tune', 'stillimage', '-pix_fmt', 'yuv420p', '-g', '250',
                            '-c:a', 'aac', '-b:a', '64k', '-shortest', '-movflags', '+faststart', out], stdin=subprocess.PIPE)
    imgs = {}
    def img(path):
        if path not in imgs:
            if len(imgs) > 6: imgs.clear()
            imgs[path] = Image.open(path).convert('RGBA' if 'mc/cap_' in path else 'RGB')
        return imgs[path]
    prev_last = None; ptr = (1180.0, 690.0); last_key = None; last_arr = None
    nframes = int(TOTAL * FPS); pi = 0
    for fi in range(nframes):
        t = fi / FPS
        while pi + 1 < len(plan) and t >= plan[pi]['t1']: pi += 1
        p = plan[pi]; s = p['s']; card = s.get('card')
        view = FULL; hl = None; ha = 0.0; rip = None; capi = 0
        if p.get('ptr0') is None: p['ptr0'] = ptr
        pos = p['ptr0']
        for i, l in enumerate(p['lines']):
            if t >= l['t0'] - 0.1: capi = i
        if not card:
            v = FULL; cur_pos = p['ptr0']
            for i, l in enumerate(p['lines']):
                tv = view_for(l['rect'])
                if tv is None: continue
                if t < l['t0'] - 0.15: break
                k = ease((t - (l['t0'] - 0.15)) / 1.0)
                v = tuple(lerp(a, b, k) for a, b in zip(v, tv))
                x, y, w2, h2 = l['rect']; small = w2 * h2 < 0.30 * W * H
                tgt = (x + w2 * 0.62, y + min(h2 * 0.72, 40)) if small else (x + w2 * 0.5, y + 60)
                kp = ease((t - (l['t0'] + 0.05)) / 0.8)
                cur_pos = (lerp(cur_pos[0], tgt[0], kp), lerp(cur_pos[1], tgt[1], kp))
                nxt = p['lines'][i + 1]['t0'] if i + 1 < len(p['lines']) else p['t1']
                if t < nxt - 0.05:
                    hl = l['rect']; ha = ease((t - (l['t0'] + 0.65)) / 0.3) * (1 - ease((t - (nxt - 0.3)) / 0.25))
                    rt = t - (l['t0'] + 0.85)
                    if small and 0 <= rt < 0.6: rip = (tgt, rt / 0.6)
                else:
                    hl = None
            view = v; pos = cur_pos
        key = (s['id'], tuple(round(c, 1) for c in view), (round(pos[0]), round(pos[1])), round(ha, 2), None if not rip else round(rip[1], 2), capi,
               ('x%.2f' % t) if t - p['t0'] < XFADE else '')
        if key != last_key:
            if card:
                frame = img('mc/card_%s_%s.png' % (lang, s['id'])).copy()
            else:
                src = img('mcap/%s.png' % s['id']); sc = src.width / W
                cx, cy, vw = view; vh = vw * H / W
                box = (max(0.0, (cx - vw / 2) * sc), max(0.0, (cy - vh / 2) * sc), min(float(src.width), (cx + vw / 2) * sc), min(float(src.height), (cy + vh / 2) * sc))
                frame = src.resize((W, H), Image.BILINEAR, box=box)
                z = W / vw; mx = lambda X: (X - (cx - vw / 2)) * z; my = lambda Y: (Y - (cy - vh / 2)) * z
                if hl and ha > 0.01:
                    x, y, w2, h2 = hl
                    x0, y0, x1, y1 = int(mx(x) - 6), int(my(y) - 6), int(mx(x + w2) + 6), int(my(y + h2) + 6)
                    arr = np.asarray(frame).copy(); dim = (arr.astype(np.float32) * (1 - 0.42 * ha)).astype(np.uint8)
                    X0, Y0, X1, Y1 = max(0, x0), max(0, y0), min(W, x1), min(H, y1)
                    if X1 > X0 and Y1 > Y0: dim[Y0:Y1, X0:X1] = arr[Y0:Y1, X0:X1]
                    frame = Image.fromarray(dim); d = ImageDraw.Draw(frame)
                    d.rounded_rectangle((x0, y0, x1, y1), radius=10, outline=tuple(int(lerp(c0, c1, ha)) for c0, c1 in zip((120, 120, 120), ACC)), width=4)
                d = ImageDraw.Draw(frame)
                if rip:
                    (rx, ry), k = rip; R = 10 + 34 * k
                    d.ellipse((mx(rx) - R, my(ry) - R, mx(rx) + R, my(ry) + R), outline=ACC, width=max(1, int(5 * (1 - k))))
                frame.paste(CUR, (int(mx(pos[0])) - 4, int(my(pos[1])) - 3), CUR)
            l = p['lines'][capi]
            if t >= l['t0'] - 0.1:
                ci = img(l['cap']); frame.paste(ci, (0, H - ci.height - 24), ci)
            if prev_last is not None and t - p['t0'] < XFADE and pi > 0:
                frame = Image.blend(prev_last, frame, ease((t - p['t0']) / XFADE))
            last_arr = np.asarray(frame).copy(); last_key = key
        o = last_arr.copy()
        bw = int(W * t / TOTAL); o[H - 4:H, :bw] = (59, 130, 246); o[H - 4:H, bw:] = (30, 41, 59)
        if TOTAL - t < 0.6: o = (o.astype(np.float32) * max(0, (TOTAL - t) / 0.6)).astype(np.uint8)
        enc.stdin.write(o.tobytes())
        if fi + 1 < nframes and (fi + 1) / FPS >= p['t1']:
            prev_last = Image.fromarray(last_arr); ptr = pos if not card else ptr
    enc.stdin.close(); enc.wait()
    return TOTAL

if __name__ == '__main__':
    args = sys.argv[1:]
    mods = load_mods()
    which = [m['id'] for m in MODULES if m['id'] in mods] if args[0] == 'all' else args[0].split(',')
    langs = ['en', 'hi']
    if '--lang' in args: langs = [args[args.index('--lang') + 1]]
    durs = json.load(open('mt/durations.json')) if os.path.exists('mt/durations.json') else {}
    for mid in which:
        meta, scenes = scenes_for(mid, mods)
        jobs = []; caps = []
        for s in scenes:
            for _, en, hi in s['lines']:
                for lang, txt in (('en', en), ('hi', hi)):
                    jobs.append((lang, txt, tts_base(lang, txt))); caps.append((lang, txt))
        asyncio.run(_tts(jobs))
        cards = [('mc/card_%s_%s.png' % (lang, mid + '__card'), card_body(meta, lang)) for lang in ('en', 'hi')]
        render_overlays(caps, cards)
        rects = capture(scenes) if '--no-capture' not in args else json.load(open('mcap/rects.json'))
        if '--capture-only' in args: print(mid, 'captured', flush=True); continue
        for lang in langs:
            out = os.path.join(OUTDIR, '%s_%s.mp4' % (mid, lang))
            T = compose(meta, scenes, rects, lang, out)
            durs['%s_%s' % (mid, lang)] = round(T)
            print(mid, lang, '%.0fs' % T, os.path.getsize(out) // 1024, 'KB', flush=True)
        json.dump(durs, open('mt/durations.json', 'w'), indent=0)
