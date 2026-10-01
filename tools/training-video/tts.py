import asyncio, os, json, subprocess, wave, sys
import edge_tts, imageio_ffmpeg
from script import full_scenes
SCENES=full_scenes()
FF=imageio_ffmpeg.get_ffmpeg_exe()
VOICE={'en':'en-IN-NeerjaNeural','hi':'hi-IN-SwaraNeural'}
jobs=[]
for s in SCENES:
    for i,(t,en,hi) in enumerate(s['lines']):
        for lang,txt in (('en',en),('hi',hi)):
            jobs.append((lang,s['id'],i,txt))
os.makedirs('tts/en',exist_ok=True);os.makedirs('tts/hi',exist_ok=True)
sem=asyncio.Semaphore(6)
async def one(lang,sid,i,txt):
    base=f'tts/{lang}/{sid}_{i}'
    if os.path.exists(base+'.wav') and os.path.exists(base+'.txt') and open(base+'.txt',encoding='utf-8').read()==txt: return
    async with sem:
        for attempt in range(4):
            try:
                await edge_tts.Communicate(txt,VOICE[lang],rate='-3%').save(base+'.mp3'); break
            except Exception as e:
                print('retry',base,e,flush=True); await asyncio.sleep(2)
    subprocess.run([FF,'-y','-loglevel','error','-i',base+'.mp3','-ar','48000','-ac','1',base+'.wav'],check=True)
    open(base+'.txt','w',encoding='utf-8').write(txt)
async def main():
    await asyncio.gather(*[one(*j) for j in jobs])
asyncio.run(main())
dur={}
for lang,sid,i,txt in jobs:
    w=wave.open(f'tts/{lang}/{sid}_{i}.wav'); dur[f'{lang}/{sid}_{i}']=w.getnframes()/w.getframerate(); w.close()
json.dump(dur,open('tts/dur.json','w'),indent=0)
for lang in ('en','hi'): print(lang,'total sec',round(sum(v for k,v in dur.items() if k.startswith(lang))))
