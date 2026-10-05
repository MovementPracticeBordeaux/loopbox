// LoopBox — studio de loops (Movement Practice Bordeaux)
// Tout le code de l'appli. Tests : npm test (voir tests/).
const APPVER='29';
// Toute erreur interne s'affiche à l'écran (et dans le diagnostic) pour pouvoir la signaler.
window.__lbErrors=[];
(()=>{
  const show=m=>{ window.__lbErrors.push(m); if(window.__lbErrors.length>5) window.__lbErrors.shift(); const el=document.getElementById('msg'); if(el) el.textContent='⚠ Erreur interne : '+m+' — envoie-moi ce message.'; };
  window.addEventListener('error',e=>show((e.message||'erreur')+(e.lineno?' (ligne '+e.lineno+')':'')));
  window.addEventListener('unhandledrejection',e=>{ const r=e.reason; show('promesse : '+((r&&(r.message||r.name))||String(r))); });
})();
(()=>{
const MAXFX=2, MAXTRACKS=10, B=1024, MAXMASTER=30, MAXLOOP=40;
const COLORS=['#e8472b','#f08a24','#e6b800','#7cb518','#1f9d55','#16a5a5','#2b7fe0','#6a5acd','#b04fc7','#d6457f'];
const $=(s,r=document)=>r.querySelector(s);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const mod=(a,b)=>((a%b)+b)%b;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

// ---------- état ----------
let bpm=90, metroOn=true, fin=0, snap=true, mixMode=false, mvol=0.9, ingain=2, comp=0.1;
let baseLen=0, baseBeats=4, rep=1, loopHist=null;
const H={past:[],future:[],pend:null}, HMAX=200, HISTMB=120;
let gridOff=0, liveQ='bar'; const scenes=[null,null,null,null];
const SETUPS={speaker:'Sans casque',wired:'Casque filaire',bt:'Casque Bluetooth',ext:'Micro externe'};
let setup='speaker', micId=''; const lats={speaker:null,wired:null,bt:null,ext:null}, latAt={};
let paused=false, pausePos=0, metroVol=0.6, metroSub=1, meter=4;
let normOn=true, curProf=null, hpNode=null, gEnv=0, gGain=1;
let loopLen=0, beats=4, lastLoop=null, dotsN=0, masterTake=null;
let running=false, t0=0, nextBeat=0, schedTimer=null;
let micStream=null, micSrc=null, inGainNode=null, proc=null, inAn=null;
let base=null, blockK=0, cap=null, recObj=null, captureEngine='', workletReady=false, devEng='';
const tracks=[];
const ctx=new (window.AudioContext||window.webkitAudioContext)({latencyHint:'interactive'});
const SR=ctx.sampleRate;
function profOf(id){ return SRC_LIST.find(p=>p.id===id)||SRC_LIST[0]; }

function msg(t){ $('#msg').textContent=t||''; }
const loopSec=()=>loopLen/SR;
const beatDur=()=>loopLen?loopSec()/beats:60/bpm;

// ---------- chaîne master ----------
function makeChain(c){
  const inp=c.createGain(), vol=c.createGain(), out=c.createGain(), dry=c.createGain(), wet=c.createGain();
  const hp=c.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=30;
  const ls=c.createBiquadFilter(); ls.type='lowshelf'; ls.frequency.value=110; ls.gain.value=2;
  const hs=c.createBiquadFilter(); hs.type='highshelf'; hs.frequency.value=7500; hs.gain.value=2;
  const cp=c.createDynamicsCompressor(); cp.threshold.value=-22; cp.knee.value=10; cp.ratio.value=4; cp.attack.value=0.012; cp.release.value=0.18;
  const mk=c.createGain(); mk.gain.value=1.6;
  const lim=c.createDynamicsCompressor(); lim.threshold.value=-3; lim.knee.value=0; lim.ratio.value=20; lim.attack.value=0.002; lim.release.value=0.08;
  inp.connect(vol); vol.connect(dry); dry.connect(out);
  vol.connect(hp); hp.connect(ls); ls.connect(hs); hs.connect(cp); cp.connect(mk); mk.connect(lim); lim.connect(wet); wet.connect(out);
  const PRE=[null,{th:-20,r:3,mk:1.5,sh:2},{th:-28,r:6,mk:2.2,sh:3.5}];
  const setFin=l=>{
    l=+l||0; dry.gain.value=l?0:1; wet.gain.value=l?1:0;
    const P=PRE[l]; if(P){ cp.threshold.value=P.th; cp.ratio.value=P.r; mk.gain.value=P.mk; ls.gain.value=P.sh; hs.gain.value=P.sh; }
  };
  setFin(0);
  return {inp,vol,out,setFin};
}
const chain=makeChain(ctx);
chain.vol.gain.value=mvol;
const outAn=ctx.createAnalyser(); outAn.fftSize=1024;
chain.out.connect(outAn); chain.out.connect(ctx.destination);
const metroGain=ctx.createGain(); metroGain.gain.value=0.36; metroGain.connect(ctx.destination);

// ---------- pistes ----------
function makeTrackNodes(i){
  const g=ctx.createGain(), inp=ctx.createGain(), p=ctx.createStereoPanner?ctx.createStereoPanner():null;
  const eq=makeEq(ctx,[0,0,0]); inp.connect(eq.inp); eq.out.connect(g); g.connect(p||chain.inp); if(p) p.connect(chain.inp);
  let _buf=null;
  return {id:i,kind:'rec',bass:null,tab:'',name:'Piste '+(i+1),color:COLORS[i%COLORS.length],fadeIn:0,fadeOut:0,live:true,offT:0,inp,eq,eqv:[0,0,0],srcType:'beatbox',
    get buf(){ return _buf; }, set buf(v){ if(v!==_buf){ _buf=v; this.sel=null; this.pc=null; } },
    sel:null,selMode:'mute',pc:null,pitch:0,pp:null,pjob:null,get prev(){ return null; }, set prev(v){},gain:g,pan:p,src:null,vol:0.8,panv:0,mute:false,solo:false,fxs:[{type:'none',amt:0.5}],fxn:[],el:null,cache:{}};
}
// ---------- hauteur du son (sans changer la durée) ----------
function* pitchShiftGen(x,semis,SR){
  const N=x.length;
  if(Math.abs(semis)<0.01) return x;
  const r=Math.pow(2,semis/12);
  const K=Math.min(N,8192);
  const xp=new Float32Array(N+2*K);
  xp.set(x.subarray(N-K),0); xp.set(x,K); xp.set(x.subarray(0,K),K+N);
  const L=xp.length;
  let W=Math.round(SR*0.032/2)*2; const Hs=W/2;
  const D=Math.round(SR*0.006), S=6;
  const M=Math.floor(L*r);
  const y=new Float32Array(M+W);
  const win=new Float32Array(W); for(let i=0;i<W;i++) win[i]=0.5-0.5*Math.cos(2*Math.PI*i/W);
  const idealOf=m=>Math.max(0,Math.min(L-W,Math.round((m*Hs+W/2)/r-W/2)));
  let prev=idealOf(0);
  for(let i=0;i<W;i++) y[i]=xp[prev+i]*win[i];
  const frames=Math.ceil(M/Hs);
  for(let m=1;m*Hs<M;m++){
    const nat=prev+Hs, ideal=idealOf(m);
    const maxC=L-W;
    let lo=Math.max(0,ideal-D), hi=Math.min(maxC,ideal+D);
    if(lo>hi){ lo=hi=maxC; }
    let best=lo, bs=-Infinity;
    for(let c=lo;c<=hi;c+=2){
      let num=0, den=1e-9;
      for(let i=0;i<Hs;i+=S){ const a=xp[nat+i], b=xp[c+i]; num+=a*b; den+=b*b; }
      const sc=num/Math.sqrt(den);
      if(sc>bs){ bs=sc; best=c; }
    }
    const o=m*Hs;
    for(let i=0;i<W&&o+i<y.length;i++) y[o+i]+=xp[best+i]*win[i];
    prev=best;
    if(m%150===0) yield m/frames;
  }
  const out=new Float32Array(N);
  for(let j=0;j<N;j++){
    const p=(j+K)*r, i0=Math.floor(p), f=p-i0;
    const a=y[i0-1]||0, b=y[i0]||0, c=y[i0+1]||0, d=y[i0+2]||0;
    const v=b+0.5*f*(c-a+f*(2*a-5*b+4*c-d+f*(3*(b-c)+d-a)));
    out[j]=v>1?1:(v<-1?-1:v);
  }
  return out;
}
function pitchShiftSync(x,semis,SR){ const g=pitchShiftGen(x,semis,SR); let r; while(!(r=g.next()).done){} return r.value; }

// Étirement « respectueux des attaques » : on découpe le son à chaque attaque, on recopie l'attaque intacte
// et on n'étire (méthode WSOLA, hauteur conservée) que la queue de chaque son.
function wsolaLinear(x,outLen,SR2){
  const n=x.length, out=new Float32Array(outLen);
  const W=Math.round(SR2*0.032/2)*2, Hs=W/2, D=Math.round(SR2*0.006), S=6;
  if(n<2*W||outLen<2*W){ out.set(x.subarray(0,Math.min(n,outLen))); return out; }
  const r=outLen/n, xp=new Float32Array(n+2*W); xp.set(x);
  const L=xp.length, y=new Float32Array(outLen+2*W);
  const win=new Float32Array(W); for(let i=0;i<W;i++) win[i]=0.5-0.5*Math.cos(2*Math.PI*i/W);
  const idealOf=m=>Math.max(0,Math.min(L-W,Math.round(m*Hs/r)));
  let prev=0;
  for(let i=0;i<W;i++) y[i]=xp[i]*win[i];
  for(let m=1;m*Hs<outLen;m++){
    const nat=prev+Hs, ideal=idealOf(m);
    let lo=Math.max(0,ideal-D), hi=Math.min(L-W,ideal+D); if(lo>hi){ lo=hi=L-W; }
    let best=lo, bs=-Infinity;
    for(let c=lo;c<=hi;c+=2){ let num=0,den=1e-9; for(let i=0;i<Hs;i+=S){ const p=xp[nat+i], q=xp[c+i]; num+=p*q; den+=q*q; } const sc=num/Math.sqrt(den); if(sc>bs){ bs=sc; best=c; } }
    const o=m*Hs; for(let i=0;i<W&&o+i<y.length;i++) y[o+i]+=xp[best+i]*win[i];
    prev=best;
  }
  out.set(y.subarray(0,outLen)); return out;
}
function stretchSliced(x,outLen,SR2){
  const N=x.length, k=outLen/N, out=new Float32Array(outLen);
  const pre=Math.round(0.005*SR2), atkLen=pre+Math.round(0.03*SR2), W=Math.round(SR2*0.032/2)*2, Hs=W/2, fo=Math.round(0.003*SR2);
  const on=detectOnsets(x,N).map(o=>Math.max(0,o.n-pre));
  const cuts=[0]; on.forEach(c=>{ if(c-cuts[cuts.length-1]>pre*2) cuts.push(c); });
  cuts.push(N);
  for(let i=0;i<cuts.length-1;i++){
    const u=cuts[i], v=cuts[i+1], n=v-u, U=Math.round(u*k), V=i===cuts.length-2?outLen:Math.round(v*k), m=V-U;
    if(m<=0) continue;
    const seg=new Float32Array(m);
    const atk=Math.min(n,atkLen);
    if(m<=atk||n-atk<2*W||m-atk<2*W){
      seg.set(x.subarray(u,u+Math.min(n,m)));
    } else {
      const tailIn=x.subarray(u+atk-Hs,v), tail=wsolaLinear(tailIn,m-atk+Hs,SR2);
      for(let j=0;j<atk;j++){ const w=j<atk-Hs?1:0.5+0.5*Math.cos(Math.PI*(j-(atk-Hs))/Hs); seg[j]=x[u+j]*w; }
      for(let j=0;j<tail.length&&atk-Hs+j<m;j++) seg[atk-Hs+j]+=tail[j];
    }
    if(i<cuts.length-2){ const f=Math.min(fo,m); for(let j=0;j<f;j++) seg[m-1-j]*=j/f; }
    out.set(seg,U);
  }
  for(let j=0;j<outLen;j++) out[j]=out[j]>1?1:(out[j]<-1?-1:out[j]);
  const F=Math.min(72,outLen>>1); for(let i=0;i<F;i++){ out[outLen-1-i]*=i/F; }
  return out;
}
let tempoTarget=null, tempoKey='';
function curBpm(){ return loopLen?beats*60/loopSec():bpm; }
function updTempoRow(){
  const row=$('#tempoRow'); if(!row) return;
  const show=!!(loopLen&&!recObj); row.hidden=!show; if(!show) return;
  const key=loopLen+':'+beats;
  if(tempoKey!==key||tempoTarget==null){ tempoKey=key; tempoTarget=Math.round(curBpm()); }
  $('#tnew').textContent=tempoTarget+' BPM';
  $('#tapply').disabled=Math.abs(tempoTarget-curBpm())<0.05;
}
async function changeTempo(nb){
  if(!loopLen||recObj) return;
  const cur=curBpm(), a=cur/nb;
  if(Math.abs(a-1)<0.0005) return;
  if(a<0.5||a>2){ msg('Changement trop grand : de la moitié au double du tempo actuel au maximum.'); return; }
  const newBase=Math.round(baseLen*a), newLen=newBase*rep;
  if(newLen>MAXLOOP*SR){ msg('Trop long : '+MAXLOOP+' s maximum pour la boucle.'); return; }
  const btn=$('#tapply'); btn.disabled=true; const old=btn.textContent; btn.textContent='Calcul…';
  await new Promise(r=>setTimeout(r,30));
  try{
    const oldL=loopSec(), now=ctx.currentTime, phase=running&&now>=t0?mod(now-t0,oldL):0;
    pushHist();
    tracks.forEach(t=>{
      if(!t.buf) return;
      const keep=t.sel?{...t.sel}:null;
      const data=stretchSliced(t.buf.getChannelData(0),newLen,t.buf.sampleRate);
      const b=ctx.createBuffer(1,newLen,t.buf.sampleRate); b.copyToChannel(data,0);
      t.buf=b; t.sel=keep; drawWave(t);
    });
    masterTake=null; loopLen=newLen; baseLen=newBase; gridOff=Math.round(gridOff*a);
    tempoTarget=Math.round(nb); tempoKey=loopLen+':'+beats;
    if(running) playFrom(phase*a); else tracks.forEach(startSrc);
    buildDots(); lockUI(); scheduleSave();
    msg('Tempo changé : '+cur.toFixed(1).replace('.',',')+' → '+curBpm().toFixed(1).replace('.',',')+' BPM, sans changer la note (↶ pour revenir).');
  }finally{ btn.textContent=old; updTempoRow(); }
}
function pitchFinish(data,sr){
  const F=Math.min(72,data.length>>1);
  for(let i=0;i<F;i++){ const g=i/F; data[i]*=g; data[data.length-1-i]*=g; }
  const nb=ctx.createBuffer(1,data.length,sr); nb.copyToChannel(data,0); return nb;
}
function setPitchStatus(t,txt){ const e=$('.pst',t.el); if(e) e.textContent=txt; }
function pitchedBuf(t){
  const b=t.buf; if(!b||!t.pitch) return b;
  const c=t.pp;
  if(c&&c.b===b&&c.semi===t.pitch) return c.out;
  schedulePitch(t);
  return (c&&c.b===b)?c.out:b;
}
function schedulePitch(t){
  const b=t.buf, semi=t.pitch;
  if(!b||!semi) return;
  if(t.pjob&&t.pjob.b===b&&t.pjob.semi===semi) return;
  if(t.pjob) t.pjob.cancel=true;
  const job={b,semi,cancel:false}; t.pjob=job;
  setPitchStatus(t,'Calcul…');
  const gen=pitchShiftGen(b.getChannelData(0),semi,b.sampleRate);
  const step=()=>{
    if(job.cancel) return;
    const t1=performance.now(); let r;
    try{ do{ r=gen.next(); }while(!r.done&&performance.now()-t1<12); }
    catch(e){ t.pjob=null; setPitchStatus(t,''); msg('Calcul de la hauteur impossible : '+e.message); return; }
    if(!r.done){ setTimeout(step,0); return; }
    if(t.pjob===job) t.pjob=null;
    if(job.cancel||t.buf!==b||t.pitch!==semi){ return; }
    t.pp={b,semi,out:pitchFinish(r.value,b.sampleRate)}; t.pc=null;
    setPitchStatus(t,'');
    startSrc(t);
  };
  setTimeout(step,0);
}
function ensurePitchSync(t){
  if(!t.buf||!t.pitch) return;
  if(t.pp&&t.pp.b===t.buf&&t.pp.semi===t.pitch) return;
  t.pp={b:t.buf,semi:t.pitch,out:pitchFinish(pitchShiftSync(t.buf.getChannelData(0),t.pitch,t.buf.sampleRate),t.buf.sampleRate)}; t.pc=null;
}
function setPitch(t,v){
  v=clamp(Math.round(+v||0),-12,12);
  if(v!==t.pitch) pushHist();
  t.pitch=v; t.pc=null;
  if(t.pjob){ t.pjob.cancel=true; t.pjob=null; }
  if(!v){ t.pp=null; setPitchStatus(t,''); startSrc(t); }
  else { pitchedBuf(t); }
  syncTrackUI(t); scheduleSave(true);
}
function pitchText(v){ return v===0?'0 (son d\'origine)':((v>0?'+':'')+v+(Math.abs(v)===1?' demi-ton':' demi-tons')+(Math.abs(v)===12?' (1 octave)':'')); }
// positions (en temps) des copies de la partie choisie, selon « le reste de la piste »
function repCopies(t){
  if(!t.sel||!loopLen) return [];
  const m=t.selMode||'mute', P=t.sel.e-t.sel.s;
  if(m==='mute'||P<=0||P>=beats) return [[t.sel.s,P]];
  const K=m==='loop'?Math.ceil(beats/P):Math.min(+m,Math.floor(beats/P)), out=[];
  for(let k=0;k<K;k++) out.push([t.sel.s+k*P,m==='loop'?Math.min(P,beats-k*P):P]);
  return out;
}
function playBuf(t){
  const b=pitchedBuf(t); if(!b) return b;
  if(!t.sel&&!t.fadeIn&&!t.fadeOut) return b;
  const mode=t.sel?(t.selMode||'mute'):'mute';
  const s=t.sel?t.sel.s:0, e=t.sel?t.sel.e:beats, fI=t.fadeIn||0, fO=t.fadeOut||0, c=t.pc;
  if(c&&c.b===b&&c.s===s&&c.e===e&&c.n===beats&&c.fI===fI&&c.fO===fO&&c.mode===mode) return c.out;
  const L=b.length, src=b.getChannelData(0), bl=L/beats;
  const a=s>0?Math.max(0,Math.round(s*bl)-Math.round(0.03*SR)):0, z=e<beats?Math.round(e*bl):L;
  const seg=new Float32Array(Math.max(0,z-a));
  for(let i=0;i<seg.length;i++) seg[i]=src[a+i];
  const fi=fI>0?Math.round(fI*bl):(s>0?Math.round(0.005*SR):0);
  for(let i=0;i<fi&&i<seg.length;i++) seg[i]*=i/fi;
  const fo=fO>0?Math.round(fO*bl):(e<beats?Math.round(0.01*SR):0);
  for(let i=1;i<=fo&&seg.length-i>=0;i++) seg[seg.length-i]*=(i-1)/fo;
  const out=new Float32Array(L);
  const cps=mode==='mute'?[[s,e-s]]:repCopies(t);
  cps.forEach(([cs,cl],k)=>{
    const st=Math.round(a+k*(e-s)*bl), n=k===0?seg.length:Math.min(seg.length,Math.round(L-k*(e-s)*bl));
    const tail=Math.min(Math.round(0.005*SR),n);
    for(let i=0;i<n;i++){ let v=seg[i]; if(n<seg.length&&n-i<=tail) v*=(n-i)/tail; const j=(st+i)%L; out[j]=clamp(out[j]+v,-1,1); }
  });
  const nb=ctx.createBuffer(1,L,SR); nb.copyToChannel(out,0);
  t.pc={b,s,e,n:beats,fI,fO,mode,out:nb}; return nb;
}
// ---------- égaliseur par piste ----------
const EQ_PRESETS=[['flat','Plat',[0,0,0]],['punch','Punch',[5,-2,3]],['clair','Clair',[-2,1,6]],['voix','Voix nette',[-6,4,2]],['chaud','Chaud',[4,1,-4]]];
function makeEq(c,v){
  const lo=c.createBiquadFilter(), mid=c.createBiquadFilter(), hi=c.createBiquadFilter();
  lo.type='lowshelf'; lo.frequency.value=200; lo.gain.value=v[0];
  mid.type='peaking'; mid.frequency.value=1000; mid.Q.value=0.9; mid.gain.value=v[1];
  hi.type='highshelf'; hi.frequency.value=4000; hi.gain.value=v[2];
  lo.connect(mid); mid.connect(hi);
  return {inp:lo,out:hi,lo,mid,hi};
}
function dbText(v){ return (v>0?'+':'')+v+' dB'; }
// ---------- effets par piste ----------
const SRC_LIST=[
 {id:'beatbox',name:'Beatbox / bruits de bouche',hp:40,mul:0.8,gate:0},
 {id:'voice',name:'Voix (chant, parole)',hp:90,mul:1,gate:0.012},
 {id:'perc',name:'Percussions (table, objets)',hp:35,mul:1.25,gate:0},
 {id:'env',name:'Environnement proche (clés, papier…)',hp:120,mul:2,gate:0}
];
const FX_LIST=[['none','Aucun effet'],['echo','Écho (répétitions)'],['reverb','Réverbération (salle)'],['sat','Saturation (son sale)'],['lofi','Lo-fi 8 bits'],['muffle','Étouffé (derrière un mur)'],['radio','Radio / téléphone'],['pulse','Pulsation (volume qui bat)'],['flanger','Flanger (effet jet)'],['robot','Robot'],['bass','Basses boostées']];
const irCache=new WeakMap();
function makeIR(c){
  if(irCache.has(c)) return irCache.get(c);
  const len=Math.round(c.sampleRate*1.8), b=c.createBuffer(2,len,c.sampleRate);
  for(let ch=0;ch<2;ch++){ const d=b.getChannelData(ch); for(let i=0;i<len;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/len,2.6); }
  irCache.set(c,b); return b;
}
function makeFx(c,type,amt,beat){
  const inp=c.createGain(), out=c.createGain(), dry=c.createGain(), wet=c.createGain();
  const all=[inp,out,dry,wet], oscs=[];
  const nd=n=>{ all.push(n); return n; };
  const osc=(freq,typ)=>{ const o=c.createOscillator(); o.type=typ||'sine'; o.frequency.value=freq; oscs.push(o); all.push(o); o.start(); return o; };
  let upd=()=>{ dry.gain.value=1; wet.gain.value=0; };
  inp.connect(dry); dry.connect(out); wet.connect(out);
  if(type==='echo'){
    const dl=nd(c.createDelay(2)), fb=nd(c.createGain()), lp=nd(c.createBiquadFilter());
    lp.type='lowpass'; lp.frequency.value=3500;
    inp.connect(dl); dl.connect(lp); lp.connect(wet); lp.connect(fb); fb.connect(dl);
    upd=(a,b)=>{ dl.delayTime.value=clamp(b*0.75,0.06,1.9); fb.gain.value=0.25+a*0.4; dry.gain.value=1; wet.gain.value=a; };
  } else if(type==='reverb'){
    const cv=nd(c.createConvolver()); cv.buffer=makeIR(c);
    inp.connect(cv); cv.connect(wet);
    upd=a=>{ dry.gain.value=1-0.3*a; wet.gain.value=a*1.4; };
  } else if(type==='sat'){
    const ws=nd(c.createWaveShaper()); ws.oversample='2x'; inp.connect(ws); ws.connect(wet);
    let lastK=-1;
    upd=a=>{ const k=1+a*80; if(Math.abs(k-lastK)>0.5){ lastK=k; const n=2048, cu=new Float32Array(n); for(let i=0;i<n;i++){ const x=i*2/(n-1)-1; cu[i]=(1+k)*x/(1+k*Math.abs(x)); } ws.curve=cu; } dry.gain.value=0; wet.gain.value=0.8; };
  } else if(type==='lofi'){
    const ws=nd(c.createWaveShaper()), lp=nd(c.createBiquadFilter()); lp.type='lowpass'; lp.frequency.value=5000;
    inp.connect(ws); ws.connect(lp); lp.connect(wet);
    let lastS=-1;
    upd=a=>{ const st=Math.max(12,Math.round(64-a*52)); if(st!==lastS){ lastS=st; const n=2048, cu=new Float32Array(n); for(let i=0;i<n;i++){ const x=i*2/(n-1)-1; cu[i]=Math.round(x*st)/st; } ws.curve=cu; } dry.gain.value=0; wet.gain.value=1; };
  } else if(type==='muffle'){
    const lp=nd(c.createBiquadFilter()); lp.type='lowpass'; lp.Q.value=0.7;
    inp.connect(lp); lp.connect(wet);
    upd=a=>{ lp.frequency.value=12000*Math.pow(300/12000,a); dry.gain.value=0; wet.gain.value=1; };
  } else if(type==='radio'){
    const hp=nd(c.createBiquadFilter()), lp=nd(c.createBiquadFilter()); hp.type='highpass'; lp.type='lowpass';
    inp.connect(hp); hp.connect(lp); lp.connect(wet);
    upd=a=>{ hp.frequency.value=300+a*700; lp.frequency.value=4200-a*1800; dry.gain.value=0; wet.gain.value=1.05; };
  } else if(type==='pulse'){
    const g=nd(c.createGain()), lg=nd(c.createGain()), lfo=osc(2,'sine');
    lfo.connect(lg); lg.connect(g.gain); inp.connect(g); g.connect(wet);
    upd=(a,b)=>{ const d=a*0.5; g.gain.value=1-d; lg.gain.value=d; lfo.frequency.value=clamp(2/b,0.5,12); dry.gain.value=0; wet.gain.value=1; };
  } else if(type==='flanger'){
    const dl=nd(c.createDelay(0.05)), lg=nd(c.createGain()), fb=nd(c.createGain()), lfo=osc(0.3,'sine');
    dl.delayTime.value=0.004; lfo.connect(lg); lg.connect(dl.delayTime);
    inp.connect(dl); dl.connect(wet); dl.connect(fb); fb.connect(dl);
    upd=a=>{ lg.gain.value=0.001+a*0.003; fb.gain.value=0.3+a*0.4; dry.gain.value=0.7; wet.gain.value=0.5; };
  } else if(type==='robot'){
    const g=nd(c.createGain()), lfo=osc(80,'sine'); g.gain.value=0; lfo.connect(g.gain);
    inp.connect(g); g.connect(wet);
    upd=a=>{ dry.gain.value=1-a; wet.gain.value=a*1.5; };
  } else if(type==='bass'){
    const ls=nd(c.createBiquadFilter()); ls.type='lowshelf'; ls.frequency.value=140;
    inp.connect(ls); ls.connect(wet);
    upd=a=>{ ls.gain.value=a*9; dry.gain.value=0; wet.gain.value=0.8; };
  }
  upd(amt,beat);
  return {inp,out,set:(a,b)=>upd(a,b),dispose(){ oscs.forEach(o=>{ try{o.stop();}catch(e){} }); all.forEach(n=>{ try{n.disconnect();}catch(e){} }); }};
}
function setFx(t){
  try{ t.eq.out.disconnect(); }catch(e){}
  (t.fxn||[]).forEach(f=>f.dispose()); t.fxn=[];
  let prev=t.eq.out;
  t.fxs.forEach(sl=>{
    if(sl.type==='none') return;
    const f=makeFx(ctx,sl.type,sl.amt,beatDur()); f.slot=sl;
    prev.connect(f.inp); prev=f.out; t.fxn.push(f);
  });
  prev.connect(t.gain);
}
function fxNames(t){ const l=t.fxs.filter(sl=>sl.type!=='none').map(sl=>((FX_LIST.find(f=>f[0]===sl.type)||[0,''])[1]).split(' (')[0]); if(t.pitch) l.unshift('Ton '+(t.pitch>0?'+':'')+t.pitch); return l.join(' + '); }
function setLive(t,on){
  if(on&&!t.live){ try{ t.inp.connect(t.eq.inp); t.live=true; }catch(e){} }
  else if(!on&&t.live){ try{ t.inp.disconnect(t.eq.inp); t.live=false; }catch(e){} }
}
function applyGains(only){
  const anySolo=tracks.some(t=>t.solo), now=ctx.currentTime;
  tracks.forEach(t=>{
    if(only&&t!==only) return;
    const aud=!t.mute&&(!anySolo||t.solo);
    const target=(aud&&t.vol>=0.004)?t.vol:0;
    clearTimeout(t.offT); t.offT=0;
    if(target>0){ setLive(t,true); t.gain.gain.setTargetAtTime(target,now,0.01); }
    else{
      t.gain.gain.setTargetAtTime(0,now,0.01);
      // piste inaudible : on la déconnecte après le fondu pour ne plus faire travailler ses effets
      t.offT=setTimeout(()=>{ t.offT=0; setLive(t,false); },250);
    }
    if(t.pan) t.pan.pan.value=t.panv;
  });
}
function stopSrc(t){ if(t.src){ try{t.src.stop();}catch(e){} try{t.src.disconnect();}catch(e){} t.src=null; } }
function startSrc(t){
  stopSrc(t);
  if(!t.buf||!running) return;
  if(recObj&&recObj.i===t.id) return;
  const L=t.buf.duration;
  const when=Math.max(ctx.currentTime+0.02,t0);
  const off=when>t0?mod(when-t0,L):0;
  const s=ctx.createBufferSource(); s.buffer=playBuf(t); s.loop=true; s.connect(t.inp);
  try{ s.start(when,off); t.src=s; }catch(e){ msg('Lecture impossible : '+e.message); }
}

// ---------- métronome / transport ----------
function click(time,accent,sub){
  const o=ctx.createOscillator(), g=ctx.createGain();
  o.frequency.value=accent?1500:(sub?800:1000); o.type='square';
  g.gain.setValueAtTime(0.0001,time); g.gain.exponentialRampToValueAtTime(sub?0.4:1,time+0.002); g.gain.exponentialRampToValueAtTime(0.0001,time+0.04);
  o.connect(g); g.connect(metroGain); o.start(time); o.stop(time+0.06);
}
function sched(){
  const bd=beatDur();
  while(t0+nextBeat*bd<ctx.currentTime+0.15){
    const tt=t0+nextBeat*bd;
    if(metroOn){
      if(tt>=ctx.currentTime-0.01) click(tt,mod(nextBeat,meter)===0);
      for(let j=1;j<metroSub;j++){ const ts=tt+j*bd/metroSub; if(ts>=ctx.currentTime-0.01) click(ts,false,true); }
    }
    nextBeat++;
  }
}
function setPlayIcon(){
  $('#play').textContent=running?'❚❚':'▶\uFE0E';
  $('#dplay').classList.toggle('on',running);
  $('#dpause').classList.toggle('on',paused);
}
function startTransport(countIn){
  if(running) return;
  const bd=beatDur(), now=ctx.currentTime+0.12;
  t0=countIn?now+meter*bd:now;
  nextBeat=countIn?-meter:0;
  running=true;
  tracks.forEach(startSrc);
  schedTimer=setInterval(sched,25); sched();
  paused=false;
  setPlayIcon();
}
function settlePending(){
  tracks.forEach(t=>{ if(t.pendT){ clearTimeout(t.pendT); t.pendT=0; if(t.pend!=null){ t.mute=t.pend; } t.pend=null; } });
}
function stopTransport(){
  settlePending();
  stopPreview(false);
  if(recObj) cancelRec();
  clearInterval(schedTimer); schedTimer=null;
  tracks.forEach(stopSrc);
  running=false; paused=false;
  setPlayIcon();
}

// ---------- micro ----------
async function openStream(){
  const base={echoCancellation:false,noiseSuppression:false,autoGainControl:false};
  if(micId){
    try{ return await navigator.mediaDevices.getUserMedia({audio:{...base,deviceId:{exact:micId}}}); }
    catch(e){ micId=''; msg("Le micro choisi n'est plus disponible : retour au micro par défaut."); }
  }
  return await navigator.mediaDevices.getUserMedia({audio:base});
}
async function ensureMic(){
  try{ await ctx.resume(); }catch(e){}
  if(micStream) return true;
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){ msg("Micro indisponible dans cette vue."); return false; }
  try{ micStream=await openStream(); }
  catch(e){ micStream=null; msg("Micro refusé ou bloqué ("+(e.name||'erreur')+"). Autorise-le dans les réglages du navigateur."); return false; }
  micSrc=ctx.createMediaStreamSource(micStream);
  let engNotice=false;
  if(!inGainNode){
    inGainNode=ctx.createGain(); inGainNode.gain.value=ingain;
    hpNode=ctx.createBiquadFilter(); hpNode.type='highpass'; hpNode.Q.value=0.707;
    inGainNode.connect(hpNode);
    inAn=ctx.createAnalyser(); inAn.fftSize=1024; hpNode.connect(inAn);
    applyProfile(curProf||profOf('beatbox'));
    await setupCapture(hpNode);
    engNotice=captureEngine==='AudioWorklet'&&devEng!=='w';
    if(engNotice){ devEng='w'; scheduleSave(true); }
  }
  micSrc.connect(inGainNode);
  try{ navigator.audioSession.type='play-and-record'; }catch(e){}
  if(engNotice) msg("Moteur d'enregistrement amélioré : refais la calibration dans Réglages micro et latence pour un calage précis.");
  listMics();
  return true;
}
async function reopenMic(){
  if(recObj){ msg("Termine l'enregistrement avant de changer de micro."); return; }
  if(micStream){ try{ (micStream.getTracks?micStream.getTracks():[]).forEach(tr=>tr.stop()); }catch(e){} try{ micSrc.disconnect(); }catch(e){} micStream=null; micSrc=null; }
  if(await ensureMic()) msg('Micro activé : '+($('#micsel').selectedOptions[0]||{}).textContent+'.');
}
async function listMics(){
  const sel=$('#micsel'); if(!sel||!navigator.mediaDevices||!navigator.mediaDevices.enumerateDevices) return;
  try{
    const devs=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='audioinput'&&d.deviceId&&d.deviceId!=='default'&&d.deviceId!=='communications');
    sel.innerHTML='<option value="">Micro par défaut</option>'+devs.map((d,k)=>`<option value="${d.deviceId.replace(/"/g,'')}"></option>`).join('');
    devs.forEach((d,k)=>{ sel.options[k+1].textContent=d.label||('Micro '+(k+1)); });
    sel.value=devs.some(d=>d.deviceId===micId)?micId:'';
  }catch(e){}
}
// Le processeur reçoit le son du micro par blocs de 128 échantillons, chacun avec son numéro exact
// dans la ligne de temps du moteur audio (currentFrame) : plus besoin d'estimer le temps.
const WORKLET_SRC=`class LbCap extends AudioWorkletProcessor{
  constructor(){ super(); this.buf=new Float32Array(2048); this.n=0; this.start=0; }
  flush(){ if(!this.n) return; const d=this.n===this.buf.length?this.buf:this.buf.slice(0,this.n); this.port.postMessage({s:this.start,d},[d.buffer]); this.buf=new Float32Array(2048); this.n=0; }
  process(inputs){
    const ch=inputs[0]&&inputs[0][0];
    if(!ch) return true;
    if(this.n>0&&currentFrame!==this.start+this.n) this.flush();
    if(this.n===0) this.start=currentFrame;
    this.buf.set(ch,this.n); this.n+=ch.length;
    if(this.n>=this.buf.length) this.flush();
    return true;
  }
}
registerProcessor('lb-cap',LbCap);`;
async function setupCapture(srcNode){
  const sink=ctx.createGain(); sink.gain.value=0; sink.connect(ctx.destination);
  if(ctx.audioWorklet&&typeof AudioWorkletNode!=='undefined'){
    try{
      if(!workletReady){ const url=URL.createObjectURL(new Blob([WORKLET_SRC],{type:'application/javascript'})); await ctx.audioWorklet.addModule(url); workletReady=true; }
      const node=new AudioWorkletNode(ctx,'lb-cap',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1],channelCount:1,channelCountMode:'explicit'});
      node.port.onmessage=e=>onCapBlock(e.data.s,e.data.d);
      srcNode.connect(node); node.connect(sink);
      base=0; captureEngine='AudioWorklet'; return;
    }catch(e){ /* repli sur l'ancien moteur */ }
  }
  proc=ctx.createScriptProcessor(B,1,1);
  srcNode.connect(proc); proc.connect(sink);
  blockK=0; base=null;
  proc.onaudioprocess=e=>{
    const k=blockK++, cand=ctx.currentTime-(k+1)*B/SR;
    if(base===null||cand<base) base=cand;
    if(cap) onCapBlock(k*B,new Float32Array(e.inputBuffer.getChannelData(0)));
  };
  captureEngine='ScriptProcessor (ancien)';
}
function onCapBlock(st,d){
  if(!cap) return;
  if(curProf&&curProf.gate) gateBlock(d);
  cap.blocks.push({s:st,d}); if(cap.check) cap.check(st+d.length);
}
function applyProfile(p){
  curProf=p; gEnv=0; gGain=1;
  if(hpNode) hpNode.frequency.value=p.hp;
  if(inGainNode) inGainNode.gain.value=ingain*p.mul;
}
function gateBlock(x){
  const thr=curProf.gate, rel=Math.exp(-1/(SR*0.1));
  for(let i=0;i<x.length;i++){
    const v=Math.abs(x[i]);
    gEnv=v>gEnv?v:gEnv*rel;
    const target=gEnv>thr?1:0.12;
    gGain=target>gGain?1:gGain+(target-gGain)*0.002;
    x[i]*=gGain;
  }
}
function autoLevel(d){
  if(!normOn) return;
  let pk=0; for(let i=0;i<d.length;i++){ const v=Math.abs(d[i]); if(v>pk) pk=v; }
  if(pk<0.03||pk>=0.7) return;
  const f=Math.min(8,0.7/pk); for(let i=0;i<d.length;i++) d[i]*=f;
}
function gather(blocks,s,e){
  const out=new Float32Array(e-s);
  for(const b of blocks){
    const bs=b.s, be=bs+b.d.length;
    if(be<=s||bs>=e) continue;
    const from=Math.max(bs,s), to=Math.min(be,e);
    for(let i=from;i<to;i++) out[i-s]=b.d[i-bs];
  }
  return out;
}

