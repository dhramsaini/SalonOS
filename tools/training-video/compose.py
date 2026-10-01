# Builds the training MP4 for one language: python compose.py en|hi [scene_id ...]
import sys, os, json, wave, subprocess, math
import numpy as np
from PIL import Image, ImageDraw
import imageio_ffmpeg
from script import full_scenes, CHAPTERS
LANG = sys.argv[1]
ONLY = set(sys.argv[2:])
FF = imageio_ffmpeg.get_ffmpeg_exe()
W, H, FPS, SR = 1280, 720, 25, 48000
SC = [s for s in full_scenes() if not ONLY or s['id'] in ONLY]
RECTS = json.load(open('cap/rects.json'))
CAPH = json.load(open('ov/meta.json'))
LEAD, GAP, TAIL, XFADE = 0.6, 0.45, 0.7, 0.35
ACC = (255, 176, 32)

def wav(path):
    w = wave.open(path); a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16); w.close(); return a

# ── timeline ──
t = 0.0; plan = []
for s in SC:
    st = t; lines = []; cur = st + (0.4 if 'card' in s['opt'] else LEAD)
    rects = RECTS.get(s['id'], {}).get('rects', []) if 'card' not in s['opt'] else []
    ri = 0
    for i, (tg, en, hi) in enumerate(s['lines']):
        a = wav('tts/%s/%s_%d.wav' % (LANG, s['id'], i))
        r = None
        if tg:
            r = rects[ri] if ri < len(rects) else None; ri += 1
        lines.append(dict(t0=cur, t1=cur + len(a) / SR, audio=a, rect=r, cap='ov/cap_%s_%s_%d.png' % (LANG, s['id'], i),
                          caph=CAPH['%s/%s_%d' % (LANG, s['id'], i)]))
        cur += len(a) / SR + GAP
    end = cur - GAP + TAIL
    plan.append(dict(s=s, t0=st, t1=end, lines=lines)); t = end
TOTAL = t
print(LANG, 'duration %.1fs' % TOTAL, flush=True)

# ── audio ──
aud = np.zeros(int((TOTAL + 1) * SR), dtype=np.int32)
for p in plan:
    for l in p['lines']:
        o = int(l['t0'] * SR); aud[o:o + len(l['audio'])] += l['audio']
