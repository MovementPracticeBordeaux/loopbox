#!/usr/bin/env python3
"""Fabrique sounds/*.json à partir de la banque FluidR3_GM (Frank Wen, licence CC BY 3.0),
distribuée par https://github.com/gleitz/midi-js-soundfonts.
On garde une note sur trois (l'appli complète en décalant légèrement la hauteur)."""
import json, os, re, sys, urllib.request, concurrent.futures as cf
BASE='https://raw.githubusercontent.com/gleitz/midi-js-soundfonts/gh-pages/FluidR3_GM/'
OUT=os.path.join(os.path.dirname(__file__),'..','sounds')
NOTE={'C':0,'Db':1,'D':2,'Eb':3,'E':4,'F':5,'Gb':6,'G':7,'Ab':8,'A':9,'Bb':10,'B':11}
def midi(n): m=re.match(r'([A-G]b?)(-?\d+)$',n); return 12*(int(m.group(2))+1)+NOTE[m.group(1)]
# instrument -> plage de notes gardées
RANGES={'mel':range(36,97,3),'bass':range(24,61,3),'fx':range(48,85,12),'low':range(30,79,3)}
LIST=json.load(open(os.path.join(os.path.dirname(__file__),'sounds_list.json')))
def build(item):
    name,rng=item['f'],RANGES[item.get('r','mel')]
    dst=os.path.join(OUT,name+'.json')
    if os.path.exists(dst): return name,'déjà là'
    src=urllib.request.urlopen(BASE+name+'-mp3.js',timeout=120).read().decode()
    notes={midi(k):v.split(',',1)[1] for k,v in re.findall(r'"([A-G]b?-?\d+)":\s*"(data:audio/mp3;base64,[^"]+)"',src)}
    keep={str(m):notes[m] for m in rng if m in notes}
    json.dump({'bank':'FluidR3_GM','notes':keep},open(dst,'w'),separators=(',',':'))
    return name,'%d notes, %d ko'%(len(keep),os.path.getsize(dst)//1024)
if __name__=='__main__':
    os.makedirs(OUT,exist_ok=True)
    with cf.ThreadPoolExecutor(8) as ex:
        for n,s in ex.map(build,[x for x in LIST if x.get('f')]): print(n,s)