// ---------- enregistrement ----------
async function toggleRec(i){
  if(recObj){
    if(recObj.i===i && ctx.currentTime<recObj.tp) cancelRec(); else stopRec();
    return;
  }
  if(!(await ensureMic())) return;
  if(recObj) return;
  applyProfile(profOf(tracks[i].srcType));
  if(!loopLen){
    if(running) stopTransport();
    startTransport(metroOn);
    recObj={i,master:true,tp:t0,stopT:null,len:0};
  } else {
    let tp;
    if(!running){ startTransport(metroOn); tp=t0; } else tp=ctx.currentTime+0.04;
    recObj={i,master:false,tp,stopT:null,len:0};
  }
  cap={blocks:[],check:capCheck};
  lockUI();
}
function capCheck(endIdx){
  const r=recObj; if(!r) return;
  const now=ctx.currentTime;
  if(r.stopT===null){
    if(r.master){ if(now>=r.tp+MAXMASTER) stopRec(r.tp+MAXMASTER); }
    else if(now>=r.tp+loopSec()) stopRec(r.tp+loopSec());
    if(r.stopT===null) return;
  }
  const s=Math.round((r.tp+comp-base)*SR), e=s+r.len;
  if(endIdx>=e) finishRec(s,e);
}
function stopRec(atTime){
  const r=recObj; if(!r||r.stopT!==null) return;
  const now=ctx.currentTime;
  if(atTime===undefined&&now<r.tp){ cancelRec(); return; }
  const st=atTime===undefined?now:atTime;
  const D=Math.round((st-r.tp)*SR);
  if(D<SR*(r.master?0.25:0.08)){ cancelRec(); msg('Prise trop courte, rien enregistré.'); return; }
  r.stopT=st;
  if(r.master){
    const bd0=60/bpm;
    r.D=D;
    r.n=Math.max(1,Math.round(D/SR/bd0));
    r.len=snap?D+Math.round(0.8*bd0*SR):D;
  } else r.len=Math.min(D,loopLen);
}
function cancelRec(){
  if(!recObj) return;
  cap=null; recObj=null;
  lockUI();
}
function detectOnsets(x,len){
  const hop=256, nF=Math.floor(len/hop);
  if(nF<4) return [];
  const e=new Float32Array(nF);
  for(let j=0;j<nF;j++){ let sum=0; const a=j*hop; for(let i=0;i<hop;i++){ const v=x[a+i]; sum+=v*v; } e[j]=Math.log(1+2000*Math.sqrt(sum/hop)); }
  const fl=new Float32Array(nF); let mx=0;
  for(let j=1;j<nF;j++){ fl[j]=Math.max(0,e[j]-Math.max(e[j-1],j>1?e[j-2]:0)); if(fl[j]>mx) mx=fl[j]; }
  if(mx<0.3) return [];
  const thr=0.25*mx, minGap=Math.round(0.07*SR/hop), on=[];
  let last=-1e9;
  for(let j=1;j<nF-1;j++){
    if(fl[j]>=thr&&fl[j]>=fl[j-1]&&fl[j]>=fl[j+1]&&j-last>=minGap){
      const a=Math.max(0,(j-2)*hop), b=Math.min(len,(j+2)*hop);
      let pk=0; for(let i=a;i<b;i++){ const v=Math.abs(x[i]); if(v>pk) pk=v; }
      let idx=a; for(let i=a;i<b;i++){ if(Math.abs(x[i])>0.25*pk){ idx=i; break; } }
      on.push({n:idx,w:fl[j]}); last=j;
    }
  }
  return on;
}
function analyzeBeat(raw,D,prior){
  prior=prior||bpm;
  const on=detectOnsets(raw,D);
  if(on.length<3) return null;
  const o1=on[0].n, rel=on.map(o=>(o.n-o1)/SR), w=on.map(o=>o.w), sw=w.reduce((a,b)=>a+b,0);
  const g0=60/prior/4;
  const coh=g=>{ let re=0,im=0; for(let i=0;i<rel.length;i++){ const ph=2*Math.PI*rel[i]/g; re+=w[i]*Math.cos(ph); im+=w[i]*Math.sin(ph); } return Math.hypot(re,im)/sw; };
  let best=-1,bg=g0;
  for(let g=g0*0.85;g<=g0*1.18;g+=0.00002){
    const sc=coh(g)*Math.exp(-0.5*Math.pow(Math.log(g/g0)/0.12,2));
    if(sc>best){ best=sc; bg=g; }
  }
  const c=coh(bg);
  if(c<0.55) return null;
  const T=4*bg, tm=rel[rel.length-1];
  const nMin=Math.floor(tm/T+0.1)+1;
  const nStop=((D-o1)/SR)/T;
  const n=Math.max(1,nMin,Math.floor(nStop+0.2));
  return {o1,T,n,coh:c};
}
function readFile(file){
  if(file.arrayBuffer) return file.arrayBuffer();
  return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=()=>rej(r.error); r.readAsArrayBuffer(file); });
}
async function importFile(t,file){
  if(recObj){ msg("Termine l'enregistrement en cours avant d'importer."); return; }
  if(file.size>30*1024*1024){ msg('Fichier trop lourd : 30 Mo maximum.'); return; }
  try{ await ctx.resume(); }catch(e){}
  msg('Lecture du fichier…');
  let ab;
  try{ ab=await ctx.decodeAudioData(await readFile(file)); }
  catch(e){ msg("Impossible de lire ce fichier. Formats courants acceptés : MP3, WAV, M4A, OGG."); return; }
  const n=Math.min(ab.length,MAXLOOP*SR), mono=new Float32Array(n), nc=ab.numberOfChannels;
  for(let c=0;c<nc;c++){ const d=ab.getChannelData(c); for(let i=0;i<n;i++) mono[i]+=d[i]/nc; }
  for(let i=0;i<n;i++) mono[i]=clamp(mono[i],-1,1);
  let pk=0; for(let i=0;i<n;i++){ const v=Math.abs(mono[i]); if(v>pk) pk=v; }
  if(pk<0.001){ msg('Ce fichier semble silencieux.'); return; }
  msg(ab.length>n?'Fichier long : seules les '+MAXLOOP+' premières secondes sont utilisées.':'');
  if(!loopLen){ importFirst(t.id,mono); return; }
  const L=loopLen;
  if(Math.abs(n-L)/L<0.01){ applyImport(t,mono,'once'); return; }
  const box=$('.impbox',t.el), btns=$('.imbtns',t.el), txt=$('.imptxt',t.el);
  const dur=(n/SR).toFixed(1).replace('.',','), ld=(L/SR).toFixed(1).replace('.',',');
  btns.innerHTML='';
  const add=(label,fn,primary)=>{ const b=document.createElement('button'); b.textContent=label; if(primary) b.className='primary'; b.onclick=()=>{ box.hidden=true; fn(); }; btns.appendChild(b); };
  if(n<L){
    txt.textContent='Ton fichier dure '+dur+' s, la boucle '+ld+' s. Comment le placer ?';
    add('Une fois, depuis le début',()=>applyImport(t,mono,'once'),true);
    add('Répéter pour remplir',()=>applyImport(t,mono,'repeat'));
  } else {
    txt.textContent='Ton fichier dure '+dur+' s, la boucle '+ld+' s. Comment le placer ?';
    add('Couper à la longueur de la boucle',()=>applyImport(t,mono,'once'),true);
    const k=Math.ceil(n/baseLen-0.01);
    if(k>=2&&k<=8&&baseLen*k<=MAXLOOP*SR) add('Allonger la boucle (×'+k+') pour tout garder',()=>{ setRepAll(k); if(rep===k) applyImport(t,mono,'once'); });
  }
  add('Annuler',()=>{});
  box.hidden=false;
}
function applyImport(t,mono,mode){
  pushHist();
  const L=loopLen, seg=new Float32Array(L);
  for(let i=0;i<L;i++) seg[i]=mode==='repeat'?mono[i%mono.length]:(i<mono.length?mono[i]:0);
  applyFades(seg);
  const old=t.buf?t.buf.getChannelData(0):null, out=new Float32Array(L);
  for(let i=0;i<L;i++) out[i]=(mixMode&&old)?clamp(old[i]+seg[i],-1,1):seg[i];
  const nb=ctx.createBuffer(1,L,SR); nb.copyToChannel(out,0);
  loopHist=null; if(masterTake&&masterTake.i===t.id) masterTake=null;
  t.prev=t.buf; t.buf=nb;
  drawWave(t); startSrc(t); lockUI(); scheduleSave();
  msg('');
}
function importFirst(i,raw){
  pushHist();
  if(running) stopTransport();
  startTransport(false);
  const t=tracks[i], D=raw.length, tp=ctx.currentTime+0.2, T0=60/bpm;
  tracks.forEach(x=>x.prev=null);
  let an=null;
  if(snap){
    let best=-1;
    for(let p=70;p<=170;p+=5){
      const a=analyzeBeat(raw,D,p); if(!a) continue;
      const sc=a.coh*Math.exp(-0.5*Math.pow(Math.log((60/p)/T0)/0.45,2));
      if(sc>best){ best=sc; an=a; }
    }
  }
  if(an){
    const pre=Math.round(0.003*SR);
    masterTake={i,ref:tracks[i],raw,tp,anchor:an.o1,pre:Math.min(pre,an.o1),T:an.T,s:0,n:an.n,rep:1,det:true};
    buildFromSel();
    msg('Rythme détecté : '+an.n+' temps à '+(60/an.T).toFixed(1).replace('.',',')+' BPM.');
  } else {
    const d=new Float32Array(raw); applyFades(d);
    loopLen=D; beats=Math.max(1,Math.round(D/SR*bpm/60)); t0=tp; masterTake=null; gridOff=0;
    baseLen=D; baseBeats=beats; rep=1; loopHist=null;
    const nb=ctx.createBuffer(1,D,SR); nb.copyToChannel(d,0); t.buf=nb;
    nextBeat=Math.ceil((ctx.currentTime+0.15-t0)/beatDur());
    buildDots(); drawWave(t); startSrc(t); lockUI(); scheduleSave();
    msg("Rythme non détecté : la boucle garde la durée exacte du fichier.");
  }
}
function applyFades(d){
  const Fi=Math.min(8,d.length>>1), Fo=Math.min(32,d.length>>1);
  for(let i=0;i<Fi;i++) d[i]*=(i+1)/Fi;
  for(let i=0;i<Fo;i++) d[d.length-1-i]*=i/Fo;
}
function selLimits(m){ const Tn=m.T*SR; return {smin:Math.ceil((m.pre-m.anchor)/Tn), emax:Math.ceil((m.raw.length-m.anchor)/Tn)}; }
function buildFromSel(){
  const m=masterTake, Tn=m.T*SR, t=tracks[m.i], rp=m.rep||1;
  let startS=Math.round(m.anchor+m.s*Tn)-m.pre;
  const LS=Math.round(m.n*Tn);
  if(m.det){
    const c=Math.round(m.anchor+m.s*Tn), w=Math.round(0.03*SR), a=Math.max(0,c-w), b=Math.min(m.raw.length,c+w);
    let pk=0; for(let i=a;i<b;i++){ const v=Math.abs(m.raw[i]); if(v>pk) pk=v; }
    if(pk>0.05){ for(let i=a;i<b;i++){ if(Math.abs(m.raw[i])>0.25*pk){ startS=i-m.pre; break; } } }
  }
  const one=new Float32Array(LS);
  for(let i=0;i<LS;i++){ const src=startS+i; if(src>=0&&src<m.raw.length) one[i]=m.raw[src]; }
  applyFades(one);
  const out=new Float32Array(LS*rp);
  for(let j=0;j<rp;j++) out.set(one,j*LS);
  stopSrc(t);
  const nb=ctx.createBuffer(1,out.length,SR); nb.copyToChannel(out,0);
  t.buf=nb; t.prev=null; loopLen=out.length; beats=m.n*rp; t0=m.tp+startS/SR;
  baseLen=LS; baseBeats=m.n; rep=rp; loopHist=null; gridOff=m.pre||0;
  nextBeat=Math.ceil((ctx.currentTime+0.15-t0)/beatDur());
  buildDots(); drawWave(t); startSrc(t); lockUI(); scheduleSave();
}
function setRep(k){
  const m=masterTake; if(!m||recObj) return;
  if(Math.round(m.n*m.T*SR)*k>MAXLOOP*SR){ msg('Trop long : '+MAXLOOP+' s maximum pour la boucle.'); return; }
  pushHist(); msg(''); m.rep=k; buildFromSel();
}
function snapState(){
  return {loopLen,beats,baseLen,baseBeats,rep,gridOff,mvol,fin,mt:masterTake?{...masterTake}:null,
    tr:tracks.map(t=>({t,buf:t.buf,sel:t.sel?{...t.sel}:null,selMode:t.selMode,pitch:t.pitch,vol:t.vol,panv:t.panv,mute:t.mute,solo:t.solo,
      fxs:t.fxs.map(f=>({type:f.type,amt:f.amt})),eqv:t.eqv.slice(),srcType:t.srcType,name:t.name,fadeIn:t.fadeIn,fadeOut:t.fadeOut}))};
}
function touchSettings(){ if(!H.pend) H.pend=snapState(); }
function commitSettings(){
  if(!H.pend) return;
  H.past.push(H.pend); H.pend=null;
  if(H.past.length>HMAX) H.past.shift();
  H.future.length=0; updHistUI();
}
function histMB(){
  const cur=new Set(); tracks.forEach(t=>{ if(t.buf) cur.add(t.buf); }); if(masterTake&&masterTake.raw) cur.add(masterTake.raw);
  const seen=new Set(); let bytes=0;
  [...H.past,...H.future].forEach(sn=>{ sn.tr.forEach(x=>{ const b=x.buf; if(b&&!cur.has(b)&&!seen.has(b)){ seen.add(b); bytes+=b.length*4; } }); const r=sn.mt&&sn.mt.raw; if(r&&!cur.has(r)&&!seen.has(r)){ seen.add(r); bytes+=r.length*4; } });
  return bytes/1048576;
}
function pushHist(){
  if(H.pend) commitSettings();
  H.past.push(snapState()); if(H.past.length>HMAX) H.past.shift();
  H.future.length=0;
  while(H.past.length>1&&histMB()>HISTMB) H.past.shift();
  updHistUI();
}
function restoreState(sn){
  if(recObj) cancelRec();
  loopLen=sn.loopLen; beats=sn.beats; baseLen=sn.baseLen; baseBeats=sn.baseBeats; rep=sn.rep; gridOff=sn.gridOff||0;
  if(sn.mvol!=null){ mvol=sn.mvol; fin=sn.fin; chain.vol.gain.value=mvol; chain.setFin(fin); $('#mvol').value=mvol; showFin(); }
  masterTake=sn.mt?{...sn.mt}:null; loopHist=null;
  const map=new Map(sn.tr.map(x=>[x.t,x]));
  tracks.forEach(t=>{
    const x=map.get(t);
    t.buf=x?x.buf:null;
    t.sel=x&&x.sel?{...x.sel}:null; t.selMode=(x&&x.selMode)||'mute'; t.pc=null;
    const p=x?x.pitch:0; if(p!==t.pitch){ t.pitch=p; if(!p) t.pp=null; }
    if(x){
      t.vol=x.vol; t.panv=x.panv; t.mute=x.mute; t.solo=x.solo; t.srcType=x.srcType; t.fadeIn=x.fadeIn||0; t.fadeOut=x.fadeOut||0;
      t.name=x.name; t.eqv=x.eqv.slice(); t.eq.lo.gain.value=t.eqv[0]; t.eq.mid.gain.value=t.eqv[1]; t.eq.hi.gain.value=t.eqv[2];
      const fxChanged=JSON.stringify(t.fxs)!==JSON.stringify(x.fxs);
      t.fxs=x.fxs.map(f=>({type:f.type,amt:f.amt})); if(fxChanged) setFx(t);
    }
    syncTrackUI(t); drawWave(t);
    if(t.buf) startSrc(t); else stopSrc(t);
  });
  if(masterTake&&masterTake.ref){ const k=tracks.indexOf(masterTake.ref); if(k>=0) masterTake.i=k; else masterTake=null; }
  applyGains();
  nextBeat=Math.ceil((ctx.currentTime+0.15-t0)/beatDur());
  buildDots(); lockUI(); updLive(); scheduleSave();
}
function undo(){ if(H.pend) commitSettings(); if(!H.past.length||recObj) return; H.future.push(snapState()); restoreState(H.past.pop()); updHistUI(); msg('Action annulée.'); }
function redo(){ if(!H.future.length||recObj) return; H.past.push(snapState()); restoreState(H.future.pop()); updHistUI(); msg('Action rétablie.'); }
function clearHist(){ H.past.length=0; H.future.length=0; H.pend=null; updHistUI(); }
function memMB(){
  const seen=new Set(); let bytes=0;
  const add=b=>{ if(!b||seen.has(b)) return; seen.add(b); bytes+=(b.length||0)*4*(b.numberOfChannels||1); };
  tracks.forEach(t=>{ add(t.buf); if(t.pp) add(t.pp.out); if(t.pc) add(t.pc.out); });
  if(masterTake) add(masterTake.raw);
  [...H.past,...H.future].forEach(sn=>{ sn.tr.forEach(x=>add(x.buf)); if(sn.mt) add(sn.mt.raw); });
  return bytes/1048576;
}
let memWarned=false;
function checkMem(){
  const m=memMB();
  if(m>250&&!memWarned){ memWarned=true; msg('Mémoire audio élevée ('+Math.round(m)+' Mo) : un téléphone modeste peut ralentir. « Libérer de la mémoire » dans le diagnostic aide.'); }
  if(m<200) memWarned=false;
  return m;
}
function freeMem(){
  const before=memMB();
  clearHist();
  tracks.forEach(t=>{ t.pc=null; if(!t.pitch) t.pp=null; });
  if(running) tracks.forEach(startSrc);
  const after=memMB();
  msg('Mémoire libérée : '+Math.round(before)+' → '+Math.round(after)+' Mo (l\'historique d\'annulation a été vidé).');
  memWarned=false;
}
function updHistUI(){ const u=$('#undo'), r=$('#redo'); if(u) u.disabled=!H.past.length; if(r) r.disabled=!H.future.length; }
function cycleMap(b,oldRep,newRep){
  const src=b.getChannelData(0), C=baseLen, out=new Float32Array(C*newRep);
  for(let j=0;j<newRep;j++){ const sj=j%oldRep; out.set(src.subarray(sj*C,(sj+1)*C),j*C); }
  const nb=ctx.createBuffer(1,out.length,SR); nb.copyToChannel(out,0); return nb;
}
function refreshLoop(){
  nextBeat=Math.ceil((ctx.currentTime+0.15-t0)/beatDur());
  buildDots(); tracks.forEach(t=>{ drawWave(t); startSrc(t); }); lockUI(); scheduleSave();
}
function setRepAll(k){
  if(recObj||!loopLen||k===rep) return;
  if(baseLen*k>MAXLOOP*SR){ msg('Trop long : '+MAXLOOP+' s maximum pour la boucle.'); return; }
  msg('');
  const solo=!!(masterTake&&masterTake.T&&tracks.filter(t=>t.buf).length===1&&tracks[masterTake.i].buf);
  if(solo){ setRep(k); return; }
  pushHist();
  tracks.forEach(t=>{ if(t.buf) t.buf=cycleMap(t.buf,rep,k); if(t.prev) t.prev=cycleMap(t.prev,rep,k); });
  rep=k; loopLen=baseLen*k; beats=baseBeats*k;
  if(masterTake) masterTake.rep=k;
  refreshLoop();
}
function undoLen(){
  const h=loopHist; if(!h||recObj) return;
  loopHist=null;
  tracks.forEach((t,i)=>{ t.buf=h.t[i].buf; t.prev=h.t[i].prev; });
  rep=h.rep; loopLen=h.loopLen; beats=h.beats;
  if(masterTake) masterTake.rep=h.rep;
  refreshLoop();
}
function setSel(s,e){
  const m=masterTake; if(!m||recObj) return;
  const L=selLimits(m); s=Math.max(L.smin,s); e=Math.min(L.emax,e);
  if(e-s<1||e-s>64) return;
  if(s===m.s&&e-s===m.n) return;
  pushHist(); m.s=s; m.n=e-s; buildFromSel();
}
let drag=null;
function peaksOf(raw,w){
  const p=new Float32Array(w), step=raw.length/w;
  for(let i=0;i<w;i++){ let m=0; const a=Math.floor(i*step), z=Math.min(raw.length,Math.floor((i+1)*step)); for(let j=a;j<z;j+=8){ const v=Math.abs(raw[j]); if(v>m) m=v; } p[i]=m; }
  return p;
}
function drawEditor(){
  const m=masterTake; if(!m) return;
  const c=$('#edc'), dpr=window.devicePixelRatio||1;
  const w=Math.floor(c.clientWidth*dpr), h=Math.floor(c.clientHeight*dpr); if(!w||!h) return;
  c.width=w; c.height=h;
  const g=c.getContext('2d'); g.clearRect(0,0,w,h);
  const N=m.raw.length, Tn=m.T*SR, px=x=>x/N*w;
  if(!m.pk||m.pk.length!==w) m.pk=peaksOf(m.raw,w);
  let mx=0.15; for(let i=0;i<m.pk.length;i++) if(m.pk[i]>mx) mx=m.pk[i];
  g.fillStyle='#9b968d';
  for(let x=0;x<w;x++){ const hh=Math.max(1,m.pk[x]/mx*h*0.85); g.fillRect(x,(h-hh)/2,1,hh); }
  for(let k=Math.ceil(-m.anchor/Tn); m.anchor+k*Tn<N; k++){ const x=px(m.anchor+k*Tn); g.fillStyle=mod(k,4)===0?'rgba(128,128,128,.6)':'rgba(128,128,128,.25)'; g.fillRect(x,0,1,h); }
  const s0=drag?drag.s:m.s, e0=drag?drag.e:m.s+m.n;
  const sx=px(m.anchor+s0*Tn), ex=px(m.anchor+e0*Tn);
  g.fillStyle='rgba(232,71,43,.18)'; g.fillRect(sx,0,ex-sx,h);
  g.fillStyle='#e8472b'; g.fillRect(sx-1.5*dpr,0,3*dpr,h); g.fillRect(ex-1.5*dpr,0,3*dpr,h);
  $('#edlbl').textContent='Temps '+(s0+1)+' → '+e0+' ('+(e0-s0)+' temps)'+((m.rep||1)>1?' ×'+m.rep:'');
}
(()=>{
  const ed=$('#edc');
  const beatAt=ev=>{ const m=masterTake, r=ed.getBoundingClientRect(); const smp=(ev.clientX-r.left)/r.width*m.raw.length; return Math.round((smp-m.anchor)/(m.T*SR)); };
  const move=ev=>{ const m=masterTake; if(!m||!drag) return; const b=beatAt(ev), L=selLimits(m);
    if(drag.which==='s') drag.s=clamp(b,L.smin,drag.e-1); else drag.e=clamp(b,drag.s+1,L.emax);
    drawEditor(); };
  ed.addEventListener('pointerdown',ev=>{ const m=masterTake; if(!m||recObj) return; try{ ed.setPointerCapture(ev.pointerId); }catch(e){}
    const b=beatAt(ev), s=m.s, e=m.s+m.n; drag={s,e,which:Math.abs(b-s)<=Math.abs(b-e)?'s':'e'}; move(ev); });
  ed.addEventListener('pointermove',move);
  const end=()=>{ if(!drag) return; const d=drag; drag=null; setSel(d.s,d.e); drawEditor(); };
  ed.addEventListener('pointerup',end); ed.addEventListener('pointercancel',end);
  $('#growb').onclick=e=>{ const b=e.target.closest('button'); if(b&&!b.disabled) setRepAll(+b.dataset.k); };
  $('#sm').onclick=()=>{ const m=masterTake; if(m) setSel(m.s-1,m.s+m.n); };
  $('#sp').onclick=()=>{ const m=masterTake; if(m) setSel(m.s+1,m.s+m.n); };
  $('#em').onclick=()=>{ const m=masterTake; if(m) setSel(m.s,m.s+m.n-1); };
  $('#ep').onclick=()=>{ const m=masterTake; if(m) setSel(m.s,m.s+m.n+1); };
})();
function finishRec(s,e){
  const r=recObj; if(!r) return;
  pushHist();
  const blocks=cap.blocks;
  cap=null; recObj=null;
  const raw=gather(blocks,s,e);
  for(let i=0;i<raw.length;i++) raw[i]=clamp(raw[i],-1,1);
  autoLevel(raw);
  const t=tracks[r.i];
  if(r.master){
    tracks.forEach(x=>x.prev=null);
    if(snap){
      const an=analyzeBeat(raw,r.D), pre=Math.round(0.003*SR);
      masterTake=an
        ?{i:r.i,ref:tracks[r.i],raw,tp:r.tp,anchor:an.o1,pre:Math.min(pre,an.o1),T:an.T,s:0,n:an.n,rep:1,det:true}
        :{i:r.i,ref:tracks[r.i],raw,tp:r.tp,anchor:0,pre:0,T:60/bpm,s:0,n:r.n,rep:1,det:false};
      buildFromSel();
    } else {
      masterTake=null;
      const LS=r.D, d=new Float32Array(LS);
      for(let i=0;i<LS;i++) d[i]=i<raw.length?raw[i]:0;
      applyFades(d);
      loopLen=LS; beats=r.n; t0=r.tp; gridOff=0;
      const nb=ctx.createBuffer(1,loopLen,SR); nb.copyToChannel(d,0);
      t.buf=nb;
      nextBeat=Math.ceil((ctx.currentTime+0.15-t0)/beatDur());
      buildDots();
    }
  } else {
    const d=raw; applyFades(d);
    if(masterTake&&masterTake.i===r.i) masterTake=null;
    const L=loopLen, out=new Float32Array(L);
    if(t.buf) out.set(t.buf.getChannelData(0));
    const start=Math.round(mod(r.tp-t0,loopSec())*SR)%L;
    for(let i=0;i<d.length;i++){ const idx=(start+i)%L; out[idx]=mixMode?clamp(out[idx]+d[i],-1,1):d[i]; }
    const nb=ctx.createBuffer(1,L,SR); nb.copyToChannel(out,0);
    t.prev=t.buf; t.buf=nb;
  }
  loopHist=null;
  drawWave(t); startSrc(t); lockUI(); scheduleSave();
}

