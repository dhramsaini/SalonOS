import json, sys, urllib.parse, os
from playwright.sync_api import sync_playwright
# usage: batch.py scenes.json outdir [scale]
scenes=json.load(open(sys.argv[1],encoding='utf-8')); outdir=sys.argv[2]; scale=float(sys.argv[3]) if len(sys.argv)>3 else 1.5
os.makedirs(outdir,exist_ok=True)
rp=os.path.join(outdir,'rects.json')
res=json.load(open(rp)) if os.path.exists(rp) else {}
with sync_playwright() as p:
    b=p.chromium.launch(channel='msedge')
    ctx=b.new_context(viewport={'width':1280,'height':720},device_scale_factor=scale)
    for sc in scenes:
        pg=ctx.new_page()
        pg.goto('http://localhost:8765/local-test/demo.html#'+urllib.parse.quote(json.dumps(sc['opt'])))
        try:
            pg.wait_for_function("document.getElementById('out').textContent.startsWith('{')",timeout=60000)
            r=json.loads(pg.inner_text('#out'))
        except Exception as e:
            r={'err':str(e)[:200]}
        pg.screenshot(path=os.path.join(outdir,sc['id']+'.png'))
        res[sc['id']]=r
        print(sc['id'],json.dumps(r)[:300],flush=True)
        pg.close()
    b.close()
json.dump(res,open(os.path.join(outdir,'rects.json'),'w'),indent=1)
