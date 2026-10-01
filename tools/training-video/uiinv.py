# UI text of one or more components: python uiinv.py Comp1 [Comp2...]
import re, sys, glob
files = {f: open(f, encoding='utf-8').read() for f in glob.glob(r'C:\Users\amir\Downloads\Software\Salon\SalonOS\js\*.js')}
CSS = re.compile(r'\d(px|vw|vh|em|fr|%)\b|^\d|solid|dashed|Segoe|T00|^[a-z\-]+$')
for name in sys.argv[1:]:
    for f, s in files.items():
        m = re.search(r'^function ' + name + r'\b', s, re.M)
        if not m:
            continue
        n = re.search(r'^function ', s[m.end():], re.M)
        body = s[m.start():m.end() + (n.start() if n else len(s))]
        seen = []
        for x in re.findall(r"'((?:[^'\\\n]|\\.){3,})'", body):
            x = x.strip()
            if len(x) < 4 or len(x) > 220 or CSS.search(x):
                continue
            if re.search(r'[{}();=<>]|\|\||&&|^[.,+]|\+$', x):
                continue
            if not re.search(r'[A-Za-z]{3}', x):
                continue
            if x not in seen:
                seen.append(x)
        print('##', name, len(body.splitlines()), 'lines')
        print(' | '.join(seen))