// ---------- aide « ? » ----------
const HELP={
  tempo:"<b>Le tempo</b>, c'est la vitesse de ton rythme, en battements par minute (BPM). Plus le chiffre est grand, plus c'est rapide. Règle-le près de la vitesse à laquelle tu vas jouer : le métronome (les clics) t'aide à rester dans le temps. Une fois ta première prise faite, le tempo est verrouillé.",
  metro:"<b>Métronome</b> : un clic à chaque temps, plus aigu sur le premier. Il t'aide à jouer en rythme et lance un décompte de 4 clics avant ta première prise. Désactivé, pas de clic ni de décompte.",
  snap:"<b>Auto-caler</b> : quand tu arrêtes ta première prise, l'appli repère tes sons, déduit ton vrai tempo, démarre la boucle pile sur ton premier son et la termine sur un temps entier, sans blanc. Désactivé, la boucle garde exactement la durée que tu as enregistrée.",
  mix:"<b>Prise : remplace / ajoute</b>. <b>Remplace</b> : une nouvelle prise efface la partie de la piste qu'elle recouvre. <b>Ajoute</b> : elle se superpose à ce qui est déjà sur la piste (pratique pour empiler plusieurs sons sur la même piste).",
  editor:"<b>Garder la partie propre</b>. Après ta première prise, la forme d'onde apparaît avec les temps (traits fins). Glisse les repères rouges, ou utilise les boutons, pour ne garder que le passage réussi : il tourne en boucle en direct. Disponible tant que cette piste est la seule enregistrée.",
  grow:"<b>Durée de la boucle</b> : ×1 est ta boucle de départ. ×2, ×3… la répètent pour l'allonger, ce qui laisse plus de temps à tes autres pistes. <b>Tu peux revenir en arrière à tout moment</b> en choisissant un nombre plus petit (×1 pour revenir à la boucle de départ). Quand tu raccourcis, seul le début est conservé : si tu avais enregistré du nouveau son sur la partie retirée, elle disparaît, mais « Annuler le dernier changement de durée » la rend, tant que tu n'as rien modifié d'autre.",
  proj:"<b>Projets</b> : chaque projet garde ses pistes, sa boucle et tous ses réglages. Ton travail est <b>enregistré automatiquement</b> dans ce navigateur (indication en haut à droite) ; « Enregistrer » force l'enregistrement tout de suite. « Enregistrer une copie » crée un nouveau projet à partir de celui-ci (avec le nom écrit dans la case). Dans « Mes projets », tu ouvres ou supprimes un projet. La latence et le gain du micro sont communs à tous les projets.",
  projfile:"<b>Fichier de sauvegarde</b> : crée un fichier « .loopbox » avec tout le projet (sons et réglages), à garder dans tes téléchargements ou à envoyer ailleurs. <b>Important</b> : les projets du navigateur disparaissent si tu effaces les données du site ou du navigateur ; le fichier, lui, reste. « Ouvrir un fichier » le recharge comme un nouveau projet. Le son y est stocké en qualité CD (16 bits).",
  pitch:"<b>Hauteur du son</b> : monte ou descend la <b>note</b> de la piste, <b>sans changer sa durée ni son rythme</b> : elle reste calée sur la boucle. Le réglage est en <b>demi-tons</b> (+12 = une octave plus aigu, −12 = une octave plus grave). L'appli recalcule la piste quand tu relâches le curseur (de quelques instants à quelques secondes selon la longueur) : « Calcul… » s'affiche, et l'ancien son continue de jouer en attendant. Plus tu t'éloignes de 0 (surtout au-delà de ±7), plus le son peut devenir métallique ou perdre en précision. Le son d'origine n'est jamais modifié : remets 0 pour le retrouver. Fonctionne aussi sur un fichier importé.",
  trep:"<b>Le reste de la piste</b> : ce que devient la piste en dehors de la partie choisie avec les repères orange. <b>Silence</b> : seule la partie est jouée. <b>Répéter en boucle</b> : la partie se répète en continu sur toute la boucle, à partir de son début. <b>×2 / ×3 / ×4</b> : jouée 2, 3 ou 4 fois à la suite, puis silence. <b>Rien n'est effacé</b> : la forme d'onde complète reste visible, la partie en orange et ses répétitions en orange pâle, et la durée de la boucle de base ne change jamais. Sans partie choisie, l'appli prend automatiquement les temps qui contiennent du son.",  tsel:"<b>Garder la partie propre (cette piste)</b> : choisis les temps à conserver sur cette piste, le reste devient muet (zones assombries sur la forme d'onde). <b>Ça ne change ni la boucle ni la piste de base.</b> Rien n'est perdu : tu peux élargir de nouveau la sélection, ou toucher « Tout garder ». Glisse les repères orange sur la forme d'onde, ou utilise les boutons. Une nouvelle prise sur la piste remet la sélection à zéro.",
  imp:"<b>Importer un fichier audio</b> : place un son de ton téléphone (MP3, WAV, M4A, OGG…) sur cette piste. <b>Sur la première piste</b>, l'appli essaie de repérer le rythme du fichier pour définir la boucle : règle d'abord le curseur de tempo près de celui du morceau. <b>Sur les autres pistes</b>, tu choisis comment l'adapter à la boucle : une seule fois depuis le début, répété pour la remplir, coupé, ou en allongeant la boucle. La vitesse du fichier n'est pas modifiée. Limites : 30 Mo et 40 secondes (le reste est ignoré).",
  undo:"<b>Annuler / Rétablir</b> (↶ ↷ en haut) : reviennent en arrière ou en avant sur les prises, imports, effacements, découpes, durées de boucle et hauteurs, jusqu'à 30 étapes. Les réglages de volume, d'effets et de tonalité ne sont pas concernés.",
  tname:"<b>Nom et place</b> : donne un nom à la piste (« Kick », « Snare », « Voix »…), monte-la ou descends-la dans la liste, ou duplique-la : la copie reprend le son et tous les réglages, pratique pour essayer un autre effet sans toucher à l'original.",
  msub:"<b>Clics</b> : <b>Temps</b> = un clic par temps. <b>Croches</b> = deux clics par temps, <b>Doubles</b> = quatre : les clics intermédiaires sont plus doux. Pratique pour jouer des rythmes rapides bien en place.",
  meter:"<b>Mesure</b> : <b>4 temps</b> pour la plupart des rythmes, <b>3 temps</b> pour une valse ou un rythme ternaire. Ça change l'accent du métronome (le clic aigu), le décompte et le regroupement des temps à l'écran.",
  quant:"<b>Recaler sur le rythme</b> : l'appli repère chaque son de la piste et le déplace vers le temps le plus proche de la grille choisie (temps, croches ou doubles-croches). <b>100 %</b> = exactement sur la grille, <b>50 %</b> = à mi-chemin, plus naturel. Idéal pour les percussions ; sur une voix ou un son continu, ça peut créer des coupures. ↶ annule si le résultat ne te plaît pas.",
  fades:"<b>Fondus</b> : le son de la piste monte progressivement au début (entrée) ou s'éteint progressivement à la fin (sortie) de sa partie, sur la durée choisie. Ça ne touche pas au son d'origine. <b>Jouer à l'envers</b> retourne la piste (effet « son inversé »), ↶ pour revenir.",
  tempochg:"<b>Changer le tempo</b> : accélère ou ralentit toute la boucle, toutes les pistes ensemble, <b>sans changer la note</b>. Règle le nouveau tempo avec −5 / −1 / +1 / +5 puis « Appliquer ». De la moitié au double du tempo actuel. Plus l'écart est grand, plus le son peut s'abîmer un peu. ↶ annule.",
  live:"<b>Mode live</b> : un gros bouton par piste pour la couper ou la relancer pendant la lecture. Le changement tombe <b>en rythme</b> : au début de la prochaine mesure, au début de la prochaine boucle, ou tout de suite, selon ton choix. Le bouton clignote tant que le changement est en attente. Idéal pour jouer devant quelqu'un.",
  scenes:"<b>Scènes</b> : mémorise une combinaison de pistes en jeu (par exemple A = couplet, B = refrain), puis « Lancer » la rappelle d'un coup, en rythme. Règle d'abord les pistes avec les gros boutons, puis « Mémoriser ».",
  share:"<b>Partager le mix</b> : prépare le fichier WAV et ouvre le menu de partage du téléphone (WhatsApp, mail, Drive…). Si le navigateur ne sait pas partager un fichier, il est simplement téléchargé.",
  stems:"<b>Pistes séparées</b> : exporte chaque piste dans son propre fichier WAV, tous rangés dans un .zip, pour les retravailler dans une autre appli. Chaque piste garde son volume, sa tonalité, ses effets et sa hauteur, mais pas le « Son final ». Toutes les pistes ont la même longueur et démarrent en même temps : elles se superposent parfaitement.",
  install:"<b>Installer l'appli</b> : ajoute LoopBox à ton écran d'accueil comme une vraie appli, en plein écran, et elle <b>fonctionne même sans connexion</b> une fois installée. Selon le navigateur, le bouton apparaît ici, ou il faut passer par le menu du navigateur (⋮) → « Ajouter à l'écran d'accueil » / « Installer l'appli ». Quand une nouvelle version sort, un message « Mettre à jour » s'affiche.",
  denoise:"<b>Nettoyer le bruit</b> : retire le souffle du micro. <b>Léger</b> coupe le bruit dans les silences entre les sons, sans toucher aux sons eux-mêmes : à essayer en premier. <b>Fort</b> retire aussi le souffle qui reste sous les sons, en analysant les fréquences ; il peut rendre le son un peu « métallique » sur une voix. L'appli repère le bruit dans les passages calmes de la piste : il en faut un peu. ↶ annule. Astuce : un gain micro trop élevé et un micro loin de la bouche augmentent le souffle.",
  btl:"<b>Notes sur la ligne de temps</b> : comme sur un logiciel de montage, chaque bloc coloré est une portion de la boucle jouée sur une note. <b>Pour couper</b> : touche la règle (les numéros de temps en haut) à l'endroit voulu ; toucher une coupe existante (✂) l'enlève. <b>Pour changer une note</b> : touche le bloc, puis une note de la palette. ◀ ▶ passent d'un bloc à l'autre. <b>Fais glisser la limite orange</b> entre deux blocs pour régler leur durée (au temps près). « Retirer le bloc » le fusionne avec son voisin. « Glisser vers le bloc suivant » fait monter ou descendre la dernière note du bloc jusqu'à la note suivante. Le dessin « Notes jouées » montre le résultat.",
  bass:"<b>Piste de basse</b> : la basse est fabriquée à partir des blocs de la ligne de temps. <b>Rythme</b> = où tombent les notes. <b>Mélodie</b> = quelles notes jouer dans chaque bloc : « Même note » ne joue que la note du bloc ; les autres ajoutent l'octave, la quinte ou une marche vers le bloc suivant. <b>Son</b> : Sub (rond), Électrique (pincée), Acid (filtrée), 808 (grave qui chute). « ▶ Aperçu » fait entendre la basse sans l'enregistrer, et chaque changement s'entend tout de suite ; « Créer la basse » la valide.",  trk:"<b>Une piste</b>, c'est une couche de ton morceau. <b>● REC</b> enregistre (■ STOP pour finir) ; la forme d'onde montre ce qui est enregistré. Touche le <b>nom de la piste</b> (▸) pour ouvrir ses réglages : type de son, volume, <b>Muet</b> (la coupe), <b>Solo</b> (n'écoute qu'elle), panoramique, tonalité, effets, annuler et effacer. Un 🔇 ou un 🎧 à côté du nom te rappelle qu'elle est en muet ou en solo.",
  vol:"<b>Volume</b> de cette piste. Vers la droite : plus fort. Vers la gauche : plus doux. Sers-t'en pour équilibrer tes pistes entre elles.",
  pan:"<b>Gauche ⇄ Droite</b> (panoramique) : place le son plus à gauche ou plus à droite dans ton casque. Au milieu, il est centré. Pratique pour séparer les pistes et aérer le mix.",
  eq:"<b>Tonalité</b> : trois curseurs pour façonner le son de cette piste. Ils agissent à l'écoute : tu peux les changer à tout moment, même après l'enregistrement, et entendre le résultat dans le mix. <b>Graves</b> : le corps, le « boum ». <b>Médiums</b> : la présence, le corps d'une voix ou d'une caisse claire. <b>Aigus</b> : la brillance, les « tss », l'air. Au milieu (0 dB) : son d'origine. Les boutons rapides règlent les trois d'un coup : <b>Punch</b> (plus de corps et d'attaque), <b>Clair</b> (plus brillant), <b>Voix nette</b> (moins de graves boueux, voix plus présente), <b>Chaud</b> (plus rond, moins agressif). Tu peux ensuite affiner avec les curseurs. Astuce : si une piste « mange » les autres, baisse ses graves ou ses médiums.",
  fx:"<b>Effets</b> : transforment le son de cette piste. Tu peux en <b>empiler 2</b> (« + Ajouter un effet ») : ils s'appliquent <b>dans l'ordre, de haut en bas</b>, et chacun a sa propre intensité. Le ✕ retire un effet. <b>Écho</b> : répétitions calées sur le tempo. <b>Réverbération</b> : son de grande salle. <b>Saturation</b> : son sale et puissant. <b>Lo-fi 8 bits</b> : son de vieille console. <b>Étouffé</b> : comme derrière un mur. <b>Radio</b> : voix de téléphone. <b>Pulsation</b> : le volume bat au rythme du tempo. <b>Flanger</b> : effet de jet qui passe. <b>Robot</b> : voix métallique. <b>Basses boostées</b> : plus de graves. Les effets agissent <b>avant</b> le volume de la piste : baisser le volume n'en change pas le caractère.",
  fxamt:"<b>Intensité de l'effet</b> : de très discret (gauche) à très marqué (droite). Écoute en réglant : c'est le plus simple.",
  undo:"<b>Annuler</b> : revient à la prise précédente de cette piste. Appuie encore pour revenir à la dernière prise.",
  clear:"<b>Effacer</b> : vide cette piste. Tu peux annuler juste après avec « Annuler ».",
  mvol:"<b>Volume général</b> : la force de toutes les pistes ensemble, juste avant la sortie.",
  mout:"<b>Niveau de sortie</b> : le volume réel de ton mix. Si la barre devient <b>rouge</b>, c'est trop fort et le son sature : baisse le volume général ou celui de certaines pistes.",
  min:"<b>Niveau micro</b> : ce que capte ton micro. Quand tu joues, la barre doit bouger bien franchement sans devenir rouge. Trop faible : augmente le gain micro dans « Réglages ». Rouge : baisse-le.",
  fin:"<b>Son final</b> (on parle aussi de finalisation ou de mastering). Il polit l'ensemble : il équilibre les graves et les aigus, resserre l'écart entre les sons faibles et forts (compression) et empêche les pics de saturer (limiteur). Résultat : un mix plus homogène et plus fort. <b>Doux</b> = discret. <b>Fort</b> = plus puissant et plus « compressé ». S'applique aussi à l'export.",
  exp:"<b>Exporter</b> : crée un fichier son (WAV, qualité CD) de ton mix, avec tous tes réglages et effets. Choisis avant combien de fois la boucle est répétée dans le fichier.",
  ingain:"<b>Gain micro</b> : amplifie le micro avant l'enregistrement. Si ton « Niveau micro » reste très faible, augmente. S'il devient rouge, baisse.",
  comp:"<b>Latence</b> : le petit retard entre le moment où tu joues et celui où ton téléphone l'enregistre. Si tes sons arrivent trop tard dans la boucle, augmente cette valeur. Le bouton « Calibrer » la règle tout seul.",
  src:"<b>Type de son</b> : dis à l'appli ce que tu vas enregistrer sur cette piste. Elle adapte le <b>filtre des graves</b> (plus fort pour la voix, pour éviter les « pop » et le bruit de manipulation ; très léger pour le beatbox et les percussions, pour garder les « boum »), la <b>sensibilité</b> (plus élevée pour les sons faibles et proches de l'environnement) et, pour la <b>voix</b>, un filtre qui atténue le bruit de fond entre les phrases. Cela ne change pas le micro du téléphone lui-même : le plus important reste la distance entre ta bouche et le micro.",
  lvl:"<b>Niveau auto des prises</b> : après chaque prise, si elle est trop faible, l'appli la remonte automatiquement à un bon volume. Pratique si tu t'éloignes du micro ou si tu fais des sons doux. Désactive-le si tu préfères régler le volume toi-même.",
  setup:"<b>Je joue avec</b> : choisis ce que tu utilises pour écouter et enregistrer. L'appli garde une latence pour chaque configuration et passe de l'une à l'autre quand tu changes. <b>Sans casque</b> : calibration automatique. <b>Casque filaire</b> et <b>Casque Bluetooth</b> : calibration en tapant (le Bluetooth ajoute souvent 150 à 300 ms). <b>Micro externe</b> : choisis-le dans la liste « Micro » et calibre-le.",
  micsel:"<b>Micro</b> : le micro utilisé pour enregistrer. « Par défaut » = celui choisi par la tablette. Avec un micro externe branché, choisis-le ici. Avec un casque Bluetooth, garde de préférence le micro de la tablette : utiliser le micro du casque fait souvent passer Android en « mode appel », avec un son de bien moins bonne qualité.",
  caltap:"<b>Calibrer en tapant</b> : à faire <b>avec le casque sur les oreilles</b>. Tu entends 12 clics : les 4 premiers servent de décompte, puis tape sur la table (ou fais « pa » au micro) pile sur chacun des 8 suivants. L'appli mesure le retard total, casque compris, et le range dans la configuration choisie.",
  cal:"<b>Calibrer</b> : le téléphone joue des clics et mesure le retard avec son propre micro. Il faut être <b>sans casque</b>, volume moyen, dans un endroit calme. À refaire si tu changes de casque ou d'appareil."
};
function attachHelp(root){
  root.querySelectorAll('[data-help]').forEach(el=>{
    if(el._h) return; el._h=1;
    const txt=HELP[el.dataset.help]; if(!txt) return;
    const q=document.createElement('button'); q.type='button'; q.className='q'; q.textContent='?';
    q.setAttribute('aria-label','Aide : '+(el.textContent||el.dataset.help).trim().slice(0,30)); q.setAttribute('aria-expanded','false');
    el.insertAdjacentElement('afterend',q);
    let box=null;
    q.onclick=ev=>{
      ev.stopPropagation();
      if(box){ box.remove(); box=null; q.classList.remove('on'); q.setAttribute('aria-expanded','false'); return; }
      box=document.createElement('div'); box.className='helpbox'; box.innerHTML=txt;
      (el.closest('.row')||el.parentElement).insertAdjacentElement('afterend',box);
      q.classList.add('on'); q.setAttribute('aria-expanded','true');
    };
  });
}

