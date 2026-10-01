# Renders caption strips (transparent PNG) and title cards (1280x720 PNG) for both languages.
import os, json, html
from playwright.sync_api import sync_playwright
from script import full_scenes, CHAPTERS, TOPICS
SC = full_scenes()
FONT = "'Segoe UI','Nirmala UI',Arial,sans-serif"
CSS = """*{box-sizing:border-box;margin:0;padding:0}body{font-family:%s;background:transparent}
.cap{position:absolute;left:0;top:0;width:1280px;padding:0 70px;display:flex;justify-content:center}
.box{background:rgba(12,20,40,.88);color:#fff;font-size:25px;line-height:1.42;padding:12px 26px 14px;border-radius:14px;
 box-shadow:0 6px 24px rgba(0,0,0,.35);text-align:center;max-width:1140px;border:1px solid rgba(255,255,255,.12)}
.card{width:1280px;height:720px;position:relative;overflow:hidden;color:#fff;
 background:radial-gradient(circle at 18%% 22%%,#2f5fe0 0,rgba(47,95,224,0) 42%%),radial-gradient(circle at 85%% 80%%,#0b736b 0,rgba(11,115,107,0) 40%%),linear-gradient(135deg,#0d1b3e,#132a5c 55%%,#0e2240)}
.brand{position:absolute;left:70px;top:56px;font-size:30px;font-weight:700;letter-spacing:.02em}
.brand small{display:block;font-size:13px;letter-spacing:.32em;color:#9fb4e8;font-weight:600;margin-top:4px}
.big{position:absolute;left:70px;top:190px;right:70px}
.kick{font-size:22px;color:#8fd3c9;font-weight:700;letter-spacing:.14em;text-transform:uppercase}
.title{font-size:66px;font-weight:800;line-height:1.12;margin-top:14px}
.sub{font-size:24px;color:#c8d4f2;margin-top:18px;line-height:1.45}
.list{position:absolute;left:70px;right:70px;bottom:150px;display:flex;flex-wrap:wrap;gap:12px}
.list span{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.18);border-radius:999px;padding:9px 18px;font-size:19px}
.cols{position:absolute;left:70px;right:70px;top:300px;display:grid;grid-template-columns:1fr 1fr;gap:28px}
.col{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.16);border-radius:18px;padding:22px 26px}
.col h3{font-size:24px;color:#8fd3c9;margin-bottom:12px}.col li{font-size:20px;line-height:1.55;margin-left:22px;color:#e6ecfb}
""" % FONT

T = {
 'en': dict(train='Training video', welcome='Welcome to SalonOS', wsub='Step-by-step training with a real example outlet — Glow Sector 21, September 2026',
            chapter='Chapter', outro='You are ready!', daily='Every day', month='At month end',
            dl=['Enter sales & expenses — Save Today','Mark attendance','Record every bill the day it arrives','Check Owner Insights'],
            ml=['Mark attendance & daily sales final','Generate & lock Salary Working','Generate incentives, share workings','Check P&L → Mark as Final','Move entries to Tally (preview first)']),
 'hi': dict(train='ट्रेनिंग वीडियो', welcome='SalonOS में आपका स्वागत है', wsub='एक example आउटलेट — Glow Sector 21, September 2026 — के साथ step-by-step ट्रेनिंग',
            chapter='अध्याय', outro='अब आप तैयार हैं!', daily='रोज़', month='महीने के अंत में',
            dl=['Sales और खर्चे डालें — Save Today','Attendance mark करें','हर bill उसी दिन दर्ज करें','Owner Insights देखें'],
            ml=['Attendance और daily sales final करें','Salary Working generate करके lock करें','Incentive generate करें, workings share करें','P&L check → Mark as Final','Entries Tally में भेजें (पहले preview)']),
}
E = html.escape
def card_html(s, lang):
    t = T[lang]; li = 1 if lang == 'hi' else 0
    brand = '<div class="brand">SalonOS<small>MANAGEMENT SUITE</small></div>'
    kind = s['opt']['card']
    if kind == 'intro':
        chips = ''.join('<span>%d. %s</span>' % (i, E(c[1 + li])) for i, c in enumerate(CHAPTERS[1:], 1))
        return brand + '<div class="big"><div class="kick">%s</div><div class="title">%s</div><div class="sub">%s</div></div><div class="list">%s</div>' % (E(t['train']), E(t['welcome']), E(t['wsub']), chips)
    if kind == 'chapter':
        c = [c for c in CHAPTERS if c[0] == s['ch']][0]
        chips = ''.join('<span>%s</span>' % E(x) for x in TOPICS[s['ch']][li])
        return brand + '<div class="big"><div class="kick">%s %d</div><div class="title">%s</div></div><div class="list">%s</div>' % (E(t['chapter']), s['num'], E(c[1 + li]), chips)
    if kind == 'outro':
        ul = lambda xs: '<ul>' + ''.join('<li>%s</li>' % E(x) for x in xs) + '</ul>'
        return brand + '<div class="big" style="top:150px"><div class="title" style="font-size:58px">%s</div></div><div class="cols"><div class="col"><h3>%s</h3>%s</div><div class="col"><h3>%s</h3>%s</div></div>' % (E(t['outro']), E(t['daily']), ul(t['dl']), E(t['month']), ul(t['ml']))

os.makedirs('ov', exist_ok=True)
meta = {}
with sync_playwright() as p:
    b = p.chromium.launch(channel='msedge')
    pg = b.new_page(viewport={'width': 1280, 'height': 720})
    for lang in ('en', 'hi'):
        for s in SC:
            for i, line in enumerate(s['lines']):
                txt = line[1 if lang == 'en' else 2]
                pg.set_content('<html><head><style>%s</style></head><body><div class="cap"><div class="box">%s</div></div></body></html>' % (CSS, E(txt)))
                box = pg.query_selector('.box').bounding_box()
                h = int(box['height']) + 2
                pg.screenshot(path='ov/cap_%s_%s_%d.png' % (lang, s['id'], i), clip={'x': 0, 'y': 0, 'width': 1280, 'height': h}, omit_background=True)
                meta['%s/%s_%d' % (lang, s['id'], i)] = h
            if 'card' in s['opt']:
                pg.set_content('<html><head><style>%s</style></head><body><div class="card">%s</div></body></html>' % (CSS, card_html(s, lang)))
                pg.screenshot(path='ov/card_%s_%s.png' % (lang, s['id']))
    b.close()
json.dump(meta, open('ov/meta.json', 'w'), indent=0)
print('captions', len(meta))
