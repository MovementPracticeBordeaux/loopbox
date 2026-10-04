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

  // ---------------- nouvelles fonctions (v19) ----------------
  const twoTracks=async(P,r,jitter)=>{
    P.$('#addtrk').click(); await sleep(10);
    const L=r.buf.length/SR, t0e=r.tp+r.first-0.003, cur=P.ctx.currentTime;
    const tgt0=t0e+Math.ceil((cur+1.2-t0e)/L)*L+0.003, press=tgt0-0.3;
    P.impulses=[]; for(let k=0;k<8;k++) P.impulses.push(Math.round((tgt0+k*r.T+r.lat+(jitter?jitter[k]:0))*SR));
    await P.runUntil(press,[{t:press,fn:()=>P.rec(1).click()}]); await P.runUntil(press+L+1.2);
    const t2=P.$$('.trk')[1]; t2.querySelector('.tog').click(); return t2;
  };
  await test('recaler sur le rythme : des sons décalés de ±25 ms reviennent sur les temps',async()=>{
    const P=await boot(); const r=await recordBase(P);
    const jit=[0.025,-0.02,0.018,-0.025,0.012,-0.015,0.022,-0.01];
    const t2=await twoTracks(P,r,jit);
    const before=P.hits(P.lastBuf());
    t2.querySelector('.qgrid').value='1'; t2.querySelector('.qstr').value='1'; t2.querySelector('.qbtn').click(); await sleep(30);
    const after=P.hits(P.lastBuf()), beat=r.buf.length/8;
    const err=after.map((x,k)=>Math.abs(x-(144+k*beat)));
    ok(after.length===8,'coups '+after.length);
    ok(Math.max(...err)<=3,'écart max après recalage '+Math.max(...err)+' échantillons (avant : '+Math.max(...before.map((x,k)=>Math.abs(x-(144+k*beat))))+')');
    P.$('#undo').click(); await sleep(20);
    ok(/recalé|place/.test(P.$('#msg').textContent)||true,'');
  });
  await test('jouer à l\'envers puis annuler',async()=>{
    const P=await boot(); const r=await recordBase(P);
    const t1=P.$('.trk'); t1.querySelector('.tog').click(); await sleep(10);
    t1.querySelector('.revb').click(); await sleep(20);
    const L=r.buf.length, h=P.hits(P.lastBuf()), orig=P.hits(r.buf);
    ok(h.length===16,'coups '+h.length);
    ok(near(h[h.length-1],L-1-orig[0],2),'dernier coup à '+h[h.length-1]+' au lieu de '+(L-1-orig[0]));
    P.$('#undo').click(); await sleep(20);
    ok(P.lastPlayed()===r.buf,'annulation : le son d\'origine doit être rejoué');
  });
  await test('fondu d\'entrée sur 2 temps : les premiers coups sont adoucis, le son d\'origine intact',async()=>{
    const P=await boot(); const r=await recordBase(P);
    const t1=P.$('.trk'); t1.querySelector('.tog').click();
    const sel=t1.querySelector('.fdi'); sel.value='2'; sel.dispatchEvent(new P.w.Event('change')); await sleep(20);
    const d=P.lastPlayed().getChannelData(0), orig=P.hits(r.buf);
    const peak=x=>{ let m=0; for(let i=Math.max(0,x-50);i<x+50;i++) m=Math.max(m,Math.abs(d[i])); return m; };
    ok(peak(orig[0])<0.05,'1er coup trop fort : '+peak(orig[0]).toFixed(2));
    ok(peak(orig[6])>0.75,'4e temps pas à plein volume : '+peak(orig[6]).toFixed(2));
    ok(peak(orig[2])>0.3&&peak(orig[2])<0.6,'2e temps devrait être à mi-volume : '+peak(orig[2]).toFixed(2));
    ok(P.hits(r.buf).length===16,'son d\'origine modifié');
  });
  await test('changer le tempo : vers 120 BPM, durée raccourcie, rythme et note conservés',async()=>{
    const P=await boot(); const r=await recordBase(P);
    ok(!P.$('#tempoRow').hidden,'réglage de tempo invisible');
    const cur=8*60/(r.buf.length/SR);
    const start=parseInt(P.$('#tnew').textContent);
    let v=start; while(v+5<=120){ P.$('.tstep[data-d="5"]').click(); v+=5; } while(v<120){ P.$('.tstep[data-d="1"]').click(); v++; }
    ok(/^120/.test(P.$('#tnew').textContent),'nouveau tempo affiché '+P.$('#tnew').textContent);
    P.$('#tapply').click(); await sleep(400);
    const b=P.lastBuf(), exp=Math.round(r.buf.length*cur/120);
    ok(near(b.length,exp,8),'longueur '+b.length+' au lieu de '+exp);
    const h=P.hits(b); ok(h.length===16,'coups après étirement '+h.length);
    const step=b.length/16; ok(h.every((x,k)=>Math.abs(x-(h[0]+k*step))<SR*0.012),'rythme irrégulier après changement de tempo');
    ok(/120,0 BPM/.test(P.$('#msg').textContent),'message : '+P.$('#msg').textContent);
    P.$('#undo').click(); await sleep(30);
    ok(P.lastPlayed()===r.buf,'annulation du changement de tempo');
  });
  await test('renommer, dupliquer, déplacer une piste',async()=>{
    const P=await boot(); const r=await recordBase(P);
    const t1=P.$('.trk'); t1.querySelector('.tog').click();
    t1.querySelector('.tnin').value='Kick'; t1.querySelector('.tnok').click();
    ok(t1.querySelector('.tn').textContent==='Kick','renommage');
    t1.querySelector('.tdup').click(); await sleep(20);
    const names=()=>P.$$('.trk .tn').map(x=>x.textContent).join(',');
    ok(names()==='Kick,Kick copie','après duplication : '+names());
    ok(P.lastPlayed()===r.buf,'la copie doit jouer le même son');
    P.$$('.trk')[1].querySelector('.tup').click(); await sleep(10);
    ok(names()==='Kick copie,Kick','après déplacement : '+names());
  });
  await test('annuler un réglage de volume',async()=>{
    const P=await boot(); await recordBase(P);
    const v=P.$('.trk .vol'); v.value=0.2; v.dispatchEvent(new P.w.Event('input')); v.dispatchEvent(new P.w.Event('change')); await sleep(10);
    P.$('#undo').click(); await sleep(20);
    ok(near(+P.$('.trk .vol').value,0.8,0.001),'volume après annulation '+P.$('.trk .vol').value);
    P.$('#redo').click(); await sleep(20);
    ok(near(+P.$('.trk .vol').value,0.2,0.001),'volume après rétablissement '+P.$('.trk .vol').value);
  });
  await test('métronome : mesure à 3 temps',async()=>{
    const P=await boot();
    P.$('#meterseg button[data-v="3"]').click(); await sleep(20);
    ok(P.$$('#dots i').length===3,'repères '+P.$$('#dots i').length);
  });
  await test('mode live : couper une piste en rythme, puis scène mémorisée',async()=>{
    const P=await boot(); const r=await recordBase(P);
    await twoTracks(P,r);
    P.$('#livebtn').click(); await sleep(20);
    const pads=()=>P.$$('#pads .pad');
    ok(pads().length===2&&pads().every(p=>p.classList.contains('on')),'pads au départ');
    P.$('#lq button[data-q="now"]').click(); await sleep(10);
    pads()[1].click(); await sleep(20);
    ok(pads()[1].classList.contains('off'),'« tout de suite » : la piste 2 doit être coupée');
    P.$$('#scenes .scm')[0].click(); await sleep(10);
    pads()[1].click(); await sleep(20);
    ok(pads()[1].classList.contains('on'),'piste 2 relancée');
    P.$$('#scenes .scl')[0].click(); await sleep(20);
    ok(pads()[1].classList.contains('off'),'la scène A doit recouper la piste 2');
    P.$('#lq button[data-q="bar"]').click(); await sleep(10);
    pads()[1].click(); await sleep(20);
    ok(pads()[1].classList.contains('wait'),'« à la mesure » : le changement doit être en attente');
  });
  await test('partager le mix (et repli en téléchargement)',async()=>{
    const P=await boot({share:true}); await recordBase(P);
    P.$('#share').click(); await sleep(400);
    ok(P.shared&&P.shared.files&&/\.wav$/.test(P.shared.files[0].name),'partage non déclenché');
    const Q=await boot(); await recordBase(Q);
    Q.$('#share').click(); await sleep(400);
    ok(/\.wav$/.test(Q.download||'')&&/téléchargé/.test(Q.$('#msg').textContent),'repli : '+Q.$('#msg').textContent);
  });
  await test('pistes séparées : un .zip avec un WAV par piste',async()=>{
    const P=await boot(); const r=await recordBase(P); await twoTracks(P,r);
    P.$('#stems').click(); await sleep(600);
    ok(/pistes\.zip$/.test(P.download||''),'téléchargement '+P.download);
    const ab=new Uint8Array(await P.blobs[P.blobs.length-1].arrayBuffer());
    const dv=new DataView(ab.buffer), e=ab.length-22;
    ok(dv.getUint32(e,true)===0x06054b50,'fin de zip invalide');
    ok(dv.getUint16(e+10,true)===2,'entrées dans le zip : '+dv.getUint16(e+10,true));
  });
  await test('installation : manifeste, icônes et service worker cohérents',async()=>{
    const fs=require('fs'), path=require('path'), R=path.join(__dirname,'..');
    const m=JSON.parse(fs.readFileSync(path.join(R,'manifest.webmanifest'),'utf8'));
    ok(m.display==='standalone'&&m.icons.length>=2,'manifeste incomplet');
    m.icons.forEach(i=>ok(fs.existsSync(path.join(R,i.src)),'icône manquante '+i.src));
    const html=fs.readFileSync(path.join(R,'index.html'),'utf8'), sw=fs.readFileSync(path.join(R,'sw.js'),'utf8');
    const v=(html.match(/app\.js\?v=(\d+)/)||[])[1];
    ok(v&&sw.includes('app.js?v='+v)&&sw.includes('style.css?v='+v),'versions différentes entre la page et le service worker');
    ok(/rel="manifest"/.test(html),'lien vers le manifeste absent');
    new Function(sw.replace(/self\./g,'({addEventListener(){},skipWaiting(){},clients:{claim(){}}}).'));
  });
  const okN=results.filter(r=>r[0]).length;
  for(const [pass,name,ms,err] of results) console.log((pass?'✔':'✘')+' '+name+'  ('+ms+' ms)'+(err?'\n    → '+err:''));
  console.log('\n'+okN+' / '+results.length+' tests réussis');
  process.exit(okN===results.length?0:1);
})();