// ---------- UI pistes ----------
const wrap=$('#tracks');
function panText(v){ return v<-0.05?'Gauche '+Math.round(-v*100)+'%':v>0.05?'Droite '+Math.round(v*100)+'%':'Centre'; }
function updFxBadge(t){ $('.fxbadge',t.el).textContent=fxNames(t); }
function renderFx(t){
  const box=$('.fxlist',t.el); box.innerHTML='';
  t.fxs.forEach((sl,k)=>{
    const d=document.createElement('div'); d.className='fxslot';
    d.innerHTML=`<div class="row"><select class="fxsel" aria-label="Effet ${k+1} piste ${t.id+1}">${FX_LIST.map(f=>`<option value="${f[0]}">${f[1]}</option>`).join('')}</select>${t.fxs.length>1?`<button class="fxrm" aria-label="Retirer l'effet ${k+1}">✕</button>`:''}</div>
      <div class="row"><span class="lbl">Intensité</span><input type="range" class="fxamt" min="0" max="1" step="0.01" value="${sl.amt}" aria-label="Intensité effet ${k+1} piste ${t.id+1}"><span class="av val" style="width:48px;text-align:right">${Math.round(sl.amt*100)}%</span></div>`;
    box.appendChild(d);
    const sel=$('.fxsel',d), am=$('.fxamt',d);
    sel.value=sl.type; am.disabled=sl.type==='none';
    sel.onchange=e=>{ touchSettings(); sl.type=e.target.value; commitSettings(); am.disabled=sl.type==='none'; setFx(t); updFxBadge(t); scheduleSave(true); };
    am.onchange=commitSettings;
    am.oninput=e=>{ touchSettings(); sl.amt=+e.target.value; $('.av',d).textContent=Math.round(sl.amt*100)+'%'; const f=t.fxn.find(x=>x.slot===sl); if(f) f.set(sl.amt,beatDur()); scheduleSave(true); };
    const rm=$('.fxrm',d);
    if(rm) rm.onclick=()=>{ touchSettings(); t.fxs.splice(k,1); commitSettings(); if(!t.fxs.length) t.fxs.push({type:'none',amt:0.5}); setFx(t); renderFx(t); scheduleSave(true); };
  });
  $('.fxadd',t.el).disabled=t.fxs.length>=MAXFX;
  updFxBadge(t);
}
function syncTrackUI(t){
  const el=t.el;
  $('.vol',el).value=t.vol; $('.pan',el).value=t.panv; $('.pv',el).textContent=panText(t.panv);
  $('.srcsel',el).value=t.srcType;
  $('.fdi',el).value=String(t.fadeIn||0); $('.fdo',el).value=String(t.fadeOut||0);
  if(document.activeElement!==$('.tnin',el)) $('.tnin',el).value=t.name;
  $('.tn',el).textContent=t.name;
  $('.pitch',el).value=t.pitch; $('.ptv',el).textContent=pitchText(t.pitch);
  el.querySelectorAll('.eq').forEach((r,k)=>{ r.value=t.eqv[k]; r.parentElement.querySelector('.ev').textContent=dbText(t.eqv[k]); });
  el.querySelectorAll('.eqp button').forEach(b=>{ const p=EQ_PRESETS.find(x=>x[0]===b.dataset.p); b.classList.toggle('on',p[2].every((v,k)=>v===t.eqv[k])); });
  renderFx(t);
}
const FADE_OPTS=[[0,'aucun'],[0.5,'½ temps'],[1,'1 temps'],[2,'2 temps'],[4,'4 temps']].map(o=>`<option value="${o[0]}">${o[1]}</option>`).join('');
// ---------- nettoyage du bruit ----------
function fftIn(re,im){
  const n=re.length;
  for(let i=1,j=0;i<n;i++){ let bit=n>>1; for(;j&bit;bit>>=1) j^=bit; j^=bit; if(i<j){ let t=re[i]; re[i]=re[j]; re[j]=t; t=im[i]; im[i]=im[j]; im[j]=t; } }
  for(let len=2;len<=n;len<<=1){
    const ang=-2*Math.PI/len, wr=Math.cos(ang), wi=Math.sin(ang), h2=len>>1;
    for(let i=0;i<n;i+=len){ let cr=1,ci=0; for(let j=0;j<h2;j++){ const p=i+j, q=p+h2, br=re[q]*cr-im[q]*ci, bi=re[q]*ci+im[q]*cr; re[q]=re[p]-br; im[q]=im[p]-bi; re[p]+=br; im[p]+=bi; const t=cr*wr-ci*wi; ci=cr*wi+ci*wr; cr=t; } }
  }
}
function noiseFloorRms(d){
  const fr=Math.round(0.02*SR), n=Math.floor(d.length/fr), r=[];
  for(let k=0;k<n;k++){ let a=0; for(let i=k*fr;i<(k+1)*fr;i++) a+=d[i]*d[i]; r.push(Math.sqrt(a/fr)); }
  r.sort((a,b)=>a-b); return r.length?r[Math.floor(r.length*0.1)]:0;
}
// porte de bruit : coupe le souffle quand rien ne joue, sans couper les attaques (anticipation de 5 ms)
function gateClean(d,floor,depthDb){
  const N=d.length, out=new Float32Array(N), thr=Math.max(floor*3.2,2e-4), gmin=Math.pow(10,-depthDb/20);
  const rel=Math.exp(-1/(SR*0.06)), la=Math.round(0.005*SR), hold=Math.round(0.03*SR), down=1/(SR*0.05);
  const env=new Float32Array(N); let e=0;
  for(let i=0;i<N;i++){ const v=Math.abs(d[i]); e=v>e?v:e*rel; env[i]=e; }
  let g=gmin, h=0;
  for(let i=0;i<N;i++){
    const open=env[Math.min(N-1,i+la)]>thr;
    if(open){ h=hold; g+=(1-g)*0.25; } else if(h>0){ h--; } else { g=Math.max(gmin,g-down); }
    out[i]=d[i]*g;
  }
  return out;
}
// réduction spectrale : apprend le « profil » du souffle dans les passages calmes, puis le retire partout
function spectralClean(x){
  const N=1024, H=256, L=x.length, P=N, half=N/2;
  if(L<4*N) return x;
  const xp=new Float32Array(L+2*P); xp.set(x.subarray(L-P),0); xp.set(x,P); xp.set(x.subarray(0,P),P+L);
  const win=new Float64Array(N); for(let i=0;i<N;i++) win[i]=Math.sqrt(0.5-0.5*Math.cos(2*Math.PI*i/N));
  const frames=Math.floor((xp.length-N)/H)+1, re=new Float64Array(N), im=new Float64Array(N);
  const mags=new Array(frames), en=new Float64Array(frames);
  for(let f=0;f<frames;f++){
    for(let i=0;i<N;i++){ re[i]=xp[f*H+i]*win[i]; im[i]=0; } fftIn(re,im);
    const m=new Float32Array(half+1); let s=0; for(let k=0;k<=half;k++){ m[k]=Math.hypot(re[k],im[k]); s+=m[k]*m[k]; } mags[f]=m; en[f]=s;
  }
  const sorted=Array.from(en).sort((a,b)=>a-b), lim=sorted[Math.max(0,Math.floor(frames*0.15))];
  const noise=new Float64Array(half+1); let cnt=0;
  for(let f=0;f<frames;f++) if(en[f]<=lim){ cnt++; for(let k=0;k<=half;k++) noise[k]+=mags[f][k]; }
  if(!cnt) return x;
  for(let k=0;k<=half;k++) noise[k]/=cnt;
  const out=new Float64Array(xp.length), gp=new Float64Array(half+1).fill(1), alpha=2.0, flo=0.08;
  for(let f=0;f<frames;f++){
    for(let i=0;i<N;i++){ re[i]=xp[f*H+i]*win[i]; im[i]=0; } fftIn(re,im);
    for(let k=0;k<=half;k++){
      const m=mags[f][k]+1e-12; let g=Math.max(flo,1-alpha*noise[k]/m); if(g<gp[k]) g=0.6*gp[k]+0.4*g; gp[k]=g;
      re[k]*=g; im[k]*=g; if(k>0&&k<half){ re[N-k]*=g; im[N-k]*=g; }
    }
    for(let i=0;i<N;i++) im[i]=-im[i];
    fftIn(re,im);
    for(let i=0;i<N;i++) out[f*H+i]+=(re[i]/N)*win[i]/2;
  }
  const y=new Float32Array(L); for(let i=0;i<L;i++) y[i]=out[P+i];
  return y;
}
function denoiseData(d,level){
  const floor=noiseFloorRms(d);
  const y=level==='strong'?spectralClean(d):d;
  return gateClean(y,floor,level==='strong'?36:28);
}
// écart entre les passages calmes et les passages forts : sans vrai silence, impossible de distinguer le bruit du son
function quietContrast(d){
  const fr=Math.round(0.02*SR), n=Math.floor(d.length/fr), r=[];
  for(let k=0;k<n;k++){ let a=0; for(let i=k*fr;i<(k+1)*fr;i++) a+=d[i]*d[i]; r.push(Math.sqrt(a/fr)); }
  r.sort((x,y)=>x-y); if(!r.length) return 0;
  const p10=r[Math.floor(r.length*0.1)], p95=r[Math.floor(r.length*0.95)];
  return p10>0?p95/p10:1e9;
}
function denoiseTracks(list,level){
  if(recObj) return;
  const withSound=list.filter(t=>t.buf);
  const bass=withSound.filter(t=>t.kind==='bass');
  const cand=withSound.filter(t=>t.kind!=='bass');
  const ok=[], noQuiet=[];
  cand.forEach(t=>{ if(quietContrast(t.buf.getChannelData(0))<10) noQuiet.push(t); else ok.push(t); });
  const skipTxt=[];
  if(bass.length) skipTxt.push(bass.map(t=>'« '+t.name+' »').join(', ')+' (son généré, sans souffle)');
  if(noQuiet.length) skipTxt.push(noQuiet.map(t=>'« '+t.name+' »').join(', ')+' (pas de passage calme pour repérer le bruit)');
  if(!ok.length){ msg('Rien à nettoyer'+(skipTxt.length?' : '+skipTxt.join(' ; ')+'.':'.')); return; }
  pushHist();
  let gain=[];
  ok.forEach(t=>{
    const d=t.buf.getChannelData(0), before=noiseFloorRms(d);
    const y=denoiseData(d,level), after=noiseFloorRms(y);
    const keep=t.sel?{...t.sel}:null, nb=ctx.createBuffer(1,y.length,t.buf.sampleRate); nb.copyToChannel(y,0);
    t.buf=nb; t.sel=keep; if(masterTake&&masterTake.i===t.id) masterTake=null;
    drawWave(t); startSrc(t);
    if(before>0) gain.push(20*Math.log10(Math.max(after,1e-7)/before));
  });
  lockUI(); scheduleSave();
  const avg=gain.length?Math.round(-gain.reduce((a,b)=>a+b,0)/gain.length):0;
  msg('Bruit nettoyé sur '+ok.length+' piste'+(ok.length>1?'s':'')+' (souffle réduit d\'environ '+avg+' dB dans les silences)'+(skipTxt.length?'. Laissées intactes : '+skipTxt.join(' ; '):'')+'. ↶ pour revenir.');
}

