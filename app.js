// LoopBox — studio de loops (Movement Practice Bordeaux)
// Tout le code de l'appli. Tests : npm test (voir tests/).
const APPVER='82';
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
let bpm=90, metroOn=false, fin=0, snap=true, mixMode=false, mvol=0.9, ingain=2, comp=0.1;
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

// message en haut + bulle visible même quand on a fait défiler la page (sinon on croit que rien ne se passe)
let toastT=null;
function msg(t){ $('#msg').textContent=t||''; const el=document.getElementById('toast'); if(!el) return; clearTimeout(toastT); if(!t){ el.hidden=true; return; } el.textContent=t; el.hidden=false; toastT=setTimeout(()=>{ el.hidden=true; },Math.min(12000,3500+t.length*45)); }
document.addEventListener('click',e=>{ if(e.target&&e.target.id==='toast'){ e.target.hidden=true; } });
const ICONS={"mic": "<rect x=\"9\" y=\"3\" width=\"6\" height=\"11\" rx=\"3\"/><path d=\"M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7\"/>", "film": "<rect x=\"3\" y=\"9.5\" width=\"18\" height=\"11\" rx=\"2\"/><path d=\"M3 9.5 5 4l15.8 1.4L21 9.5M8.3 4.3 6.8 9.5M13.5 4.8 12 9.5M18.6 5.2 17.2 9.5\"/>", "sliders": "<path d=\"M6 3v18M12 3v18M18 3v18\"/><rect x=\"3.8\" y=\"13\" width=\"4.4\" height=\"3.2\" rx=\"1\" fill=\"currentColor\" stroke=\"none\"/><rect x=\"9.8\" y=\"6.5\" width=\"4.4\" height=\"3.2\" rx=\"1\" fill=\"currentColor\" stroke=\"none\"/><rect x=\"15.8\" y=\"15\" width=\"4.4\" height=\"3.2\" rx=\"1\" fill=\"currentColor\" stroke=\"none\"/>", "gear": "<circle cx=\"12\" cy=\"12\" r=\"3\"/><circle cx=\"12\" cy=\"12\" r=\"6.6\"/><path d=\"M12 2.5v2.9M12 18.6v2.9M2.5 12h2.9M18.6 12h2.9M5.3 5.3l2 2M16.7 16.7l2 2M5.3 18.7l2-2M16.7 7.3l2-2\"/>", "download": "<path d=\"M12 3.5v11.5M7 10.5l5 5 5-5M4.5 20h15\"/>", "upload": "<path d=\"M12 16V4.5M7 9l5-5 5 5M4.5 20h15\"/>", "share": "<circle cx=\"6\" cy=\"12\" r=\"2.6\"/><circle cx=\"18\" cy=\"5.8\" r=\"2.6\"/><circle cx=\"18\" cy=\"18.2\" r=\"2.6\"/><path d=\"M8.3 10.8l7.4-3.7M8.3 13.2l7.4 3.7\"/>", "sparkle": "<path d=\"M11 3.5l1.8 5.3 5.2 1.7-5.2 1.8L11 17.5l-1.8-5.2L4 10.5l5.2-1.7Z\"/><path d=\"M18.5 15.5v5M16 18h5\"/>", "trash": "<path d=\"M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5\"/>", "bell": "<path d=\"M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15Z\"/><path d=\"M10 21a2 2 0 0 0 4 0\"/>", "timer": "<circle cx=\"12\" cy=\"13\" r=\"7\"/><path d=\"M12 9.5V13l2.6 1.7M9.3 2.5h5.4M12 2.5V6\"/>", "keys": "<rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"2\"/><path d=\"M8 13v6M12 13v6M16 13v6\"/><rect x=\"6.6\" y=\"5\" width=\"2.8\" height=\"8\" rx=\".6\" fill=\"currentColor\" stroke=\"none\"/><rect x=\"14.6\" y=\"5\" width=\"2.8\" height=\"8\" rx=\".6\" fill=\"currentColor\" stroke=\"none\"/>", "zoomin": "<circle cx=\"10.5\" cy=\"10.5\" r=\"6.5\"/><path d=\"M15.4 15.4 21 21M7.5 10.5h6M10.5 7.5v6\"/>", "zoomout": "<circle cx=\"10.5\" cy=\"10.5\" r=\"6.5\"/><path d=\"M15.4 15.4 21 21M7.5 10.5h6\"/>", "headphones": "<path d=\"M4 15v-3a8 8 0 0 1 16 0v3\"/><rect x=\"3\" y=\"14\" width=\"4.2\" height=\"7\" rx=\"1.6\"/><rect x=\"16.8\" y=\"14\" width=\"4.2\" height=\"7\" rx=\"1.6\"/>", "folder": "<path d=\"M3 7A1.5 1.5 0 0 1 4.5 5.5H10l2 2.5h7.5A1.5 1.5 0 0 1 21 9.5v9A1.5 1.5 0 0 1 19.5 20h-15A1.5 1.5 0 0 1 3 18.5Z\"/>", "save": "<path d=\"M5 3.5h11l3.5 3.5v13.5H5Z\"/><path d=\"M8.5 3.5v5h6.5v-5M8.5 20.5V15h7.5v5.5\"/>", "phone": "<rect x=\"7\" y=\"2.5\" width=\"10\" height=\"19\" rx=\"2.2\"/><path d=\"M12 7v7M9.5 11.5 12 14l2.5-2.5\"/>", "target": "<circle cx=\"12\" cy=\"12\" r=\"8\"/><circle cx=\"12\" cy=\"12\" r=\"4\"/><circle cx=\"12\" cy=\"12\" r=\"1\" fill=\"currentColor\" stroke=\"none\"/>", "knobs": "<circle cx=\"7\" cy=\"12\" r=\"3.6\"/><circle cx=\"17\" cy=\"12\" r=\"3.6\"/><path d=\"M7 12V8.4M17 12l2.5-2.5\"/>", "guitar": "<path d=\"M14 10l6.5-6.5M18.3 2.3l3.4 3.4\"/><path d=\"M14 10a4 4 0 0 0-5.4.4A3.6 3.6 0 0 1 5.3 12.6a3.8 3.8 0 0 0 .3 5.8 3.8 3.8 0 0 0 5.8.3 3.6 3.6 0 0 1 2.2-3.3A4 4 0 0 0 14 10Z\"/><circle cx=\"10\" cy=\"14\" r=\"1.3\"/>", "link": "<path d=\"M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 1 0-5.7-5.7l-1.4 1.4M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 1 0 5.7 5.7l1.4-1.4\"/>", "mute": "<path d=\"M4 9.5h3.5L12 5.5v13l-4.5-4H4Z\"/><path d=\"M16 9.5l5 5M21 9.5l-5 5\"/>", "speaker": "<path d=\"M4 9.5h3.5L12 5.5v13l-4.5-4H4Z\"/><path d=\"M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11\"/>", "pause": "<path d=\"M9 5.5v13M15 5.5v13\" stroke-width=\"2.6\"/>", "loop": "<path d=\"M4 11.5V10a3.5 3.5 0 0 1 3.5-3.5H19M16 3.5l3 3-3 3M20 12.5V14a3.5 3.5 0 0 1-3.5 3.5H5M8 20.5l-3-3 3-3\"/>", "broom": "<path d=\"M15 2.5 11.3 12M6.5 12h9l1.5 8.5H5Z\"/><path d=\"M9 15.5v5M12.5 15.5v5\"/>", "refresh": "<path d=\"M20 12a8 8 0 1 1-2.3-5.7M20 3.5v4.8h-4.8\"/>", "drum": "<ellipse cx=\"12\" cy=\"9\" rx=\"8\" ry=\"3\"/><path d=\"M4 9v7c0 1.7 3.6 3 8 3s8-1.3 8-3V9M5 3.5l5 4.5M19 3.5 14 8\"/>", "cloud": "<path d=\"M7 18.5h10.5a4 4 0 0 0 .6-8A6 6 0 0 0 6.6 9.8 4.3 4.3 0 0 0 7 18.5Z\"/>", "wand": "<path d=\"M4 20 15 9M13 7l4 4M18 2.5v3M16.5 4h3M20.5 9v2.5M19.2 10.2h2.6M9.5 3v2.4M8.3 4.2h2.4\"/>", "tools": "<path d=\"M14.6 4.2a4.5 4.5 0 0 0 5.2 5.2l-8.8 8.8a2.2 2.2 0 1 1-3.1-3.1l8.8-8.8a4.5 4.5 0 0 0-2.1-2.1Z\"/>", "hourglass": "<path d=\"M6.5 3h11M6.5 21h11M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9\"/>", "note": "<path d=\"M9 18V5.5l10-2V16\"/><circle cx=\"6.5\" cy=\"18\" r=\"2.5\"/><circle cx=\"16.5\" cy=\"16\" r=\"2.5\"/>", "users": "<circle cx=\"9\" cy=\"8\" r=\"3.2\"/><path d=\"M3 20c0-3.6 2.7-5.6 6-5.6s6 2 6 5.6\"/><circle cx=\"17\" cy=\"9\" r=\"2.6\"/><path d=\"M16.5 14.5c2.6 0 4.5 1.6 4.5 4.6\"/>", "scissors": "<circle cx=\"6\" cy=\"6.5\" r=\"2.8\"/><circle cx=\"6\" cy=\"17.5\" r=\"2.8\"/><path d=\"M8.3 8.2 20 18M8.3 15.8 20 6\"/>"};
function ic(n,sz){ sz=sz||20; return '<svg class="ic" data-n="'+n+'" width="'+sz+'" height="'+sz+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(ICONS[n]||'')+'</svg>'; }
// icônes au trait (même style que Calisthenics Tracker) : <i class="ic" data-ic="nom"></i> du HTML est remplacé par le SVG au démarrage ; dans le code, ic('nom')
function hydrateIcons(root){ (root||document).querySelectorAll('i.ic[data-ic]').forEach(e=>{ e.outerHTML=ic(e.dataset.ic); }); }
hydrateIcons();
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
setTimeout(()=>{ try{ setupLimiter(); }catch(e){} },0);
setTimeout(()=>{ let v='pistes'; try{ v=localStorage.getItem('lbx-view')||'pistes'; }catch(e){} if(v!=='pistes') setView(v); },0);
const metroGain=ctx.createGain(); metroGain.gain.value=0.36; metroGain.connect(ctx.destination);

// ---------- pistes ----------
function makeTrackNodes(i){
  const g=ctx.createGain(), inp=ctx.createGain(), p=ctx.createStereoPanner?ctx.createStereoPanner():null;
  const eq=makeEq(ctx,[0,0,0]); inp.connect(eq.inp); eq.out.connect(g); g.connect(p||chain.inp); if(p) p.connect(chain.inp);
  let _buf=null;
  return {uid:'t'+Date.now().toString(36)+Math.random().toString(36).slice(2,7),id:i,kind:'rec',bass:null,tab:'',name:'Piste '+(i+1),color:COLORS[i%COLORS.length],fadeIn:0,fadeOut:0,live:true,offT:0,inp,eq,eqv:[0,0,0],srcType:'beatbox',
    get buf(){ return _buf; }, set buf(v){ if(v!==_buf){ _buf=v; this.sel=null; this.pc=null; } },
    sel:null,selMode:'mute',off:0,snap:true,speed:1,sp:null,po:null,pc:null,pitch:0,pp:null,pjob:null,get prev(){ return null; }, set prev(v){},gain:g,pan:p,src:null,vol:0.8,panv:0,mute:false,solo:false,fxs:[{type:'none',amt:0.5}],fxn:[],el:null,cache:{}};
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
  const btn=$('#tapply'); btn.disabled=true; const old=btn.innerHTML; btn.textContent='Calcul…';
  await new Promise(r=>setTimeout(r,30));
  try{
    const oldL=loopSec(), now=ctx.currentTime, phase=running&&now>=t0?mod(now-t0,oldL):0;
    pushHist();
    tracks.forEach(t=>{
      if(!t.buf) return;
      const keep=t.sel?{...t.sel}:null;
      let b;
      if(isGen(t)&&t.bass) b=genRender(t,0,newLen,beats);
      else { const data=stretchSliced(t.buf.getChannelData(0),newLen,t.buf.sampleRate); b=ctx.createBuffer(1,newLen,t.buf.sampleRate); b.copyToChannel(data,0); }
      t.buf=b; t.sel=keep; drawWave(t);
    });
    masterTake=null; loopLen=newLen; baseLen=newBase; gridOff=Math.round(gridOff*a);
    tempoTarget=Math.round(nb); tempoKey=loopLen+':'+beats;
    if(running) playFrom(phase*a); else tracks.forEach(startSrc);
    buildDots(); lockUI(); scheduleSave();
    msg('Tempo changé : '+cur.toFixed(1).replace('.',',')+' → '+curBpm().toFixed(1).replace('.',',')+' BPM, sans changer la note (↶ pour revenir).');
  }finally{ btn.innerHTML=old; updTempoRow(); }
}
function pitchFinish(data,sr){
  const F=Math.min(72,data.length>>1);
  for(let i=0;i<F;i++){ const g=i/F; data[i]*=g; data[data.length-1-i]*=g; }
  const nb=ctx.createBuffer(1,data.length,sr); nb.copyToChannel(data,0); return nb;
}
function setPitchStatus(t,txt){ const e=$('.pst',t.el); if(e) e.textContent=txt; }
// basse / mélodie générée : on refabrique les notes (longueur et transposition exactes) au lieu de traiter le son
function genRender(t,semi,L,nb){
  if(!t.bass) return null;
  const o=JSON.parse(JSON.stringify(t.bass)), sg=normSegs(o.segs,nb), rt=segRoots(sg,t.kind);
  o.segs=sg.map((x,i)=>rt[i]==null?x:{...x,m:rt[i]+(semi||0),n:mod(rt[i]+(semi||0),12)});
  const d=renderBass(o,L,nb).data, b=ctx.createBuffer(1,L,SR); b.copyToChannel(d,0); return b;
}
function pitchedBuf(t){
  if(isGen(t)&&t.bass&&t.pitch&&t.buf){ const c=t.pp; if(c&&c.b===t.buf&&c.semi===t.pitch&&c.gen) return c.out; const out=genRender(t,t.pitch,t.buf.length,beats); t.pp={b:t.buf,semi:t.pitch,out,gen:true}; return out; }
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
  if(isGen(t)&&t.bass){ pitchedBuf(t); return; }
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
function repPeriod(P){ return P>=0.75?Math.max(1,Math.round(P)):P; }
function repCopies(t){
  if(!t.sel||!loopLen) return [];
  const m=t.selMode||'mute', P=t.sel.e-t.sel.s, per=repPeriod(P);
  if(m==='mute'||P<=0||per>=beats) return [[t.sel.s,P]];
  const K=m==='loop'?Math.ceil(beats/per):Math.min(+m,Math.floor(beats/per)), out=[];
  for(let k=0;k<K;k++) out.push([t.sel.s+k*per,Math.min(P,per,m==='loop'?beats-k*per:per)]);
  return out;
}
function playBuf(t){
  const r=playBufCore(t); if(!r||!t.off) return r;
  const k=Math.round(t.off*SR), c=t.po;
  if(c&&c.src===r&&c.k===k) return c.out;
  const L=r.length, d=r.getChannelData(0), o=new Float32Array(L);
  for(let i=0;i<L;i++) o[mod(i+k,L)]=d[i];
  const nb=ctx.createBuffer(1,L,SR); nb.copyToChannel(o,0);
  t.po={src:r,k,out:nb}; return nb;
}
// vitesse : la piste est étirée (plus lente) ou resserrée (plus rapide) sans changer de note, puis remise à la durée de la boucle
function spedBuf(t){
  const base=pitchedBuf(t); if(!base||!t.speed||t.speed===1) return base;
  const c=t.sp; if(c&&c.b===base&&c.speed===t.speed) return c.out;
  const L=base.length, full=Math.round(L/t.speed), y=stretchSliced(base.getChannelData(0),full,base.sampleRate), out=new Float32Array(L);
  out.set(y.subarray(0,Math.min(L,full)));
  if(full>L){ const f=Math.min(Math.round(0.01*SR),L); for(let i=0;i<f;i++) out[L-1-i]*=i/f; }
  const nb=ctx.createBuffer(1,L,base.sampleRate); nb.copyToChannel(out,0);
  t.sp={b:base,speed:t.speed,out:nb}; return nb;
}
function playBufCore(t){
  const b=spedBuf(t); if(!b) return b;
  if(!t.sel&&!t.fadeIn&&!t.fadeOut) return b;
  const mode=t.sel?(t.selMode||'mute'):'mute';
  const s=t.sel?t.sel.s:0, e=t.sel?t.sel.e:beats, fI=t.fadeIn||0, fO=t.fadeOut||0, c=t.pc;
  if(c&&c.b===b&&c.s===s&&c.e===e&&c.n===beats&&c.fI===fI&&c.fO===fO&&c.mode===mode&&c.sn===(t.snap!==false)) return c.out;
  const L=b.length, src=b.getChannelData(0), bl=L/beats;
  const preRoll=t.snap===false?0:Math.round(0.03*SR);
  const a=s>0?Math.max(0,Math.round(s*bl)-preRoll):0, z=e<beats?Math.round(e*bl):L;
  const seg=new Float32Array(Math.max(0,z-a));
  for(let i=0;i<seg.length;i++) seg[i]=src[a+i];
  const fi=fI>0?Math.round(fI*bl):(s>0?Math.round((t.snap===false?0.002:0.005)*SR):0);
  for(let i=0;i<fi&&i<seg.length;i++) seg[i]*=i/fi;
  const fo=fO>0?Math.round(fO*bl):(e<beats?Math.round(0.01*SR):0);
  for(let i=1;i<=fo&&seg.length-i>=0;i++) seg[seg.length-i]*=(i-1)/fo;
  const out=new Float32Array(L);
  const cps=mode==='mute'?[[s,e-s]]:repCopies(t);
  const per=mode==='mute'?(e-s):repPeriod(e-s);
  cps.forEach(([cs,cl],k)=>{
    const st=Math.round(a+k*per*bl), lim=mode==='mute'?seg.length:Math.round(Math.min(per*bl,L-k*per*bl)), n=Math.min(seg.length,lim);
    const tail=Math.min(Math.round(0.005*SR),n);
    for(let i=0;i<n;i++){ let v=seg[i]; if(n<seg.length&&n-i<=tail) v*=(n-i)/tail; const j=(st+i)%L; out[j]=clamp(out[j]+v,-1,1); }
  });
  const nb=ctx.createBuffer(1,L,SR); nb.copyToChannel(out,0);
  t.pc={b,s,e,n:beats,fI,fO,mode,sn:t.snap!==false,out:nb}; return nb;
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
 // coupe-bas très bas : la grosse caisse de beatbox a sa note entre 25 et 45 Hz (mesuré sur de vraies prises), il ne faut pas y toucher
 {id:'beatbox',name:'Beatbox / bruits de bouche',hp:10,mul:0.8,gate:0},
 {id:'voice',name:'Voix (chant, parole)',hp:90,mul:1,gate:0.012},
 {id:'perc',name:'Percussions (table, objets)',hp:12,mul:1.25,gate:0},
 {id:'env',name:'Environnement proche (clés, papier…)',hp:120,mul:2,gate:0}
];
const FX_LIST=[['none','Aucun effet'],['echo','Écho (répétitions)'],['reverb','Réverbération (salle)'],['sat','Saturation (grain dans les graves)'],['lofi','Lo-fi 8 bits'],['muffle','Étouffé (derrière un mur)'],['radio','Radio / téléphone'],['pulse','Pulsation (volume qui bat)'],['flanger','Flanger (effet jet)'],['robot','Robot'],['bass','Basses boostées'],['stage','Son beatbox de scène (grosse caisse qui claque)']];
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
    // saturation « parallèle » : le son d'origine reste entier (attaques, silences), on y ajoute du grain dans les graves.
    // L'ancienne version écrasait tout le signal (×80) : les silences et le souffle remontaient au niveau des coups.
    const hp=nd(c.createBiquadFilter()), lp=nd(c.createBiquadFilter()), drv=nd(c.createGain()), ws=nd(c.createWaveShaper());
    hp.type='highpass'; hp.frequency.value=30; hp.Q.value=0.707; lp.type='lowpass'; lp.frequency.value=400; lp.Q.value=0.707;
    ws.oversample='4x'; { const n=2048, cu=new Float32Array(n), t=Math.tanh(2.5); for(let i=0;i<n;i++){ const x=i*2/(n-1)-1; cu[i]=Math.tanh(2.5*x)/t; } ws.curve=cu; }
    inp.disconnect(dry); inp.connect(hp); hp.connect(dry); hp.connect(lp); lp.connect(drv); drv.connect(ws); ws.connect(wet);
    upd=a=>{ drv.gain.value=1+a*6; dry.gain.value=1-a*0.25; wet.gain.value=a*0.5; };
  } else if(type==='stage'){
    // « son beatbox de scène » : imite micro dynamique collé à la bouche + compresseur de sono + grain dans le bas,
    // appliqué sur une prise propre (au lieu de la coupure numérique qui aplatit les grosses caisses)
    const hp=nd(c.createBiquadFilter()), prox=nd(c.createBiquadFilter()), cut=nd(c.createBiquadFilter()), cmp=nd(c.createDynamicsCompressor()), mk=nd(c.createGain());
    const lp=nd(c.createBiquadFilter()), drv=nd(c.createGain()), ws=nd(c.createWaveShaper()), sat=nd(c.createGain());
    hp.type='highpass'; hp.frequency.value=28; hp.Q.value=0.707;
    prox.type='lowshelf'; prox.frequency.value=110;           // effet de proximité : graves gonflés
    cut.type='peaking'; cut.frequency.value=400; cut.Q.value=1; // un peu moins de « carton » dans le bas-médium
    cmp.knee.value=6; cmp.ratio.value=4; cmp.attack.value=0.012; cmp.release.value=0.15;
    lp.type='lowpass'; lp.frequency.value=300; lp.Q.value=0.707;
    ws.oversample='4x'; { const n=2048, cu=new Float32Array(n), t=Math.tanh(2.5); for(let i=0;i<n;i++){ const x=i*2/(n-1)-1; cu[i]=Math.tanh(2.5*x)/t; } ws.curve=cu; }
    inp.disconnect(dry); inp.connect(hp); hp.connect(prox); prox.connect(cut); cut.connect(cmp); cmp.connect(mk); mk.connect(wet);
    mk.connect(lp); lp.connect(drv); drv.connect(ws); ws.connect(sat); sat.connect(wet);
    upd=a=>{ prox.gain.value=4+6*a; cut.gain.value=-2*a; cmp.threshold.value=-6-14*a; mk.gain.value=Math.pow(10,(1+3*a)/20); drv.gain.value=1+4*a; sat.gain.value=0.3*a; dry.gain.value=0; wet.gain.value=0.7; };
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
function fxNames(t){ const l=t.fxs.filter(sl=>sl.type!=='none').map(sl=>((FX_LIST.find(f=>f[0]===sl.type)||[0,''])[1]).split(' (')[0]); if(t.speed&&t.speed!==1) l.unshift('Vitesse '+Math.round(t.speed*100)+' %'); if(t.pitch) l.unshift('Ton '+(t.pitch>0?'+':'')+t.pitch); return l.join(' + '); }
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
  if(songPlay) songStop(true);
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
  // on demande un signal brut : aucun traitement « téléphone » (écho, bruit, volume automatique, isolation de la voix)
  const base={echoCancellation:false,noiseSuppression:false,autoGainControl:false,voiceIsolation:false,sampleRate:{ideal:48000},latency:{ideal:0.01},
    advanced:[{googEchoCancellation:false,googAutoGainControl:false,googAutoGainControl2:false,googNoiseSuppression:false,googHighpassFilter:false,googTypingNoiseDetection:false}]};
  if(micId){
    try{ return await navigator.mediaDevices.getUserMedia({audio:{...base,deviceId:{exact:micId}}}); }
    catch(e){ micId=''; msg("Le micro choisi n'est plus disponible : retour au micro par défaut."); }
  }
  return await navigator.mediaDevices.getUserMedia({audio:base});
}
async function ensureMic(){
  try{ await ctx.resume(); }catch(e){}
  // un micro USB débranché/rebranché laisse un flux « mort » : on le jette et on rouvre au lieu de garder le silence
  if(micStream&&!micAlive()) dropMic();
  if(micStream) return true;
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){ msg("Micro indisponible dans cette vue."); return false; }
  try{ micStream=await openStream(); }
  catch(e){ micStream=null; msg("Micro refusé ou bloqué ("+(e.name||'erreur')+"). Autorise-le dans les réglages du navigateur."); return false; }
  micSrc=ctx.createMediaStreamSource(micStream);
  try{ micStream.getAudioTracks().forEach(tr=>{ tr.onended=()=>{ if(micStream&&micStream.getAudioTracks().indexOf(tr)>=0){ dropMic(); if(!recObj) setTimeout(()=>{ if(!micStream) ensureMic().then(ok=>{ if(ok){ showMicUsed(); msg('Micro reconnecté : '+(($('#micused')||{}).textContent||'').replace(/^Micro utilisé : /,'')); } }); },700); } }; }); }catch(e){}
  let engNotice=false;
  if(!inGainNode){
    inGainNode=ctx.createGain(); inGainNode.gain.value=ingain;
    hpNode=ctx.createBiquadFilter(); hpNode.type='highpass'; hpNode.Q.value=-3.01; // dans Web Audio, Q du passe-haut est en dB : −3 dB = réponse plate (Butterworth)
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
function micAlive(){ try{ const tr=micStream.getAudioTracks(); return tr.length>0&&tr.every(t=>t.readyState!=='ended'); }catch(e){ return true; } }
function dropMic(){ try{ (micStream.getTracks?micStream.getTracks():[]).forEach(tr=>{ tr.onended=null; tr.stop(); }); }catch(e){} try{ micSrc.disconnect(); }catch(e){} micStream=null; micSrc=null; }
async function reopenMic(){
  if(recObj){ msg("Termine l'enregistrement avant de changer de micro."); return; }
  if(micStream) dropMic();
  if(await ensureMic()){ showMicUsed(); msg('Micro activé : '+($('#micsel').selectedOptions[0]||{}).textContent+'.'); }
}
async function listMics(){
  const sel=$('#micsel'); if(!sel||!navigator.mediaDevices||!navigator.mediaDevices.enumerateDevices) return;
  try{
    const all=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='audioinput'); rawMics=all.map(d=>(d.label||'(sans nom)')+(d.deviceId==='default'?' [par défaut]':d.deviceId==='communications'?' [appels]':d.deviceId?'':' [identifiant caché]'));
    const devs=all.filter(d=>d.deviceId&&d.deviceId!=='default'&&d.deviceId!=='communications');
    sel.innerHTML='<option value="">Micro par défaut</option>'+devs.map((d,k)=>`<option value="${d.deviceId.replace(/"/g,'')}"></option>`).join('');
    devs.forEach((d,k)=>{ sel.options[k+1].textContent=d.label||('Micro '+(k+1)); });
    sel.value=devs.some(d=>d.deviceId===micId)?micId:'';
    showMicUsed(devs.length);
  }catch(e){}
}
// nom du micro réellement utilisé (le navigateur le donne une fois le micro autorisé)
let rawMics=null;
function micSettings(){ try{ const tr=micStream&&micStream.getAudioTracks?micStream.getAudioTracks()[0]:null; return tr&&tr.getSettings?tr.getSettings():null; }catch(e){ return null; } }
function micProcessingWarn(s){ if(!s) return ''; const on=[]; if(s.echoCancellation===true) on.push('suppression d\'écho'); if(s.noiseSuppression===true) on.push('réduction de bruit'); if(s.autoGainControl===true) on.push('volume automatique'); if(s.voiceIsolation===true) on.push('isolation de la voix'); return on.length?'⚠ Le navigateur applique encore : '+on.join(', ')+' (il ignore la demande de l\'appli). Ces traitements « téléphone » abîment le beatbox.':''; }
function showMicUsed(n){
  const e=$('#micused'); if(!e) return;
  let lab='';
  try{ const tr=micStream&&micStream.getAudioTracks?micStream.getAudioTracks()[0]:null; lab=tr&&tr.label?tr.label:''; }catch(x){}
  if(!micStream){ e.textContent='Touche « Chercher les micros » (ou fais une prise) pour autoriser le micro et voir la liste.'; return; }
  const pw=micProcessingWarn(micSettings());
  e.textContent='Micro utilisé : '+(lab||'celui choisi par la tablette (le navigateur ne donne pas son nom)')+(n===0?'. Le navigateur ne fournit pas la liste des micros : sur Android, un micro USB branché est en général utilisé automatiquement comme « Micro par défaut ».':'.')+(rawMics?' — Ce que le navigateur annonce ('+rawMics.length+') : '+(rawMics.join(' · ')||'rien')+'.':'')+(pw?' '+pw:'');
}
// analyse du signal BRUT du micro : écrêtage avant l'appli (crêtes tassées contre un plafond, même s'il est sous 1) et souffle d'air (infrason)
function rawCheck(x){
  const n=x.length; if(n<SR*0.3) return null;
  let pk=0; for(let i=0;i<n;i++){ const v=x[i]<0?-x[i]:x[i]; if(v>pk) pk=v; }
  if(pk<0.15) return {pk,clip:0,runs:0,infra:0,aud:pk};
  let near=0, runs=0, run=0; const th=pk*0.985;
  for(let i=0;i<n;i++){ const v=x[i]<0?-x[i]:x[i]; if(v>=th){ near++; run++; } else { if(run>=3) runs++; run=0; } }
  // infrason : passe-bas 12 Hz (2 pôles simples), et le reste = ce qu'on entend
  const a=1-Math.exp(-2*Math.PI*12/SR); let y1=0,y2=0, ipk=0, apk=0;
  for(let i=0;i<n;i++){ y1+=a*(x[i]-y1); y2+=a*(y1-y2); const lo=y2<0?-y2:y2, hi=x[i]-y2, ah=hi<0?-hi:hi; if(lo>ipk) ipk=lo; if(ah>apk) apk=ah; }
  return {pk,clip:near,runs,infra:ipk,aud:apk,clipped:runs>=4||near>n*0.002};
}
function rawAdvice(r){
  if(!r) return '';
  const L=[];
  if(r.clipped) L.push('⚠ Le son est écrêté AVANT l\'appli (dans le micro ou la tablette) : ses crêtes butent sur un plafond, d\'où le son déformé. L\'appli ne peut pas le réparer.');
  if(r.infra>0.2&&r.infra>0.4*r.aud) L.push('⚠ Gros souffle d\'air dans le micro (vague d\'air inaudible, plus forte que tes sons) : c\'est elle qui fait saturer. Solution : une bonnette en mousse ou un filtre anti-pop, et ne souffle pas droit dans la grille (bouche de biais, à 5-10 cm, face au logo).');
  return L.join(' ');
}
// ----- test de fidélité : 4 s enregistrées en même temps « brut » (sortie du micro) et « après l'appli » -----
let fidRes=null;
function specInfo(x){
  const N=4096; if(x.length<N*2) return null; const S=new Float64Array(N/2+1);
  for(let k=0;k+N<=x.length;k+=N/2){ const re=new Float64Array(N), im=new Float64Array(N); for(let i=0;i<N;i++) re[i]=x[k+i]*(0.5-0.5*Math.cos(2*Math.PI*i/(N-1)));
    // FFT radix-2
    for(let i=1,j=0;i<N;i++){ let bit=N>>1; for(;j&bit;bit>>=1) j^=bit; j^=bit; if(i<j){ const t=re[i]; re[i]=re[j]; re[j]=t; } }
    for(let len=2;len<=N;len<<=1){ const ang=-2*Math.PI/len, wr=Math.cos(ang), wi=Math.sin(ang); for(let i=0;i<N;i+=len){ let cr=1,ci=0; for(let j=0;j<len/2;j++){ const ur=re[i+j], ui=im[i+j], vr=re[i+j+len/2]*cr-im[i+j+len/2]*ci, vi=re[i+j+len/2]*ci+im[i+j+len/2]*cr; re[i+j]=ur+vr; im[i+j]=ui+vi; re[i+j+len/2]=ur-vr; im[i+j+len/2]=ui-vi; const nr=cr*wr-ci*wi; ci=cr*wi+ci*wr; cr=nr; } } }
    for(let i=0;i<=N/2;i++) S[i]+=re[i]*re[i]+im[i]*im[i]; }
  const bin=SR/N, band=(a,b)=>{ let s=0; for(let i=Math.ceil(a/bin);i<=Math.min(N/2,Math.floor(b/bin));i++) s+=S[i]; return s; }, tot=band(150,5000)||1e-12; // repère : les médiums
  let mx=0; for(let i=1;i<=N/2;i++) mx=Math.max(mx,S[i]); let roll=0; for(let i=N/2;i>0;i--){ if(S[i]>mx*1e-6){ roll=i*bin; break; } }
  return {sub:10*Math.log10(band(20,60)/tot), low:10*Math.log10(band(60,150)/tot), high:10*Math.log10(band(5000,SR/2)/tot), roll};
}
async function fidTest(){
  if(recObj){ msg('Termine d\'abord l\'enregistrement en cours.'); return; }
  if(!(await ensureMic())) return;
  if(!(await ensureWorklet())){ msg('Ce navigateur ne permet pas ce test (moteur AudioWorklet absent).'); return; }
  const btn=$('#fidtest'); btn.disabled=true;
  const sink=ctx.createGain(); sink.gain.value=0; sink.connect(ctx.destination);
  const mk=src=>{ const node=new AudioWorkletNode(ctx,'lb-cap',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1],channelCount:1,channelCountMode:'explicit'}), parts=[]; node.port.onmessage=e=>parts.push(e.data.d); src.connect(node); node.connect(sink); return {node,parts,src}; };
  const raw=mk(micSrc), proc=mk(hpNode);
  for(let k=4;k>0;k--){ msg('Test de fidélité : fais ton beatbox maintenant… '+k); await new Promise(r=>setTimeout(r,1000)); }
  [raw,proc].forEach(o=>{ try{ o.src.disconnect(o.node); o.node.disconnect(); }catch(e){} }); await new Promise(r=>setTimeout(r,120)); try{ sink.disconnect(); }catch(e){}
  const join=p=>{ let n=0; p.forEach(d=>n+=d.length); const o=new Float32Array(n); let k=0; p.forEach(d=>{ o.set(d,k); k+=d.length; }); return o; };
  const R=join(raw.parts), Q=join(proc.parts); btn.disabled=false;
  if(R.length<SR){ msg('Le test n\'a pas reçu de son du micro.'); return; }
  const pk=x=>{ let m=0; for(let i=0;i<x.length;i++){ const v=x[i]<0?-x[i]:x[i]; if(v>m) m=v; } return m; }, nclip=x=>{ let c=0; for(let i=0;i<x.length;i++) if(Math.abs(x[i])>=0.999) c++; return c; };
  const s=micSettings()||{}, a=specInfo(R), b=specInfo(Q), pR=pk(R), pQ=pk(Q), db=v=>(20*Math.log10(v||1e-9)).toFixed(1).replace('.',',');
  const L=[];
  L.push('Micro : '+(s.deviceId&&micStream.getAudioTracks()[0].label||'micro par défaut')+' · '+(s.sampleRate||'?')+' Hz · '+(s.channelCount||'?')+' canal(aux) · appli '+SR+' Hz');
  L.push('Traitements du navigateur : écho '+(s.echoCancellation===true?'⚠ OUI':'non')+', bruit '+(s.noiseSuppression===true?'⚠ OUI':'non')+', volume auto '+(s.autoGainControl===true?'⚠ OUI':'non')+(s.voiceIsolation!=null?', isolation voix '+(s.voiceIsolation?'⚠ OUI':'non'):''));
  const rc=rawCheck(R);
  L.push('Brut (sortie du micro) : crête '+db(pR)+' dB'+(rc&&rc.clipped?' ⚠ ÉCRÊTÉ ('+rc.runs+' crêtes coupées net contre un plafond)':pR>=0.94?' ⚠ AU MAXIMUM : baisse le gain sur le micro (visé : entre −12 et −6 dB)':pR<0.1?' (faible : tu peux monter le gain du micro)':' (bon niveau, pas d\'écrêtage)')+(rc?' · souffle d\'air (infrason) '+db(rc.infra)+' dB, sons audibles '+db(rc.aud)+' dB':''));
  { const ad=rawAdvice(rc); if(ad) L.push(ad); }
  if(a) L.push('Brut (niveaux par rapport aux médiums) : graves 20-60 Hz '+a.sub.toFixed(0)+' dB, 60-150 Hz '+a.low.toFixed(0)+' dB, aigus >5 kHz '+a.high.toFixed(0)+' dB, son jusqu\'à '+String(Math.round(a.roll/100)/10).replace('.',',')+' kHz'+(a.roll<9000?' ⚠ bande étroite (traitement « téléphone » probable)':''));
  if(a&&b) L.push('Après l\'appli : crête '+db(pQ)+' dB (gain '+(pR>0?(pQ/pR).toFixed(2).replace('.',','):'?')+'×), graves 20-60 Hz '+b.sub.toFixed(0)+' dB ('+(b.sub-a.sub>=0?'+':'')+(b.sub-a.sub).toFixed(1).replace('.',',')+'), aigus '+(b.high-a.high>=0?'+':'')+(b.high-a.high).toFixed(1).replace('.',',')+' dB : '+(Math.abs(b.sub-a.sub)<1.5&&Math.abs(b.high-a.high)<1.5?'l\'appli ne change pas le son ✓':'⚠ l\'appli modifie le son'));
  L.push('Sortie : '+(safeLim?'limiteur de sécurité actif ('+safeLim+')':'pas de limiteur')+(ctx.outputLatency?' · latence de sortie '+Math.round(ctx.outputLatency*1000)+' ms':''));
  const w=micProcessingWarn(s); if(w) L.push(w);
  fidRes={R,Q};
  const box=$('#fidout'); box.hidden=false; box.innerHTML=''; L.forEach(t=>{ const p=document.createElement('div'); p.textContent=t; box.appendChild(p); });
  const row=document.createElement('div'); row.className='row wrap';
  [['▶ Brut','R'],['▶ Après l\'appli','Q']].forEach(([l,k])=>{ const bt=document.createElement('button'); bt.textContent=l; bt.onclick=()=>fidPlay(k); row.appendChild(bt); });
  const dl=document.createElement('button'); dl.innerHTML=ic('download')+' Les deux en fichiers'; dl.onclick=async()=>{
    // partage des deux WAV (menu du téléphone : Fichiers, Drive, WhatsApp…), sinon .zip téléchargé ; chaque échec est expliqué
    try{
      if(!fidRes||!fidRes.R) throw new Error('refais le test, le résultat n\'est plus en mémoire');
      const mkb=x=>{ const b=ctx.createBuffer(1,x.length,SR); b.copyToChannel(x,0); return b; };
      const w1=wav16(mkb(fidRes.R)), w2=wav16(mkb(fidRes.Q));
      let files=null; try{ files=[new File([w1],'1-brut-micro.wav',{type:'audio/wav'}),new File([w2],'2-apres-appli.wav',{type:'audio/wav'})]; }catch(e){}
      let can=false; try{ can=!!(files&&navigator.canShare&&navigator.share&&navigator.canShare({files})); }catch(e){}
      if(can){ try{ await navigator.share({files,title:'Test de fidélité LoopBox'}); msg('Fichiers du test partagés.'); return; }catch(e){ if(e&&e.name==='AbortError'){ msg('Partage annulé.'); return; } } }
      downloadBlob(new Blob([makeZipMulti([{name:'1-brut-micro.wav',data:w1},{name:'2-apres-appli.wav',data:w2}])],{type:'application/zip'}),'test-fidelite-micro.zip');
      msg('« test-fidelite-micro.zip » envoyé dans tes Téléchargements (regarde la notification de téléchargement du navigateur).');
    }catch(e){ msg('Fichiers du test impossibles à créer : '+((e&&e.message)||e)+'.'); }
  };
  row.appendChild(dl); box.appendChild(row);
  msg('Test terminé : compare « Brut » et « Après l\'appli » au casque. Les deux sont joués au même volume, sans passer par les pistes.');
}
let fidSrc=null;
function fidPlay(k){
  if(!fidRes) return; try{ ctx.resume(); }catch(e){}
  if(fidSrc){ try{ fidSrc.stop(); }catch(e){} fidSrc=null; }
  const x=fidRes[k]; let pk=0; for(let i=0;i<x.length;i++) pk=Math.max(pk,Math.abs(x[i]));
  const y=new Float32Array(x.length), g=pk>0?0.7/pk:1; for(let i=0;i<x.length;i++) y[i]=x[i]*g;
  const b=ctx.createBuffer(1,y.length,SR); b.copyToChannel(y,0); const s=ctx.createBufferSource(); s.buffer=b; s.connect(ctx.destination); s.start(); fidSrc=s;
}
async function scanMics(){
  if(recObj) return;
  if(!(await ensureMic())) return;
  if(!micId) await reopenMic();
  await listMics();
  const n=$('#micsel').options.length-1;
  msg(n?n+' micro'+(n>1?'s':'')+' trouvé'+(n>1?'s':'')+'. Choisis le tien dans la liste « Micro ».':'Aucun autre micro proposé par le navigateur : le micro par défaut est utilisé.');
}
if(navigator.mediaDevices){
  navigator.mediaDevices.ondevicechange=async()=>{
    await listMics();
    // un micro vient d'être branché ou débranché : si aucun micro précis n'est choisi, on repasse sur celui par défaut (souvent le micro USB)
    // (avant : seulement sans micro choisi ; un micro USB choisi puis rebranché restait muet)
    if(micStream&&!recObj){
      let ids=[]; try{ ids=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='audioinput').map(d=>d.deviceId); }catch(e){}
      if(!micId||!micAlive()||(micId&&ids.length&&ids.indexOf(micId)<0)){ if(micId&&ids.length&&ids.indexOf(micId)<0) micId=''; await reopenMic(); await listMics(); msg('Micro branché ou débranché : '+($('#micused').textContent||'').replace(/^Micro utilisé : /,'micro utilisé : ')); }
    }
  };
}
// Le processeur reçoit le son du micro par blocs de 128 échantillons, chacun avec son numéro exact
// dans la ligne de temps du moteur audio (currentFrame) : plus besoin d'estimer le temps.
const WORKLET_SRC=`// limiteur de sécurité en sortie : ne touche à rien sous -0,3 dB, rabote les crêtes sans les écrêter (anticipation de 3 ms)
class LbLim extends AudioWorkletProcessor{
  constructor(){ super(); const sr=sampleRate; this.L=Math.max(16,Math.round(0.003*sr)); this.N=this.L+1; this.d0=new Float32Array(this.N); this.d1=new Float32Array(this.N); this.w=0;
    this.qi=new Int32Array(this.N+2); this.qv=new Float32Array(this.N+2); this.qh=0; this.qt=0; this.k=0; this.g=1; this.ceil=0.966; this.att=1-Math.exp(-1/(0.0008*sr)); this.rel=1-Math.exp(-1/(0.12*sr)); this.minG=1; this.rep=0; this.rk=Math.round(0.25*sr); }
  process(inputs,outputs){
    const i0=inputs[0]||[], o=outputs[0], a=i0[0], b=i0[1]||a, oa=o[0], ob=o[1]||o[0], n=oa.length, N=this.N, L=this.L, cap=N+2;
    for(let i=0;i<n;i++){
      const x0=a?a[i]:0, x1=b?b[i]:0, v=Math.max(x0<0?-x0:x0,x1<0?-x1:x1), k=this.k++;
      while(this.qt!==this.qh&&this.qv[(this.qt-1+cap)%cap]<=v) this.qt=(this.qt-1+cap)%cap;
      this.qi[this.qt]=k; this.qv[this.qt]=v; this.qt=(this.qt+1)%cap;
      while(this.qi[this.qh]<=k-N) this.qh=(this.qh+1)%cap;
      const pk=this.qv[this.qh], need=pk>this.ceil?this.ceil/pk:1;
      this.g+=(need-this.g)*(need<this.g?this.att:this.rel);
      const w=this.w, y0=this.d0[w], y1=this.d1[w]; this.d0[w]=x0; this.d1[w]=x1; this.w=(w+1)%N;
      let u0=y0*this.g, u1=y1*this.g; if(u0>0.99) u0=0.99; else if(u0<-0.99) u0=-0.99; if(u1>0.99) u1=0.99; else if(u1<-0.99) u1=-0.99;
      oa[i]=u0; if(ob!==oa) ob[i]=u1;
      if(this.g<this.minG) this.minG=this.g;
    }
    this.rep+=n; if(this.rep>=this.rk){ this.rep=0; if(this.minG<0.999) this.port.postMessage({red:-20*Math.log10(this.minG)}); this.minG=1; }
    return true;
  }
}
registerProcessor('lb-lim',LbLim);
class LbCap extends AudioWorkletProcessor{
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
async function ensureWorklet(){
  if(workletReady) return true;
  if(!(ctx.audioWorklet&&typeof AudioWorkletNode!=='undefined')) return false;
  try{ const url=URL.createObjectURL(new Blob([WORKLET_SRC],{type:'application/javascript'})); await ctx.audioWorklet.addModule(url); workletReady=true; return true; }catch(e){ return false; }
}
// même limiteur, pour les exports (calculé après le rendu)
function limitBuffer(r){
  const sr=r.sampleRate, L=Math.max(16,Math.round(0.003*sr)), n=r.length, ch=[]; for(let c=0;c<r.numberOfChannels;c++) ch.push(r.getChannelData(c));
  const pk=new Float32Array(n); for(let i=0;i<n;i++){ let v=0; for(const d of ch){ const x=d[i]<0?-d[i]:d[i]; if(x>v) v=x; } pk[i]=v; }
  let any=false; for(let i=0;i<n;i++) if(pk[i]>0.966){ any=true; break; } if(!any) return 0;
  // maximum glissant sur les 3 ms à venir
  const ahead=new Float32Array(n), q=new Int32Array(n+1); let h=0,t=0;
  for(let i=n-1;i>=0;i--){ while(t>h&&pk[q[t-1]]<=pk[i]) t--; q[t++]=i; while(q[h]>i+L) h++; ahead[i]=pk[q[h]]; }
  const att=1-Math.exp(-1/(0.0008*sr)), rel=1-Math.exp(-1/(0.12*sr)); let g=1, mn=1;
  const gs=new Float32Array(n); for(let i=0;i<n;i++){ const need=ahead[i]>0.966?0.966/ahead[i]:1; g+=(need-g)*(need<g?att:rel); gs[i]=g; if(g<mn) mn=g; }
  for(const d of ch) for(let i=0;i<n;i++){ let u=d[i]*gs[i]; if(u>0.99) u=0.99; else if(u<-0.99) u=-0.99; d[i]=u; }
  return -20*Math.log10(mn);
}
let safeLim='', limT=null;
function limReport(d){ const e=$('#limst'); if(!e||!d||!(d.red>0.5)) return; e.hidden=false; e.textContent='Limiteur de sécurité : crêtes réduites de '+d.red.toFixed(1).replace('.',',')+' dB pour éviter la saturation. Si ça arrive souvent, baisse un peu le volume général ou celui des pistes.'; clearTimeout(limT); limT=setTimeout(()=>{ e.hidden=true; },4000); }
async function setupLimiter(){
  if(safeLim) return;
  if(await ensureWorklet()){
    try{ const lim=new AudioWorkletNode(ctx,'lb-lim',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2],channelCount:2,channelCountMode:'explicit'});
      lim.port.onmessage=e=>limReport(e.data);
      try{ chain.out.disconnect(ctx.destination); }catch(e){}
      chain.out.connect(lim); lim.connect(ctx.destination); safeLim='worklet'; return; }catch(e){}
  }
  // repli (navigateur sans AudioWorklet) : compresseur rapide + arrondi doux des crêtes
  try{ const c=ctx.createDynamicsCompressor(); c.threshold.value=-1; c.knee.value=0; c.ratio.value=20; c.attack.value=0.001; c.release.value=0.1;
    const g=ctx.createGain(); g.gain.value=0.937; const ws=ctx.createWaveShaper(); const N=2049, cv=new Float32Array(N); for(let i=0;i<N;i++){ const x=i/(N-1)*2-1, ax=Math.abs(x); cv[i]=ax<0.9?x:Math.sign(x)*(0.9+0.09*Math.tanh((ax-0.9)/0.09)); } ws.curve=cv; ws.oversample='4x';
    try{ chain.out.disconnect(ctx.destination); }catch(e){}
    chain.out.connect(c); c.connect(g); g.connect(ws); ws.connect(ctx.destination); safeLim='compresseur'; }catch(e){}
}
async function setupCapture(srcNode){
  const sink=ctx.createGain(); sink.gain.value=0; sink.connect(ctx.destination);
  if(ctx.audioWorklet&&typeof AudioWorkletNode!=='undefined'){
    try{
      if(!(await ensureWorklet())) throw new Error('worklet');
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
  cap={blocks:[],check:capCheck,raw:[]};
  rawTapStart();
  lockUI();
}
let rawTap=null;
function rawTapStart(){
  rawTapStop(); if(!workletReady||!micSrc||typeof AudioWorkletNode==='undefined') return;
  try{ const sink=ctx.createGain(); sink.gain.value=0; sink.connect(ctx.destination);
    const node=new AudioWorkletNode(ctx,'lb-cap',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1],channelCount:1,channelCountMode:'explicit'}), parts=[];
    node.port.onmessage=e=>{ if(parts.length<6000) parts.push(e.data.d); }; micSrc.connect(node); node.connect(sink); rawTap={node,sink,parts}; }catch(e){ rawTap=null; }
}
function rawTapStop(){ if(!rawTap) return null; const t=rawTap; rawTap=null; try{ micSrc.disconnect(t.node); t.node.disconnect(); t.sink.disconnect(); }catch(e){} let n=0; t.parts.forEach(d=>n+=d.length); const o=new Float32Array(n); let k=0; t.parts.forEach(d=>{ o.set(d,k); k+=d.length; }); return o; }
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
  rawTapStop();
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
const MAXFILE=300;
async function importFile(t,file){
  if(recObj){ msg("Termine l'enregistrement en cours avant d'importer."); return; }
  if(file.size>250*1024*1024){ msg('Fichier trop lourd : 250 Mo maximum. Pour une vidéo, enregistre un passage plus court.'); return; }
  try{ await ctx.resume(); }catch(e){}
  msg('Lecture du fichier…');
  let ab;
  try{ ab=await ctx.decodeAudioData(await readFile(file)); }
  catch(e){ msg("Impossible de lire le son de ce fichier. Formats courants acceptés : MP3, WAV, M4A, OGG, et les vidéos MP4 / WebM (comme celles de l'enregistreur d'écran)."); return; }
  const n=Math.min(ab.length,MAXFILE*SR), mono=new Float32Array(n), nc=ab.numberOfChannels;
  for(let c=0;c<nc;c++){ const d=ab.getChannelData(c); for(let i=0;i<n;i++) mono[i]+=d[i]/nc; }
  for(let i=0;i<n;i++) mono[i]=clamp(mono[i],-1,1);
  let pk=0; for(let i=0;i<n;i++){ const v=Math.abs(mono[i]); if(v>pk) pk=v; }
  if(pk<0.001){ msg('Ce fichier semble silencieux (pour une vidéo d\'écran, vérifie que le son interne était bien activé).'); return; }
  msg(ab.length>n?'Fichier très long : seules les '+(MAXFILE/60)+' premières minutes sont chargées.':'');
  if(!loopLen){
    if(n<=MAXLOOP*SR){ importFirst(t.id,mono); return; }
    showPassage(t,mono,0); return;
  }
  const L=loopLen;
  if(Math.abs(n-L)/L<0.01){ applyImport(t,mono,'once'); return; }
  if(n>L){ showPassage(t,mono,L); return; }
  const box=$('.impbox',t.el), btns=$('.imbtns',t.el), txt=$('.imptxt',t.el);
  const dur=(n/SR).toFixed(1).replace('.',','), ld=(L/SR).toFixed(1).replace('.',',');
  btns.innerHTML='';
  const add=(label,fn,primary)=>{ const b=document.createElement('button'); b.textContent=label; if(primary) b.className='primary'; b.onclick=()=>{ box.hidden=true; fn(); }; btns.appendChild(b); };
  txt.textContent='Ton fichier dure '+dur+' s, la boucle '+ld+' s. Comment le placer ?';
  add('Une fois, depuis le début',()=>applyImport(t,mono,'once'),true);
  add('Répéter pour remplir',()=>applyImport(t,mono,'repeat'));
  add('Annuler',()=>{});
  box.hidden=false;
}
// écoute d'un passage avant de l'importer
let impListen=null;
function stopListen(){ if(!impListen) return; try{ impListen.src.stop(); }catch(e){} try{ impListen.src.disconnect(); }catch(e){} const b=impListen.btn; impListen=null; if(b) b.textContent='▶ Écouter le passage'; }
function fmtClock(x){ const s=x/SR, m=Math.floor(s/60); return m+':'+(s-m*60).toFixed(2).padStart(5,'0').replace('.',','); }
// choisir le passage d'un long fichier : fenêtre de la durée de la boucle (fixed), ou début et fin libres (première piste)
function showPassage(t,mono,fixed){
  const box=$('.impbox',t.el), btns=$('.imbtns',t.el), txt=$('.imptxt',t.el), N=mono.length;
  const W=fixed||Math.min(N,Math.round(10*SR)), st={a:0,b:W};
  let cv=$('.impc',t.el);
  if(!cv){ cv=document.createElement('canvas'); cv.className='impc'; cv.style.cssText='width:100%;height:90px;display:block;margin-top:10px;border-radius:10px;background:rgba(255,255,255,.05);touch-action:none'; txt.after(cv); }
  const BINS=1200, pk=new Float32Array(BINS), step=N/BINS; let mx=0.05;
  for(let i=0;i<BINS;i++){ let m=0; const a=Math.floor(i*step), z=Math.min(N,Math.floor((i+1)*step)); for(let j=a;j<z;j+=16){ const v=Math.abs(mono[j]); if(v>m) m=v; } pk[i]=m; if(m>mx) mx=m; }
  const draw=()=>{
    txt.textContent='Choisis le passage : '+fmtClock(st.a)+' → '+fmtClock(st.b)+' ('+((st.b-st.a)/SR).toFixed(2).replace('.',',')+' s'+(fixed?', la durée de ta boucle':'')+') sur '+fmtClock(N)+'.';
    const dpr=window.devicePixelRatio||1, w=Math.floor(cv.clientWidth*dpr), hh=Math.floor(cv.clientHeight*dpr); if(!w||!hh) return;
    cv.width=w; cv.height=hh; const g=cv.getContext('2d'); g.clearRect(0,0,w,hh);
    g.fillStyle='#9b968d'; for(let x=0;x<w;x++){ const v=pk[Math.min(BINS-1,Math.floor(x/w*BINS))]/mx*hh*0.85; g.fillRect(x,(hh-v)/2,1,Math.max(1,v)); }
    const X=v=>v/N*w; g.fillStyle='rgba(255,138,0,.22)'; g.fillRect(X(st.a),0,X(st.b)-X(st.a),hh);
    g.fillStyle='#FF8A00'; g.fillRect(X(st.a)-1.5*dpr,0,3*dpr,hh); g.fillRect(X(st.b)-1.5*dpr,0,3*dpr,hh);
  };
  const setA=v=>{ v=Math.round(v); if(fixed){ st.a=clamp(v,0,N-W); st.b=st.a+W; } else { st.a=clamp(v,0,st.b-Math.round(0.25*SR)); if(st.b-st.a>MAXLOOP*SR) st.b=st.a+MAXLOOP*SR; } stopListen(); draw(); };
  const setB=v=>{ st.b=clamp(Math.round(v),st.a+Math.round(0.25*SR),Math.min(N,st.a+MAXLOOP*SR)); stopListen(); draw(); };
  let drag=null;
  cv.onpointerdown=ev=>{ const r=cv.getBoundingClientRect(), p=clamp((ev.clientX-r.left)/(r.width||1),0,1)*N; try{ cv.setPointerCapture(ev.pointerId); }catch(e){}
    drag=fixed?{w:'win',d:p-st.a}:{w:Math.abs(p-st.a)<=Math.abs(p-st.b)?'a':'b'}; if(!fixed){ if(drag.w==='a') setA(p); else setB(p); } };
  cv.onpointermove=ev=>{ if(!drag) return; const r=cv.getBoundingClientRect(), p=clamp((ev.clientX-r.left)/(r.width||1),0,1)*N; if(drag.w==='win') setA(p-drag.d); else if(drag.w==='a') setA(p); else setB(p); };
  cv.onpointerup=cv.onpointercancel=()=>{ drag=null; };
  btns.innerHTML='';
  const mk=(label,fn,cls)=>{ const b=document.createElement('button'); b.textContent=label; if(cls) b.className=cls; b.onclick=fn; btns.appendChild(b); return b; };
  const row=lab=>{ const d=document.createElement('div'); d.className='row wrap'; d.style.width='100%'; const s0=document.createElement('span'); s0.className='lbl w2'; s0.textContent=lab; d.appendChild(s0); btns.appendChild(d); return d; };
  const nudges=(lab,fn,which)=>{ const r=row(lab); [[-1,'−1 s'],[-0.1,'−0,1 s'],[-0.01,'−10 ms'],[0.01,'+10 ms'],[0.1,'+0,1 s'],[1,'+1 s']].forEach(([d,l])=>{ const b=document.createElement('button'); b.textContent=l; b.className='impn'; b.dataset.w=which; b.dataset.d=d; b.onclick=()=>fn(d*SR); r.appendChild(b); }); };
  nudges(fixed?'Passage':'Début',d=>setA(st.a+d),'a');
  if(!fixed) nudges('Fin',d=>setB(st.b+d),'b');
  const r2=row('');
  const lb=document.createElement('button'); lb.textContent='▶ Écouter le passage'; lb.className='implisten';
  lb.onclick=()=>{
    if(impListen){ stopListen(); return; }
    try{ ctx.resume(); }catch(e){}
    const len=st.b-st.a, bb=ctx.createBuffer(1,len,SR); bb.copyToChannel(mono.subarray(st.a,st.b),0);
    const src=ctx.createBufferSource(); src.buffer=bb; src.connect(chain.inp); src.start(ctx.currentTime+0.03);
    src.onended=()=>{ if(impListen&&impListen.src===src) stopListen(); };
    impListen={src,btn:lb}; lb.textContent='■ Arrêter l\'écoute';
  };
  r2.appendChild(lb);
  const use=document.createElement('button'); use.textContent='✓ Utiliser ce passage'; use.className='primary impuse';
  use.onclick=()=>{ stopListen(); box.hidden=true; cv.remove(); const slice=mono.slice(st.a,st.b); if(loopLen) applyImport(t,slice,'once'); else importFirst(t.id,slice); };
  r2.appendChild(use);
  if(fixed){ const k=Math.ceil((N-st.a)/baseLen-0.01), kk=Math.min(8,Math.floor(MAXLOOP*SR/baseLen)); if(k>=2&&kk>=2){ const gb=document.createElement('button'); gb.textContent='Allonger la boucle pour garder plus'; gb.onclick=()=>{ stopListen(); const kx=Math.min(kk,Math.ceil((N-st.a)/baseLen-0.01)); setRepAll(kx); if(rep===kx){ box.hidden=true; cv.remove(); applyImport(t,mono.slice(st.a,st.a+loopLen),'once'); } }; r2.appendChild(gb); } }
  const cancel=document.createElement('button'); cancel.textContent='Annuler'; cancel.onclick=()=>{ stopListen(); box.hidden=true; cv.remove(); }; r2.appendChild(cancel);
  box.hidden=false; draw();
  try{ box.scrollIntoView({behavior:'smooth',block:'center'}); }catch(e){}
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
// suivi des temps d'un jeu au tempo variable (non bouclé) : tempo moyen par autocorrélation, puis chemin des temps par programmation dynamique
function followBeats(x){
  const hop=256, F=Math.floor(x.length/hop); if(F<200) return null;
  const e=new Float32Array(F), env=new Float32Array(F);
  for(let j=0;j<F;j++){ let s=0; const a=j*hop; for(let i=0;i<hop;i++){ const v=x[a+i]; s+=v*v; } e[j]=Math.log(1+2000*Math.sqrt(s/hop)); }
  for(let j=2;j<F;j++) env[j]=Math.max(0,e[j]-Math.max(e[j-1],e[j-2]));
  let m=0; for(let j=0;j<F;j++) m+=env[j]; m/=F; let sd=0; for(let j=0;j<F;j++) sd+=(env[j]-m)**2; sd=Math.sqrt(sd/F)||1;
  const en=new Float32Array(F); for(let j=0;j<F;j++) en[j]=(env[j]-m)/sd;
  const fps=SR/hop, lmin=Math.floor(fps*60/200), lmax=Math.ceil(fps*60/55), ac=new Float32Array(lmax+2);
  for(let l=lmin;l<=lmax+1;l++){ let s=0; for(let j=0;j+l<F;j++) s+=en[j]*en[j+l]; ac[l]=s/(F-l); }
  let best=-1e9, P=0;
  for(let l=lmin;l<=lmax;l++){ const bpm=60*fps/l, w=Math.exp(-0.5*Math.pow(Math.log2(bpm/110)/0.9,2)); const sc=w*(ac[l]+0.5*(2*l<=lmax+1?ac[2*l]:0)); if(sc>best){ best=sc; P=l; } }
  // affinage du tempo moyen (lissage parabolique)
  if(P>lmin&&P<lmax){ const a=ac[P-1],b=ac[P],c=ac[P+1], d=a-2*b+c; if(d<0) P=P+0.5*(a-c)/d; }
  const alpha=35, lo=Math.max(1,Math.round(P*0.6)), hi=Math.round(P*1.6), S=new Float32Array(F), back=new Int32Array(F).fill(-1);
  for(let t=0;t<F;t++){ let bv=0, bi=-1; for(let d=lo;d<=hi&&t-d>=0;d++){ const v=S[t-d]-alpha*Math.pow(Math.log(d/P),2); if(bi<0||v>bv){ bv=v; bi=t-d; } } S[t]=en[t]+(bi>=0&&bv>0?bv:0); back[t]=bi>=0&&bv>0?bi:-1; }
  let tE=F-1, bs=-1e9; for(let t=Math.max(0,F-Math.round(P));t<F;t++) if(S[t]>bs){ bs=S[t]; tE=t; }
  const fr=[]; for(let t=tE;t>=0;t=back[t]){ fr.push(t); if(back[t]<0) break; } fr.reverse();
  // début : pas de temps avant la première vraie attaque
  const on=detectOnsets(x,x.length).map(o=>o.n);
  if(!on.length) return null;
  const first=on[0];
  const snapB=c=>{ let bp=c, bd=Math.round(0.03*SR), hit=false; on.forEach(n=>{ const d=Math.abs(n-c); if(d<bd){ bd=d; bp=n; hit=true; } }); return {p:bp,hit}; };
  const sb=fr.map(t=>snapB(t*hop+hop/2)).filter(b=>b.p>=first-Math.round(0.03*SR));
  while(sb.length&&!sb[sb.length-1].hit) sb.pop();
  const beats=sb.map(b=>b.p);
  if(beats.length<4) return null;
  const T=(beats[beats.length-1]-beats[0])/(beats.length-1)/SR;
  return {beats,T,period:P*hop/SR};
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
  // jeu au tempo variable : on suit chaque temps du musicien (la détection « tempo fixe » échoue ou se trompe)
  let fb=null;
  if(snap){ fb=followBeats(raw); if(fb&&fb.beats.length<5) fb=null; }
  let vary=0;
  if(fb){ const iv=[]; for(let k=1;k<fb.beats.length;k++) iv.push(fb.beats[k]-fb.beats[k-1]); iv.sort((a,b)=>a-b); vary=iv[Math.floor(iv.length*0.9)]/iv[Math.floor(iv.length*0.1)]-1; }
  if(fb&&(!an||vary>0.06||Math.abs(Math.log(an.T/fb.T))>0.05)){
    const last=fb.beats[fb.beats.length-1], n=fb.beats.length-1+((raw.length-last)>=0.85*fb.T*SR?1:0), o1=fb.beats[0], pre=Math.round(0.003*SR);
    masterTake={i,ref:tracks[i],raw,tp,anchor:o1,pre:Math.min(pre,o1),T:fb.T,s:0,n,rep:1,det:true};
    buildFromSel();
    msg('Rythme détecté : '+n+' temps à '+(60/fb.T).toFixed(1).replace('.',',')+' BPM en moyenne.'+(vary>0.06?' Le tempo du musicien varie (jusqu\'à '+Math.round(vary*100)+' % d\'écart entre ses temps) : pour caler chaque temps sur la grille, utilise « Caler sur le tempo du morceau » (onglet Temps de la piste).':''));
  } else if(an){
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
  if(m.det&&!m.free){
    const c=Math.round(m.anchor+m.s*Tn), w=Math.round(0.03*SR), a=Math.max(0,c-w), b=Math.min(m.raw.length,c+w);
    let pk=0; for(let i=a;i<b;i++){ const v=Math.abs(m.raw[i]); if(v>pk) pk=v; }
    if(pk>0.05){ for(let i=a;i<b;i++){ if(Math.abs(m.raw[i])>0.25*pk){ startS=i-m.pre; break; } } }
  }
  startS+=Math.round((m.nudge||0)*SR);
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
  return {song:songSnapData(),loopLen,beats,baseLen,baseBeats,rep,gridOff,mvol,fin,mt:masterTake?{...masterTake}:null,
    tr:tracks.map(t=>({t,buf:t.buf,sel:t.sel?{...t.sel}:null,selMode:t.selMode,off:t.off||0,anc:!!t.anc,speed:t.speed||1,pitch:t.pitch,vol:t.vol,panv:t.panv,mute:t.mute,solo:t.solo,
      fxs:t.fxs.map(f=>({type:f.type,amt:f.amt})),eqv:t.eqv.slice(),srcType:t.srcType,name:t.name,fadeIn:t.fadeIn,fadeOut:t.fadeOut,kind:t.kind||'rec',bass:t.bass?JSON.parse(JSON.stringify(t.bass)):null,voice:t.voice||null}))};
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
  if(sn.song){ songApplyData(sn.song); songCache.clear(); setTimeout(drawSong,0); }
  loopLen=sn.loopLen; beats=sn.beats; baseLen=sn.baseLen; baseBeats=sn.baseBeats; rep=sn.rep; gridOff=sn.gridOff||0;
  if(sn.mvol!=null){ mvol=sn.mvol; fin=sn.fin; chain.vol.gain.value=mvol; chain.setFin(fin); $('#mvol').value=mvol; showFin(); }
  masterTake=sn.mt?{...sn.mt}:null; loopHist=null;
  const map=new Map(sn.tr.map(x=>[x.t,x]));
  // une copie de piste créée après cet état (dupliquer, variation) disparaît vraiment quand on l'annule
  { const order=sn.tr.map(x=>x.t), extra=tracks.filter(t=>!map.has(t)&&!t.fromDup&&!t.histDel), gone=tracks.filter(t=>!map.has(t)&&(t.fromDup||t.histDel)&&!(recObj&&recObj.i===t.id));
    gone.forEach(t=>{ stopSrc(t); setLive(t,false); if(t.el){ edOut(t); t.el.remove(); } });
    const next=order.concat(extra);
    if(next.length&&(next.length!==tracks.length||next.some((t,i)=>tracks[i]!==t))){ tracks.length=0; next.forEach(t=>tracks.push(t)); reindexTracks(); applyGains(); }
  }
  updTrackBtns(); updFold();
  tracks.forEach(t=>{
    const x=map.get(t);
    t.buf=x?x.buf:null;
    t.sel=x&&x.sel?{...x.sel}:null; t.selMode=(x&&x.selMode)||'mute'; t.off=(x&&x.off)||0; t.anc=!!(x&&x.anc); t.speed=(x&&x.speed)||1; t.sp=null; t.po=null; t.pc=null; updOffUI(t); updSpeedUI(t);
    { const k=(x&&x.kind)||'rec', bs=x&&x.bass?JSON.parse(JSON.stringify(x.bass)):null, vo=(x&&x.voice)||null; if(k!==t.kind||JSON.stringify(bs)!==JSON.stringify(t.bass)||vo!==t.voice){ t.kind=k; t.bass=bs; t.voice=vo; t.bdraft=null; if(t.el){ setKindUI(t); if(isGen(t)) showBassOpts(t); } } }
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
// l'outil de coupe de la prise de base vit dans l'onglet Temps de sa piste (avant : un cadre à part, loin sur téléphone)
let edHome=null, edWas=false;
function edOut(t){ const e=document.getElementById('editor'); if(e&&edHome&&t.el&&t.el.contains(e)){ edHome.parentNode.insertBefore(e,edHome.nextSibling); edWas=false; } }
function placeEditor(ed){
  const e=$('#editor'); if(!e) return;
  if(!edHome){ edHome=document.createComment('editor'); e.parentNode.insertBefore(edHome,e); }
  const t=ed&&masterTake?tracks[masterTake.i]:null, slot=t&&t.el?$('.edslot',t.el):null;
  if(slot){ if(e.parentNode!==slot) slot.appendChild(e); }
  else if(e.parentNode!==edHome.parentNode||e.previousSibling!==edHome) edHome.parentNode.insertBefore(e,edHome.nextSibling);
  // juste après la prise de base : on ouvre directement l'onglet Temps de la piste
  if(slot&&!edWas){ const b=$('.tbody',t.el); if(b.hidden){ b.hidden=false; $('.tog',t.el).setAttribute('aria-expanded','true'); try{ updFold(); }catch(x){} } setTab(t,'cut'); }
  edWas=!!slot;
}
function drawEditor(){
  const m=masterTake; if(!m) return;
  { const e=$('#mnv'); if(e) e.textContent=fmtMs(m.nudge||0); }
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
  const fo=(m.nudge||0)/m.T, s0=drag?drag.s:m.s+fo, e0=drag?drag.e:m.s+m.n+fo;
  const sx=px(m.anchor+s0*Tn), ex=px(m.anchor+e0*Tn);
  g.fillStyle='rgba(232,71,43,.18)'; g.fillRect(sx,0,ex-sx,h);
  g.fillStyle='#e8472b'; g.fillRect(sx-1.5*dpr,0,3*dpr,h); g.fillRect(ex-1.5*dpr,0,3*dpr,h);
  { const r1=x=>Math.abs(x-Math.round(x))<0.005?String(Math.round(x)):x.toFixed(2).replace('.',','); $('#edlbl').textContent='Temps '+r1(s0+1)+' → '+r1(e0)+' ('+Math.round(e0-s0)+' temps)'+((m.rep||1)>1?' ×'+m.rep:''); }
}
(()=>{
  const ed=$('#edc');
  // aimanté : repères sur les temps ; libre : le début se place où on veut (au 1/1000 de temps), la longueur reste en temps entiers
  const free=()=>{ const c=$('#edsnap'); return !!c&&!c.checked; };
  const beatAt=ev=>{ const m=masterTake, r=ed.getBoundingClientRect(); const smp=(ev.clientX-r.left)/r.width*m.raw.length, v=(smp-m.anchor)/(m.T*SR); return free()?v:Math.round(v); };
  const move=ev=>{ const m=masterTake; if(!m||!drag) return; const b=beatAt(ev), L=selLimits(m);
    if(!free()){ if(drag.which==='s') drag.s=clamp(b,L.smin,drag.e-1); else drag.e=clamp(b,drag.s+1,L.emax); }
    else if(drag.which==='s'){ drag.s=clamp(b,L.smin-0.49,drag.e0-1); drag.e=drag.s+clamp(Math.round(drag.e0-drag.s),1,64); }
    else { drag.e=drag.s+clamp(Math.round(clamp(b,drag.s+0.5,L.emax+0.49)-drag.s),1,64); }
    drawEditor(); };
  ed.addEventListener('pointerdown',ev=>{ const m=masterTake; if(!m||recObj) return; try{ ed.setPointerCapture(ev.pointerId); }catch(e){}
    const fo=free()?(m.nudge||0)/m.T:0, b=beatAt(ev), s=m.s+fo, e=m.s+m.n+fo; drag={s,e,e0:e,which:Math.abs(b-s)<=Math.abs(b-e)?'s':'e'}; move(ev); });
  ed.addEventListener('pointermove',move);
  const end=()=>{ if(!drag) return; const d=drag; drag=null;
    if(!free()){ setSel(d.s,d.e); drawEditor(); return; }
    const m=masterTake; if(!m||recObj) return;
    const si=Math.round(d.s), n=Math.round(d.e-d.s), nud=Math.round((d.s-si)*m.T*1000)/1000;
    if(si===m.s&&n===m.n&&Math.abs(nud-(m.nudge||0))<0.0005){ drawEditor(); return; }
    pushHist(); m.s=si; m.n=n; m.nudge=nud; m.free=true; buildFromSel(); drawEditor(); };
  ed.addEventListener('pointerup',end); ed.addEventListener('pointercancel',end);
  { const c=$('#edsnap'); if(c){ try{ c.checked=localStorage.getItem('lbx-edsnap')!=='0'; }catch(e){}
    c.onchange=()=>{ try{ localStorage.setItem('lbx-edsnap',c.checked?'1':'0'); }catch(e){} const m=masterTake;
      if(c.checked&&m&&m.free&&!recObj){ pushHist(); m.free=false; m.nudge=0; buildFromSel(); drawEditor(); msg('Repères recalés sur les temps.'); }
      else msg(c.checked?'Repères aimantés aux temps.':'Repères libres : place le début où tu veux ; la longueur reste en temps entiers pour que la boucle tourne en rythme.'); }; } }
  $('#growb').onclick=e=>{ const b=e.target.closest('button'); if(b&&!b.disabled) setRepAll(+b.dataset.k); };
  $('#sm').onclick=()=>{ const m=masterTake; if(m) setSel(m.s-1,m.s+m.n); };
  $('#sp').onclick=()=>{ const m=masterTake; if(m) setSel(m.s+1,m.s+m.n); };
  $('#em').onclick=()=>{ const m=masterTake; if(m) setSel(m.s,m.s+m.n-1); };
  $('#ep').onclick=()=>{ const m=masterTake; if(m) setSel(m.s,m.s+m.n+1); };
})();
function finishRec(s,e){
  const r=recObj; if(!r) return;
  setTimeout(()=>{ if(window.__lvlMsg){ msg(window.__lvlMsg+(($('#msg').textContent&&!/Prise trop forte|micro lui-même/.test($('#msg').textContent))?' — '+$('#msg').textContent:'')); window.__lvlMsg=''; } },700);
  pushHist();
  const blocks=cap.blocks;
  cap=null; recObj=null;
  { const rr=rawTapStop(); const rc=rr?rawCheck(rr):null, ad=rawAdvice(rc); if(ad) setTimeout(()=>msg(ad),1400); }
  const raw=gather(blocks,s,e);
  // prise trop forte : on la baisse d'un bloc (rien n'est rasé) et on règle le gain des prochaines prises
  let pk=0; for(let i=0;i<raw.length;i++){ const v=raw[i]<0?-raw[i]:raw[i]; if(v>pk) pk=v; }
  const g=ingain*(curProf?curProf.mul:1); let adc=0;
  if(g>0){ const lim=0.985*g; for(let i=0;i<raw.length;i++) if((raw[i]<0?-raw[i]:raw[i])>=lim) adc++; }
  let levelMsg='';
  if(pk>0.98){
    const f=0.9/pk; for(let i=0;i<raw.length;i++) raw[i]*=f;
    if(normOn){ const old=ingain; ingain=clamp(Math.round(ingain*0.7/pk*10)/10,0.1,6); if(ingain<old){ $('#ingain').value=ingain; $('#ingv').textContent=ingain.toFixed(1)+'×'; if(inGainNode) inGainNode.gain.value=ingain*(curProf?curProf.mul:1); scheduleSave(true);
      levelMsg='Prise trop forte pour le réglage du micro : elle a été baissée sans rien couper, et le gain micro passe de '+old.toFixed(1).replace('.',',')+'× à '+ingain.toFixed(1).replace('.',',')+'× pour les prochaines prises.'; } }
  }
  window.__lvlMsg='';
  if(adc>=8) levelMsg=(levelMsg?levelMsg+' ':'')+'⚠ Le micro lui-même sature sur les sons les plus forts : recule-toi de 10 à 15 cm, et place ta bouche face au côté du micro (micro « side-address » : on lui parle par la face avec le logo), un peu de biais pour éviter le souffle direct.';
  window.__lvlMsg=levelMsg;
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
  speed:"<b>Vitesse de la piste</b> : ralentit ou accélère cette piste seule, <b>sans changer sa note</b>, et sans toucher à la boucle de base ni aux autres pistes. 50 % = deux fois plus lent. Si la piste ralentie dépasse la durée de la boucle, seul le début est joué : allonge la boucle (Durée ×2) pour l'entendre en entier. <b>« Adapter au tempo du projet »</b> repère le tempo de la piste (par exemple un son importé d'internet) et règle sa vitesse pour qu'elle tombe en rythme avec ta boucle.",
  pitch:"<b>Hauteur du son</b> : monte ou descend la <b>note</b> de la piste, <b>sans changer sa durée ni son rythme</b> : elle reste calée sur la boucle. Le réglage est en <b>demi-tons</b> (+12 = une octave plus aigu, −12 = une octave plus grave). L'appli recalcule la piste quand tu relâches le curseur (de quelques instants à quelques secondes selon la longueur) : « Calcul… » s'affiche, et l'ancien son continue de jouer en attendant. Plus tu t'éloignes de 0 (surtout au-delà de ±7), plus le son peut devenir métallique ou perdre en précision. Le son d'origine n'est jamais modifié : remets 0 pour le retrouver. Fonctionne aussi sur un fichier importé.",
  trep:"<b>Le reste de la piste</b> : ce que devient la piste en dehors de la partie choisie avec les repères orange. <b>Silence</b> : seule la partie est jouée. <b>Répéter en boucle</b> : la partie se répète en continu sur toute la boucle, à partir de son début. <b>×2 / ×3 / ×4</b> : jouée 2, 3 ou 4 fois à la suite, puis silence. <b>Rien n'est effacé</b> : la forme d'onde complète reste visible, la partie en orange et ses répétitions en orange pâle, et la durée de la boucle de base ne change jamais. Sans partie choisie, l'appli prend automatiquement les temps qui contiennent du son.",  tsel:"<b>Garder la partie propre (cette piste)</b> : choisis la partie à conserver sur cette piste ; le reste devient muet, <b>sans rien déplacer</b> (les pistes restent calées entre elles). Pour que la lecture commence à ton début : <b>« Faire de cette partie la boucle »</b> (seule piste avec du son : la boucle prend exactement le début et la fin choisis) ou <b>« Faire tourner cette partie en boucle »</b> (avec d'autres pistes : la partie démarre au début de la boucle de base et se répète sur toute sa durée, tous les N temps entiers). « Placer la partie au début » la fait seulement glisser au début, sans la répéter. Avec « aimanter aux temps », les repères se calent sur les temps ; sans, tu les places où tu veux, et les boutons ±1 ms / ±10 ms règlent le début et la fin à la milliseconde près. le reste devient muet (zones assombries sur la forme d'onde). <b>Ça ne change ni la boucle ni la piste de base.</b> Rien n'est perdu : tu peux élargir de nouveau la sélection, ou toucher « Tout garder ». Glisse les repères orange sur la forme d'onde, ou utilise les boutons. Une nouvelle prise sur la piste remet la sélection à zéro.",
  imp:"<b>Importer un son ou une vidéo</b> : MP3, WAV, M4A, OGG, ou une vidéo MP4 / WebM dont l'appli garde le son. <b>Pour récupérer le son d'internet sans passer par le micro</b> : lance l'enregistreur d'écran d'Android en choisissant le son « multimédia / interne » (pas le micro), joue le contenu, arrête, puis importe la vidéo ici. Si le fichier est plus long que nécessaire, tu choisis le passage à garder sur sa forme d'onde (glisser, ou ±10 ms à ±1 s) et tu peux l'écouter avant. <b>Sur la première piste</b>, l'appli repère le rythme du passage pour créer la boucle. Limites : 250 Mo, 5 minutes chargées, 40 secondes gardées.",  undo:"<b>Annuler / Rétablir</b> (↶ ↷ en haut) : reviennent en arrière ou en avant sur les prises, imports, effacements, découpes, durées de boucle et hauteurs, jusqu'à 30 étapes. Les réglages de volume, d'effets et de tonalité ne sont pas concernés.",
  tname:"<b>Nom et place</b> : donne un nom à la piste (« Kick », « Snare », « Voix »…), monte-la ou descends-la dans la liste, ou duplique-la : la copie reprend le son et tous les réglages, pratique pour essayer un autre effet sans toucher à l'original.",
  msub:"<b>Clics</b> : <b>Temps</b> = un clic par temps. <b>Croches</b> = deux clics par temps, <b>Doubles</b> = quatre : les clics intermédiaires sont plus doux. Pratique pour jouer des rythmes rapides bien en place.",
  meter:"<b>Mesure</b> : <b>4 temps</b> pour la plupart des rythmes, <b>3 temps</b> pour une valse ou un rythme ternaire. Ça change l'accent du métronome (le clic aigu), le décompte et le regroupement des temps à l'écran.",
  quant:"<b>Grille de rythme</b> : choisis la grille (temps, croches ou doubles-croches) utilisée pour caler la piste. <b>« Recaler chaque son »</b> va plus loin : il déplace chaque attaque séparément vers la grille, à 100 %, 75 % ou 50 %. Il ne touche qu'aux vraies attaques (les petits bruits restent attachés au son précédent) et raccorde les sons en fondu. À utiliser si tes sons sont irréguliers entre eux ; si la prise est juste en retard partout, utilise plutôt « Caler la piste sur le rythme (sans couper) ». ↶ annule.",  fades:"<b>Fondus</b> : le son de la piste monte progressivement au début (entrée) ou s'éteint progressivement à la fin (sortie) de sa partie, sur la durée choisie. Ça ne touche pas au son d'origine. <b>Jouer à l'envers</b> retourne la piste (effet « son inversé »), ↶ pour revenir.",
  tempochg:"<b>Changer le tempo</b> : accélère ou ralentit toute la boucle, toutes les pistes ensemble, <b>sans changer la note</b>. Règle le nouveau tempo avec −5 / −1 / +1 / +5 puis « Appliquer ». De la moitié au double du tempo actuel. Plus l'écart est grand, plus le son peut s'abîmer un peu. ↶ annule.",
  live:"<b>Mode live</b> : un gros bouton par piste pour la couper ou la relancer pendant la lecture. Le changement tombe <b>en rythme</b> : au début de la prochaine mesure, au début de la prochaine boucle, ou tout de suite, selon ton choix. Le bouton clignote tant que le changement est en attente. Idéal pour jouer devant quelqu'un.",
  scenes:"<b>Scènes</b> : mémorise une combinaison de pistes en jeu (par exemple A = couplet, B = refrain), puis « Lancer » la rappelle d'un coup, en rythme. Règle d'abord les pistes avec les gros boutons, puis « Mémoriser ».",
  share:"<b>Partager le mix</b> : prépare le fichier WAV et ouvre le menu de partage du téléphone (WhatsApp, mail, Drive…). Si le navigateur ne sait pas partager un fichier, il est simplement téléchargé.",
  stems:"<b>Pistes séparées</b> : exporte chaque piste dans son propre fichier WAV, tous rangés dans un .zip, pour les retravailler dans une autre appli. Chaque piste garde son volume, sa tonalité, ses effets et sa hauteur, mais pas le « Son final ». Toutes les pistes ont la même longueur et démarrent en même temps : elles se superposent parfaitement.",
  install:"<b>Installer l'appli</b> : ajoute LoopBox à ton écran d'accueil comme une vraie appli, en plein écran, et elle <b>fonctionne même sans connexion</b> une fois installée. Selon le navigateur, le bouton apparaît ici, ou il faut passer par le menu du navigateur (⋮) → « Ajouter à l'écran d'accueil » / « Installer l'appli ». Quand une nouvelle version sort, un message « Mettre à jour » s'affiche.",
  bgroup:"<b>Motif</b> : coche <b>choisir plusieurs blocs</b>, touche le premier puis le dernier bloc d'un motif : tous les blocs entre les deux sont choisis (tant que la case est cochée, la palette de notes change tous ces blocs d'un coup ; sinon, seulement le bloc touché). <b><i class='ic' data-ic='link'></i> Grouper</b> les attache : ensuite, toucher l'un d'eux choisit tout le groupe (une ligne blanche les relie). <b>Dissocier</b> les détache. <b>⧉ Dupliquer à la suite</b> recopie le motif juste après lui, 1, 2, 3 fois ou jusqu'à la fin de la boucle, en remplaçant les blocs qui s'y trouvaient. ↶ annule.",
  tsdup:"<b>Copier la partie à la suite</b> : la partie choisie (entre les deux traits orange) est recopiée juste après elle, 1, 2, 3 fois ou jusqu'à la fin de la boucle. Le son qui se trouvait à ces endroits est remplacé, et la partie gardée s'agrandit pour inclure les copies. Pratique pour répéter un motif réussi. ↶ annule.",
  send:"<b>Envoyer le projet</b> (à Louis par exemple) : il reçoit le projet complet, toutes les pistes séparées avec leurs sons, notes, effets et le montage, pour le reprendre dans son LoopBox. Si tu es connecté (section En ligne), il reçoit un <b>lien</b> valable 30 jours, sans avoir besoin de compte ; sinon, un <b>fichier .loopbox</b>. Lui l'ouvre avec <b>Ouvrir un projet reçu</b>. Ce qu'il change reste chez lui. Toute personne qui a le lien peut ouvrir le projet : ne le poste pas en public.",
  cloud:"<b>En ligne</b> : tes projets sont gardés dans ton espace privé (personne d'autre ne peut les voir), pour les retrouver sur la tablette, le téléphone ou un ordinateur. Connecte-toi avec le même e-mail et mot de passe sur chaque appareil. <b>Mettre ce projet en ligne</b> l'envoie ; avec <b>envoi automatique</b>, chaque modification est envoyée 20 secondes après ton dernier changement. Sur l'autre appareil : menu projet → En ligne → <b>Ouvrir</b>. Si tu modifies le même projet sur deux appareils, c'est le dernier envoi qui compte. Taille maximale : 50 Mo par projet (environ 4 minutes de son en tout). Il faut internet pour envoyer et ouvrir ; sans internet, l'appli marche comme avant.",
  sonlib:"<b>Son</b> : en haut, les <b>styles prêts</b> (un son + ses effets). En dessous, la <b>bibliothèque</b> rangée par familles : clochettes (xylophone, marimba, kalimba, boîte à musique, clochette façon triangle…), cordes pincées (harpe, pizzicato, guitares, koto…), claviers (Rhodes, piano FM des ballades R&B, clavinet…), vents (flûtes, sax, ocarina…), voix et chœurs, orchestre, synthés 80-90 (stab d'orchestre new jack swing, cuivres synthé, lead G-funk…), nappes, sons de jeux vidéo 8-bit, bruitages et ASMR (pluie, vagues, souffle, goutte d'eau, cloche 808…). Choisir un son le fait entendre tout de suite sur la note du bloc choisi. Les sons de la bibliothèque gardent les effets de la piste (ajoute du lo-fi ou de la réverb dans <i class='ic' data-ic='sparkle'></i> Effets). La première fois, chaque instrument se télécharge (environ 0,5 Mo, il faut internet), puis il reste disponible hors connexion. Les instruments réels viennent de la banque FluidR3_GM de Frank Wen (licence Creative Commons BY 3.0) ; les sons de jeux vidéo et d'ASMR sont fabriqués par l'appli.",
  bgrid:"<b>Grille</b> : règle la finesse de la ligne de temps. En <b>noire</b>, on coupe sur les temps ; en <b>croche</b> sur chaque demi-temps ; en <b>double croche</b> sur chaque quart de temps ; en <b>triolet</b> sur chaque tiers. Des petites graduations apparaissent sur la règle : touche-les pour couper, et les limites orange s'accrochent à la grille quand tu les fais glisser. <b><i class='ic' data-ic='zoomin'></i> / <i class='ic' data-ic='zoomout'></i></b> zooment la ligne de temps (×2, ×4, ×8) pour viser les petits blocs ; la barre qui apparaît dessous sert à se déplacer, et ◀ ▶ suivent le bloc choisi. <b><i class='ic' data-ic='scissors'></i> Découper en notes de la grille</b> coupe le bloc choisi (ou tous les blocs choisis) en notes de la taille de la grille : pratique pour écrire une basse en croches ou en doubles croches, puis donner une note à chaque bloc. Quand des blocs font moins d'un temps, le rythme passe sur « Suivre les notes » pour que chacun soit joué.",
  chords:"<b>Accords</b> : choisis un bloc (et sa note, qui sera la base de l'accord), puis un <b>accord</b> : majeur, mineur, 7, maj7 et m7 (très lo-fi et R&B), m9 et maj9 (néo-soul), add9, sus2, sus4, 6, diminué, augmenté, quinte. Tu l'entends tout de suite. Avec « choisir plusieurs blocs » coché, l'accord s'applique à tous les blocs choisis. <b>Jeu</b> : plaqué (toutes les notes ensemble), gratté (léger décalage, comme une guitare ou une harpe) ou en arpège (qui monte, qui descend, aller-retour, sur 2 octaves), à la vitesse choisie (noires, croches, doubles croches, triolets). <b>Suite d'accords</b> remplit la ligne de temps avec une progression toute prête (lo-fi, chill, néo-soul, pop, trap, jazz…) dans la tonalité de la note du 1er bloc. Superbe avec les sons de la bibliothèque : harpe en arpège, Rhodes ou piano FM plaqués, boîte à musique en arpège aller-retour…",
  fid:"<b>Test de fidélité</b> : pendant 4 secondes, l'appli enregistre en même temps ton micro <b>brut</b> (exactement ce que le navigateur lui donne) et le son <b>après l'appli</b> (gain et filtre d'entrée). Elle affiche les traitements que le navigateur applique vraiment (écho, réduction de bruit, volume automatique), la saturation éventuelle, les graves et les aigus, puis te laisse écouter les deux au même volume. Si le <b>brut</b> est déjà abîmé, le problème vient du micro, de la tablette ou du navigateur ; s'il est bon mais que « après l'appli » ne l'est pas, c'est l'appli. « Les deux en fichiers » te permet de me les envoyer.",
  denoise:"<b>Nettoyer le bruit</b> : retire le souffle du micro. <b>Léger</b> coupe le bruit dans les silences entre les sons, sans toucher aux sons eux-mêmes : à essayer en premier. <b>Fort</b> retire aussi le souffle qui reste sous les sons, en analysant les fréquences ; il peut rendre le son un peu « métallique » sur une voix. L'appli repère le bruit dans les passages calmes de la piste : il en faut un peu. ↶ annule. Astuce : un gain micro trop élevé et un micro loin de la bouche augmentent le souffle.",
  btl:"<b>Notes sur la ligne de temps</b> : comme sur un logiciel de montage, chaque bloc coloré est une portion de la boucle jouée sur une note. <b>Pour couper</b> : touche la règle (les numéros de temps en haut) à l'endroit voulu ; toucher une coupe existante (<i class='ic' data-ic='scissors'></i>) l'enlève. <b>Pour changer une note</b> : touche le bloc, puis une note de la palette (elle se fait entendre aussitôt, avec le son de la piste). ◀ ▶ passent d'un bloc à l'autre. <b>Fais glisser la limite orange</b> entre deux blocs pour régler leur durée (au temps près). « Retirer le bloc » le fusionne avec son voisin. « Glisser vers le bloc suivant » fait monter ou descendre la dernière note du bloc jusqu'à la note suivante. Le dessin « Notes jouées » montre le résultat.",
  bass:"<b>Piste de basse</b> : la basse est fabriquée à partir des blocs de la ligne de temps. <b>Rythme</b> = où tombent les notes. <b>Mélodie</b> = quelles notes jouer dans chaque bloc : « Même note » ne joue que la note du bloc ; les autres ajoutent l'octave, la quinte ou une marche vers le bloc suivant. <b>Son</b> : Sub (rond), Électrique (pincée), Acid (filtrée), 808 (grave qui chute). « ▶ Aperçu » fait entendre la basse sans l'enregistrer, et chaque changement s'entend tout de suite ; « Créer la basse » la valide.",  warp:"<b>Caler un jeu au tempo irrégulier</b> : pour un musicien qui accélère ou ralentit en jouant. L'appli retrouve chacun de ses temps (même quand son tempo bouge), puis étire ou resserre chaque intervalle pour qu'il dure exactement un temps du morceau, <b>sans changer la note et sans couper de son</b>. <b>Repère à chaque temps</b> : le plus précis. <b>À chaque mesure</b> : seuls les débuts de mesure sont calés, le jeu garde plus de souplesse à l'intérieur. Ensuite, « Recaler chaque son » peut affiner les quelques sons restés à côté. ↶ annule.",
  slip:"<b>Décaler la piste dans le temps</b> : avance (−) ou retarde (+) toute la piste, à la milliseconde, <b>sans rien couper</b>. C'est la bonne solution quand une prise est un peu en retard à cause de la latence du micro. <b>« Caler la piste sur le rythme »</b> mesure tout seul de combien tes sons tombent à côté de la grille choisie juste en dessous (temps, croches ou doubles-croches), et décale toute la piste d'autant. Le son d'origine n'est pas modifié : « 0 » revient au départ.",
  edsnap:"<b>Aimanter aux temps</b> : coché, les repères se posent sur les temps. Décoché, tu places le <b>début</b> exactement où tu veux (par exemple juste avant l'attaque de ton premier son) ; la <b>longueur</b> de la boucle reste un nombre entier de temps, sinon elle ne tournerait plus en rythme : la fin suit donc le début. Les boutons −10 ms / +10 ms affinent encore.",
  mnudge:"<b>Ajuster le début</b> : déplace le point de départ de ta boucle de base à la milliseconde, sans changer sa durée. Utile si le début de la boucle tombe un peu avant ou après l'attaque de ton premier son.",
  mtrans:"<b>Transitions du bloc</b> : comment le bloc choisi commence et se termine. <b>Entrée</b> : fondu (le son monte), filtre qui s'ouvre (sourd puis clair), montée par les aigus (le grave arrive peu à peu). <b>Sortie</b> : fondu, filtre qui se ferme, ralenti (le son ralentit et descend comme une cassette qu'on arrête), écho qui s'éteint (le son s'arrête et ses échos continuent), hachage (le son se répète en petits morceaux). Choisis aussi la durée (1 temps à 2 mesures).",
  mblank:"<b>Insérer un blanc</b> : ajoute un silence de la durée choisie à l'endroit du curseur, sur toutes les pistes ; la suite du morceau recule d'autant. Pour un blanc sans rien décaler, choisis une partie et « Rendre muette ».",
  mfx:"<b>Sons de transition</b> : des sons fabriqués par l'appli, ajoutés par-dessus le morceau. Montée de bruit et souffle inversé se terminent au curseur (pour annoncer un refrain ou un drop) ; impact et descente partent du curseur. Ils apparaissent en violet sur la règle ; <i class='ic' data-ic='trash'></i> les retire.",
  msec:"<b>Partie du morceau</b> : place le curseur (touche la règle) puis « Début = curseur », avance le curseur puis « Fin = curseur ». La partie est surlignée en orange. <b>Dupliquer cette partie</b> la recopie juste après, <b>sur toutes les pistes à la fois</b> (piste principale, basse, mélodie…), et décale la suite du morceau. <b>Supprimer cette partie</b> l'enlève partout et rapproche la suite. Pratique pour construire couplet, refrain, couplet… puis faire varier une des copies.",
  mvar:"<b>Créer une variation de ce bloc</b> : le bloc choisi joue désormais une copie de sa piste (par exemple « Basse (variation) »), ajoutée à la liste des pistes. Modifie cette copie (autres notes, autre style, autres effets…) : seul ce bloc change, le reste du morceau garde la piste d'origine. Pour qu'un autre bloc joue aussi la variation, fais-le glisser sur sa ligne.",
  mont:"<b>Montage du morceau</b> : compose un morceau du début à la fin, comme sur un logiciel de montage vidéo. Chaque piste a sa ligne ; chaque bloc joue la boucle de la piste (elle se répète tant que le bloc dure). <b>Touche la règle</b> (numéros de mesures) pour placer le curseur. <b>Touche une ligne vide</b> pour ajouter un bloc d'un tour de boucle. <b>Fais glisser un bloc</b> pour le déplacer, <b>son bord droit ou gauche</b> pour l'allonger ou le raccourcir. Avec un bloc choisi : couper au curseur, dupliquer, supprimer, ou changer son ton (variation : refrain un ton plus haut…). Glisse sur une zone vide pour faire défiler. La ligne rouge marque la fin du morceau. ▶ en bas joue le morceau quand le montage est ouvert.",
  mgrid:"<b>Aimant</b> : quand tu fais glisser un bloc (ou son bord), il s'accroche à la grille choisie : la <b>mesure</b>, le <b>temps</b>, le <b>½</b> ou le <b>¼ de temps</b>. <b>Libre</b> le laisse exactement où tu lâches ton doigt. Pour un placement précis, choisis le bloc puis utilise les boutons <b>Déplacer</b> : ◀ ▶ avancent ou reculent d'un pas de l'aimant (1/16 de temps en mode libre), ◀◀ ▶▶ d'une mesure. Le début exact du bloc (mesure et temps) est affiché au-dessus.",
  mgroup:"<b>Plusieurs blocs</b> : coche <b>choisir plusieurs blocs</b>, puis touche chaque bloc voulu, sur une ou plusieurs lignes (ils s'entourent d'orange ; retouche pour en retirer un). <b><i class='ic' data-ic='link'></i> Grouper</b> les attache : toucher l'un d'eux choisit tout le groupe, et les faire glisser les déplace ensemble (un trait blanc marque les blocs groupés). <b>Dissocier</b> les détache. <b>⧉ Dupliquer</b> recopie tout le motif juste après lui, 1 à 8 fois : sur ces lignes, ce qui s'y trouvait est remplacé, les autres lignes ne bougent pas. <b><i class='ic' data-ic='trash'></i></b> supprime tous les blocs choisis.",
  mclip:"<b>Bloc choisi</b> : « Couper au curseur » coupe le bloc à l'endroit du curseur orange (touche la règle pour le placer). « Dupliquer » recopie le bloc (ou le groupe) juste après, le nombre de fois choisi. « ♭ / ♯ » change le ton de ce bloc seulement, pour créer des variations (la basse ou la mélodie sont recalculées note à note).",
  mend:"<b>Fin du morceau</b> : la ligne rouge. Tout ce qui est après n'est ni joué ni exporté. « Fin = dernier bloc » la place à la fin du dernier bloc.",
  tf:"<b>Transformer la piste</b> : l'appli repère les notes que tu as chantées, fredonnées ou sifflées sur cette piste, les cale sur la boucle (double-croche, croche ou temps) et les fait jouer par un instrument. <b>En ligne de basse</b> : descendue dans les graves. <b>En mélodie</b> : gardée à ta hauteur, avec un style (lo-fi, hip-hop, trap…). Le son d'origine est conservé avec le projet : « <i class='ic' data-ic='mic'></i> Revenir au son enregistré » le récupère, et tu peux passer de basse à mélodie et inversement. ↶ annule.",
  synth:"<b>Piste mélodie</b> : comme la piste de basse, mais pour jouer une mélodie avec un instrument. Chante ou fredonne ta ligne sur une piste normale, puis « Repérer les notes » : l'appli la transforme en notes (à la même hauteur que ta voix) et la joue d'abord avec un <b>son simple, sans effet</b>, à la hauteur exacte de ta voix. Tu peux ensuite changer le ton (« Transposer », ▼ ▲ octave par bloc) ou choisir un <b>style</b> avec ses effets : lo-fi (piano électrique), hip-hop (pluck), rap / trap (cloche ou lead), nappe, flûte, 8-bit ou orgue. Chaque style pose ses effets sur la piste (lo-fi, écho, réverbération…), modifiables ensuite dans <i class='ic' data-ic='sparkle'></i> Effets.",
  mel2b:"<b>Mélodie chantée → basse</b> : enregistre-toi en chantant ou en fredonnant la ligne (une note à la fois, aussi aiguë que tu veux), sur une piste normale. Choisis cette piste ici : l'appli repère chaque note et sa durée, les cale sur la grille choisie (double-croche, croche ou temps), met des silences là où tu ne chantes pas, et descend le tout dans les graves (par octaves, donc les notes restent justes). Le rythme passe sur « Suivre les notes ». Corrige ensuite un bloc avec la palette, ou décale toute la basse avec « Transposer ».",
  boct:"<b>▼ / ▲ octave</b> : rend le bloc choisi une octave plus grave ou plus aiguë (même note, Mi2 → Mi1 par exemple), sans toucher aux autres blocs. La hauteur exacte du bloc est affichée à côté (Mi2, Sol1…).",
  btrans:"<b>Transposer</b> : monte ou descend toute la basse d'un demi-ton ou d'une octave. Utile si ta voix ne descend pas assez bas : chante plus haut, puis descends d'une ou deux octaves ici.",
  trk:"<b>Une piste</b>, c'est une couche de ton morceau. <b>● REC</b> enregistre (■ STOP pour finir) ; la forme d'onde montre ce qui est enregistré. Touche le <b>nom de la piste</b> (▸) pour ouvrir ses réglages : type de son, volume, <b>Muet</b> (la coupe), <b>Solo</b> (n'écoute qu'elle), panoramique, tonalité, effets, annuler et effacer. Un <i class='ic' data-ic='mute'></i> ou un <i class='ic' data-ic='headphones'></i> à côté du nom te rappelle qu'elle est en muet ou en solo.",
  vol:"<b>Volume</b> de cette piste. Vers la droite : plus fort. Vers la gauche : plus doux. Sers-t'en pour équilibrer tes pistes entre elles.",
  pan:"<b>Gauche ⇄ Droite</b> (panoramique) : place le son plus à gauche ou plus à droite dans ton casque. Au milieu, il est centré. Pratique pour séparer les pistes et aérer le mix.",
  eq:"<b>Tonalité</b> : trois curseurs pour façonner le son de cette piste. Ils agissent à l'écoute : tu peux les changer à tout moment, même après l'enregistrement, et entendre le résultat dans le mix. <b>Graves</b> : le corps, le « boum ». <b>Médiums</b> : la présence, le corps d'une voix ou d'une caisse claire. <b>Aigus</b> : la brillance, les « tss », l'air. Au milieu (0 dB) : son d'origine. Les boutons rapides règlent les trois d'un coup : <b>Punch</b> (plus de corps et d'attaque), <b>Clair</b> (plus brillant), <b>Voix nette</b> (moins de graves boueux, voix plus présente), <b>Chaud</b> (plus rond, moins agressif). Tu peux ensuite affiner avec les curseurs. Astuce : si une piste « mange » les autres, baisse ses graves ou ses médiums.",
  fx:"<b>Effets</b> : transforment le son de cette piste. Tu peux en <b>empiler 2</b> (« + Ajouter un effet ») : ils s'appliquent <b>dans l'ordre, de haut en bas</b>, et chacun a sa propre intensité. Le ✕ retire un effet. <b>Écho</b> : répétitions calées sur le tempo. <b>Réverbération</b> : son de grande salle. <b>Saturation</b> : son sale et puissant. <b>Lo-fi 8 bits</b> : son de vieille console. <b>Étouffé</b> : comme derrière un mur. <b>Radio</b> : voix de téléphone. <b>Pulsation</b> : le volume bat au rythme du tempo. <b>Flanger</b> : effet de jet qui passe. <b>Robot</b> : voix métallique. <b>Basses boostées</b> : plus de graves. Les effets agissent <b>avant</b> le volume de la piste : baisser le volume n'en change pas le caractère.",
  fxamt:"<b>Intensité de l'effet</b> : de très discret (gauche) à très marqué (droite). Écoute en réglant : c'est le plus simple.",
  undo:"<b>Annuler</b> : revient à la prise précédente de cette piste. Appuie encore pour revenir à la dernière prise.",
  clear:"<b>Effacer</b> : vide cette piste. Tu peux annuler juste après avec « Annuler ».",
  lib:"<b>Mes morceaux enregistrés</b> : chaque fois que tu touches <b>Enregistrer le morceau</b>, le son final (WAV, qualité CD) est gardé ici, au nom du projet. Touche ▶ pour l'écouter, l'icône de partage pour l'envoyer (WhatsApp…), le titre pour le renommer, le télécharger ou le supprimer. Ils sont gardés sur cet appareil. <b>Lier un dossier de la tablette</b> (Chrome) : les morceaux sont alors écrits dans ce dossier, visibles aussi avec l'appli Fichiers.",
  song:"<b>Mon morceau</b> : le son final de ton projet. Si tu as composé un montage (onglet Morceau), c'est le montage ; sinon, ta boucle jouée 4 fois avec un fondu à la fin. <b>Enregistrer</b> le garde dans « Mes morceaux enregistrés » ; <b>Envoyer</b> ouvre le partage du téléphone (WhatsApp…). Il porte le nom du projet : renomme le projet pour changer son nom.",
  mvol:"<b>Volume général</b> : la force de toutes les pistes ensemble, juste avant la sortie.",
  mout:"<b>Niveau de sortie</b> : le volume réel de ton mix. Si la barre devient <b>rouge</b>, c'est trop fort et le son sature : baisse le volume général ou celui de certaines pistes.",
  min:"<b>Niveau micro</b> : ce que capte ton micro. Quand tu joues, la barre doit bouger bien franchement sans devenir rouge. Trop faible : augmente le gain micro dans « Réglages ». Rouge : baisse-le.",
  fin:"<b>Son final</b> (on parle aussi de finalisation ou de mastering). Il polit l'ensemble : il équilibre les graves et les aigus, resserre l'écart entre les sons faibles et forts (compression) et empêche les pics de saturer (limiteur). Résultat : un mix plus homogène et plus fort. <b>Doux</b> = discret. <b>Fort</b> = plus puissant et plus « compressé ». S'applique aussi à l'export.",
  exp:"<b>Exporter</b> : crée un fichier son (WAV, qualité CD) de ton mix, avec tous tes réglages et effets. Choisis avant combien de fois la boucle est répétée dans le fichier.",
  ingain:"<b>Gain micro</b> (avec un micro USB à condensateur, souvent 0,5× ou moins suffit ; l'appli le baisse toute seule si une prise est trop forte) : amplifie le micro avant l'enregistrement. Si ton « Niveau micro » reste très faible, augmente. S'il devient rouge, baisse.",
  comp:"<b>Latence</b> : le petit retard entre le moment où tu joues et celui où ton téléphone l'enregistre. Si tes sons arrivent trop tard dans la boucle, augmente cette valeur. Le bouton « Calibrer » la règle tout seul.",
  src:"<b>Type de son</b> : dis à l'appli ce que tu vas enregistrer sur cette piste. Elle adapte le <b>filtre des graves</b> (plus fort pour la voix, pour éviter les « pop » et le bruit de manipulation ; très léger pour le beatbox et les percussions, pour garder les « boum »), la <b>sensibilité</b> (plus élevée pour les sons faibles et proches de l'environnement) et, pour la <b>voix</b>, un filtre qui atténue le bruit de fond entre les phrases. Cela ne change pas le micro du téléphone lui-même : le plus important reste la distance entre ta bouche et le micro.",
  lvl:"<b>Niveau auto des prises</b> : après chaque prise, si elle est trop faible, l'appli la remonte automatiquement à un bon volume. Pratique si tu t'éloignes du micro ou si tu fais des sons doux. Désactive-le si tu préfères régler le volume toi-même.",
  setup:"<b>Je joue avec</b> : choisis ce que tu utilises pour écouter et enregistrer. L'appli garde une latence pour chaque configuration et passe de l'une à l'autre quand tu changes. <b>Sans casque</b> : calibration automatique. <b>Casque filaire</b> et <b>Casque Bluetooth</b> : calibration en tapant (le Bluetooth ajoute souvent 150 à 300 ms). <b>Micro externe</b> : choisis-le dans la liste « Micro » et calibre-le.",
  micsel:"<b>Micro</b> : le micro utilisé pour enregistrer. Si ton micro n'apparaît pas, touche « <i class='ic' data-ic='refresh'></i> Chercher les micros » (après l'avoir branché). La ligne « Micro utilisé » indique celui que l'appli entend vraiment. « Par défaut » = celui choisi par la tablette. Avec un micro externe branché, choisis-le ici. Avec un casque Bluetooth, garde de préférence le micro de la tablette : utiliser le micro du casque fait souvent passer Android en « mode appel », avec un son de bien moins bonne qualité.",
  caltap:"<b>Calibrer en tapant</b> : à faire <b>avec le casque sur les oreilles</b>. Tu entends 12 clics : les 4 premiers servent de décompte, puis tape sur la table (ou fais « pa » au micro) pile sur chacun des 8 suivants. L'appli mesure le retard total, casque compris, et le range dans la configuration choisie.",
  cal:"<b>Calibrer</b> : le téléphone joue des clics et mesure le retard avec son propre micro. Il faut être <b>sans casque</b>, volume moyen, dans un endroit calme. À refaire si tu changes de casque ou d'appareil."
};
for(const k in HELP) HELP[k]=HELP[k].replace(/<i class='ic' data-ic='(\w+)'><\/i>/g,(m,n)=>ic(n));
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
  const bass=withSound.filter(t=>isGen(t));
  const cand=withSound.filter(t=>!isGen(t));
  const ok=[], noQuiet=[];
  cand.forEach(t=>{ if(quietContrast(t.buf.getChannelData(0))<10) noQuiet.push(t); else ok.push(t); });
  const skipTxt=[];
  if(bass.length) skipTxt.push(bass.map(t=>'« '+t.name+' »').join(', ')+' (sons générés, sans souffle)');
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
  tenue:['Une note tenue par mesure',[[0,3.9,1]]],
  melodie:['Suivre les notes (une note par bloc, tenue)',[]]
};
const MELODIES={same:'Même note (celle du bloc)',oct:"Avec l'octave (aiguë une note sur deux)",fifth:'Avec la quinte (une note sur deux)',walk:'Marche (walking vers le bloc suivant)'};
const LEGACY_PAT={tonique:['noire','same'],octaves:['croches','oct'],marche:['noire','walk'],funk:['funk','oct'],hiphop:['hiphop','fifth'],pulse:['doubles','same']};
// styles de la piste mélodie : un son + les effets qui vont avec
const STYLES={
  clean:['Son simple, sans effet (comme ta voix)','soft',[]],
  lofi_keys:['Lo-fi · piano électrique doux','rhodes',['lofi','reverb']],
  hiphop_pluck:['Hip-hop · pluck','pluck',['echo']],
  trap_bell:['Rap / trap · cloche','bell',['echo','reverb']],
  trap_lead:['Rap / trap · lead','lead',['reverb']],
  pad:['Ambiance · nappe','pad',['reverb']],
  flute:['Flûte douce','flute',['reverb']],
  chip:['Jeu vidéo · 8-bit','chip',[]],
  organ:['Gospel · orgue','organ',['reverb']]
};
const isGen=t=>t.kind==='bass'||t.kind==='synth';
const BASS_TYPES={sub:'Sub (rond, très grave)',elec:'Électrique (pincée)',acid:'Acid (filtrée, nerveuse)',b808:'808 (grave qui chute)'};
const INSTR={soft:1,rhodes:1,pluck:1,bell:1,lead:1,pad:1,flute:1,chip:1,organ:1};
function synthNote(out,st,dur,f,vel,type,f2){
  if(INSTR[type]) return instrNote(out,st,dur,f,vel,type,f2);
  if(/^lib:/.test(type)) return libNote(out,st,dur,f,vel,type,f2);
  if(/^sfx:/.test(type)) return sfxNote(out,st,dur,f,vel,type);
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
// instruments de la piste mélodie (synthèse simple, calculée ici)
function instrNote(out,st,dur,f,vel,type,f2){
  const L=out.length, rel=type==='pad'?0.4:type==='rhodes'||type==='bell'?0.25:0.06, n=Math.round((dur+rel)*SR), gl=f2&&f2!==f?Math.log(f2/f):0;
  let ph=0,ph2=0,ph3=0,pm=0, x1=0,x2=0,y1=0,y2=0,b0=0,b1=0,b2=0,a1=0,a2=0, sd=(st*7919+13)%2147483647||1, nz=0;
  const filt=(fc,Q)=>{ const w0=2*Math.PI*Math.min(fc,SR*0.45)/SR, al=Math.sin(w0)/(2*Q), cs=Math.cos(w0), a0=1+al; b0=(1-cs)/2/a0; b1=(1-cs)/a0; b2=b0; a1=-2*cs/a0; a2=(1-al)/a0; };
  const TW=2*Math.PI;
  for(let i=0;i<n;i++){
    const t=i/SR; let fr=gl?f*Math.exp(gl*Math.min(1,t/dur)):f;
    if(type==='flute'&&t>0.2) fr*=1+0.003*Math.sin(TW*5*t);
    ph+=fr/SR; ph-=Math.floor(ph);
    let v=0, A=0.005, env;
    if(type==='rhodes'){ pm+=fr/SR; pm-=Math.floor(pm); v=Math.sin(TW*ph+1.8*Math.exp(-t/0.25)*Math.sin(TW*pm))*(1+0.08*Math.sin(TW*4.5*t)); A=0.003; env=Math.exp(-t/1.0); }
    else if(type==='bell'){ pm+=3.5*fr/SR; pm-=Math.floor(pm); v=Math.sin(TW*ph+3*Math.exp(-t/0.4)*Math.sin(TW*pm)); A=0.002; env=Math.exp(-t/1.2); }
    else if(type==='pluck'||type==='lead'||type==='pad'){
      ph2+=fr*(type==='pad'?1.006:1.004)/SR; ph2-=Math.floor(ph2); ph3+=fr*0.994/SR; ph3-=Math.floor(ph3);
      v=(2*ph-1)+(2*ph2-1)*(type==='pluck'?0:0.8)+(type==='pad'?(2*ph3-1)*0.8:0);
      if(i%32===0){ if(type==='pluck') filt(800+5000*Math.exp(-t/0.06),1.2); else if(type==='lead') filt(3500,0.7); else filt(1400,0.5); }
      const y=b0*v+b1*x1+b2*x2-a1*y1-a2*y2; x2=x1; x1=v; y2=y1; y1=y; v=y*(type==='pluck'?1:0.55);
      if(type==='pluck'){ A=0.002; env=Math.exp(-t/0.35); } else if(type==='lead'){ A=0.01; env=t<0.1?1:0.85; } else { A=0.25; env=1; }
    }
    else if(type==='flute'){ sd=(sd*16807)%2147483647; nz=0.9*nz+0.1*(sd/2147483647*2-1); v=Math.sin(TW*ph)+0.05*Math.sin(2*TW*ph)+0.6*nz*Math.exp(-t/0.15); A=0.06; env=1; }
    else if(type==='chip'){ v=(ph<0.25?1:-1)*0.6; A=0.002; env=Math.exp(-t/2); }
    else if(type==='soft'){ v=0.85*(2/Math.PI)*Math.asin(Math.sin(TW*ph))+0.12*Math.sin(2*TW*ph); A=0.015; env=t<0.08?1:0.92; }
    else { v=Math.sin(TW*ph)+0.6*Math.sin(2*TW*ph)+0.4*Math.sin(3*TW*ph)+0.25*Math.sin(4*TW*ph)+0.15*Math.sin(6*TW*ph); v*=0.45; A=0.01; env=1; }
    if(t<A) env*=t/A;
    if(t>dur) env*=Math.max(0,1-(t-dur)/rel);
    out[(st+i)%L]+=v*env*vel*0.5;
  }
}
// ---------- bibliothèque de sons ----------
// Instruments réels : banque FluidR3_GM de Frank Wen (licence Creative Commons BY 3.0), via github.com/gleitz/midi-js-soundfonts.
// Les fichiers sounds/*.json sont fabriqués par tools/build_sounds.py (une note sur trois, l'appli complète).
const SOUNDLIB=/*SOUNDLIB*/[{"c":"cloche","k":"xylophone","f":"xylophone","n":"Xylophone","ring":1},{"c":"cloche","k":"marimba","f":"marimba","n":"Marimba","ring":1},{"c":"cloche","k":"vibraphone","f":"vibraphone","n":"Vibraphone","ring":1},{"c":"cloche","k":"glockenspiel","f":"glockenspiel","n":"Glockenspiel (carillon)","ring":1},{"c":"cloche","k":"celesta","f":"celesta","n":"Célesta","ring":1},{"c":"cloche","k":"musicbox","f":"music_box","n":"Boîte à musique","ring":1},{"c":"cloche","k":"kalimba","f":"kalimba","n":"Kalimba","ring":1},{"c":"cloche","k":"tubular","f":"tubular_bells","n":"Cloches tubulaires","ring":1},{"c":"cloche","k":"steeldrum","f":"steel_drums","n":"Steel drum (Caraïbes)","ring":1},{"c":"cloche","k":"tinkle","f":"tinkle_bell","n":"Clochette (façon triangle)","ring":1},{"c":"cloche","k":"agogo","f":"agogo","n":"Agogo (cloche brésilienne)","ring":1},{"c":"cloche","k":"woodblock","f":"woodblock","n":"Wood block","ring":1},{"c":"cloche","k":"timpani","f":"timpani","n":"Timbales d'orchestre","ring":1,"r":"low"},{"c":"cloche","k":"taiko","f":"taiko_drum","n":"Tambour taiko","ring":1,"r":"low"},{"c":"corde","k":"harp","f":"orchestral_harp","n":"Harpe","ring":1},{"c":"corde","k":"pizz","f":"pizzicato_strings","n":"Pizzicato (cordes pincées)","ring":1},{"c":"corde","k":"nylon","f":"acoustic_guitar_nylon","n":"Guitare classique (nylon)","ring":1},{"c":"corde","k":"folk","f":"acoustic_guitar_steel","n":"Guitare folk","ring":1},{"c":"corde","k":"eguitar","f":"electric_guitar_clean","n":"Guitare électrique claire","ring":1},{"c":"corde","k":"muted","f":"electric_guitar_muted","n":"Guitare étouffée (funk)","ring":1},{"c":"corde","k":"jazzgtr","f":"electric_guitar_jazz","n":"Guitare jazz","ring":1},{"c":"corde","k":"koto","f":"koto","n":"Koto (Japon)","ring":1},{"c":"corde","k":"sitar","f":"sitar","n":"Sitar (Inde)","ring":1},{"c":"corde","k":"shamisen","f":"shamisen","n":"Shamisen (Japon)","ring":1},{"c":"corde","k":"banjo","f":"banjo","n":"Banjo","ring":1},{"c":"clavier","k":"rhodesr","f":"electric_piano_1","n":"Piano électrique Rhodes","ring":1},{"c":"clavier","k":"fmpiano","f":"electric_piano_2","n":"Piano FM (ballades R&B 80-90)","ring":1},{"c":"clavier","k":"piano","f":"acoustic_grand_piano","n":"Piano à queue","ring":1},{"c":"clavier","k":"clav","f":"clavinet","n":"Clavinet (funk)","ring":1},{"c":"clavier","k":"harpsi","f":"harpsichord","n":"Clavecin","ring":1},{"c":"clavier","k":"hammond","f":"drawbar_organ","n":"Orgue Hammond"},{"c":"clavier","k":"accordion","f":"accordion","n":"Accordéon"},{"c":"vent","k":"flutereal","f":"flute","n":"Flûte traversière"},{"c":"vent","k":"panflute","f":"pan_flute","n":"Flûte de Pan"},{"c":"vent","k":"piccolo","f":"piccolo","n":"Piccolo"},{"c":"vent","k":"recorder","f":"recorder","n":"Flûte à bec"},{"c":"vent","k":"ocarina","f":"ocarina","n":"Ocarina"},{"c":"vent","k":"shaku","f":"shakuhachi","n":"Shakuhachi (flûte japonaise)"},{"c":"vent","k":"whistle","f":"whistle","n":"Sifflement"},{"c":"vent","k":"bottle","f":"blown_bottle","n":"Bouteille soufflée"},{"c":"vent","k":"altosax","f":"alto_sax","n":"Saxophone alto"},{"c":"vent","k":"tenorsax","f":"tenor_sax","n":"Saxophone ténor"},{"c":"vent","k":"mutetpt","f":"muted_trumpet","n":"Trompette bouchée (jazz)"},{"c":"vent","k":"trumpet","f":"trumpet","n":"Trompette"},{"c":"vent","k":"clarinet","f":"clarinet","n":"Clarinette"},{"c":"vent","k":"harmonica","f":"harmonica","n":"Harmonica"},{"c":"voix","k":"aahs","f":"choir_aahs","n":"Chœur « aah »"},{"c":"voix","k":"oohs","f":"voice_oohs","n":"Voix « ouh » (R&B)"},{"c":"voix","k":"synchoir","f":"synth_choir","n":"Chœur synthétique"},{"c":"voix","k":"voxlead","f":"lead_6_voice","n":"Voix synthé (lead)"},{"c":"voix","k":"choirpad","f":"pad_4_choir","n":"Nappe de voix"},{"c":"orch","k":"strings","f":"string_ensemble_1","n":"Ensemble de cordes"},{"c":"orch","k":"tremolo","f":"tremolo_strings","n":"Cordes trémolo"},{"c":"orch","k":"violin","f":"violin","n":"Violon"},{"c":"orch","k":"cello","f":"cello","n":"Violoncelle"},{"c":"orch","k":"synstr","f":"synth_strings_1","n":"Cordes synthé (années 80)"},{"c":"orch","k":"horn","f":"french_horn","n":"Cor d'harmonie"},{"c":"orch","k":"brass","f":"brass_section","n":"Section de cuivres"},{"c":"synth","k":"orchhit","f":"orchestra_hit","n":"Stab d'orchestre (new jack swing)","ring":1},{"c":"synth","k":"synbrass","f":"synth_brass_1","n":"Cuivres synthé"},{"c":"synth","k":"synbrass2","f":"synth_brass_2","n":"Cuivres synthé doux"},{"c":"synth","k":"square","f":"lead_1_square","n":"Lead carré"},{"c":"synth","k":"saw","f":"lead_2_sawtooth","n":"Lead scie (G-funk)"},{"c":"synth","k":"calliope","f":"lead_3_calliope","n":"Calliope (orgue de manège)"},{"c":"synth","k":"chiff","f":"lead_4_chiff","n":"Lead « chiff » (souffle)"},{"c":"synth","k":"charang","f":"lead_5_charang","n":"Lead charang (saturé)"},{"c":"synth","k":"fifths","f":"lead_7_fifths","n":"Lead en quintes"},{"c":"synth","k":"basslead","f":"lead_8_bass__lead","n":"Lead basse + aigu"},{"c":"pad","k":"newage","f":"pad_1_new_age","n":"New age"},{"c":"pad","k":"warm","f":"pad_2_warm","n":"Nappe chaude"},{"c":"pad","k":"poly","f":"pad_3_polysynth","n":"Polysynth"},{"c":"pad","k":"bowed","f":"pad_5_bowed","n":"Nappe frottée"},{"c":"pad","k":"metal","f":"pad_6_metallic","n":"Nappe métallique"},{"c":"pad","k":"halo","f":"pad_7_halo","n":"Halo"},{"c":"pad","k":"sweep","f":"pad_8_sweep","n":"Balayage"},{"c":"pad","k":"soundtrack","f":"fx_2_soundtrack","n":"Bande originale"},{"c":"pad","k":"crystal","f":"fx_3_crystal","n":"Cristal","ring":1},{"c":"pad","k":"atmo","f":"fx_4_atmosphere","n":"Atmosphère","ring":1},{"c":"pad","k":"bright","f":"fx_5_brightness","n":"Brillance"},{"c":"pad","k":"goblins","f":"fx_6_goblins","n":"Lutins (étrange)"},{"c":"pad","k":"echoes","f":"fx_7_echoes","n":"Échos"},{"c":"pad","k":"scifi","f":"fx_8_scifi","n":"Science-fiction","ring":1},{"c":"jeu","k":"sq8","s":"sq8","n":"8-bit carré (console)"},{"c":"jeu","k":"tri8","s":"tri8","n":"8-bit triangle (console)"},{"c":"jeu","k":"coin","s":"coin","n":"Pièce ramassée"},{"c":"jeu","k":"jump","s":"jump","n":"Saut"},{"c":"jeu","k":"laser","s":"laser","n":"Laser"},{"c":"jeu","k":"powerup","s":"powerup","n":"Bonus (power-up)"},{"c":"fx","k":"drop","s":"drop","n":"Goutte d'eau (ASMR)"},{"c":"fx","k":"bubble","s":"bubble","n":"Bulle (ASMR)"},{"c":"fx","k":"cowbell","s":"cowbell","n":"Cloche 808 (cowbell)"},{"c":"fx","k":"claves","s":"claves","n":"Claves"},{"c":"fx","k":"rain","f":"fx_1_rain","n":"Pluie","r":"fx"},{"c":"fx","k":"sea","f":"seashore","n":"Vagues","r":"fx"},{"c":"fx","k":"breath","f":"breath_noise","n":"Souffle (ASMR)","r":"fx"},{"c":"fx","k":"bird","f":"bird_tweet","n":"Chant d'oiseau","r":"fx"},{"c":"fx","k":"phone","f":"telephone_ring","n":"Sonnerie de téléphone","r":"fx"},{"c":"fx","k":"heli","f":"helicopter","n":"Hélicoptère","r":"fx"},{"c":"fx","k":"applause","f":"applause","n":"Applaudissements","r":"fx"},{"c":"fx","k":"fret","f":"guitar_fret_noise","n":"Frottement de corde","r":"fx"},{"c":"fx","k":"revcym","f":"reverse_cymbal","n":"Cymbale inversée (montée)","r":"fx"},{"c":"fx","k":"shot","f":"gunshot","n":"Détonation","r":"fx"},{"c":"basse","k":"upright","f":"acoustic_bass","n":"Contrebasse","r":"bass"},{"c":"basse","k":"finger","f":"electric_bass_finger","n":"Basse électrique (doigts)","r":"bass"},{"c":"basse","k":"fretless","f":"fretless_bass","n":"Basse fretless (R&B)","r":"bass"},{"c":"basse","k":"slap","f":"slap_bass_1","n":"Basse slap","r":"bass"},{"c":"basse","k":"synbass1","f":"synth_bass_1","n":"Basse synthé 1","r":"bass"},{"c":"basse","k":"synbass2","f":"synth_bass_2","n":"Basse synthé 2","r":"bass"}]/*FIN*/;
const LIBCAT={cloche:'Clochettes et percussions mélodiques',corde:'Cordes pincées',clavier:'Claviers',vent:'Vents',voix:'Voix et chœurs',orch:'Cordes et orchestre',synth:'Synthés 80-90, R&B, new jack',pad:'Nappes et ambiances',jeu:'Jeux vidéo (8-bit)',fx:'Bruitages et ASMR',basse:'Basses réelles'};
const LIBK={}; SOUNDLIB.forEach(x=>{ LIBK[x.k]=x; });
const libOf=type=>{ const m=/^(lib|sfx):(.+)$/.exec(type||''); return m?LIBK[m[2]]:null; };
const libName=type=>{ const x=libOf(type); return x?x.n:''; };
const libCache={};
SOUNDLIB.forEach(x=>{ const ty=(x.f?'lib:':'sfx:')+x.k; if(x.c==='basse') BASS_TYPES[ty]=x.n; else STYLES['L:'+x.k]=[x.n,ty,[],x.c]; });
// menu « son » : styles prêts puis la bibliothèque, rangée par familles
function soundOptions(syn){
  const opt=(v,l)=>`<option value="${v}">${l.replace(/</g,'&lt;')}</option>`;
  const grp=(l,items)=>items.length?`<optgroup label="${l}">${items.join('')}</optgroup>`:'';
  if(syn){ const base=Object.keys(STYLES).filter(k=>!STYLES[k][3]).map(k=>opt(k,STYLES[k][0]));
    return grp('Styles prêts (son + effets)',base)+Object.keys(LIBCAT).filter(c=>c!=='basse').map(c=>grp(LIBCAT[c],Object.keys(STYLES).filter(k=>STYLES[k][3]===c).map(k=>opt(k,STYLES[k][0])))).join(''); }
  return grp('Synthèse',Object.keys(BASS_TYPES).filter(k=>!libOf(k)).map(k=>opt(k,BASS_TYPES[k])))+grp(LIBCAT.basse,Object.keys(BASS_TYPES).filter(k=>libOf(k)).map(k=>opt(k,BASS_TYPES[k])));
}
function libReady(type){ const x=libOf(type); return !x||!x.f||!!(libCache[x.k]&&libCache[x.k].notes); }
function b64ab(s){ const bin=atob(s), u=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i); return u.buffer; }
function decodeAB(ab){ return new Promise((res,rej)=>{ try{ const p=ctx.decodeAudioData(ab,res,rej); if(p&&p.then) p.then(res,rej); }catch(e){ rej(e); } }); }
// charge un instrument (une seule fois ; ensuite il reste en mémoire et dans le cache hors connexion)
function loadLib(type){
  const x=libOf(type); if(!x||!x.f) return Promise.resolve();
  const c=libCache[x.k]||(libCache[x.k]={});
  if(c.notes) return Promise.resolve(); if(c.p) return c.p;
  c.p=(async()=>{
    let r; try{ r=await fetch('sounds/'+x.f+'.json'); }catch(e){ throw new Error('net'); }
    if(!r.ok) throw new Error('net');
    const j=await r.json(), notes=[];
    for(const k of Object.keys(j.notes)){
      const b=await decodeAB(b64ab(j.notes[k])); let d=b.getChannelData(0);
      if(b.sampleRate!==SR){ const q=b.sampleRate/SR, n=Math.floor(d.length/q), o=new Float32Array(n); for(let i=0;i<n;i++){ const p=i*q, i0=Math.floor(p), fr=p-i0; o[i]=d[i0]*(1-fr)+(d[i0+1]||0)*fr; } d=o; }
      let s=0; while(s<d.length&&Math.abs(d[s])<1e-4) s++;
      const dd=d.slice(s); notes.push(Object.assign({m:+k,d:dd},x.ring?{}:findLoop(dd)));
    }
    let pk=0; notes.forEach(o=>{ for(let i=0;i<o.d.length;i+=4) pk=Math.max(pk,Math.abs(o.d[i])); });
    const g=pk>0?0.9/pk:1; notes.forEach(o=>{ for(let i=0;i<o.d.length;i++) o.d[i]*=g; });
    c.notes=notes.sort((p,q)=>p.m-q.m);
    // les rendus déjà calculés avec le son de secours sont refaits
    tracks.forEach(t=>{ if(t.bass&&t.bass.type===type){ t.pp=null; } }); try{ songCache.clear(); }catch(e){}
  })().catch(e=>{ c.p=null; throw e; });
  return c.p;
}
// point de bouclage d'une note tenue : là où le son ressemble le plus à la fin de la boucle (raccord sans creux)
function findLoop(d){
  const le=Math.floor(d.length-0.25*SR), W=1024, a0=Math.floor(d.length*0.3), a1=Math.floor(d.length*0.5);
  if(le-W<a1) return {};
  let e2=0; for(let i=le-W;i<le;i++) e2+=d[i]*d[i];
  let best=-2, bs=a0;
  const sc=s=>{ let c=0,s2=0; for(let i=0;i<W;i+=2){ const u=d[s-W+i]; c+=u*d[le-W+i]; s2+=u*u; } return c/Math.sqrt((s2||1e-12)*(e2/2||1e-12)); };
  for(let s=a0;s<a1;s+=3){ const v=sc(s); if(v>best){ best=v; bs=s; } }
  for(let s=bs-3;s<=bs+3;s++){ const v=sc(s); if(v>best){ best=v; bs=s; } }
  return {ls:bs,le,lc:best};
}
// joue une note avec l'échantillon le plus proche (au plus 1,5 demi-ton de décalage)
function libNote(out,st,dur,f,vel,type,f2){
  const x=libOf(type), c=libCache[x.k];
  if(!c||!c.notes){ loadLib(type).catch(()=>{}); return instrNote(out,st,dur,f,vel,'soft',f2); }
  const m=69+12*Math.log2(f/440), m2=f2&&f2!==f?69+12*Math.log2(f2/440):m;
  let best=c.notes[0]; c.notes.forEach(o=>{ if(Math.abs(o.m-m)<Math.abs(best.m-m)) best=o; });
  const d=best.d, r1=Math.pow(2,(m-best.m)/12), r2=Math.pow(2,(m2-best.m)/12), L=out.length;
  const ring=!!x.ring, rel=ring?0.3:0.12, natural=d.length/r1/SR;
  const total=ring?Math.min(natural,dur+1.6):dur+rel;
  const n=Math.round(total*SR), fadeAt=ring?Math.max(0,total-rel):dur;
  // notes tenues plus longues que l'échantillon : on boucle sa partie stable avec un fondu enchaîné
  // longueur de boucle = un nombre entier de périodes de la note, pour que le raccord soit en phase (pas de creux)
  const le=best.le||0, ls=best.ls||0, xf=Math.floor(0.04*SR), canLoop=!ring&&le-ls>xf*3, ep=(best.lc||0)<0.9;
  let p=0;
  for(let i=0;i<n;i++){
    const t=i/SR, rr=r1===r2?r1:r1*Math.pow(r2/r1,Math.min(1,t/Math.max(dur,0.01)));
    if(canLoop&&p>=le) p-=le-ls;
    const i0=Math.floor(p); if(i0>=d.length-1) break;
    const fr=p-i0; let v=d[i0]*(1-fr)+d[i0+1]*fr;
    if(canLoop&&p>le-xf&&p<le){ const w=(p-(le-xf))/xf, q=p-(le-ls), j=Math.floor(q), fq=q-j, gi=ep?Math.sin(w*Math.PI/2):w, go=ep?Math.cos(w*Math.PI/2):1-w; v=v*go+(d[j]*(1-fq)+d[j+1]*fq)*gi; }
    let env=1; if(t>fadeAt) env=Math.max(0,1-(t-fadeAt)/rel);
    out[(st+i)%L]+=v*env*vel*0.7;
    p+=rr;
  }
}
// sons de jeux vidéo et bruitages, fabriqués ici (à la hauteur de la note)
function sfxNote(out,st,dur,f,vel,type){
  const k=libOf(type).k, L=out.length, TW=2*Math.PI;
  const len={coin:0.45,jump:0.32,laser:0.35,powerup:0.6,drop:0.35,bubble:0.18,cowbell:0.5,claves:0.15}[k]||dur+0.05;
  const n=Math.round(len*SR); let ph=0, ph2=0, sd=(st*7919+7)%2147483647||1;
  for(let i=0;i<n;i++){
    const t=i/SR; let fr=f, v=0, env=1;
    if(k==='sq8'||k==='tri8'){ ph+=f/SR; ph-=Math.floor(ph); v=k==='sq8'?(ph<0.5?0.5:-0.5):(2*Math.abs(2*ph-1)-1)*0.8; env=(t<0.004?t/0.004:1)*(t>dur?Math.max(0,1-(t-dur)/0.03):1); }
    else if(k==='coin'){ fr=t<0.07?f*2:f*2*Math.pow(2,5/12)*1.335; ph+=fr/SR; ph-=Math.floor(ph); v=ph<0.5?0.45:-0.45; env=Math.exp(-Math.max(0,t-0.07)/0.12); }
    else if(k==='jump'){ fr=f*Math.pow(2,1.5*t/len); ph+=fr/SR; ph-=Math.floor(ph); v=ph<0.5?0.45:-0.45; env=1-t/len; }
    else if(k==='laser'){ fr=f*4*Math.pow(0.12,t/len); ph+=fr/SR; ph-=Math.floor(ph); v=ph<0.25?0.5:-0.5; env=1-t/len; }
    else if(k==='powerup'){ const step=Math.floor(t/0.05), semi=[0,4,7,12,4,7,12,16,7,12,16,19][step%12]; fr=f*Math.pow(2,semi/12); ph+=fr/SR; ph-=Math.floor(ph); v=ph<0.5?0.4:-0.4; env=1-t/len; }
    else if(k==='drop'){ fr=f*2*(1+1.4*Math.min(1,t/0.05)); ph+=fr/SR; ph-=Math.floor(ph); v=Math.sin(TW*ph); env=(t<0.002?t/0.002:1)*Math.exp(-t/0.06); }
    else if(k==='bubble'){ fr=f*(1+2.5*t/len); ph+=fr/SR; ph-=Math.floor(ph); v=Math.sin(TW*ph); env=Math.sin(Math.PI*t/len); }
    else if(k==='cowbell'){ ph+=f*1.0/SR; ph-=Math.floor(ph); ph2+=f*1.48/SR; ph2-=Math.floor(ph2); v=((ph<0.5?1:-1)+(ph2<0.5?1:-1))*0.3; env=(t<0.002?t/0.002:1)*(0.35*Math.exp(-t/0.02)+0.65*Math.exp(-t/0.18)); }
    else if(k==='claves'){ ph+=f*2/SR; ph-=Math.floor(ph); sd=(sd*16807)%2147483647; v=Math.sin(TW*ph)+0.15*(sd/2147483647*2-1)*Math.exp(-t/0.003); env=Math.exp(-t/0.04); }
    out[(st+i)%L]+=v*env*vel*0.7;
  }
}
function defaultBass(nb,kind){ return kind==='synth'?{kind:'synth',rhy:'melodie',mel:'same',type:'soft',style:'clean',len:1,beats:8,segs:[{s:0,e:nb||8,n:0,m:60,glide:false}]}:{rhy:'noire',mel:'same',type:'sub',len:1,beats:8,segs:[{s:0,e:nb||8,n:0,glide:false}]}; }
function nbOf(t){ return loopLen?beats:(+$('.bbeats',t.el).value||8); }
// les blocs couvrent toujours toute la boucle, sans trou ni chevauchement
function normSegs(segs,nb){
  const q=v=>Math.round((+v||0)*192)/192;
  let sg=(segs||[]).map(x=>{ const rest=x.n==null||+x.n<0; return {s:q(x.s),e:q(x.e),n:rest?null:((Math.round(+x.n)%12)+12)%12,m:(!rest&&x.m!=null)?Math.round(+x.m):undefined,glide:!!x.glide,g:x.g?String(x.g):undefined,ch:(!rest&&x.ch&&CHORDS[x.ch])?x.ch:undefined}; }).filter(x=>x.e>x.s).sort((a,b)=>a.s-b.s);
  if(!sg.length) return [{s:0,e:nb,n:0,glide:false}];
  const tot=sg[sg.length-1].e, ratio=nb/tot;
  if(tot<nb&&tot>0&&Math.abs(ratio-Math.round(ratio))<1e-9&&sg[0].s===0){ const base=sg.slice(); for(let k=1;k<Math.round(ratio);k++) base.forEach(x=>sg.push({...x,s:x.s+k*tot,e:x.e+k*tot})); }
  sg=sg.filter(x=>x.s<nb);
  sg[0].s=0; for(let i=1;i<sg.length;i++) sg[i].s=sg[i-1].e;
  sg[sg.length-1].e=nb;
  return sg.filter(x=>x.e>x.s);
}
// note exacte de chaque bloc : celle enregistrée (m), sinon l'octave la plus proche du bloc précédent
// registre permis (octave ▼▲, transposer) et registre normal (choix dans la palette)
const genRange=k=>k==='synth'?[36,96]:[24,52], genPick=k=>k==='synth'?[48,84]:[28,52];
const foldInto=(m,lo,hi)=>{ while(m>hi) m-=12; while(m<lo) m+=12; return m; };
function segRoots(segs,kind){
  const roots=[]; let prev=null, hi=kind==='synth'?84:52, lo=kind==='synth'?48:28, base=n=>kind==='synth'?60+n:rootOf(n);
  segs.forEach(x=>{ if(x.n==null){ roots.push(null); return; } let m; if(x.m!=null){ const g=genRange(kind); m=foldInto(x.m,g[0],g[1]); } else { m=prev!=null?nearOct(base(x.n),prev):base(x.n); while(m>hi) m-=12; while(m<lo) m+=12; } roots.push(m); prev=m; });
  return roots;
}
const noteName=m=>NOTE_FR[((m%12)+12)%12]+(Math.floor(m/12)-1);
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
function normBass(o,nb,kind){
  const d=defaultBass(nb,kind), r={...d,...(o||{})};
  if(o&&!o.rhy&&o.pat){ const m=LEGACY_PAT[o.pat]||['noire','same']; r.rhy=m[0]; r.mel=m[1]; }
  if(!RHYTHMS[r.rhy]) r.rhy='noire'; if(!MELODIES[r.mel]) r.mel='same';
  r.segs=normSegs(o&&o.segs?o.segs:(o&&o.note!=null?legacySegs(o,nb):d.segs),nb);
  return r;
}
function ensureDraft(t){ const nb=nbOf(t); if(!t.bdraft) t.bdraft=normBass(t.bass,nb,t.kind); t.bdraft.segs=normSegs(t.bdraft.segs,nb); if((t.bsel||0)>=t.bdraft.segs.length) t.bsel=t.bdraft.segs.length-1; if(t.brange&&t.brange[1]>=t.bdraft.segs.length) t.brange=null; return t.bdraft; }
// ----- blocs choisis ensemble, groupes, duplication d'un motif -----
let gidN=0; const newGid=()=>'g'+Date.now().toString(36)+(++gidN);
// zoom de la ligne de temps : on voit nb/zoom temps à partir de bview
const ZOOMS=[1,2,4,8];
function tlSpan(t,nb){ return nb/(t.bzoom||1); }
function tlView(t,nb){ const sp=tlSpan(t,nb); t.bview=clamp(t.bview||0,0,Math.max(0,nb-sp)); return t.bview; }
function tlFollow(t){ const d=ensureDraft(t), nb=nbOf(t), sp=tlSpan(t,nb), v=tlView(t,nb), cur=d.segs[t.bsel||0]; if(!cur||(t.bzoom||1)===1) return; if(cur.s<v-1e-6||cur.e>v+sp+1e-6) t.bview=clamp(cur.s-sp*0.15,0,Math.max(0,nb-sp)); }
// grille de la ligne de temps : 1 = noire (temps), 0.5 = croche, 0.25 = double croche, 1/3 = triolet
const gridOf=t=>+(t.bgrid||1);
const snapG=(t,p)=>{ const g=gridOf(t); return Math.round(Math.round(p/g)*g*192)/192; };
const FR_FRAC={'0.5':' et demi','0.25':' + ¼','0.75':' + ¾','0.333':' + ⅓','0.667':' + ⅔','0.125':' + ⅛','0.375':' + ⅜','0.625':' + ⅝','0.875':' + ⅞'};
function beatLbl(k){ const w=Math.floor(k+1e-9), f=k-w; if(f<1e-6) return 'temps '+(w+1); return 'temps '+(w+1)+(FR_FRAC[f.toFixed(3).replace(/0+$/,'').replace(/\.$/,'')]||FR_FRAC[String(Math.round(f*1000)/1000)]||(' + '+String(Math.round(f*100)/100).replace('.',','))); }
// des blocs plus courts qu'un temps ne sont joués que si le rythme suit les blocs
function ensureFollow(t){
  const d=ensureDraft(t), r=$('.brhy',t.el); if(!r||r.value==='melodie') return '';
  if(d.segs.some(x=>x.e-x.s<1-1e-6||Math.abs(x.s-Math.round(x.s))>1e-6)){ r.value='melodie'; return ' Rythme réglé sur « Suivre les notes » pour que chaque petit bloc soit joué.'; }
  return '';
}
function bRange(t){ const n=ensureDraft(t).segs.length, f=Math.min(n-1,t.bsel||0); if(!t.brange) return [f,f]; const a=Math.min(n-1,t.brange[0]), b=Math.min(n-1,t.brange[1]); return [Math.min(a,b,f),Math.max(a,b,f)]; }
function groupSpan(segs,i){ const g=segs[i]&&segs[i].g; if(!g) return [i,i]; let a=i,b=i; segs.forEach((x,k)=>{ if(x.g===g){ a=Math.min(a,k); b=Math.max(b,k); } }); return [a,b]; }
// les notes réelles sont figées avant de déplacer des blocs, pour que rien d'autre ne change d'octave
function freezeRoots(t){ const d=ensureDraft(t), r=segRoots(d.segs,t.kind); d.segs.forEach((x,i)=>{ if(r[i]!=null){ x.m=r[i]; x.n=((r[i]%12)+12)%12; } }); }
// remplace ce qu'il y a entre A et B par les blocs donnés
function overwriteSegs(segs,A,B,blocks){
  const out=[]; segs.forEach(x=>{ if(x.e<=A||x.s>=B){ out.push(x); return; } if(x.s<A) out.push({...x,e:A,glide:false}); if(x.e>B) out.push({...x,s:B}); });
  blocks.forEach(x=>{ const s=Math.max(A,x.s), e=Math.min(B,x.e); if(e>s) out.push({...x,s,e}); });
  return out.sort((p,q)=>p.s-q.s);
}
function bassGroup(t,on){
  const d=ensureDraft(t), [a,b]=bRange(t);
  if(on){ if(a===b){ msg('Choisis d\'abord plusieurs blocs : coche « choisir plusieurs blocs », puis touche le dernier bloc du motif.'); return; }
    const g=newGid(); for(let i=a;i<=b;i++) d.segs[i].g=g; }
  else { let k=0; for(let i=a;i<=b;i++) if(d.segs[i].g){ delete d.segs[i].g; k++; } if(!k){ msg('Ces blocs ne sont pas groupés.'); return; } }
  if(t.buf) genBass(t); else bassChanged(t);
  msg(on?'Blocs '+(a+1)+' à '+(b+1)+' groupés : toucher l\'un d\'eux choisit tout le groupe.':'Blocs dissociés.');
}
function bassDup(t,cnt){
  const nb=nbOf(t); freezeRoots(t);
  const d=ensureDraft(t), [a,b]=bRange(t), S=d.segs[a].s, E=d.segs[b].e, L=E-S;
  const n=cnt==='fill'?Math.ceil((nb-E)/L-1e-9):(+cnt||1);
  if(n<1||E>=nb){ msg('Pas de place après ce motif : il va déjà jusqu\'à la fin de la boucle ('+nb+' temps). Allonge la boucle ou choisis un motif plus tôt.'); return; }
  const src=d.segs.slice(a,b+1), grouped=src.some(x=>x.g); let segs=d.segs, last=E, k=0;
  for(k=1;k<=n;k++){ const A=S+k*L; if(A>=nb) break; const g=grouped?newGid():undefined;
    segs=overwriteSegs(segs,A,Math.min(nb,A+L),src.map(x=>{ const y={...x,s:x.s+k*L,e:x.e+k*L}; if(grouped) y.g=g; else delete y.g; return y; })); last=Math.min(nb,A+L); }
  k--;
  d.segs=normSegs(segs,nb);
  const i0=d.segs.findIndex(x=>x.s>=E-1e-9), i1=d.segs.findIndex(x=>x.e>=last-1e-9);
  t.bsel=i0<0?0:i0; t.brange=i1<0?null:[t.bsel,i1];
  if(t.buf) genBass(t); else bassChanged(t);
  const fb=x=>String(Math.round(x*100)/100).replace('.',','), cutEnd=last>=nb&&S+(k+1)*L>nb+1e-9;
  msg('Motif (temps '+fb(S+1)+' → '+fb(E)+') copié '+k+' fois à la suite'+(cutEnd?' (la dernière copie est coupée à la fin de la boucle)':'')+'.'+(t.buf?' ↶ pour revenir.':' Touche « ✓ Créer » pour l\'entendre.'));
}
const rootOf=n=>n<=4?36+n:24+n;
const nearOct=(m,ref)=>{ while(m-ref>6) m-=12; while(ref-m>6) m+=12; return m; };
function bassEvents(o,nb){ const segs=normSegs(o.segs,nb); if(o.kind!=='synth') segs.forEach(x=>{ delete x.ch; }); return expandChords(bassEventsRaw(o,nb),o,segs); }
function bassEventsRaw(o,nb){
  const segs=normSegs(o.segs,nb), bars=Math.max(1,Math.ceil(nb/meter)), roots=segRoots(segs,o.kind);
  const nextRoot=i=>{ for(let k=1;k<=segs.length;k++){ const r=roots[(i+k)%segs.length]; if(r!=null) return r; } return roots[i]; };
  if(o.rhy==='melodie') return segs.map((sg,i)=>{
    if(sg.n==null) return null;
    const root=roots[i], nr=nearOct(nextRoot(i),root);
    return {pos:sg.s,m:root,m2:(sg.glide&&segs.length>1)?nr:root,len:Math.max(0.1,(sg.e-sg.s)*Math.min(1,o.len||1)-0.02),vel:1,si:i};
  }).filter(Boolean);
  const rh=(RHYTHMS[o.rhy]||RHYTHMS.noire)[1];
  const segAt=p=>{ for(let i=0;i<segs.length;i++) if(p>=segs[i].s&&p<segs[i].e) return i; return segs.length-1; };
  let raw=[];
  for(let b=0;b<bars;b++) for(const e of rh){ if(e[0]>=meter) continue; const pos=b*meter+e[0]; if(pos>=nb) continue; raw.push({pos,len:e[1]*(o.len||1),vel:e[2],si:segAt(pos)}); }
  raw=raw.filter(r=>segs[r.si].n!=null);
  const cnt=new Array(segs.length).fill(0); raw.forEach(r=>{ r.k=cnt[r.si]++; });
  return raw.map(r=>{
    const sg=segs[r.si], root=roots[r.si], nroot=nearOct(nextRoot(r.si),root), last=r.k===cnt[r.si]-1;
    let iv=0;
    if(o.mel==='oct') iv=r.k%2?12:0;
    else if(o.mel==='fifth') iv=r.k%2?7:0;
    else if(o.mel==='walk') iv=(last&&cnt[r.si]>1)?nroot-1-root:[0,7,12][r.k%3];
    const len=Math.max(0.1,Math.min(r.len,sg.e-r.pos)), m=root+iv;
    const m2=(sg.glide&&last&&segs.length>1)?nroot+(iv===12?12:0):m;
    return {pos:r.pos,m,m2,len,vel:r.vel,si:r.si};
  });
}
// ---------- accords ----------
const CHORDS={'':['note seule',[0]],maj:['majeur',[0,4,7]],min:['mineur',[0,3,7]],'7':['7 (septième)',[0,4,7,10]],maj7:['maj7 (chill, lo-fi)',[0,4,7,11]],m7:['m7 (lo-fi, R&B)',[0,3,7,10]],m9:['m9 (néo-soul)',[0,3,7,10,14]],maj9:['maj9 (rêveur)',[0,4,7,11,14]],add9:['add9',[0,4,7,14]],sus2:['sus2',[0,2,7]],sus4:['sus4',[0,5,7]],'6':['6',[0,4,7,9]],dim:['diminué',[0,3,6]],aug:['augmenté',[0,4,8]],'5':['quinte (power)',[0,7,12]]};
const CH_SUF={'':'',maj:'',min:'m','7':'7',maj7:'maj7',m7:'m7',m9:'m9',maj9:'maj9',add9:'add9',sus2:'sus2',sus4:'sus4','6':'6',dim:'dim',aug:'aug','5':'5'};
const CHPLAY={plaque:'Plaqué (toutes les notes ensemble)',strum:'Gratté (léger décalage, façon guitare)',up:'Arpège qui monte',down:'Arpège qui descend',updown:'Arpège aller-retour',up2:'Arpège sur 2 octaves'};
function expandChords(ev,o,segs){
  if(!segs.some(x=>x.ch&&CHORDS[x.ch]&&x.ch!=='')) return ev.map(e=>{ const {si,...r}=e; return r; });
  const mode=CHPLAY[o.chplay]?o.chplay:'plaque', step=+o.arp||0.5, out=[];
  ev.forEach(e=>{
    const sg=segs[e.si], ivs=(sg&&CHORDS[sg.ch]?CHORDS[sg.ch][1]:[0]);
    const base={...e}; delete base.si;
    if(ivs.length<2){ out.push(base); return; }
    if(mode==='plaque'||mode==='strum'){ ivs.forEach((iv,k)=>out.push({pos:e.pos+(mode==='strum'?k*0.045:0),m:e.m+iv,m2:e.m2+iv,len:Math.max(0.1,e.len-(mode==='strum'?k*0.045:0)),vel:e.vel*0.8})); return; }
    let seq=ivs.slice(); if(mode==='down') seq.reverse(); else if(mode==='updown') seq=ivs.concat(ivs.slice(1,-1).reverse()); else if(mode==='up2') seq=ivs.concat(ivs.map(v=>v+12));
    const n=Math.max(1,Math.round(e.len/step+0.3));
    for(let k=0;k<n;k++){ const p=e.pos+k*step; if(p>=e.pos+e.len-1e-6&&k>0) break; const iv=seq[k%seq.length]; out.push({pos:p,m:e.m+iv,m2:e.m+iv,len:Math.max(0.08,Math.min(step*0.95,e.pos+e.len-p)),vel:e.vel*(k%seq.length===0?1:0.85)}); }
  });
  return out;
}
// progressions toutes prêtes (degrés depuis la tonique, accord) : remplissent la ligne de temps en blocs égaux
const PROGS={
  lofi:['Lo-fi · ii – V – I – vi (7e)',[[2,'m7'],[7,'7'],[0,'maj7'],[9,'m7']]],
  chill:['Chill · IV – iii – ii – I (maj7)',[[5,'maj7'],[4,'m7'],[2,'m7'],[0,'maj7']]],
  neosoul:['Néo-soul / R&B · I – vi – ii – V (9e)',[[0,'maj9'],[9,'m9'],[2,'m9'],[7,'7']]],
  pop:['Pop / rap · I – V – vi – IV',[[0,'maj'],[7,'maj'],[9,'min'],[5,'maj']]],
  trap:['Trap mineur · i – VI – III – VII',[[0,'min'],[8,'maj'],[3,'maj'],[10,'maj']]],
  sad:['Mélancolique · vi – IV – I – V',[[9,'min'],[5,'maj'],[0,'maj'],[7,'maj']]],
  dream:['Rêveur · I – IV (add9, sus2)',[[0,'add9'],[5,'sus2'],[0,'add9'],[5,'maj7']]],
  jazz:['Jazz · ii – V – I (2 temps chacun)',[[2,'m7'],[7,'7'],[0,'maj7'],[0,'6']]]
};
// ---------- mélodie chantée → notes ----------
// suivi de la note chantée (méthode YIN), sur un son ramené à 12 kHz pour aller vite
function pitchTrack(x){
  const D=4, sr=SR/D, n=Math.floor(x.length/D), y=new Float32Array(n);
  for(let i=0;i<n;i++){ let a=0; for(let j=0;j<D;j++) a+=x[i*D+j]; y[i]=a/D; }
  const W=512, H=128, tmin=Math.floor(sr/1100), tmax=Math.ceil(sr/60), d=new Float32Array(tmax+2), dn=new Float32Array(tmax+2), fr=[];
  let rmsMax=0;
  for(let st=0;st+W+tmax+1<n;st+=H){
    let e=0; for(let j=0;j<W;j++) e+=y[st+j]*y[st+j];
    const rms=Math.sqrt(e/W); if(rms>rmsMax) rmsMax=rms;
    let f=null, conf=0;
    if(rms>1e-4){
      for(let tau=1;tau<=tmax+1;tau++){ let sum=0; for(let j=0;j<W;j++){ const v=y[st+j]-y[st+j+tau]; sum+=v*v; } d[tau]=sum; }
      let run=0; dn[0]=1; for(let tau=1;tau<=tmax+1;tau++){ run+=d[tau]; dn[tau]=run>0?d[tau]*tau/run:1; }
      let best=-1;
      for(let tau=tmin;tau<tmax;tau++){ if(dn[tau]<0.15){ while(tau+1<tmax&&dn[tau+1]<dn[tau]) tau++; best=tau; break; } }
      if(best>0){ const a=dn[best-1], b=dn[best], c=dn[best+1], den=a-2*b+c, p=den?0.5*(a-c)/den:0; f=sr/(best+p); conf=1-b; }
    }
    fr.push({t:(st+W/2)/sr,f,conf,rms});
  }
  return {frames:fr,rmsMax,hop:H/sr};
}
// repérage des notes chantées : une note ne change que si la voix s'éloigne nettement et durablement (le vibrato et les glissés ne créent plus de fausses notes)
function voiceNotes(x){
  const {frames,rmsMax,hop}=pitchTrack(x), thr=Math.max(0.004,rmsMax*0.08);
  let p=frames.map(f=>(f.f&&f.f>60&&f.f<1100&&f.conf>0.8&&f.rms>thr)?69+12*Math.log2(f.f/440):null);
  p=p.map((v,i)=>{ if(v==null) return null; const w=[]; for(let k=i-8;k<=i+8;k++) if(k!==i&&k>=0&&k<p.length&&p[k]!=null) w.push(p[k]); if(w.length<4) return v; w.sort((a,b)=>a-b); const md=w[w.length>>1]; let u=v; while(u-md>9) u-=12; while(md-u>9) u+=12; return u; });
  p=p.map((v,i)=>{ if(v==null) return null; const w=[p[i-1],v,p[i+1]].filter(z=>z!=null).sort((a,b)=>a-b); return w[w.length>>1]; });
  const notes=[]; let cur=null, nulls=0, dev=0, devStart=-1;
  const med=a=>{ const w=a.slice().sort((x,y)=>x-y); return w[w.length>>1]; };
  // centre de la note : sans les 9 dernières trames ; écart jugé sur une moyenne glissante de 9 trames (≈ 0,1 s) qui gomme le vibrato
  const center=fr=>med(fr.length>12?fr.slice(Math.max(0,fr.length-40),fr.length-9):fr);
  const close=()=>{ if(cur&&cur.fr.length>=3){ notes.push({m:Math.round(med(cur.fr)),t0:cur.t0,t1:cur.t1}); } cur=null; dev=0; };
  for(let i=0;i<p.length;i++){
    const v=p[i], t=frames[i].t;
    if(v==null){ nulls++; if(cur&&nulls>=4) close(); continue; }
    nulls=0;
    if(!cur){ cur={fr:[v],ix:[i],t0:t,t1:t}; dev=0; continue; }
    cur.fr.push(v); cur.ix.push(i); cur.t1=t;
    if(cur.fr.length<14){ continue; }
    const win=cur.fr.slice(-9), avg=win.reduce((a,b)=>a+b,0)/win.length, c=center(cur.fr);
    if(Math.abs(avg-c)>0.6){
      if(dev===0) devStart=cur.fr.length-6; dev++;
      if(dev>=4){
        const k=Math.max(3,devStart), nf=cur.fr.slice(k), ni=cur.ix.slice(k);
        cur.fr=cur.fr.slice(0,k); cur.t1=frames[cur.ix[k-1]].t;
        const t0=frames[ni[0]].t; close(); cur={fr:nf,ix:ni,t0,t1:t};
      }
    } else dev=0;
  }
  close();
  // notes éclair de passage (glissé de la voix entre deux notes collées) : rattachées à la note suivante
  for(let i=notes.length-2;i>=1;i--){ const a=notes[i-1], b=notes[i], c=notes[i+1];
    if(b.t1-b.t0<0.12&&b.t0-a.t1<0.06&&c.t0-b.t1<0.06&&(b.m-a.m)*(c.m-b.m)>=0) { c.t0=b.t0; notes.splice(i,1); } }
  return {notes,hop};
}
function melodyToSegs(x,nb,q,kind){
  const {notes,hop}=voiceNotes(x), beatSec=loopSec()/beats, segs=[];
  notes.forEach(nt=>{
    let s0=clamp(Math.round(nt.t0/beatSec/q)*q,0,nb), e0=clamp(Math.round((nt.t1+hop)/beatSec/q)*q,0,nb);
    const l=segs[segs.length-1];
    if(l&&s0<l.e) s0=l.e;
    if(e0-s0<q-1e-9) return;
    if(l&&s0>l.e&&s0-l.e<q-1e-9) l.e=s0;
    if(l&&l.m===nt.m&&Math.abs(l.e-s0)<1e-9) l.e=e0; else segs.push({s:s0,e:e0,m:nt.m});
  });
  if(!segs.length) return null;
  const ms=segs.map(z=>z.m).sort((a,b)=>a-b), medM=ms[Math.floor(ms.length/2)], shift=kind==='synth'?0:12*Math.round((36-medM)/12);
  const out=[]; let pos=0;
  segs.forEach(z=>{ if(z.s>pos+1e-9) out.push({s:pos,e:z.s,n:null}); const m=z.m+shift; out.push({s:z.s,e:z.e,n:((m%12)+12)%12,m}); pos=z.e; });
  if(pos<nb-1e-9) out.push({s:pos,e:nb,n:null});
  return {segs:out,count:segs.length,shift,lo:ms[0]+shift,hi:ms[ms.length-1]+shift,orig:[ms[0],ms[ms.length-1]]};
}

function fillMelSrc(t){
  const sel=$('.msrc',t.el); if(!sel) return;
  const list=tracks.filter(x=>x!==t&&x.buf&&!isGen(x)), cur=sel.value;
  sel.innerHTML=list.length?list.map(x=>`<option value="${x.id}"></option>`).join(''):'<option value="">aucune piste enregistrée</option>';
  list.forEach((x,i)=>{ sel.options[i].textContent=x.name; });
  if(list.some(x=>String(x.id)===cur)) sel.value=cur; else if(list.length) sel.value=String(list[list.length-1].id);
  $('.mgo',t.el).disabled=!list.length;
}
function melToBass(t){
  const src=tracks.find(x=>String(x.id)===$('.msrc',t.el).value);
  if(!src||!src.buf||!loopLen){ msg('Enregistre d\'abord ta mélodie sur une piste normale, puis choisis-la ici.'); return; }
  const q=+$('.mq',t.el).value, r=melodyToSegs(playBuf(src).getChannelData(0),nbOf(t),q,t.kind);
  if(!r){ msg('Je n\'ai repéré aucune note nette : chante plus fort ou plus près du micro, et une seule note à la fois.'); return; }
  const d=ensureDraft(t); d.segs=r.segs; t.bsel=0;
  $('.brhy',t.el).value='melodie';
  bassChanged(t);
  const oct=r.shift/12;
  msg(r.count+' note'+(r.count>1?'s':'')+' repérée'+(r.count>1?'s':'')+' sur « '+src.name+' » ('+noteName(r.orig[0])+' à '+noteName(r.orig[1])+')'+(oct?(oct<0?', descendue':', montée')+(r.count>1?'s':'')+' de '+Math.abs(oct)+' octave'+(Math.abs(oct)>1?'s':''):'')+(t.kind==='synth'?' : la mélodie joue maintenant de ':' : la basse joue maintenant de ')+noteName(r.lo)+' à '+noteName(r.hi)+'. Écoute l\'aperçu, ajuste avec « Transposer » ou la palette, puis « '+(t.kind==='synth'?'Créer la mélodie':'Créer la basse')+' ».');
}
function transposeBass(t,dd){
  const d=ensureDraft(t), roots=segRoots(d.segs,t.kind);
  const ms=roots.filter(x=>x!=null); if(!ms.length) return;
  const lo=genRange(t.kind)[0], hi=genRange(t.kind)[1];
  if(Math.min(...ms)+dd<lo||Math.max(...ms)+dd>hi){ msg('Limite atteinte : '+(t.kind==='synth'?'la mélodie':'la basse')+' irait trop '+(dd<0?'grave':'aigu')+'.'); return; }
  d.segs.forEach((x,i)=>{ if(roots[i]==null) return; x.m=roots[i]+dd; x.n=((x.m%12)+12)%12; });
  bassChanged(t);
  msg((t.kind==='synth'?'Mélodie':'Basse')+' transposée : de '+noteName(Math.min(...ms)+dd)+' à '+noteName(Math.max(...ms)+dd)+'.');
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
  const tv=$('.btype',el).value, syn=t.kind==='synth', st=syn?(STYLES[tv]?tv:'clean'):undefined;
  return {kind:syn?'synth':undefined,rhy:$('.brhy',el).value,mel:$('.bmel',el).value,type:syn?STYLES[st][1]:tv,style:st,grid:gridOf(t),chplay:syn?$('.bchplay',el).value:undefined,arp:syn?+$('.barp',el).value:undefined,len:+$('.blen',el).value,beats:+$('.bbeats',el).value,segs:d.segs.map(x=>({...x}))};
}
function showBassOpts(t){
  const el=t.el; t.bdraft=null; t.bsel=0; t.brange=null;
  const o=normBass(t.bass,nbOf(t),t.kind); t.bdraft=o;
  { const cp=$('.bchplay',el); if(cp) cp.value=CHPLAY[o.chplay]?o.chplay:'plaque'; const ar=$('.barp',el); if(ar) ar.value=String([1,0.5,0.25,1/3].find(v=>Math.abs(v-(+o.arp||0.5))<1e-6)||0.5); }
  t.bgrid=[1,0.5,0.25,1/3].find(v=>Math.abs(v-(+o.grid||1))<1e-6)||1; { const gs=$('.bgrid',el); if(gs) gs.value=String(t.bgrid); }
  $('.brhy',el).value=o.rhy; $('.bmel',el).value=o.mel; $('.btype',el).value=t.kind==='synth'?(o.style||'clean'):o.type; $('.blen',el).value=String(o.len); $('.bbeats',el).value=String(o.beats||8);
  drawBassTimeline(t);
  { const ty=t.kind==='synth'?(STYLES[o.style||'clean']||STYLES.clean)[1]:o.type; if(!libReady(ty)) loadLib(ty).catch(()=>{}); }
}
function drawBassTimeline(t){
  const c=$('.btl',t.el); if(!c) return;
  const d=ensureDraft(t), segs=d.segs, nb=nbOf(t), sel=t.bsel||0, cur=segs[sel], [ra,rb]=bRange(t), inR=i=>i>=ra&&i<=rb;
  const lab=x=>x.n==null?'—':NOTE_FR[x.n]+(x.ch&&CH_SUF[x.ch]!=null?CH_SUF[x.ch]:'')+(x.glide?' ↝':''), rests=segs.filter(x=>x.n==null).length;
  $('.btlinfo',t.el).textContent=(segs.length<=10?segs.map(lab).join(' → ')+' · ':'')+segs.length+' bloc'+(segs.length>1?'s':'')+(rests?' (dont '+rests+' silence'+(rests>1?'s':'')+')':'');
  if(cur.n!=null) $('.bsn',t.el).value=String(cur.n); $('.bgl',t.el).checked=!!cur.glide; $('.bgl',t.el).disabled=segs.length<2;
  $('.bsplit',t.el).disabled=cur.e-cur.s<2*gridOf(t)-1e-6; $('.bdel',t.el).disabled=segs.length<2;
  $('.bprevb',t.el).disabled=sel<=0; $('.bnextb',t.el).disabled=sel>=segs.length-1;
  t.el.querySelectorAll('.bpal button').forEach(b=>b.classList.toggle('on',b.dataset.n==='-1'?cur.n==null:+b.dataset.n===cur.n));
  const fb=x=>String(Math.round(x*100)/100).replace('.',','), rts=segRoots(segs,t.kind);
  $('.bselinfo',t.el).textContent=ra!==rb?('Blocs '+(ra+1)+' → '+(rb+1)+' : temps '+fb(segs[ra].s+1)+' → '+fb(segs[rb].e)+(segs.slice(ra,rb+1).every(x=>x.g&&x.g===segs[ra].g)?' · groupe':'')+' · touché : bloc '+(sel+1)+(cur.n!=null?' ('+noteName(rts[sel])+')':'')):('Bloc '+(sel+1)+' : '+((Math.abs(cur.s-Math.round(cur.s))<1e-6&&Math.abs(cur.e-Math.round(cur.e))<1e-6)?'temps '+fb(cur.s+1)+' → '+fb(cur.e):beatLbl(cur.s)+', dure '+fb(cur.e-cur.s)+' temps')+(cur.n!=null?' · '+noteName(rts[sel]):' · silence')+(cur.g?' · groupé':''));
  { const m=$('.bmulti',t.el); if(m) m.checked=!!t.bmulti; const u=$('.bungrp',t.el); if(u) u.disabled=!segs.slice(ra,rb+1).some(x=>x.g); const gb=$('.bgrp',t.el); if(gb) gb.disabled=ra===rb; const db=$('.bdup',t.el); if(db) db.disabled=segs[rb].e>=nb; }
  t.el.querySelectorAll('.boct').forEach(b=>b.disabled=cur.n==null);
  { const cs=$('.bchord',t.el); if(cs){ cs.value=cur.ch&&CHORDS[cur.ch]?cur.ch:''; cs.disabled=cur.n==null; } }
  const span=tlSpan(t,nb), view=tlView(t,nb);
  { const z=t.bzoom||1, sc=$('.bscroll',t.el), zi=$('.bzlbl',t.el); if(sc){ sc.hidden=z===1; sc.max=String(Math.max(0,nb-span)); sc.step='0.25'; sc.value=String(view); } if(zi) zi.textContent='×'+z; t.el.querySelectorAll('.bzm').forEach(b=>b.disabled=(+b.dataset.z<0&&z===1)||(+b.dataset.z>0&&z===ZOOMS[ZOOMS.length-1])); }
  $('.bgo',t.el).textContent=t.buf?'✓ Appliquer les changements':(t.kind==='synth'?'✓ Créer la mélodie':'✓ Créer la basse');
  const dpr=window.devicePixelRatio||1, w=Math.floor(c.clientWidth*dpr), hh=Math.floor(c.clientHeight*dpr); if(!w||!hh) return;
  c.width=w; c.height=hh;
  const g=c.getContext('2d'); g.clearRect(0,0,w,hh);
  const X=p=>(p-view)/span*w, RH=Math.round(hh*0.32), by0=RH+4*dpr, by1=hh-4*dpr;
  // règle des temps (zone à toucher pour couper)
  g.fillStyle='rgba(255,255,255,.06)'; g.fillRect(0,0,w,RH);
  const step=(w/span)<26*dpr?(meter):(1);
  g.textAlign='center'; g.textBaseline='middle'; g.font=Math.round(RH*0.48)+"px 'Barlow Condensed','Arial Narrow',sans-serif";
  { const gr=gridOf(t); if(gr<1){ g.fillStyle='rgba(255,255,255,.16)'; for(let p=gr;p<nb-1e-6;p=Math.round((p+gr)*192)/192){ if(Math.abs(p-Math.round(p))<1e-6) continue; const half=Math.abs(p*2-Math.round(p*2))<1e-6; g.fillRect(X(p),RH*(half?0.7:0.8),1,half?RH*0.3+(hh-RH)*0.0:RH*0.2); g.fillStyle='rgba(255,255,255,.07)'; g.fillRect(X(p),RH,1,hh-RH); g.fillStyle='rgba(255,255,255,.16)'; } } }
  for(let k=0;k<=nb;k++){
    g.fillStyle=k%meter===0?'rgba(255,255,255,.55)':'rgba(255,255,255,.22)';
    g.fillRect(X(k),k%meter===0?0:RH*0.55,1,k%meter===0?hh:RH*0.45);

  }
  g.font=Math.round((by1-by0)*0.42)+"px 'Barlow Condensed','Arial Narrow',sans-serif";
  segs.forEach((x,i)=>{
    const x0=X(x.s)+2*dpr, x1=X(x.e)-2*dpr;
    g.fillStyle=x.n==null?(inR(i)?'rgba(255,255,255,.2)':'rgba(255,255,255,.07)'):'hsl('+NOTE_HUE[x.n]+',70%,'+(inR(i)?'52%':'38%')+')';
    if(g.roundRect){ g.beginPath(); g.roundRect(x0,by0,Math.max(2,x1-x0),by1-by0,8*dpr); g.fill(); } else g.fillRect(x0,by0,Math.max(2,x1-x0),by1-by0);
    if(inR(i)){ g.strokeStyle='#fff'; g.lineWidth=(i===sel?2.5:1.5)*dpr; if(g.roundRect){ g.beginPath(); g.roundRect(x0,by0,Math.max(2,x1-x0),by1-by0,8*dpr); g.stroke(); } else g.strokeRect(x0,by0,x1-x0,by1-by0); }
    g.fillStyle='#fff'; if(x1-x0>24*dpr) g.fillText(x.n==null?'—':NOTE_FR[x.n]+(x.ch&&CH_SUF[x.ch]!=null?CH_SUF[x.ch]:'')+(x.glide?' ↝':''),(x0+x1)/2,(by0+by1)/2);
    if(x.g&&(i===0||segs[i-1].g!==x.g)){ let j=i; while(j+1<segs.length&&segs[j+1].g===x.g) j++; g.fillStyle='#fff'; g.fillRect(X(x.s)+4*dpr,hh-3.5*dpr,X(segs[j].e)-X(x.s)-8*dpr,3*dpr); }
    if(i<segs.length-1){ const nw=Math.min(X(x.e)-X(x.s),X(segs[i+1].e)-X(segs[i+1].e>x.e?x.e:segs[i+1].s)), roomy=nw>=34*dpr;
      g.fillStyle='#FF8A00'; if(roomy){ g.fillRect(X(x.e)-2*dpr,0,4*dpr,hh); g.font=Math.round(RH*0.5)+'px sans-serif'; g.fillText('✂',X(x.e),RH*0.42); g.font=Math.round((by1-by0)*0.42)+"px 'Barlow Condensed','Arial Narrow',sans-serif"; }
      else { g.fillRect(X(x.e)-1*dpr,RH*0.55,2*dpr,RH*0.45); g.globalAlpha=0.55; g.fillRect(X(x.e)-0.75*dpr,RH,1.5*dpr,hh-RH); g.globalAlpha=1; } }
  });
  // numéros des temps, par-dessus les coupes
  g.font=Math.round(RH*0.48)+"px 'Barlow Condensed','Arial Narrow',sans-serif"; g.textAlign='center'; g.textBaseline='middle';
  for(let k=0;k<nb;k++){ if(k%step!==0) continue; const xc=X(k+0.5); if(xc<-20||xc>w+20) continue; const s=String(k+1), tw=g.measureText?g.measureText(s).width:10;
    g.fillStyle='rgba(20,20,22,.85)'; g.fillRect(xc-tw/2-3*dpr,RH*0.12,tw+6*dpr,RH*0.6); g.fillStyle=k%meter===0?'rgba(255,255,255,.9)':'rgba(255,255,255,.6)'; g.fillText(s,xc,RH*0.42); }
}
function bassChanged(t,live){ drawBassTimeline(t); drawBassViz(t); if(live!==false&&preview&&preview.t===t) startPreview(t); }
// écoute immédiate d'une note (palette, octave) avec le son choisi pour la piste
let auditionSrc=null;
function libWait(type,then){
  msg('Chargement du son « '+libName(type)+' »… (la première fois seulement)');
  loadLib(type).then(()=>{ msg('Son « '+libName(type)+' » prêt.'); then(); }).catch(()=>msg('Impossible de charger « '+libName(type)+' » : il faut internet la première fois que tu utilises ce son.'));
}
function auditionNote(t,m,ch){
  if(m==null||!isFinite(m)) return;
  try{ ctx.resume(); }catch(e){}
  if(auditionSrc){ try{ auditionSrc.stop(); }catch(e){} auditionSrc=null; }
  const o0=readBassOpts(t); if(!libReady(o0.type)){ libWait(o0.type,()=>auditionNote(t,m,ch)); return; }
  const o=o0, ring=(libOf(o.type)||{}).ring, dur=0.55, n=Math.round((dur+(ring?1.7:0.45))*SR), d=new Float32Array(n);
  ((CHORDS[ch]||CHORDS[''])[1]).forEach((iv,k)=>synthNote(d,Math.round(k*0.03*SR),dur,440*Math.pow(2,(m+iv-69)/12),1,o.type));
  let pk=0; for(let i=0;i<n;i++) pk=Math.max(pk,Math.abs(d[i])); if(pk>0){ const g=0.6/pk; for(let i=0;i<n;i++) d[i]*=g; }
  const b=ctx.createBuffer(1,n,SR); b.copyToChannel(d,0);
  const s=ctx.createBufferSource(), g=ctx.createGain(); s.buffer=b; g.gain.value=Math.max(0.2,t.vol||0.8);
  s.connect(g); g.connect(chain.inp); s.start(ctx.currentTime+0.01); auditionSrc=s;
}
function initBassTimeline(t){
  const c=$('.btl',t.el); let drag=null;
  const posAt=ev=>{ const r=c.getBoundingClientRect(), nb=nbOf(t); return tlView(t,nb)+clamp((ev.clientX-r.left)/(r.width||1),0,1)*tlSpan(t,nb); };
  const pick=p=>{ const segs=ensureDraft(t).segs; let k=segs.findIndex(x=>p>=x.s&&p<x.e); if(k<0) k=segs.length-1;
    const [ga,gb]=groupSpan(segs,k);
    if(t.bmulti){ const [a,b]=bRange(t); t.brange=[Math.min(a,ga),Math.max(b,gb)]; t.bsel=k; }
    else if(ga!==gb){ t.brange=[ga,gb]; t.bsel=k; }
    else { t.bsel=k; t.brange=null; }
    drawBassTimeline(t); };
  // un toucher sélectionne le bloc ; la limite orange ne bouge que si le doigt glisse vraiment
  const toggleCut=k=>{
    const d=ensureDraft(t), segs=d.segs, nb=nbOf(t);
    if(k<=1e-6||k>=nb-1e-6) return;
    const bi=segs.findIndex(x=>Math.abs(x.e-k)<1e-6);
    if(bi>=0&&bi<segs.length-1){ segs[bi].e=segs[bi+1].e; segs.splice(bi+1,1); t.bsel=bi; t.brange=null; $('.bst',t.el).textContent='Coupe enlevée ('+beatLbl(k)+').'; }
    else { const i=segs.findIndex(x=>k>x.s+1e-6&&k<x.e-1e-6); if(i<0) return; const x=segs[i]; segs.splice(i+1,0,{s:k,e:x.e,n:x.n,m:x.m,glide:x.glide,g:x.g,ch:x.ch}); x.e=k; x.glide=false; t.bsel=i+1; t.brange=null; $('.bst',t.el).textContent='Coupé au '+beatLbl(k)+' : touche une note pour ce nouveau bloc.'+ensureFollow(t); }
    bassChanged(t);
  };
  c.addEventListener('pointerdown',ev=>{
    const d=ensureDraft(t), segs=d.segs, nb=nbOf(t), p=posAt(ev), r=c.getBoundingClientRect(), px=tlSpan(t,nb)/(r.width||1);
    if(r.height&&ev.clientY-(r.top||0)<r.height*0.32){ toggleCut(snapG(t,p)); drag=null; return; }
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
    const segs=t.bdraft.segs, i=drag.i, g=gridOf(t), v=clamp(snapG(t,posAt(ev)),segs[i].s+g,segs[i+1].e-g);
    if(v!==segs[i].e){ segs[i].e=v; segs[i+1].s=v; bassChanged(t,false); }
  });
  const end=ev=>{ if(!drag) return; const d=drag; drag=null; if(d.moved){ const f=ensureFollow(t); bassChanged(t); if(f) $('.bst',t.el).textContent=f.trim(); } else pick(d.p0); };
  c.addEventListener('pointerup',end); c.addEventListener('pointercancel',()=>{ drag=null; });
  $('.bprevb',t.el).onclick=()=>{ t.bsel=Math.max(0,(t.bsel||0)-1); t.brange=null; tlFollow(t); drawBassTimeline(t); };
  $('.bnextb',t.el).onclick=()=>{ t.bsel=Math.min(ensureDraft(t).segs.length-1,(t.bsel||0)+1); t.brange=null; tlFollow(t); drawBassTimeline(t); };
  t.el.querySelectorAll('.bzm').forEach(b=>b.onclick=()=>{
    const nb=nbOf(t), z0=t.bzoom||1, i=ZOOMS.indexOf(z0), z=ZOOMS[clamp(i+(+b.dataset.z),0,ZOOMS.length-1)]; if(z===z0) return;
    const cur=ensureDraft(t).segs[t.bsel||0], sp1=nb/z, c0=cur?(cur.e-cur.s>sp1?Math.max(cur.s,tlView(t,nb))+sp1/2:(cur.s+cur.e)/2):tlView(t,nb)+tlSpan(t,nb)/2;
    t.bzoom=z; t.bview=clamp(c0-tlSpan(t,nb)/2,0,Math.max(0,nb-tlSpan(t,nb))); drawBassTimeline(t);
    $('.bst',t.el).textContent=z>1?'Zoom ×'+z+' : fais glisser la barre sous la ligne pour te déplacer, ou utilise ◀ ▶.':'';
  });
  { const cs=$('.bchord',t.el); if(cs) cs.onchange=()=>{
      const d=ensureDraft(t), [ra,rb]=t.bmulti?bRange(t):[t.bsel||0,t.bsel||0], v=cs.value; let k=0;
      for(let i=ra;i<=rb;i++){ if(d.segs[i].n==null) continue; if(v) d.segs[i].ch=v; else delete d.segs[i].ch; k++; }
      if(!k){ msg('Choisis d\'abord une note pour ce bloc : l\'accord se construit à partir d\'elle.'); return; }
      bassChanged(t); const r=segRoots(d.segs,t.kind)[t.bsel||0]; if(r!=null) auditionNote(t,r,v);
      $('.bst',t.el).textContent=v?('Accord '+NOTE_FR[d.segs[t.bsel||0].n]+CH_SUF[v]+(k>1?' sur '+k+' blocs':'')+'. Règle « Jeu » pour le jouer plaqué, gratté ou en arpège.'):'Retour à la note seule.';
    }; }
  { const pb=$('.bprogb',t.el); if(pb) pb.onclick=()=>{
      const key=$('.bprog',t.el).value; if(!PROGS[key]){ msg('Choisis d\'abord une suite d\'accords dans la liste.'); return; }
      const d=ensureDraft(t), nb=nbOf(t), steps=PROGS[key][1], tonic=(d.segs.find(x=>x.n!=null)||{n:0}).n, L=nb/steps.length;
      d.segs=steps.map(([deg,ch],i)=>{ const n=(tonic+deg)%12; let m=60+n; while(m>66) m-=12; return {s:Math.round(i*L*192)/192,e:Math.round((i+1)*L*192)/192,n,m,ch,glide:false}; });
      d.segs[d.segs.length-1].e=nb; t.bsel=0; t.brange=null; bassChanged(t);
      msg('Suite « '+PROGS[key][0]+' » en '+NOTE_FR[tonic]+' : '+d.segs.map(x=>NOTE_FR[x.n]+CH_SUF[x.ch]).join(' → ')+'. La tonalité vient de la note du 1er bloc ; « ▲▼ » et « Transposer » la changent.');
    }; }
  $('.bscroll',t.el).oninput=e=>{ t.bview=+e.target.value; drawBassTimeline(t); };
  $('.bmulti',t.el).onchange=e=>{ t.bmulti=e.target.checked; if(!t.bmulti){ t.brange=null; } $('.bst',t.el).textContent=t.bmulti?'Touche le premier puis le dernier bloc du motif : tout ce qui est entre les deux est choisi.':''; drawBassTimeline(t); };
  $('.bgrp',t.el).onclick=()=>bassGroup(t,true);
  $('.bungrp',t.el).onclick=()=>bassGroup(t,false);
  $('.bdup',t.el).onclick=()=>bassDup(t,$('.bdupn',t.el).value);
  $('.bsn',t.el).onchange=e=>{ const d=ensureDraft(t); d.segs[t.bsel||0].n=+e.target.value; bassChanged(t); };
  t.el.querySelectorAll('.bpal button').forEach(b=>b.onclick=()=>{
    const d=ensureDraft(t), x=d.segs[t.bsel||0], v=+b.dataset.n, [ra,rb]=t.bmulti?bRange(t):[t.bsel||0,t.bsel||0];
    if(ra!==rb){ if(v>=0) freezeRoots(t); }
    if(v<0){ for(let i=ra;i<=rb;i++){ d.segs[i].n=null; d.segs[i].m=undefined; } }
    else { const i=t.bsel||0, rts=segRoots(d.segs,t.kind); let ref=null;
      for(let k=i-1;k>=0&&ref==null;k--) ref=rts[k];
      for(let k=i+1;k<rts.length&&ref==null;k++) ref=rts[k];
      const base=t.kind==='synth'?60+v:rootOf(v), pr=genPick(t.kind);
      x.n=v; x.m=foldInto(ref!=null?nearOct(base,ref):base,pr[0],pr[1]);
      for(let i=ra;i<=rb;i++){ d.segs[i].n=v; d.segs[i].m=x.m; } }
    bassChanged(t); $('.bst',t.el).textContent='';
    if(v>=0) auditionNote(t,segRoots(d.segs,t.kind)[t.bsel||0],t.kind==='synth'?d.segs[t.bsel||0].ch:''); });
  t.el.querySelectorAll('.btr').forEach(b=>b.onclick=()=>transposeBass(t,+b.dataset.d));
  // une octave plus grave / plus aiguë pour le bloc choisi seulement (les autres blocs ne bougent pas)
  t.el.querySelectorAll('.boct').forEach(b=>b.onclick=()=>{
    const d=ensureDraft(t), i=t.bsel||0, roots=segRoots(d.segs,t.kind);
    if(roots[i]==null) return;
    const m=roots[i]+(+b.dataset.d), lo=genRange(t.kind)[0], hi=genRange(t.kind)[1];
    if(m<lo||m>hi){ msg('Limite atteinte : ce bloc irait trop '+(+b.dataset.d<0?'grave':'aigu')+'.'); return; }
    d.segs.forEach((x,k)=>{ if(roots[k]!=null){ x.m=roots[k]; x.n=((roots[k]%12)+12)%12; } });
    d.segs[i].m=m; d.segs[i].n=((m%12)+12)%12;
    bassChanged(t); auditionNote(t,m);
    msg('Bloc '+(i+1)+' : '+noteName(roots[i])+' → '+noteName(m)+'. Les autres blocs ne bougent pas.');
  });
  $('.mgo',t.el).onclick=()=>melToBass(t);
  $('.tfb',t.el).onclick=()=>transformTrack(t,'bass');
  $('.tfm',t.el).onclick=()=>transformTrack(t,'synth');
  $('.tfvoice',t.el).onclick=()=>revertVoice(t);
  $('.tfswap',t.el).onclick=()=>convertGen(t,t.kind==='synth'?'bass':'synth');
  $('.bgl',t.el).onchange=e=>{ const d=ensureDraft(t); d.segs[t.bsel||0].glide=e.target.checked; bassChanged(t); };
  $('.bgrid',t.el).onchange=e=>{ t.bgrid=+e.target.value; bassChanged(t,false); $('.bst',t.el).textContent='Grille : '+e.target.selectedOptions[0].textContent+'. Touche la règle pour couper sur les petites graduations.'; };
  $('.bfill',t.el).onclick=()=>{
    const d=ensureDraft(t), g=gridOf(t), [ra,rb]=bRange(t), out=[]; let made=0;
    d.segs.forEach((x,i)=>{ if(i<ra||i>rb||x.e-x.s<2*g-1e-6){ out.push(x); return; } for(let s=x.s;s<x.e-1e-6;s=Math.round((s+g)*192)/192){ out.push({...x,s,e:Math.min(x.e,Math.round((s+g)*192)/192),glide:false}); made++; } });
    if(!made){ msg('Ces blocs font déjà la taille de la grille : choisis une grille plus fine (croche, double croche).'); return; }
    d.segs=out; t.bsel=ra; t.brange=[ra,ra+made-1]; const f=ensureFollow(t); bassChanged(t);
    msg('Découpé en '+made+' notes de '+$('.bgrid',t.el).selectedOptions[0].textContent+'. Touche chaque bloc puis une note de la palette pour écrire ta ligne.'+f);
  };
  $('.bsplit',t.el).onclick=()=>{ const d=ensureDraft(t), i=t.bsel||0, x=d.segs[i], g=gridOf(t); if(x.e-x.s<2*g-1e-6) return; const mid=Math.round((x.s+Math.max(g,Math.round((x.e-x.s)/2/g)*g))*192)/192; d.segs.splice(i+1,0,{s:mid,e:x.e,n:x.n,m:x.m,glide:x.glide,g:x.g,ch:x.ch}); x.e=mid; x.glide=false; t.bsel=i+1; t.brange=null; const f=ensureFollow(t); bassChanged(t); $('.bst',t.el).textContent='Bloc coupé : choisis la note du nouveau bloc, et fais glisser la limite orange pour régler sa durée.'+f; };
  $('.bdel',t.el).onclick=()=>{ const d=ensureDraft(t), i=t.bsel||0; if(d.segs.length<2) return; if(i>0){ d.segs[i-1].e=d.segs[i].e; d.segs.splice(i,1); t.bsel=i-1; } else { d.segs[1].s=0; d.segs.splice(0,1); t.bsel=0; } t.brange=null; bassChanged(t); };
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
  { const o0=readBassOpts(t); if(!libReady(o0.type)){ libWait(o0.type,()=>startPreview(t)); return; } }
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
function genBass(t,noHist){
  if(recObj) return;
  const o=readBassOpts(t);
  if(!libReady(o.type)){ libWait(o.type,()=>genBass(t,noHist)); return; }
  stopPreview(false);
  if(!noHist) pushHist();
  if(!loopLen){
    loopLen=Math.round(o.beats*60/bpm*SR); beats=o.beats; baseLen=loopLen; baseBeats=beats; rep=1; gridOff=0; masterTake=null;
    if(!running) t0=ctx.currentTime;
  }
  const r=makeBass(o);
  const b=ctx.createBuffer(1,loopLen,SR); b.copyToChannel(r.data,0);
  const prevStyle=t.bass&&t.buf?t.bass.style:null;
  t.buf=b; t.sel=null; t.bass=JSON.parse(JSON.stringify(o));
  let fxTxt='';
  if(t.kind==='synth'&&o.style!==prevStyle&&!STYLES[o.style][3]){ const fl=STYLES[o.style][2]; t.fxs=fl.map(ty=>({type:ty,amt:0.45})); if(!t.fxs.length) t.fxs=[{type:'none',amt:0.5}]; renderFx(t); setFx(t); updFxBadge(t); fxTxt=fl.length?' Effets du style posés : '+fl.map(ty=>((FX_LIST.find(f=>f[0]===ty)||[0,''])[1]).split(' (')[0].toLowerCase()).join(' + ')+' (modifiables dans Effets).':''; }
  if(masterTake&&masterTake.i===t.id) masterTake=null;
  syncTrackUI(t); drawWave(t); startSrc(t); buildDots(); lockUI(); updLive(); scheduleSave();
  $('.bst',t.el).textContent=''; drawBassTimeline(t); drawBassViz(t);
  if(t.kind==='synth'){ msg('Mélodie créée : '+(STYLES[o.style][3]?'son':'style')+' « '+STYLES[o.style][0]+' », '+r.count+' notes.'+fxTxt); return; }
  msg('Ligne de basse créée : '+o.segs.map(x=>x.n==null?'—':NOTE_FR[x.n]).join(' → ')+' · '+RHYTHMS[o.rhy][0].toLowerCase()+' · '+MELODIES[o.mel].split(' (')[0].toLowerCase()+' · son '+(BASS_TYPES[o.type]||'').split(' (')[0]+' ('+r.count+' notes).');
}
// ---------- transformer n'importe quelle piste en basse ou en mélodie ----------
function updVoiceUI(t){
  const r=$('.tfback',t.el); if(!r) return;
  r.hidden=!isGen(t);
  const v=$('.tfvoice',t.el); if(v) v.hidden=!t.voice;
  const b=$('.tfswap',t.el); if(b) b.innerHTML=t.kind==='synth'?ic('guitar')+' Changer en ligne de basse':ic('keys')+' Changer en mélodie';
}
// basse ↔ mélodie : on garde les blocs (notes, durées, silences), le rythme et les réglages ; seule l'octave change de registre
function convertGen(t,kind){
  if(!isGen(t)||recObj||t.kind===kind) return;
  stopPreview(false);
  const d=ensureDraft(t), segs=normSegs(d.segs,nbOf(t)), rts=segRoots(segs,t.kind), ms=rts.filter(x=>x!=null).sort((a,b)=>a-b);
  const pr=genPick(kind), med=ms.length?ms[ms.length>>1]:(kind==='synth'?60:36), shift=12*Math.round(((kind==='synth'?60:36)-med)/12);
  const o=readBassOpts(t);
  pushHist();
  const nb=defaultBass(nbOf(t),kind);
  nb.rhy=o.rhy; nb.mel=o.mel; nb.len=o.len; nb.beats=o.beats;
  nb.segs=segs.map((x,i)=>rts[i]==null?{...x,n:null}:{...x,m:rts[i]+shift,n:mod(rts[i]+shift,12)});
  const oldName=t.name; t.kind=kind; t.bass=nb; t.bdraft=null; t.bsel=0; t.pitch=0; t.pp=null;
  if(/\((basse|mélodie)\)$/.test(t.name)) t.name=t.name.replace(/\((basse|mélodie)\)$/,kind==='synth'?'(mélodie)':'(basse)');
  else if(/^(Basse|Mélodie)( \d+)?$/.test(t.name)) t.name=uniqueTrackName(kind==='synth'?'Mélodie':'Basse',t);
  $('.tn',t.el).textContent=t.name; $('.tnin',t.el).value=t.name;
  setKindUI(t); showBassOpts(t);
  genBass(t,true);
  setTab(t,'bass'); updVoiceUI(t); syncTrackUI(t); updLive(); try{ drawSong(); }catch(e){}
  const lo=ms.length?noteName(ms[0]+shift):'', hi=ms.length?noteName(ms[ms.length-1]+shift):'';
  msg('« '+oldName+' » est maintenant '+(kind==='synth'?'une mélodie (son simple, choisis un style dans « Style »)':'une ligne de basse')+' : mêmes notes et même rythme'+(shift?', '+(shift>0?'montées':'descendues')+' de '+Math.abs(shift/12)+' octave'+(Math.abs(shift)>12?'s':''):'')+(lo?' (de '+lo+' à '+hi+')':'')+'. ↶ pour revenir.');
}
function transformTrack(t,kind){
  if(!t.buf||!loopLen||recObj){ if(!loopLen) msg('Il faut d\'abord une boucle.'); return; }
  stopPreview(false);
  const fromGen=isGen(t);
  if(fromGen&&!t.voice) return;
  const q=+($('.tfq',t.el)||{value:0.25}).value||0.25;
  const data=fromGen?t.voice.play:playBuf(t).getChannelData(0).slice();
  const r=melodyToSegs(data,beats,q,kind);
  if(!r){ msg('Je n\'ai repéré aucune note nette sur « '+t.name+' » : chante ou fredonne plus fort, une seule note à la fois (sur « ou » ou « na »).'); return; }
  pushHist();
  if(!fromGen) t.voice={buf:t.buf,play:data,sel:t.sel?{...t.sel}:null,selMode:t.selMode,off:t.off||0,speed:t.speed||1,pitch:t.pitch||0,fxs:t.fxs.map(f=>({type:f.type,amt:f.amt})),name:t.name};
  t.kind=kind; t.bass=defaultBass(beats,kind); t.bass.segs=r.segs; t.bass.rhy='melodie'; if(kind==='synth') t.bass.style=null;
  t.bdraft=null; t.bsel=0;
  t.sel=null; t.selMode='mute'; t.off=0; t.speed=1; t.pitch=0; t.pp=null; t.sp=null; t.po=null; t.pc=null;
  t.fxs=[{type:'none',amt:0.5}]; renderFx(t); setFx(t); updFxBadge(t);
  const base=t.voice.name||t.name;
  t.name=uniqueTrackName(base+(kind==='synth'?' (mélodie)':' (basse)'),t); $('.tn',t.el).textContent=t.name;
  setKindUI(t); showBassOpts(t);
  genBass(t,true);
  setTab(t,'bass'); updVoiceUI(t); updOffUI(t); updSpeedUI(t); syncTrackUI(t); updLive();
  msg('« '+base+' » transformée en '+(kind==='synth'?'mélodie':'ligne de basse')+' : '+r.count+' note'+(r.count>1?'s':'')+', de '+noteName(r.lo)+' à '+noteName(r.hi)+(kind==='synth'?', à la hauteur de ta voix, avec un son simple sans effet. Change le ton avec « Transposer » ou ▼ ▲ octave, ou choisis un style avec effets dans « Style »':'')+'. Le son enregistré est gardé : « Revenir au son enregistré » dans l\'onglet '+(kind==='synth'?'Mélodie':'Basse')+'. ↶ pour annuler.');
}
function revertVoice(t){
  if(!t.voice||recObj) return;
  stopPreview(false); pushHist();
  const v=t.voice; let b=v.buf;
  if(b.length!==loopLen){ const src=b.getChannelData(0), o=new Float32Array(loopLen); for(let i=0;i<loopLen;i++) o[i]=src[i%src.length]; b=ctx.createBuffer(1,loopLen,b.sampleRate); b.copyToChannel(o,0); }
  t.buf=b; t.sel=v.sel?{...v.sel}:null; t.selMode=v.selMode||'mute'; t.off=v.off||0; t.speed=v.speed||1; t.pitch=v.pitch||0; t.pp=null; t.sp=null; t.po=null; t.pc=null;
  t.fxs=v.fxs.length?v.fxs.map(f=>({...f})):[{type:'none',amt:0.5}]; renderFx(t); setFx(t); updFxBadge(t);
  t.name=v.name||t.name; $('.tn',t.el).textContent=t.name;
  t.kind='rec'; t.bass=null; t.bdraft=null; t.voice=null;
  setKindUI(t); setTab(t,'tf'); syncTrackUI(t); updOffUI(t); updSpeedUI(t); drawWave(t); startSrc(t); lockUI(); updLive(); scheduleSave();
  msg('Retour au son enregistré de « '+t.name+' ».');
}
function addBassTrack(kind){
  kind=kind==='synth'?'synth':'bass';
  const t=addTrack(); if(!t) return null;
  t.kind=kind; t.bass=defaultBass(loopLen?beats:8,kind); t.name=uniqueTrackName(kind==='synth'?'Mélodie':'Basse');
  $('.tn',t.el).textContent=t.name;
  setKindUI(t); showBassOpts(t);
  const b=$('.tbody',t.el); b.hidden=false; $('.tog',t.el).setAttribute('aria-expanded','true'); updFold();
  setTab(t,'bass'); drawBassTimeline(t); drawBassViz(t);
  try{ t.el.scrollIntoView({behavior:'smooth',block:'start'}); }catch(e){}
  updLive(); scheduleSave(true);
  if(kind==='synth'){ const dd=$('.mel2b',t.el); if(dd) dd.open=true; fillMelSrc(t); msg('Piste mélodie créée : choisis ta piste chantée et touche « Repérer les notes », ou place les notes à la main. Choisis ensuite un style.'); }
  else msg('Piste de basse créée : choisis le motif, écoute l\'aperçu, puis « Créer la basse ».');
  return t;
}
// ----- onglets du menu de piste
function setTab(t,tab){
  if(tab==='bass'&&!isGen(t)) tab='son';
  if(tab==='tf'&&isGen(t)) tab='bass';
  t.tab=tab;
  t.el.querySelectorAll('.ttabs button').forEach(b=>b.classList.toggle('on',b.dataset.tab===tab));
  t.el.querySelectorAll('.pane').forEach(p=>p.hidden=p.dataset.pane!==tab);
  if(tab==='cut'){ drawTsel(t); if(masterTake&&tracks[masterTake.i]===t&&$('#editor').style.display!=='none') drawEditor(); }
  if(tab==='bass'){ fillMelSrc(t); drawBassTimeline(t); drawBassViz(t); }
}
function setKindUI(t){
  const bass=isGen(t), syn=t.kind==='synth';
  t.el.classList.toggle('kbass',t.kind==='bass'); t.el.classList.toggle('ksynth',syn);
  const tb=$('.ttabs button[data-tab="bass"]',t.el); if(tb) tb.innerHTML=ic(syn?'keys':'guitar')+' Notes';
  const sel=$('.btype',t.el);
  if(sel&&sel.dataset.k!==(syn?'s':'b')){ sel.dataset.k=syn?'s':'b'; sel.innerHTML=soundOptions(syn); }
  const sm=$('.mel2b summary',t.el); if(sm) sm.innerHTML=ic('mic')+(syn?' Transformer une mélodie chantée en notes':' Transformer une mélodie chantée en basse');
  const mh=$('.mel2b .hint',t.el); if(mh){ mh.textContent=syn?"Chante ou fredonne ta mélodie sur une piste normale, puis choisis-la ici : l'appli repère les notes, les cale sur la boucle et les joue avec le style choisi, à la hauteur de ta voix.":"Chante ou fredonne ta ligne de basse sur une piste normale (à ta hauteur, même aiguë), puis choisis-la ici : l'appli repère les notes, les cale sur la boucle et les descend dans les graves."; mh.dataset.help=syn?'synth':'mel2b'; }
  const bt=$('.bgo',t.el); if(bt&&!t.buf) bt.textContent=syn?'✓ Créer la mélodie':'✓ Créer la basse';
  const lb=$('.bsonlbl',t.el); if(lb) lb.textContent=syn?'Son ou style':'Son';
  t.el.querySelectorAll('.reconly').forEach(e=>e.hidden=bass);
  t.el.querySelectorAll('.synonly').forEach(e=>e.hidden=!syn);
  { const pf=$('.pitchf',t.el); if(pf) pf.hidden=bass&&!t.pitch; }
  { const tf=$('.ttabs button[data-tab="tf"]',t.el); if(tf) tf.hidden=bass; if(bass&&t.tab==='tf') t.tab='bass'; }
  updVoiceUI(t);
  $('.ttabs button[data-tab="bass"]',t.el).hidden=!bass;
  if(bass&&!t.tab) t.tab='bass';
  setTab(t,t.tab||(bass?'bass':'son'));
}
function updSpeedUI(t){
  const e=$('.spv',t.el); if(!e) return;
  const v=t.speed||1; e.textContent=Math.round(v*100)+' %'+(v<1?' (plus lent)':v>1?' (plus rapide)':'');
  t.el.querySelectorAll('.spseg button').forEach(b=>b.classList.toggle('on',Math.abs(+b.dataset.v-v)<0.005));
}
function setSpeed(t,v,why){
  if(!t.buf||recObj) return;
  v=clamp(Math.round(v*100)/100,0.5,2);
  if(v===(t.speed||1)){ updSpeedUI(t); return; }
  touchSettings(); t.speed=v; commitSettings(); t.sp=null; t.pc=null; t.po=null;
  updSpeedUI(t); msg('Calcul de la nouvelle vitesse…');
  setTimeout(()=>{
    startSrc(t); drawWave(t); updFxBadge(t); scheduleSave(true);
    msg(why||('Vitesse de « '+t.name+' » : '+Math.round(v*100)+' %'+(v<1?', la note ne change pas. Si la fin dépasse la boucle, allonge la boucle (Durée ×2) pour l\'entendre en entier.':', la note ne change pas.')));
  },30);
}
// adapter au tempo du projet : on mesure le tempo de la piste, puis on règle sa vitesse pour qu'elle suive la boucle
function adaptSpeed(t){
  if(!t.buf||!loopLen) return;
  const raw=t.buf.getChannelData(0), D=raw.length;
  let best=null;
  for(let p=60;p<=180;p+=5){ const a=analyzeBeat(raw,D,p); if(a&&(!best||a.coh>best.coh)) best=a; }
  if(!best){ msg('Je n\'arrive pas à repérer un rythme net sur cette piste : choisis la vitesse à la main.'); return; }
  const src=60/best.T, cur=curBpm();
  let pick=null; [src,src*2,src/2].forEach(b=>{ const r=cur/b; if(r>=0.5&&r<=2&&(!pick||Math.abs(Math.log(r))<Math.abs(Math.log(cur/pick)))) pick=b; });
  if(!pick){ msg('Tempo de la piste trop éloigné de celui du projet.'); return; }
  setSpeed(t,cur/pick,'Tempo de « '+t.name+' » repéré : '+pick.toFixed(1).replace('.',',')+' BPM. Vitesse réglée à '+Math.round(cur/pick*100)+' % pour suivre le projet ('+cur.toFixed(1).replace('.',',')+' BPM), sans changer la note.');
}
function fmtMs(v){ const ms=Math.round(v*1000); return (ms>0?'+':'')+ms+' ms'; }
function setOffset(t,v){
  if(!t.buf||recObj) return;
  const lim=Math.max(0.5,loopLen?loopSec():0.5);
  v=clamp(Math.round(v*SR)/SR,-lim,lim);
  if(v===t.off) return;
  touchSettings(); t.off=v; t.anc=false; commitSettings(); t.po=null;
  startSrc(t); drawWave(t); updOffUI(t); scheduleSave(true);
}
function updOffUI(t){ const e=$('.offv',t.el); if(e) e.textContent=fmtMs(t.off||0); }
// calage automatique : on mesure de combien les sons de la piste tombent à côté des temps, et on décale toute la piste d'autant
// vraies attaques : celles dont le volume réel atteint au moins 30 % du son le plus fort (les petits bruits sont ignorés)
function strongOnsets(d,L){
  const all=detectOnsets(d,L), win=Math.round(0.03*SR);
  all.forEach(o=>{ let p=0; for(let i=o.n;i<Math.min(L,o.n+win);i++){ const v=Math.abs(d[i]); if(v>p) p=v; } o.pk=p; });
  const mx=Math.max(0,...all.map(o=>o.pk));
  return all.filter(o=>o.pk>=0.3*mx);
}
function autoAlign(t,q){
  if(!t.buf||!loopLen||recObj) return;
  const d=t.buf.getChannelData(0), L=d.length, on=strongOnsets(d,L);
  if(on.length<2){ msg('Pas assez de sons nets sur cette piste pour la caler automatiquement : utilise les boutons ±1 / ±10 ms.'); return; }
  const strong=on.map(o=>o.n);
  const g=L/(beats*q), go=gridOff||0;
  const ds=strong.map(p=>go+Math.round((p-go)/g)*g-p).sort((a,b)=>a-b);
  const med=ds[Math.floor(ds.length/2)], spread=(ds[Math.floor(ds.length*0.8)]-ds[Math.floor(ds.length*0.2)])/2;
  setOffset(t,med/SR);
  msg('Piste « '+t.name+' » décalée de '+fmtMs(t.off)+' : ses sons tombent maintenant sur '+(q===1?'les temps':q===2?'les croches':'les doubles-croches')+', sans rien couper'+(spread/SR>0.025?' (sons assez irréguliers : affine avec ±1 ms si besoin)':'')+'. ↶ pour revenir.');
}
// ---------- caler un jeu au tempo irrégulier (« warp ») ----------
// force des attaques, trame par trame (5 ms), sur une boucle (circulaire)
function onsetEnvelope(x,hop){
  const L=x.length, F=Math.floor(L/hop), e=new Float32Array(F), env=new Float32Array(F);
  for(let j=0;j<F;j++){ let s=0; const a=j*hop; for(let i=0;i<hop;i++){ const v=x[a+i]; s+=v*v; } e[j]=Math.log(1+2000*Math.sqrt(s/hop)); }
  let mx=0; for(let j=0;j<F;j++){ const v=Math.max(0,e[j]-Math.max(e[mod(j-1,F)],e[mod(j-2,F)])); env[j]=v; if(v>mx) mx=v; }
  if(mx>0) for(let j=0;j<F;j++) env[j]/=mx;
  const sm=new Float32Array(F); for(let j=0;j<F;j++) sm[j]=0.5*env[j]+0.25*env[mod(j-1,F)]+0.25*env[mod(j+1,F)];
  return sm;
}
// retrouve les K temps du musicien sur la boucle, même si son tempo varie (programmation dynamique : forte attaque + écart régulier)
function trackBeatsVar(x,K,go){
  const L=x.length, hop=256, env=onsetEnvelope(x,hop), F=env.length, Bf=F/K, lam=6;
  if(F<K*4) return null;
  // temps 1 : la plus forte attaque près du début de la grille
  const g0=Math.round(go/hop); let f0=g0, best=-1;
  for(let d=-Math.round(0.3*Bf);d<=Math.round(0.3*Bf);d++){ const f=mod(g0+d,F), v=env[f]-0.3*Math.abs(d)/Bf; if(v>best){ best=v; f0=g0+d; } }
  const lo=Math.max(1,Math.round(0.6*Bf)), hi=Math.round(1.5*Bf), pen=new Float32Array(hi+1);
  for(let i=lo;i<=hi;i++){ const r=Math.log(i/Bf); pen[i]=lam*r*r; }
  const N=F+hi, S=[], P=[];
  let prev=new Float32Array(N).fill(-1e9); prev[0]=env[mod(f0,F)];
  for(let k=1;k<K;k++){
    const cur=new Float32Array(N).fill(-1e9), back=new Int32Array(N).fill(-1);
    for(let f=k*lo;f<N;f++){ let bv=-1e9, bi=-1;
      for(let i=lo;i<=hi;i++){ const g=f-i; if(g<0) break; const v=prev[g]-pen[i]; if(v>bv){ bv=v; bi=g; } }
      if(bi>=0){ cur[f]=bv+env[mod(f0+f,F)]; back[f]=bi; } }
    S.push(cur); P.push(back); prev=cur;
  }
  // le dernier temps doit rejoindre le temps 1 de la boucle suivante
  let bf=-1, bv=-1e9;
  for(let f=0;f<N;f++){ const i=F-f; if(i<lo||i>hi) continue; const v=prev[f]-pen[i]; if(v>bv){ bv=v; bf=f; } }
  if(bf<0) return null;
  const rel=new Array(K); rel[K-1]=bf; for(let k=K-1;k>=1;k--) rel[k-1]=P[k-1][rel[k]];
  if(rel.some(v=>v==null||v<0)) return null;
  // position exacte : l'attaque la plus proche (à 15 ms près), sinon la trame
  // attaques cherchées aussi sur la boucle décalée d'une demi-longueur (une attaque au tout début reste visible)
  const h2=L>>1, xs=new Float32Array(L); for(let i=0;i<L;i++) xs[i]=x[(i+h2)%L];
  const on=detectOnsets(x,L).map(o=>o.n).concat(detectOnsets(xs,L).map(o=>(o.n+h2)%L));
  return rel.map(r=>{ const c=(f0+r)*hop+hop/2; let bp=c, bd=Math.round(0.015*SR); on.forEach(n=>{ const d=Math.abs(mod(n-c+L/2,L)-L/2); if(d<bd){ bd=d; bp=n; } }); return bp; });
}
// étire ou resserre chaque intervalle entre deux temps du musicien pour qu'il dure exactement un temps du morceau, sans changer la note
function warpLoop(x,beatsAbs,K,go,every){
  const L=x.length, p0=beatsAbs[0];
  const xr=new Float32Array(L); for(let i=0;i<L;i++) xr[i]=x[mod(i+p0,L)];
  let a=beatsAbs.map(p=>mod(p-p0,L)); for(let k=1;k<K;k++) if(a[k]<=a[k-1]) a[k]=a[k-1]+1;
  const B=L/K, A=[], T=[];
  for(let k=0;k<K;k++) if(k%every===0){ A.push(a[k]); T.push(k*B); }
  A.push(L); T.push(L);
  const map=u=>{ let k=0; while(k<A.length-2&&u>=A[k+1]) k++; return T[k]+(u-A[k])*(T[k+1]-T[k])/(A[k+1]-A[k]); };
  // découpe aux attaques (le son entre deux attaques est étiré d'un bloc, les attaques restent nettes)
  const pre=Math.round(0.005*SR), atkLen=pre+Math.round(0.03*SR), W=Math.round(SR*0.032/2)*2, Hs=W/2, fo=Math.round(0.003*SR);
  const cuts=[0]; detectOnsets(xr,L).map(o=>Math.max(0,o.n-pre)).forEach(c=>{ if(c-cuts[cuts.length-1]>pre*2&&c<L-pre*2) cuts.push(c); });
  cuts.push(L);
  const yr=new Float32Array(L);
  for(let i=0;i<cuts.length-1;i++){
    const u=cuts[i], v=cuts[i+1], n=v-u, U=Math.round(map(u)), V=i===cuts.length-2?L:Math.round(map(v)), m=V-U;
    if(m<=0) continue;
    const seg=new Float32Array(m), atk=Math.min(n,atkLen);
    if(m<=atk||n-atk<2*W||m-atk<2*W){ seg.set(xr.subarray(u,u+Math.min(n,m))); if(m>n){ const f=Math.min(fo,n); for(let j=0;j<f;j++) seg[n-1-j]*=j/f; } }
    else { const tail=wsolaLinear(xr.subarray(u+atk-Hs,v),m-atk+Hs,SR);
      for(let j=0;j<atk;j++){ const w=j<atk-Hs?1:0.5+0.5*Math.cos(Math.PI*(j-(atk-Hs))/Hs); seg[j]=xr[u+j]*w; }
      for(let j=0;j<tail.length&&atk-Hs+j<m;j++) seg[atk-Hs+j]+=tail[j]; }
    if(i<cuts.length-2){ const f=Math.min(fo,m); for(let j=0;j<f;j++) seg[m-1-j]*=j/f; }
    yr.set(seg,U);
  }
  const y=new Float32Array(L); for(let j=0;j<L;j++) y[mod(j+Math.round(go),L)]=clamp(yr[j],-1,1);
  const mapPos=u=>mod(map(mod(u-p0,L))+Math.round(go),L);
  return {y,dev:a.map((v,k)=>(v-k*B)/B),mapPos};
}
function warpTrack(t){
  if(!t.buf||!loopLen||recObj) return;
  if(isGen(t)){ msg('Une piste de basse ou de mélodie est déjà calée sur le tempo.'); return; }
  const every=$('.wpe',t.el).value==='M'?meter:1;
  const baked=(t.speed||1)!==1, d=(baked?spedBuf(t):t.buf).getChannelData(0), L=d.length;
  if(L!==loopLen){ msg('Cette piste n\'a pas la longueur de la boucle.'); return; }
  const anc=!!(t.anc&&t.sel), k=anc?0:Math.round((t.off||0)*SR), x=new Float32Array(L); for(let i=0;i<L;i++) x[mod(i+k,L)]=d[i];
  const sel0=t.sel?{...t.sel}:null, mode0=t.selMode||'mute', beats0=beats;
  msg('Analyse du tempo du musicien…');
  setTimeout(()=>{
    let fixed='';
    { const h2=Math.round((gridOff||0)), xl=new Float32Array(L); for(let i=0;i<L;i++) xl[i]=x[(i+h2)%L];
      const fb=followBeats(xl);
      if(fb){ const K2=Math.round(L/SR/fb.T); const alone=!tracks.some(o=>o!==t&&o.buf);
        if(K2>=2&&Math.abs(K2-beats)>=Math.max(2,0.08*beats)){
          if(alone){ pushHist(); fixed=' La grille ne correspondait pas au jeu ('+beats+' temps au lieu de '+K2+') : corrigée.'; beats=K2; baseBeats=Math.max(1,Math.round(K2/rep)); masterTake=null; buildDots(); }
          else { msg('Attention : ce jeu compte environ '+K2+' temps dans la boucle, la grille en a '+beats+'. Le calage risque d\'être faux : vérifie le tempo du morceau.'); }
        } } }
    const bt=trackBeatsVar(x,beats,gridOff||0);
    if(!bt){ msg('Je n\'arrive pas à suivre le rythme de cette piste (pas assez d\'attaques nettes). Essaie « Décaler la piste » ou « Recaler chaque son ».'); return; }
    const r=warpLoop(x,bt,beats,gridOff||0,every);
    if(!fixed) pushHist();
    const nb=ctx.createBuffer(1,L,SR); nb.copyToChannel(r.y,0);
    t.buf=nb; t.off=0; t.po=null; t.pc=null;
    let selTxt='';
    if(sel0){
      const bl0=L/beats0, bl1=L/beats, fx=v=>t.snap!==false&&Math.abs(v-Math.round(v))<0.2?Math.round(v):Math.round(v*1000)/1000;
      let s1=r.mapPos(mod(sel0.s*bl0+k,L))/bl1, e1=sel0.e>=beats0-1e-6?beats:(r.mapPos(mod(sel0.e*bl0+k,L)-1)+1)/bl1;
      if(t.snap!==false){ const n0=Math.max(1,Math.round(sel0.e-sel0.s)); s1=clamp(Math.round(s1),0,Math.max(0,beats-n0)); e1=Math.min(beats,s1+n0); }
      else { s1=clamp(fx(s1),0,beats-0.02); e1=clamp(fx(e1),0.02,beats); if(e1<=s1) e1=Math.min(beats,s1+Math.max(0.25,sel0.e-sel0.s)); }
      t.sel={s:s1,e:e1}; t.selMode=mode0; t.anc=anc;
      if(anc){ const lim=Math.max(0.5,loopSec()); t.off=clamp(Math.round(-(s1*loopSec()/beats)*SR)/SR,-lim,lim); }
      const f2=v=>String(Math.round(v*100)/100).replace('.',',');
      selTxt=' Ta partie est gardée (temps '+f2(s1+1)+' → '+f2(e1)+')'+(mode0==='loop'?' et tourne toujours en boucle':'')+'.';
    } else t.anc=false;
    if(baked){ t.speed=1; t.pitch=0; t.pp=null; t.sp=null; }
    if(masterTake&&masterTake.i===t.id) masterTake=null;
    updOffUI(t); updSpeedUI(t); drawWave(t); drawTsel(t); startSrc(t); lockUI(); scheduleSave();
    const iv=[]; for(let i=0;i<beats;i++){ const a=bt[i], b=i+1<beats?bt[i+1]:bt[0]+L; iv.push(mod(b-a,L)/(L/beats)); }
    const lo=Math.round((Math.min(...iv)-1)*100), hi=Math.round((Math.max(...iv)-1)*100);
    msg('Tempo du musicien repéré : ses temps duraient de '+(lo>0?'+':'')+lo+' % à '+(hi>0?'+':'')+hi+' % d\'un temps du morceau. '+(every===1?'Chaque temps':'Chaque mesure')+' est maintenant calé'+(every===1?'':'e')+' sur la grille ('+beats+' temps), sans changer la note ni couper de son.'+selTxt+fixed+' ↶ pour revenir.');
  },30);
}
function quantizeTrack(t,q,strength){
  if(!t.buf||!loopLen||recObj) return;
  const src=t.buf.getChannelData(0), L=src.length;
  const all=strongOnsets(src,L);
  if(!all.length){ msg('Aucun son net à recaler sur cette piste.'); return; }
  const minGap=Math.round(0.08*SR), on=[];
  all.forEach(o=>{ if(!on.length||o.n-on[on.length-1]>=minGap) on.push(o.n); });
  const g=L/(beats*q), go=gridOff||0, pre=Math.round(0.01*SR), xf=Math.round(0.008*SR);
  const sh=[]; let lastT=null, maxSh=0, moved=0;
  on.forEach((p,i)=>{
    const tg=go+Math.round((p-go)/g)*g;
    if(lastT!==null&&Math.abs(tg-lastT)<1){ sh.push(p-on[i-1]<g*0.5?sh[i-1]:0); return; }
    const v=Math.round((tg-p)*strength); sh.push(v); lastT=tg;
    if(Math.abs(v)>Math.round(0.002*SR)) moved++; maxSh=Math.max(maxSh,Math.abs(v));
  });
  const segs=[], firstA=Math.max(0,on[0]-pre);
  if(firstA>0) segs.push([0,firstA,0]);
  on.forEach((p,i)=>{ const a0=Math.max(0,p-pre), b0=i+1<on.length?Math.max(a0+1,on[i+1]-pre):L; segs.push([a0,b0,sh[i]]); });
  const out=new Float32Array(L);
  for(let i=0;i<segs.length;i++){
    const [a0,b0,s0]=segs[i], nx=segs[i+1];
    let ext=0; if(nx){ ext=xf; const gap=(nx[0]+nx[2])-(b0+s0); if(gap>0) ext+=Math.min(gap,pre); ext=Math.min(ext,pre-Math.round(0.002*SR)); }
    const end=Math.min(L,b0+ext);
    for(let j=a0;j<end;j++){
      let v=src[j];
      if(i>0&&j-a0<xf) v*=(j-a0)/xf;
      if(nx&&j>=end-xf) v*=(end-j)/xf;
      out[mod(j+s0,L)]+=v;
    }
  }
  for(let j=0;j<L;j++) out[j]=clamp(out[j],-1,1);
  pushHist();
  const keep=t.sel?{...t.sel}:null;
  const nb=ctx.createBuffer(1,L,SR); nb.copyToChannel(out,0);
  t.buf=nb; t.sel=keep;
  if(masterTake&&masterTake.i===t.id) masterTake=null;
  drawWave(t); startSrc(t); lockUI(); scheduleSave();
  msg(moved?(moved+' son'+(moved>1?'s':'')+' recalé'+(moved>1?'s':'')+' (décalage max '+Math.round(maxSh/SR*1000)+' ms). Si ta prise est juste en retard partout, préfère « Caler la piste sur le rythme (sans couper) ».'):'Les sons étaient déjà en place.');
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
  <div class="row tb"><button class="m" aria-label="Muet">${ic('mute')} Muet</button><button class="s" aria-label="Solo">${ic('headphones')} Solo</button></div>
  <div class="seg ttabs" style="margin-top:14px"><button data-tab="bass" hidden>${ic('guitar')} Basse</button><button data-tab="son">${ic('sliders')} Son</button><button data-tab="cut">${ic('timer')} Temps</button><button data-tab="fx">${ic('sparkle')} Effets</button><button data-tab="trk">${ic('gear')} Piste</button><button data-tab="tf">${ic('wand')} Transformer</button></div>
  <div class="pane" data-pane="bass" hidden>
    <div class="row wrap"><span class="lbl w2 bsonlbl" data-help="sonlib">Son</span><select class="btype bopt" style="width:auto;max-width:100%">${soundOptions(false)}</select><select class="blen bopt" style="width:auto"><option value="0.5">notes courtes</option><option value="1" selected>notes normales</option><option value="1.6">notes longues</option></select></div>
    <div class="row wrap bbrow"><span class="lbl w2">Longueur</span><select class="bbeats bopt" style="width:auto"><option value="4">4 temps</option><option value="8" selected>8 temps</option><option value="16">16 temps</option></select><span class="hint" style="margin:0">(si aucune boucle n'existe encore)</span></div>
    <div class="row wrap"><button class="bprev">▶ Aperçu</button><button class="bgo primary">✓ Créer la basse</button></div>
    <p class="hint bst"></p>
      <div class="row" style="margin-top:12px"><span class="lbl" data-help="btl">Notes sur la ligne de temps</span><span class="btlinfo lbl" style="margin-left:auto"></span></div>
    <p class="hint" style="margin:6px 0 0">${ic('scissors')} <b>Touche la règle</b> (les numéros de temps) pour couper à cet endroit, ou pour enlever une coupe. <b>Touche un bloc</b> pour le choisir, puis touche sa note ci-dessous.</p>
    <div class="row wrap" style="margin-top:6px"><span class="lbl" data-help="bgrid">Grille</span><select class="bgrid" style="width:auto" aria-label="Grille de la ligne de temps"><option value="1">noire (1 temps)</option><option value="0.5">croche (½ temps)</option><option value="0.25">double croche (¼ temps)</option><option value="0.3333333333333333">triolet (⅓ temps)</option></select><button class="bfill">${ic('scissors')} Découper en notes de la grille</button><span style="display:inline-flex;align-items:center;gap:6px"><button class="bzm" data-z="-1" aria-label="Dézoomer la ligne de temps">${ic('zoomout')}</button><span class="bzlbl lbl">×1</span><button class="bzm" data-z="1" aria-label="Zoomer la ligne de temps">${ic('zoomin')}</button></span></div>
    <canvas class="btl" style="width:100%;height:104px;display:block;margin-top:8px;border-radius:10px;background:rgba(255,255,255,.05);touch-action:none"></canvas>
    <input type="range" class="bscroll" min="0" max="0" step="0.25" value="0" hidden aria-label="Se déplacer dans la ligne de temps" style="width:100%;margin-top:6px">
    <div class="row wrap"><button class="bprevb" aria-label="Bloc précédent" style="min-width:48px">◀</button><span class="bselinfo lbl"></span><button class="bnextb" aria-label="Bloc suivant" style="min-width:48px">▶</button><button class="boct" data-d="-12" data-help="boct">▼ octave</button><button class="boct" data-d="12">▲ octave</button></div>
    <div class="bpal">${NOTE_FR.map((n,i)=>`<button data-n="${i}" style="--h:${NOTE_HUE[i]}">${n}</button>`).join('')}<button data-n="-1" style="--h:0;filter:saturate(0)">∅ Silence</button></div>
    <div class="synonly">
      <div class="row wrap" style="margin-top:8px"><span class="lbl w2" data-help="chords">Accord</span><select class="bchord" style="width:auto" aria-label="Accord du bloc choisi">${Object.keys(CHORDS).map(k=>`<option value="${k}">${CHORDS[k][0]}</option>`).join('')}</select></div>
      <div class="row wrap"><span class="lbl w2">Jeu</span><select class="bchplay bopt" style="width:auto;max-width:100%" aria-label="Façon de jouer les accords">${Object.keys(CHPLAY).map(k=>`<option value="${k}">${CHPLAY[k]}</option>`).join('')}</select><select class="barp bopt" style="width:auto;max-width:100%" aria-label="Vitesse de l'arpège"><option value="1">arpège en noires</option><option value="0.5" selected>arpège en croches</option><option value="0.25">arpège en doubles croches</option><option value="0.3333333333333333">arpège en triolets</option></select></div>
      <div class="row wrap"><span class="lbl w2">Suite d'accords</span><select class="bprog" style="width:auto;max-width:100%" aria-label="Suite d'accords toute prête"><option value="">— choisir —</option>${Object.keys(PROGS).map(k=>`<option value="${k}">${PROGS[k][0]}</option>`).join('')}</select><button class="bprogb">Remplir la ligne</button></div>
    </div>
    <div class="row wrap"><label class="lbl" style="display:flex;align-items:center;gap:6px"><input type="checkbox" class="bgl" style="width:22px;height:22px"> glisser vers le bloc suivant</label><button class="bsplit">${ic('scissors')} Couper le bloc choisi en deux</button><button class="bdel">${ic('trash')} Retirer le bloc</button></div>
    <div class="row" style="margin-top:12px"><span class="lbl" data-help="bgroup">Motif : grouper et dupliquer</span></div>
    <div class="row wrap"><label class="lbl" style="display:flex;align-items:center;gap:6px"><input type="checkbox" class="bmulti" style="width:22px;height:22px"> choisir plusieurs blocs</label><button class="bgrp">${ic('link')} Grouper</button><button class="bungrp">Dissocier</button></div>
    <div class="row wrap"><select class="bdupn" style="width:auto" aria-label="Nombre de copies"><option value="1">1 fois</option><option value="2">2 fois</option><option value="3">3 fois</option><option value="fill">jusqu'à la fin</option></select><button class="bdup primary">⧉ Dupliquer à la suite</button></div>
    <div class="row" style="margin-top:14px"><span class="lbl">Notes jouées</span></div>
    <canvas class="bviz" style="width:100%;height:84px;display:block;margin-top:6px;border-radius:10px;background:rgba(255,255,255,.05)"></canvas>
    <div class="row" style="margin-top:14px"><span class="lbl">${ic('drum')} Rythme et notes ajoutées</span></div>
    <div class="row wrap"><span class="lbl w2" data-help="bass">Rythme</span><select class="brhy bopt" style="width:auto">${Object.keys(RHYTHMS).map(k=>`<option value="${k}">${RHYTHMS[k][0]}</option>`).join('')}</select></div>
    <div class="row wrap"><span class="lbl w2">Mélodie</span><select class="bmel bopt" style="width:auto">${Object.keys(MELODIES).map(k=>`<option value="${k}">${MELODIES[k]}</option>`).join('')}</select></div>
    <div class="row" style="margin-top:14px"><span class="lbl">${ic('tools')} Outils</span></div>
    <div class="row wrap"><span class="lbl w2" data-help="btrans">Transposer</span><button class="btr" data-d="-12">−1 octave</button><button class="btr" data-d="-1">−1 demi-ton</button><button class="btr" data-d="1">+1 demi-ton</button><button class="btr" data-d="12">+1 octave</button></div>
    <select class="bsn" hidden aria-hidden="true">${NOTE_FR.map((n,i)=>`<option value="${i}">${n}</option>`).join('')}</select>
    <div class="row wrap tfback" hidden style="margin-top:6px"><button class="tfvoice">${ic('mic')} Revenir au son enregistré</button><button class="tfswap"></button></div>
    <details class="field mel2b" style="margin-top:12px"><summary class="lbl" style="font-size:18px">${ic('mic')} Transformer une mélodie chantée en basse</summary>
      <p class="hint" data-help="mel2b">Chante ou fredonne ta ligne de basse sur une piste normale (à ta hauteur, même aiguë), puis choisis-la ici : l'appli repère les notes, les cale sur la boucle et les descend dans les graves.</p>
      <div class="row wrap"><span class="lbl w2">Piste</span><select class="msrc" style="width:auto" aria-label="Piste chantée"></select><select class="mq" style="width:auto" aria-label="Calage des notes"><option value="0.25" selected>notes calées à la double-croche</option><option value="0.5">calées à la croche</option><option value="1">calées au temps</option></select></div>
      <div class="row"><button class="mgo primary">${ic('mic')} Repérer les notes et créer les blocs</button></div>
    </details>
</div>
  <div class="pane" data-pane="son">
    <div class="field"><div class="row"><span class="lbl" data-help="pan">Gauche ⇄ Droite</span><span class="pv val" style="margin-left:auto">Centre</span></div><input type="range" class="pan" min="-1" max="1" step="0.05" value="0" aria-label="Panoramique piste ${t.id+1}"></div>
    <div class="field pitchf"><div class="row"><span class="lbl" data-help="pitch">Hauteur du son (la note)</span><span class="ptv val" style="margin-left:auto">0 (son d'origine)</span></div>
      <input type="range" class="pitch" min="-12" max="12" step="1" value="0" aria-label="Hauteur piste ${t.id+1}">
      <div class="row wrap"><button class="p1">−1 octave</button><button class="p0">0</button><button class="p2">+1 octave</button><span class="pst lbl" style="margin-left:auto"></span></div></div>
    <div class="field"><div class="row"><span class="lbl" data-help="speed">Vitesse de la piste</span><span class="spv val" style="margin-left:auto">100 %</span></div>
      <div class="seg spseg" style="margin-top:8px"><button data-v="0.5">50 %</button><button data-v="0.67">67 %</button><button data-v="0.75">75 %</button><button data-v="1">100 %</button><button data-v="1.25">125 %</button><button data-v="1.5">150 %</button><button data-v="2">200 %</button></div>
      <div class="row wrap"><button class="spb" data-d="-0.01">−1 %</button><button class="spb" data-d="0.01">+1 %</button><button class="spauto primary">${ic('target')} Adapter au tempo du projet</button></div></div>
    <div class="field"><div class="row"><span class="lbl" data-help="eq">Tonalité</span></div>
      <div class="seg eqp" style="margin-top:8px">${EQ_PRESETS.map(p=>`<button data-p="${p[0]}">${p[1]}</button>`).join('')}</div>
      <div class="row"><span class="lbl w2">Graves</span><input type="range" class="eq" data-b="0" min="-12" max="12" step="1" value="0" aria-label="Graves piste ${t.id+1}"><span class="val ev" style="width:60px;text-align:right">0 dB</span></div>
      <div class="row"><span class="lbl w2">Médiums</span><input type="range" class="eq" data-b="1" min="-12" max="12" step="1" value="0" aria-label="Médiums piste ${t.id+1}"><span class="val ev" style="width:60px;text-align:right">0 dB</span></div>
      <div class="row"><span class="lbl w2">Aigus</span><input type="range" class="eq" data-b="2" min="-12" max="12" step="1" value="0" aria-label="Aigus piste ${t.id+1}"><span class="val ev" style="width:60px;text-align:right">0 dB</span></div></div>
    <div class="field reconly"><div class="row"><span class="lbl" data-help="denoise">Nettoyer le bruit</span></div>
      <div class="row wrap" style="margin-top:6px"><select class="dnl" style="width:auto" aria-label="Force du nettoyage"><option value="light">Léger (silences)</option><option value="strong">Fort (aussi sous les sons)</option></select><button class="dnb">${ic('broom')} Nettoyer</button></div></div>
  </div>
  <div class="pane" data-pane="cut" hidden>
  <div class="edslot"></div>
  <div class="field tsel" hidden><div class="row"><span class="lbl" data-help="tsel">Garder la partie propre</span><span class="tsl lbl" style="margin-left:auto"></span></div>
    <canvas class="tsc" style="width:100%;height:76px;display:block;margin-top:8px;border-radius:10px;background:rgba(255,255,255,.05);touch-action:none"></canvas>
    <div class="row wrap"><label class="lbl" style="display:flex;align-items:center;gap:6px"><input type="checkbox" class="tsnap" checked style="width:22px;height:22px"> aimanter aux temps</label></div>
    <div class="row wrap"><span class="lbl w2">Début</span><button class="ts1">◀ 1 temps</button><button class="tsn" data-w="s" data-ms="-10">−10 ms</button><button class="tsn" data-w="s" data-ms="-1">−1 ms</button><button class="tsn" data-w="s" data-ms="1">+1 ms</button><button class="tsn" data-w="s" data-ms="10">+10 ms</button><button class="ts2">1 temps ▶</button></div>
    <div class="row wrap"><span class="lbl w2">Fin</span><button class="ts3">◀ 1 temps</button><button class="tsn" data-w="e" data-ms="-10">−10 ms</button><button class="tsn" data-w="e" data-ms="-1">−1 ms</button><button class="tsn" data-w="e" data-ms="1">+1 ms</button><button class="tsn" data-w="e" data-ms="10">+10 ms</button><button class="ts4">1 temps ▶</button></div>
    <div class="row wrap reconly"><select class="tsdupn" style="width:auto" aria-label="Nombre de copies"><option value="1">1 fois</option><option value="2">2 fois</option><option value="3">3 fois</option><option value="fill">jusqu'à la fin</option></select><button class="tsdup" data-help="tsdup">⧉ Copier la partie à la suite</button></div>
    <div class="row wrap"><button class="tsall">Tout garder</button><button class="tsloop primary">${ic('scissors')} Faire de cette partie la boucle</button><button class="tsalign">⇤ Placer la partie au début de la boucle</button></div>
    <div class="row" style="margin-top:14px"><span class="lbl" data-help="trep">Le reste de la piste</span><span class="trl lbl" style="margin-left:auto"></span></div>
    <div class="seg trep" style="margin-top:8px"><button data-m="mute">Silence</button><button data-m="loop">Répéter en boucle</button><button data-m="2">×2</button><button data-m="3">×3</button><button data-m="4">×4</button></div></div>
    <div class="field reconly"><div class="row"><span class="lbl" data-help="warp">Caler un jeu au tempo irrégulier</span></div>
      <div class="row wrap" style="margin-top:6px"><select class="wpe" style="width:auto" aria-label="Repères du calage"><option value="1" selected>repère à chaque temps</option><option value="M">repère à chaque mesure (plus souple)</option></select><button class="wpb primary">${ic('target')} Caler sur le tempo du morceau</button></div></div>
    <div class="field"><div class="row"><span class="lbl" data-help="slip">Décaler la piste dans le temps</span><span class="offv val" style="margin-left:auto">0 ms</span></div>
      <div class="row wrap" style="margin-top:6px"><button class="ofb" data-d="-10">−10 ms</button><button class="ofb" data-d="-1">−1 ms</button><button class="ofb" data-d="1">+1 ms</button><button class="ofb" data-d="10">+10 ms</button><button class="ofz">0</button></div>
      <div class="row wrap"><button class="ofauto primary">${ic('target')} Caler la piste sur le rythme (sans couper)</button></div></div>
    <div class="field reconly"><div class="row"><span class="lbl" data-help="quant">Grille de rythme et recalage son par son</span></div>
      <div class="row wrap" style="margin-top:6px"><select class="qgrid" style="width:auto" aria-label="Grille de recalage"><option value="1">sur les temps</option><option value="2" selected>sur les croches</option><option value="4">sur les doubles-croches</option></select><select class="qstr" style="width:auto" aria-label="Force du recalage"><option value="1">100 % (exact)</option><option value="0.75" selected>75 %</option><option value="0.5">50 % (naturel)</option></select><button class="qbtn">${ic('scissors')} Recaler chaque son</button></div></div>
  </div>
  <div class="pane" data-pane="fx" hidden>
    <div class="field"><div class="row"><span class="lbl" data-help="fx">Effets (tu peux en empiler)</span></div>
      <div class="fxlist"></div>
      <div class="row"><button class="fxadd">+ Ajouter un effet</button></div></div>
    <div class="field"><div class="row"><span class="lbl" data-help="fades">Fondus et sens</span></div>
      <div class="row wrap" style="margin-top:6px"><span class="lbl">Entrée</span><select class="fdi" style="width:auto" aria-label="Fondu d'entrée">${FADE_OPTS}</select><span class="lbl">Sortie</span><select class="fdo" style="width:auto" aria-label="Fondu de sortie">${FADE_OPTS}</select></div>
      <div class="row"><button class="revb">↔ Jouer à l'envers</button></div></div>
  </div>
  <div class="pane" data-pane="tf" hidden>
    <p class="hint" style="margin-top:12px">Transforme ce que tu as enregistré sur cette piste (chant, fredonnement, sifflement…) en notes jouées par un instrument. <b>Le son d'origine est gardé</b> : tu pourras y revenir à tout moment.</p>
    <div class="row wrap"><span class="lbl w2" data-help="tf">Notes calées</span><select class="tfq" style="width:auto" aria-label="Calage des notes"><option value="0.25" selected>à la double-croche</option><option value="0.5">à la croche</option><option value="1">au temps</option></select></div>
    <div class="row wrap"><button class="tfb primary">${ic('guitar')} En ligne de basse</button><button class="tfm primary">${ic('keys')} En mélodie (avec style)</button></div>
  </div>
  <div class="pane" data-pane="trk" hidden>
  <div class="row reconly" style="margin-top:12px"><span class="lbl" data-help="src">Type de son</span><select class="srcsel" aria-label="Type de son piste ${t.id+1}" style="flex:1">${SRC_LIST.map(p=>`<option value="${p.id}">${p.name}</option>`).join('')}</select></div>
  <div class="row wrap reconly"><button class="imp" data-help="imp">${ic('upload')} Importer un son ou une vidéo</button><input type="file" class="impfile" accept="audio/*,video/*,.mp3,.wav,.m4a,.ogg,.aac,.flac,.mp4,.webm,.mkv,.3gp,.mov" hidden></div>
    <div class="field"><div class="row"><span class="lbl" data-help="tname">Nom et place de la piste</span></div>
      <div class="row" style="margin-top:6px"><input type="text" class="tnin" maxlength="24" style="flex:1" aria-label="Nom de la piste"><button class="tnok">Renommer</button></div>
      <div class="row wrap"><button class="tup">▲ Monter</button><button class="tdown">▼ Descendre</button><button class="tdup">⧉ Dupliquer</button></div></div>
    <div class="field"><div class="row"><span class="lbl" data-help="clear">Effacer</span></div>
      <div class="row wrap" style="margin-top:6px"><button class="x">✕ Vider le son (la piste reste)</button><button class="del" hidden>${ic('trash')} Supprimer la piste</button></div></div>
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
  $('.tsdup',el).onclick=()=>recDup(t,$('.tsdupn',el).value);
  $('.tsloop',el).onclick=()=>{ if(tracks.some(x=>x!==t&&x.buf)) loopPart(t); else selToLoop(t); };
  $('.tsalign',el).onclick=()=>alignSelStart(t);
  el.querySelectorAll('.tsn').forEach(b=>b.onclick=()=>{ const q=tsGet(), db=(+b.dataset.ms/1000)/(loopSec()/beats); if(b.dataset.w==='s') setTrackSel(t,q.s+db,q.e); else setTrackSel(t,q.s,q.e+db); });
  $('.tsnap',el).onchange=e=>{ t.snap=e.target.checked; t.pc=null; t.po=null; startSrc(t); drawWave(t); scheduleSave(true); };
  el.querySelectorAll('.trep button').forEach(b=>b.onclick=()=>setSelMode(t,b.dataset.m));
  $('.del',el).onclick=()=>removeTrack(t);
  $('.dnb',el).onclick=()=>denoiseTracks([t],$('.dnl',el).value);
  $('.bgo',el).onclick=()=>genBass(t);
  $('.bprev',el).onclick=()=>{ if(preview&&preview.t===t) stopPreview(); else startPreview(t); };
  el.querySelectorAll('.bopt').forEach(x=>x.onchange=()=>bassChanged(t));
  // en choisissant un son, on l'entend tout de suite sur la note du bloc choisi
  $('.btype',el).onchange=()=>{ bassChanged(t); const d=ensureDraft(t), r=segRoots(d.segs,t.kind), i=t.bsel||0; let m=r[i]; if(m==null) m=r.find(v=>v!=null); if(m==null) m=t.kind==='synth'?60:36; auditionNote(t,m); };
  initBassTimeline(t);
  el.querySelectorAll('.ttabs button').forEach(b=>b.onclick=()=>setTab(t,b.dataset.tab));
  el.querySelectorAll('.spseg button').forEach(b=>b.onclick=()=>setSpeed(t,+b.dataset.v));
  el.querySelectorAll('.spb').forEach(b=>b.onclick=()=>setSpeed(t,(t.speed||1)+(+b.dataset.d)));
  $('.spauto',el).onclick=()=>adaptSpeed(t);
  el.querySelectorAll('.ofb').forEach(b=>b.onclick=()=>setOffset(t,(t.off||0)+(+b.dataset.d)/1000));
  $('.ofz',el).onclick=()=>setOffset(t,0);
  $('.wpb',el).onclick=()=>warpTrack(t);
  $('.ofauto',el).onclick=()=>autoAlign(t,+$('.qgrid',el).value);
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
    const beatAt=ev=>{ const r=c.getBoundingClientRect(), v=clamp((ev.clientX-r.left)/(r.width||1),0,1)*beats; return t.snap===false?v:Math.round(v); };
    const mv=ev=>{ if(!drag) return; const b=beatAt(ev), mn=t.snap===false?0.02:1; if(drag.which==='s') drag.s=clamp(b,0,drag.e-mn); else drag.e=clamp(b,drag.s+mn,beats); drawTsel(t,drag); };
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
  const fb=x=>String(Math.round(x*1000)/1000).replace('.',',');
  lab.textContent=t.sel?('partie : temps '+fb(t.sel.s+1)+' → '+fb(t.sel.e)):(p&&n<beats?'partie détectée : temps '+(p.s+1)+' → '+p.e:'');
  t.el.querySelectorAll('.trep button').forEach(b=>{
    const v=b.dataset.m;
    b.classList.toggle('on',t.sel?v===m:v==='mute');
    const per=repPeriod(n);
    b.disabled=!t.buf||!loopLen||(v!=='mute'&&(!p||n<=0||per>=beats))||(v!=='mute'&&v!=='loop'&&(+v)*per>beats);
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
// la partie choisie devient la boucle : elle commence exactement au début choisi et s'arrête à la fin choisie
function selToLoop(t){
  if(!t.buf||!t.sel||recObj) return;
  if(tracks.some(x=>x!==t&&x.buf)){ msg("D'autres pistes contiennent du son : pour ne pas les décaler, utilise « Placer la partie au début de la boucle »."); return; }
  const L=t.buf.length, bl=L/beats, s0=t.sel.s, e0=t.sel.e;
  const baked=(t.speed||1)!==1, src=(baked?spedBuf(t):t.buf).getChannelData(0);
  let a=Math.round(s0*bl), z=Math.min(L,Math.round(e0*bl)), nMus=0;
  // repères aimantés : on coupe sur les vrais temps du musicien (son tempo peut varier), pas sur la grille moyenne
  if(t.snap!==false){
    const fb=followBeats(src);
    if(fb&&fb.beats.length>=3){
      const B=fb.beats, near=p=>{ let bi=-1, bd=0.5*bl; B.forEach((q,i)=>{ const d=Math.abs(q-p); if(d<bd){ bd=d; bi=i; } }); return bi; };
      const ia=near(a), n0=Math.max(1,Math.round(e0-s0)), iz=ia+n0;
      if(ia>=0&&iz<B.length){ a=B[ia]; z=B[iz]; nMus=n0; }
      else if(ia>=0&&iz===B.length&&L-B[B.length-1]>=0.85*fb.T*SR){ a=B[ia]; z=L; nMus=n0; }
    }
  }
  const len=z-a;
  if(len<Math.round(0.25*SR)){ msg('Partie trop courte pour en faire une boucle.'); return; }
  pushHist();
  const data=src.slice(a,z); applyFades(data);
  const nb=ctx.createBuffer(1,len,SR); nb.copyToChannel(data,0);
  const nbeats=Math.max(1,nMus||Math.round(e0-s0));
  t.buf=nb; t.sel=null; t.selMode='mute'; t.off=0; t.po=null;
  if(baked){ t.speed=1; t.pitch=0; t.pp=null; t.sp=null; }
  loopLen=len; beats=nbeats; baseLen=len; baseBeats=nbeats; rep=1; gridOff=0; masterTake=null;
  if(running){ playFrom(0); } else t0=ctx.currentTime;
  nextBeat=Math.ceil((ctx.currentTime+0.15-t0)/beatDur());
  syncTrackUI(t); updOffUI(t); updSpeedUI(t); drawWave(t); buildDots(); lockUI(); scheduleSave();
  msg('La boucle commence maintenant au début choisi et dure '+nbeats+' temps ('+(len/SR).toFixed(2).replace('.',',')+' s)'+(nMus?', coupée sur les vrais temps du musicien':'')+'. ↶ pour revenir.');
}
// plusieurs pistes : on fait glisser la partie pour qu'elle démarre au début de la boucle (sans toucher à la durée)
// autres pistes : la partie démarre au début de la boucle de base et se répète sur toute sa durée (en un seul geste)
function loopPart(t){
  if(!t.buf||!loopLen||recObj) return;
  let p=t.sel?{s:t.sel.s,e:t.sel.e}:partOf(t);
  if(!p||p.e-p.s>=beats-1e-6){ msg('Choisis d\'abord la partie à faire tourner avec les repères orange (plus courte que la boucle).'); return; }
  touchSettings();
  t.sel={s:p.s,e:p.e}; t.selMode='loop'; t.anc=true;
  const lim=Math.max(0.5,loopSec()); t.off=clamp(Math.round(-(p.s*loopSec()/beats)*SR)/SR,-lim,lim);
  commitSettings(); t.pc=null; t.po=null;
  startSrc(t); drawWave(t); drawTsel(t); updOffUI(t); scheduleSave(true);
  const per=repPeriod(p.e-p.s);
  msg('La partie de « '+t.name+' » démarre au début de la boucle et se répète tous les '+per+' temps, sur toute la boucle ('+beats+' temps). ↶ pour revenir.');
}
function alignSelStart(t){
  if(!t.buf||!t.sel||recObj) return;
  const v=-(t.sel.s*loopSec()/beats);
  setOffset(t,v); t.anc=true;
  msg('La partie de « '+t.name+' » démarre maintenant au début de la boucle (décalage '+fmtMs(t.off)+', rien n\'est coupé). « 0 » dans « Décaler la piste » revient en arrière.');
}
// recopie la partie choisie juste après elle dans la piste (le son qui s'y trouvait est remplacé)
function recDup(t,cnt){
  if(recObj||!t.buf||!loopLen) return;
  if(!t.sel||(t.sel.s<=0&&t.sel.e>=beats)){ msg('Choisis d\'abord la partie à copier : règle début et fin dans le cadre ci-dessus.'); return; }
  const s=t.sel.s, e=t.sel.e, P=e-s;
  if(e>=beats-1e-6){ msg('Pas de place après cette partie : elle va jusqu\'à la fin de la boucle.'); return; }
  const n=cnt==='fill'?Math.ceil((beats-e)/P-1e-9):(+cnt||1);
  const src=t.buf.getChannelData(0), L=src.length, bl=L/beats, a0=Math.round(s*bl), z0=Math.round(e*bl), len=z0-a0, y=Float32Array.from(src), f=Math.min(Math.round(0.004*SR),len>>2);
  let k=0, endB=e;
  for(k=1;k<=n;k++){ const st=Math.round((s+k*P)*bl); if(st>=L-1) break; const m=Math.min(len,L-st);
    for(let i=0;i<m;i++){ const w=i<f?i/f:(m-i<=f&&m===len?(m-i)/f:1); y[st+i]=src[a0+i]*w+y[st+i]*(1-w); }
    endB=Math.min(beats,e+k*P); }
  k--; if(k<1) return;
  pushHist();
  const mode=t.selMode, nb=ctx.createBuffer(1,L,t.buf.sampleRate); nb.copyToChannel(y,0);
  t.buf=nb; t.sel={s,e:Math.round(endB*1e6)/1e6}; t.selMode=mode; if(masterTake&&masterTake.i===t.id) masterTake=null;
  if(t.sel.s<=0&&t.sel.e>=beats){ t.sel=null; t.selMode='mute'; }
  drawWave(t); startSrc(t); drawTsel(t); lockUI(); scheduleSave();
  const fb=x=>String(Math.round(x*100)/100).replace('.',',');
  msg('Partie (temps '+fb(s+1)+' → '+fb(e)+') copiée '+k+' fois juste après'+(s+(k+1)*P>beats+1e-6?' (la dernière copie est coupée à la fin de la boucle)':'')+'. La partie gardée va maintenant jusqu\'au temps '+fb(endB)+'. ↶ pour revenir.');
}
function setTrackSel(t,s,e){
  if(!t.buf||!loopLen) return;
  const r6=x=>Math.round(x*1e6)/1e6;
  s=r6(clamp(s,0,beats-0.02)); e=r6(clamp(e,0.02,beats));
  if(e-s<0.02) return;
  const ns=(Math.abs(s)<1e-6&&Math.abs(e-beats)<1e-6)?null:{s,e};
  if((!ns&&!t.sel)||(ns&&t.sel&&ns.s===t.sel.s&&ns.e===t.sel.e)){ drawTsel(t); return; }
  pushHist();
  t.sel=ns; t.pc=null;
  if(t.anc){ if(ns){ const lim=Math.max(0.5,loopSec()); t.off=clamp(Math.round(-(ns.s*loopSec()/beats)*SR)/SR,-lim,lim); } else { t.off=0; t.anc=false; t.selMode='mute'; } t.po=null; updOffUI(t); }
  drawWave(t);
  startSrc(t); drawWave(t); drawTsel(t); scheduleSave(true);
}
function drawTsel(t,dr){
  const c=$('.tsc',t.el); if(!c) return;
  updRepUI(t);
  const q=dr||t.sel||{s:0,e:beats};
  const fb=x=>{ const v=Math.round(x*1000)/1000; return String(v).replace('.',','); };
  $('.tsl',t.el).textContent=(q.s===0&&q.e===beats)?'Tout est gardé':'Temps '+fb(q.s+1)+' → '+fb(q.e)+' sur '+beats;
  const sn=$('.tsnap',t.el); if(sn) sn.checked=t.snap!==false;
  const others=tracks.some(x=>x!==t&&x.buf), hasSel=!!t.sel; const tl=$('.tsloop',t.el), ta=$('.tsalign',t.el);
  if(tl){ tl.hidden=!t.buf||!loopLen; tl.innerHTML=others?ic('loop')+' Faire tourner cette partie en boucle':ic('scissors')+' Faire de cette partie la boucle'; } if(ta){ ta.hidden=!hasSel; }
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
function uniqueTrackName(base,self){ base=String(base).slice(0,24); const n=new Set(tracks.filter(x=>x!==self).map(x=>x.name)); if(!n.has(base)) return base; let k=2; while(n.has(base+' '+k)) k++; return base+' '+k; }
function renameTrack(t,v){
  v=String(v||'').trim().slice(0,24);
  if(!v||v===t.name){ $('.tnin',t.el).value=t.name; return; }
  touchSettings(); t.name=v; commitSettings();
  $('.tn',t.el).textContent=v; $('.tnin',t.el).value=v; updLive(); try{ drawSong(); }catch(e){} scheduleSave(true);
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
  n.fromDup=true;
  n.vol=t.vol; n.panv=t.panv; n.mute=t.mute; n.solo=false; n.srcType=t.srcType;
  n.fxs=t.fxs.map(f=>({type:f.type,amt:f.amt})); n.eqv=t.eqv.slice();
  n.eq.lo.gain.value=n.eqv[0]; n.eq.mid.gain.value=n.eqv[1]; n.eq.hi.gain.value=n.eqv[2];
  n.fadeIn=t.fadeIn; n.fadeOut=t.fadeOut; n.kind=t.kind; n.bass=t.bass?JSON.parse(JSON.stringify(t.bass)):null; setKindUI(n); if(n.bass) showBassOpts(n);
  n.name=uniqueTrackName(t.name+' copie'); $('.tn',n.el).textContent=n.name;
  n.buf=t.buf; n.sel=t.sel?{...t.sel}:null; n.selMode=t.selMode; n.off=t.off||0; n.anc=!!t.anc; n.snap=t.snap; n.speed=t.speed||1; if(t.sp&&t.sp.b===t.buf) n.sp=t.sp; updOffUI(n); updSpeedUI(n); n.pitch=t.pitch; if(t.pp&&t.pp.b===t.buf) n.pp=t.pp;
  tracks.splice(tracks.indexOf(n),1); tracks.splice(tracks.indexOf(t)+1,0,n);
  reindexTracks();
  setFx(n); syncTrackUI(n); drawWave(n); applyGains(n); startSrc(n);
  updTrackBtns(); lockUI(); updLive(); scheduleSave();
  msg('Piste dupliquée : « '+n.name+' ».');
  return n;
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
    $('.ps',b).textContent=!t.buf?'vide':(t.pend!=null?(t.pend?'coupe bientôt…':'entre bientôt…'):(t.mute?'muet':'● en jeu'));
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
// ======================= MONTAGE DU MORCEAU =======================
// Le morceau est une ligne de temps (en temps) avec, pour chaque piste, des blocs qui jouent la boucle de la piste :
// déplacer, couper, allonger / raccourcir (la boucle se répète), dupliquer, supprimer, changer le ton d'un bloc.
let song={end:0,clips:[],fx:[],known:[],cur:0,sel:-1,ms:[],multi:false,zoom:22,view:0,grid:1,rs:null,re:null};
let songPlay=null;
const songCache=new Map();
const SG_RH=28, SG_LH=56;
function songTracks(){ return tracks.filter(t=>t.buf); }
function songLanes(){ return tracks.slice(); }
function trackByUid(u){ return tracks.find(t=>t.uid===u); }
function songResetData(){ song.ms=[]; song.end=0; song.clips=[]; song.known=[]; song.cur=0; song.sel=-1; song.view=0; song.rs=null; song.re=null; song.fx=[]; songCache.clear(); }
function songSnapData(){ return {end:song.end,clips:song.clips.map(c=>({...c})),fx:song.fx.map(f=>({...f})),known:song.known.slice()}; }
function songApplyData(d){ song.end=d&&d.end>0?d.end:0; song.clips=d&&Array.isArray(d.clips)?d.clips.filter(c=>c&&c.u&&c.len>0).map(c=>({u:c.u,s:Math.max(0,+c.s||0),len:+c.len,off:+c.off||0,tp:clamp(Math.round(+c.tp||0),-12,12),ti:TIN[c.ti]?c.ti:'none',til:+c.til||0,to:TOUT[c.to]?c.to:'none',tol:+c.tol||0,...(c.g?{g:String(c.g)}:{})})):[]; song.ms=[]; song.fx=d&&Array.isArray(d.fx)?d.fx.filter(f=>f&&FXS[f.k]&&f.len>0).map(f=>({k:f.k,s:Math.max(0,+f.s||0),len:+f.len})):[]; song.known=d&&Array.isArray(d.known)?d.known.slice():song.clips.map(c=>c.u); if(song.sel>=song.clips.length) song.sel=-1; }
// première ouverture : chaque piste avec du son joue sur 4 tours de boucle ; les nouvelles pistes sont ajoutées sur toute la durée
function songPrepare(){
  if(!loopLen) return;
  if(!(song.end>0)) song.end=Math.max(beats*4,meter*8);
  songTracks().forEach(t=>{ if(!song.known.includes(t.uid)){ song.known.push(t.uid); song.clips.push({u:t.uid,s:0,len:song.end,off:0,tp:0}); } });
  song.clips=song.clips.filter(c=>trackByUid(c.u));
}
// aimant du montage : mesure, temps, ½, ¼ de temps, ou libre (au 1/48 de temps près)
function songGrid(){ return song.grid==='M'?meter:(+song.grid||0); }
function songSnap(b){ const g=songGrid(); return g>0?Math.round(b/g)*g:Math.round(b*48)/48; }
function songStep(){ const g=songGrid(); return g>0?g:1/16; }
const fmtBeats=x=>{ if(Math.abs(x-meter)<1e-9) return '1 mesure'; const r={1:'1 temps',0.5:'½ temps',0.25:'¼ temps',0.0625:'1/16 de temps'}[x]; return r||String(Math.round(x*100)/100).replace('.',',')+' temps'; };
function songNudge(k){
  const set=songSelSet(); if(!set.length){ msg('Touche d\'abord un bloc.'); return; }
  const dd=(k[0]==='-'?-1:1)*(k.slice(-1)==='M'?meter:songStep()), mn=Math.min(...set.map(c=>c.s));
  if(mn+dd<-1e-9){ msg('Le bloc est déjà au début du morceau.'); return; }
  songAct(()=>{ set.forEach(c=>{ c.s=Math.max(0,Math.round((c.s+dd)*4800)/4800); }); const e=Math.max(...set.map(c=>c.s+c.len)); if(e>song.end) song.end=Math.ceil(e/meter)*meter; });
}
function fmtSongTime(b){ const sec=b*beatDur(), m=Math.floor(sec/60); return m+':'+String(Math.floor(sec-m*60)).padStart(2,'0'); }
// son d'un bloc : la boucle de la piste, éventuellement transposée (basse / mélodie : recalculées note à note ; autres : décalage de hauteur)
function clipBuf(t,tp){
  const base=playBuf(t); if(!tp) return base;
  let e=songCache.get(t.uid); if(!e||e.src!==base){ e={src:base,m:new Map()}; songCache.set(t.uid,e); }
  if(e.m.has(tp)) return e.m.get(tp);
  let data;
  if(isGen(t)&&t.bass){ const o=JSON.parse(JSON.stringify(t.bass)), sg=normSegs(o.segs,beats), rt=segRoots(sg,t.kind); o.segs=sg.map((x,i)=>rt[i]==null?x:{...x,m:rt[i]+tp,n:mod(rt[i]+tp,12)}); data=renderBass(o,base.length,beats).data; }
  else data=pitchShiftSync(base.getChannelData(0),tp,base.sampleRate);
  const fit=new Float32Array(base.length); fit.set(data.subarray?data.subarray(0,base.length):data.slice(0,base.length));
  const nb=ctx.createBuffer(1,base.length,base.sampleRate); nb.copyToChannel(fit,0); e.m.set(tp,nb); return nb;
}
function songPos(){ return songPlay?songPlay.from+(ctx.currentTime-songPlay.T0)/beatDur():song.cur; }
function songStop(keepCur){
  if(!songPlay) return;
  if(!keepCur) song.cur=clamp(songPos(),0,song.end);
  clearTimeout(songPlay.timer);
  songPlay.nodes.forEach(n=>{ try{ n.stop&&n.stop(); }catch(e){} try{ n.disconnect(); }catch(e){} });
  songPlay=null; updSongUI(); drawSong();
}
const TIN={none:1,fade:1,filter:1,hp:1}, TOUT={none:1,fade:1,filter:1,tape:1,echo:1,stutter:1};
const FXS={riser:'Montée de bruit',swell:'Souffle inversé',impact:'Impact',down:'Descente'};
// joue un bloc (lecture ou export) avec ses transitions d'entrée et de sortie
function schedClip(ac,t,c,from,T0,bd,end,dest,nodes){
  const a=Math.max(c.s,from), z=Math.min(c.s+c.len,end); if(z<=a) return;
  const b=clipBuf(t,c.tp), dur=b.duration;
  const s=ac.createBufferSource(); s.buffer=b; s.loop=true;
  const g=ac.createGain();
  const ti=TIN[c.ti]?c.ti:'none', to=TOUT[c.to]?c.to:'none';
  const inL=ti!=='none'?Math.min(c.til||0,c.len)*bd:0, outL=to!=='none'?Math.min(c.tol||0,c.len)*bd:0;
  const when=T0+(a-from)*bd, until=T0+(z-from)*bd, cs=T0+(c.s-from)*bd, ce=T0+(Math.min(c.s+c.len,end)-from)*bd;
  const offs=mod((c.off+(a-c.s))*bd,dur);
  let f=null;
  if(ti==='filter'||ti==='hp'||to==='filter'){ f=ac.createBiquadFilter(); f.type=ti==='hp'?'highpass':'lowpass'; f.frequency.value=ti==='hp'?20:20000; f.Q.value=0.9; s.connect(f); f.connect(g); } else s.connect(g);
  g.connect(dest); nodes.push(s,g); if(f) nodes.push(f);
  const env=g.gain, os=outL>0?Math.max(when+0.005,ce-outL):until;
  try{
    env.setValueAtTime(0,when);
    if(ti==='fade'&&cs+inL>when){ env.linearRampToValueAtTime(Math.max(0.001,(when-cs)/inL),when+0.004); env.linearRampToValueAtTime(1,cs+inL); }
    else env.linearRampToValueAtTime(1,when+0.004);
    if(f&&ti==='filter'&&cs+inL>when){ const fr=clamp((when-cs)/inL,0,1); f.frequency.setValueAtTime(200*Math.pow(100,fr),when); f.frequency.exponentialRampToValueAtTime(20000,cs+inL); }
    if(f&&ti==='hp'&&cs+inL>when){ const fr=clamp((when-cs)/inL,0,1); f.frequency.setValueAtTime(3000*Math.pow(20/3000,fr),when); f.frequency.exponentialRampToValueAtTime(20,cs+inL); }
    if(outL>0&&os<until){
      if(to==='fade'||to==='tape'||to==='echo'){ env.setValueAtTime(1,os); env.linearRampToValueAtTime(0.0001,until); }
      if(to==='filter'){ if(f.type!=='lowpass'){ f.type='lowpass'; } f.frequency.setValueAtTime(20000,os); f.frequency.exponentialRampToValueAtTime(200,until); }
      if(to==='tape'){ s.playbackRate.setValueAtTime(1,os); s.playbackRate.linearRampToValueAtTime(0.06,until); }
      if(to==='echo'){ const d=ac.createDelay(2), fb=ac.createGain(), wet=ac.createGain(); d.delayTime.value=Math.min(1.9,bd*0.75); fb.gain.value=0.55; wet.gain.value=0;
        g.connect(d); d.connect(fb); fb.connect(d); d.connect(wet); wet.connect(dest);
        wet.gain.setValueAtTime(0,os); wet.gain.linearRampToValueAtTime(0.9,os+0.02); wet.gain.setValueAtTime(0.9,until); wet.gain.linearRampToValueAtTime(0,until+outL);
        nodes.push(d,fb,wet); }
      if(to==='stutter'){ env.setValueAtTime(1,os); env.setValueAtTime(0,os+0.002);
        const p=bd/4, k0=mod(offs+(os-when),dur), n=Math.max(1,Math.floor((until-os)/p+1e-6));
        for(let k=0;k<n;k++){ const r=ac.createBufferSource(); r.buffer=b; const rg=ac.createGain(); r.connect(rg); rg.connect(dest);
          const at=os+k*p, len=Math.min(p*0.85,until-at); if(len<=0.005) break; const lv=1-0.5*k/n;
          rg.gain.setValueAtTime(0,at); rg.gain.linearRampToValueAtTime(lv,at+0.003); rg.gain.setValueAtTime(lv,at+len-0.004); rg.gain.linearRampToValueAtTime(0,at+len);
          r.start(at,k0); try{ r.stop(at+len+0.01); }catch(e){} nodes.push(r,rg); } }
    } else { env.setValueAtTime(1,Math.max(when+0.004,until-0.006)); env.linearRampToValueAtTime(0,until); }
  }catch(e){}
  s.start(when,offs); try{ s.stop((to==='stutter'&&outL>0?os+0.004:until)+0.02); }catch(e){}
}
// sons de transition (montée de bruit, souffle inversé, impact, descente), fabriqués ici
function fxSound(k,sec){
  const n=Math.max(1,Math.round((k==='impact'?Math.max(sec,1.4):sec)*SR)), y=new Float32Array(n);
  let sd=987654321, x1=0,x2=0,y1=0,y2=0,b0=0,b1=0,b2=0,a1=0,a2=0, ph=0;
  const bp=(fc,Q)=>{ const w0=2*Math.PI*Math.min(fc,SR*0.45)/SR, al=Math.sin(w0)/(2*Q), cs=Math.cos(w0), a0=1+al; b0=al/a0; b1=0; b2=-al/a0; a1=-2*cs/a0; a2=(1-al)/a0; };
  for(let i=0;i<n;i++){
    const u=i/n; sd=(sd*16807)%2147483647; const w=sd/2147483647*2-1;
    let v=0;
    if(k==='riser'||k==='down'||k==='swell'){
      if(i%64===0){ if(k==='riser') bp(300*Math.pow(8000/300,u),1.2); else if(k==='down') bp(8000*Math.pow(200/8000,u),1.2); else bp(2500+3500*u,0.6); }
      const o=b0*w+b1*x1+b2*x2-a1*y1-a2*y2; x2=x1; x1=w; y2=y1; y1=o;
      const env=k==='riser'?Math.pow(u,1.6):k==='down'?Math.pow(1-u,1.4):Math.pow(u,3);
      v=o*env*(k==='swell'?1.6:1.2);
      if(k==='swell'&&i>n-Math.round(0.004*SR)) v*=(n-i)/(0.004*SR);
    } else {
      const t=i/SR, f=45+90*Math.exp(-t/0.05); ph+=f/SR; v=Math.sin(2*Math.PI*ph)*Math.exp(-t/0.45)+(t<0.03?w*0.5*(1-t/0.03):0); v=Math.tanh(1.4*v);
    }
    y[i]=v;
  }
  let pk=0; for(let i=0;i<n;i++) pk=Math.max(pk,Math.abs(y[i])); if(pk>0) for(let i=0;i<n;i++) y[i]*=0.7/pk;
  return y;
}
function schedFx(ac,fx,from,T0,bd,end,dest,nodes){
  const st=fx.s, z=Math.min(fx.s+fx.len+(fx.k==='impact'?Math.max(0,1.4/bd-fx.len):0),end+8); if(z<=from) return;
  const d=fxSound(fx.k,fx.len*bd), b=ac.createBuffer(1,d.length,SR); b.copyToChannel(d,0);
  const s=ac.createBufferSource(); s.buffer=b; const g=ac.createGain(); g.gain.value=0.55; s.connect(g); g.connect(dest);
  const when=T0+(Math.max(st,from)-from)*bd, off=Math.max(0,(from-st)*bd);
  if(off>=b.duration) return;
  s.start(when,off); nodes.push(s,g);
}
function songStart(fromBeat){
  if(!loopLen){ msg('Enregistre ou importe d\'abord une boucle.'); return; }
  if(recObj) return;
  songPrepare();
  if(running||paused){ stopTransport(); paused=false; }
  songStop(true); stopPreview(false); try{ stopListen(); }catch(e){}
  try{ ctx.resume(); }catch(e){}
  applyGains();
  const bd=beatDur(), T0=ctx.currentTime+0.1, from=clamp(fromBeat>=song.end?0:fromBeat,0,song.end), nodes=[];
  song.clips.forEach(c=>{ const t=trackByUid(c.u); if(!t||!t.buf) return; schedClip(ctx,t,c,from,T0,bd,song.end,t.inp,nodes); });
  song.fx.forEach(fx=>schedFx(ctx,fx,from,T0,bd,song.end,chain.inp,nodes));
  songPlay={T0,from,nodes,timer:setTimeout(()=>{ songStop(true); song.cur=0; drawSong(); updSongUI(); },((song.end-from)*bd+0.3)*1000)};
  updSongUI(); drawSong();
}
function songRestartIfPlaying(){ if(songPlay){ const p=songPos(); songStart(p); } }
// --- dessin ---
function songPeaks(t){
  const b=playBuf(t); if(t.sgPk&&t.sgPk.src===b) return t.sgPk.pk;
  const d=b.getChannelData(0), N=256, pk=new Float32Array(N), st=d.length/N; let mx=1e-4;
  for(let i=0;i<N;i++){ let m=0; for(let j=Math.floor(i*st);j<Math.floor((i+1)*st);j+=8){ const v=Math.abs(d[j]); if(v>m) m=v; } pk[i]=m; if(m>mx) mx=m; }
  for(let i=0;i<N;i++) pk[i]/=mx;
  t.sgPk={src:b,pk}; return pk;
}
function drawSong(){
  const box=$('#mont'); if(!box||box.hidden) return;
  if(loopLen) songPrepare();
  const cv=$('#mcv'), lanes=songLanes(), H=SG_RH+Math.max(1,lanes.length)*SG_LH+6;
  cv.style.height=H+'px';
  const dpr=window.devicePixelRatio||1, w=Math.floor(cv.clientWidth*dpr), h=Math.floor(H*dpr);
  updSongUI();
  if(!w||!h) return;
  cv.width=w; cv.height=h;
  const g=cv.getContext('2d'); g.clearRect(0,0,w,h);
  const ppb=song.zoom*dpr, X=b=>(b-song.view)*ppb, RH=SG_RH*dpr, LH=SG_LH*dpr;
  g.fillStyle='rgba(255,255,255,.07)'; g.fillRect(0,0,w,RH);
  song.fx.forEach(f=>{ g.fillStyle='rgba(185,120,255,.75)'; g.fillRect(X(f.s),RH*0.62,Math.max(3*dpr,X(f.s+f.len)-X(f.s)),RH*0.3); });
  if(song.rs!=null){ const a=X(song.rs), b=song.re!=null?X(song.re):a+2*dpr; g.fillStyle='rgba(255,138,0,.13)'; g.fillRect(a,0,b-a,h); g.fillStyle='rgba(255,138,0,.55)'; g.fillRect(a,0,b-a,RH*0.25); g.fillRect(a-1*dpr,0,2*dpr,h); if(song.re!=null) g.fillRect(b-1*dpr,0,2*dpr,h); }
  g.font=Math.round(RH*0.5)+"px 'Barlow Condensed','Arial Narrow',sans-serif"; g.textBaseline='middle'; g.textAlign='left';
  const every=ppb*meter<34*dpr?(ppb*meter*2<34*dpr?4:2):1;
  const b0=Math.max(0,Math.floor(song.view/meter)*meter), b1=song.view+w/ppb;
  for(let b=b0;b<=b1;b++){
    const x=X(b);
    if(b%meter===0){ g.fillStyle='rgba(255,255,255,.35)'; g.fillRect(x,0,1,h); const bar=b/meter; if(bar%every===0){ g.fillStyle='rgba(255,255,255,.85)'; g.fillText(String(bar+1),x+3,RH/2); } }
    else if(ppb>8*dpr){ g.fillStyle='rgba(255,255,255,.1)'; g.fillRect(x,RH*0.6,1,h-RH*0.6); }
  }
  lanes.forEach((t,i)=>{
    const y0=RH+i*LH;
    g.fillStyle=i%2?'rgba(255,255,255,.025)':'rgba(255,255,255,.05)'; g.fillRect(0,y0,w,LH);
    if(!t.buf){ g.fillStyle='rgba(255,255,255,.45)'; g.font=Math.round(14*dpr)+"px 'Barlow Condensed','Arial Narrow',sans-serif"; g.textBaseline='middle'; g.textAlign='left'; g.fillText('« '+t.name+' » : piste vide (rien d\'enregistré ni importé)',10*dpr,y0+LH/2); return; }
    if(!song.clips.some(c=>c.u===t.uid)){ g.fillStyle='rgba(255,255,255,.45)'; g.font=Math.round(14*dpr)+"px 'Barlow Condensed','Arial Narrow',sans-serif"; g.textBaseline='middle'; g.textAlign='left'; g.fillText('« '+t.name+' » : aucun bloc — touche cette ligne pour en ajouter un',10*dpr,y0+LH/2); }
    const pk=songPeaks(t);
    song.clips.forEach((c,k)=>{
      if(c.u!==t.uid) return;
      const x0=X(c.s), x1=X(c.s+c.len); if(x1<0||x0>w) return;
      g.save(); g.beginPath(); g.rect(x0+1,y0+3*dpr,Math.max(1,x1-x0-2),LH-6*dpr); g.clip();
      const inS=k===song.sel||(song.ms||[]).includes(c);
      g.fillStyle=t.color; g.globalAlpha=inS?0.55:0.32; g.fillRect(x0,y0,x1-x0,LH); g.globalAlpha=1;
      g.fillStyle='rgba(255,255,255,.75)'; const mid=y0+LH/2, amp=(LH-14*dpr)/2;
      for(let x=Math.max(0,Math.floor(x0));x<Math.min(w,x1);x+=2){ const bb=c.off+(song.view+x/ppb-c.s), lp=mod(bb,beats)/beats, v=pk[Math.min(pk.length-1,Math.floor(lp*pk.length))]*amp; g.fillRect(x,mid-v,1.5,Math.max(1,2*v)); }
      g.fillStyle='rgba(0,0,0,.45)'; for(let r=1;;r++){ const bb=c.s+(r*beats-mod(c.off,beats)); if(bb>=c.s+c.len) break; g.fillRect(X(bb),y0,1.5*dpr,LH); }
      g.restore();
      g.strokeStyle=(song.ms||[]).includes(c)&&song.ms.length>1?'#FF8A00':k===song.sel?'#fff':t.color; g.lineWidth=(inS?2.5:1.5)*dpr;
      if(c.g){ g.fillStyle='#fff'; g.fillRect(x0+4*dpr,y0+LH-7*dpr,Math.max(2,x1-x0-8*dpr),2.5*dpr); } g.strokeRect(x0+1,y0+3*dpr,Math.max(1,x1-x0-2),LH-6*dpr);
      g.fillStyle='#fff'; g.font=Math.round(13*dpr)+"px 'Barlow Condensed','Arial Narrow',sans-serif"; g.textBaseline='top';
      if(x1-x0>40*dpr) g.fillText(t.name+(c.tp?' ('+(c.tp>0?'+':'')+c.tp+')':''),Math.max(x0,0)+5*dpr,y0+5*dpr);
      if(k===song.sel){ g.fillStyle='#fff'; g.fillRect(x1-6*dpr,y0+LH*0.3,3*dpr,LH*0.4); g.fillRect(x0+3*dpr,y0+LH*0.3,3*dpr,LH*0.4); }
    });
  });
  if(!lanes.length){ g.fillStyle='rgba(255,255,255,.6)'; g.textBaseline='middle'; g.fillText('Enregistre d\'abord des pistes : elles apparaîtront ici.',10*dpr,RH+LH/2); }
  const xe=X(song.end); g.fillStyle='rgba(0,0,0,.45)'; if(xe<w) g.fillRect(Math.max(0,xe),RH,w-Math.max(0,xe),h-RH);
  g.fillStyle='#ff3b5c'; g.fillRect(xe-1.5*dpr,0,3*dpr,h);
  const xp=X(songPos()); g.fillStyle='#FF8A00'; g.fillRect(xp-1.5*dpr,0,3*dpr,h);
}
function updSongUI(){
  const box=$('#mont'); if(!box||box.hidden) return;
  const c=song.clips[song.sel], t=c&&trackByUid(c.u);
  $('#montinfo').textContent=song.end?(Math.round(song.end/meter)+' mesures · '+fmtSongTime(song.end)):'';
  $('#mendv').textContent=song.end?'mesure '+Math.round(song.end/meter)+' ('+fmtSongTime(song.end)+')':'';
  const fb=x=>String(Math.round(x/meter*100)/100+1).replace('.',',');
  { const ss=songSelSet(); const gb=$('#mgrp'); if(gb) gb.disabled=ss.length<2; const ub=$('#mungrp'); if(ub) ub.disabled=!ss.some(x=>x.g); const mm=$('#mmulti'); if(mm) mm.checked=!!song.multi; const dn=$('#mdup'); if(dn) dn.textContent=ss.length>1?'⧉ Dupliquer les '+ss.length+' blocs':'⧉ Dupliquer'; }
  $('#mclipinfo').textContent=songSelSet().length>1?(songSelSet().length+' blocs choisis'+(songSelSet().every(x=>x.g&&x.g===songSelSet()[0].g)?' (groupe)':'')):c&&t?('« '+t.name+' » · mesures '+fb(c.s)+' → '+fb(c.s+c.len)+(c.tp?' · ton '+(c.tp>0?'+':'')+c.tp:'')+' · début : mesure '+(Math.floor(c.s/meter+1e-9)+1)+', temps '+String(Math.round((c.s-Math.floor(c.s/meter+1e-9)*meter+1)*100)/100).replace('.',',')):'Touche un bloc pour le choisir.';
  document.querySelectorAll('.mstep').forEach(e=>e.textContent=fmtBeats(songStep())); document.querySelectorAll('.mnudge').forEach(b=>b.disabled=!songSelSet().length);
  ['#mcut','#mdup','#mdel','#mtpm','#mtpp'].forEach(id=>{ const b=$(id); if(b) b.disabled=!c; });
  const p=songPos(); if($('#mcut')) $('#mcut').disabled=!(c&&p>c.s+1e-6&&p<c.s+c.len-1e-6);
  $('#mplay').textContent=songPlay?'❚❚ Pause':'▶ Lire le morceau';
  $('#mcurv').textContent='curseur : mesure '+fb(Math.max(0,p))+' · '+fmtSongTime(Math.max(0,p));
  updSecUI(); updFxList();
  { const e=$('#mlanehint'); if(e){ const l=[]; tracks.forEach(t=>{ if(!t.buf) l.push('« '+t.name+' » est vide (rien d\'enregistré ni importé).'); else if(!song.clips.some(c=>c.u===t.uid)) l.push('« '+t.name+' » n\'a aucun bloc : touche sa ligne pour en ajouter un.'); }); e.textContent=l.join(' '); e.hidden=!l.length; } }
  { const on=!!c; ['#mtin','#mtinl','#mtout','#mtoutl'].forEach(id=>{ const e=$(id); if(e) e.disabled=!on; });
    if(c){ $('#mtin').value=c.ti||'none'; $('#mtout').value=c.to||'none'; if(c.til) $('#mtinl').value=String(c.til); if(c.tol) $('#mtoutl').value=String(c.tol); } }
}
// --- gestes ---
(function(){
  const cv=$('#mcv'); if(!cv) return;
  let drag=null;
  const at=ev=>{ const r=cv.getBoundingClientRect(); return {x:ev.clientX-r.left,y:ev.clientY-(r.top||0)}; };
  cv.addEventListener('pointerdown',ev=>{
    if(!loopLen) return;
    songPrepare();
    const p=at(ev), b=song.view+p.x/song.zoom, lanes=songLanes();
    try{ cv.setPointerCapture(ev.pointerId); }catch(e){}
    if(p.y<SG_RH){ drag={k:'cur'}; song.cur=clamp(Math.round(b),0,song.end); if(songPlay) songStart(song.cur); drawSong(); return; }
    const li=Math.floor((p.y-SG_RH)/SG_LH), t=lanes[li];
    if(t&&!t.buf){ msg('« '+t.name+' » est vide : enregistre ou importe un son sur cette piste pour l\'utiliser dans le montage.'); }
    if(!t||!t.buf){ drag={k:'pan',x0:p.x,v0:song.view,moved:false}; return; }
    let idx=-1; for(let k=song.clips.length-1;k>=0;k--){ const c=song.clips[k]; if(c.u===t.uid&&b>=c.s&&b<=c.s+c.len){ idx=k; break; } }
    if(idx>=0){
      const c=song.clips[idx], ex=Math.abs(p.x-(c.s+c.len-song.view)*song.zoom), sx=Math.abs(p.x-(c.s-song.view)*song.zoom), wpx=c.len*song.zoom;
      const edge=Math.min(16,wpx/3);
      drag={k:ex<=edge?'right':sx<=edge?'left':'move',i:idx,b0:b,s0:c.s,len0:c.len,off0:c.off,x0:p.x,moved:false,hist:false};
      // mode « plusieurs blocs » : un simple toucher ajoute/retire le bloc (au relâcher) ; glisser déplace toute la sélection
      if(song.multi&&drag.k==='move'){ drag.pick=idx; const cur=songSelSet(); drag.grp=(cur.includes(c)?cur:songGroupOf(c)).map(x=>({c:x,s0:x.s})); }
      else { if(drag.k!=='move'||!(c.g&&songSelSet().includes(c))||song.multi) songPickClip(idx); else song.sel=idx;
        drag.grp=drag.k==='move'?songSelSet().map(x=>({c:x,s0:x.s})):null; }
    } else { drag={k:'empty',x0:p.x,b0:b,v0:song.view,t,moved:false}; }
    drawSong();
  });
  cv.addEventListener('pointermove',ev=>{
    if(!drag) return;
    const p=at(ev), b=song.view+p.x/song.zoom;
    if(drag.k==='cur'){ song.cur=clamp(Math.round(b),0,song.end); drawSong(); return; }
    if(!drag.moved&&Math.abs(p.x-(drag.x0||0))<7) return;
    drag.moved=true;
    if(drag.k==='pan'||drag.k==='empty'){ song.view=Math.max(0,drag.v0-(p.x-drag.x0)/song.zoom); drawSong(); return; }
    const c=song.clips[drag.i]; if(!c) return;
    if(!drag.hist){ pushHist(); drag.hist=true; }
    const mn=Math.max(0.25,songGrid()), d=b-drag.b0;
    if(drag.k==='move'){ if(drag.grp&&drag.grp.length>1){ const mn0=Math.min(...drag.grp.map(o=>o.s0)), dd=Math.max(-mn0,songSnap(drag.s0+d)-drag.s0); drag.grp.forEach(o=>{ o.c.s=o.s0+dd; }); } else c.s=Math.max(0,songSnap(drag.s0+d)); }
    else if(drag.k==='right') c.len=Math.max(mn,songSnap(drag.s0+drag.len0+d)-c.s);
    else { const ns=clamp(songSnap(drag.s0+d),0,drag.s0+drag.len0-mn), dd=ns-drag.s0; c.s=ns; c.len=drag.len0-dd; c.off=mod(drag.off0+dd,beats); }
    drawSong();
  });
  const end=()=>{
    if(!drag) return; const d=drag; drag=null;
    if(d.pick!=null&&!d.moved){ songPickClip(d.pick); drawSong(); return; }
    if(d.pick!=null&&d.moved&&d.grp&&d.grp.length>1){ song.ms=d.grp.map(o=>o.c); song.sel=d.pick; }
    if(d.k==='empty'&&!d.moved){ pushHist(); song.ms=[]; const s=Math.max(0,Math.floor(d.b0/meter)*meter); song.clips.push({u:d.t.uid,s,len:beats,off:0,tp:0}); song.sel=song.clips.length-1; if(s+beats>song.end) song.end=s+beats; msg('Bloc ajouté sur « '+d.t.name+' » (un tour de boucle). Fais glisser son bord pour l\'allonger.'); }
    if(d.k==='pan'||(d.k==='empty'&&d.moved)) return;
    scheduleSave(true); songRestartIfPlaying(); drawSong();
  };
  cv.addEventListener('pointerup',end); cv.addEventListener('pointercancel',end);
})();
function songSelClip(){ return song.clips[song.sel]; }
// blocs choisis ensemble (sélection multiple ou groupe) ; sinon le bloc choisi seul
function songSelSet(){ const ms=(song.ms||[]).filter(c=>song.clips.includes(c)); if(ms.length) return ms; const c=songSelClip(); return c?[c]:[]; }
function songGroupOf(c){ return c&&c.g?song.clips.filter(x=>x.g===c.g):[c]; }
function songPickClip(idx){
  const c=song.clips[idx], grp=songGroupOf(c);
  if(song.multi){
    let ms=(song.ms||[]).filter(x=>song.clips.includes(x));
    if(!ms.length){ const p=songSelClip(); if(p) ms=songGroupOf(p).slice(); }
    if(ms.includes(c)) ms=ms.filter(x=>!grp.includes(x)); else grp.forEach(x=>{ if(!ms.includes(x)) ms.push(x); });
    song.ms=ms; song.sel=ms.includes(c)?idx:(ms.length?song.clips.indexOf(ms[0]):-1);
  } else { song.sel=idx; song.ms=c&&c.g?grp:[]; }
}
function songGroup(on){
  const set=songSelSet();
  if(on){ if(set.length<2){ msg('Choisis d\'abord plusieurs blocs : coche « choisir plusieurs blocs », puis touche chaque bloc du motif.'); return; }
    songAct(()=>{ const g=newGid(); set.forEach(c=>c.g=g); song.ms=set.slice(); msg(set.length+' blocs groupés : toucher l\'un d\'eux choisit tout le groupe, et ils se déplacent ensemble.'); }); }
  else { if(!set.some(c=>c.g)){ msg('Ces blocs ne sont pas groupés.'); return; } songAct(()=>{ set.forEach(c=>{ delete c.g; }); song.ms=[]; msg('Blocs dissociés : chacun se choisit et se déplace seul.'); }); }
}
// duplique les blocs choisis juste après eux (n fois) ; sur leurs lignes, ce qui s'y trouvait est remplacé
function songDupSel(n){
  const set=songSelSet(); if(!set.length) return;
  const S=Math.min(...set.map(c=>c.s)), E=Math.max(...set.map(c=>c.s+c.len)), L=E-S, lanes=[...new Set(set.map(c=>c.u))];
  n=Math.max(1,+n||1);
  songAct(()=>{
    const A=E, B=E+n*L, out=[];
    song.clips.forEach(c=>{ if(set.includes(c)||!lanes.includes(c.u)){ out.push(c); return; } const p1=clipPart(c,-1e9,A), p2=clipPart(c,B,1e9); if(p1) out.push(p1); if(p2) out.push(p2); });
    let lastSet=[];
    for(let k=1;k<=n;k++){ const map={}; lastSet=set.map(c=>{ const x={...c,s:c.s+k*L}; if(c.g) x.g=map[c.g]||(map[c.g]=newGid()); out.push(x); return x; }); }
    song.clips=out; if(B>song.end) song.end=B;
    song.ms=set.length>1?lastSet:[]; song.sel=song.clips.indexOf(lastSet[0]);
    const fb=x=>String(Math.round(x/meter*100)/100+1).replace('.',',');
    msg((set.length>1?set.length+' blocs dupliqués':'Bloc dupliqué')+' '+n+' fois juste après (mesures '+fb(A)+' → '+fb(B)+'). Ce qui se trouvait là sur '+(lanes.length>1?'ces lignes':'cette ligne')+' a été remplacé.');
  });
}
// morceaux de blocs : la partie d'un bloc comprise entre a et b (le son continue au bon endroit de la boucle)
function clipPart(c,a,b){ const s0=Math.max(c.s,a), e0=Math.min(c.s+c.len,b); if(e0-s0<1e-6) return null; const p={...c,s:s0,len:e0-s0,off:mod(c.off+(s0-c.s),beats)}; if(s0>c.s+1e-6){ p.ti='none'; p.til=0; } if(e0<c.s+c.len-1e-6){ p.to='none'; p.tol=0; } return p; }
function songSecOk(){ return song.rs!=null&&song.re!=null&&song.re-song.rs>1e-6; }
function updSecUI(){
  const e=$('#msecv'); if(!e) return;
  { const m=$('#msecmute'); if(m) m.disabled=!songSecOk(); }
  const fb=x=>String(Math.round(x/meter*100)/100+1).replace('.',',');
  e.textContent=songSecOk()?'mesures '+fb(song.rs)+' → '+fb(song.re):(song.rs!=null?'début : mesure '+fb(song.rs)+', place la fin':'place le curseur, puis début et fin');
  ['#msecdup','#msecdel'].forEach(id=>{ const b=$(id); if(b) b.disabled=!songSecOk(); });
  const v=$('#mvar'); if(v) v.disabled=!songSelClip()||tracks.length>=MAXTRACKS;
}
// dupliquer une partie sur toutes les pistes : la copie s'insère juste après, la suite du morceau est décalée
function songSecDup(){
  if(!songSecOk()) return;
  const a=song.rs, b=song.re, L=b-a;
  songAct(()=>{
    const out=[];
    song.clips.forEach(c=>{ const p1=clipPart(c,-1e9,b), p2=clipPart(c,b,1e9), mid=clipPart(c,a,b);
      if(p1) out.push(p1); if(p2) out.push({...p2,s:p2.s+L}); if(mid) out.push({...mid,s:mid.s+L,_cp:1}); });
    { const map={}; out.forEach(c=>{ if(c._cp){ delete c._cp; if(c.g) c.g=map[c.g]||(map[c.g]=newGid()); } }); }
    song.clips=out; song.end+=L; song.sel=-1; song.rs=b; song.re=b+L;
    msg('Partie dupliquée sur toutes les pistes : la copie (mesures '+String(Math.round(b/meter*100)/100+1).replace('.',',')+' → '+String(Math.round((b+L)/meter*100)/100+1).replace('.',',')+') est sélectionnée, la suite du morceau a été décalée. Crée une variation d\'un de ses blocs pour la faire évoluer.');
  });
}
function songSecDel(){
  if(!songSecOk()) return;
  const a=song.rs, b=song.re, L=b-a;
  songAct(()=>{
    const out=[];
    song.clips.forEach(c=>{ const p1=clipPart(c,-1e9,a), p2=clipPart(c,b,1e9); if(p1) out.push(p1); if(p2) out.push({...p2,s:p2.s-L}); });
    song.clips=out; song.end=Math.max(meter,song.end-L); song.sel=-1; song.re=null; song.cur=Math.min(song.cur,song.end);
    msg('Partie supprimée sur toutes les pistes, la suite du morceau a été rapprochée.');
  });
}
// variation : le bloc choisi joue une copie de sa piste, qu'on peut modifier sans toucher au reste du morceau
function songMakeVar(){
  const c=songSelClip(); if(!c||recObj) return;
  const t=trackByUid(c.u); if(!t) return;
  if(tracks.length>=MAXTRACKS){ msg('Nombre maximum de pistes atteint ('+MAXTRACKS+').'); return; }
  const n=duplicateTrack(t);
  if(!n) return;
  if(!song.known.includes(n.uid)) song.known.push(n.uid);
  const base=t.name.replace(/ \(variation( \d+)?\)$/,'').replace(/ copie( \d+)?$/,'');
  n.name=uniqueTrackName(base.slice(0,12)+' (variation)',n); $('.tn',n.el).textContent=n.name; $('.tnin',n.el).value=n.name; updLive();
  c.u=n.uid; song.clips=song.clips.filter(x=>x===c||x.u!==n.uid);
  songCache.delete(n.uid); scheduleSave(true); songRestartIfPlaying(); drawSong();
  const left=song.clips.some(x=>x.u===t.uid);
  msg('Variation créée : « '+n.name+' » ne joue que ce bloc. Modifie ses notes, ses effets ou son son dans sa piste (sous « '+t.name+' »).'+(left?' Le reste du morceau garde « '+t.name+' ».':' Ce bloc était le seul de « '+t.name+' » : il joue maintenant la variation partout. Pour ne varier qu\'une partie, ↶ puis coupe d\'abord le bloc au curseur ().')+' ↶ pour annuler.');
}
function songBlank(){
  const p=songSnap(songPos()), L=+$('#mblankl').value;
  if(!(p>=0&&p<=song.end)) return;
  songAct(()=>{
    const out=[]; song.clips.forEach(c=>{ const p1=clipPart(c,-1e9,p), p2=clipPart(c,p,1e9); if(p1) out.push(p1); if(p2) out.push({...p2,s:p2.s+L}); });
    song.clips=out; song.fx.forEach(f=>{ if(f.s>=p) f.s+=L; }); song.end+=L; song.sel=-1;
    msg('Blanc de '+(L%meter===0?(L/meter)+' mesure'+(L/meter>1?'s':''):L+' temps')+' inséré au curseur : la suite du morceau a reculé.');
  });
}
function songSecMute(){
  if(!songSecOk()) return;
  const a=song.rs, b=song.re;
  songAct(()=>{
    const out=[]; song.clips.forEach(c=>{ const p1=clipPart(c,-1e9,a), p2=clipPart(c,b,1e9); if(p1) out.push(p1); if(p2) out.push(p2); });
    song.clips=out; song.sel=-1;
    msg('Partie rendue muette sur toutes les pistes (un blanc), sans rien décaler.');
  });
}
function songSetTrans(){
  const c=songSelClip(); if(!c) return;
  songAct(()=>{ c.ti=$('#mtin').value; c.til=c.ti==='none'?0:+$('#mtinl').value; c.to=$('#mtout').value; c.tol=c.to==='none'?0:+$('#mtoutl').value; });
}
function songAddFx(){
  if(!loopLen) return;
  const k=$('#mfxk').value, L=+$('#mfxl').value, p=songSnap(songPos());
  const s0=(k==='riser'||k==='swell')?Math.max(0,p-L):p;
  songAct(()=>{ song.fx.push({k,s:s0,len:L}); if(s0+L>song.end&&k!=='riser'&&k!=='swell') song.end=s0+L; msg(FXS[k]+' ajouté'+(k==='riser'||k==='swell'?' : il se termine au curseur.':' au curseur.')); });
}
function updFxList(){
  const box=$('#mfxlist'); if(!box) return;
  const fb=x=>String(Math.round(x/meter*100)/100+1).replace('.',',');
  box.innerHTML='';
  song.fx.slice().map((f,i)=>({f,i})).sort((a,b)=>a.f.s-b.f.s).forEach(({f,i})=>{
    const r=document.createElement('div'); r.className='row wrap';
    const l=document.createElement('span'); l.className='lbl'; l.innerHTML=ic('sparkle')+' '; l.append(FXS[f.k]+' · mesures '+fb(f.s)+' → '+fb(f.s+f.len)); r.appendChild(l);
    const d=document.createElement('button'); d.innerHTML=ic('trash'); d.setAttribute('aria-label','Retirer ce son de transition'); d.onclick=()=>songAct(()=>{ song.fx.splice(i,1); });
    d.style.marginLeft='auto'; r.appendChild(d); box.appendChild(r);
  });
}
function songAct(fn){ if(!loopLen||recObj) return; pushHist(); fn(); scheduleSave(true); songRestartIfPlaying(); drawSong(); }
// ----- 4 onglets de l'appli : Pistes · Morceau · Mix & export · Réglages
let curView='pistes', viewBusy=false;
function setView(v,fromMont){
  if(!document.querySelector('.view[data-view="'+v+'"]')) v='pistes';
  const was=curView; curView=v;
  document.querySelectorAll('.view').forEach(e=>e.hidden=e.dataset.view!==v);
  document.querySelectorAll('#vtabs button').forEach(b=>b.classList.toggle('on',b.dataset.v===v));
  try{ localStorage.setItem('lbx-view',v); }catch(e){}
  if(v==='mix'&&typeof updSongSrc==='function') updSongSrc();
  if(!fromMont&&!viewBusy){ viewBusy=true; try{ const open=!$('#mont').hidden; if(v==='morceau'&&!open) $('#montbtn').click(); else if(v!=='morceau'&&was==='morceau'&&open) $('#montbtn').click(); } finally{ viewBusy=false; } }
  if(v==='pistes'){ tracks.forEach(t=>{ try{ drawWave(t); if(!$('.tbody',t.el).hidden){ if(t.tab==='cut') drawTsel(t); if(t.tab==='bass'){ drawBassTimeline(t); drawBassViz(t); } } }catch(e){} }); }
  if(v==='morceau'){ $('#montempty').hidden=!!loopLen; if(!loopLen) $('#montempty').textContent='Le montage s\'utilise une fois ta boucle créée : enregistre d\'abord une piste dans l\'onglet Pistes.'; }
}
document.querySelectorAll('#vtabs button').forEach(b=>b.onclick=()=>{ setView(b.dataset.v); try{ window.scrollTo({top:0}); }catch(e){} });
$('#montbtn').onclick=()=>{
  const m=$('#mont'); m.hidden=!m.hidden; $('#montbtn').classList.toggle('on',!m.hidden); $('#montbtn').setAttribute('aria-expanded',String(!m.hidden));
  if(!m.hidden){ if(!viewBusy&&curView!=='morceau'){ viewBusy=true; setView('morceau',true); viewBusy=false; } songPrepare(); drawSong(); if(!loopLen) msg('Le montage s\'utilise une fois la boucle créée.'); }
  else if(!viewBusy&&curView==='morceau'){ viewBusy=true; setView('pistes',true); viewBusy=false; }
  else songStop();
};
$('#msecs').onclick=()=>{ song.rs=Math.max(0,songSnap(songPos())); if(song.re!=null&&song.re<=song.rs) song.re=null; drawSong(); };
$('#msece').onclick=()=>{ const p=songSnap(songPos()); if(song.rs==null||p<=song.rs){ msg('Place d\'abord le début de la partie, puis le curseur plus loin pour la fin.'); return; } song.re=Math.min(p,song.end); drawSong(); };
$('#msecdup').onclick=songSecDup;
$('#msecmute').onclick=songSecMute;
$('#mblank').onclick=songBlank;
$('#mfxadd').onclick=songAddFx;
['#mtin','#mtinl','#mtout','#mtoutl'].forEach(id=>{ $(id).onchange=songSetTrans; });
$('#msecdel').onclick=songSecDel;
$('#mvar').onclick=songMakeVar;
$('#mplay').onclick=()=>{ if(songPlay) songStop(); else songStart(song.cur); };
$('#mstop').onclick=()=>{ songStop(true); song.cur=0; drawSong(); };
$('#mzoomin').onclick=()=>{ song.zoom=Math.min(120,song.zoom*1.5); drawSong(); };
$('#mzoomout').onclick=()=>{ song.zoom=Math.max(3,song.zoom/1.5); drawSong(); };
$('#mgrid').onchange=e=>{ song.grid=e.target.value==='M'?'M':+e.target.value; updSongUI(); };
document.querySelectorAll('.mnudge').forEach(b=>b.onclick=()=>songNudge(b.dataset.d));
$('#mcut').onclick=()=>{ const c=songSelClip(), p=Math.round(songPos()); if(!c||!(p>c.s&&p<c.s+c.len)){ msg('Place le curseur (touche la règle) à l\'intérieur du bloc choisi.'); return; } songAct(()=>{ const n={...c,s:p,len:c.s+c.len-p,off:mod(c.off+(p-c.s),beats),ti:'none',til:0}; c.len=p-c.s; c.to='none'; c.tol=0; song.clips.push(n); song.sel=song.clips.length-1; msg('Bloc coupé à la mesure '+String(Math.round(p/meter*100)/100+1).replace('.',',')+'.'); }); };
$('#mdup').onclick=()=>songDupSel($('#mdupn')?$('#mdupn').value:1);
$('#mgrp').onclick=()=>songGroup(true);
$('#mungrp').onclick=()=>songGroup(false);
$('#mmulti').onchange=e=>{ song.multi=e.target.checked; if(song.multi){ const c=songSelClip(); if(c&&!(song.ms||[]).length) song.ms=songGroupOf(c); msg('Touche chaque bloc à ajouter (ou à retirer) : ils deviennent orange. Puis Grouper ou ⧉ Dupliquer.'); } drawSong(); };
$('#mdel').onclick=()=>{ const set=songSelSet(); if(!set.length) return; songAct(()=>{ song.clips=song.clips.filter(x=>!set.includes(x)); song.sel=-1; song.ms=[]; msg(set.length>1?set.length+' blocs supprimés.':'Bloc supprimé.'); }); };
$('#mtpm').onclick=()=>{ const c=songSelClip(); if(!c) return; if(c.tp<=-12) return; msg('Calcul…'); setTimeout(()=>songAct(()=>{ c.tp--; msg('Ton du bloc : '+(c.tp>0?'+':'')+c.tp+' demi-ton'+(Math.abs(c.tp)>1?'s':'')+'.'); }),20); };
$('#mtpp').onclick=()=>{ const c=songSelClip(); if(!c) return; if(c.tp>=12) return; msg('Calcul…'); setTimeout(()=>songAct(()=>{ c.tp++; msg('Ton du bloc : '+(c.tp>0?'+':'')+c.tp+' demi-ton'+(Math.abs(c.tp)>1?'s':'')+'.'); }),20); };
$('#mendm').onclick=()=>songAct(()=>{ song.end=Math.max(meter,song.end-meter); if(song.cur>song.end) song.cur=song.end; });
$('#mendp').onclick=()=>songAct(()=>{ song.end+=meter; });
$('#mendfit').onclick=()=>songAct(()=>{ const e=song.clips.reduce((m,c)=>Math.max(m,c.s+c.len),0); if(e>0) song.end=e; msg('Fin du morceau placée à la fin du dernier bloc.'); });
// export du morceau entier
async function renderSong(opt){
  opt=opt||{};
  songPrepare();
  await new Promise(r=>setTimeout(r,30));
  tracks.forEach(t=>ensurePitchSync(t));
  const bd=beatDur(), n=Math.max(1,Math.round(song.end*bd*SR));
  const off=new OfflineAudioContext(2,n,SR);
  const ch=makeChain(off); ch.vol.gain.value=mvol; ch.setFin(fin); ch.out.connect(off.destination);
  const anySolo=tracks.some(t=>t.solo);
  tracks.forEach(t=>{
    if(!t.buf||t.mute||(anySolo&&!t.solo)) return;
    const cl=song.clips.filter(c=>c.u===t.uid&&c.s<song.end); if(!cl.length) return;
    const g=off.createGain(); g.gain.value=t.vol;
    let dest=ch.inp; if(off.createStereoPanner){ const p=off.createStereoPanner(); p.pan.value=t.panv; p.connect(ch.inp); dest=p; }
    g.connect(dest);
    const q=makeEq(off,t.eqv); let prev=q.out;
    t.fxs.forEach(sl=>{ if(sl.type==='none') return; const f=makeFx(off,sl.type,sl.amt,bd); prev.connect(f.inp); prev=f.out; });
    prev.connect(g);
    cl.forEach(c=>schedClip(off,t,c,0,0,bd,song.end,q.inp,[]));
  });
  song.fx.forEach(fx=>schedFx(off,fx,0,0,bd,song.end,ch.inp,[]));
  const r=await off.startRendering(); limitBuffer(r);
  if(opt.fadeEnd){ const fl=Math.min(r.length,Math.round(Math.min(4,song.end*bd)*SR)); for(let c=0;c<r.numberOfChannels;c++){ const d=r.getChannelData(c); for(let i=0;i<fl;i++) d[r.length-fl+i]*=1-i/fl; } }
  return r;
}

function updTrackBtns(){
  const ab=$('#addbass'); if(ab) ab.disabled=tracks.length>=MAXTRACKS; const as=$('#addsynth'); if(as) as.disabled=tracks.length>=MAXTRACKS;
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
  if(t.el){ edOut(t); t.el.remove(); }
}
// supprimer une piste (vide ou non) ; ↶ la récupère (la piste est mise de côté, pas détruite)
function removeTrack(t){
  if(!t||recObj) return;
  if(tracks.length<=1){ msg('Il faut garder au moins une piste.'); return; }
  pushHist();
  if(preview&&preview.t===t) stopPreview(false);
  stopSrc(t); setLive(t,false); if(t.el){ edOut(t); t.el.remove(); } t.histDel=true;
  tracks.splice(tracks.indexOf(t),1);
  if(masterTake&&masterTake.ref===t) masterTake=null;
  reindexTracks(); updTrackBtns(); updFold(); applyGains(); lockUI(); updLive();
  try{ drawSong(); }catch(e){}
  scheduleSave();
  msg('Piste « '+t.name+' » supprimée'+(t.buf?' avec son son':'')+'. ↶ pour la récupérer.');
}
function removeLastTrack(){
  const t=tracks[tracks.length-1];
  if(!t||tracks.length<=1||t.buf||(recObj&&recObj.i===t.id)) return;
  disposeTrack(t); tracks.pop();
  updTrackBtns(); updFold(); applyGains(); lockUI(); scheduleSave();
}
function updFold(){ const any=tracks.some(t=>!$('.tbody',t.el).hidden); $('#foldall').textContent=any?'Tout replier':'Tout déplier'; }
$('#foldall').onclick=()=>{ const any=tracks.some(t=>!$('.tbody',t.el).hidden); tracks.forEach(t=>{ $('.tbody',t.el).hidden=any; $('.tog',t.el).setAttribute('aria-expanded',String(!any)); if(!any) drawTsel(t); }); updFold(); };
$('#addbass').onclick=()=>addBassTrack('bass');
$('#addsynth').onclick=()=>addBassTrack('synth');
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
  const d=((repd||t.off)?playBuf(t):t.buf).getChannelData(0), bins=Math.floor(w/2), step=d.length/bins;
  const pk=[]; let mx=0.15;
  for(let i=0;i<bins;i++){ let m=0; const a=Math.floor(i*step), z=Math.floor((i+1)*step); for(let j=a;j<z;j+=4){ const v=Math.abs(d[j]); if(v>m)m=v; } pk.push(m); if(m>mx)mx=m; }
  g.fillStyle=t.color;
  for(let i=0;i<bins;i++){ const hh=Math.max(1,pk[i]/mx*h*0.9); g.fillRect(i*2,(h-hh)/2,1.5*dpr>2?2:1.5,hh); }
  if(t.sel&&loopLen&&!repd){ g.fillStyle='rgba(11,11,13,.7)'; const sx=t.sel.s/beats*w, ex=t.sel.e/beats*w; g.fillRect(0,0,sx,h); g.fillRect(ex,0,w-ex,h); }
}
// pourquoi une piste ne s'entend pas (affiché sur la piste, pour ne jamais rester sans explication)
function silentWhy(t){
  if(!t.buf||(recObj&&recObj.i===t.id)) return '';
  if(t.mute) return 'muette : « Muet » est activé';
  if(tracks.some(x=>x.solo)&&!t.solo) return 'muette : une autre piste est en « Solo »';
  if(t.vol<0.01) return 'muette : volume à zéro';
  if(songPlay&&!song.clips.some(c=>c.u===t.uid&&c.s<song.end)) return 'muette : aucun bloc dans le montage';
  const b=running&&t.src?t.src.buffer:null;
  if(b){
    if(t._pkB!==b){ const x=b.getChannelData(0); let m=0; for(let i=0;i<x.length;i+=4){ const v=x[i]<0?-x[i]:x[i]; if(v>m) m=v; } t._pkB=b; t._pk=m; }
    if(t._pk<0.002) return t.sel?'muette : la partie gardée ne contient pas de son':'muette : le son de la piste est silencieux';
  }
  return '';
}
function uiTrack(t,now){
  let st='empty', label=t.buf?'':'vide';
  if(recObj&&recObj.i===t.id){
    if(now<recObj.tp){ st='armed'; label='Décompte '+Math.max(1,Math.ceil((recObj.tp-now)/beatDur())); }
    else if(recObj.stopT!==null){ st='rec'; label='Finalisation…'; }
    else{ st='rec'; label='● REC '+(now-recObj.tp).toFixed(1)+' s'+(recObj.master?' · ■ pour fermer la boucle':''); }
  } else if(t.buf){ st='ready'; const why=silentWhy(t); if(why){ label='⚠ '+why; st='ready silent'; } }
  const cls='card trk '+st+(t.kind==='bass'?' kbass':t.kind==='synth'?' ksynth':'');
  if(t.cache.cls!==cls){ t.el.className=cls; t.cache.cls=cls; }
  if(t.cache.label!==label){ t.tag.textContent=label; t.cache.label=label; }
  const rb=$('.rec',t.el), rtxt=(recObj&&recObj.i===t.id)?'■ STOP':'● REC';
  if(t.cache.rtxt!==rtxt){ rb.textContent=rtxt; t.cache.rtxt=rtxt; }
  const fl=(t.mute?ic('mute',16):'')+(t.solo?ic('headphones',16):'');
  if(t.cache.fl!==fl){ $('.flags',t.el).innerHTML=fl; t.cache.fl=fl; }
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
  placeEditor(ed);
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
  tracks.forEach(t=>{ const r=$('.bbrow',t.el); if(r) r.hidden=!!loopLen; if(isGen(t)){ fillMelSrc(t); if(t.tab==='bass'&&!$('.tbody',t.el).hidden){ drawBassTimeline(t); drawBassViz(t); } } });
  { const m=$('#mont'); if(m&&!m.hidden){ songPrepare(); drawSong(); } }
  updTempoRow();
  updLive();
  tracks.forEach((t,i)=>{
    const showSel=!!(t.buf&&loopLen&&!(ed&&masterTake&&masterTake.i===t.id));
    $('.tsel',t.el).hidden=!showSel;
    if(showSel) drawTsel(t);
    $('.del',t.el).hidden=!(tracks.length>1&&!(recObj&&recObj.i===t.id));
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
  if(songPlay){ songStop(true); song.cur=0; drawSong(); return; }
  if(recObj){ if(ctx.currentTime<recObj.tp) cancelRec(); else stopRec(); return; }
  stopTransport();
}
const onPlay=async()=>{
  try{ await ctx.resume(); }catch(e){}
  if(recObj){ stopAll(); return; }
  if(running) pauseTransport(); else resumeTransport();
};
$('#play').onclick=onPlay;
$('#dplay').onclick=async()=>{ try{ await ctx.resume(); }catch(e){} if(!$('#mont').hidden&&loopLen&&!recObj){ if(!songPlay) songStart(song.cur); return; } if(!recObj&&!running) resumeTransport(); };
$('#dpause').onclick=async()=>{ try{ await ctx.resume(); }catch(e){} if(recObj) return; if(songPlay){ songStop(); return; } if(running) pauseTransport(); else if(paused) resumeTransport(); };
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
$('#metro').onclick=e=>{ metroOn=!metroOn; $('#metro').classList.toggle('on',metroOn); scheduleSave(true); msg(metroOn?'Métronome activé (il le restera, même après un rafraîchissement).':'Métronome coupé (il le restera, même après un rafraîchissement).'); };
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
$('#fidtest').onclick=()=>fidTest();
$('#micscan').onclick=scanMics;
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
  const reps=opt.reps||1, LS=loopLen;
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
  const r=await off.startRendering(); limitBuffer(r);
  if(opt.fadeEnd){
    const n=r.length, fl=Math.min(n,Math.round(Math.min(loopSec(),4)*SR));
    for(let c=0;c<r.numberOfChannels;c++){ const d=r.getChannelData(c); for(let i=0;i<fl;i++) d[n-fl+i]*=1-i/fl; }
  }
  return r;
}
async function withBusy(btn,label,fn){
  if(!tracks.some(t=>t.buf)){ msg("Rien à exporter : enregistre au moins une piste."); return; }
  btn.disabled=true; const old=btn.innerHTML; btn.textContent=label; msg('');
  try{ await fn(); }
  catch(e){ msg("Opération impossible : "+((e&&(e.message||e.code))||'erreur')); }
  finally{ btn.disabled=false; btn.innerHTML=old; }
}
// ======================= BIBLIOTHÈQUE DE MORCEAUX (WAV gardés sur l'appareil) =======================
let lib=null, libOpen=null, libAudio=null, libPlaying=null;
async function libLoad(){ if(lib) return lib; try{ const db=await idb(); lib=(await idbGet(db,'lib'))||[]; }catch(e){ lib=[]; } return lib; }
async function libSave(pairs,dels){ const db=await idb(); await idbPut(db,[['lib',lib]].concat(pairs||[]),dels); }
const fmtDur=s=>{ const m=Math.floor(s/60); return m+':'+String(Math.round(s-m*60)).padStart(2,'0'); };
const fmtMo=b=>(b/1048576).toFixed(1).replace('.',',')+' Mo';
// le morceau final : le montage s'il existe, sinon la boucle jouée 4 fois (avec fondu de fin) ; il porte le nom du projet
const songIsMont=()=>!!(song&&song.clips&&song.clips.length);
function updSongSrc(){ const e=$('#songsrc'); if(!e) return; e.textContent=!loopLen?'Enregistre d\'abord une piste.':songIsMont()?'Le morceau = ton montage ('+fmtSongTime(song.end)+'), nommé « '+projName+' ».':'Pas encore de montage : le morceau = ta boucle jouée 4 fois, nommé « '+projName+' ». Compose-le dans l\'onglet Morceau pour plus long.'; }
async function renderFinal(){ return songIsMont()?await renderSong({fadeEnd:false}):await renderMix({reps:4,fadeEnd:true}); }
async function libAdd(){
  if(!tracks.some(t=>t.buf)||!loopLen){ msg('Rien à enregistrer : enregistre d\'abord une piste.'); return; }
  const r=await renderFinal(), kind=songIsMont()?'song':'loop';
  const w=wav16(r), data=w instanceof ArrayBuffer?w:(w.buffer?w.buffer.slice(w.byteOffset,w.byteOffset+w.byteLength):w);
  await libLoad();
  const names=new Set(lib.map(x=>x.name)); let name=projName, k=2; while(names.has(name)) name=projName+' ('+(k++)+')';
  if(fsDir&&fsOk){
    try{ const fn=await fsWrite(projName,name,data); libOpen=null; await fsScan(); renderLib(); msg('« '+fn+' » enregistré dans ton dossier « '+fsDir.name+'/'+safeName(projName)+' » ('+fmtDur(r.length/r.sampleRate)+').'); return; }
    catch(e){ fsOk=false; updFsUI(); msg('Écriture dans le dossier impossible ('+(e.message||e.name)+') : morceau gardé dans l\'appli à la place.'); }
  }
  const it={id:newId(),name,dir:projName,kind,dur:r.length/r.sampleRate,size:data.byteLength,at:Date.now(),proj:projName};
  lib.unshift(it);
  try{ await libSave([['lw:'+it.id,data]]); }catch(e){ lib.shift(); msg('Enregistrement impossible : plus de place sur l\'appareil ?'); return; }
  try{ if(navigator.storage&&navigator.storage.persist) navigator.storage.persist(); }catch(e){}
  libOpen=null; renderLib();
  msg('« '+name+' » enregistré ('+fmtDur(it.dur)+') : retrouve-le dans « Mes morceaux enregistrés », juste en dessous.');
}
async function songShare(){
  if(!tracks.some(t=>t.buf)||!loopLen){ msg('Rien à envoyer : enregistre d\'abord une piste.'); return; }
  const r=await renderFinal(), name=safeName(projName)+'.wav', blob=new Blob([wav16(r)],{type:'audio/wav'});
  let file=null; try{ file=new File([blob],name,{type:'audio/wav'}); }catch(e){}
  let can=false; try{ can=!!(file&&navigator.canShare&&navigator.share&&navigator.canShare({files:[file]})); }catch(e){}
  if(can){ try{ await navigator.share({files:[file],title:projName,text:'Fait avec LoopBox'}); msg('« '+projName+' » envoyé.'); }catch(e){ if(e&&e.name==='AbortError') msg('Envoi annulé.'); else throw e; } return; }
  downloadBlob(blob,name); msg('Envoi direct impossible dans ce navigateur : « '+name+' » est dans tes Téléchargements, envoie-le depuis WhatsApp (trombone → Document).');
}
async function libData(id){ const db=await idb(); return await idbGet(db,'lw:'+id); }
async function libFile(it){ const d=await libData(it.id); if(!d) throw new Error('son introuvable'); return {blob:new Blob([d],{type:'audio/wav'}),name:safeName(it.name)+'.wav'}; }
async function libShare(it){
  try{
    const {blob,name}=await libFile(it); let file=null; try{ file=new File([blob],name,{type:'audio/wav'}); }catch(e){}
    let can=false; try{ can=!!(file&&navigator.canShare&&navigator.share&&navigator.canShare({files:[file]})); }catch(e){}
    if(can){ try{ await navigator.share({files:[file],title:it.name,text:'Fait avec LoopBox'}); msg('« '+it.name+' » partagé.'); }catch(e){ if(!(e&&e.name==='AbortError')) msg('Partage impossible : '+(e.message||e)+'.'); } return; }
    downloadBlob(blob,name); msg('Le partage direct n\'est pas possible dans ce navigateur : « '+name+' » est dans tes téléchargements, envoie-le depuis WhatsApp (trombone → Document).');
  }catch(e){ msg('Partage impossible : '+e.message+'.'); }
}
function libStop(){ if(libAudio){ try{ libAudio.pause(); }catch(e){} if(libAudio._u) URL.revokeObjectURL(libAudio._u); } libAudio=null; libPlaying=null; }
async function libPlay(it){
  if(libPlaying===it.id){ libStop(); renderLib(); return; }
  libStop();
  try{ const {blob}=await libFile(it), u=URL.createObjectURL(blob), a=new Audio(u); a._u=u; libAudio=a; libPlaying=it.id; a.onended=()=>{ libStop(); renderLib(); }; const p=a.play(); if(p&&p.catch) p.catch(()=>{}); }
  catch(e){ msg('Lecture impossible.'); libStop(); }
  renderLib();
}
async function libDel(it){ lib=lib.filter(x=>x.id!==it.id); if(libPlaying===it.id) libStop(); libOpen=null; await libSave([],['lw:'+it.id]); renderLib(); msg('« '+it.name+' » supprimé de la bibliothèque.'); }
// ----- dossier de la tablette (File System Access : Chrome Android 132+, desktop) -----
let fsDir=null, fsOk=false, fsFiles=[];
const fsSupported=()=>typeof window.showDirectoryPicker==='function';
async function fsPerm(h,ask){ try{ const o={mode:'readwrite'}; if((await h.queryPermission(o))==='granted') return true; return ask?(await h.requestPermission(o))==='granted':false; }catch(e){ return false; } }
async function fsWrite(sub,name,data){
  const d=await fsDir.getDirectoryHandle(safeName(sub),{create:true});
  let fn=safeName(name)+'.wav', k=2; const exists=async n=>{ try{ await d.getFileHandle(n); return true; }catch(e){ return false; } };
  while(await exists(fn)) fn=safeName(name)+' '+(k++)+'.wav';
  const fh=await d.getFileHandle(fn,{create:true}), w=await fh.createWritable(); await w.write(data); await w.close();
  return fn;
}
async function fsScan(){
  fsFiles=[]; if(!fsDir||!fsOk) return;
  try{
    const add=async(dir,folder)=>{ for await (const h of dir.values()){ if(h.kind==='file'&&/\.wav$/i.test(h.name)){ let f=null; try{ f=await h.getFile(); }catch(e){} fsFiles.push({h,parent:dir,name:h.name.replace(/\.wav$/i,''),file:h.name,dir:folder,size:f?f.size:0,at:f?f.lastModified:0}); } else if(h.kind==='directory'&&folder===null) await add(h,h.name); } };
    await add(fsDir,null);
  }catch(e){ fsOk=false; }
}
function updFsUI(){
  const b=$('#libfold'), st=$('#libfoldst'); if(!b) return;
  if(!fsDir){ b.innerHTML=ic('folder')+' Lier un dossier de la tablette'; st.textContent=''; return; }
  if(fsOk){ b.innerHTML=ic('folder')+' Changer de dossier'; st.textContent='Morceaux enregistrés dans « '+fsDir.name+' » ('+fsFiles.length+' WAV).'; }
  else { b.innerHTML=ic('folder')+' Réautoriser « '+fsDir.name+' »'; st.textContent='La tablette redemande l\'accès au dossier : touche le bouton.'; }
}
async function fsLink(){
  if(fsDir&&!fsOk){ fsOk=await fsPerm(fsDir,true); if(fsOk){ await fsScan(); msg('Dossier « '+fsDir.name+' » de nouveau accessible.'); } updFsUI(); renderLib(); if(fsOk) return; }
  if(!fsSupported()){ $('#libfoldst').textContent='Ce navigateur ne permet pas de lier un dossier (Brave le bloque souvent) : ouvre LoopBox dans Chrome pour ça.'; msg('Ce navigateur ne permet pas de lier un dossier de la tablette (Brave le bloque parfois ; Chrome le permet). Les morceaux restent dans l\'appli : « Télécharger » les met dans Téléchargements, visible avec l\'appli Fichiers.'); return; }
  const st=$('#libfoldst'); st.textContent='Choisis un dossier dans la fenêtre de la tablette…';
  const t0=Date.now(); let h;
  try{ try{ h=await window.showDirectoryPicker({mode:'readwrite'}); }catch(e){ if(e&&e.name==='TypeError') h=await window.showDirectoryPicker(); else throw e; } }
  catch(e){
    // refus immédiat (moins d'une seconde, sans fenêtre) = navigateur qui bloque la fonction (cas de Brave)
    const blocked=!(e&&e.name==='AbortError')||Date.now()-t0<1000;
    const m=blocked?'Ce navigateur bloque l\'accès aux dossiers de la tablette ('+((e&&e.name)||'refus')+'). Ouvre LoopBox dans Chrome pour lier un dossier ; dans Brave, les morceaux restent dans l\'appli (« Télécharger » les met dans Téléchargements).':'Aucun dossier choisi.';
    st.textContent=m; msg(m); return; }
  fsDir=h; fsOk=await fsPerm(h,true);
  try{ const db=await idb(); await idbPut(db,[['libfs',h]]); }catch(e){}
  await fsScan(); updFsUI(); renderLib();
  msg(fsOk?'Dossier « '+h.name+' » lié : les prochains morceaux rangés y seront écrits en WAV (un sous-dossier par projet).':'Accès au dossier refusé.');
}
async function fsInit(){ try{ const db=await idb(), h=await idbGet(db,'libfs'); if(h&&h.queryPermission){ fsDir=h; fsOk=await fsPerm(h,false); await fsScan(); } }catch(e){} updFsUI(); renderLib(); }
async function fsShare(f){
  try{ const file=await f.h.getFile(); const ff=new File([file],f.file,{type:'audio/wav'}); let can=false; try{ can=!!(navigator.canShare&&navigator.share&&navigator.canShare({files:[ff]})); }catch(e){}
    if(can){ try{ await navigator.share({files:[ff],title:f.name,text:'Fait avec LoopBox'}); msg('« '+f.name+' » partagé.'); }catch(e){ if(!(e&&e.name==='AbortError')) msg('Partage impossible.'); } return; }
    msg('Partage direct impossible ici : le fichier est dans ton dossier « '+fsDir.name+(f.dir?'/'+f.dir:'')+' », envoie-le depuis WhatsApp (trombone → Document).');
  }catch(e){ msg('Fichier introuvable : il a peut-être été déplacé.'); await fsScan(); renderLib(); }
}
async function fsPlay(f){
  const key='fs:'+(f.dir||'')+'/'+f.file;
  if(libPlaying===key){ libStop(); renderLib(); return; }
  libStop();
  try{ const file=await f.h.getFile(), u=URL.createObjectURL(file), a=new Audio(u); a._u=u; libAudio=a; libPlaying=key; a.onended=()=>{ libStop(); renderLib(); }; const p=a.play(); if(p&&p.catch) p.catch(()=>{}); }
  catch(e){ msg('Lecture impossible.'); libStop(); }
  renderLib();
}
async function libCopyAll(){
  if(!fsDir||!fsOk||!lib.length) return; let n=0;
  for(const it of lib){ try{ const d=await libData(it.id); if(d){ await fsWrite(it.dir||'Sans dossier',it.name,d); n++; } }catch(e){} }
  await fsScan(); renderLib(); msg(n+' morceau'+(n>1?'x':'')+' copié'+(n>1?'s':'')+' dans « '+fsDir.name+' ». Tu peux ensuite les supprimer de l\'appli si tu veux.');
}
function libBtn(icon,label,fn){ const b=document.createElement('button'); b.innerHTML=ic(icon); b.setAttribute('aria-label',label); b.title=label; b.onclick=fn; return b; }
function renderLib(){
  const box=$('#liblist'); if(!box||!lib) return;
  const all=lib.length+(fsDir&&fsOk?fsFiles.length:0);
  $('#libinfo').textContent=all?all+' morceau'+(all>1?'x':''):'';
  box.innerHTML='';
  const row=(key,name,info,onPlay,onShare,onEdit)=>{ const r=document.createElement('div'); r.className='prow librow'+(key.startsWith('fs:')?' fsrow':'');
    const pn=document.createElement('div'); pn.className='pn'; pn.innerHTML='<b></b><small></small>'; $('b',pn).textContent=name; $('small',pn).textContent=info; pn.onclick=()=>{ libOpen=libOpen===key?null:key; renderLib(); };
    const pb=libBtn(libPlaying===key?'pause':'speaker',libPlaying===key?'Arrêter':'Écouter '+name,onPlay); pb.className='libplay'+(libPlaying===key?' on':'');
    const sb=libBtn('share','Envoyer '+name+' (WhatsApp…)',onShare); sb.className='libshare';
    r.append(pb,pn,sb); box.appendChild(r); if(libOpen===key) box.appendChild(onEdit()); };
  const delBtn=(label,fn)=>{ const db=document.createElement('button'); db.className='libdel'; db.innerHTML=ic('trash')+' '+label; db.onclick=()=>{ if(db.dataset.arm!=='1'){ db.dataset.arm='1'; db.textContent='Confirmer la suppression ?'; return; } fn(); }; return db; };
  if(fsDir&&fsOk) fsFiles.slice().sort((a,b)=>b.at-a.at).forEach(f=>{ const key='fs:'+(f.dir||'')+'/'+f.file;
    row(key,f.name,'tablette : '+fsDir.name+(f.dir?'/'+f.dir:'')+(f.at?' · '+fmtDate(f.at):''),()=>fsPlay(f),()=>fsShare(f),()=>{ const ed=document.createElement('div'); ed.className='libedit row wrap'; ed.appendChild(delBtn('Supprimer le fichier',async()=>{ try{ await f.parent.removeEntry(f.file); msg('« '+f.file+' » supprimé.'); }catch(e){ msg('Suppression impossible : supprime-le avec l\'appli Fichiers.'); } libOpen=null; await fsScan(); renderLib(); })); return ed; }); });
  lib.slice().sort((a,b)=>b.at-a.at).forEach(it=>{
    row(it.id,it.name,fmtDur(it.dur)+' · '+fmtDate(it.at),()=>libPlay(it),()=>libShare(it),()=>{
      const ed=document.createElement('div'); ed.className='libedit';
      ed.innerHTML='<div class="row wrap"><input class="libname" type="text" maxlength="60" style="flex:1;min-width:150px" aria-label="Nom du morceau"><button class="libok primary">Renommer</button></div><div class="row wrap"><button class="libdl">'+ic('download')+' Télécharger</button></div>';
      $('.libname',ed).value=it.name;
      $('.libok',ed).onclick=async()=>{ const n=$('.libname',ed).value.trim(); if(n) it.name=n.slice(0,60); libOpen=null; await libSave(); renderLib(); msg('Morceau renommé : « '+it.name+' ».'); };
      $('.libdl',ed).onclick=async()=>{ try{ const {blob,name}=await libFile(it); downloadBlob(blob,name); msg('« '+name+' » est dans tes Téléchargements.'); }catch(e){ msg('Téléchargement impossible.'); } };
      $('.row:last-child',ed).appendChild(delBtn('Supprimer',()=>libDel(it)));
      if(fsDir&&fsOk){ const cp=document.createElement('button'); cp.textContent='Copier dans le dossier'; cp.onclick=async()=>{ try{ const d=await libData(it.id); await fsWrite(it.dir||projName,it.name,d); await fsScan(); renderLib(); msg('« '+it.name+' » copié dans « '+fsDir.name+' ».'); }catch(e){ msg('Copie impossible.'); } }; $('.row:last-child',ed).appendChild(cp); }
      return ed; });
  });
  if(!all){ const p=document.createElement('p'); p.className='hint'; p.textContent='Aucun morceau enregistré pour l\'instant : touche « Enregistrer le morceau » au-dessus.'; box.appendChild(p); }
}
$('#libfold').onclick=()=>fsLink();
$('#songsave').onclick=()=>withBusy($('#songsave'),'Enregistrement…',()=>libAdd());
$('#songshare').onclick=()=>withBusy($('#songshare'),'Préparation…',()=>songShare());
libLoad().then(fsInit);

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
function scheduleSave(settingsOnly){ cloudDirty=true; if(!settingsOnly) audioDirty=true; clearTimeout(saveT); setSaveState('…'); saveT=setTimeout(saveProj,settingsOnly?300:700); }
function mainData(){
  return {v:2,song:songSnapData(),name:projName,go:gridOff,liveQ,scenes:scenes.map(sc=>sc?sc.map(x=>({i:tracks.indexOf(x.t),m:x.mute})).filter(x=>x.i>=0):null),meter,bpm,loopLen,beats,baseLen,baseBeats,rep,snap,mixMode,mvol,fin,
    tracks:tracks.map(t=>({sr:t.buf?t.buf.sampleRate:0,vol:t.vol,pan:t.panv,mute:t.mute,solo:t.solo,fxs:t.fxs.map(f=>({t:f.type,a:f.amt})),st:t.srcType,pt:t.pitch,eq:t.eqv,sel:t.sel?[t.sel.s,t.sel.e]:null,u:t.uid,smd:t.selMode,of:t.off||0,an:!!t.anc,sn:t.snap!==false,spd:t.speed||1,vo:t.voice?{sr:t.voice.buf.sampleRate,sel:t.voice.sel?[t.voice.sel.s,t.voice.sel.e]:null,smd:t.voice.selMode,of:t.voice.off,spd:t.voice.speed,pt:t.voice.pitch,fxs:t.voice.fxs.map(f=>({t:f.type,a:f.amt})),nm:t.voice.name}:null,nm:t.name,co:t.color,fi:t.fadeIn,fo:t.fadeOut,k:t.kind,bs:t.bass}))};
}
function summary(){ return {id:projId,name:projName,updated:Date.now(),beats:loopLen?beats:0,bpm:loopLen?+(beats*60/loopSec()).toFixed(1):bpm,ntr:tracks.filter(t=>t.buf).length,dur:loopLen?+loopSec().toFixed(1):0}; }
async function saveProj(){
  clearTimeout(saveT); saveT=null;
  if(!projId) return;
  const withAudio=audioDirty; audioDirty=false;
  try{
    const db=await idb();
    const main=mainData(), audio=withAudio?tracks.map(t=>t.buf?t.buf.getChannelData(0).slice():null):null;
    if(audio) tracks.forEach((t,i)=>{ if(t.voice){ audio[100+i]=t.voice.buf.getChannelData(0).slice(); audio[200+i]=t.voice.play; } });
    const sm=summary(), i=projIndex.list.findIndex(p=>p.id===projId);
    if(i>=0) projIndex.list[i]=sm; else projIndex.list.push(sm);
    projIndex.cur=projId;
    const pairs=[['p:'+projId+':main',main],['index',projIndex],['device',{comp,ingain,normOn,mo:metroOn,eng:devEng,mv:metroVol,ms:metroSub,setup,lats,latAt,micId}]];
    if(audio) pairs.push(['p:'+projId+':audio',audio]);
    await idbPut(db,pairs);
    setSaveState('ok'); updProjList(); cloudAfterSave();
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
  songStop(true); songResetData(); { const m=$('#mont'); if(m&&!m.hidden){ m.hidden=true; $('#montbtn').classList.remove('on'); } }
  stopTransport(); paused=false;
  tracks.slice().forEach(disposeTrack); tracks.length=0; $('#tracks').innerHTML='';
  loopLen=0; beats=4; baseLen=0; baseBeats=4; rep=1; loopHist=null; masterTake=null; lastLoop=null;
  bpm=90; snap=true; mixMode=false; mvol=0.9; fin=0; meter=4; gridOff=0; liveQ='bar'; scenes.fill(null);
  clearHist();
  addTrack();
  refreshGlobalUI(); buildDots(); applyGains(); lockUI(); msg('');
}
function applyProject(d,audio){
  songResetData(); if(d&&d.song) songApplyData(d.song);
  const pcmOf=(s,i)=>d.v===2?(audio&&audio[i]):s.pcm;
  const used=(s,i)=>{ const p=pcmOf(s,i); return !!(p&&p.length)||(s.fxs||[]).some(f=>f.t&&f.t!=='none')||(s.fx&&s.fx!=='none')||(s.eq||[]).some(v=>+v)||!!s.pt||(s.vol!=null&&s.vol!==0.8)||!!s.pan||!!s.mute||!!s.solo||(s.st&&s.st!=='beatbox')||s.k==='bass'||s.k==='synth'||!!s.nm; };
  let need=1; (d.tracks||[]).forEach((s,i)=>{ if(s&&i<MAXTRACKS&&used(s,i)) need=i+1; });
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
    t.kind=s.k==='bass'?'bass':s.k==='synth'?'synth':'rec'; t.bass=s.bs?JSON.parse(JSON.stringify(s.bs)):null; t.tab=''; setKindUI(t); if(isGen(t)) showBassOpts(t);
    t.fxs=(Array.isArray(s.fxs)&&s.fxs.length)?s.fxs.slice(0,MAXFX).map(f=>({type:okT(f.t)?f.t:'none',amt:clamp(+f.a,0,1)||0})):[{type:okT(s.fx)?s.fx:'none',amt:s.fa??0.5}];
    t.srcType=SRC_LIST.some(p=>p.id===s.st)?s.st:'beatbox';
    t.pitch=clamp(Math.round(+s.pt||0),-12,12);
    t.eqv=(Array.isArray(s.eq)&&s.eq.length===3)?s.eq.map(x=>clamp(+x||0,-12,12)):[0,0,0]; t.eq.lo.gain.value=t.eqv[0]; t.eq.mid.gain.value=t.eqv[1]; t.eq.hi.gain.value=t.eqv[2];
    const pcm=pcmOf(s,i);
    if(pcm&&pcm.length&&pcm.length===loopLen){ const b=ctx.createBuffer(1,pcm.length,s.sr||SR); b.copyToChannel(pcm,0); t.buf=b; }
    if(s.u) t.uid=s.u;
    t.voice=null;
    if(s.vo&&audio&&audio[100+i]&&audio[100+i].length){ const vp=audio[100+i], vb=ctx.createBuffer(1,vp.length,s.vo.sr||SR); vb.copyToChannel(vp,0);
      t.voice={buf:vb,play:audio[200+i]||vp,sel:Array.isArray(s.vo.sel)?{s:s.vo.sel[0],e:s.vo.sel[1]}:null,selMode:s.vo.smd||'mute',off:+s.vo.of||0,speed:+s.vo.spd||1,pitch:+s.vo.pt||0,fxs:(s.vo.fxs||[]).map(f=>({type:f.t,amt:+f.a||0.5})),name:s.vo.nm||t.name}; }
    updVoiceUI(t);
    if(t.buf&&Array.isArray(s.sel)&&s.sel.length===2&&s.sel[0]>=0&&s.sel[1]<=beats+1e-6&&s.sel[1]-s.sel[0]>=0.02) t.sel={s:s.sel[0],e:Math.min(beats,s.sel[1])};
    t.off=clamp(+s.of||0,-60,60); t.anc=!!s.an; t.snap=s.sn!==false; updOffUI(t); t.speed=clamp(+s.spd||1,0.5,2); updSpeedUI(t);
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
    if(dev){ devLoaded=true; if(dev.comp!=null) comp=dev.comp; if(dev.ingain) ingain=dev.ingain; normOn=dev.normOn!==false; devEng=dev.eng||''; if(dev.mv!=null) metroVol=dev.mv; if(dev.ms) metroSub=dev.ms; metroOn=dev.mo===true; { const mb=$('#metro'); if(mb) mb.classList.toggle('on',metroOn); } if(dev.lats){ Object.assign(lats,dev.lats); Object.assign(latAt,dev.latAt||{}); } else if(dev.comp!=null){ lats.speaker=dev.comp; } if(SETUPS[dev.setup]) setup=dev.setup; micId=dev.micId||''; }
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
  const q16=d=>{ const q=new Int16Array(d.length); for(let i=0;i<d.length;i++) q[i]=Math.round(clamp(d[i],-1,1)*32767); return q; };
  tracks.forEach(t=>{ if(t.buf){ const d=t.buf.getChannelData(0); parts.push(q16(d)); lens.push(d.length); } else lens.push(0); });
  // voix d'origine des pistes transformées en basse / mélodie (pour « revenir à la voix » sur un autre appareil)
  const xl=[]; tracks.forEach((t,i)=>{ if(t.voice&&t.voice.buf){ const b=t.voice.buf.getChannelData(0); parts.push(q16(b)); xl.push([100+i,b.length]); if(t.voice.play&&t.voice.play.length){ parts.push(q16(t.voice.play)); xl.push([200+i,t.voice.play.length]); } } });
  const json=new TextEncoder().encode(JSON.stringify({format:1,app:'LoopBox',name:projName,main:mainData(),lens,xl}));
  const head=new Uint8Array(8); head.set([76,66,88,49]); new DataView(head.buffer).setUint32(4,json.length,true);
  return new Blob([head,json,...parts],{type:'application/octet-stream'});
}
function downloadBlob(blob,name){
  const url=URL.createObjectURL(blob), a=document.createElement('a');
  a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}
function decodeLbx(ab){
  const u=new Uint8Array(ab);
  if(u.length<8||u[0]!==76||u[1]!==66||u[2]!==88||u[3]!==49) throw new Error('format');
  const jl=new DataView(ab).getUint32(4,true);
  const meta=JSON.parse(new TextDecoder().decode(u.subarray(8,8+jl)));
  let off=8+jl;
  const rd=n=>{ const q=new Int16Array(ab.slice(off,off+n*2)); off+=n*2; const f=new Float32Array(n); for(let i=0;i<n;i++) f[i]=q[i]/32767; return f; };
  const audio=(meta.lens||[]).map(n=>n?rd(n):null);
  (meta.xl||[]).forEach(([k,n])=>{ audio[k]=rd(n); });
  return {meta,audio};
}
async function importProjectFile(file){
  try{
    const ab=await readFile(file), {meta,audio}=decodeLbx(ab);
    await saveProj();
    resetProject();
    projId=newId(); projName=uniqueName(meta.name||'Projet importé');
    const d=meta.main||{}; d.v=2; applyProject(d,audio);
    audioDirty=true; await saveProj(); updProjUI(); msg('Projet ouvert depuis le fichier : « '+projName+' ».');
  }catch(e){ msg("Ce fichier n'est pas un projet LoopBox valide."); }
}
// ----- projets en ligne (Supabase : un dossier privé par compte) -----
const CLOUD={url:'https://zwltvhjitrvlrhbivdfm.supabase.co',key:'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3bHR2aGppdHJ2bHJoYml2ZGZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODczMTMxMjcsImV4cCI6MjEwMjg4OTEyN30.hTD6h2r9dKdKaJ15vcFU6eN8WScA1rr_nT2dNByT6co',bucket:'loopbox',max:50*1024*1024};
const lsGet=k=>{ try{ return JSON.parse(localStorage.getItem(k)||'null'); }catch(e){ return null; } };
const lsSet=(k,v)=>{ try{ if(v==null) localStorage.removeItem(k); else localStorage.setItem(k,JSON.stringify(v)); }catch(e){} };
let cloudDirty=false, cloud=lsGet('lbx-cloud'), cloudAuto=lsGet('lbx-cloud-auto')!==false, cloudUp=lsGet('lbx-cloud-up')||{}, cloudList=null, cloudBusy=false, cloudAutoT=null;
function cloudErr(j,r){ const m=(j&&(j.error_description||j.msg||j.message||j.error))||('erreur '+(r&&r.status)); if(/invalid login|invalid_grant|invalid credentials/i.test(m)) return 'e-mail ou mot de passe incorrect'; if(/not confirmed/i.test(m)) return 'compte pas encore confirmé : ouvre le lien reçu par e-mail'; if(/already registered|already exists/i.test(m)) return 'ce compte existe déjà : connecte-toi'; if(/password/i.test(m)&&/6|short|weak/i.test(m)) return 'mot de passe trop court (6 caractères minimum)'; if(/exceeded|too large|payload/i.test(m)) return 'projet trop gros pour l\'envoi (50 Mo maximum)'; return m; }
async function cfetch(path,opt,auth){
  const h=Object.assign({apikey:CLOUD.key},(opt&&opt.headers)||{});
  h.Authorization='Bearer '+(auth===false?CLOUD.key:await cloudToken());
  let r; try{ r=await fetch(CLOUD.url+path,Object.assign({cache:'no-store'},opt,{headers:h})); }catch(e){ throw new Error('pas de connexion internet'); }
  if(!r.ok){ let j=null; try{ j=await r.json(); }catch(e){} const er=new Error(cloudErr(j,r)); er.status=r.status; er.body=j; throw er; }
  return r;
}
function cloudSetSession(j){ cloud={at:j.access_token,rt:j.refresh_token,exp:Math.floor(Date.now()/1000)+(+j.expires_in||3600),uid:j.user&&j.user.id,email:j.user&&j.user.email}; lsSet('lbx-cloud',cloud); }
async function cloudToken(){
  if(!cloud) throw new Error('non connecté');
  if(cloud.exp-60>Date.now()/1000) return cloud.at;
  try{ const r=await cfetch('/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refresh_token:cloud.rt})},false); cloudSetSession(await r.json()); return cloud.at; }
  catch(e){ if(e.status){ cloud=null; lsSet('lbx-cloud',null); updCloudUI(); throw new Error('session expirée : reconnecte-toi'); } throw e; }
}
async function cloudLogin(email,pw,create){
  if(!email||!pw){ msg('Indique ton e-mail et ton mot de passe.'); return; }
  setCloudSt('…');
  try{
    if(create){
      const r=await cfetch('/auth/v1/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:pw})},false), j=await r.json();
      if(!j.access_token){ setCloudSt(''); msg('Compte créé : ouvre le lien de confirmation reçu par e-mail (regarde aussi les indésirables), puis reviens ici et touche « Se connecter ».'); return; }
      cloudSetSession(j);
    } else {
      const r=await cfetch('/auth/v1/token?grant_type=password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:pw})},false);
      cloudSetSession(await r.json());
    }
    $('#cloudpw').value=''; msg('Connecté : tes projets en ligne sont listés dans le menu.'); updCloudUI(); await cloudRefresh();
  }catch(e){ setCloudSt('⚠'); msg('Connexion impossible : '+e.message+'.'); }
}
function cloudLogout(){ cloud=null; cloudList=null; lsSet('lbx-cloud',null); updCloudUI(); msg('Déconnecté. Tes projets restent en ligne et sur cet appareil.'); }
const cPath=id=>cloud.uid+'/'+id+'.loopbox', cIdx=()=>cloud.uid+'/index.json';
async function cloudGetIndex(){ try{ const r=await cfetch('/storage/v1/object/authenticated/'+CLOUD.bucket+'/'+cIdx(),{method:'GET'}); return await r.json(); }catch(e){ const b=e.body||{}; if(e.status===404||String(b.statusCode)==='404'||b.error==='not_found'||/not found/i.test(b.message||'')) return {}; throw e; } }
async function cloudPutIndex(ix){ await cfetch('/storage/v1/object/'+CLOUD.bucket+'/'+cIdx(),{method:'POST',headers:{'Content-Type':'application/json','x-upsert':'true','cache-control':'no-cache'},body:JSON.stringify(ix)}); }
async function cloudRefresh(){
  if(!cloud) return;
  try{ cloudList=await cloudGetIndex(); setCloudSt('✓'); }catch(e){ setCloudSt('⚠'); msg('Liste en ligne indisponible : '+e.message+'.'); }
  updCloudUI();
}
async function cloudUpload(silent){
  if(!cloud||cloudBusy) return false;
  if(!tracks.some(t=>t.buf)){ if(!silent) msg('Rien à envoyer : le projet est vide.'); return false; }
  cloudBusy=true; setCloudSt('envoi…'); clearTimeout(cloudAutoT); cloudAutoT=null; let failed=false;
  try{
    cloudDirty=false; await saveProj();
    const blob=encodeProject(), id=projId, sm=summary();
    if(blob.size>CLOUD.max){ throw new Error('projet trop gros pour l\'envoi ('+Math.round(blob.size/1048576)+' Mo, 50 Mo maximum) : supprime des pistes inutiles ou raccourcis-les'); }
    await cfetch('/storage/v1/object/'+CLOUD.bucket+'/'+cPath(id),{method:'POST',headers:{'Content-Type':'application/octet-stream','x-upsert':'true','cache-control':'no-cache'},body:blob});
    const ix=await cloudGetIndex(); ix[id]={name:sm.name,updated:sm.updated,beats:sm.beats,bpm:sm.bpm,ntr:sm.ntr,size:blob.size}; await cloudPutIndex(ix);
    cloudList=ix; cloudUp[id]=sm.updated; lsSet('lbx-cloud-up',cloudUp);
    setCloudSt('✓ '+fmtDate(Date.now()).split(' ').pop());
    if(!silent) msg('« '+sm.name+' » est en ligne ('+(blob.size/1048576).toFixed(1).replace('.',',')+' Mo) : ouvre-le depuis n\'importe quel appareil, menu projet → En ligne.');
    return true;
  }catch(e){ failed=true; cloudDirty=true; setCloudSt('⚠ non envoyé'); if(!silent) msg('Envoi en ligne impossible : '+e.message+'. Le projet reste enregistré sur cet appareil.'); return false; }
  finally{ cloudBusy=false; updCloudUI(); if(!failed&&cloudDirty&&cloudAuto&&cloud) cloudAfterSave(); }
}
async function cloudOpen(id){
  if(!cloud) return;
  setCloudSt('réception…'); msg('Téléchargement du projet…');
  try{
    const r=await cfetch('/storage/v1/object/authenticated/'+CLOUD.bucket+'/'+cPath(id),{method:'GET'}), ab=await r.arrayBuffer(), {meta,audio}=decodeLbx(ab);
    await saveProj();
    resetProject();
    projId=id; projName=(cloudList&&cloudList[id]&&cloudList[id].name)||meta.name||'Projet';
    const d=meta.main||{}; d.v=2; applyProject(d,audio);
    audioDirty=true; cloudDirty=false; await saveProj(); clearTimeout(cloudAutoT); cloudAutoT=null; cloudDirty=false;
    cloudUp[id]=(projIndex.list.find(p=>p.id===id)||{}).updated||Date.now(); lsSet('lbx-cloud-up',cloudUp);
    setCloudSt('✓'); updProjUI(); msg('Projet « '+projName+' » ouvert depuis ton espace en ligne.');
  }catch(e){ setCloudSt('⚠'); msg('Ouverture impossible : '+(e.message==='format'?'fichier abîmé':e.message)+'.'); }
}
async function cloudDelete(id){
  if(!cloud) return;
  try{
    await cfetch('/storage/v1/object/'+CLOUD.bucket,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefixes:[cPath(id),sPath(id)]})});
    const ix=await cloudGetIndex(); delete ix[id]; await cloudPutIndex(ix); cloudList=ix; delete cloudUp[id]; lsSet('lbx-cloud-up',cloudUp);
    msg('Projet retiré de ton espace en ligne (il reste sur cet appareil s\'il y était).');
  }catch(e){ msg('Suppression en ligne impossible : '+e.message+'.'); }
  updCloudUI();
}
// ----- envoyer un projet à quelqu'un : lien signé (30 jours, sans compte pour celui qui reçoit) ou fichier .loopbox
const SHARE_DAYS=30;
const sPath=id=>cloud.uid+'/share/'+id+'.loopbox';
function appLink(){ return location.origin+location.pathname; }
async function shareLink(){
  if(!tracks.some(t=>t.buf)){ msg('Rien à envoyer : le projet est vide.'); return null; }
  if(!cloud){ await shareFile(); return null; }
  const b=$('#projsend'); b.disabled=true; msg('Préparation du lien…');
  try{
    await saveProj();
    const blob=encodeProject();
    if(blob.size>CLOUD.max) throw new Error('projet trop gros ('+Math.round(blob.size/1048576)+' Mo, 50 Mo maximum)');
    await cfetch('/storage/v1/object/'+CLOUD.bucket+'/'+sPath(projId),{method:'POST',headers:{'Content-Type':'application/octet-stream','x-upsert':'true','cache-control':'no-cache'},body:blob});
    const r=await cfetch('/storage/v1/object/sign/'+CLOUD.bucket+'/'+sPath(projId),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expiresIn:SHARE_DAYS*86400})}), j=await r.json();
    const su=j.signedURL||j.signedUrl; if(!su) throw new Error('lien non reçu');
    const url=appLink()+'?lbx='+encodeURIComponent(su.replace(/^\/storage\/v1/,''));
    $('#sharebox').hidden=false; $('#shareurl').value=url;
    $('#sharehint').textContent='Lien valable '+SHARE_DAYS+' jours (jusqu\'au '+new Date(Date.now()+SHARE_DAYS*86400000).toLocaleDateString('fr-FR')+'). Toute personne qui a ce lien peut ouvrir le projet.';
    const text='Projet LoopBox « '+projName+' » : ouvre ce lien pour l\'ajouter dans ton LoopBox.';
    if(navigator.share){ try{ await navigator.share({title:'LoopBox : '+projName,text,url}); msg('Lien envoyé. Celui qui l\'ouvre retrouve « '+projName+' » avec toutes ses pistes.'); return url; }catch(e){ if(e&&e.name==='AbortError'){ msg('Lien prêt : touche « Copier » pour l\'envoyer toi-même.'); return url; } } }
    msg('Lien prêt : touche « Copier » puis colle-le dans un message.');
    return url;
  }catch(e){ msg('Lien impossible : '+e.message+'.'); return null; }
  finally{ b.disabled=false; }
}
async function shareFile(){
  if(!tracks.some(t=>t.buf)){ msg('Rien à envoyer : le projet est vide.'); return; }
  await saveProj();
  const name=safeName(projName)+'.loopbox', blob=encodeProject();
  let file=null; try{ file=new File([blob],name,{type:'application/octet-stream'}); }catch(e){}
  if(file&&navigator.canShare&&navigator.share){ let can=false; try{ can=navigator.canShare({files:[file]}); }catch(e){}
    if(can){ try{ await navigator.share({files:[file],title:'LoopBox : '+projName,text:'Projet LoopBox : ouvre-le dans LoopBox avec menu projet → « Ouvrir un projet reçu ».'}); msg('Fichier envoyé.'); return; }catch(e){ if(e&&e.name==='AbortError') return; } } }
  downloadBlob(blob,name);
  msg('Fichier « '+name+' » créé dans tes téléchargements : envoie-le (WhatsApp, e-mail…). La personne l\'ouvre dans LoopBox avec menu projet → « Ouvrir un projet reçu ». (Connecte-toi dans « En ligne » pour envoyer un simple lien à la place.)');
}
// à l'ouverture d'un lien reçu : on télécharge, on montre ce que c'est, et on ajoute le projet seulement si la personne le veut
let shareIn=null;
function shareParam(){ try{ const v=new URLSearchParams(location.search).get('lbx'); return v&&/^\/object\/sign\/[^?]+\.loopbox\?token=/.test(v)?v:null; }catch(e){ return null; } }
function shareClearUrl(){ try{ const u=new URL(location.href); u.searchParams.delete('lbx'); history.replaceState(null,'',u.pathname+u.search+u.hash); }catch(e){} }
async function shareReceive(){
  const p=shareParam(); if(!p) return;
  const box=$('#sharein'), info=$('#shareinfo'), go=$('#shareopen'); box.hidden=false; go.disabled=true; info.textContent='Téléchargement du projet partagé…';
  try{
    let r; try{ r=await fetch(CLOUD.url+'/storage/v1'+p,{cache:'no-store'}); }catch(e){ throw new Error('pas de connexion internet'); }
    if(!r.ok) throw new Error(r.status===400||r.status===403||r.status===404?'le lien a expiré ou le projet n\'est plus partagé : demande un nouveau lien':'erreur '+r.status);
    const ab=await r.arrayBuffer(), {meta,audio}=decodeLbx(ab), m=meta.main||{};
    const ntr=(m.tracks||meta.lens||[]).length;
    shareIn={meta,audio};
    info.textContent='« '+(meta.name||'Projet')+' » : '+ntr+' piste'+(ntr>1?'s':'')+', '+(ab.byteLength/1048576).toFixed(1).replace('.',',')+' Mo. Il sera ajouté à tes projets ; ton projet actuel reste enregistré.';
    go.disabled=false;
  }catch(e){ info.textContent='Impossible d\'ouvrir le projet partagé : '+(e.message==='format'?'fichier abîmé':e.message)+'.'; shareClearUrl(); }
}
async function shareAccept(){
  if(!shareIn) return; const {meta,audio}=shareIn; shareIn=null;
  $('#sharein').hidden=true; shareClearUrl();
  try{
    await saveProj(); resetProject();
    projId=newId(); projName=uniqueName(meta.name||'Projet reçu');
    const d=meta.main||{}; d.v=2; applyProject(d,audio);
    audioDirty=true; cloudDirty=false; await saveProj(); updProjUI(); setView('pistes');
    msg('Projet « '+projName+' » ajouté à tes projets, avec toutes ses pistes. Tes changements restent chez toi.');
  }catch(e){ msg('Ouverture impossible.'); }
}
// après chaque enregistrement : envoi automatique (regroupé, 20 s après le dernier changement)
function cloudAfterSave(){
  if(!cloud||!cloudAuto||!projId) return;
  if(!cloudDirty) return;
  if(!tracks.some(t=>t.buf)) return;
  clearTimeout(cloudAutoT); setCloudSt('envoi dans 20 s…'); cloudAutoT=setTimeout(()=>{ cloudAutoT=null; cloudUpload(true); },window.__cloudDelay!=null?window.__cloudDelay:20000);
}
function setCloudSt(s){ const e=$('#cloudst'); if(e) e.textContent=s; updCloudBtn(s); }
function updCloudBtn(s){ const b=$('#cloudbtn'); if(!b) return; const st=s!=null?s:($('#cloudst')?$('#cloudst').textContent:'');
  b.classList.toggle('on',!!cloud&&!/⚠/.test(st)); b.classList.toggle('warn',/⚠/.test(st));
  const k=!cloud?'':/⚠/.test(st)?'⚠':/…/.test(st)?'…':'✓'; if(b.dataset.k!==k||!b.firstChild){ b.dataset.k=k; b.innerHTML=ic('cloud')+(k?'<small>'+k+'</small>':''); }
  b.setAttribute('aria-label',!cloud?'Projets en ligne : se connecter':'Projets en ligne'+(/⚠/.test(st)?' : envoi raté':'')); }
function updCloudUI(){
  const out=$('#cloudout'), inn=$('#cloudin'); if(!out||!inn) return;
  out.hidden=!!cloud; inn.hidden=!cloud;
  updCloudBtn();
  if(!cloud) return;
  $('#cloudwho').textContent='Connecté : '+(cloud.email||'');
  $('#cloudauto').checked=cloudAuto;
  const box=$('#cloudlist'); box.innerHTML='';
  if(!cloudList){ box.textContent='…'; return; }
  const ids=Object.keys(cloudList).sort((a,b)=>(cloudList[b].updated||0)-(cloudList[a].updated||0));
  if(!ids.length){ const p=document.createElement('p'); p.className='hint'; p.textContent='Aucun projet en ligne pour l\'instant : ouvre un projet et touche « Mettre ce projet en ligne ».'; box.appendChild(p); return; }
  ids.forEach(id=>{
    const p=cloudList[id], loc=projIndex.list.find(x=>x.id===id), row=document.createElement('div'); row.className='prow';
    const info=(p.beats?(p.beats+' temps · '+String(p.bpm).replace('.',',')+' BPM · '+p.ntr+' piste'+(p.ntr>1?'s':'')):'vide')+' · '+fmtDate(p.updated)+(p.size?' · '+(p.size/1048576).toFixed(1).replace('.',',')+' Mo':'');
    const newer=loc&&loc.updated>(p.updated||0)+2000&&!(cloudUp[id]>=loc.updated);
    row.innerHTML='<div class="pn"><b></b><small></small></div>';
    $('b',row).innerHTML=ic('cloud',16)+' '; $('b',row).append(p.name); $('small',row).textContent=info+(id===projId?' · ouvert ici':'')+(newer?' · version plus récente sur cet appareil':'');
    const o=document.createElement('button'); o.textContent=id===projId?'Recharger':'Ouvrir';
    o.onclick=()=>{ if((newer||id===projId)&&o.dataset.arm!=='1'){ o.dataset.arm='1'; o.textContent='Remplacer ici ?'; setTimeout(()=>{ o.dataset.arm='0'; o.textContent=id===projId?'Recharger':'Ouvrir'; },3500); return; } setProjMenu(false); cloudOpen(id); };
    row.appendChild(o);
    const del=document.createElement('button'); del.innerHTML=ic('trash'); del.setAttribute('aria-label','Retirer '+p.name+' de l\'espace en ligne');
    del.onclick=()=>{ if(del.dataset.arm!=='1'){ del.dataset.arm='1'; del.textContent='Confirmer ?'; setTimeout(()=>{ del.dataset.arm='0'; del.innerHTML=ic('trash'); },3000); return; } cloudDelete(id); };
    row.appendChild(del); box.appendChild(row);
  });
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
    const del=document.createElement('button'); del.innerHTML=ic('trash'); del.setAttribute('aria-label','Supprimer '+p.name);
    del.onclick=()=>{ if(del.dataset.arm!=='1'){ del.dataset.arm='1'; del.textContent='Confirmer ?'; setTimeout(()=>{ del.dataset.arm='0'; del.innerHTML=ic('trash'); },3000); return; } deleteProject(p.id); };
    row.appendChild(del);
    box.appendChild(row);
  });
}
function updProjUI(){
  $('#projname').textContent=projName;
  if(document.activeElement!==$('#projinp')) $('#projinp').value=projName;
  updProjList();
  updCloudUI();
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
// bandeau de mise à jour : fixe en haut, jamais effacé par les autres messages ; l'appli vérifie aussi quand on y revient
function showUpdate(w){
  let bar=document.getElementById('updbar');
  if(!bar){ bar=document.createElement('div'); bar.id='updbar'; bar.setAttribute('role','alert'); document.body.appendChild(bar); }
  bar.innerHTML='<span>Nouvelle version de LoopBox prête.</span>';
  const b=document.createElement('button'); b.textContent='Mettre à jour'; b.className='primary';
  b.onclick=()=>{ if(recObj){ msg('Termine ton enregistrement avant de mettre à jour.'); return; } b.disabled=true; b.textContent='Mise à jour…'; saveProj().finally(()=>{ w.postMessage('skip'); setTimeout(()=>location.reload(),3000); }); };
  bar.appendChild(b); bar.hidden=false;
}
if('serviceWorker' in navigator&&location.protocol==='https:'){
  const hadCtl=!!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).then(reg=>{
    if(reg.waiting&&hadCtl) showUpdate(reg.waiting);
    reg.addEventListener('updatefound',()=>{ const w=reg.installing; if(!w) return; w.addEventListener('statechange',()=>{ if(w.state==='installed'&&navigator.serviceWorker.controller) showUpdate(w); }); });
    // une appli laissée ouverte (onglet Chrome, appli installée) ne se recharge pas : on vérifie au retour et toutes les 10 min
    const chk=()=>{ if(!recObj) reg.update().catch(()=>{}); };
    document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible') chk(); });
    setInterval(chk,10*60*1000);
  }).catch(()=>{});
  let reloading=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{ if(!hadCtl||reloading) return; reloading=true; location.reload(); });
}
document.querySelectorAll('.mn').forEach(b=>b.onclick=()=>{
  const m=masterTake; if(!m||recObj) return;
  pushHist(); m.nudge=clamp(Math.round(((m.nudge||0)+(+b.dataset.d)/1000)*1000)/1000,-0.3,0.3);
  buildFromSel(); $('#mnv').textContent=fmtMs(m.nudge);
});
$('#undo').onclick=undo; $('#redo').onclick=redo;
function setProjMenu(open){
  const m=$('#projmenu'); m.hidden=!open;
  $('#projbtn').setAttribute('aria-expanded',String(open));
  document.querySelector('.projbar').classList.toggle('open',open);
  if(open) updProjUI();
}
$('#projbtn').onclick=()=>setProjMenu($('#projmenu').hidden);
$('#cloudbtn').onclick=()=>{ setProjMenu(true); const s=$('#cloudsec'); if(s&&s.scrollIntoView) s.scrollIntoView({behavior:'smooth',block:'center'}); if(!cloud){ const m=$('#cloudmail'); if(m) setTimeout(()=>{ try{ m.focus({preventScroll:true}); }catch(e){} },300); } };
// le menu se referme dès qu'on touche ailleurs : il ne recouvre plus les pistes
document.addEventListener('pointerdown',e=>{ if(!$('#projmenu').hidden&&!e.target.closest('.projbar')) setProjMenu(false); },true);
$('#projren').onclick=()=>{ const n=$('#projinp').value.trim(); if(!n) return; projName=n.slice(0,40); updProjUI(); updSongSrc(); scheduleSave(true); msg('Projet renommé : « '+projName+' ».'); };
$('#projsave').onclick=async()=>{ setSaveState('…'); await saveProj(); msg('Projet « '+projName+' » enregistré.'); };
$('#projnew').onclick=()=>{ setProjMenu(false); newProject(); };
$('#projimp').onclick=()=>$('#projfile').click();
$('#cloudlogin').onclick=()=>cloudLogin($('#cloudmail').value.trim(),$('#cloudpw').value,false);
$('#cloudsignup').onclick=()=>cloudLogin($('#cloudmail').value.trim(),$('#cloudpw').value,true);
$('#cloudlogout').onclick=cloudLogout;
$('#cloudupb').onclick=()=>cloudUpload(false);
$('#cloudauto').onchange=e=>{ cloudAuto=e.target.checked; lsSet('lbx-cloud-auto',cloudAuto); if(cloudAuto) cloudAfterSave(); else { clearTimeout(cloudAutoT); setCloudSt(''); } };
updCloudUI(); if(cloud) cloudRefresh();
$('#projsend').onclick=()=>shareLink();
$('#sharecopy').onclick=async()=>{ const i=$('#shareurl'), v=i.value; let ok=false; try{ await navigator.clipboard.writeText(v); ok=true; }catch(e){ try{ i.select(); ok=document.execCommand('copy'); }catch(e2){} } msg(ok?'Lien copié : colle-le dans un message.':'Copie impossible : sélectionne le lien et copie-le à la main.'); };
$('#shareopen').onclick=()=>shareAccept();
$('#shareno').onclick=()=>{ shareIn=null; $('#sharein').hidden=true; shareClearUrl(); msg('Projet partagé ignoré.'); };
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
  if(songPlay){ const sp=songPos(); dtxt='Morceau · mesure '+(Math.floor(sp/meter)+1)+' / '+Math.round(song.end/meter)+' · '+fmtSongTime(sp); }
  if(dtxt!==dockTxt){ dockTxt=dtxt; $('#dtxt').textContent=dtxt; }
  $('#dbar').style.width=(songPlay?clamp(songPos()/song.end,0,1)*100:((running&&!inCount||paused)&&loopLen?pos*100:0))+'%';
  if(songPlay&&(frame.k=(frame.k||0)+1)%2===0) drawSong();
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
loadProj().then(()=>{ requestAnimationFrame(frame); shareReceive(); });
})();
