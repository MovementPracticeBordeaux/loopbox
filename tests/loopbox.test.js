// Tests automatiques de LoopBox. Lancer : npm install puis npm test
const {boot,recordBase,tone,freqOf,sleep,SR,FI}=require('./harness');
const results=[];
const near=(a,b,tol)=>Math.abs(a-b)<=tol;
async function test(name,fn){
  const t0=Date.now();
  try{ await fn(); results.push([true,name,Date.now()-t0]); }
  catch(e){ results.push([false,name,Date.now()-t0,e.message]); }
}
function ok(cond,msg){ if(!cond) throw new Error(msg); }

(async()=>{
  for(const engine of ['worklet','scriptprocessor']){
    await test(`[${engine}] prise de base : boucle calée sur le jeu (8 temps, départ sur le 1er son)`,async()=>{
      const P=await boot({engine}); const r=await recordBase(P); const h=P.hits(r.buf);
      ok(near(r.buf.length,Math.round(8*r.T*SR),SR*0.01),'longueur '+r.buf.length);
      ok(h.length===16,'coups '+h.length);
      ok(near(h[0],144,40),'premier coup à '+h[0]);
      ok(P.errs.length===0,'erreurs : '+P.errs.join(';'));
    });
  }
  await test('prise sur une 2e piste : chaque son retombe à sa place dans la boucle',async()=>{
    const P=await boot(); const r=await recordBase(P);
    P.$('#addtrk').click(); await sleep(10);
    const L=r.buf.length/SR, t0e=r.tp+r.first-0.003, cur=P.ctx.currentTime;
    const tgt0=t0e+Math.ceil((cur+1.2-t0e)/L)*L+0.003, press=tgt0-0.3;
    P.impulses=[]; for(let k=0;k<8;k++) P.impulses.push(Math.round((tgt0+k*r.T+r.lat)*SR));
    await P.runUntil(press,[{t:press,fn:()=>P.rec(1).click()}]); await P.runUntil(press+L+1.2);
    const h=P.hits(P.lastBuf());
    ok(h.length===8,'coups '+h.length);
    h.forEach((x,k)=>ok(near(x,144+Math.round(k*r.T*SR),60),'coup '+k+' à '+x));
  });
  await test('durée de la boucle ×3 puis ×1, et annulation',async()=>{
    const P=await boot(); const r=await recordBase(P);
    P.$('#growb button[data-k="3"]').click(); await sleep(20);
    ok(P.lastBuf().length===3*r.buf.length,'×3 longueur');
    P.$('#growb button[data-k="1"]').click(); await sleep(20);
    ok(P.lastBuf().length===r.buf.length,'×1 longueur');
    P.$('#undo').click(); await sleep(20);
    ok(/×3/.test(P.$('#growlbl').textContent),'annulation → ×3 : '+P.$('#growlbl').textContent);
  });
  await test('annuler / rétablir une prise et « Tout effacer »',async()=>{
    const P=await boot(); await recordBase(P);
    const has=()=>P.$('#lockhint').style.display!=='none';
    P.$('#undo').click(); await sleep(20); ok(!has(),'après annulation la boucle doit disparaître');
    P.$('#redo').click(); await sleep(20); ok(has(),'après rétablissement la boucle doit revenir');
    const ca=P.$('#clearAll'); ca.click(); ca.click(); await sleep(20); ok(!has(),'tout effacé');
    P.$('#undo').click(); await sleep(20); ok(has(),'annuler « Tout effacer »');
  });
  await test('garder la partie propre d\'une piste sans toucher à la piste de base',async()=>{
    const P=await boot(); const r=await recordBase(P);
    P.$('#addtrk').click(); await sleep(10);
    const L=r.buf.length/SR, t0e=r.tp+r.first-0.003, cur=P.ctx.currentTime;
    const tgt0=t0e+Math.ceil((cur+1.2-t0e)/L)*L+0.003, press=tgt0-0.3;
    P.impulses=[]; for(let k=0;k<8;k++) P.impulses.push(Math.round((tgt0+k*r.T+r.lat)*SR));
    await P.runUntil(press,[{t:press,fn:()=>P.rec(1).click()}]); await P.runUntil(press+L+1.2);
    const t2=P.$$('.trk')[1]; t2.querySelector('.tog').click();
    ['.ts2','.ts2','.ts3','.ts3'].forEach(c=>t2.querySelector(c).click()); await sleep(30);
    ok(P.hits(P.lastPlayed()).length===4,'coups joués '+P.hits(P.lastPlayed()).length);
    ok(P.hits(r.buf).length===16,'piste de base modifiée');
  });
  await test('hauteur du son : une octave plus haut sans changer la durée',async()=>{
    const P=await boot(); await P.importFile(0,tone(220,2));
    const t=P.$('.trk'); t.querySelector('.tog').click();
    const sl=t.querySelector('.pitch'); sl.value=12; sl.dispatchEvent(new P.w.Event('change')); await sleep(900);
    const b=P.lastPlayed(); ok(near(freqOf(b),440,3),'fréquence '+freqOf(b)); ok(b.length===2*SR,'longueur '+b.length);
  });
  await test('pause puis reprise au même endroit, stop = retour au début',async()=>{
    const P=await boot(); const r=await recordBase(P); await sleep(80);
    const L=r.buf.length/SR;
    P.$('#dpause').click(); await sleep(60);
    const pct=parseFloat(P.$('.trk .ph').style.left);
    P.starts.length=0; P.$('#dplay').click(); await sleep(60);
    const off=P.starts.filter(x=>x.buf).slice(-1)[0].off;
    ok(near(off,pct/100*L-0.04,0.05),'reprise à '+off.toFixed(2)+' au lieu de '+(pct/100*L).toFixed(2));
    P.$('#dstop').click(); await sleep(40); P.starts.length=0; P.$('#dplay').click(); await sleep(40);
    ok(near(P.starts.filter(x=>x.buf).slice(-1)[0].off,0,0.01),'après stop, départ non nul');
  });
  await test('import d\'un fichier sur la 1re piste : tempo du fichier détecté',async()=>{
    const P=await boot(); const T=60/110, lead=Math.round(0.3*SR), half=Math.round(T/2*SR);
    const len=lead+8*Math.round(T*SR)+Math.round(0.2*SR), d=new Float32Array(len);
    for(let i=0;i<16;i++) d[lead+i*half]=0.8;
    await P.importFile(0,{numberOfChannels:1,length:len,sampleRate:SR,duration:len/SR,getChannelData:()=>d});
    ok(/8 temps à 1(09|10)/.test(P.$('#msg').textContent),'message : '+P.$('#msg').textContent);
  });
  await test('projets : renommer, nouveau, rouvrir, fichier .loopbox aller-retour',async()=>{
    const idb=new FI.IDBFactory();
    const P=await boot({idb}); await P.importFile(0,tone(220,2));
    P.$('#projbtn').click(); P.$('#projinp').value='Démo'; P.$('#projren').click(); await sleep(800);
    P.$('#projnew').click(); await sleep(400);
    ok(P.$('#projname').textContent!=='Démo','nouveau projet non créé');
    const row=P.$$('#projlist .prow').find(r=>r.querySelector('b').textContent==='Démo'); row.querySelector('button').click(); await sleep(500);
    ok(P.$('#projname').textContent==='Démo','projet non rouvert');
    P.$('#projexp').click(); await sleep(30);
    const ab=await P.blobs[P.blobs.length-1].arrayBuffer();
    const fi=P.$('#projfile'); Object.defineProperty(fi,'files',{value:[{size:ab.byteLength,name:'Démo.loopbox',arrayBuffer:async()=>ab}],configurable:true}); fi.dispatchEvent(new P.w.Event('change')); await sleep(600);
    ok(/Démo/.test(P.$('#projname').textContent)&&P.$('#lockhint').style.display!=='none','fichier non rouvert');
    const Q=await boot({idb}); await sleep(300);
    ok(Q.$$('#projlist .prow').length===3,'projets après rechargement : '+Q.$$('#projlist .prow').length);
  });
  const okN=results.filter(r=>r[0]).length;
  for(const [pass,name,ms,err] of results) console.log((pass?'✔':'✘')+' '+name+'  ('+ms+' ms)'+(err?'\n    → '+err:''));
  console.log('\n'+okN+' / '+results.length+' tests réussis');
  process.exit(okN===results.length?0:1);
})();