// ---------- générateur de ligne de basse ----------
const NOTE_HUE=[0,22,42,64,105,150,175,198,222,258,290,325];
const NOTE_FR=['Do','Do♯','Ré','Ré♯','Mi','Fa','Fa♯','Sol','Sol♯','La','La♯','Si'];
// rythme (où tombent les notes) et mélodie (quelles notes) sont maintenant séparés
const RHYTHMS={
  noire:['Un coup par temps',[[0,.9,1],[1,.9,.8],[2,.9,.85],[3,.9,.8]]],
  croches:['Deux coups par temps',[[0,.45,1],[.5,.45,.7],[1,.45,.85],[1.5,.45,.7],[2,.45,.9],[2.5,.45,.7],[3,.45,.85],[3.5,.45,.7]]],
  doubles:['Quatre coups par temps (pulsation)',Array.from({length:16},(_,i)=>[i/4,.2,i%4===0?1:(i%2?.55:.75)])],
  funk:['Funk (syncopé)',[[0,.4,1],[.75,.2,.7],[1.5,.3,.85],[2,.4,.9],[2.75,.2,.7],[3.5,.4,.8]]],
  hiphop:['Hip-hop (notes longues)',[[0,1.3,1],[1.75,.5,.8],[2.5,1.2,.85]]],
  tenue:['Une note tenue par mesure',[[0,3.9,1]]]
};
const MELODIES={same:'Même note (celle du bloc)',oct:"Avec l'octave (aiguë une note sur deux)",fifth:'Avec la quinte (une note sur deux)',walk:'Marche (walking vers le bloc suivant)'};
const LEGACY_PAT={tonique:['noire','same'],octaves:['croches','oct'],marche:['noire','walk'],funk:['funk','oct'],hiphop:['hiphop','fifth'],pulse:['doubles','same']};
const BASS_TYPES={sub:'Sub (rond, très grave)',elec:'Électrique (pincée)',acid:'Acid (filtrée, nerveuse)',b808:'808 (grave qui chute)'};
function synthNote(out,st,dur,f,vel,type,f2){
  const L=out.length, rel=0.03, n=Math.round((dur+rel)*SR), gl=f2&&f2!==f?Math.log(f2/f):0;
  let ph=0, x1=0,x2=0,y1=0,y2=0, b0=0,b1=0,b2=0,a1=0,a2=0;
  for(let i=0;i<n;i++){
    const t=i/SR;
    let fr=gl?f*Math.exp(gl*Math.min(1,t/dur)):f;
    if(type==='b808') fr*=1+1.2*Math.exp(-t/0.025);
    ph+=fr/SR; ph-=Math.floor(ph);
    let v;
    if(type==='sub') v=Math.sin(2*Math.PI*ph)+0.15*Math.sin(4*Math.PI*ph);
    else if(type==='b808') v=Math.tanh(1.8*Math.sin(2*Math.PI*ph))*0.85;
    else v=2*ph-1;
    if(type==='elec'||type==='acid'){
      if(i%32===0){
        const fc=type==='acid'?300+2600*Math.exp(-t/0.12):450+1400*Math.exp(-t/0.08), Q=type==='acid'?7:0.9;
        const w0=2*Math.PI*Math.min(fc,SR*0.45)/SR, al=Math.sin(w0)/(2*Q), cs=Math.cos(w0), a0=1+al;
        b0=(1-cs)/2/a0; b1=(1-cs)/a0; b2=b0; a1=-2*cs/a0; a2=(1-al)/a0;
      }
      const y=b0*v+b1*x1+b2*x2-a1*y1-a2*y2; x2=x1; x1=v; y2=y1; y1=y; v=y*(type==='acid'?0.6:1);
    }
    const A=type==='elec'?0.003:0.006;
    let env=t<A?t/A:1;
    if(type==='elec') env*=Math.exp(-t/0.5);
    if(type==='b808') env*=Math.exp(-t/0.7);
    if(t>dur) env*=Math.max(0,1-(t-dur)/rel);
    out[(st+i)%L]+=v*env*vel*0.6;
  }
}
function defaultBass(nb){ return {rhy:'noire',mel:'same',type:'sub',len:1,beats:8,segs:[{s:0,e:nb||8,n:0,glide:false}]}; }
function nbOf(t){ return loopLen?beats:(+$('.bbeats',t.el).value||8); }
// les blocs couvrent toujours toute la boucle, sans trou ni chevauchement
function normSegs(segs,nb){
  let sg=(segs||[]).map(x=>({s:Math.round(+x.s||0),e:Math.round(+x.e||0),n:((Math.round(+x.n||0)%12)+12)%12,glide:!!x.glide})).filter(x=>x.e>x.s).sort((a,b)=>a.s-b.s);
  if(!sg.length) return [{s:0,e:nb,n:0,glide:false}];
  const tot=sg[sg.length-1].e;
  if(tot<nb&&tot>0&&nb%tot===0&&sg[0].s===0){ const base=sg.slice(); for(let k=1;k<nb/tot;k++) base.forEach(x=>sg.push({...x,s:x.s+k*tot,e:x.e+k*tot})); }
  sg=sg.filter(x=>x.s<nb);
  sg[0].s=0; for(let i=1;i<sg.length;i++) sg[i].s=sg[i-1].e;
  sg[sg.length-1].e=nb;
  return sg.filter(x=>x.e>x.s);
}
// anciens réglages (note + évolution + accords) → blocs sur la ligne de temps
function legacySegs(o,nb){
  const bars=Math.max(1,Math.ceil(nb/meter)), note=o.note||0;
  const prog=o.prog?(o.scale==='min'?[0,8,3,10]:[0,7,9,5]):[0];
  let d=(((o.evoNote??5)-note)%12+12)%12; if(d>6) d-=12;
  const evo=o.evo||'none', at=(o.evoAt!=null&&o.evoAt>0&&o.evoAt<nb)?o.evoAt:(evo==='glide'?(bars>1?(bars-1)*meter:nb/2):nb/2);
  const segs=[];
  for(let b=0;b<bars;b++){
    const s0=b*meter, e0=Math.min(nb,(b+1)*meter); if(s0>=nb) break;
    const base=((note+prog[b%prog.length])%12+12)%12, other=((base+d)%12+12)%12;
    if((evo==='half'||evo==='glide')&&at>s0&&at<e0){ segs.push({s:s0,e:at,n:base,glide:evo==='glide'}); segs.push({s:at,e:e0,n:other}); }
    else segs.push({s:s0,e:e0,n:(evo==='half'||evo==='glide')&&s0>=at?other:(evo==='alt'&&b%2===1?other:base)});
  }
  const merged=[]; segs.forEach(x=>{ const l=merged[merged.length-1]; if(l&&l.n===x.n&&!l.glide) l.e=x.e; else merged.push({...x}); });
  return merged;
}
function normBass(o,nb){
  const d=defaultBass(nb), r={...d,...(o||{})};
  if(o&&!o.rhy&&o.pat){ const m=LEGACY_PAT[o.pat]||['noire','same']; r.rhy=m[0]; r.mel=m[1]; }
  if(!RHYTHMS[r.rhy]) r.rhy='noire'; if(!MELODIES[r.mel]) r.mel='same';
  r.segs=normSegs(o&&o.segs?o.segs:(o&&o.note!=null?legacySegs(o,nb):d.segs),nb);
  return r;
}
function ensureDraft(t){ const nb=nbOf(t); if(!t.bdraft) t.bdraft=normBass(t.bass,nb); t.bdraft.segs=normSegs(t.bdraft.segs,nb); if((t.bsel||0)>=t.bdraft.segs.length) t.bsel=t.bdraft.segs.length-1; return t.bdraft; }
const rootOf=n=>n<=4?36+n:24+n;
const nearOct=(m,ref)=>{ while(m-ref>6) m-=12; while(ref-m>6) m+=12; return m; };
function bassEvents(o,nb){
  const segs=normSegs(o.segs,nb), rh=(RHYTHMS[o.rhy]||RHYTHMS.noire)[1], bars=Math.max(1,Math.ceil(nb/meter));
  const segAt=p=>{ for(let i=0;i<segs.length;i++) if(p>=segs[i].s&&p<segs[i].e) return i; return segs.length-1; };
  const raw=[];
  for(let b=0;b<bars;b++) for(const e of rh){ if(e[0]>=meter) continue; const pos=b*meter+e[0]; if(pos>=nb) continue; raw.push({pos,len:e[1]*(o.len||1),vel:e[2],si:segAt(pos)}); }
  const cnt=new Array(segs.length).fill(0); raw.forEach(r=>{ r.k=cnt[r.si]++; });
  // octave de chaque bloc : la plus proche du bloc précédent (la basse prend le chemin le plus court)
  const roots=[]; segs.forEach((x,i)=>{ let m=i?nearOct(rootOf(x.n),roots[i-1]):rootOf(x.n); while(m>52) m-=12; while(m<28) m+=12; roots.push(m); });
  return raw.map(r=>{
    const sg=segs[r.si], root=roots[r.si], ni=(r.si+1)%segs.length, nx=segs[ni], nroot=nearOct(roots[ni],root), last=r.k===cnt[r.si]-1;
    let iv=0;
    if(o.mel==='oct') iv=r.k%2?12:0;
    else if(o.mel==='fifth') iv=r.k%2?7:0;
    else if(o.mel==='walk') iv=(last&&cnt[r.si]>1)?nroot-1-root:[0,7,12][r.k%3];
    const len=Math.max(0.1,Math.min(r.len,sg.e-r.pos)), m=root+iv;
    const m2=(sg.glide&&last&&segs.length>1)?nroot+(iv===12?12:0):m;
    return {pos:r.pos,m,m2,len,vel:r.vel};
  });
}
function renderBass(o,L,nb){
  const bl=L/nb, out=new Float32Array(L), ev=bassEvents(o,nb);
  ev.forEach(e=>{ const f=440*Math.pow(2,(e.m-69)/12), f2=440*Math.pow(2,(e.m2-69)/12); synthNote(out,Math.round(e.pos*bl),Math.max(0.05,e.len*bl/SR),f,e.vel,o.type,f2); });
  let pk=0; for(let i=0;i<L;i++) pk=Math.max(pk,Math.abs(out[i]));
  if(pk>0){ const g=0.8/pk; for(let i=0;i<L;i++) out[i]*=g; }
  return {data:out,count:ev.length,events:ev};
}
function makeBass(o){ return renderBass(o,loopLen,beats); }
function readBassOpts(t){
  const el=t.el, d=ensureDraft(t);
  return {rhy:$('.brhy',el).value,mel:$('.bmel',el).value,type:$('.btype',el).value,len:+$('.blen',el).value,beats:+$('.bbeats',el).value,segs:d.segs.map(x=>({...x}))};
}
function showBassOpts(t){
  const el=t.el; t.bdraft=null; t.bsel=0;
  const o=normBass(t.bass,nbOf(t)); t.bdraft=o;
  $('.brhy',el).value=o.rhy; $('.bmel',el).value=o.mel; $('.btype',el).value=o.type; $('.blen',el).value=String(o.len); $('.bbeats',el).value=String(o.beats||8);
  drawBassTimeline(t);
}
function drawBassTimeline(t){
  const c=$('.btl',t.el); if(!c) return;
  const d=ensureDraft(t), segs=d.segs, nb=nbOf(t), sel=t.bsel||0, cur=segs[sel];
  $('.btlinfo',t.el).textContent=segs.map(x=>NOTE_FR[x.n]+(x.glide?' ↝':'')).join(' → ')+' · '+segs.length+' bloc'+(segs.length>1?'s':'');
  $('.bsn',t.el).value=String(cur.n); $('.bgl',t.el).checked=!!cur.glide; $('.bgl',t.el).disabled=segs.length<2;
  $('.bsplit',t.el).disabled=cur.e-cur.s<2; $('.bdel',t.el).disabled=segs.length<2;
  $('.bprevb',t.el).disabled=sel<=0; $('.bnextb',t.el).disabled=sel>=segs.length-1;
  t.el.querySelectorAll('.bpal button').forEach(b=>b.classList.toggle('on',+b.dataset.n===cur.n));
  $('.bselinfo',t.el).textContent='Bloc '+(sel+1)+' : temps '+(cur.s+1)+' → '+cur.e;
  $('.bgo',t.el).textContent=t.buf?'✓ Appliquer les changements':'✓ Créer la basse';
  const dpr=window.devicePixelRatio||1, w=Math.floor(c.clientWidth*dpr), hh=Math.floor(c.clientHeight*dpr); if(!w||!hh) return;
  c.width=w; c.height=hh;
  const g=c.getContext('2d'); g.clearRect(0,0,w,hh);
  const X=p=>p/nb*w, RH=Math.round(hh*0.32), by0=RH+4*dpr, by1=hh-4*dpr;
  // règle des temps (zone à toucher pour couper)
  g.fillStyle='rgba(255,255,255,.06)'; g.fillRect(0,0,w,RH);
  const step=(w/nb)<26*dpr?(meter):(1);
  g.textAlign='center'; g.textBaseline='middle'; g.font=Math.round(RH*0.48)+"px 'Barlow Condensed','Arial Narrow',sans-serif";
  for(let k=0;k<=nb;k++){
    g.fillStyle=k%meter===0?'rgba(255,255,255,.55)':'rgba(255,255,255,.22)';
    g.fillRect(X(k),k%meter===0?0:RH*0.55,1,k%meter===0?hh:RH*0.45);
    if(k<nb&&k%step===0){ g.fillStyle=k%meter===0?'rgba(255,255,255,.85)':'rgba(255,255,255,.5)'; g.fillText(String(k+1),X(k+0.5),RH*0.42); }
  }
  g.font=Math.round((by1-by0)*0.42)+"px 'Barlow Condensed','Arial Narrow',sans-serif";
  segs.forEach((x,i)=>{
    const x0=X(x.s)+2*dpr, x1=X(x.e)-2*dpr;
    g.fillStyle='hsl('+NOTE_HUE[x.n]+',70%,'+(i===sel?'52%':'38%')+')';
    if(g.roundRect){ g.beginPath(); g.roundRect(x0,by0,Math.max(2,x1-x0),by1-by0,8*dpr); g.fill(); } else g.fillRect(x0,by0,Math.max(2,x1-x0),by1-by0);
    if(i===sel){ g.strokeStyle='#fff'; g.lineWidth=2.5*dpr; if(g.roundRect){ g.beginPath(); g.roundRect(x0,by0,Math.max(2,x1-x0),by1-by0,8*dpr); g.stroke(); } else g.strokeRect(x0,by0,x1-x0,by1-by0); }
    g.fillStyle='#fff'; if(x1-x0>24*dpr) g.fillText(NOTE_FR[x.n]+(x.glide?' ↝':''),(x0+x1)/2,(by0+by1)/2);
    if(i<segs.length-1){ g.fillStyle='#FF8A00'; g.fillRect(X(x.e)-2*dpr,0,4*dpr,hh); g.font=Math.round(RH*0.5)+'px sans-serif'; g.fillText('✂',X(x.e),RH*0.42); g.font=Math.round((by1-by0)*0.42)+"px 'Barlow Condensed','Arial Narrow',sans-serif"; }
  });
}
function bassChanged(t,live){ drawBassTimeline(t); drawBassViz(t); if(live!==false&&preview&&preview.t===t) startPreview(t); }
function initBassTimeline(t){
  const c=$('.btl',t.el); let drag=null;
  const posAt=ev=>{ const r=c.getBoundingClientRect(); return clamp((ev.clientX-r.left)/(r.width||1),0,1)*nbOf(t); };
  const pick=p=>{ const segs=ensureDraft(t).segs, k=segs.findIndex(x=>p>=x.s&&p<x.e); t.bsel=k<0?segs.length-1:k; drawBassTimeline(t); };
  // un toucher sélectionne le bloc ; la limite orange ne bouge que si le doigt glisse vraiment
  const toggleCut=k=>{
    const d=ensureDraft(t), segs=d.segs, nb=nbOf(t);
    if(k<=0||k>=nb) return;
    const bi=segs.findIndex(x=>x.e===k);
    if(bi>=0&&bi<segs.length-1){ segs[bi].e=segs[bi+1].e; segs.splice(bi+1,1); t.bsel=bi; $('.bst',t.el).textContent='Coupe enlevée au temps '+(k+1)+'.'; }
    else { const i=segs.findIndex(x=>k>x.s&&k<x.e); if(i<0) return; const x=segs[i]; segs.splice(i+1,0,{s:k,e:x.e,n:x.n,glide:x.glide}); x.e=k; x.glide=false; t.bsel=i+1; $('.bst',t.el).textContent='Coupé au temps '+(k+1)+' : touche une note pour ce nouveau bloc.'; }
    bassChanged(t);
  };
  c.addEventListener('pointerdown',ev=>{
    const d=ensureDraft(t), segs=d.segs, nb=nbOf(t), p=posAt(ev), r=c.getBoundingClientRect(), px=nb/(r.width||1);
    if(r.height&&ev.clientY-(r.top||0)<r.height*0.32){ toggleCut(Math.round(p)); drag=null; return; }
    let bi=-1, best=1e9;
    for(let i=0;i<segs.length-1;i++){
      const tol=Math.min(Math.max(0.3,px*18),0.3*(segs[i].e-segs[i].s),0.3*(segs[i+1].e-segs[i+1].s));
      const dd=Math.abs(p-segs[i].e); if(dd<=tol&&dd<best){ best=dd; bi=i; }
    }
    drag={i:bi,x0:ev.clientX,p0:p,moved:false};
    try{ c.setPointerCapture(ev.pointerId); }catch(e){}
  });
  c.addEventListener('pointermove',ev=>{
    if(!drag) return;
    if(!drag.moved){ if(Math.abs(ev.clientX-drag.x0)<8||drag.i<0) return; drag.moved=true; }
    const segs=t.bdraft.segs, i=drag.i, v=clamp(Math.round(posAt(ev)),segs[i].s+1,segs[i+1].e-1);
    if(v!==segs[i].e){ segs[i].e=v; segs[i+1].s=v; bassChanged(t,false); }
  });
  const end=ev=>{ if(!drag) return; const d=drag; drag=null; if(d.moved) bassChanged(t); else pick(d.p0); };
  c.addEventListener('pointerup',end); c.addEventListener('pointercancel',()=>{ drag=null; });
  $('.bprevb',t.el).onclick=()=>{ t.bsel=Math.max(0,(t.bsel||0)-1); drawBassTimeline(t); };
  $('.bnextb',t.el).onclick=()=>{ t.bsel=Math.min(ensureDraft(t).segs.length-1,(t.bsel||0)+1); drawBassTimeline(t); };
  $('.bsn',t.el).onchange=e=>{ const d=ensureDraft(t); d.segs[t.bsel||0].n=+e.target.value; bassChanged(t); };
  t.el.querySelectorAll('.bpal button').forEach(b=>b.onclick=()=>{ const d=ensureDraft(t); d.segs[t.bsel||0].n=+b.dataset.n; bassChanged(t); $('.bst',t.el).textContent=''; });
  $('.bgl',t.el).onchange=e=>{ const d=ensureDraft(t); d.segs[t.bsel||0].glide=e.target.checked; bassChanged(t); };
  $('.bsplit',t.el).onclick=()=>{ const d=ensureDraft(t), i=t.bsel||0, x=d.segs[i]; if(x.e-x.s<2) return; const mid=Math.round((x.s+x.e)/2); d.segs.splice(i+1,0,{s:mid,e:x.e,n:x.n,glide:x.glide}); x.e=mid; x.glide=false; t.bsel=i+1; bassChanged(t); $('.bst',t.el).textContent='Bloc coupé : choisis la note du nouveau bloc, et fais glisser la limite orange pour régler sa durée.'; };
  $('.bdel',t.el).onclick=()=>{ const d=ensureDraft(t), i=t.bsel||0; if(d.segs.length<2) return; if(i>0){ d.segs[i-1].e=d.segs[i].e; d.segs.splice(i,1); t.bsel=i-1; } else { d.segs[1].s=0; d.segs.splice(0,1); t.bsel=0; } bassChanged(t); };
}
function drawBassViz(t){
  const c=$('.bviz',t.el); if(!c) return;
  const dpr=window.devicePixelRatio||1, w=Math.floor(c.clientWidth*dpr), hh=Math.floor(c.clientHeight*dpr);
  const o=readBassOpts(t), nb=nbOf(t), ev=bassEvents(o,nb);
  if(!w||!hh) return;
  c.width=w; c.height=hh;
  const g=c.getContext('2d'); g.clearRect(0,0,w,hh);
  let lo=99,hi=0; ev.forEach(e=>{ lo=Math.min(lo,e.m,e.m2); hi=Math.max(hi,e.m,e.m2); }); lo-=2; hi+=2; if(hi-lo<12){ const mid=(hi+lo)/2; lo=mid-6; hi=mid+6; }
  const X=p=>p/nb*w, Y=m=>hh-(m-lo)/(hi-lo)*hh;
  for(let k=0;k<=nb;k++){ g.fillStyle=k%meter===0?'rgba(128,128,128,.55)':'rgba(128,128,128,.2)'; g.fillRect(X(k),0,1,hh); }
  g.strokeStyle=t.color; g.lineWidth=Math.max(4,hh/16); g.lineCap='round';
  ev.forEach(e=>{ g.beginPath(); g.moveTo(X(e.pos)+3,Y(e.m)); g.lineTo(Math.max(X(e.pos)+4,X(Math.min(nb,e.pos+e.len))-3),Y(e.m2)); g.stroke(); });
}
// ----- aperçu : on écoute le motif sans rien enregistrer
let preview=null;
function stopPreview(restart){
  if(!preview) return;
  const p=preview; preview=null;
  try{ p.src.stop(); }catch(e){} try{ p.src.disconnect(); }catch(e){}
  if(restart!==false&&p.t.buf) startSrc(p.t);
  if(p.t.el) $('.bprev',p.t.el).textContent='▶ Aperçu';
}
function startPreview(t){
  stopPreview(false);
  const o=readBassOpts(t), nb=loopLen?beats:o.beats, L=loopLen||Math.round(nb*60/bpm*SR);
  const r=renderBass(o,L,nb), b=ctx.createBuffer(1,L,SR); b.copyToChannel(r.data,0);
  try{ ctx.resume(); }catch(e){}
  if(loopLen&&!running) startTransport(false);
  stopSrc(t); setLive(t,true);
  const s=ctx.createBufferSource(); s.buffer=b; s.loop=true; s.connect(t.inp);
  const when=Math.max(ctx.currentTime+0.03,loopLen?t0:0);
  s.start(when,loopLen&&when>t0?mod(when-t0,L/SR):0);
  preview={t,src:s};
  $('.bprev',t.el).textContent='■ Arrêter l\'aperçu';
  $('.bst',t.el).textContent=loopLen?'Aperçu calé sur ta boucle : change les réglages pour l\'entendre évoluer, puis valide.':'Aperçu seul (aucune boucle encore) : la boucle sera créée en validant.';
}
function genBass(t){
  if(recObj) return;
  const o=readBassOpts(t);
  stopPreview(false);
  pushHist();
  if(!loopLen){
    loopLen=Math.round(o.beats*60/bpm*SR); beats=o.beats; baseLen=loopLen; baseBeats=beats; rep=1; gridOff=0; masterTake=null;
    if(!running) t0=ctx.currentTime;
  }
  const r=makeBass(o);
  const b=ctx.createBuffer(1,loopLen,SR); b.copyToChannel(r.data,0);
  t.buf=b; t.sel=null; t.bass=JSON.parse(JSON.stringify(o));
  if(masterTake&&masterTake.i===t.id) masterTake=null;
  syncTrackUI(t); drawWave(t); startSrc(t); buildDots(); lockUI(); updLive(); scheduleSave();
  $('.bst',t.el).textContent=''; drawBassViz(t);
  msg('Ligne de basse créée : '+o.segs.map(x=>NOTE_FR[x.n]).join(' → ')+' · '+RHYTHMS[o.rhy][0].toLowerCase()+' · '+MELODIES[o.mel].split(' (')[0].toLowerCase()+' · son '+BASS_TYPES[o.type].split(' (')[0]+' ('+r.count+' notes).');
}
function addBassTrack(){
  const t=addTrack(); if(!t) return null;
  t.kind='bass'; t.bass=defaultBass(loopLen?beats:8); t.name=uniqueTrackName('Basse');
  $('.tn',t.el).textContent=t.name;
  setKindUI(t); showBassOpts(t);
  const b=$('.tbody',t.el); b.hidden=false; $('.tog',t.el).setAttribute('aria-expanded','true'); updFold();
  setTab(t,'bass'); drawBassTimeline(t); drawBassViz(t);
  try{ t.el.scrollIntoView({behavior:'smooth',block:'start'}); }catch(e){}
  updLive(); scheduleSave(true);
  msg('Piste de basse créée : choisis le motif, écoute l\'aperçu, puis « Créer la basse ».');
  return t;
}
// ----- onglets du menu de piste
function setTab(t,tab){
  if(tab==='bass'&&t.kind!=='bass') tab='son';
  t.tab=tab;
  t.el.querySelectorAll('.ttabs button').forEach(b=>b.classList.toggle('on',b.dataset.tab===tab));
  t.el.querySelectorAll('.pane').forEach(p=>p.hidden=p.dataset.pane!==tab);
  if(tab==='cut') drawTsel(t);
  if(tab==='bass'){ drawBassTimeline(t); drawBassViz(t); }
}
function setKindUI(t){
  const bass=t.kind==='bass';
  t.el.querySelectorAll('.reconly').forEach(e=>e.hidden=bass);
  $('.ttabs button[data-tab="bass"]',t.el).hidden=!bass;
  if(bass&&!t.tab) t.tab='bass';
  setTab(t,t.tab||(bass?'bass':'son'));
}
function quantizeTrack(t,q,strength){
  if(!t.buf||!loopLen||recObj) return;
  const src=t.buf.getChannelData(0), L=src.length;
  const on=detectOnsets(src,L).map(o=>o.n);
  if(!on.length){ msg('Aucun son net à recaler sur cette piste.'); return; }
  const g=L/(beats*q), pre=Math.round(0.01*SR), fo=Math.round(0.006*SR), fi=64, go=gridOff||0;
  const out=new Float32Array(L);
  for(let j=0;j<Math.max(0,on[0]-pre);j++) out[j]+=src[j];
  let maxSh=0, moved=0;
  for(let i=0;i<on.length;i++){
    const p=on[i], tgt=go+Math.round((p-go)/g)*g, sh=Math.round((tgt-p)*strength);
    if(Math.abs(sh)>Math.round(0.002*SR)) moved++;
    maxSh=Math.max(maxSh,Math.abs(sh));
    const a=Math.max(0,p-pre), z=i+1<on.length?Math.max(a+1,on[i+1]-pre):L;
    for(let j=a;j<z;j++){
      let v=src[j];
      if(i+1<on.length&&z-j<fo) v*=(z-j)/fo;
      if(a>0&&j-a<fi) v*=(j-a)/fi;
      out[mod(j+sh,L)]+=v;
    }
  }
  for(let j=0;j<L;j++) out[j]=clamp(out[j],-1,1);
  pushHist();
  const keep=t.sel?{...t.sel}:null;
  const nb=ctx.createBuffer(1,L,SR); nb.copyToChannel(out,0);
  t.buf=nb; t.sel=keep;
  if(masterTake&&masterTake.i===t.id) masterTake=null;
  drawWave(t); startSrc(t); lockUI(); scheduleSave();
  msg(moved?(moved+' son'+(moved>1?'s':'')+' recalé'+(moved>1?'s':'')+' (décalage max '+Math.round(maxSh/SR*1000)+' ms).'):'Les sons étaient déjà en place.');
}
function reverseTrack(t){
  if(!t.buf||recObj) return;
  pushHist();
  const src=t.buf.getChannelData(0), L=src.length, out=new Float32Array(L);
  for(let i=0;i<L;i++) out[i]=src[L-1-i];
  const keep=t.sel?{s:beats-t.sel.e,e:beats-t.sel.s}:null;
  const nb=ctx.createBuffer(1,L,SR); nb.copyToChannel(out,0);
  t.buf=nb; t.sel=keep;
  if(masterTake&&masterTake.i===t.id) masterTake=null;
  drawWave(t); startSrc(t); lockUI(); scheduleSave();
  msg('Piste « '+t.name+' » jouée à l\'envers (↶ pour revenir).');
}
function buildTrackUI(t){
  const el=document.createElement('div');
  el.className='card trk'; el.style.setProperty('--c',t.color);
  el.innerHTML=`<div class="row th"><button class="tog" aria-expanded="false" data-help="trk"><span class="chev">▸</span><span class="tn"></span><span class="flags"></span><span class="fxbadge"></span></button><button class="rec" aria-label="Enregistrer piste ${t.id+1}">● REC</button></div>
  <div class="wave"><canvas></canvas><i class="ph"></i><i class="mk"></i><span class="tag">vide</span></div>
  <div class="impbox" hidden><div class="imptxt"></div><div class="row wrap imbtns"></div></div>
  <div class="tbody" hidden>
  <div class="row" style="margin-top:12px"><span class="lbl" data-help="vol">Volume</span><input type="range" class="vol" min="0" max="1.2" step="0.01" value="${t.vol}" aria-label="Volume piste ${t.id+1}" style="flex:1"></div>
  <div class="row tb"><button class="m" aria-label="Muet">🔇 Muet</button><button class="s" aria-label="Solo">🎧 Solo</button></div>
  <div class="seg ttabs" style="margin-top:14px"><button data-tab="bass" hidden>🎸 Basse</button><button data-tab="son">🎚 Son</button><button data-tab="cut">✂ Découpe</button><button data-tab="fx">✨ Effets</button><button data-tab="trk">⚙ Piste</button></div>
  <div class="pane" data-pane="bass" hidden>
    <div class="row" style="margin-top:12px"><span class="lbl" data-help="btl">Notes sur la ligne de temps</span><span class="btlinfo lbl" style="margin-left:auto"></span></div>
    <p class="hint" style="margin:6px 0 0">✂ <b>Touche la règle</b> (les numéros de temps) pour couper à cet endroit, ou pour enlever une coupe. <b>Touche un bloc</b> pour le choisir, puis touche sa note ci-dessous.</p>
    <canvas class="btl" style="width:100%;height:104px;display:block;margin-top:8px;border-radius:10px;background:rgba(255,255,255,.05);touch-action:none"></canvas>
    <div class="row wrap"><button class="bprevb" aria-label="Bloc précédent" style="min-width:48px">◀</button><span class="bselinfo lbl"></span><button class="bnextb" aria-label="Bloc suivant" style="min-width:48px">▶</button></div>
    <div class="bpal">${NOTE_FR.map((n,i)=>`<button data-n="${i}" style="--h:${NOTE_HUE[i]}">${n}</button>`).join('')}</div>
    <select class="bsn" hidden aria-hidden="true">${NOTE_FR.map((n,i)=>`<option value="${i}">${n}</option>`).join('')}</select>
    <div class="row wrap"><label class="lbl" style="display:flex;align-items:center;gap:6px"><input type="checkbox" class="bgl" style="width:22px;height:22px"> glisser vers le bloc suivant</label><button class="bsplit">✂ Couper le bloc choisi en deux</button><button class="bdel">🗑 Retirer le bloc</button></div>
    <div class="row" style="margin-top:14px"><span class="lbl">Notes jouées</span></div>
    <canvas class="bviz" style="width:100%;height:84px;display:block;margin-top:6px;border-radius:10px;background:rgba(255,255,255,.05)"></canvas>
    <div class="row wrap"><span class="lbl w2" data-help="bass">Rythme</span><select class="brhy bopt" style="width:auto">${Object.keys(RHYTHMS).map(k=>`<option value="${k}">${RHYTHMS[k][0]}</option>`).join('')}</select></div>
    <div class="row wrap"><span class="lbl w2">Mélodie</span><select class="bmel bopt" style="width:auto">${Object.keys(MELODIES).map(k=>`<option value="${k}">${MELODIES[k]}</option>`).join('')}</select></div>
    <div class="row wrap"><span class="lbl w2">Son</span><select class="btype bopt" style="width:auto">${Object.keys(BASS_TYPES).map(k=>`<option value="${k}">${BASS_TYPES[k]}</option>`).join('')}</select><select class="blen bopt" style="width:auto"><option value="0.5">notes courtes</option><option value="1" selected>notes normales</option><option value="1.6">notes longues</option></select></div>
    <div class="row wrap bbrow"><span class="lbl w2">Longueur</span><select class="bbeats bopt" style="width:auto"><option value="4">4 temps</option><option value="8" selected>8 temps</option><option value="16">16 temps</option></select><span class="hint" style="margin:0">(si aucune boucle n'existe encore)</span></div>
    <div class="row wrap"><button class="bprev">▶ Aperçu</button><button class="bgo primary">✓ Créer la basse</button></div>
    <p class="hint bst"></p>
  </div>
  <div class="pane" data-pane="son">
    <div class="field"><div class="row"><span class="lbl" data-help="pan">Gauche ⇄ Droite</span><span class="pv val" style="margin-left:auto">Centre</span></div><input type="range" class="pan" min="-1" max="1" step="0.05" value="0" aria-label="Panoramique piste ${t.id+1}"></div>
    <div class="field"><div class="row"><span class="lbl" data-help="pitch">Hauteur du son (la note)</span><span class="ptv val" style="margin-left:auto">0 (son d'origine)</span></div>
      <input type="range" class="pitch" min="-12" max="12" step="1" value="0" aria-label="Hauteur piste ${t.id+1}">
      <div class="row wrap"><button class="p1">−1 octave</button><button class="p0">0</button><button class="p2">+1 octave</button><span class="pst lbl" style="margin-left:auto"></span></div></div>
    <div class="field"><div class="row"><span class="lbl" data-help="eq">Tonalité</span></div>
      <div class="seg eqp" style="margin-top:8px">${EQ_PRESETS.map(p=>`<button data-p="${p[0]}">${p[1]}</button>`).join('')}</div>
      <div class="row"><span class="lbl w2">Graves</span><input type="range" class="eq" data-b="0" min="-12" max="12" step="1" value="0" aria-label="Graves piste ${t.id+1}"><span class="val ev" style="width:60px;text-align:right">0 dB</span></div>
      <div class="row"><span class="lbl w2">Médiums</span><input type="range" class="eq" data-b="1" min="-12" max="12" step="1" value="0" aria-label="Médiums piste ${t.id+1}"><span class="val ev" style="width:60px;text-align:right">0 dB</span></div>
      <div class="row"><span class="lbl w2">Aigus</span><input type="range" class="eq" data-b="2" min="-12" max="12" step="1" value="0" aria-label="Aigus piste ${t.id+1}"><span class="val ev" style="width:60px;text-align:right">0 dB</span></div></div>
  </div>
  <div class="pane" data-pane="cut" hidden>
  <div class="field tsel" hidden><div class="row"><span class="lbl" data-help="tsel">Garder la partie propre</span><span class="tsl lbl" style="margin-left:auto"></span></div>
    <canvas class="tsc" style="width:100%;height:76px;display:block;margin-top:8px;border-radius:10px;background:rgba(255,255,255,.05);touch-action:none"></canvas>
    <div class="row wrap"><button class="ts1">◀ début</button><button class="ts2">début ▶</button><button class="ts3" style="margin-left:auto">◀ fin</button><button class="ts4">fin ▶</button></div>
    <div class="row"><button class="tsall">Tout garder</button></div>
    <div class="row" style="margin-top:14px"><span class="lbl" data-help="trep">Le reste de la piste</span><span class="trl lbl" style="margin-left:auto"></span></div>
    <div class="seg trep" style="margin-top:8px"><button data-m="mute">Silence</button><button data-m="loop">Répéter en boucle</button><button data-m="2">×2</button><button data-m="3">×3</button><button data-m="4">×4</button></div></div>
    <div class="field"><div class="row"><span class="lbl" data-help="quant">Recaler sur le rythme</span></div>
      <div class="row wrap" style="margin-top:6px"><select class="qgrid" style="width:auto" aria-label="Grille de recalage"><option value="1">sur les temps</option><option value="2" selected>sur les croches</option><option value="4">sur les doubles-croches</option></select><select class="qstr" style="width:auto" aria-label="Force du recalage"><option value="1">100 % (exact)</option><option value="0.75" selected>75 %</option><option value="0.5">50 % (naturel)</option></select><button class="qbtn">🎯 Recaler</button></div></div>
    <div class="field"><div class="row"><span class="lbl" data-help="fades">Fondus et sens</span></div>
      <div class="row wrap" style="margin-top:6px"><span class="lbl">Entrée</span><select class="fdi" style="width:auto" aria-label="Fondu d'entrée">${FADE_OPTS}</select><span class="lbl">Sortie</span><select class="fdo" style="width:auto" aria-label="Fondu de sortie">${FADE_OPTS}</select></div>
      <div class="row"><button class="revb">↔ Jouer à l'envers</button></div></div>
    <div class="field reconly"><div class="row"><span class="lbl" data-help="denoise">Nettoyer le bruit</span></div>
      <div class="row wrap" style="margin-top:6px"><select class="dnl" style="width:auto" aria-label="Force du nettoyage"><option value="light">Léger (silences)</option><option value="strong">Fort (aussi sous les sons)</option></select><button class="dnb">🧹 Nettoyer</button></div></div>
  </div>
  <div class="pane" data-pane="fx" hidden>
    <div class="field"><div class="row"><span class="lbl" data-help="fx">Effets (tu peux en empiler)</span></div>
      <div class="fxlist"></div>
      <div class="row"><button class="fxadd">+ Ajouter un effet</button></div></div>
  </div>
  <div class="pane" data-pane="trk" hidden>
  <div class="row reconly" style="margin-top:12px"><span class="lbl" data-help="src">Type de son</span><select class="srcsel" aria-label="Type de son piste ${t.id+1}" style="flex:1">${SRC_LIST.map(p=>`<option value="${p.id}">${p.name}</option>`).join('')}</select></div>
  <div class="row wrap reconly"><button class="imp" data-help="imp">⬆ Importer un fichier audio</button><input type="file" class="impfile" accept="audio/*,.mp3,.wav,.m4a,.ogg,.aac,.flac" hidden></div>
    <div class="field"><div class="row"><span class="lbl" data-help="tname">Nom et place de la piste</span></div>
      <div class="row" style="margin-top:6px"><input type="text" class="tnin" maxlength="24" style="flex:1" aria-label="Nom de la piste"><button class="tnok">Renommer</button></div>
      <div class="row wrap"><button class="tup">▲ Monter</button><button class="tdown">▼ Descendre</button><button class="tdup">⧉ Dupliquer</button></div></div>
    <div class="row wrap"><button class="x" data-help="clear">✕ Effacer</button></div>
    <div class="row"><button class="del" hidden>🗑 Supprimer cette piste</button></div>
  </div>
  </div>`;
  wrap.appendChild(el);
  $('.tn',el).textContent=t.name;
  t.el=el; t.canvas=$('canvas',el); t.ph=$('.ph',el); t.tag=$('.tag',el);
  attachHelp(el);
  $('.rec',el).onclick=()=>toggleRec(t.id);
  $('.vol',el).oninput=e=>{touchSettings();t.vol=+e.target.value;applyGains(t);scheduleSave(true);};
  $('.vol',el).onchange=commitSettings;
  $('.pan',el).onchange=commitSettings;
  $('.pan',el).oninput=e=>{touchSettings();t.panv=+e.target.value;$('.pv',el).textContent=panText(t.panv);applyGains(t);scheduleSave(true);};
  $('.m',el).onclick=()=>{touchSettings();t.mute=!t.mute;commitSettings();applyGains();updLive();scheduleSave(true);};
  $('.s',el).onclick=()=>{touchSettings();t.solo=!t.solo;commitSettings();applyGains();updLive();scheduleSave(true);};
  $('.imp',el).onclick=()=>{ try{ ctx.resume(); }catch(e){} $('.impfile',el).click(); };
  $('.impfile',el).onchange=e=>{ const f=e.target.files&&e.target.files[0]; e.target.value=''; if(f) importFile(t,f); };
  $('.wave',el).onclick=e=>{ const r=e.currentTarget.getBoundingClientRect(); if(!r.width) return; seekTo((e.clientX-r.left)/r.width,t); };
  $('.tog',el).onclick=()=>{ const b=$('.tbody',el); b.hidden=!b.hidden; $('.tog',el).setAttribute('aria-expanded',String(!b.hidden)); updFold(); if(!b.hidden) setTab(t,t.tab||(t.kind==='bass'?'bass':'son')); };
  el.querySelectorAll('.eq').forEach(r=>{ r.onchange=commitSettings; r.oninput=e=>{ touchSettings(); const k=+r.dataset.b; t.eqv[k]=+r.value; const nd=[t.eq.lo,t.eq.mid,t.eq.hi][k]; nd.gain.value=t.eqv[k]; r.parentElement.querySelector('.ev').textContent=dbText(t.eqv[k]); el.querySelectorAll('.eqp button').forEach(b=>{ const p=EQ_PRESETS.find(x=>x[0]===b.dataset.p); b.classList.toggle('on',p[2].every((v,j)=>v===t.eqv[j])); }); scheduleSave(true); }; });
  el.querySelectorAll('.eqp button').forEach(b=>{ b.onclick=()=>{ touchSettings(); setTimeout(commitSettings,0); const p=EQ_PRESETS.find(x=>x[0]===b.dataset.p); t.eqv=p[2].slice(); t.eq.lo.gain.value=t.eqv[0]; t.eq.mid.gain.value=t.eqv[1]; t.eq.hi.gain.value=t.eqv[2]; syncTrackUI(t); scheduleSave(true); }; });
  $('.pitch',el).oninput=e=>{ $('.ptv',el).textContent=pitchText(+e.target.value); };
  $('.pitch',el).onchange=e=>setPitch(t,+e.target.value);
  $('.p1',el).onclick=()=>setPitch(t,-12);
  $('.p0',el).onclick=()=>setPitch(t,0);
  $('.p2',el).onclick=()=>setPitch(t,12);
  $('.srcsel',el).onchange=e=>{ touchSettings(); t.srcType=e.target.value; commitSettings(); if(micStream&&!recObj) applyProfile(profOf(t.srcType)); scheduleSave(true); };
  $('.fxadd',el).onclick=()=>{ if(t.fxs.length>=MAXFX) return; t.fxs.push({type:'none',amt:0.5}); renderFx(t); };
  $('.x',el).onclick=()=>{ if(recObj&&recObj.i===t.id) cancelRec(); if(!t.buf) return; pushHist(); loopHist=null; t.prev=t.buf;t.buf=null;stopSrc(t);drawWave(t);lockUI();scheduleSave(); };
  const tsGet=()=>t.sel||{s:0,e:beats};
  $('.ts1',el).onclick=()=>{ const q=tsGet(); setTrackSel(t,q.s-1,q.e); };
  $('.ts2',el).onclick=()=>{ const q=tsGet(); setTrackSel(t,q.s+1,q.e); };
  $('.ts3',el).onclick=()=>{ const q=tsGet(); setTrackSel(t,q.s,q.e-1); };
  $('.ts4',el).onclick=()=>{ const q=tsGet(); setTrackSel(t,q.s,q.e+1); };
  $('.tsall',el).onclick=()=>setTrackSel(t,0,beats);
  el.querySelectorAll('.trep button').forEach(b=>b.onclick=()=>setSelMode(t,b.dataset.m));
  $('.del',el).onclick=()=>removeLastTrack();
  $('.dnb',el).onclick=()=>denoiseTracks([t],$('.dnl',el).value);
  $('.bgo',el).onclick=()=>genBass(t);
  $('.bprev',el).onclick=()=>{ if(preview&&preview.t===t) stopPreview(); else startPreview(t); };
  el.querySelectorAll('.bopt').forEach(x=>x.onchange=()=>bassChanged(t));
  initBassTimeline(t);
  el.querySelectorAll('.ttabs button').forEach(b=>b.onclick=()=>setTab(t,b.dataset.tab));
  $('.qbtn',el).onclick=()=>quantizeTrack(t,+$('.qgrid',el).value,+$('.qstr',el).value);
  $('.revb',el).onclick=()=>reverseTrack(t);
  $('.fdi',el).onchange=e=>{ touchSettings(); t.fadeIn=+e.target.value; commitSettings(); t.pc=null; startSrc(t); scheduleSave(true); };
  $('.fdo',el).onchange=e=>{ touchSettings(); t.fadeOut=+e.target.value; commitSettings(); t.pc=null; startSrc(t); scheduleSave(true); };
  $('.tnok',el).onclick=()=>renameTrack(t,$('.tnin',el).value);
  $('.tnin',el).onkeydown=e=>{ if(e.key==='Enter') renameTrack(t,e.target.value); };
  $('.tup',el).onclick=()=>moveTrack(t,-1);
  $('.tdown',el).onclick=()=>moveTrack(t,1);
  $('.tdup',el).onclick=()=>duplicateTrack(t);
  (()=>{
    const c=$('.tsc',el); let drag=null;
    const beatAt=ev=>{ const r=c.getBoundingClientRect(); return Math.round(clamp((ev.clientX-r.left)/(r.width||1),0,1)*beats); };
    const mv=ev=>{ if(!drag) return; const b=beatAt(ev); if(drag.which==='s') drag.s=clamp(b,0,drag.e-1); else drag.e=clamp(b,drag.s+1,beats); drawTsel(t,drag); };
    c.addEventListener('pointerdown',ev=>{ if(!t.buf||!loopLen) return; try{ c.setPointerCapture(ev.pointerId); }catch(e){} const q=tsGet(), b=beatAt(ev); drag={s:q.s,e:q.e,which:Math.abs(b-q.s)<=Math.abs(b-q.e)?'s':'e'}; mv(ev); });
    c.addEventListener('pointermove',mv);
    const end=()=>{ if(!drag) return; const d=drag; drag=null; setTrackSel(t,d.s,d.e); };
    c.addEventListener('pointerup',end); c.addEventListener('pointercancel',end);
  })();
  setKindUI(t);
  syncTrackUI(t);
}
// partie à répéter : la sélection « Garder la partie propre », sinon les temps qui contiennent du son
function partOf(t){
  if(!t.buf||!loopLen) return null;
  if(t.sel) return {s:t.sel.s,e:t.sel.e,auto:false};
  const d=t.buf.getChannelData(0), L=d.length, bl=L/beats, rms=[];
  for(let k=0;k<beats;k++){ let a=0; const i0=Math.round(k*bl), i1=Math.round((k+1)*bl); let pk=0; for(let i=i0;i<i1;i++){ a+=d[i]*d[i]; const v=Math.abs(d[i]); if(v>pk) pk=v; } rms.push(Math.max(Math.sqrt(a/Math.max(1,i1-i0)),pk*0.5)); }
  const mx=Math.max(...rms); if(mx<1e-4) return null;
  let s0=rms.findIndex(v=>v>mx*0.03), e0=beats-[...rms].reverse().findIndex(v=>v>mx*0.03);
  return {s:s0,e:e0,auto:true};
}
function updRepUI(t){
  const lab=$('.trl',t.el); if(!lab) return;
  const m=t.selMode||'mute', p=partOf(t), n=p?p.e-p.s:0;
  lab.textContent=t.sel?('partie : temps '+(t.sel.s+1)+' → '+t.sel.e):(p&&n<beats?'partie détectée : temps '+(p.s+1)+' → '+p.e:'');
  t.el.querySelectorAll('.trep button').forEach(b=>{
    const v=b.dataset.m;
    b.classList.toggle('on',t.sel?v===m:v==='mute');
    b.disabled=!t.buf||!loopLen||(v!=='mute'&&(!p||n<1||n>=beats))||(v!=='mute'&&v!=='loop'&&(+v)*n>beats);
  });
}
function setSelMode(t,m){
  if(!t.buf||!loopLen||recObj) return;
  touchSettings();
  if(!t.sel&&m!=='mute'){
    const p=partOf(t);
    if(!p||p.e-p.s>=beats){ H.pend=null; msg('Choisis d\'abord la partie à répéter avec les repères orange (elle doit être plus courte que la boucle).'); return; }
    t.sel={s:p.s,e:p.e};
  }
  t.selMode=m; commitSettings(); t.pc=null;
  startSrc(t); drawWave(t); drawTsel(t); scheduleSave(true);
  const P=t.sel?t.sel.e-t.sel.s:0;
  msg(m==='mute'?'Seule la partie choisie est jouée, le reste est en silence.':m==='loop'?'La partie de '+P+' temps se répète en continu sur toute la boucle.':'La partie de '+P+' temps est jouée '+m+' fois à la suite, puis silence.');
}
function setTrackSel(t,s,e){
  if(!t.buf||!loopLen) return;
  s=clamp(s,0,beats-1); e=clamp(e,1,beats);
  if(e-s<1) return;
  const ns=(s===0&&e===beats)?null:{s,e};
  if((!ns&&!t.sel)||(ns&&t.sel&&ns.s===t.sel.s&&ns.e===t.sel.e)){ drawTsel(t); return; }
  pushHist();
  t.sel=ns; t.pc=null; drawWave(t);
  startSrc(t); drawWave(t); drawTsel(t); scheduleSave(true);
}
function drawTsel(t,dr){
  const c=$('.tsc',t.el); if(!c) return;
  updRepUI(t);
  const q=dr||t.sel||{s:0,e:beats};
  $('.tsl',t.el).textContent=(q.s===0&&q.e===beats)?'Tout est gardé':'Temps '+(q.s+1)+' → '+q.e+' sur '+beats;
  if($('.tbody',t.el).hidden||$('.tsel',t.el).hidden) return;
  const dpr=window.devicePixelRatio||1, w=Math.floor(c.clientWidth*dpr), h=Math.floor(c.clientHeight*dpr); if(!w||!h) return;
  c.width=w; c.height=h;
  const g=c.getContext('2d'); g.clearRect(0,0,w,h);
  if(!t.buf) return;
  const d=t.buf.getChannelData(0), step=d.length/w; let mx=0.15; const pk=new Float32Array(w);
  for(let x=0;x<w;x++){ let m=0; const a=Math.floor(x*step), z=Math.min(d.length,Math.floor((x+1)*step)); for(let j=a;j<z;j+=8){ const v=Math.abs(d[j]); if(v>m) m=v; } pk[x]=m; if(m>mx) mx=m; }
  g.fillStyle='#9b968d';
  for(let x=0;x<w;x++){ const hh=Math.max(1,pk[x]/mx*h*0.85); g.fillRect(x,(h-hh)/2,1,hh); }
  for(let k=0;k<=beats;k++){ g.fillStyle=(k%4===0)?'rgba(128,128,128,.6)':'rgba(128,128,128,.25)'; g.fillRect(k/beats*w,0,1,h); }
  const sx=q.s/beats*w, ex=q.e/beats*w;
  if(!dr&&t.sel&&(t.selMode||'mute')!=='mute'){
    repCopies(t).slice(1).forEach(([cs,cl])=>{ const a0=(cs%beats)/beats*w, a1=a0+cl/beats*w; g.fillStyle='rgba(255,138,0,.10)'; g.fillRect(a0,0,Math.min(w,a1)-a0,h); if(a1>w) g.fillRect(0,0,a1-w,h); g.fillStyle='rgba(255,138,0,.5)'; g.fillRect(a0,0,1.5*dpr,h); });
  }
  g.fillStyle='rgba(255,138,0,.20)'; g.fillRect(sx,0,ex-sx,h);
  g.fillStyle='#FF8A00'; g.fillRect(sx-1.5*dpr,0,3*dpr,h); g.fillRect(ex-1.5*dpr,0,3*dpr,h);
}
function uniqueTrackName(base){ const n=new Set(tracks.map(x=>x.name)); if(!n.has(base)) return base; let k=2; while(n.has(base+' '+k)) k++; return base+' '+k; }
function renameTrack(t,v){
  v=String(v||'').trim().slice(0,24);
  if(!v||v===t.name){ $('.tnin',t.el).value=t.name; return; }
  touchSettings(); t.name=v; commitSettings();
  $('.tn',t.el).textContent=v; $('.tnin',t.el).value=v; updLive(); scheduleSave(true);
}
function reindexTracks(){
  tracks.forEach((x,k)=>{ x.id=k; wrap.appendChild(x.el); });
  if(masterTake&&masterTake.ref){ const k=tracks.indexOf(masterTake.ref); if(k>=0) masterTake.i=k; }
}
function moveTrack(t,dir){
  if(recObj){ msg("Impossible de déplacer une piste pendant un enregistrement."); return; }
  const i=tracks.indexOf(t), j=i+dir;
  if(j<0||j>=tracks.length) return;
  tracks[i]=tracks[j]; tracks[j]=t;
  reindexTracks(); updTrackBtns(); lockUI(); updLive(); scheduleSave();
  try{ t.el.scrollIntoView({block:'nearest'}); }catch(e){}
}
function duplicateTrack(t){
  if(recObj) return;
  if(tracks.length>=MAXTRACKS){ msg('Nombre maximum de pistes atteint ('+MAXTRACKS+').'); return; }
  pushHist();
  const n=addTrack(); if(!n) return;
  n.vol=t.vol; n.panv=t.panv; n.mute=t.mute; n.solo=false; n.srcType=t.srcType;
  n.fxs=t.fxs.map(f=>({type:f.type,amt:f.amt})); n.eqv=t.eqv.slice();
  n.eq.lo.gain.value=n.eqv[0]; n.eq.mid.gain.value=n.eqv[1]; n.eq.hi.gain.value=n.eqv[2];
  n.fadeIn=t.fadeIn; n.fadeOut=t.fadeOut; n.kind=t.kind; n.bass=t.bass?JSON.parse(JSON.stringify(t.bass)):null; setKindUI(n); if(n.bass) showBassOpts(n);
  n.name=uniqueTrackName(t.name+' copie'); $('.tn',n.el).textContent=n.name;
  n.buf=t.buf; n.sel=t.sel?{...t.sel}:null; n.selMode=t.selMode; n.pitch=t.pitch; if(t.pp&&t.pp.b===t.buf) n.pp=t.pp;
  tracks.splice(tracks.indexOf(n),1); tracks.splice(tracks.indexOf(t)+1,0,n);
  reindexTracks();
  setFx(n); syncTrackUI(n); drawWave(n); applyGains(n); startSrc(n);
  updTrackBtns(); lockUI(); updLive(); scheduleSave();
  msg('Piste dupliquée : « '+n.name+' ».');
}
// ---------- mode live ----------
function nextBoundary(){
  if(!running||liveQ==='now'||!loopLen) return null;
  const now=ctx.currentTime, unit=liveQ==='loop'?loopSec():Math.min(loopSec(),meter*beatDur());
  if(now<t0) return t0;
  return t0+Math.ceil((now+0.03-t0)/unit)*unit;
}
function scheduleMute(t,want,at){
  if(t.pendT){ clearTimeout(t.pendT); t.pendT=0; try{ t.gain.gain.cancelScheduledValues(Math.max(ctx.currentTime,t.pendAt-0.001)); }catch(e){} }
  t.pend=null;
  if(at==null){ touchSettings(); t.mute=want; commitSettings(); applyGains(); updLive(); scheduleSave(true); return; }
  const anySolo=tracks.some(x=>x.solo);
  const target=(!want&&(!anySolo||t.solo)&&t.vol>=0.004)?t.vol:0;
  if(target>0){ clearTimeout(t.offT); t.offT=0; setLive(t,true); }
  t.gain.gain.setTargetAtTime(target,at,0.004);
  t.pend=want; t.pendAt=at;
  t.pendT=setTimeout(()=>{ t.pendT=0; t.pend=null; touchSettings(); t.mute=want; commitSettings(); applyGains(t); updLive(); scheduleSave(true); },Math.max(0,(at-ctx.currentTime)*1000)+30);
  updLive();
}
function liveToggle(t){ if(!t.buf) return; const cur=t.pend!=null?t.pend:t.mute; scheduleMute(t,!cur,nextBoundary()); }
function launchScene(k){
  const sc=scenes[k]; if(!sc){ msg('Scène '+'ABCD'[k]+' vide : règle tes pistes puis « Mémoriser ».'); return; }
  const at=nextBoundary();
  sc.forEach(x=>{ if(tracks.includes(x.t)&&x.t.buf){ const cur=x.t.pend!=null?x.t.pend:x.t.mute; if(cur!==x.mute) scheduleMute(x.t,x.mute,at); } });
  msg('Scène '+'ABCD'[k]+(at?' au prochain départ':' lancée')+'.');
}
function storeScene(k){
  scenes[k]=tracks.filter(t=>t.buf).map(t=>({t,mute:t.pend!=null?t.pend:t.mute}));
  updLive(); scheduleSave(true); msg('Scène '+'ABCD'[k]+' mémorisée.');
}
function updLive(){
  const box=$('#live'); if(!box||box.hidden) return;
  const pads=$('#pads'); pads.innerHTML='';
  tracks.forEach(t=>{
    const b=document.createElement('button'); b.className='pad'; b.style.setProperty('--c',t.color);
    const on=!(t.pend!=null?t.pend:t.mute);
    if(!t.buf){ b.disabled=true; } else { b.classList.add(t.mute?'off':'on'); if(t.pend!=null) b.classList.add('wait'); }
    b.innerHTML='<span class="pn"></span><span class="ps"></span>';
    $('.pn',b).textContent=t.name;
    $('.ps',b).textContent=!t.buf?'vide':(t.pend!=null?(t.pend?'⏳ coupe bientôt':'⏳ entre bientôt'):(t.mute?'muet':'● en jeu'));
    b.setAttribute('aria-pressed',String(on&&!!t.buf));
    b.onclick=()=>liveToggle(t);
    pads.appendChild(b);
  });
  const sb=$('#scenes'); sb.innerHTML='';
  for(let k=0;k<4;k++){
    const r=document.createElement('div'); r.className='scrow';
    const sc=scenes[k];
    const desc=sc?sc.filter(x=>tracks.includes(x.t)&&!x.mute).map(x=>x.t.name).join(', ')||'tout coupé':'vide';
    r.innerHTML='<b>'+'ABCD'[k]+'</b><span class="scd"></span><button class="scl">▶ Lancer</button><button class="scm">● Mémoriser</button>';
    $('.scd',r).textContent=desc;
    $('.scl',r).onclick=()=>launchScene(k);
    $('.scm',r).onclick=()=>storeScene(k);
    sb.appendChild(r);
  }
  $('#lq').querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.q===liveQ));
}
$('#livebtn').onclick=()=>{ const l=$('#live'); l.hidden=!l.hidden; $('#livebtn').classList.toggle('on',!l.hidden); $('#livebtn').setAttribute('aria-expanded',String(!l.hidden)); updLive(); if(!l.hidden){ try{ l.scrollIntoView({behavior:'smooth',block:'start'}); }catch(e){} } };
$('#lq').onclick=e=>{ const b=e.target.closest('button'); if(!b) return; liveQ=b.dataset.q; updLive(); scheduleSave(true); };
function updTrackBtns(){
  const ab=$('#addbass'); if(ab) ab.disabled=tracks.length>=MAXTRACKS;
  $('#trkcount').textContent=tracks.length+' / '+MAXTRACKS;
  $('#addtrk').disabled=tracks.length>=MAXTRACKS;
}
function addTrack(){
  if(tracks.length>=MAXTRACKS) return null;
  const t=makeTrackNodes(tracks.length); tracks.push(t); buildTrackUI(t);
  applyGains(t); updTrackBtns(); updFold(); lockUI();
  return t;
}
function disposeTrack(t){
  stopSrc(t); clearTimeout(t.offT); clearTimeout(t.mkT);
  if(t.pjob){ t.pjob.cancel=true; t.pjob=null; }
  (t.fxn||[]).forEach(f=>f.dispose());
  [t.inp,t.eq.lo,t.eq.mid,t.eq.hi,t.gain,t.pan].forEach(n=>{ try{ if(n) n.disconnect(); }catch(e){} });
  if(t.el) t.el.remove();
}
function removeLastTrack(){
  const t=tracks[tracks.length-1];
  if(!t||tracks.length<=1||t.buf||(recObj&&recObj.i===t.id)) return;
  disposeTrack(t); tracks.pop();
  updTrackBtns(); updFold(); applyGains(); lockUI(); scheduleSave();
}
function updFold(){ const any=tracks.some(t=>!$('.tbody',t.el).hidden); $('#foldall').textContent=any?'Tout replier':'Tout déplier'; }
$('#foldall').onclick=()=>{ const any=tracks.some(t=>!$('.tbody',t.el).hidden); tracks.forEach(t=>{ $('.tbody',t.el).hidden=any; $('.tog',t.el).setAttribute('aria-expanded',String(!any)); if(!any) drawTsel(t); }); updFold(); };
$('#addbass').onclick=()=>addBassTrack();
$('#addtrk').onclick=()=>{ const t=addTrack(); if(t){ try{ t.el.scrollIntoView({behavior:'smooth',block:'center'}); }catch(e){} } };
addTrack();
attachHelp(document);
{ const f=document.querySelector('.foot'); if(f) f.textContent='LoopBox v'+APPVER+' · Movement Practice Bordeaux'; }
try{ const how=$('#how'); if(localStorage.getItem('lb_how')==='0') how.open=false; how.addEventListener('toggle',()=>{ try{ localStorage.setItem('lb_how',how.open?'1':'0'); }catch(e){} }); }catch(e){}

