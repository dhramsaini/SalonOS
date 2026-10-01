import importlib,glob,os
from modmeta import MODULES
mods={}
for f in sorted(glob.glob('modules/m_*.py')):
    mods.update(importlib.import_module('modules.'+os.path.basename(f)[:-3]).MODS)
for k,v in mods.items():
    w=sum(len(l[1].split()) for s in v for l in s['lines'])
    print('%-20s scenes %2d words %4d est %.1f min'%(k,len(v),w,(w/ (sum(len(l[1].split()) for s in mods['daily-sales'] for l in s['lines'])/300.0)+len(v)*1.5)/60))
