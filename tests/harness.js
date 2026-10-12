// Banc d'essai : charge l'appli dans un navigateur simulé (jsdom) avec un faux moteur audio,
// un faux micro (AudioWorklet ou ancien ScriptProcessor) et une fausse base IndexedDB.
const {JSDOM}=require('jsdom');
const fs=require('fs');
const path=require('path');
const FI=require('fake-indexeddb');
const ROOT=path.join(__dirname,'..');
const SR=48000;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function pageHtml(){
  let html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
  const css=fs.readFileSync(path.join(ROOT,'style.css'),'utf8');
  const js=fs.readFileSync(path.join(ROOT,'app.js'),'utf8');
  html=html.replace(/<link rel="stylesheet" href="style\.css[^"]*">/,()=>'<style>'+css+'</style>');
  html=html.replace(/<script src="app\.js[^"]*"><\/script>/,()=>'<script>'+js+'</script>');
  return html;
}

// faux serveur Supabase (auth par mot de passe + stockage privé par compte), pour tester les projets en ligne
// décodage des MP3 de la bibliothèque de sons avec ffmpeg (comme le ferait le navigateur)
const {spawnSync}=require('child_process');
function ffDecode(ab){ try{ const r=spawnSync('ffmpeg',['-v','error','-i','pipe:0','-f','f32le','-ac','1','-ar',String(SR),'-'],{input:Buffer.from(ab),maxBuffer:64<<20}); if(r.status!==0||!r.stdout.length) return null; return new Float32Array(r.stdout.buffer.slice(r.stdout.byteOffset,r.stdout.byteOffset+r.stdout.length)); }catch(e){ return null; } }
function fakeCloud(){
  const S={users:{},files:{},tokens:{},n:0,log:[],down:false,ttl:3600};
  const res=(status,body,raw)=>({ok:status<300,status,json:async()=>body,arrayBuffer:async()=>raw});
  S.fetch=async(url,opt={})=>{
    if(S.down) throw new TypeError('Failed to fetch');
    const u=new URL(url), m=(opt.method||'GET').toUpperCase(), H=opt.headers||{}; S.log.push(m+' '+u.pathname+u.search);
    if(!H.apikey) return res(401,{message:'No API key found in request'});
    const body=opt.body==null?null:typeof opt.body==='string'?opt.body:new Uint8Array(await opt.body.arrayBuffer()).buffer;
    const auth=(H.Authorization||'').replace('Bearer ',''), who=S.tokens[auth];
    const sess=uid=>{ const at='at'+(++S.n), rt='rt'+S.n; S.tokens[at]={uid,exp:Date.now()+S.ttl*1000}; S.tokens[rt]={uid,refresh:true}; return {access_token:at,refresh_token:rt,expires_in:S.ttl,user:{id:uid,email:S.users[uid].email}}; };
    if(u.pathname==='/auth/v1/signup'){ const j=JSON.parse(body); if(Object.values(S.users).some(x=>x.email===j.email)) return res(422,{msg:'User already registered'}); if((j.password||'').length<6) return res(422,{msg:'Password should be at least 6 characters'}); const id='u'+(++S.n); S.users[id]={email:j.email,pw:j.password,ok:!S.confirm}; return res(200,S.confirm?{id,email:j.email}:sess(id)); }
    if(u.pathname==='/auth/v1/token'){ const j=JSON.parse(body);
      if(u.searchParams.get('grant_type')==='password'){ const id=Object.keys(S.users).find(k=>S.users[k].email===j.email&&S.users[k].pw===j.password); if(!id) return res(400,{error:'invalid_grant',error_description:'Invalid login credentials'}); if(!S.users[id].ok) return res(400,{error_description:'Email not confirmed'}); return res(200,sess(id)); }
      const t=S.tokens[j.refresh_token]; if(!t||!t.refresh) return res(400,{error:'invalid_grant',error_description:'Invalid Refresh Token'}); delete S.tokens[j.refresh_token]; S.refreshed=(S.refreshed||0)+1; return res(200,sess(t.uid)); }
    const sm=u.pathname.match(/^\/storage\/v1\/object\/(authenticated\/)?([^/]+)\/?(.*)$/);
    if(sm){ if(!who||who.refresh||who.exp<Date.now()) return res(400,{statusCode:'403',error:'Unauthorized',message:'invalid JWT'});
      const path=decodeURIComponent(sm[3]), mine=p=>p.split('/')[0]===who.uid;
      if(m==='DELETE'){ JSON.parse(body).prefixes.forEach(p=>{ if(mine(p)) delete S.files[sm[2]+'/'+p]; }); return res(200,[]); }
      if(!mine(path)) return res(400,{statusCode:'403',error:'Unauthorized',message:'new row violates row-level security policy'});
      const key=sm[2]+'/'+path;
      if(m==='POST'){ if(body.byteLength>50*1024*1024) return res(413,{message:'The object exceeded the maximum allowed size'}); if(S.files[key]&&H['x-upsert']!=='true') return res(400,{message:'The resource already exists'}); S.files[key]=typeof body==='string'?new TextEncoder().encode(body).buffer:body; return res(200,{Key:key}); }
      if(m==='GET'){ const f=S.files[key]; if(!f) return res(400,{statusCode:'404',error:'not_found',message:'Object not found'}); return {ok:true,status:200,json:async()=>JSON.parse(new TextDecoder().decode(f)),arrayBuffer:async()=>f.slice(0)}; } }
    return res(404,{message:'unknown route'});
  };
  return S;
}