function drawWave(t){
  const c=t.canvas, dpr=window.devicePixelRatio||1;
  const w=c.clientWidth*dpr||300, h=c.clientHeight*dpr||38;
  c.width=w; c.height=h;
  const g=c.getContext('2d'); g.clearRect(0,0,w,h);
  if(!t.buf) return;
  const repd=!!(t.sel&&loopLen&&t.selMode&&t.selMode!=='mute');
  const d=(repd?playBuf(t):t.buf).getChannelData(0), bins=Math.floor(w/2), step=d.length/bins;
  const pk=[]; let mx=0.15;
  for(let i=0;i<bins;i++){ let m=0; const a=Math.floor(i*step), z=Math.floor((i+1)*step); for(let j=a;j<z;j+=4){ const v=Math.abs(d[j]); if(v>m)m=v; } pk.push(m); if(m>mx)mx=m; }
  g.fillStyle=t.color;
  for(let i=0;i<bins;i++){ const hh=Math.max(1,pk[i]/mx*h*0.9); g.fillRect(i*2,(h-hh)/2,1.5*dpr>2?2:1.5,hh); }
  if(t.sel&&loopLen&&!repd){ g.fillStyle='rgba(11,11,13,.7)'; const sx=t.sel.s/beats*w, ex=t.sel.e/beats*w; g.fillRect(0,0,sx,h); g.fillRect(ex,0,w-ex,h); }
}
function uiTrack(t,now){
  let st='empty', label=t.buf?'':'vide';
  if(recObj&&recObj.i===t.id){
    if(now<recObj.tp){ st='armed'; label='Décompte '+Math.max(1,Math.ceil((recObj.tp-now)/beatDur())); }
    else if(recObj.stopT!==null){ st='rec'; label='Finalisation…'; }
    else{ st='rec'; label='● REC '+(now-recObj.tp).toFixed(1)+' s'+(recObj.master?' · ■ pour fermer la boucle':''); }
  } else if(t.buf) st='ready';
  const cls='card trk '+st+(t.kind==='bass'?' kbass':'');
  if(t.cache.cls!==cls){ t.el.className=cls; t.cache.cls=cls; }
  if(t.cache.label!==label){ t.tag.textContent=label; t.cache.label=label; }
  const rb=$('.rec',t.el), rtxt=(recObj&&recObj.i===t.id)?'■ STOP':'● REC';
  if(t.cache.rtxt!==rtxt){ rb.textContent=rtxt; t.cache.rtxt=rtxt; }
  const fl=(t.mute?'🔇':'')+(t.solo?'🎧':'');
  if(t.cache.fl!==fl){ $('.flags',t.el).textContent=fl; t.cache.fl=fl; }
  $('.m',t.el).classList.toggle('on',t.mute);
  $('.s',t.el).classList.toggle('on',t.solo);
  $('.x',t.el).disabled=!t.buf&&st==='empty';
}