aud = np.clip(aud, -32768, 32767).astype(np.int16)
os.makedirs('out', exist_ok=True)
apath = 'out/audio_%s.wav' % LANG
w = wave.open(apath, 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(aud.tobytes()); w.close()

# ── chapters ──
chap = []
for p in plan:
    if p['s']['id'] == 'intro' or p['s']['opt'].get('card') == 'chapter':
        c = [c for c in CHAPTERS if c[0] == p['s']['ch']][0]
        chap.append(dict(key=c[0], title=c[1] if LANG == 'en' else c[2], start=round(p['t0'], 2)))
json.dump(chap, open('out/chapters_%s.json' % LANG, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
meta = ';FFMETADATA1\ntitle=SalonOS training (%s)\n' % ('English' if LANG == 'en' else 'Hindi')
for i, c in enumerate(chap):
    e = chap[i + 1]['start'] if i + 1 < len(chap) else TOTAL
    meta += '[CHAPTER]\nTIMEBASE=1/1000\nSTART=%d\nEND=%d\ntitle=%s\n' % (c['start'] * 1000, e * 1000, c['title'])
open('out/meta_%s.txt' % LANG, 'w', encoding='utf-8').write(meta)

# ── drawing helpers ──
def ease(x): x = min(1, max(0, x)); return x * x * (3 - 2 * x)
def lerp(a, b, k): return a + (b - a) * k
FULL = (640.0, 360.0, 1280.0)
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
    d.polygon(pts, fill=(255, 255, 255, 255), outline=(20, 20, 20, 255))
    d.line(pts + [pts[0]], fill=(20, 20, 20, 255), width=2)
    return im
CUR = cursor_sprite()
cache_img = {}
def load(path, size=None):
    if path not in cache_img:
        im = Image.open(path).convert('RGB')
        cache_img.clear() if len(cache_img) > 6 else None
        cache_img[path] = im
    return cache_img[path]
cap_cache = {}
def capimg(path):
    if path not in cap_cache:
        if len(cap_cache) > 8: cap_cache.clear()
        cap_cache[path] = Image.open(path).convert('RGBA')
    return cap_cache[path]

# ── encoder ──
vpath = 'out/salonos_training_%s.mp4' % LANG
enc = subprocess.Popen([FF, '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '%dx%d' % (W, H), '-r', str(FPS), '-i', '-',
                        '-i', apath, '-i', 'out/meta_%s.txt' % LANG, '-map', '0:v', '-map', '1:a', '-map_metadata', '2', '-map_chapters', '2',
                        '-c:v', 'libx264', '-preset', 'medium', '-crf', '29', '-tune', 'stillimage', '-pix_fmt', 'yuv420p', '-g', '250',
                        '-c:a', 'aac', '-b:a', '96k', '-shortest', '-movflags', '+faststart', vpath], stdin=subprocess.PIPE)

prev_last = None; ptr = (1180.0, 690.0); last_key = None; last_arr = None
nframes = int(TOTAL * FPS)
pi = 0
for fi in range(nframes):
    t = fi / FPS
    while pi + 1 < len(plan) and t >= plan[pi]['t1']:
        pi += 1
    p = plan[pi]; s = p['s']; card = 'card' in s['opt']
    # camera + pointer + highlight state
    view = FULL; hl = None; ha = 0.0; rip = None; pos = None; capi = 0
    pstart = p.get('ptr0')
    if pstart is None: p['ptr0'] = pstart = ptr
    pos = pstart
    for i, l in enumerate(p['lines']):
        if t >= l['t0'] - 0.1: capi = i
    if not card:
        v = FULL; cur_pos = pstart
        for i, l in enumerate(p['lines']):
            tv = view_for(l['rect'])
            if tv is None: continue
            k = ease((t - (l['t0'] - 0.15)) / 1.0)
            if t < l['t0'] - 0.15: break
            v = tuple(lerp(a, b, k) for a, b in zip(v, tv))
            x, y, w2, h2 = l['rect']
            tgt = (x + w2 * 0.62, y + min(h2 * 0.72, 40)) if w2 * h2 < 0.30 * W * H else (x + w2 * 0.5, y + 60)
            kp = ease((t - (l['t0'] + 0.05)) / 0.8)
            cur_pos = (lerp(cur_pos[0], tgt[0], kp), lerp(cur_pos[1], tgt[1], kp))
            nxt = p['lines'][i + 1]['t0'] if i + 1 < len(p['lines']) else p['t1']
            if t < nxt - 0.05:
                hl = l['rect']; ha = ease((t - (l['t0'] + 0.65)) / 0.3) * (1 - ease((t - (nxt - 0.3)) / 0.25))
                if w2 * h2 < 0.30 * W * H:
                    rt = t - (l['t0'] + 0.85)
                    if 0 <= rt < 0.6: rip = (tgt, rt / 0.6)
            else:
                hl = None
        view = v; pos = cur_pos
    key = (s['id'], tuple(round(c, 1) for c in view), (round(pos[0]), round(pos[1])), round(ha, 2), None if not rip else round(rip[1], 2), capi, ('x%.2f' % t) if t - p['t0'] < XFADE else '')
    if key != last_key:
        if card:
            frame = load('ov/card_%s_%s.png' % (LANG, s['id'])).copy()
        else:
            src = load('cap/%s.png' % s['id']); sc = src.width / W
            cx, cy, vw = view; vh = vw * H / W
            box = ((cx - vw / 2) * sc, (cy - vh / 2) * sc, (cx + vw / 2) * sc, (cy + vh / 2) * sc)
            box = (max(0.0, box[0]), max(0.0, box[1]), min(float(src.width), box[2]), min(float(src.height), box[3]))
            frame = src.resize((W, H), Image.BILINEAR, box=box)
            z = W / vw; mx = lambda X: (X - (cx - vw / 2)) * z; my = lambda Y: (Y - (cy - vh / 2)) * z
            if hl and ha > 0.01:
                x, y, w2, h2 = hl
                x0, y0, x1, y1 = int(mx(x) - 6), int(my(y) - 6), int(mx(x + w2) + 6), int(my(y + h2) + 6)
                arr = np.asarray(frame).copy()
                dim = (arr.astype(np.float32) * (1 - 0.42 * ha)).astype(np.uint8)
                X0, Y0, X1, Y1 = max(0, x0), max(0, y0), min(W, x1), min(H, y1)
                if X1 > X0 and Y1 > Y0: dim[Y0:Y1, X0:X1] = arr[Y0:Y1, X0:X1]
                frame = Image.fromarray(dim); d = ImageDraw.Draw(frame)
                col = tuple(int(lerp(c0, c1, ha)) for c0, c1 in zip((120, 120, 120), ACC))
                d.rounded_rectangle((x0, y0, x1, y1), radius=10, outline=col, width=4)
            d = ImageDraw.Draw(frame)
            if rip:
                (rx, ry), k = rip; R = 10 + 34 * k
                d.ellipse((mx(rx) - R, my(ry) - R, mx(rx) + R, my(ry) + R), outline=ACC, width=max(1, int(5 * (1 - k))))
            frame.paste(CUR, (int(mx(pos[0])) - 4, int(my(pos[1])) - 3), CUR)
        # caption
        l = p['lines'][capi]
        if t >= l['t0'] - 0.1:
            ci = capimg(l['cap']); frame.paste(ci, (0, H - ci.height - 24), ci)
        # cross-fade from the previous scene
        if prev_last is not None and t - p['t0'] < XFADE and pi > 0:
            frame = Image.blend(prev_last, frame, ease((t - p['t0']) / XFADE))
        last_arr = np.asarray(frame).copy(); last_key = key
    out = last_arr.copy()
    bw = int(W * t / TOTAL); out[H - 4:H, :bw] = (59, 130, 246); out[H - 4:H, bw:] = (30, 41, 59)
    if TOTAL - t < 0.6: out = (out.astype(np.float32) * max(0, (TOTAL - t) / 0.6)).astype(np.uint8)
    enc.stdin.write(out.tobytes())
    # remember the last frame of this scene for the next cross-fade
    if fi + 1 < nframes and (fi + 1) / FPS >= p['t1']:
        prev_last = Image.fromarray(last_arr); ptr = pos if not card else ptr
    if fi % (FPS * 60) == 0: print(LANG, 'minute', fi // (FPS * 60), flush=True)
enc.stdin.close(); enc.wait()
print('done', vpath, os.path.getsize(vpath) // 1024, 'KB')