async function boot(opt={}){
  const engine=opt.engine||'worklet';
  const idb=opt.idb||new FI.IDBFactory();
  const P={defaultMic:'Micro intégré',devs:[{kind:'audioinput',deviceId:'default',label:'Par défaut'},{kind:'audioinput',deviceId:'int1',label:'Micro intégré'},{kind:'audioinput',deviceId:'usb1',label:'Micro USB'},{kind:'audiooutput',deviceId:'o1',label:'Haut-parleur'}],gum:[],errs:[],buffers:[],starts:[],blobs:[],k:0,impulses:[],noise:0,amp:0.8,ctx:null,proc:null,wnode:null,idb};
  const mk=()=>new Proxy(function(){},{get:(t,p)=>{ if(p==='value') return t._v??0; return t[p]??(t[p]=mk()); },set:(t,p,v)=>{ t[p]=v; return true; },apply:()=>mk()});
  const dom=new JSDOM(pageHtml(),{...(opt.cloud?{url:'https://loopbox.test/'}:{}),runScripts:'dangerously',pretendToBeVisual:true,beforeParse(w){
    class AC{ constructor(){ this.sampleRate=SR; this.currentTime=0; this.destination=mk(); P.ctx=this; }
      resume(){ return Promise.resolve(); }
      createBuffer(c,l,sr){ const d=new Float32Array(l); const b={length:l,duration:l/sr,sampleRate:sr,numberOfChannels:1,getChannelData:()=>d,copyToChannel:a=>d.set(a)}; P.buffers.push(b); return b; } }
    for(const m of ['createGain','createBiquadFilter','createDynamicsCompressor','createAnalyser','createStereoPanner','createOscillator','createMediaStreamSource','createDelay','createConvolver','createWaveShaper']) AC.prototype[m]=function(){ const o=mk(); o.getFloatTimeDomainData=()=>{}; return o; };
    AC.prototype.createBufferSource=function(){ return {buffer:null,loop:false,connect(){},disconnect(){},stop(){},start(when,off){ P.starts.push({when,off:off||0,buf:this.buffer}); }}; };
    AC.prototype.createScriptProcessor=function(){ P.proc={connect(){},onaudioprocess:null}; return P.proc; };
    AC.prototype.decodeAudioData=function(ab){ if(P.nextDecode) return Promise.resolve(P.nextDecode); const d=ffDecode(ab); return d?Promise.resolve({length:d.length,sampleRate:SR,numberOfChannels:1,duration:d.length/SR,getChannelData:()=>d}):Promise.reject(new Error('illisible')); };
    if(engine==='worklet'){ AC.prototype.audioWorklet={addModule:async()=>{}}; w.AudioWorkletNode=class{ constructor(c,name){ this.port={onmessage:null}; P.wnames=(P.wnames||[]).concat(name); if(name!=='lb-lim') P.wnode=this; } connect(){} disconnect(){} }; }
    w.AudioContext=AC;
    w.OfflineAudioContext=class{ constructor(c,l,sr){ this.length=l; this.sampleRate=sr; this.destination={}; }
      createBuffer(c,l,sr){ return {length:l,sampleRate:sr}; }
      startRendering(){ const d=new Float32Array(this.length); for(let i=0;i<this.length;i+=4800) d[i]=0.5; return Promise.resolve({length:this.length,sampleRate:this.sampleRate,numberOfChannels:1,getChannelData:()=>d}); } };
    for(const m of ['createGain','createBiquadFilter','createDynamicsCompressor','createBufferSource','createStereoPanner','createDelay','createConvolver','createWaveShaper','createOscillator']) w.OfflineAudioContext.prototype[m]=function(){ return mk(); };
    if(opt.share){ w.navigator.canShare=()=>true; w.navigator.share=async d=>{ P.shared=d; }; }
    w.indexedDB=idb;
    w.fetch=async(url,o2)=>{ if(/^sounds\//.test(url)){ P.soundReqs=(P.soundReqs||[]).concat(url); if(P.offline) throw new TypeError('Failed to fetch'); const f=path.join(ROOT,url); if(!fs.existsSync(f)) return {ok:false,status:404,json:async()=>({})}; const txt=fs.readFileSync(f,'utf8'); return {ok:true,status:200,json:async()=>JSON.parse(txt)}; } if(opt.cloud) return opt.cloud.fetch(url,o2); throw new TypeError('Failed to fetch'); };
    if(opt.cloud){ w.__cloudDelay=opt.cloudDelay!=null?opt.cloudDelay:30; }
    w.navigator.mediaDevices={
      getUserMedia:c=>{ P.gum.push(c); const lab=(c&&c.audio&&c.audio.deviceId)?((P.devs.find(d=>d.deviceId===c.audio.deviceId.exact)||{}).label||'?'):P.defaultMic; return Promise.resolve({getTracks:()=>[{stop(){}}],getAudioTracks:()=>[{label:lab,stop(){}}]}); },
      enumerateDevices:async()=>P.devs.slice()
    };
    w.HTMLCanvasElement.prototype.getContext=()=>({clearRect(){},fillRect(){},set fillStyle(v){}});
    w.URL.createObjectURL=b=>{ P.blobs.push(b); return 'blob:'+P.blobs.length; }; w.URL.revokeObjectURL=()=>{};
    w.HTMLAnchorElement.prototype.click=function(){ P.download=this.download; };
    w.addEventListener('error',e=>P.errs.push(String(e.message)));
  }});
  P.dom=dom; P.w=dom.window; P.doc=dom.window.document; P.$=s=>P.doc.querySelector(s); P.$$=s=>[...P.doc.querySelectorAll(s)];
  // un pas de temps : un bloc de micro de 2048 échantillons
  P.step=()=>{
    const L=engine==='worklet'?2048:1024, k=P.k;
    P.ctx.currentTime=(k+1)*L/SR;
    const blk=new Float32Array(L);
    for(const n of P.impulses) if(n>=k*L&&n<(k+1)*L) blk[n-k*L]=P.amp;
    if(P.noise) for(let i=0;i<L;i++) blk[i]+=P.noise*(Math.random()*2-1);
    if(engine==='worklet'){ if(P.wnode&&P.wnode.port.onmessage) P.wnode.port.onmessage({data:{s:k*L,d:blk}}); }
    else if(P.proc&&P.proc.onaudioprocess) P.proc.onaudioprocess({inputBuffer:{getChannelData:()=>blk}});
    P.k++;
  };
  P.runUntil=async(T,events=[])=>{ while(P.ctx.currentTime<T){ P.step(); for(const e of events.filter(e=>!e.done&&P.ctx.currentTime>=e.t)){ e.done=true; e.fn(); await sleep(5); } } };
  P.rec=i=>P.$$('.trk .rec')[i];
  P.hits=b=>{ const d=b.getChannelData(0), h=[]; let prev=-1e9; for(let i=0;i<d.length;i++) if(Math.abs(d[i])>0.4&&i-prev>2000){ h.push(i); prev=i; } return h; };
  P.lastBuf=()=>P.buffers[P.buffers.length-1];
  P.lastPlayed=()=>{ const s=P.starts.filter(x=>x.buf); return s.length?s[s.length-1].buf:null; };
  P.importFile=async(trackIndex,decoded)=>{ P.nextDecode=decoded; const inp=P.$$('.impfile')[trackIndex]; Object.defineProperty(inp,'files',{value:[{size:100,name:'son.wav',arrayBuffer:async()=>new ArrayBuffer(8)}],configurable:true}); inp.dispatchEvent(new P.w.Event('change')); await sleep(300); };
  P.click=(el,x)=>el.dispatchEvent(new P.w.MouseEvent('click',{clientX:x||0,bubbles:true}));
  await sleep(250);
  return P;
}
// prise de base de 8 temps à 96 BPM (curseur à 90), 16 coups en croches, avec 100 ms de latence simulée
async function recordBase(P){
  P.rec(0).click(); await sleep(50); P.step(); P.step();
  const bd=60/90, T=60/96, tp=0.12+4*bd, lat=0.1, first=0.4;
  P.impulses=[]; for(let i=0;i<16;i++) P.impulses.push(Math.round((tp+lat+first+i*T/2)*SR));
  const stopAt=tp+first+8*T+0.3;
  await P.runUntil(stopAt,[{t:stopAt,fn:()=>P.rec(0).click()}]);
  await P.runUntil(stopAt+1.5);
  return {T,tp,lat,first,buf:P.lastBuf()};
}
const tone=(f,sec,amp=0.5)=>{ const n=Math.round(SR*sec), d=new Float32Array(n); for(let i=0;i<n;i++) d[i]=amp*Math.sin(2*Math.PI*f*i/SR); return {numberOfChannels:1,length:n,sampleRate:SR,duration:n/SR,getChannelData:()=>d}; };
const freqOf=b=>{ const x=b.getChannelData(0); let zc=0; const a=Math.floor(x.length*0.2), z=Math.floor(x.length*0.8); for(let i=a+1;i<z;i++) if(x[i-1]<=0&&x[i]>0) zc++; return zc/((z-a)/SR); };
module.exports={boot,recordBase,tone,freqOf,sleep,SR,FI,fakeCloud};