// ---------- contrôles ----------
function buildDots(){
  const d=$('#dots'); d.innerHTML=''; dotsN=loopLen?beats:meter;
  for(let i=0;i<dotsN;i++){ const e=document.createElement('i'); if(i%meter===0&&i>0) e.className='g'; d.appendChild(e); }
}
function updBpm(){
  if(loopLen){ const real=beats*60/loopSec(); $('#bpmv').textContent=real.toFixed(1).replace('.',','); $('#bpm').value=clamp(Math.round(real),60,160); }
  else{ $('#bpmv').textContent=bpm; $('#bpm').value=bpm; }
}
function lockUI(){
  if(loopLen&&!tracks.some(t=>t.buf)&&!recObj){
    lastLoop={loopLen,beats}; loopLen=0; beats=4; masterTake=null; baseLen=0; baseBeats=4; rep=1; loopHist=null;
    if(running){ t0=ctx.currentTime+0.05; nextBeat=0; }
    buildDots();
  }
  const locked=!!loopLen||!!recObj;
  $('#bpm').disabled=locked; $('#snap').disabled=locked;
  const h=$('#lockhint');
  if(loopLen){ h.style.display='block'; h.textContent='Boucle : '+beats+' temps à '+(beats*60/loopSec()).toFixed(1).replace('.',',')+' BPM'+(masterTake&&masterTake.det?', calée sur ton jeu':'')+'. Pour refaire la boucle de base, efface toutes les pistes (✕).'+(!masterTake?' Le cadre pour couper la prise n\'apparaît qu\'après un nouvel enregistrement de base, avec « Auto-caler le beat » actif.':(tracks.filter(t=>t.buf).length>1?' Efface les autres pistes pour recouper la prise de base.':'')); }
  else h.style.display='none';
  const ed=!!(masterTake&&masterTake.T&&loopLen&&!recObj&&tracks.filter(t=>t.buf).length===1&&tracks[masterTake.i].buf);
  $('#editor').style.display=ed?'block':'none';
  if(ed) drawEditor();
  const gr=!!(loopLen&&!recObj);
  $('#grow').style.display=gr?'block':'none';
  if(gr){
    $('#growb').querySelectorAll('button').forEach(b=>{ const k=+b.dataset.k; b.classList.toggle('on',k===rep); b.disabled=baseLen*k>MAXLOOP*SR; });
    $('#growlbl').textContent=beats+' temps'+(rep>1?' (×'+rep+')':'');
  }
  updBpm();
  tracks.forEach(t=>{ t.fxn.forEach(f=>f.set(f.slot.amt,beatDur())); });
  checkMem();
  tracks.forEach(t=>{ const r=$('.bbrow',t.el); if(r) r.hidden=!!loopLen; });
  updTempoRow();
  updLive();
  tracks.forEach((t,i)=>{
    const showSel=!!(t.buf&&loopLen&&!(ed&&masterTake&&masterTake.i===t.id));
    $('.tsel',t.el).hidden=!showSel;
    if(showSel) drawTsel(t);
    $('.del',t.el).hidden=!(i===tracks.length-1&&tracks.length>1&&!t.buf&&!(recObj&&recObj.i===t.id));
  });
}
function playFrom(p){
  try{ ctx.resume(); }catch(e){}
  if(!running) startTransport(false);
  t0=ctx.currentTime+0.06-p;
  nextBeat=Math.ceil((ctx.currentTime+0.15-t0)/beatDur());
  tracks.forEach(startSrc);
}
function seekTo(frac,t){
  if(!loopLen){ msg("Enregistre ou importe d'abord une boucle."); return; }
  if(recObj){ msg("Impossible de changer de position pendant un enregistrement."); return; }
  msg('');
  const L=loopSec();
  let k=Math.round(clamp(frac,0,1)*beats); if(k>=beats) k=0;
  playFrom(k/beats*L);
  (t?[t]:tracks).forEach(x=>{ const mk=$('.mk',x.el); mk.style.left=(k/beats*100)+'%'; mk.style.opacity=1; clearTimeout(x.mkT); x.mkT=setTimeout(()=>{ mk.style.opacity=0; },700); });
}
function pauseTransport(){
  if(!running||recObj) return;
  const now=ctx.currentTime;
  const p=(loopLen&&now>=t0)?mod(now-t0,loopSec()):0;
  stopTransport();
  paused=true; pausePos=p; setPlayIcon();
}
function resumeTransport(){
  if(recObj||running) return;
  if(paused&&loopLen){ const p=mod(pausePos,loopSec()); paused=false; playFrom(p); }
  else { paused=false; startTransport(false); }
}
function stopAll(){
  if(recObj){ if(ctx.currentTime<recObj.tp) cancelRec(); else stopRec(); return; }
  stopTransport();
}
const onPlay=async()=>{
  try{ await ctx.resume(); }catch(e){}
  if(recObj){ stopAll(); return; }
  if(running) pauseTransport(); else resumeTransport();
};
$('#play').onclick=onPlay;
$('#dplay').onclick=async()=>{ try{ await ctx.resume(); }catch(e){} if(!recObj&&!running) resumeTransport(); };
$('#dpause').onclick=async()=>{ try{ await ctx.resume(); }catch(e){} if(recObj) return; if(running) pauseTransport(); else if(paused) resumeTransport(); };
$('#dstop').onclick=()=>stopAll();
$('.dprog').onclick=e=>{ const r=e.currentTarget.getBoundingClientRect(); if(!r.width) return; seekTo((e.clientX-r.left)/r.width,null); };
$('#bpm').oninput=e=>{
  bpm=+e.target.value; $('#bpmv').textContent=bpm;
  if(running&&!loopLen&&!recObj){ t0=ctx.currentTime+0.05; nextBeat=0; }
  scheduleSave(true);
};
$('#snap').onclick=e=>{ snap=!snap; e.target.classList.toggle('on',snap); scheduleSave(true); };
$('#mix').onclick=e=>{ mixMode=!mixMode; e.target.textContent='Prise : '+(mixMode?'ajoute':'remplace'); e.target.classList.toggle('on',mixMode); scheduleSave(true); };
function showMetroUI(){
  $('#mvolume').value=metroVol; metroGain.gain.value=0.6*metroVol;
  $('#msubseg').querySelectorAll('button').forEach(b=>b.classList.toggle('on',+b.dataset.v===metroSub));
  $('#meterseg').querySelectorAll('button').forEach(b=>b.classList.toggle('on',+b.dataset.v===meter));
}
$('#mvolume').oninput=e=>{ metroVol=+e.target.value; metroGain.gain.value=0.6*metroVol; scheduleSave(true); };
$('#msubseg').onclick=e=>{ const b=e.target.closest('button'); if(!b) return; metroSub=+b.dataset.v; showMetroUI(); scheduleSave(true); };
$('#meterseg').onclick=e=>{ const b=e.target.closest('button'); if(!b) return; meter=+b.dataset.v; showMetroUI(); buildDots(); lockUI(); scheduleSave(true); };
document.querySelectorAll('.tstep').forEach(b=>b.onclick=()=>{ if(tempoTarget==null) tempoTarget=Math.round(curBpm()); tempoTarget=clamp(tempoTarget+(+b.dataset.d),40,240); updTempoRow(); });
$('#tapply').onclick=()=>changeTempo(tempoTarget);
$('#dnallb').onclick=()=>{ if(!tracks.some(t=>t.buf)){ msg('Aucune piste à nettoyer.'); return; } denoiseTracks(tracks,$('#dnall').value); };
$('#metro').onclick=e=>{ metroOn=!metroOn; e.target.classList.toggle('on',metroOn); };
$('#mvol').onchange=commitSettings;
$('#mvol').oninput=e=>{ touchSettings(); mvol=+e.target.value; chain.vol.gain.value=mvol; scheduleSave(true); };
function showFin(){ $('#finseg').querySelectorAll('button').forEach(b=>b.classList.toggle('on',+b.dataset.l===fin)); }
$('#finseg').onclick=e=>{ const b=e.target.closest('button'); if(!b) return; touchSettings(); fin=+b.dataset.l; commitSettings(); chain.setFin(fin); showFin(); scheduleSave(true); };
$('#ingain').oninput=e=>{ ingain=+e.target.value; $('#ingv').textContent=ingain.toFixed(1)+'×'; if(inGainNode) inGainNode.gain.value=ingain*(curProf?curProf.mul:1); scheduleSave(true); };
$('#norm').onclick=e=>{ normOn=!normOn; e.target.classList.toggle('on',normOn); scheduleSave(true); };
function showComp(){ $('#comp').value=Math.round(comp*1000); $('#compv').textContent=Math.round(comp*1000)+'ms'; }
function setupDefault(id){ const sp=lats.speaker!=null?lats.speaker:comp; return id==='bt'?Math.min(0.8,sp+0.2):sp; }
function showSetupUI(){
  $('#setupseg').querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.s===setup));
  const v=lats[setup], d=latAt[setup];
  $('#setuphint').textContent=SETUPS[setup]+' : latence '+Math.round(comp*1000)+' ms '+(v!=null&&d?'(mesurée le '+new Date(d).toLocaleDateString('fr-FR')+')':'(estimation, pas encore mesurée)')+'. '+
    (setup==='speaker'?'Utilise « Calibrer automatiquement ».':setup==='ext'?'Choisis ton micro dans la liste, puis « Calibrer en tapant » (avec casque) ou « Calibrer automatiquement » (sans casque).':'Branche ton casque puis « Calibrer en tapant ».');
  $('#cal').hidden=setup==='wired'||setup==='bt';
  $('#caltap').hidden=setup==='speaker';
}
function selectSetup(id){
  if(!SETUPS[id]) return;
  setup=id; comp=lats[id]!=null?lats[id]:setupDefault(id);
  showComp(); showSetupUI(); scheduleSave(true);
  msg('Configuration « '+SETUPS[id]+' » : latence '+Math.round(comp*1000)+' ms'+(lats[id]==null?' (estimation, pense à calibrer).':'.'));
}
$('#setupseg').onclick=e=>{ const b=e.target.closest('button'); if(b) selectSetup(b.dataset.s); };
$('#micsel').onchange=e=>{ micId=e.target.value; scheduleSave(true); reopenMic(); };
$('#comp').oninput=e=>{ comp=(+e.target.value)/1000; lats[setup]=comp; $('#compv').textContent=e.target.value+'ms'; showSetupUI(); scheduleSave(true); };
let clearTimer=null;
$('#clearAll').onclick=e=>{
  const b=e.target;
  if(b.dataset.arm!=='1'){ b.dataset.arm='1'; b.textContent='Confirmer l\'effacement ?'; clearTimeout(clearTimer); clearTimer=setTimeout(()=>{b.dataset.arm='0';b.textContent='Tout effacer';},3000); return; }
  b.dataset.arm='0'; b.textContent='Tout effacer'; clearTimeout(clearTimer);
  if(recObj) cancelRec();
  if(tracks.some(t=>t.buf)) pushHist();
  tracks.forEach(t=>{ stopSrc(t); t.buf=null; t.prev=null; drawWave(t); });
  lastLoop=null; loopHist=null; lockUI(); scheduleSave();
};

// ---------- calibration ----------
$('#cal').onclick=async()=>{
  const out=$('#calmsg');
  if(recObj) cancelRec();
  if(running) stopTransport();
  if(!(await ensureMic())) return;
  applyProfile(profOf('beatbox'));
  out.textContent='Mesure en cours… reste silencieux, sans casque.';
  const c0=ctx.currentTime+0.6, times=[0,1,2,3,4,5].map(j=>c0+j*0.6);
  times.forEach(tt=>{
    const o=ctx.createOscillator(), g=ctx.createGain(); o.type='square'; o.frequency.value=2000;
    g.gain.setValueAtTime(0.9,tt); g.gain.exponentialRampToValueAtTime(0.001,tt+0.03);
    o.connect(g); g.connect(ctx.destination); o.start(tt); o.stop(tt+0.05);
  });
  cap={blocks:[],check:null};
  await waitCtx(times[5]+0.6);
  const blocks=cap?cap.blocks:[]; cap=null;
  const offs=[];
  for(const ts of times){
    const s=Math.round((ts-0.03-base)*SR), e=s+Math.round(0.45*SR);
    const x=gather(blocks,s,e);
    let pk=0; for(let i=0;i<x.length;i++){ const v=Math.abs(x[i]); if(v>pk) pk=v; }
    if(pk<0.02) continue;
    const thr=Math.max(0.01,pk*0.35);
    let idx=-1; for(let i=0;i<x.length;i++){ if(Math.abs(x[i])>thr){ idx=i; break; } }
    if(idx>=0) offs.push((ts-0.03+idx/SR)-ts);
  }
  if(offs.length<3){ out.textContent='Pas assez de signal capté. Monte le volume, retire le casque, rapproche le téléphone de toi, puis réessaie. Sinon règle à la main.'; return; }
  offs.sort((a,b)=>a-b);
  const med=offs[Math.floor(offs.length/2)];
  const v=clamp(med,0,0.8), target=setup==='ext'?'ext':'speaker';
  lats[target]=v; latAt[target]=Date.now();
  if(setup===target){ comp=v; showComp(); }
  showSetupUI();
  out.textContent='Latence mesurée ('+SETUPS[target]+') : '+Math.round(med*1000)+' ms ('+offs.length+'/6 clics exploitables). Fais un test d\'enregistrement pour vérifier à l\'oreille.';
  scheduleSave(true);
};
async function waitCtx(t){ const lim=Date.now()+20000; while(ctx.currentTime<t&&Date.now()<lim) await sleep(40); }
// Calibration en tapant : tu entends des clics dans le casque et tu tapes dessus ; le micro enregistre tes frappes.
// Le retard mesuré comprend tout : casque (Bluetooth compris), micro, et ta façon de jouer sur le temps.
$('#caltap').onclick=async()=>{
  const out=$('#calmsg');
  if(recObj) cancelRec();
  if(running) stopTransport();
  if(!(await ensureMic())) return;
  applyProfile(profOf('perc'));
  const iv=0.75, n=12, c0=ctx.currentTime+0.8, times=[];
  for(let j=0;j<n;j++) times.push(c0+j*iv);
  times.forEach((tt,j)=>{
    const o=ctx.createOscillator(), g=ctx.createGain(); o.type='square'; o.frequency.value=j%4===0?1500:1000;
    g.gain.setValueAtTime(0.0001,tt); g.gain.exponentialRampToValueAtTime(0.6,tt+0.002); g.gain.exponentialRampToValueAtTime(0.0001,tt+0.05);
    o.connect(g); g.connect(ctx.destination); o.start(tt); o.stop(tt+0.07);
  });
  out.textContent='Écoute les clics dans ton casque : les 4 premiers sont un décompte, puis tape sur la table (ou fais « pa ») pile sur les 8 suivants…';
  cap={blocks:[],check:null};
  await waitCtx(times[n-1]+0.9);
  const blocks=cap?cap.blocks:[]; cap=null;
  const t0w=c0-0.2, s0=Math.round((t0w-base)*SR), e0=Math.round((times[n-1]+0.9-base)*SR);
  const x=gather(blocks,s0,e0);
  const on=detectOnsets(x,x.length).map(o=>t0w+o.n/SR);
  const offs=[];
  for(let j=4;j<n;j++){ const tt=times[j]; const hit=on.find(t=>t-tt>-0.12&&t-tt<0.65); if(hit!=null) offs.push(hit-tt); }
  if(offs.length<5){ out.textContent='Seulement '+offs.length+' frappe'+(offs.length>1?'s':'')+' sur 8 détectée'+(offs.length>1?'s':'')+'. Tape plus fort, rapproche la tablette ou monte le gain micro, puis réessaie.'; return; }
  offs.sort((a,b)=>a-b);
  const med=offs[Math.floor(offs.length/2)], spread=(offs[offs.length-1]-offs[0])/2;
  const v=clamp(med,0,0.8);
  lats[setup]=v; latAt[setup]=Date.now(); comp=v; showComp(); showSetupUI();
  out.textContent='Latence mesurée ('+SETUPS[setup]+') : '+Math.round(med*1000)+' ms ('+offs.length+'/8 frappes, régularité ±'+Math.round(spread*1000)+' ms)'+(spread>0.08?'. Tes frappes étaient assez irrégulières : refais-la pour plus de précision.':'. Fais un test d\'enregistrement pour vérifier à l\'oreille.');
  scheduleSave(true);
};

// ---------- export ----------
const crcT=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function crc32(u8){let c=-1;for(let i=0;i<u8.length;i++)c=crcT[(c^u8[i])&255]^(c>>>8);return (c^-1)>>>0;}
function wav16(ab){
  const n=ab.length, sr=ab.sampleRate, L=ab.getChannelData(0), R=ab.numberOfChannels>1?ab.getChannelData(1):L;
  let pk=0; for(let i=0;i<n;i++){ pk=Math.max(pk,Math.abs(L[i]),Math.abs(R[i])); }
  const g=pk>0.98?0.98/pk:1;
  const buf=new ArrayBuffer(44+n*4), v=new DataView(buf);
  const w=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));};
  w(0,'RIFF'); v.setUint32(4,36+n*4,true); w(8,'WAVE'); w(12,'fmt '); v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,2,true);
  v.setUint32(24,sr,true); v.setUint32(28,sr*4,true); v.setUint16(32,4,true); v.setUint16(34,16,true); w(36,'data'); v.setUint32(40,n*4,true);
  let o=44;
  for(let i=0;i<n;i++){ v.setInt16(o,Math.round(clamp(L[i]*g,-1,1)*32767),true); v.setInt16(o+2,Math.round(clamp(R[i]*g,-1,1)*32767),true); o+=4; }
  return new Uint8Array(buf);
}
function makeZip(name,data){
  const nb=new TextEncoder().encode(name), crc=crc32(data), sz=data.length;
  const lh=new DataView(new ArrayBuffer(30));
  lh.setUint32(0,0x04034b50,true); lh.setUint16(4,20,true); lh.setUint16(6,0x0800,true); lh.setUint16(8,0,true); lh.setUint16(10,0,true); lh.setUint16(12,0x21,true);
  lh.setUint32(14,crc,true); lh.setUint32(18,sz,true); lh.setUint32(22,sz,true); lh.setUint16(26,nb.length,true); lh.setUint16(28,0,true);
  const cd=new DataView(new ArrayBuffer(46));
  cd.setUint32(0,0x02014b50,true); cd.setUint16(4,20,true); cd.setUint16(6,20,true); cd.setUint16(8,0x0800,true); cd.setUint16(10,0,true); cd.setUint16(12,0,true); cd.setUint16(14,0x21,true);
  cd.setUint32(16,crc,true); cd.setUint32(20,sz,true); cd.setUint32(24,sz,true); cd.setUint16(28,nb.length,true);
  const en=new DataView(new ArrayBuffer(22));
  en.setUint32(0,0x06054b50,true); en.setUint16(8,1,true); en.setUint16(10,1,true); en.setUint32(12,46+nb.length,true); en.setUint32(16,30+nb.length+sz,true);
  return new Blob([lh,nb,data,cd,nb,en],{type:'application/zip'});
}
function makeZipMulti(files){
  const parts=[], central=[]; let off=0;
  for(const f of files){
    const nb=new TextEncoder().encode(f.name), crc=crc32(f.data), sz=f.data.length;
    const lh=new DataView(new ArrayBuffer(30));
    lh.setUint32(0,0x04034b50,true); lh.setUint16(4,20,true); lh.setUint16(6,0x0800,true); lh.setUint16(8,0,true); lh.setUint16(10,0,true); lh.setUint16(12,0x21,true);
    lh.setUint32(14,crc,true); lh.setUint32(18,sz,true); lh.setUint32(22,sz,true); lh.setUint16(26,nb.length,true); lh.setUint16(28,0,true);
    parts.push(lh,nb,f.data);
    const cd=new DataView(new ArrayBuffer(46));
    cd.setUint32(0,0x02014b50,true); cd.setUint16(4,20,true); cd.setUint16(6,20,true); cd.setUint16(8,0x0800,true); cd.setUint16(10,0,true); cd.setUint16(12,0,true); cd.setUint16(14,0x21,true);
    cd.setUint32(16,crc,true); cd.setUint32(20,sz,true); cd.setUint32(24,sz,true); cd.setUint16(28,nb.length,true); cd.setUint32(42,off,true);
    central.push(cd,nb);
    off+=30+nb.length+sz;
  }
  const cdSize=central.reduce((acc,x)=>acc+x.byteLength,0);
  const en=new DataView(new ArrayBuffer(22));
  en.setUint32(0,0x06054b50,true); en.setUint16(8,files.length,true); en.setUint16(10,files.length,true); en.setUint32(12,cdSize,true); en.setUint32(16,off,true);
  return new Blob([...parts,...central,en],{type:'application/zip'});
}
async function renderMix(opt){
  opt=opt||{};
  await new Promise(r=>setTimeout(r,30));
  tracks.forEach(t=>ensurePitchSync(t));
  const reps=opt.reps||+$('#reps').value, LS=loopLen;
  const off=new OfflineAudioContext(2,LS*reps,SR);
  const ch=makeChain(off); ch.vol.gain.value=mvol; ch.setFin(opt.only?0:fin); ch.out.connect(off.destination);
  const anySolo=tracks.some(t=>t.solo);
  tracks.forEach(t=>{
    if(!t.buf) return;
    if(opt.only){ if(t!==opt.only) return; }
    else if(t.mute||(anySolo&&!t.solo)) return;
    const s=off.createBufferSource(); s.buffer=playBuf(t); s.loop=true;
    const g=off.createGain(); g.gain.value=t.vol;
    let dest=ch.inp;
    if(off.createStereoPanner){ const p=off.createStereoPanner(); p.pan.value=t.panv; p.connect(ch.inp); dest=p; }
    g.connect(dest);
    const q=makeEq(off,t.eqv); s.connect(q.inp);
    let prev=q.out;
    t.fxs.forEach(sl=>{ if(sl.type==='none') return; const f=makeFx(off,sl.type,sl.amt,beatDur()); prev.connect(f.inp); prev=f.out; });
    prev.connect(g);
    s.start(0);
  });
  const r=await off.startRendering();
  if(opt.fadeEnd){
    const n=r.length, fl=Math.min(n,Math.round(Math.min(loopSec(),4)*SR));
    for(let c=0;c<r.numberOfChannels;c++){ const d=r.getChannelData(c); for(let i=0;i<fl;i++) d[n-fl+i]*=1-i/fl; }
  }
  return r;
}
async function withBusy(btn,label,fn){
  if(!tracks.some(t=>t.buf)){ msg("Rien à exporter : enregistre au moins une piste."); return; }
  btn.disabled=true; const old=btn.textContent; btn.textContent=label; msg('');
  try{ await fn(); }
  catch(e){ msg("Opération impossible : "+((e&&(e.message||e.code))||'erreur')); }
  finally{ btn.disabled=false; btn.textContent=old; }
}
$('#exp').onclick=()=>withBusy($('#exp'),'Rendu en cours…',async()=>{
  const r=await renderMix({fadeEnd:$('#expfade').checked});
  const name=safeName(projName)+'.wav';
  downloadBlob(new Blob([wav16(r)],{type:'audio/wav'}),name);
  msg('Export prêt : le fichier '+name+' est dans tes téléchargements.');
});
$('#share').onclick=()=>withBusy($('#share'),'Préparation…',async()=>{
  const r=await renderMix({fadeEnd:$('#expfade').checked});
  const name=safeName(projName)+'.wav', blob=new Blob([wav16(r)],{type:'audio/wav'});
  let file=null; try{ file=new File([blob],name,{type:'audio/wav'}); }catch(e){}
  if(file&&navigator.canShare&&navigator.canShare({files:[file]})){
    try{ await navigator.share({files:[file],title:projName,text:'Fait avec LoopBox'}); msg('Mix partagé.'); }
    catch(e){ if(e&&e.name==='AbortError') msg('Partage annulé.'); else throw e; }
  } else {
    downloadBlob(blob,name);
    msg("Le partage direct n'est pas disponible dans ce navigateur : le fichier "+name+" a été téléchargé, tu peux l'envoyer depuis tes fichiers.");
  }
});
$('#stems').onclick=()=>withBusy($('#stems'),'Rendu des pistes…',async()=>{
  const list=tracks.filter(t=>t.buf);
  let reps=+$('#reps').value;
  if(list.length*loopLen*reps*4>150*1048576){ reps=1; }
  const files=[];
  for(let k=0;k<list.length;k++){
    const t=list[k], r=await renderMix({only:t,reps,fadeEnd:$('#expfade').checked});
    files.push({name:String(k+1).padStart(2,'0')+' - '+safeName(t.name)+'.wav',data:wav16(r)});
  }
  const zname=safeName(projName)+' - pistes.zip';
  downloadBlob(makeZipMulti(files),zname);
  msg(files.length+' piste'+(files.length>1?'s':'')+' exportée'+(files.length>1?'s':'')+' dans '+zname+(reps!==+$('#reps').value?' (1 boucle par piste, pour limiter la taille)':'')+'. Chaque piste garde ses réglages et effets, sans le « Son final ».');
});

// ---------- sauvegarde ----------
function idb(){return new Promise((res,rej)=>{const r=indexedDB.open('loopbox',1);r.onupgradeneeded=()=>r.result.createObjectStore('proj');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
const idbGet=(db,k)=>new Promise((res,rej)=>{const r=db.transaction('proj').objectStore('proj').get(k);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});
const idbPut=(db,pairs,dels)=>new Promise((res,rej)=>{ const tx=db.transaction('proj','readwrite'), st=tx.objectStore('proj'); pairs.forEach(([k,v])=>st.put(v,k)); (dels||[]).forEach(k=>st.delete(k)); tx.oncomplete=res; tx.onerror=()=>rej(tx.error); tx.onabort=()=>rej(tx.error); });
let projId=null, projName='Mon projet', projIndex={cur:null,list:[]}, devLoaded=false;
let saveT=null, audioDirty=true;
const newId=()=>'p'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
function safeName(n){ return (String(n||'loopbox').replace(/[\\/:*?"<>|]+/g,'').trim()||'loopbox').slice(0,40); }
function uniqueName(base){ const names=new Set(projIndex.list.map(p=>p.name)); if(!names.has(base)) return base; let k=2; while(names.has(base+' '+k)) k++; return base+' '+k; }
function setSaveState(st){ const e=$('#savestate'); if(!e) return; e.textContent=st==='ok'?'✓':st==='err'?'⚠':'…'; e.title=st==='ok'?'Enregistré':st==='err'?'Non enregistré':'Enregistrement…'; e.setAttribute('aria-label',e.title); }
function scheduleSave(settingsOnly){ if(!settingsOnly) audioDirty=true; clearTimeout(saveT); setSaveState('…'); saveT=setTimeout(saveProj,settingsOnly?300:700); }
function mainData(){
  return {v:2,name:projName,go:gridOff,liveQ,scenes:scenes.map(sc=>sc?sc.map(x=>({i:tracks.indexOf(x.t),m:x.mute})).filter(x=>x.i>=0):null),meter,bpm,loopLen,beats,baseLen,baseBeats,rep,snap,mixMode,mvol,fin,
    tracks:tracks.map(t=>({sr:t.buf?t.buf.sampleRate:0,vol:t.vol,pan:t.panv,mute:t.mute,solo:t.solo,fxs:t.fxs.map(f=>({t:f.type,a:f.amt})),st:t.srcType,pt:t.pitch,eq:t.eqv,sel:t.sel?[t.sel.s,t.sel.e]:null,smd:t.selMode,nm:t.name,co:t.color,fi:t.fadeIn,fo:t.fadeOut,k:t.kind,bs:t.bass}))};
}
function summary(){ return {id:projId,name:projName,updated:Date.now(),beats:loopLen?beats:0,bpm:loopLen?+(beats*60/loopSec()).toFixed(1):bpm,ntr:tracks.filter(t=>t.buf).length,dur:loopLen?+loopSec().toFixed(1):0}; }
async function saveProj(){
  clearTimeout(saveT); saveT=null;
  if(!projId) return;
  const withAudio=audioDirty; audioDirty=false;
  try{
    const db=await idb();
    const main=mainData(), audio=withAudio?tracks.map(t=>t.buf?t.buf.getChannelData(0).slice():null):null;
    const sm=summary(), i=projIndex.list.findIndex(p=>p.id===projId);
    if(i>=0) projIndex.list[i]=sm; else projIndex.list.push(sm);
    projIndex.cur=projId;
    const pairs=[['p:'+projId+':main',main],['index',projIndex],['device',{comp,ingain,normOn,eng:devEng,mv:metroVol,ms:metroSub,setup,lats,latAt,micId}]];
    if(audio) pairs.push(['p:'+projId+':audio',audio]);
    await idbPut(db,pairs);
    setSaveState('ok'); updProjList();
    if(!window.__persistAsked){ window.__persistAsked=true; try{ if(navigator.storage&&navigator.storage.persist) navigator.storage.persist(); }catch(e){} }
  }catch(e){ if(withAudio) audioDirty=true; setSaveState('err'); }
}
function refreshGlobalUI(){
  showMetroUI(); showSetupUI();
  $('#norm').classList.toggle('on',normOn);
  $('#snap').classList.toggle('on',snap);
  $('#mix').textContent='Prise : '+(mixMode?'ajoute':'remplace'); $('#mix').classList.toggle('on',mixMode);
  $('#mvol').value=mvol; chain.vol.gain.value=mvol;
  chain.setFin(fin); showFin();
  $('#ingain').value=ingain; $('#ingv').textContent=ingain.toFixed(1)+'×'; if(inGainNode) inGainNode.gain.value=ingain*(curProf?curProf.mul:1);
  $('#comp').value=Math.round(comp*1000); $('#compv').textContent=Math.round(comp*1000)+'ms';
}
function resetProject(){
  if(recObj) cancelRec();
  stopTransport(); paused=false;
  tracks.slice().forEach(disposeTrack); tracks.length=0; $('#tracks').innerHTML='';
  loopLen=0; beats=4; baseLen=0; baseBeats=4; rep=1; loopHist=null; masterTake=null; lastLoop=null;
  bpm=90; snap=true; mixMode=false; mvol=0.9; fin=0; meter=4; gridOff=0; liveQ='bar'; scenes.fill(null);
  clearHist();
  addTrack();
  refreshGlobalUI(); buildDots(); applyGains(); lockUI(); msg('');
}
function applyProject(d,audio){
  const pcmOf=(s,i)=>d.v===2?(audio&&audio[i]):s.pcm;
  const used=(s,i)=>{ const p=pcmOf(s,i); return !!(p&&p.length)||(s.fxs||[]).some(f=>f.t&&f.t!=='none')||(s.fx&&s.fx!=='none')||(s.eq||[]).some(v=>+v)||!!s.pt||(s.vol!=null&&s.vol!==0.8)||!!s.pan||!!s.mute||!!s.solo||(s.st&&s.st!=='beatbox')||s.k==='bass'||!!s.nm; };
  let need=1; (d.tracks||[]).forEach((s,i)=>{ if(s&&used(s,i)) need=i+1; });
  while(tracks.length<need&&tracks.length<MAXTRACKS) addTrack();
  if(!devLoaded){ if(d.normOn!=null) normOn=d.normOn!==false; if(d.comp!=null) comp=d.comp; if(d.ingain) ingain=d.ingain; }
  meter=d.meter===3?3:4; bpm=d.bpm||90; snap=d.snap!==false; mixMode=!!d.mixMode; mvol=d.mvol??0.9; fin=typeof d.fin==='number'?d.fin:(d.fin?1:0);
  const firstLen=((d.tracks||[]).map(pcmOf).find(p=>p&&p.length)||{length:0}).length;
  loopLen=d.loopLen||firstLen||0; beats=d.beats||((d.bars||1)*4);
  baseLen=d.baseLen||loopLen; baseBeats=d.baseBeats||beats; rep=d.rep||1;
  if(baseLen*rep!==loopLen){ baseLen=loopLen; baseBeats=beats; rep=1; }
  (d.tracks||[]).forEach((s,i)=>{
    const t=tracks[i]; if(!t||!s) return;
    t.vol=s.vol??0.8; t.panv=s.pan??0; t.mute=!!s.mute; t.solo=!!s.solo; const okT=x=>FX_LIST.some(f=>f[0]===x);
    if(s.nm) t.name=String(s.nm).slice(0,24); if(s.co&&/^#[0-9a-fA-F]{6}$/.test(s.co)){ t.color=s.co; t.el.style.setProperty('--c',t.color); }
    t.fadeIn=+s.fi||0; t.fadeOut=+s.fo||0;
    t.kind=s.k==='bass'?'bass':'rec'; t.bass=s.bs?JSON.parse(JSON.stringify(s.bs)):null; t.tab=''; setKindUI(t); if(t.kind==='bass') showBassOpts(t);
    t.fxs=(Array.isArray(s.fxs)&&s.fxs.length)?s.fxs.slice(0,MAXFX).map(f=>({type:okT(f.t)?f.t:'none',amt:clamp(+f.a,0,1)||0})):[{type:okT(s.fx)?s.fx:'none',amt:s.fa??0.5}];
    t.srcType=SRC_LIST.some(p=>p.id===s.st)?s.st:'beatbox';
    t.pitch=clamp(Math.round(+s.pt||0),-12,12);
    t.eqv=(Array.isArray(s.eq)&&s.eq.length===3)?s.eq.map(x=>clamp(+x||0,-12,12)):[0,0,0]; t.eq.lo.gain.value=t.eqv[0]; t.eq.mid.gain.value=t.eqv[1]; t.eq.hi.gain.value=t.eqv[2];
    const pcm=pcmOf(s,i);
    if(pcm&&pcm.length&&pcm.length===loopLen){ const b=ctx.createBuffer(1,pcm.length,s.sr||SR); b.copyToChannel(pcm,0); t.buf=b; }
    if(t.buf&&Array.isArray(s.sel)&&s.sel.length===2&&s.sel[0]>=0&&s.sel[1]<=beats&&s.sel[1]-s.sel[0]>=1) t.sel={s:s.sel[0],e:s.sel[1]};
    t.selMode=['mute','loop','2','3','4'].includes(s.smd)?s.smd:'mute';
    setFx(t); syncTrackUI(t); drawWave(t);
  });
  if(!tracks.some(t=>t.buf)){ loopLen=0; beats=4; baseLen=0; baseBeats=4; rep=1; }
  liveQ=['bar','loop','now'].includes(d.liveQ)?d.liveQ:'bar'; gridOff=+d.go||0;
  for(let k=0;k<4;k++){ const sc=d.scenes&&d.scenes[k]; scenes[k]=sc?sc.map(x=>({t:tracks[x.i],mute:!!x.m})).filter(x=>x.t):null; }
  audioDirty=(d.v!==2);
  refreshGlobalUI(); buildDots(); applyGains(); lockUI();
}
async function loadProj(){
  try{
    const db=await idb();
    const dev=await idbGet(db,'device');
    if(dev){ devLoaded=true; if(dev.comp!=null) comp=dev.comp; if(dev.ingain) ingain=dev.ingain; normOn=dev.normOn!==false; devEng=dev.eng||''; if(dev.mv!=null) metroVol=dev.mv; if(dev.ms) metroSub=dev.ms; if(dev.lats){ Object.assign(lats,dev.lats); Object.assign(latAt,dev.latAt||{}); } else if(dev.comp!=null){ lats.speaker=dev.comp; } if(SETUPS[dev.setup]) setup=dev.setup; micId=dev.micId||''; }
    let idx=await idbGet(db,'index');
    if(!idx){
      // première ouverture avec les projets : on reprend l'ancien projet unique s'il existe
      const id=newId(); idx={cur:id,list:[]};
      const legacy=await idbGet(db,'main');
      const pairs=[['index',idx]];
      if(legacy){ legacy.name=legacy.name||'Mon projet'; pairs.push(['p:'+id+':main',legacy]); const la=legacy.v===2?await idbGet(db,'audio'):null; if(la) pairs.push(['p:'+id+':audio',la]); }
      await idbPut(db,pairs);
    }
    projIndex=idx;
    projId=idx.cur||(idx.list[0]&&idx.list[0].id)||newId();
    const d=await idbGet(db,'p:'+projId+':main');
    const known=idx.list.find(p=>p.id===projId);
    projName=(d&&d.name)||(known&&known.name)||'Mon projet';
    if(d){ const audio=d.v===2?await idbGet(db,'p:'+projId+':audio'):null; applyProject(d,audio); }
    else refreshGlobalUI();
    if(!known||(d&&d.v!==2)) await saveProj();
    setSaveState('ok');
  }catch(e){ projId=projId||newId(); }
  updProjUI();
}
async function openProject(id,force){
  if(id===projId&&!force) return;
  await saveProj();
  try{
    const db=await idb();
    const d=await idbGet(db,'p:'+id+':main');
    const audio=d&&d.v===2?await idbGet(db,'p:'+id+':audio'):null;
    resetProject();
    projId=id; projName=(d&&d.name)||((projIndex.list.find(p=>p.id===id)||{}).name)||'Projet';
    if(d) applyProject(d,audio);
    await saveProj();
    updProjUI(); msg('Projet « '+projName+' » ouvert.');
  }catch(e){ msg("Impossible d'ouvrir ce projet."); }
}
async function newProject(){
  await saveProj();
  resetProject();
  projId=newId(); projName=uniqueName('Nouveau projet');
  audioDirty=true; await saveProj(); updProjUI(); msg('Nouveau projet créé.');
}
async function saveCopy(name){
  await saveProj();
  projId=newId(); projName=uniqueName(name||projName+' (copie)');
  audioDirty=true; await saveProj(); updProjUI(); msg('Copie enregistrée : « '+projName+' ».');
}
async function deleteProject(id){
  try{
    const db=await idb();
    projIndex.list=projIndex.list.filter(p=>p.id!==id);
    if(id===projId){
      projId=null; projIndex.cur=null;
      await idbPut(db,[['index',projIndex]],['p:'+id+':main','p:'+id+':audio']);
      const next=[...projIndex.list].sort((a,b)=>b.updated-a.updated)[0];
      if(next) await openProject(next.id,true);
      else { resetProject(); projId=newId(); projName='Mon projet'; audioDirty=true; await saveProj(); }
    } else await idbPut(db,[['index',projIndex]],['p:'+id+':main','p:'+id+':audio']);
  }catch(e){ msg('Suppression impossible.'); }
  updProjUI();
}
// ----- fichier .loopbox : en-tête « LBX1 », longueur JSON, JSON, puis le son de chaque piste en 16 bits
function encodeProject(){
  const lens=[], parts=[];
  tracks.forEach(t=>{ if(t.buf){ const d=t.buf.getChannelData(0), q=new Int16Array(d.length); for(let i=0;i<d.length;i++) q[i]=Math.round(clamp(d[i],-1,1)*32767); parts.push(q); lens.push(d.length); } else lens.push(0); });
  const json=new TextEncoder().encode(JSON.stringify({format:1,app:'LoopBox',name:projName,main:mainData(),lens}));
  const head=new Uint8Array(8); head.set([76,66,88,49]); new DataView(head.buffer).setUint32(4,json.length,true);
  return new Blob([head,json,...parts],{type:'application/octet-stream'});
}
function downloadBlob(blob,name){
  const url=URL.createObjectURL(blob), a=document.createElement('a');
  a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}
async function importProjectFile(file){
  try{
    const ab=await readFile(file), u=new Uint8Array(ab);
    if(u.length<8||u[0]!==76||u[1]!==66||u[2]!==88||u[3]!==49) throw new Error('format');
    const jl=new DataView(ab).getUint32(4,true);
    const meta=JSON.parse(new TextDecoder().decode(u.subarray(8,8+jl)));
    let off=8+jl;
    const audio=(meta.lens||[]).map(n=>{ if(!n) return null; const q=new Int16Array(ab.slice(off,off+n*2)); off+=n*2; const f=new Float32Array(n); for(let i=0;i<n;i++) f[i]=q[i]/32767; return f; });
    await saveProj();
    resetProject();
    projId=newId(); projName=uniqueName(meta.name||'Projet importé');
    const d=meta.main||{}; d.v=2; applyProject(d,audio);
    audioDirty=true; await saveProj(); updProjUI(); msg('Projet ouvert depuis le fichier : « '+projName+' ».');
  }catch(e){ msg("Ce fichier n'est pas un projet LoopBox valide."); }
}
// ----- menu projet
function fmtDate(ts){ try{ return new Date(ts).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}); }catch(e){ return ''; } }
function updProjList(){
  const box=$('#projlist'); if(!box) return;
  box.innerHTML='';
  const list=[...projIndex.list].sort((a,b)=>b.updated-a.updated);
  list.forEach(p=>{
    const row=document.createElement('div'); row.className='prow';
    const info=p.beats?(p.beats+' temps · '+String(p.bpm).replace('.',',')+' BPM · '+p.ntr+' piste'+(p.ntr>1?'s':'')):'vide';
    row.innerHTML=`<div class="pn"><b></b><small>${info} · ${fmtDate(p.updated)}</small></div>`;
    $('b',row).textContent=p.name;
    if(p.id===projId){ const c=document.createElement('span'); c.className='cur'; c.textContent='ouvert'; row.appendChild(c); }
    else { const o=document.createElement('button'); o.textContent='Ouvrir'; o.onclick=()=>{ setProjMenu(false); openProject(p.id); }; row.appendChild(o); }
    const del=document.createElement('button'); del.textContent='🗑'; del.setAttribute('aria-label','Supprimer '+p.name);
    del.onclick=()=>{ if(del.dataset.arm!=='1'){ del.dataset.arm='1'; del.textContent='Confirmer ?'; setTimeout(()=>{ del.dataset.arm='0'; del.textContent='🗑'; },3000); return; } deleteProject(p.id); };
    row.appendChild(del);
    box.appendChild(row);
  });
}
function updProjUI(){
  $('#projname').textContent=projName;
  if(document.activeElement!==$('#projinp')) $('#projinp').value=projName;
  updProjList();
}
let diagSpeed='non lancé';
async function diagText(){
  const L=[];
  const ua=navigator.userAgent||'';
  const br=/Edg\//.test(ua)?'Edge':/SamsungBrowser/.test(ua)?'Samsung Internet':/Firefox\//.test(ua)?'Firefox':/CriOS|Chrome\//.test(ua)?'Chrome':/Safari\//.test(ua)?'Safari':'autre';
  const os=/Android/.test(ua)?'Android':/iPhone|iPad|iPod/.test(ua)?'iOS':/Windows/.test(ua)?'Windows':/Mac OS/.test(ua)?'macOS':'autre';
  L.push('Version de LoopBox : '+APPVER);
  L.push('Navigateur : '+br+' sur '+os+' — '+(window.innerWidth||0)+'×'+(window.innerHeight||0)+' px');
  L.push('Fréquence audio : '+SR+' Hz');
  const bl=ctx.baseLatency, ol=ctx.outputLatency;
  L.push('Latence annoncée par le navigateur : '+(bl!=null?Math.round(bl*1000)+' ms':'?')+' (moteur) / '+(ol!=null&&ol>0?Math.round(ol*1000)+' ms':'?')+' (sortie)');
  L.push('Configuration : '+SETUPS[setup]+' — latence '+Math.round(comp*1000)+' ms'+(lats[setup]!=null&&latAt[setup]?' (mesurée)':' (estimation)'));
  L.push('Latences enregistrées : '+Object.keys(SETUPS).map(k=>SETUPS[k]+' '+(lats[k]!=null?Math.round(lats[k]*1000)+' ms':'—')).join(' · '));
  L.push('Moteur d\'enregistrement : '+(captureEngine||'pas encore démarré (fais une première prise)')+(typeof AudioWorkletNode!=='undefined'&&ctx.audioWorklet?' — AudioWorklet disponible':' — AudioWorklet indisponible'));
  L.push('Micro : '+(micStream?'autorisé — '+(($('#micsel').selectedOptions[0]||{}).textContent||'par défaut'):'pas encore utilisé'));
  L.push('Mémoire audio utilisée : '+memMB().toFixed(1)+' Mo (historique : '+histMB().toFixed(1)+' Mo, '+H.past.length+' annulation(s) possible(s))');
  try{ if(navigator.storage&&navigator.storage.persisted){ L.push('Stockage protégé : '+((await navigator.storage.persisted())?'oui':'non (le navigateur peut l\'effacer s\'il manque de place)')); } }catch(e){}
  try{ if(navigator.storage&&navigator.storage.estimate){ const e=await navigator.storage.estimate(); L.push('Stockage : '+(e.usage/1048576).toFixed(1)+' Mo utilisés sur '+Math.round(e.quota/1048576)+' Mo disponibles'); } }catch(e){}
  L.push('Projets enregistrés : '+projIndex.list.length);
  L.push('Test de vitesse : '+diagSpeed);
  L.push('Erreurs internes : '+(window.__lbErrors.length?window.__lbErrors.join(' | '):'aucune'));
  return L.join('\n');
}
async function showDiag(){ $('#diagout').textContent=await diagText(); }
$('#diag').addEventListener('toggle',()=>{ if($('#diag').open) showDiag(); });
$('#diagrun').onclick=async()=>{
  $('#diagout').textContent='Test en cours…'; await new Promise(r=>setTimeout(r,30));
  const n=SR*5, x=new Float32Array(n); let sd=1; for(let i=0;i<n;i++){ sd=(sd*16807)%2147483647; x[i]=(i%24000<4000?0.6:0.05)*(sd/2147483647*2-1); }
  const t1=performance.now(); pitchShiftSync(x,7,SR); const dt=performance.now()-t1;
  diagSpeed=Math.round(dt)+' ms pour changer la hauteur de 5 s de son'+(dt<800?' (rapide)':dt<2500?' (correct)':' (lent : les longues boucles prendront plusieurs secondes)');
  showDiag();
};
$('#diagcopy').onclick=async()=>{ const txt=await diagText(); try{ await navigator.clipboard.writeText(txt); msg('Rapport copié : tu peux le coller dans un message.'); }catch(e){ const r=document.createRange(); r.selectNodeContents($('#diagout')); const sel=getSelection(); sel.removeAllRanges(); sel.addRange(r); msg('Copie automatique impossible : le texte est sélectionné, copie-le à la main.'); } };
$('#diagfree').onclick=()=>{ freeMem(); showDiag(); };
// ---------- installation (PWA) et mises à jour ----------
let installEvt=null;
function updInstall(){
  const standalone=(window.matchMedia&&matchMedia('(display-mode: standalone)').matches)||navigator.standalone===true;
  $('#installbtn').hidden=!installEvt||standalone;
  $('#installhint').textContent=standalone?"Tu utilises l'appli installée.":installEvt?'':"Si le bouton n'apparaît pas : menu du navigateur (⋮) → « Ajouter à l'écran d'accueil » ou « Installer l'appli ».";
}
window.addEventListener('beforeinstallprompt',e=>{ e.preventDefault(); installEvt=e; updInstall(); });
window.addEventListener('appinstalled',()=>{ installEvt=null; updInstall(); msg("LoopBox est installée : retrouve-la sur ton écran d'accueil."); });
$('#installbtn').onclick=async()=>{ if(!installEvt) return; installEvt.prompt(); try{ const r=await installEvt.userChoice; msg(r&&r.outcome==='accepted'?'Installation lancée.':'Installation annulée.'); }catch(e){} installEvt=null; updInstall(); };
updInstall();
function showUpdate(w){
  const m=$('#msg'); m.textContent='Nouvelle version de LoopBox disponible. ';
  const b=document.createElement('button'); b.textContent='Mettre à jour'; b.className='primary';
  b.onclick=()=>{ if(recObj){ msg('Termine ton enregistrement avant de mettre à jour.'); return; } saveProj().finally(()=>w.postMessage('skip')); };
  m.appendChild(b);
}
if('serviceWorker' in navigator&&location.protocol==='https:'){
  const hadCtl=!!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').then(reg=>{
    if(reg.waiting&&hadCtl) showUpdate(reg.waiting);
    reg.addEventListener('updatefound',()=>{ const w=reg.installing; if(!w) return; w.addEventListener('statechange',()=>{ if(w.state==='installed'&&navigator.serviceWorker.controller) showUpdate(w); }); });
  }).catch(()=>{});
  let reloading=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{ if(!hadCtl||reloading) return; reloading=true; location.reload(); });
}
$('#undo').onclick=undo; $('#redo').onclick=redo;
function setProjMenu(open){
  const m=$('#projmenu'); m.hidden=!open;
  $('#projbtn').setAttribute('aria-expanded',String(open));
  document.querySelector('.projbar').classList.toggle('open',open);
  if(open) updProjUI();
}
$('#projbtn').onclick=()=>setProjMenu($('#projmenu').hidden);
// le menu se referme dès qu'on touche ailleurs : il ne recouvre plus les pistes
document.addEventListener('pointerdown',e=>{ if(!$('#projmenu').hidden&&!e.target.closest('.projbar')) setProjMenu(false); },true);
$('#projren').onclick=()=>{ const n=$('#projinp').value.trim(); if(!n) return; projName=n.slice(0,40); updProjUI(); scheduleSave(true); msg('Projet renommé : « '+projName+' ».'); };
$('#projsave').onclick=async()=>{ setSaveState('…'); await saveProj(); msg('Projet « '+projName+' » enregistré.'); };
$('#projcopy').onclick=()=>{ const n=$('#projinp').value.trim(); saveCopy(n&&n!==projName?n:projName+' (copie)'); };
$('#projnew').onclick=()=>{ setProjMenu(false); newProject(); };
$('#projexp').onclick=()=>{ if(!tracks.some(t=>t.buf)){ msg('Rien à sauvegarder : le projet est vide.'); return; } downloadBlob(encodeProject(),safeName(projName)+'.loopbox'); msg('Fichier « '+safeName(projName)+'.loopbox » créé dans tes téléchargements.'); };
$('#projimp').onclick=()=>$('#projfile').click();
$('#projfile').onchange=e=>{ const f=e.target.files&&e.target.files[0]; e.target.value=''; if(f) importProjectFile(f); };

// ---------- boucle d'affichage ----------
const mOut=$('#mOut'), mIn=$('#mIn'), fbuf=new Float32Array(1024);
function peak(an){ an.getFloatTimeDomainData(fbuf); let p=0; for(let i=0;i<fbuf.length;i++){ const v=Math.abs(fbuf[i]); if(v>p)p=v; } return p; }
let dockTxt='';
function frame(){
  const now=ctx.currentTime, L=loopSec(), bd=beatDur();
  let pos=0, inCount=false;
  if(running){ if(now<t0) inCount=true; else if(loopLen) pos=((now-t0)%L)/L; }
  else if(paused&&loopLen) pos=pausePos/L;
  if(dotsN!==(loopLen?beats:meter)) buildDots();
  let cur=-1;
  if(running&&!inCount) cur=loopLen?Math.floor(pos*beats):mod(Math.floor((now-t0)/bd),meter);
  else if(paused&&loopLen) cur=Math.floor(pos*beats);
  let dtxt;
  if(recObj) dtxt=now<recObj.tp?'Décompte…':'● Enregistrement en cours';
  else if(paused) dtxt='En pause'+(loopLen?' · temps '+(Math.floor(pos*beats)+1)+' / '+beats:'');
  else if(!running) dtxt=loopLen?"À l'arrêt · "+beats+' temps':"À l'arrêt";
  else if(inCount&&t0-now>0.25) dtxt='Décompte…';
  else dtxt=loopLen?'En lecture · '+beats+' temps · '+(beats*60/loopSec()).toFixed(1).replace('.',',')+' BPM':'Métronome en marche';
  if(dtxt!==dockTxt){ dockTxt=dtxt; $('#dtxt').textContent=dtxt; }
  $('#dbar').style.width=((running&&!inCount||paused)&&loopLen?pos*100:0)+'%';
  const dots=$('#dots').children;
  for(let i=0;i<dots.length;i++) dots[i].classList.toggle('on',i===cur);
  $('#cd').textContent=inCount?'Décompte '+Math.ceil((t0-now)/bd):'';
  tracks.forEach(t=>{
    uiTrack(t,now);
    const show=(running||paused)&&!inCount&&loopLen;
    t.ph.style.opacity=show?1:0;
    if(show) t.ph.style.left=(pos*100)+'%';
  });
  const po=peak(outAn); mOut.style.width=clamp(po*100,0,100)+'%'; mOut.classList.toggle('clip',po>0.98);
  if(inAn){ const pi=peak(inAn); mIn.style.width=clamp(pi*100,0,100)+'%'; mIn.classList.toggle('clip',pi>0.98); }
  requestAnimationFrame(frame);
}
window.addEventListener('resize',()=>tracks.forEach(drawWave));

buildDots(); applyGains(); lockUI();
loadProj().then(()=>{ requestAnimationFrame(frame); });
})();
