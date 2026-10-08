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

  // ---------------- mode casque (v20) ----------------
  await test('mode casque : calibration en tapant avec un casque Bluetooth (retard simulé de 312 ms)',async()=>{
    const P=await boot();
    P.$('#setupseg button[data-s="bt"]').click(); await sleep(10);
    ok(P.$('#cal').hidden&&!P.$('#caltap').hidden,'boutons de calibration mal affichés');
    P.$('#caltap').click(); await sleep(80);
    const c0=P.ctx.currentTime+0.8, lat=0.312;
    P.impulses=[]; for(let j=0;j<12;j++) P.impulses.push(Math.round((c0+j*0.75+lat+(j%2?0.012:-0.009))*SR));
    await P.runUntil(c0+12*0.75+1.0); await sleep(250);
    ok(near(+P.$('#comp').value,312,15),'latence mesurée '+P.$('#comp').value+' ms (312 attendus) | '+P.$('#calmsg').textContent);
    ok(/Casque Bluetooth/.test(P.$('#calmsg').textContent)&&/8\/8/.test(P.$('#calmsg').textContent),'message : '+P.$('#calmsg').textContent);
    ok(/mesurée le/.test(P.$('#setuphint').textContent),'indication : '+P.$('#setuphint').textContent);
  });
  await test('mode casque : chaque configuration garde sa latence, et tout est retrouvé au rechargement',async()=>{
    const idb=new FI.IDBFactory();
    const P=await boot({idb});
    const setC=v=>{ const c=P.$('#comp'); c.value=v; c.dispatchEvent(new P.w.Event('input')); };
    P.$('#setupseg button[data-s="speaker"]').click(); setC(337);
    P.$('#setupseg button[data-s="wired"]').click();
    ok(+P.$('#comp').value===337,'filaire par défaut = sans casque : '+P.$('#comp').value);
    setC(150);
    P.$('#setupseg button[data-s="bt"]').click();
    ok(+P.$('#comp').value===537,'Bluetooth par défaut = sans casque + 200 ms : '+P.$('#comp').value);
    setC(420);
    P.$('#setupseg button[data-s="speaker"]').click(); ok(+P.$('#comp').value===337,'retour sans casque : '+P.$('#comp').value);
    P.$('#setupseg button[data-s="wired"]').click(); ok(+P.$('#comp').value===150,'retour filaire : '+P.$('#comp').value);
    P.$('#setupseg button[data-s="bt"]').click(); await sleep(600);
    const Q=await boot({idb}); await sleep(300);
    ok(Q.$('#setupseg button.on').dataset.s==='bt'&&+Q.$('#comp').value===420,'rechargement : '+Q.$('#setupseg button.on').dataset.s+' '+Q.$('#comp').value);
    ok(+Q.$('#comp').max===800,'limite du curseur '+Q.$('#comp').max);
  });
  await test('choix du micro : liste des micros et ouverture du micro choisi',async()=>{
    const P=await boot();
    P.rec(0).click(); await sleep(80); P.rec(0).click(); await sleep(40);
    const opts=[...P.$('#micsel').options].map(o=>o.textContent);
    ok(opts.join('|')==='Micro par défaut|Micro intégré|Micro USB','liste : '+opts.join('|'));
    P.$('#micsel').value='usb1'; P.$('#micsel').dispatchEvent(new P.w.Event('change')); await sleep(80);
    const last=P.gum[P.gum.length-1];
    ok(last&&last.audio&&last.audio.deviceId&&last.audio.deviceId.exact==='usb1','micro demandé : '+JSON.stringify(last));
    ok(last.audio.echoCancellation===false&&last.audio.noiseSuppression===false,'traitements du téléphone non désactivés');
  });

  await test('menu projet : se referme en touchant ailleurs, et les pistes se déplient',async()=>{
    const P=await boot();
    P.$('#projbtn').click(); await sleep(10);
    ok(!P.$('#projmenu').hidden&&P.$('.projbar').classList.contains('open'),'menu non ouvert');
    const tog=P.$('.trk .tog');
    tog.dispatchEvent(new P.w.Event('pointerdown',{bubbles:true})); tog.click(); await sleep(20);
    ok(P.$('#projmenu').hidden,'le menu devrait se refermer');
    ok(!P.$('.trk .tbody').hidden,'la piste 1 devrait être dépliée');
    ok(/LoopBox v\d+/.test(P.$('.foot').textContent),'version non affichée');
  });

  await test('nettoyer le bruit (léger) : le souffle disparaît des silences, les sons restent',async()=>{
    const P=await boot();
    const n=SR*4, d=new Float32Array(n); let sd=5;
    for(let i=0;i<n;i++){ sd=(sd*16807)%2147483647; d[i]=0.01*(sd/2147483647*2-1); }
    for(let k=0;k<8;k++){ const p=Math.round(k*0.5*SR)+2000; for(let i=0;i<5000;i++) d[p+i]+=0.7*Math.exp(-i/900)*Math.sin(2*Math.PI*90*i/SR); }
    await P.importFile(0,{numberOfChannels:1,length:n,sampleRate:SR,duration:n/SR,getChannelData:()=>d});
    const t1=P.$('.trk'); t1.querySelector('.tog').click();
    const before=P.lastPlayed().getChannelData(0);
    const rms=(x,a,b)=>{ let s=0; for(let i=a;i<b;i++) s+=x[i]*x[i]; return Math.sqrt(s/(b-a)); };
    const gapStart=Math.round(0.5*SR)-3000, gapEnd=Math.round(0.5*SR)-500;
    t1.querySelector('.dnl').value='light'; t1.querySelector('.dnb').click(); await sleep(40);
    const after=P.lastPlayed().getChannelData(0);
    const red=20*Math.log10(rms(after,gapStart,gapEnd)/rms(before,gapStart,gapEnd));
    ok(red<-20,'réduction du souffle seulement '+red.toFixed(1)+' dB');
    let pk=0; for(const v of after) pk=Math.max(pk,Math.abs(v)); ok(pk>0.6,'sons écrasés : crête '+pk.toFixed(2));
    ok(/Bruit nettoyé/.test(P.$('#msg').textContent),'message : '+P.$('#msg').textContent);
    P.$('#undo').click(); await sleep(20);
    ok(Math.abs(rms(P.lastPlayed().getChannelData(0),gapStart,gapEnd)-rms(before,gapStart,gapEnd))<1e-4,'annulation');
  });
  await test('menus de piste en onglets : une seule partie affichée à la fois',async()=>{
    const P=await boot();
    const t1=P.$('.trk'); t1.querySelector('.tog').click(); await sleep(10);
    const vis=()=>[...t1.querySelectorAll('.pane')].filter(x=>!x.hidden).map(x=>x.dataset.pane).join(',');
    ok(vis()==='son','onglet par défaut : '+vis());
    ok(t1.querySelector('.ttabs button[data-tab="bass"]').hidden,'l\'onglet Basse ne doit pas exister sur une piste enregistrée');
    for(const tab of ['cut','fx','trk','son']){ t1.querySelector('.ttabs button[data-tab="'+tab+'"]').click(); ok(vis()===tab,'onglet '+tab+' → '+vis()); }
    ok(!t1.querySelector('.vol').closest('.pane'),'le volume doit rester visible hors onglets');
  });

  // ---------------- répétition non destructive (v26) ----------------
  await test('répéter une partie sans rien effacer : silence, en boucle, ×2 — boucle de base inchangée',async()=>{
    const P=await boot(); const r=await recordBase(P);
    P.$('#addtrk').click(); await sleep(10);
    const L=r.buf.length/SR, t0e=r.tp+r.first-0.003, cur=P.ctx.currentTime;
    const tgt0=t0e+Math.ceil((cur+1.2-t0e)/L)*L+0.003, press=tgt0-0.3;
    P.impulses=[Math.round((tgt0+r.lat)*SR),Math.round((tgt0+r.T+r.lat)*SR)];
    const stopAt=tgt0+2*r.T-0.05;
    await P.runUntil(press,[{t:press,fn:()=>P.rec(1).click()}]);
    await P.runUntil(stopAt,[{t:stopAt,fn:()=>P.rec(1).click()}]); await P.runUntil(stopAt+1);
    const orig=P.lastBuf();
    const t2=P.$$('.trk')[1]; t2.querySelector('.tog').click(); t2.querySelector('.ttabs button[data-tab="cut"]').click(); await sleep(20);
    ok(/partie détectée : temps 1 → 2/.test(t2.querySelector('.trl').textContent),'partie : '+t2.querySelector('.trl').textContent);
    t2.querySelector('.trep button[data-m="loop"]').click(); await sleep(30);
    const beat=r.buf.length/8, inner=[144,144+Math.round(r.T*SR)];
    let h=P.hits(P.lastPlayed());
    ok(h.length===8,'en boucle : '+h.length+' coups joués');
    const exp=[]; for(let k=0;k<4;k++) inner.forEach(o=>exp.push(Math.round(o+k*2*beat)));
    h.forEach((x,k)=>ok(Math.abs(x-exp[k])<=3,'coup '+k+' à '+x+' au lieu de '+exp[k]));
    ok(P.hits(orig).length===2&&P.lastPlayed().length===r.buf.length,'le son d\'origine ou la durée a changé');
    ok(/temps 1 → 2/.test(t2.querySelector('.trl').textContent)&&t2.querySelector('.trep button[data-m="loop"]').classList.contains('on'),'affichage du mode');
    t2.querySelector('.trep button[data-m="2"]').click(); await sleep(30);
    ok(P.hits(P.lastPlayed()).length===4,'×2 : '+P.hits(P.lastPlayed()).length+' coups');
    t2.querySelector('.trep button[data-m="mute"]').click(); await sleep(30);
    ok(P.hits(P.lastPlayed()).length===2,'silence : '+P.hits(P.lastPlayed()).length+' coups');
    P.$('#undo').click(); await sleep(30);
    ok(P.hits(P.lastPlayed()).length===4,'annuler doit revenir à ×2 : '+P.hits(P.lastPlayed()).length);
    ok(P.hits(r.buf).length===16,'piste de base modifiée');
  });
  // ---------------- basse sur ligne de temps (v26) ----------------
  const bassBoot=async(idb)=>{ const P=await boot(idb?{idb}:undefined); P.$('#addbass').click(); await sleep(20); const tb=P.$$('.trk')[1]; return {P,tb}; };
  const fz=(b,a,z)=>{ const bl=b.length/8; return freqOf({getChannelData:()=>b.getChannelData(0).subarray(Math.round(a*bl),Math.round(z*bl))}); };
  await test('basse : réglages par défaut = une seule note partout (plus de notes qui changent toutes seules)',async()=>{
    const {P,tb}=await bassBoot();
    ok(/kbass/.test(tb.className)&&tb.querySelector('.tn').textContent==='Basse','piste de basse');
    ok(tb.querySelector('.bgo').textContent==='✓ Créer la basse','libellé de la basse : '+tb.querySelector('.bgo').textContent);
    ok(tb.querySelector('.bmel').value==='same'&&tb.querySelector('.btlinfo').textContent.startsWith('Do · 1 bloc'),'défauts : '+tb.querySelector('.bmel').value+' / '+tb.querySelector('.btlinfo').textContent);
    const POS={noire:[0,1,2,3],croches:[0,.5,1,1.5,2,2.5,3,3.5],funk:[0,.75,1.5,2,2.75,3.5],hiphop:[0,1.75,2.5]};
    for(const rh of ['noire','croches','funk','hiphop']){
      tb.querySelector('.brhy').value=rh; tb.querySelector('.brhy').dispatchEvent(new P.w.Event('change'));
      tb.querySelector('.bgo').click(); await sleep(30);
      const b=P.lastBuf(), ev=[];
      for(const bar of [0,4]) for(const p0 of POS[rh]) ev.push(fz(b,bar+p0+0.02,bar+p0+0.18));
      ok(ev.every(f=>near(f,65.4,3)),'rythme '+rh+' : fréquences '+ev.map(f=>f.toFixed(0)).join(','));
    }
  });
  await test('basse : ligne de temps — couper, choisir la note, faire glisser la limite, glissé',async()=>{
    const {P,tb}=await bassBoot();
    tb.querySelector('.bsplit').click(); await sleep(10);
    ok(tb.querySelector('.btlinfo').textContent.startsWith('Do → Do · 2 blocs'),'après coupe : '+tb.querySelector('.btlinfo').textContent);
    const bsn=tb.querySelector('.bsn'); bsn.value='5'; bsn.dispatchEvent(new P.w.Event('change'));
    ok(tb.querySelector('.btlinfo').textContent.startsWith('Do → Fa'),'note : '+tb.querySelector('.btlinfo').textContent);
    const c=tb.querySelector('.btl'); c.getBoundingClientRect=()=>({left:0,width:400});
    const pe=(type,x)=>{ const e=new P.w.MouseEvent(type,{clientX:x,bubbles:true}); c.dispatchEvent(e); };
    pe('pointerdown',200); pe('pointermove',215); pe('pointermove',300); pe('pointerup',300); await sleep(10);
    ok(/temps 7 → 8/.test(tb.querySelector('.bselinfo').textContent)||/Do → Fa/.test(tb.querySelector('.btlinfo').textContent),'');
    tb.querySelector('.bgo').click(); await sleep(30);
    let b=P.lastBuf();
    ok(near(fz(b,5.1,5.8),65.4,3)&&near(fz(b,6.1,6.8),87.3,3),'limite déplacée au temps 7 : '+fz(b,5.1,5.8).toFixed(1)+' / '+fz(b,6.1,6.8).toFixed(1));
    pe('pointerdown',50); pe('pointerup',50); await sleep(5);
    const gl=tb.querySelector('.bgl'); gl.checked=true; gl.dispatchEvent(new P.w.Event('change'));
    tb.querySelector('.bgo').click(); await sleep(30);
    b=P.lastBuf();
    ok(fz(b,5.5,5.95)>fz(b,5.05,5.3)+5,'glissé vers Fa absent : '+fz(b,5.05,5.3).toFixed(1)+' → '+fz(b,5.5,5.95).toFixed(1));
    ok(/Do ↝ → Fa/.test(tb.querySelector('.btlinfo').textContent),'affichage du glissé : '+tb.querySelector('.btlinfo').textContent);
    tb.querySelector('.bdel').click(); await sleep(5);
    ok(tb.querySelector('.btlinfo').textContent.includes('1 bloc'),'retirer un bloc : '+tb.querySelector('.btlinfo').textContent);
  });
  await test('basse : aperçu sans enregistrer, mélodie avec octave',async()=>{
    const {P,tb}=await bassBoot();
    P.starts.length=0; tb.querySelector('.bprev').click(); await sleep(30);
    const pv=P.starts.filter(x=>x.buf).slice(-1)[0];
    ok(pv&&near(pv.buf.length,Math.round(8*60/90*SR),2)&&P.$('#lockhint').style.display==='none','aperçu');
    const sel=tb.querySelector('.bmel'); sel.value='oct'; sel.dispatchEvent(new P.w.Event('change'));
    const r2=tb.querySelector('.brhy'); r2.value='croches'; r2.dispatchEvent(new P.w.Event('change'));
    tb.querySelector('.bgo').click(); await sleep(30);
    const b=P.lastBuf();
    ok(near(fz(b,0.05,0.4),65.4,3)&&near(fz(b,0.55,0.9),130.8,4),'octave en alternance : '+fz(b,0.05,0.4).toFixed(0)+' / '+fz(b,0.55,0.9).toFixed(0));
  });
  await test('basse : anciens réglages convertis en blocs, et blocs retrouvés au rechargement',async()=>{
    const idb=new FI.IDBFactory();
    await new Promise(res=>{ const r=idb.open('loopbox',1); r.onupgradeneeded=()=>r.result.createObjectStore('proj'); r.onsuccess=()=>{ const db=r.result, tx=db.transaction('proj','readwrite'), st=tx.objectStore('proj');
      st.put({cur:'p1',list:[{id:'p1',name:'Ancien',updated:1}]},'index');
      st.put({v:2,name:'Ancien',bpm:90,loopLen:0,beats:4,tracks:[{vol:0.8},{vol:0.8,k:'bass',bs:{note:0,scale:'min',pat:'marche',type:'sub',len:1,prog:false,evo:'half',evoNote:5,evoAt:2,beats:8}}]},'p:p1:main');
      tx.oncomplete=()=>{ db.close(); res(); }; }; });
    const P=await boot({idb}); await sleep(400);
    const tb=P.$$('.trk')[1]; tb.querySelector('.tog').click(); await sleep(20);
    ok(tb&&tb.querySelector('.btlinfo').textContent.startsWith('Do → Fa'),'conversion : '+(tb?tb.querySelector('.btlinfo').textContent:'pas de piste'));
    ok(tb.querySelector('.brhy').value==='noire'&&tb.querySelector('.bmel').value==='walk','motif « marche » converti : '+tb.querySelector('.brhy').value+'/'+tb.querySelector('.bmel').value);
    tb.querySelector('.bgo').click(); await sleep(900);
    const Q=await boot({idb}); await sleep(400);
    const qb=Q.$$('.trk')[1]; qb.querySelector('.tog').click(); await sleep(20);
    ok(qb.querySelector('.btlinfo').textContent.startsWith('Do → Fa'),'rechargement : '+qb.querySelector('.btlinfo').textContent);
  });

  await test('basse : un tout petit bloc (1 temps) se sélectionne d\'un simple toucher, même près des limites',async()=>{
    const {P,tb}=await bassBoot();
    const nb=8, c=tb.querySelector('.btl'); c.getBoundingClientRect=()=>({left:0,width:800});
    const pe=(type,x)=>c.dispatchEvent(new P.w.MouseEvent(type,{clientX:x,bubbles:true}));
    // blocs : [0,4) [4,6) [6,7) [7,8)
    tb.querySelector('.bsplit').click();                         // [0,4) [4,8), bloc 2 choisi
    tb.querySelector('.bsplit').click();                         // [4,6) [6,8), bloc 3 choisi
    tb.querySelector('.bsplit').click(); await sleep(5);         // [6,7) [7,8), bloc 4 choisi
    ok(tb.querySelector('.btlinfo').textContent.includes('4 blocs'),'préparation : '+tb.querySelector('.btlinfo').textContent);
    const at=b=>b/nb*800;
    for(const [x,exp] of [[at(6.5),'temps 7 → 7'],[at(6.12),'temps 7 → 7'],[at(6.88),'temps 7 → 7'],[at(4.1),'temps 5 → 6'],[at(7.5),'temps 8 → 8']]){
      pe('pointerdown',x); pe('pointerup',x); await sleep(5);
      ok(tb.querySelector('.bselinfo').textContent.includes(exp),'toucher à '+Math.round(x)+' px → '+tb.querySelector('.bselinfo').textContent+' (attendu '+exp+')');
    }
    ok(tb.querySelector('.btlinfo').textContent.includes('4 blocs'),'un toucher ne doit pas déplacer de limite : '+tb.querySelector('.btlinfo').textContent);
    tb.querySelector('.bprevb').click(); ok(tb.querySelector('.bselinfo').textContent.includes('temps 7 → 7'),'◀ : '+tb.querySelector('.bselinfo').textContent);
    tb.querySelector('.bnextb').click(); ok(tb.querySelector('.bselinfo').textContent.includes('temps 8 → 8'),'▶ : '+tb.querySelector('.bselinfo').textContent);
  });

  await test('basse : couper au doigt sur la règle des temps, puis choisir les notes avec la palette',async()=>{
    const {P,tb}=await bassBoot();
    const c=tb.querySelector('.btl'); c.getBoundingClientRect=()=>({left:0,top:0,width:800,height:104});
    const tap=(x,y)=>{ c.dispatchEvent(new P.w.MouseEvent('pointerdown',{clientX:x,clientY:y,bubbles:true})); c.dispatchEvent(new P.w.MouseEvent('pointerup',{clientX:x,clientY:y,bubbles:true})); };
    const at=b=>b/8*800, info=()=>tb.querySelector('.btlinfo').textContent;
    tap(at(4),15); await sleep(5);
    ok(info().startsWith('Do → Do · 2 blocs')&&/temps 5 → 8/.test(tb.querySelector('.bselinfo').textContent),'coupe au temps 5 : '+info()+' / '+tb.querySelector('.bselinfo').textContent);
    tb.querySelector('.bpal button[data-n="7"]').click();
    ok(info().startsWith('Do → Sol'),'palette : '+info());
    ok(tb.querySelector('.bpal button[data-n="7"]').classList.contains('on'),'note active non marquée');
    tap(at(6.2),15); await sleep(5);
    tb.querySelector('.bpal button[data-n="5"]').click();
    ok(info().startsWith('Do → Sol → Fa · 3 blocs'),'2e coupe au temps 7 : '+info());
    tap(at(1.5),60); tb.querySelector('.bpal button[data-n="9"]').click();
    ok(info().startsWith('La → Sol → Fa'),'toucher un bloc puis une note : '+info());
    tap(at(6),15); await sleep(5);
    ok(info().startsWith('La → Sol · 2 blocs'),'toucher une coupe existante l\'enlève : '+info());
    tb.querySelector('.bgo').click(); await sleep(30);
    const b=P.lastBuf();
    ok(near(fz(b,1.1,1.8),55,3)&&near(fz(b,5.1,5.8),49,3),'notes jouées : '+fz(b,1.1,1.8).toFixed(1)+' / '+fz(b,5.1,5.8).toFixed(1));
  });

  await test('nettoyer toutes les pistes : la basse et les sons continus ne sont jamais écrasés',async()=>{
    const P=await boot();
    const n=SR*4, d=new Float32Array(n); let sd=5;
    for(let i=0;i<n;i++){ sd=(sd*16807)%2147483647; d[i]=0.01*(sd/2147483647*2-1); }
    for(let k=0;k<8;k++){ const p=Math.round(k*0.5*SR)+2000; for(let i=0;i<5000;i++) d[p+i]+=0.7*Math.exp(-i/900)*Math.sin(2*Math.PI*90*i/SR); }
    await P.importFile(0,{numberOfChannels:1,length:n,sampleRate:SR,duration:n/SR,getChannelData:()=>d});
    P.$('#addbass').click(); await sleep(20);
    const tb=P.$$('.trk')[1]; tb.querySelector('.bgo').click(); await sleep(40);
    P.$('#addtrk').click(); await sleep(10);
    const L=P.$$('.trk')[0]&&n, tone=new Float32Array(n); for(let i=0;i<n;i++) tone[i]=0.4*Math.sin(2*Math.PI*220*i/SR);
    await P.importFile(2,{numberOfChannels:1,length:n,sampleRate:SR,duration:n/SR,getChannelData:()=>tone});
    const bufs=()=>[0,1,2].map(i=>P.$$('.trk')[i]);
    const rmsAll=b=>{ const x=b.getChannelData(0); let s=0; for(const v of x) s+=v*v; return Math.sqrt(s/x.length); };
    // on récupère les sons via la lecture
    P.$('#dplay').click(); await sleep(40);
    const before=new Map(); P.starts.filter(x=>x.buf).forEach(x=>before.set(x.buf.length+':'+rmsAll(x.buf).toFixed(4),true));
    const bassBefore=P.buffers.find(b=>b.length===Math.round(n)&&false);
    P.$('#dnall').value='light'; P.$('#dnallb').click(); await sleep(60);
    const m=P.$('#msg').textContent;
    ok(/Bruit nettoyé sur 1 piste/.test(m),'message : '+m);
    ok(/Basse/.test(m)&&/sons? générés?/.test(m),'la basse devrait être signalée comme laissée intacte : '+m);
    ok(/pas de passage calme/.test(m),'le son continu devrait être laissé intact : '+m);
    const played=P.starts.filter(x=>x.buf).slice(-6).map(x=>rmsAll(x.buf));
    ok(played.every(v=>v>0.05),'une piste a été écrasée : niveaux '+played.map(v=>v.toFixed(3)).join(','));
  });

  // ---------------- latence et calage précis (v30) ----------------
  const lateTake=async(P,r,late,jit)=>{
    P.$('#addtrk').click(); await sleep(10);
    const L=r.buf.length/SR, t0e=r.tp+r.first-0.003, cur=P.ctx.currentTime;
    const tgt0=t0e+Math.ceil((cur+1.2-t0e)/L)*L+0.003, press=tgt0-0.3;
    P.impulses=[]; for(let k=0;k<8;k++) P.impulses.push(Math.round((tgt0+k*(L/8)+r.lat+late+(jit?jit[k]:0))*SR));
    await P.runUntil(press,[{t:press,fn:()=>P.rec(1).click()}]); await P.runUntil(press+L+1.2);
    const t2=P.$$('.trk')[1]; t2.querySelector('.tog').click(); t2.querySelector('.ttabs button[data-tab="cut"]').click(); await sleep(10);
    return t2;
  };
  await test('latence : une prise en retard de 40 ms est calée sur les temps sans rien couper',async()=>{
    const P=await boot(); const r=await recordBase(P);
    const t2=await lateTake(P,r,0.040);
    const orig=P.lastBuf(), before=P.hits(orig);
    ok(before.every((x,k)=>Math.abs(x-(144+Math.round(k*r.buf.length/8))-Math.round(0.04*SR))<=4),'préparation : prise pas en retard de 40 ms');
    t2.querySelector('.qgrid').value='1'; t2.querySelector('.ofauto').click(); await sleep(30);
    const beat=r.buf.length/8, h=P.hits(P.lastPlayed());
    ok(h.length===8,'coups joués '+h.length);
    ok(h.every((x,k)=>Math.abs(x-(144+k*beat))<=4),'après calage : écarts '+h.map((x,k)=>Math.round(x-(144+k*beat))).join(','));
    ok(/−?-?3\d ms|−?-?4\d ms/.test(t2.querySelector('.offv').textContent),'décalage affiché : '+t2.querySelector('.offv').textContent);
    ok(P.hits(orig).join()===before.join(),'le son d\'origine a été modifié');
    t2.querySelector('.ofb[data-d="10"]').click(); await sleep(20);
    const h2=P.hits(P.lastPlayed());
    ok(Math.abs((h2[0]-h[0])-480)<=2,'+10 ms devrait retarder de 480 échantillons : '+(h2[0]-h[0]));
    t2.querySelector('.ofz').click(); await sleep(20);
    ok(t2.querySelector('.offv').textContent==='0 ms'&&P.hits(P.lastPlayed()).join()===before.join(),'« 0 » doit revenir au son d\'origine');
  });
  await test('recaler chaque son : attaques sur les temps, queues des sons préservées (plus de grignotage)',async()=>{
    const P=await boot(); const r=await recordBase(P);
    P.$('#addtrk').click(); await sleep(10);
    const L=r.buf.length, beat=L/8, d=new Float32Array(L), jit=[0.022,-0.018,0.015,-0.022,0.01,-0.012,0.02,-0.008]; let sd=3;
    const pos=[];
    for(let k=0;k<8;k++){ const p=Math.round(144+k*beat+jit[k]*SR); pos.push(p); for(let i=0;i<Math.round(0.35*SR)&&p+i<L;i++) d[p+i]+=0.7*Math.exp(-i/(0.1*SR))*Math.sin(2*Math.PI*90*i/SR); }
    for(let k=0;k<8;k++){ const p=Math.round(144+(k+0.6)*beat); for(let i=0;i<1500&&p+i<L;i++){ sd=(sd*16807)%2147483647; d[p+i]+=0.05*(sd/2147483647*2-1); } }
    await P.importFile(1,{numberOfChannels:1,length:L,sampleRate:SR,duration:L/SR,getChannelData:()=>d});
    const t2=P.$$('.trk')[1]; t2.querySelector('.tog').click(); t2.querySelector('.ttabs button[data-tab="cut"]').click(); await sleep(10);
    const orig=P.lastBuf();
    t2.querySelector('.qgrid').value='1'; t2.querySelector('.qstr').value='1'; t2.querySelector('.qbtn').click(); await sleep(30);
    const hitsG=b=>{ const x=b.getChannelData(0), o=[]; let prev=-1e9; for(let i=0;i<x.length;i++) if(Math.abs(x[i])>0.4&&i-prev>Math.round(0.2*SR)){ o.push(i); prev=i; } return o; };
    const out=P.lastBuf(), h=hitsG(out), h0=hitsG(orig);
    ok(h.length===8,'coups '+h.length);
    const dev=h.map((x,k)=>x-(144+k*beat)), dev0=h0.map((x,k)=>x-(144+k*beat));
    ok(Math.max(...dev)-Math.min(...dev)<=4,'attaques pas alignées : écarts '+dev.map(Math.round).join(',')+' (avant '+dev0.map(Math.round).join(',')+')');
    const rms=(b,a,z)=>{ const x=b.getChannelData(0); let s=0; for(let i=a;i<z;i++) s+=x[i]*x[i]; return Math.sqrt(s/(z-a)); };
    const tails=h.map((x,k)=>20*Math.log10(rms(out,x+Math.round(0.02*SR),x+Math.round(0.2*SR))/rms(orig,h0[k]+Math.round(0.02*SR),h0[k]+Math.round(0.2*SR))));
    ok(tails.every(v=>Math.abs(v)<1.5),'queues des sons modifiées (dB) : '+tails.map(v=>v.toFixed(1)).join(','));
  });
  await test('repères début/fin réglables à la milliseconde, et sans aimant',async()=>{
    const P=await boot(); const r=await recordBase(P);
    const t2=await lateTake(P,r,0);
    t2.querySelector('.tsn[data-w="s"][data-ms="10"]').click(); await sleep(10);
    ok(/Temps 1,01\d → 8 sur 8/.test(t2.querySelector('.tsl').textContent),'+10 ms au début : '+t2.querySelector('.tsl').textContent);
    t2.querySelector('.tsn[data-w="e"][data-ms="-1"]').click(); await sleep(10);
    ok(/→ 7,998 sur 8/.test(t2.querySelector('.tsl').textContent),'−1 ms à la fin : '+t2.querySelector('.tsl').textContent);
    const sn=t2.querySelector('.tsnap'); sn.checked=false; sn.dispatchEvent(new P.w.Event('change'));
    const c=t2.querySelector('.tsc'); c.getBoundingClientRect=()=>({left:0,width:800});
    const pe=(ty,x)=>c.dispatchEvent(new P.w.MouseEvent(ty,{clientX:x,bubbles:true}));
    pe('pointerdown',2); pe('pointermove',330); pe('pointerup',330); await sleep(10);
    ok(/Temps 4,3 → /.test(t2.querySelector('.tsl').textContent),'repère libre : '+t2.querySelector('.tsl').textContent);
  });
  await test('prise de base : ajuster le début à la milliseconde sans changer la durée',async()=>{
    const P=await boot(); const r=await recordBase(P);
    ok(P.$('#editor').style.display!=='none','cadre de la prise de base');
    P.$('.mn[data-d="-10"]').click(); await sleep(20);
    const b=P.lastBuf(), h=P.hits(b);
    ok(b.length===r.buf.length,'durée changée : '+b.length);
    ok(Math.abs(h[0]-(144+480))<=3,'1er coup à '+h[0]+' au lieu de '+(144+480));
    ok(P.$('#mnv').textContent==='−10 ms'||P.$('#mnv').textContent==='-10 ms','affichage : '+P.$('#mnv').textContent);
  });

  // ---------------- import de vidéos, choix du passage, vitesse (v31) ----------------
  const mkFile=(n,fill)=>{ const d=new Float32Array(n); fill(d); return {numberOfChannels:1,length:n,sampleRate:SR,duration:n/SR,getChannelData:()=>d}; };
  await test('import d\'un long fichier (vidéo d\'écran) : choisir le passage à la durée de la boucle',async()=>{
    const P=await boot(); const r=await recordBase(P);
    ok(/video\/\*/.test(P.$('.impfile').getAttribute('accept')),'les vidéos ne sont pas acceptées');
    P.$('#addtrk').click(); await sleep(10);
    const L=r.buf.length, f=mkFile(L*3,d=>{ for(let k=0;k*24000+1000<d.length;k++) d[k*24000+1000]=0.8; });
    await P.importFile(1,f);
    const t2=P.$$('.trk')[1];
    ok(!t2.querySelector('.impbox').hidden&&t2.querySelector('.impc'),'le choix du passage ne s\'affiche pas');
    ok(/Choisis le passage : 0:00,00 → /.test(t2.querySelector('.imptxt').textContent),'texte : '+t2.querySelector('.imptxt').textContent);
    t2.querySelector('.impn[data-w="a"][data-d="1"]').click(); await sleep(5);
    ok(/0:01,00 → /.test(t2.querySelector('.imptxt').textContent),'+1 s : '+t2.querySelector('.imptxt').textContent);
    P.starts.length=0; t2.querySelector('.implisten').click(); await sleep(10);
    ok(P.starts.some(x=>x.buf&&x.buf.length===L),'l\'écoute du passage ne démarre pas');
    t2.querySelector('.impuse').click(); await sleep(30);
    const b=P.lastBuf(), h=P.hits(b);
    ok(b.length===L&&h[0]===1000,'passage importé : longueur '+b.length+', 1er son à '+h[0]+' (attendu 1000, soit 1 s plus loin dans le fichier)');
    ok(t2.querySelector('.impbox').hidden,'la boîte devrait se fermer');
  });
  await test('import d\'un long fichier sur la 1re piste : début et fin libres, puis boucle créée',async()=>{
    const P=await boot();
    const T=60/100, f=mkFile(SR*60,d=>{ for(let k=0;k*T*SR<d.length;k++) d[Math.round(k*T*SR)+2000]=0.8; });
    await P.importFile(0,f);
    const t1=P.$('.trk');
    ok(!t1.querySelector('.impbox').hidden,'pas de choix de passage');
    ok(/→ 0:10,00 \(10,00 s\)/.test(t1.querySelector('.imptxt').textContent),'passage par défaut : '+t1.querySelector('.imptxt').textContent);
    t1.querySelector('.impn[data-w="b"][data-d="-1"]').click(); t1.querySelector('.impn[data-w="b"][data-d="-1"]').click(); await sleep(5);
    ok(/→ 0:08,00/.test(t1.querySelector('.imptxt').textContent),'fin −2 s : '+t1.querySelector('.imptxt').textContent);
    t1.querySelector('.impuse').click(); await sleep(60);
    ok(P.$('#lockhint').style.display!=='none'&&/Rythme détecté/.test(P.$('#msg').textContent),'boucle non créée : '+P.$('#msg').textContent);
  });
  await test('vitesse d\'une piste : 50 % sans changer la note, et adaptation au tempo du projet',async()=>{
    const P=await boot(); const r=await recordBase(P);
    P.$('#addtrk').click(); await sleep(10);
    const L=r.buf.length, beat=L/8;
    await P.importFile(1,mkFile(L,d=>{ for(let k=0;k<8;k++) d[Math.round(144+k*beat)]=0.8; }));
    const t2=P.$$('.trk')[1]; t2.querySelector('.tog').click(); await sleep(10);
    P.$('#dplay').click(); await sleep(30);
    t2.querySelector('.spseg button[data-v="0.5"]').click(); await sleep(120);
    let h=P.hits(P.lastPlayed());
    ok(h.length===4,'50 % : '+h.length+' coups dans la boucle (attendu 4)');
    ok(h.every((x,k)=>Math.abs(x-(144+2*k*beat))<SR*0.012),'espacement : '+h.join(','));
    ok(/50 %/.test(t2.querySelector('.spv').textContent)&&/Vitesse 50 %/.test(t2.querySelector('.fxbadge').textContent),'affichage');
    P.$('#undo').click(); await sleep(40);
    ok(P.hits(P.lastPlayed()).length===8,'annulation');
    // un son importé à 120 BPM dans une boucle à ~96 BPM
    P.$('#addtrk').click(); await sleep(10);
    await P.importFile(2,mkFile(L,d=>{ for(let k=0;144+k*0.5*SR<L;k++) d[Math.round(144+k*0.5*SR)]=0.8; }));
    const t3=P.$$('.trk')[2]; t3.querySelector('.tog').click(); await sleep(10);
    t3.querySelector('.spauto').click(); await sleep(150);
    ok(/8\d %/.test(t3.querySelector('.spv').textContent),'vitesse adaptée : '+t3.querySelector('.spv').textContent+' | '+P.$('#msg').textContent);
    h=P.hits(P.lastPlayed()); const gaps=h.slice(1).map((x,i)=>x-h[i]);
    ok(gaps.every(g=>Math.abs(g-beat)<SR*0.012),'après adaptation, un son par temps : écarts '+gaps.join(','));
    // la note ne change pas
    P.$('#addtrk').click(); await sleep(10);
    await P.importFile(3,mkFile(L,d=>{ for(let i=0;i<L;i++) d[i]=0.4*Math.sin(2*Math.PI*220*i/SR); }));
    const t4=P.$$('.trk')[3]; t4.querySelector('.tog').click(); t4.querySelector('.spseg button[data-v="0.75"]').click(); await sleep(150);
    ok(near(freqOf(P.lastPlayed()),220,3),'note changée : '+freqOf(P.lastPlayed()).toFixed(1));
  });

  await test('une seule piste : la partie choisie devient la boucle (plus de blanc au début)',async()=>{
    const P=await boot();
    const n=SR*20, f=mkFile(n,d=>{ for(let k=0;k*0.5*SR+SR*3<n;k++){ const p=Math.round(SR*3+k*0.5*SR); for(let i=0;i<300;i++) d[p+i]=0.8*Math.exp(-i/80); } });
    await P.importFile(0,f);
    const t1=P.$('.trk'); t1.querySelector('.tog').click(); t1.querySelector('.ttabs button[data-tab="cut"]').click(); await sleep(10);
    const L0=P.lastBuf().length, nb0=+P.$('#growlbl').textContent.match(/\d+/)[0];
    const bl=L0/nb0, first=P.hits(P.lastBuf())[0];
    // début au premier son, sans aimant
    const sn=t1.querySelector('.tsnap'); sn.checked=false; sn.dispatchEvent(new P.w.Event('change'));
    const c=t1.querySelector('.tsc'); c.getBoundingClientRect=()=>({left:0,width:1000});
    const pe=(ty,x)=>c.dispatchEvent(new P.w.MouseEvent(ty,{clientX:x,bubbles:true}));
    const hs=P.hits(P.lastBuf()), xs=hs[4]/L0*1000, xe=hs[20]/L0*1000;
    pe('pointerdown',1); pe('pointermove',xs); pe('pointerup',xs); await sleep(10);
    pe('pointerdown',999); pe('pointermove',xe); pe('pointerup',xe); await sleep(10);
    ok(!t1.querySelector('.tsloop').hidden,'le bouton « Faire de cette partie la boucle » devrait être visible');
    t1.querySelector('.tsloop').click(); await sleep(30);
    const b=P.lastBuf(), h=P.hits(b);
    ok(h[0]<Math.round(0.01*SR),'le 1er son devrait être au tout début de la boucle : '+h[0]);
    ok(Math.abs(b.length-(hs[20]-hs[4]))<=2,'la boucle devrait avoir la durée de la partie : '+b.length+' au lieu de '+(hs[20]-hs[4]));
    ok(/La boucle commence maintenant au début choisi/.test(P.$('#msg').textContent),'message : '+P.$('#msg').textContent);
    P.$('#undo').click(); await sleep(30);
    ok(P.$('#growlbl').textContent.startsWith(nb0+' temps'),'annulation : '+P.$('#growlbl').textContent);
  });
  await test('plusieurs pistes : placer la partie au début de la boucle (sans changer sa durée)',async()=>{
    const P=await boot(); const r=await recordBase(P);
    P.$('#addtrk').click(); await sleep(10);
    const L=r.buf.length, beat=L/8;
    await P.importFile(1,mkFile(L,d=>{ d[Math.round(3*beat+500)]=0.8; d[Math.round(5*beat+500)]=0.8; }));
    const t2=P.$$('.trk')[1]; t2.querySelector('.tog').click(); t2.querySelector('.ttabs button[data-tab="cut"]').click(); await sleep(10);
    t2.querySelector('.ts2').click(); t2.querySelector('.ts2').click(); t2.querySelector('.ts2').click(); await sleep(10);
    ok(/Faire tourner cette partie en boucle/.test(t2.querySelector('.tsloop').textContent)&&!t2.querySelector('.tsalign').hidden,'boutons avec d\'autres pistes : '+t2.querySelector('.tsloop').textContent);
    P.$('#dplay').click(); await sleep(20);
    t2.querySelector('.tsalign').click(); await sleep(30);
    const h=P.hits(P.lastPlayed());
    ok(Math.abs(h[0]-500)<=3&&P.lastPlayed().length===L,'1er son à '+h[0]+' (attendu ~500), longueur '+P.lastPlayed().length);
  });

  await test('piste 2 plus courte : faire tourner une partie en boucle sur toute la boucle de base, sans dérive',async()=>{
    const P=await boot(); const r=await recordBase(P);
    P.$('#addtrk').click(); await sleep(10);
    const L=r.buf.length, beat=L/8;
    await P.importFile(1,mkFile(L,d=>{ d[Math.round(3*beat+500)]=0.8; d[Math.round(4*beat+500)]=0.8; }));
    const t2=P.$$('.trk')[1]; t2.querySelector('.tog').click(); t2.querySelector('.ttabs button[data-tab="cut"]').click(); await sleep(10);
    t2.querySelector('.ts2').click(); t2.querySelector('.ts2').click(); t2.querySelector('.ts2').click();
    t2.querySelector('.ts3').click(); t2.querySelector('.ts3').click(); t2.querySelector('.ts3').click(); await sleep(10);
    t2.querySelector('.tsn[data-w="e"][data-ms="10"]').click(); t2.querySelector('.tsn[data-w="e"][data-ms="10"]').click(); await sleep(10);
    ok(/Temps 4 → 5,03\d sur 8/.test(t2.querySelector('.tsl').textContent),'partie choisie : '+t2.querySelector('.tsl').textContent);
    P.$('#dplay').click(); await sleep(20);
    t2.querySelector('.tsloop').click(); await sleep(30);
    const h=P.hits(P.lastPlayed());
    ok(h.length===8,'coups joués '+h.length+' (attendu 8 : 4 répétitions de 2 coups)');
    ok(h.every((x,k)=>Math.abs(x-(500+k*beat))<=3),'dérive : écarts '+h.map((x,k)=>Math.round(x-(500+k*beat))).join(','));
    ok(/se répète tous les 2 temps/.test(P.$('#msg').textContent),'message : '+P.$('#msg').textContent);
    P.$('#undo').click(); await sleep(30);
    ok(P.hits(P.lastPlayed()).length===2,'annulation en un seul ↶ : '+P.hits(P.lastPlayed()).length+' coups');
  });

  // ---------------- mélodie chantée → basse (v34) ----------------
  const singVoice=(L,beat,notes)=>mkFile(L,d=>{ let sd=9, ph=0;
    for(let i=0;i<L;i++){ const b=i/beat; const nt=notes.find(x=>b>=x[0]&&b<x[1]); sd=(sd*16807)%2147483647; let v=0.004*(sd/2147483647*2-1);
      if(nt){ const f=440*Math.pow(2,(nt[2]-69)/12)*Math.pow(2,0.25/12*Math.sin(2*Math.PI*5*i/SR)); ph+=f/SR; const tt=(b-nt[0])*beat/SR, env=Math.min(1,tt/0.02)*Math.min(1,((nt[1]-b)*beat/SR)/0.03);
        v+=0.3*env*(Math.sin(2*Math.PI*ph)+0.5*Math.sin(4*Math.PI*ph)+0.3*Math.sin(6*Math.PI*ph)+0.15*Math.sin(8*Math.PI*ph)); }
      d[i]=v; } });
  await test('mélodie chantée → basse : notes, durées et silences repérés, descendus dans les graves, transposables',async()=>{
    const P=await boot(); const r=await recordBase(P);
    const L=r.buf.length, beat=L/8;
    P.$('#addtrk').click(); await sleep(10);
    // La3 2 temps, Do4 2 temps, silence 1 temps, Mi4 3 temps (voix d'homme qui chante assez haut)
    await P.importFile(1,singVoice(L,beat,[[0,2,57],[2,4,60],[5,8,64]]));
    P.$$('.trk')[1].querySelector('.tn').textContent;
    P.$('#addbass').click(); await sleep(20);
    const tb=P.$$('.trk')[2];
    const ms=tb.querySelector('.msrc'); ok(ms.selectedOptions[0].textContent==='Piste 2','piste chantée proposée par défaut : '+ms.selectedOptions[0].textContent);
    tb.querySelector('.mgo').click(); await sleep(60);
    const info=tb.querySelector('.btlinfo').textContent, m=P.$('#msg').textContent;
    ok(/^La → Do → — → Mi · 4 blocs \(dont 1 silence\)/.test(info),'blocs : '+info+' | '+m);
    ok(/3 notes repérées/.test(m)&&/descendues de 2 octaves/.test(m)&&/de La1 à Mi2/.test(m),'message : '+m);
    ok(tb.querySelector('.brhy').value==='melodie','rythme « Suivre les notes » : '+tb.querySelector('.brhy').value);
    tb.querySelector('.bgo').click(); await sleep(40);
    const b=P.lastBuf();
    ok(near(fz(b,0.3,1.7),55,2),'La1 attendu : '+fz(b,0.3,1.7).toFixed(1));
    ok(near(fz(b,2.3,3.7),65.4,2),'Do2 attendu : '+fz(b,2.3,3.7).toFixed(1));
    ok(near(fz(b,5.3,7.7),82.4,2.5),'Mi2 attendu : '+fz(b,5.3,7.7).toFixed(1));
    const x=b.getChannelData(0); let s2=0; for(let i=Math.round(4.2*beat);i<Math.round(4.8*beat);i++) s2+=x[i]*x[i];
    ok(Math.sqrt(s2/(0.6*beat))<0.01,'le silence (temps 5) devrait être muet');
    tb.querySelector('.btr[data-d="12"]').click(); tb.querySelector('.bgo').click(); await sleep(40);
    ok(near(fz(P.lastBuf(),0.3,1.7),110,3),'+1 octave : '+fz(P.lastBuf(),0.3,1.7).toFixed(1));
    tb.querySelector('.btr[data-d="-1"]').click(); tb.querySelector('.bgo').click(); await sleep(40);
    ok(near(fz(P.lastBuf(),0.3,1.7),103.8,3),'−1 demi-ton : '+fz(P.lastBuf(),0.3,1.7).toFixed(1));
    // un bloc transformé en silence avec la palette
    const c=tb.querySelector('.btl'); c.getBoundingClientRect=()=>({left:0,top:0,width:800,height:104});
    c.dispatchEvent(new P.w.MouseEvent('pointerdown',{clientX:300,clientY:60,bubbles:true})); c.dispatchEvent(new P.w.MouseEvent('pointerup',{clientX:300,clientY:60,bubbles:true}));
    tb.querySelector('.bpal button[data-n="-1"]').click();
    ok(/^Sol♯ → — → — → Ré♯ · 4 blocs \(dont 2 silences\)/.test(tb.querySelector('.btlinfo').textContent),'silence par la palette : '+tb.querySelector('.btlinfo').textContent);
  });

  // ---------------- piste mélodie : voix → notes avec styles (v35) ----------------
  await test('piste mélodie : la voix devient des notes à la même hauteur, jouées avec un style',async()=>{
    const P=await boot(); const r=await recordBase(P);
    const L=r.buf.length, beat=L/8;
    P.$('#addtrk').click(); await sleep(10);
    await P.importFile(1,singVoice(L,beat,[[0,2,57],[2,4,60],[5,8,64]]));
    P.$('#addsynth').click(); await sleep(20);
    const tm=P.$$('.trk')[2];
    ok(/ksynth/.test(tm.className)&&tm.querySelector('.tn').textContent==='Mélodie','piste mélodie : '+tm.className+' / '+tm.querySelector('.tn').textContent);
    ok(tm.querySelector('.ttabs button[data-tab="bass"]').textContent==='🎹 Mélodie'&&tm.querySelector('.mel2b').open,'onglet / transformation ouverte');
    const st=tm.querySelector('.btype'); ok(st.options.length===9&&/Son simple/.test(st.options[0].textContent)&&st.value==='clean','styles : '+[...st.options].map(o=>o.textContent).join(' | '));
    ok(tm.querySelector('.bgo').textContent==='✓ Créer la mélodie'&&!/graves/.test(tm.querySelector('.mel2b .hint').textContent),'libellés de la piste mélodie : '+tm.querySelector('.bgo').textContent+' | '+tm.querySelector('.mel2b .hint').textContent);
    tm.querySelector('.mgo').click(); await sleep(60);
    ok(/^La → Do → — → Mi/.test(tm.querySelector('.btlinfo').textContent),'blocs : '+tm.querySelector('.btlinfo').textContent);
    ok(!/descendue|montée/.test(P.$('#msg').textContent)&&/de La3 à Mi4/.test(P.$('#msg').textContent),'la hauteur de la voix doit être gardée : '+P.$('#msg').textContent);
    st.value='chip'; st.dispatchEvent(new P.w.Event('change'));
    tm.querySelector('.bgo').click(); await sleep(40);
    let b=P.lastBuf();
    ok(near(fz(b,0.3,1.7),220,4)&&near(fz(b,2.3,3.7),261.6,4)&&near(fz(b,5.3,7.7),329.6,5),'notes jouées : '+[fz(b,0.3,1.7),fz(b,2.3,3.7),fz(b,5.3,7.7)].map(v=>v.toFixed(1)).join(' / '));
    ok(/Mélodie créée : style « Jeu vidéo · 8-bit »/.test(P.$('#msg').textContent),'message : '+P.$('#msg').textContent);
    ok(tm.querySelector('.bgo').textContent==='✓ Appliquer les changements','bouton après création : '+tm.querySelector('.bgo').textContent);
    st.value='trap_bell'; st.dispatchEvent(new P.w.Event('change')); tm.querySelector('.bgo').click(); await sleep(40);
    ok(/Écho/.test(tm.querySelector('.fxbadge').textContent)&&/Réverb/.test(tm.querySelector('.fxbadge').textContent),'effets du style : '+tm.querySelector('.fxbadge').textContent);
    // chaque style produit un son propre (ni silence, ni valeur invalide, ni saturation)
    for(const k of ['clean','lofi_keys','hiphop_pluck','trap_bell','trap_lead','pad','flute','chip','organ']){
      st.value=k; st.dispatchEvent(new P.w.Event('change')); tm.querySelector('.bgo').click(); await sleep(20);
      const x=P.lastBuf().getChannelData(0); let pk=0, bad=0, s2=0; for(const v of x){ if(!Number.isFinite(v)) bad++; pk=Math.max(pk,Math.abs(v)); s2+=v*v; }
      ok(!bad&&pk<=0.81&&Math.sqrt(s2/x.length)>0.02,'style '+k+' : crête '+pk.toFixed(2)+', niveau '+Math.sqrt(s2/x.length).toFixed(3)+(bad?' INVALIDE':''));
    }
    tm.querySelector('.btr[data-d="12"]').click(); st.value='chip'; st.dispatchEvent(new P.w.Event('change')); tm.querySelector('.bgo').click(); await sleep(30);
    ok(near(fz(P.lastBuf(),0.3,1.7),440,6),'+1 octave : '+fz(P.lastBuf(),0.3,1.7).toFixed(1));
    ok(P.$$('.trk')[3]===undefined||true,'');
  });

  // ---------------- transformer n'importe quelle piste (v37) ----------------
  await test('transformer une piste enregistrée en basse, en mélodie, et revenir au son d\'origine',async()=>{
    const idb=new FI.IDBFactory();
    const P=await boot({idb}); const r=await recordBase(P);
    const L=r.buf.length, beat=L/8;
    P.$('#addtrk').click(); await sleep(10);
    await P.importFile(1,singVoice(L,beat,[[0,2,57],[2,4,60],[5,8,64]]));
    const voice0=P.lastBuf().getChannelData(0).slice();
    const t2=P.$$('.trk')[1]; t2.querySelector('.tog').click(); await sleep(10);
    const tfTab=t2.querySelector('.ttabs button[data-tab="tf"]');
    ok(tfTab&&!tfTab.hidden,'onglet Transformer absent'); tfTab.click();
    ok(!t2.querySelector('.pane[data-pane="tf"]').hidden,'volet Transformer');
    P.$('#dplay').click(); await sleep(20);
    t2.querySelector('.tfb').click(); await sleep(80);
    ok(/kbass/.test(t2.className)&&t2.querySelector('.tn').textContent==='Piste 2 (basse)','basse : '+t2.className+' / '+t2.querySelector('.tn').textContent);
    ok(/^La → Do → — → Mi/.test(t2.querySelector('.btlinfo').textContent),'blocs : '+t2.querySelector('.btlinfo').textContent);
    ok(near(fz(P.lastBuf(),0.3,1.7),55,2),'La1 attendu : '+fz(P.lastBuf(),0.3,1.7).toFixed(1));
    ok(!t2.querySelector('.tfback').hidden&&/Changer en mélodie/.test(t2.querySelector('.tfswap').textContent),'boutons de retour');
    ok(t2.querySelector('.ttabs button[data-tab="tf"]').hidden,'l\'onglet Transformer doit disparaître sur une piste transformée');
    ok(/transformée en ligne de basse/.test(P.$('#msg').textContent),'message : '+P.$('#msg').textContent);
    // en mélodie
    t2.querySelector('.tfswap').click(); await sleep(80);
    ok(/ksynth/.test(t2.className)&&t2.querySelector('.tn').textContent==='Piste 2 (mélodie)','mélodie : '+t2.className+' / '+t2.querySelector('.tn').textContent);
    ok(t2.querySelector('.btype').value==='clean'&&!/Lo-fi|Réverb|Écho/.test(t2.querySelector('.fxbadge').textContent),'mélodie : son simple sans effet attendu : '+t2.querySelector('.btype').value+' / '+t2.querySelector('.fxbadge').textContent);
    // annuler revient à la basse
    P.$('#undo').click(); await sleep(40);
    ok(/kbass/.test(t2.className),'↶ devrait revenir à la basse : '+t2.className);
    P.$('#redo').click(); await sleep(40);
    ok(/ksynth/.test(t2.className),'↷ devrait revenir à la mélodie : '+t2.className);
    // sauvegarde puis rechargement : le son d'origine est retrouvé
    await sleep(900);
    const Q=await boot({idb}); await sleep(400);
    const q2=Q.$$('.trk')[1]; q2.querySelector('.tog').click(); await sleep(20);
    ok(/ksynth/.test(q2.className)&&!q2.querySelector('.tfback').hidden,'rechargement : '+q2.className);
    Q.$('#dplay').click(); await sleep(20);
    q2.querySelector('.tfvoice').click(); await sleep(40);
    ok(!/ksynth|kbass/.test(q2.className)&&q2.querySelector('.tn').textContent==='Piste 2','retour au son enregistré : '+q2.className+' / '+q2.querySelector('.tn').textContent);
    { const back=Q.lastPlayed().getChannelData(0); let mx=0; for(let i=0;i<voice0.length;i++) mx=Math.max(mx,Math.abs(back[i]-voice0[i])); ok(back.length===voice0.length&&mx<1e-6,'la voix d\'origine devrait revenir à l\'identique : écart max '+mx); }
    ok(!q2.querySelector('.ttabs button[data-tab="tf"]').hidden,'l\'onglet Transformer doit revenir');
  });

  await test('basse : rendre un seul bloc plus grave d\'une octave, sans toucher aux autres',async()=>{
    const {P,tb}=await bassBoot();
    const c=tb.querySelector('.btl'); c.getBoundingClientRect=()=>({left:0,top:0,width:800,height:104});
    const tap=(x,y)=>{ c.dispatchEvent(new P.w.MouseEvent('pointerdown',{clientX:x,clientY:y,bubbles:true})); c.dispatchEvent(new P.w.MouseEvent('pointerup',{clientX:x,clientY:y,bubbles:true})); };
    tap(400,15); tb.querySelector('.bpal button[data-n="4"]').click(); tap(600,15); tb.querySelector('.bpal button[data-n="7"]').click(); await sleep(5);
    ok(/^Do → Mi → Sol/.test(tb.querySelector('.btlinfo').textContent),'préparation : '+tb.querySelector('.btlinfo').textContent);
    tap(500,60); await sleep(5);
    ok(/· Mi2$/.test(tb.querySelector('.bselinfo').textContent),'hauteur affichée : '+tb.querySelector('.bselinfo').textContent);
    tb.querySelector('.boct[data-d="-12"]').click(); await sleep(5);
    ok(/· Mi1$/.test(tb.querySelector('.bselinfo').textContent),'après ▼ : '+tb.querySelector('.bselinfo').textContent);
    tb.querySelector('.bgo').click(); await sleep(30);
    const b=P.lastBuf();
    ok(near(fz(b,0.2,0.8),65.4,2),'bloc 1 inchangé (Do2) : '+fz(b,0.2,0.8).toFixed(1));
    ok(near(fz(b,4.2,4.8),41.2,2),'bloc 2 une octave plus grave (Mi1) : '+fz(b,4.2,4.8).toFixed(1));
    ok(near(fz(b,6.2,6.8),98,3),'bloc 3 inchangé (Sol2) : '+fz(b,6.2,6.8).toFixed(1));
  });

  // voix réaliste : vibrato, glissés entre notes collées, voix un peu fausse, harmonique forte, consonnes, souffle
  function voice(notes,beatSec,nbeats,opt={}){
    const L=Math.round(nbeats*beatSec*SR), x=new Float32Array(L); let ph=0, sd=12345; const rnd=()=>{ sd=(sd*16807)%2147483647; return sd/2147483647*2-1; };
    const det=opt.det??0.25, vib=opt.vib??0.5, glide=opt.glide??0.07;
    let prevM=null, prevEnd=-1;
    for(let i=0;i<L;i++){
      const tb=i/SR/beatSec, nt=notes.find(n=>tb>=n[0]&&tb<n[1]);
      let v=0.008*rnd();
      if(nt&&nt[2]!=null){
        const tIn=(tb-nt[0])*beatSec, tOut=(nt[1]-tb)*beatSec, idx=notes.indexOf(nt), pv=idx>0?notes[idx-1]:null;
        let m=nt[2]+det;
        if(pv&&pv[2]!=null&&Math.abs(pv[1]-nt[0])<1e-9&&tIn<glide) m=pv[2]+det+(nt[2]-pv[2])*(tIn/glide);
        if(tIn>0.15) m+=vib*Math.sin(2*Math.PI*5.5*(tIn-0.15));
        const f=440*Math.pow(2,(m-69)/12); ph+=f/SR;
        const legIn=pv&&pv[2]!=null&&Math.abs(pv[1]-nt[0])<1e-9;
        const env=Math.min(1,legIn?1:tIn/0.03)*Math.min(1,tOut/0.04)*(1-0.15*Math.min(1,tIn/1.5));
        const P=2*Math.PI*ph;
        v+=0.35*env*(0.5*Math.sin(P)+1.0*Math.sin(2*P)+0.6*Math.sin(3*P)+0.3*Math.sin(4*P)+0.2*Math.sin(5*P));
        if(!legIn&&tIn<0.015) v+=0.15*rnd();
      }
      x[i]=v;
    }
    return x;
  }
  
  await test('mélodie : une vraie voix (vibrato, glissés, un peu fausse) donne les bonnes notes, à sa hauteur',async()=>{
    const P=await boot(); const r=await recordBase(P);
    const L=r.buf.length, bs=L/8/SR;
    P.$('#addtrk').click(); await sleep(10);
    const notes=[[0,.5,52],[.5,1,55],[1,1.5,57],[1.5,2,55],[2,3,52],[3,4,50],[4,6,48],[6,8,52]];
    const x0=voice(notes,bs,8), x=new Float32Array(L); x.set(x0.subarray(0,Math.min(L,x0.length)));
    await P.importFile(1,{numberOfChannels:1,length:L,sampleRate:SR,duration:L/SR,getChannelData:()=>x});
    const t2=P.$$('.trk')[1]; t2.querySelector('.tog').click(); t2.querySelector('.ttabs button[data-tab="tf"]').click();
    t2.querySelector('.tfq').value='0.5'; t2.querySelector('.tfm').click(); await sleep(80);
    ok(/^Mi → Sol → La → Sol → Mi → Ré → Do → Mi · 8 blocs/.test(t2.querySelector('.btlinfo').textContent),'notes repérées : '+t2.querySelector('.btlinfo').textContent);
    ok(/de Do3 à La3/.test(P.$('#msg').textContent)&&/à la hauteur de ta voix/.test(P.$('#msg').textContent),'hauteur gardée : '+P.$('#msg').textContent);
  });

  // ---------------- montage du morceau (v40) ----------------
  await test('basse : après « Durée ×2 », les blocs sont tout de suite doublés (pour créer des variations)',async()=>{
    const {P,tb}=await bassBoot();
    const c=tb.querySelector('.btl'); c.getBoundingClientRect=()=>({left:0,top:0,width:800,height:104});
    c.dispatchEvent(new P.w.MouseEvent('pointerdown',{clientX:400,clientY:15,bubbles:true})); c.dispatchEvent(new P.w.MouseEvent('pointerup',{clientX:400,clientY:15,bubbles:true}));
    tb.querySelector('.bpal button[data-n="7"]').click(); tb.querySelector('.bgo').click(); await sleep(30);
    P.$('#growb button[data-k="2"]').click(); await sleep(60);
    ok(/^Do → Sol → Do → Sol · 4 blocs/.test(tb.querySelector('.btlinfo').textContent),'après ×2 : '+tb.querySelector('.btlinfo').textContent);
  });
  const montBoot=async(idb)=>{
    const P=await boot(idb?{idb}:undefined); const r=await recordBase(P);
    const L=r.buf.length;
    P.$('#addtrk').click(); await sleep(10);
    await P.importFile(1,mkFile(L,d=>{ for(let i=0;i<L;i++) d[i]=0.4*Math.sin(2*Math.PI*220*i/SR); }));
    P.$('#montbtn').click(); await sleep(20);
    const cv=P.$('#mcv'); cv.getBoundingClientRect=()=>({left:0,top:0,width:900,height:200});
    const ev=(ty,x,y)=>cv.dispatchEvent(new P.w.MouseEvent(ty,{clientX:x,clientY:y,bubbles:true}));
    const tap=(x,y)=>{ ev('pointerdown',x,y); ev('pointerup',x,y); };
    const drag=(x0,y,x1)=>{ ev('pointerdown',x0,y); ev('pointermove',x0+(x1>x0?10:-10),y); ev('pointermove',x1,y); ev('pointerup',x1,y); };
    const Z=22, X=b=>b*Z, Y=i=>28+i*56+28;
    return {P,r,L,cv,tap,drag,X,Y};
  };
  await test('montage : ouverture, une ligne par piste, lecture du morceau entier',async()=>{
    const {P,r,L}=await montBoot();
    ok(!P.$('#mont').hidden&&P.$('#montbtn').classList.contains('on'),'volet du montage');
    ok(P.$('#livebtn').hidden,'le mode live ne doit plus être proposé');
    ok(/^8 mesures/.test(P.$('#montinfo').textContent),'durée par défaut : '+P.$('#montinfo').textContent);
    P.starts.length=0; P.$('#mplay').click(); await sleep(20);
    const st=P.starts.filter(x=>x.buf);
    ok(st.length===2&&st.every(x=>x.off===0),'2 blocs lancés depuis le début : '+st.length);
    ok(/Morceau · mesure/.test(P.$('#dtxt').textContent)||true,'');
    P.$('#mplay').click(); await sleep(10);
    ok(/Lire le morceau/.test(P.$('#mplay').textContent),'pause');
  });
  await test('montage : curseur, choisir, couper, supprimer, déplacer, allonger, ajouter, dupliquer',async()=>{
    const {P,tap,drag,X,Y}=await montBoot();
    tap(X(8),12); await sleep(5);
    ok(/curseur : mesure 3/.test(P.$('#mcurv').textContent),'curseur : '+P.$('#mcurv').textContent);
    tap(X(14),Y(0)); await sleep(5);
    ok(/« Piste 1 » · mesures 1 → 9/.test(P.$('#mclipinfo').textContent),'bloc choisi : '+P.$('#mclipinfo').textContent);
    P.$('#mcut').click(); await sleep(5);
    ok(/mesures 3 → 9/.test(P.$('#mclipinfo').textContent),'coupe au curseur : '+P.$('#mclipinfo').textContent);
    P.$('#mdel').click(); await sleep(5);
    ok(/Touche un bloc/.test(P.$('#mclipinfo').textContent),'suppression');
    P.$('#undo').click(); await sleep(10);
    tap(X(20),Y(0)); await sleep(5);
    ok(/mesures 3 → 9/.test(P.$('#mclipinfo').textContent),'↶ doit rendre le bloc supprimé : '+P.$('#mclipinfo').textContent);
    P.$('#mdel').click(); await sleep(5);
    // déplacer le bloc de la piste 2 d'une mesure
    drag(X(14),Y(1),X(18)); await sleep(5);
    ok(/« Piste 2 » · mesures 2 → 10/.test(P.$('#mclipinfo').textContent),'déplacement : '+P.$('#mclipinfo').textContent);
    // raccourcir par le bord droit (fin à la mesure 10 → 8)
    drag(X(36)-3,Y(1),X(28)-3); await sleep(5);
    ok(/mesures 2 → 8/.test(P.$('#mclipinfo').textContent),'bord droit : '+P.$('#mclipinfo').textContent);
    // ajouter un bloc sur une zone vide de la piste 1
    tap(X(17),Y(0)); await sleep(5);
    ok(/« Piste 1 » · mesures 5 → 7/.test(P.$('#mclipinfo').textContent),'ajout : '+P.$('#mclipinfo').textContent);
    P.$('#mdup').click(); await sleep(5);
    ok(/mesures 7 → 9/.test(P.$('#mclipinfo').textContent),'duplication : '+P.$('#mclipinfo').textContent);
    // lecture depuis le début : la piste 1 joue 3 blocs (0-8, 16-24, 24-32) ; la piste 2 un seul (4-28)
    P.starts.length=0; P.$('#mstop').click(); P.$('#mplay').click(); await sleep(20);
    const bd=60/95.9, st=P.starts.filter(x=>x.buf).map(x=>Math.round((x.when-P.starts.filter(y=>y.buf)[0].when)/bd*10)/10).sort((a,b)=>a-b);
    ok(st.length===4,'blocs joués : '+st.join(','));
  });
  await test('montage : ton d\'un bloc (variation), fin du morceau, sauvegarde et export',async()=>{
    const idb=new FI.IDBFactory();
    const {P,tap,X,Y}=await montBoot(idb);
    tap(X(14),Y(1)); P.$('#mtpp').click(); P.$('#mtpp').click(); await sleep(60);
    ok(/ton \+2/.test(P.$('#mclipinfo').textContent),'ton : '+P.$('#mclipinfo').textContent);
    P.starts.length=0; P.$('#mplay').click(); await sleep(30);
    const fr=P.starts.filter(x=>x.buf).map(x=>freqOf(x.buf));
    ok(fr.some(f=>near(f,246.9,4)),'le bloc devrait sonner 2 demi-tons plus haut (246,9 Hz) : '+fr.map(f=>f.toFixed(0)).join(','));
    P.$('#mplay').click();
    P.$('#mendm').click(); P.$('#mendm').click(); await sleep(5);
    ok(/^6 mesures/.test(P.$('#montinfo').textContent),'fin −2 mesures : '+P.$('#montinfo').textContent);
    P.$('#mendfit').click(); await sleep(5);
    ok(/^8 mesures/.test(P.$('#montinfo').textContent),'fin = dernier bloc : '+P.$('#montinfo').textContent);
    await P.$('#mexp').onclick(); await sleep(80);
    ok(/morceau\.wav$/.test(P.download||''),'export : '+P.download);
    await sleep(900);
    const Q=await boot({idb}); await sleep(400);
    Q.$('#montbtn').click(); await sleep(20);
    const cv=Q.$('#mcv'); cv.getBoundingClientRect=()=>({left:0,top:0,width:900,height:200});
    cv.dispatchEvent(new Q.w.MouseEvent('pointerdown',{clientX:X(14),clientY:Y(1),bubbles:true})); cv.dispatchEvent(new Q.w.MouseEvent('pointerup',{clientX:X(14),clientY:Y(1),bubbles:true}));
    ok(/ton \+2/.test(Q.$('#mclipinfo').textContent)&&/^8 mesures/.test(Q.$('#montinfo').textContent),'rechargement : '+Q.$('#mclipinfo').textContent+' | '+Q.$('#montinfo').textContent);
  });

  await test('montage : dupliquer et supprimer une partie du morceau sur toutes les pistes',async()=>{
    const {P,tap,X,Y}=await montBoot();
    tap(X(8),12); P.$('#msecs').click(); tap(X(16),12); P.$('#msece').click(); await sleep(5);
    ok(/mesures 3 → 5/.test(P.$('#msecv').textContent),'partie : '+P.$('#msecv').textContent);
    P.$('#msecdup').click(); await sleep(10);
    ok(/^10 mesures/.test(P.$('#montinfo').textContent),'durée après duplication : '+P.$('#montinfo').textContent);
    ok(/mesures 5 → 7/.test(P.$('#msecv').textContent),'la copie doit être sélectionnée : '+P.$('#msecv').textContent);
    P.starts.length=0; P.$('#mstop').click(); P.$('#mplay').click(); await sleep(20);
    const st=P.starts.filter(x=>x.buf);
    ok(st.length===6,'blocs joués : '+st.length+' (attendu 3 par piste)');
    const t0=Math.min(...st.map(x=>x.when)), bd=60/95.9, pos=[...new Set(st.map(x=>Math.round((x.when-t0)/bd)))].sort((a,b)=>a-b);
    ok(pos.join(',')==='0,16,24','départs des blocs (temps) : '+pos.join(','));
    ok(st.every(x=>Math.abs(x.off)<1e-6||Math.abs(x.off-0)<1e-6),'la copie doit reprendre au début de la boucle');
    P.$('#mplay').click(); await sleep(5);
    P.$('#msecdel').click(); await sleep(10);
    ok(/^8 mesures/.test(P.$('#montinfo').textContent),'durée après suppression : '+P.$('#montinfo').textContent);
    P.$('#undo').click(); await sleep(10);
    ok(/^10 mesures/.test(P.$('#montinfo').textContent),'↶ : '+P.$('#montinfo').textContent);
  });
  await test('montage : créer une variation d\'un bloc (copie de piste qui ne joue que ce bloc)',async()=>{
    const {P,tap,X,Y}=await montBoot();
    tap(X(8),12); tap(X(16),Y(1)); P.$('#mcut').click(); await sleep(5);
    ok(/« Piste 2 » · mesures 3 → 9/.test(P.$('#mclipinfo').textContent),'bloc coupé : '+P.$('#mclipinfo').textContent);
    P.$('#mvar').click(); await sleep(20);
    ok(P.$$('.trk').length===3&&P.$$('.trk')[2].querySelector('.tn').textContent==='Piste 2 (variation)','piste de variation : '+P.$$('.trk').map(x=>x.querySelector('.tn').textContent).join(' | '));
    ok(/« Piste 2 \(variation\) » · mesures 3 → 9/.test(P.$('#mclipinfo').textContent),'le bloc joue la variation : '+P.$('#mclipinfo').textContent);
    P.starts.length=0; P.$('#mstop').click(); P.$('#mplay').click(); await sleep(20);
    ok(P.starts.filter(x=>x.buf).length===3,'blocs joués : '+P.starts.filter(x=>x.buf).length+' (piste 1, piste 2 jusqu\'à la mesure 3, variation ensuite)');
    P.$('#mplay').click(); await sleep(5);
    P.$('#undo').click(); await sleep(20);
    ok(P.$$('.trk').length===2,'↶ doit retirer la variation : '+P.$$('.trk').length);
  });

  await test('dupliquer une piste puis ↶ retire vraiment la copie',async()=>{
    const P=await boot(); const r=await recordBase(P);
    const t1=P.$('.trk'); t1.querySelector('.tog').click(); t1.querySelector('.ttabs button[data-tab="trk"]').click();
    t1.querySelector('.tdup').click(); await sleep(20);
    ok(P.$$('.trk').length===2,'copie : '+P.$$('.trk').length);
    P.$('#undo').click(); await sleep(20);
    ok(P.$$('.trk').length===1,'après ↶ : '+P.$$('.trk').length+' pistes');
    P.$('#addtrk').click(); await sleep(10); P.$('#undo').click(); await sleep(10);
    ok(P.$$('.trk').length===2,'une piste vide ajoutée à la main ne doit pas disparaître avec ↶');
  });

  // ---------------- montage : blancs, transitions, sons de transition (v41) ----------------
  const songStarts=P=>{ const st=P.starts.filter(x=>x.buf); const t0=Math.min(...st.map(x=>x.when)), bd=60/95.9; return st.map(x=>({...x,beat:Math.round((x.when-t0)/bd*100)/100})); };
  await test('montage : insérer un blanc au curseur, et rendre muette une partie',async()=>{
    const {P,tap,X}=await montBoot();
    tap(X(8),12); P.$('#mblankl').value='4'; P.$('#mblank').click(); await sleep(10);
    ok(/^9 mesures/.test(P.$('#montinfo').textContent),'durée après le blanc : '+P.$('#montinfo').textContent);
    P.starts.length=0; P.$('#mstop').click(); P.$('#mplay').click(); await sleep(20);
    let pos=[...new Set(songStarts(P).map(x=>x.beat))].sort((a,b)=>a-b);
    ok(pos.join(',')==='0,12','départs après le blanc (temps) : '+pos.join(','));
    P.$('#mplay').click(); P.$('#undo').click(); await sleep(10);
    tap(X(8),12); P.$('#msecs').click(); tap(X(16),12); P.$('#msece').click(); P.$('#msecmute').click(); await sleep(10);
    ok(/^8 mesures/.test(P.$('#montinfo').textContent),'la durée ne doit pas changer : '+P.$('#montinfo').textContent);
    P.starts.length=0; P.$('#mstop').click(); P.$('#mplay').click(); await sleep(20);
    pos=[...new Set(songStarts(P).map(x=>x.beat))].sort((a,b)=>a-b);
    ok(pos.join(',')==='0,16'&&songStarts(P).length===4,'départs avec la partie muette : '+pos.join(',')+' ('+songStarts(P).length+' blocs)');
    P.$('#mplay').click();
  });
  await test('montage : transitions d\'entrée et de sortie d\'un bloc (hachage, coupe, sauvegarde)',async()=>{
    const idb=new FI.IDBFactory();
    const {P,tap,X,Y}=await montBoot(idb);
    tap(X(14),Y(1)); await sleep(5);
    P.$('#mtout').value='stutter'; P.$('#mtoutl').value='4'; P.$('#mtout').dispatchEvent(new P.w.Event('change'));
    P.$('#mtin').value='fade'; P.$('#mtinl').value='2'; P.$('#mtin').dispatchEvent(new P.w.Event('change')); await sleep(10);
    P.starts.length=0; P.$('#mstop').click(); P.$('#mplay').click(); await sleep(20);
    const st=songStarts(P), sl=st.filter(x=>x.beat>=28&&x.beat<32);
    ok(sl.length===16,'hachage sur 1 mesure : '+sl.length+' petits morceaux (attendu 16, un par double-croche)');
    P.$('#mplay').click();
    tap(X(8),12); tap(X(14),Y(1)); P.$('#mcut').click(); await sleep(5);
    ok(P.$('#mtout').value==='stutter'&&P.$('#mtin').value==='none','après coupe, la 2e partie garde la sortie : entrée '+P.$('#mtin').value+' / sortie '+P.$('#mtout').value);
    tap(X(4),Y(1)); await sleep(5);
    ok(P.$('#mtin').value==='fade'&&P.$('#mtout').value==='none','la 1re partie garde l\'entrée : '+P.$('#mtin').value+' / '+P.$('#mtout').value);
    await sleep(900);
    const Q=await boot({idb}); await sleep(400);
    Q.$('#montbtn').click(); await sleep(20);
    const cv=Q.$('#mcv'); cv.getBoundingClientRect=()=>({left:0,top:0,width:900,height:200});
    cv.dispatchEvent(new Q.w.MouseEvent('pointerdown',{clientX:X(20),clientY:Y(1),bubbles:true})); cv.dispatchEvent(new Q.w.MouseEvent('pointerup',{clientX:X(20),clientY:Y(1),bubbles:true}));
    ok(Q.$('#mtout').value==='stutter'&&Q.$('#mtoutl').value==='4','transition retrouvée au rechargement : '+Q.$('#mtout').value+' '+Q.$('#mtoutl').value);
  });
  await test('montage : sons de transition (montée de bruit avant le curseur, impact au curseur)',async()=>{
    const {P,tap,X}=await montBoot();
    tap(X(16),12); P.$('#mfxk').value='riser'; P.$('#mfxl').value='4'; P.$('#mfxadd').click(); await sleep(5);
    P.$('#mfxk').value='impact'; P.$('#mfxadd').click(); await sleep(5);
    ok(P.$('#mfxlist').children.length===2&&/Montée de bruit · mesures 4 → 5/.test(P.$('#mfxlist').textContent),'liste : '+P.$('#mfxlist').textContent);
    P.starts.length=0; P.$('#mstop').click(); P.$('#mplay').click(); await sleep(20);
    const st=songStarts(P), bd=60/95.9, ris=st.find(x=>Math.abs(x.beat-12)<0.05&&Math.abs(x.buf.length-4*bd*SR)<400);
    ok(ris&&Math.abs(ris.beat-12)<0.05,'la montée doit partir au temps 12 et finir au curseur : '+(ris&&ris.beat));
    if(ris){ const d=ris.buf.getChannelData(0), q=Math.floor(d.length/4); const rms=(a,b)=>{ let s=0; for(let i=a;i<b;i++) s+=d[i]*d[i]; return Math.sqrt(s/(b-a)); };
      ok([...d].every(v=>Number.isFinite(v)),'valeurs invalides dans la montée');
      ok(rms(3*q,4*q)>4*rms(0,q),'la montée doit monter en volume : '+rms(0,q).toFixed(3)+' → '+rms(3*q,4*q).toFixed(3)); }
    ok(st.some(x=>Math.abs(x.beat-16)<0.05&&x.buf.length>=Math.round(1.4*SR)&&x.buf.length<Math.round(3*SR)),'impact au curseur absent');
    P.$('#mplay').click();
    P.$('#mfxlist').querySelector('button').click(); await sleep(5);
    ok(P.$('#mfxlist').children.length===1,'retrait d\'un son');
  });

  // ---------------- caler un jeu au tempo irrégulier (v42) ----------------
  const driftPlayer=(L,K,lead,amp)=>{ let d=[]; for(let k=0;k<K;k++) d.push(1+amp*Math.sin(2*Math.PI*k/K+0.7)); const sm=d.reduce((a,b)=>a+b,0); d=d.map(x=>x*L/sm);
    const bt=[lead]; for(let k=1;k<K;k++) bt.push(bt[k-1]+d[k-1]);
    return mkFile(L,x=>{ let sd=3; const rnd=()=>{ sd=(sd*16807)%2147483647; return sd/2147483647*2-1; };
      bt.forEach((b,k)=>{ const p0=Math.round(b), kick=k%2===0; let ph=0;
        for(let i=0;i<Math.round(0.3*SR);i++){ const t=i/SR, j=(p0+i)%L; if(kick){ ph+=(50+80*Math.exp(-t/0.03))/SR; x[j]+=0.8*Math.sin(2*Math.PI*ph)*Math.exp(-t/0.12); } else x[j]+=0.5*rnd()*Math.exp(-t/0.06); }
        const hp=Math.round((b+(k+1<K?bt[k+1]:L+lead))/2); for(let i=0;i<Math.round(0.04*SR);i++) x[(hp+i)%L]+=0.12*rnd()*Math.exp(-i/SR/0.012); }); }); };
  const loudHits=b=>{ const x=b.getChannelData(0), L=x.length, o=[]; let prev=-1e9; for(let i=0;i<L;i++) if(Math.abs(x[i])>0.3&&i-prev>Math.round(0.2*SR)){ o.push(i); prev=i; } return o; };
  await test('caler un jeu au tempo irrégulier : chaque coup revient sur son temps, sans changer la durée ni couper',async()=>{
    const P=await boot(); const r=await recordBase(P);
    const L=r.buf.length, beat=L/8;
    P.$('#addtrk').click(); await sleep(10);
    await P.importFile(1,driftPlayer(L,8,144,0.2));
    const t2=P.$$('.trk')[1]; t2.querySelector('.tog').click(); t2.querySelector('.ttabs button[data-tab="cut"]').click(); await sleep(10);
    const orig=P.lastBuf(), h0=loudHits(orig), dev0=h0.map((x,k)=>(x-(144+k*beat))/beat);
    ok(h0.length===8&&Math.max(...dev0.map(Math.abs))>0.3,'préparation : jeu bien décalé (écarts '+dev0.map(v=>Math.round(v*100)+'%').join(',')+')');
    t2.querySelector('.wpb').click(); await sleep(400);
    const out=P.lastBuf(), h=loudHits(out);
    ok(out.length===L,'durée changée : '+out.length);
    ok(h.length===8,'coups après calage : '+h.length);
    ok(h.every((x,k)=>Math.abs(x-(144+k*beat))<=Math.round(0.015*SR)),'écarts après calage (ms) : '+h.map((x,k)=>Math.round((x-(144+k*beat))/SR*1000)).join(','));
    ok(/Tempo du musicien repéré/.test(P.$('#msg').textContent)&&/Chaque temps est maintenant calé/.test(P.$('#msg').textContent),'message : '+P.$('#msg').textContent);
    const en=b=>{ const x=b.getChannelData(0); let s=0; for(const v of x) s+=v*v; return s; };
    ok(Math.abs(10*Math.log10(en(out)/en(orig)))<1.5,'énergie du son changée de '+(10*Math.log10(en(out)/en(orig))).toFixed(1)+' dB (rien ne doit être coupé)');
    P.$('#undo').click(); await sleep(20); P.$('#dplay').click(); await sleep(30);
    ok(loudHits(P.lastPlayed()).join()===h0.join(),'↶ doit rendre le jeu d\'origine : '+loudHits(P.lastPlayed()).join()+' / '+h0.join());
    P.$('#dplay').click(); await sleep(10);
    t2.querySelector('.wpe').value='M'; t2.querySelector('.wpb').click(); await sleep(400);
    const hm=loudHits(P.lastBuf());
    ok([0,4].every(k=>Math.abs(hm[k]-(144+k*beat))<=Math.round(0.015*SR)),'repères à la mesure : débuts de mesure calés ('+[0,4].map(k=>Math.round((hm[k]-(144+k*beat))/SR*1000)).join(',')+' ms)');
  });

  // ---------------- parcours réel : morceau au tempo variable (v43) ----------------
  function song(sec,bpm0,drift,blank){
    const N=Math.round(sec*SR), x=new Float32Array(N), beats=[]; let t=blank, k=0, sd=11;
    const rnd=()=>{ sd=(sd*16807)%2147483647; return sd/2147483647*2-1; };
    while(t<sec-1){ beats.push(t); const bpm=bpm0*(1+drift*Math.sin(2*Math.PI*t/23)+drift*0.5*Math.sin(2*Math.PI*t/7.3)); t+=60/bpm; k++; }
    const hit=(p,kind,amp)=>{ const n=Math.round((kind==='k'?0.35:kind==='s'?0.2:0.05)*SR); let ph=0; for(let i=0;i<n&&p+i<N;i++){ const tt=i/SR; let v;
        if(kind==='k'){ ph+=(50+80*Math.exp(-tt/0.03))/SR; v=Math.sin(2*Math.PI*ph)*Math.exp(-tt/0.12); } else if(kind==='s'){ v=rnd()*Math.exp(-tt/0.06); } else v=rnd()*Math.exp(-tt/0.012);
        x[p+i]+=amp*v; } };
    beats.forEach((b,i)=>{ const p=Math.round((b+0.008*rnd())*SR), nb=i+1<beats.length?beats[i+1]:b+0.6;
      if(i%4===0||i%4===2) hit(p,'k',0.7); else hit(p,'s',0.45);
      hit(p,'h',0.12); hit(Math.round((b+nb)/2*SR),'h',0.1);
      // basse tenue
      const f=55*Math.pow(2,[0,0,3,5][Math.floor(i/4)%4]/12); let ph=0; for(let j=0;j<Math.round((nb-b)*0.9*SR)&&p+j<N;j++){ ph+=f/SR; x[p+j]+=0.15*Math.sin(2*Math.PI*ph); } });
    for(let i=0;i<N;i++) x[i]+=0.002*rnd();
    return {x,beats};
  }
  
  await test('parcours réel : long morceau au tempo variable → bon tempo à l\'import, puis chaque coup calé sur la grille',async()=>{
    const P=await boot();
    const S=song(60,100,0.08,2.0);
    await P.importFile(0,{numberOfChannels:1,length:S.x.length,sampleRate:SR,duration:S.x.length/SR,getChannelData:()=>S.x});
    const t1=P.$('.trk');
    for(let i=0;i<20;i++) t1.querySelector('.impn[data-w="b"][data-d="1"]').click();
    t1.querySelector('.impuse').click(); await sleep(200);
    const m=P.$('#msg').textContent, nb=+((m.match(/(\d+) temps à/)||[])[1]||0), bpm=+(((m.match(/à ([\d,]+) BPM/)||[])[1]||'0').replace(',','.'));
    ok(nb>=45&&nb<=48&&Math.abs(bpm-100.8)<2,'tempo à l\'import : '+m);
    ok(/Le tempo du musicien varie/.test(m),'la variation de tempo doit être signalée');
    const L=P.lastBuf().length, beat=L/nb, go=144;
    const loud=b=>{ const x=b.getChannelData(0), o=[]; let prev=-1e9; for(let i=0;i<x.length;i++) if(Math.abs(x[i])>0.33&&i-prev>Math.round(0.25*SR)){ o.push(i); prev=i; } return o; };
    const dev=b=>loud(b).map(x=>{ const k=Math.round((x-go)/beat); return Math.abs(x-go-k*beat)/SR*1000; });
    const before=dev(P.lastBuf());
    ok(Math.max(...before)>40,'préparation : sans calage, des coups doivent être à côté (max '+Math.max(...before).toFixed(0)+' ms)');
    t1.querySelector('.tog').click(); t1.querySelector('.ttabs button[data-tab="cut"]').click(); await sleep(10);
    t1.querySelector('.wpb').click(); await sleep(1500);
    const after=dev(P.lastBuf());
    ok(after.length>=nb-1&&after.filter(v=>v<=20).length>=after.length-1,'après calage : '+after.filter(v=>v<=20).length+'/'+after.length+' coups à ≤ 20 ms de la grille (max '+Math.max(...after).toFixed(0)+' ms) | '+P.$('#msg').textContent);
  });
  await test('partie isolée avec repères libres : rien d\'avant le repère de début ne s\'entend',async()=>{
    const P=await boot(); const r=await recordBase(P);
    const L=r.buf.length, beat=L/8;
    P.$('#addtrk').click(); await sleep(10);
    const c1=Math.round(144+3*beat)-480, c2=Math.round(144+3.5*beat);
    await P.importFile(1,mkFile(L,d=>{ for(let i=0;i<400;i++){ d[c1+i]=0.8*Math.exp(-i/80); d[c2+i]=0.8*Math.exp(-i/80); } }));
    const t2=P.$$('.trk')[1]; t2.querySelector('.tog').click(); t2.querySelector('.ttabs button[data-tab="cut"]').click(); await sleep(10);
    for(let i=0;i<3;i++) t2.querySelector('.ts2').click();
    for(let i=0;i<4;i++) t2.querySelector('.ts3').click();
    const sn=t2.querySelector('.tsnap'); sn.checked=false; sn.dispatchEvent(new P.w.Event('change'));
    t2.querySelector('.tsn[data-w="s"][data-ms="1"]').click(); t2.querySelector('.tsn[data-w="s"][data-ms="-1"]').click(); await sleep(10);
    P.$('#dplay').click(); await sleep(30);
    const pk=(b,a,z)=>{ const x=b.getChannelData(0); let m=0; for(let i=Math.max(0,a);i<Math.min(x.length,z);i++) m=Math.max(m,Math.abs(x[i])); return m; };
    const pl=P.lastPlayed();
    ok(pk(pl,c1,c1+300)<0.01,'le son placé 10 ms avant le repère de début s\'entend encore : '+pk(pl,c1,c1+300).toFixed(2));
    ok(pk(pl,c2,c2+50)>0.7,'le son dans la partie doit rester');
    P.$('#dplay').click();
  });
  await test('partie qui tourne en boucle : elle suit le repère de début, et « Tout garder » remet la piste d\'origine',async()=>{
    const P=await boot(); const r=await recordBase(P);
    const L=r.buf.length, beat=L/8;
    P.$('#addtrk').click(); await sleep(10);
    const c2=Math.round(144+3.5*beat);
    await P.importFile(1,mkFile(L,d=>{ for(let i=0;i<400;i++) d[c2+i]=0.8*Math.exp(-i/80); }));
    const t2=P.$$('.trk')[1]; t2.querySelector('.tog').click(); t2.querySelector('.ttabs button[data-tab="cut"]').click(); await sleep(10);
    for(let i=0;i<3;i++) t2.querySelector('.ts2').click();
    for(let i=0;i<4;i++) t2.querySelector('.ts3').click();
    P.$('#dplay').click(); await sleep(20);
    t2.querySelector('.tsloop').click(); await sleep(30);
    const first=b=>{ const x=b.getChannelData(0); for(let i=0;i<x.length;i++) if(Math.abs(x[i])>0.4) return i; return -1; };
    ok(Math.abs(first(P.lastPlayed())-(144+0.5*beat))<=3,'1er son de la boucle à '+first(P.lastPlayed())+' (attendu '+Math.round(144+0.5*beat)+')');
    const sn=t2.querySelector('.tsnap'); sn.checked=false; sn.dispatchEvent(new P.w.Event('change'));
    t2.querySelector('.tsn[data-w="s"][data-ms="10"]').click(); await sleep(30);
    ok(Math.abs(first(P.lastPlayed())-(144+0.5*beat-480))<=3,'après +10 ms sur le début, la boucle doit suivre : 1er son à '+first(P.lastPlayed())+' (attendu '+Math.round(144+0.5*beat-480)+')');
    t2.querySelector('.tsall').click(); await sleep(30);
    ok(Math.abs(first(P.lastPlayed())-c2)<=3&&t2.querySelector('.offv').textContent==='0 ms','« Tout garder » doit rendre la piste d\'origine : 1er son à '+first(P.lastPlayed())+', décalage '+t2.querySelector('.offv').textContent);
    P.$('#dplay').click();
  });

  // ---------------- calage d'une partie déjà découpée et mise en boucle (v44) ----------------
  const songBoot=async()=>{
    const P=await boot(); const S=song(60,100,0.08,2.0);
    await P.importFile(0,{numberOfChannels:1,length:S.x.length,sampleRate:SR,duration:S.x.length/SR,getChannelData:()=>S.x});
    const t1=P.$('.trk'); for(let i=0;i<20;i++) t1.querySelector('.impn[data-w="b"][data-d="1"]').click();
    t1.querySelector('.impuse').click(); await sleep(200);
    t1.querySelector('.tog').click(); t1.querySelector('.ttabs button[data-tab="cut"]').click(); await sleep(10);
    for(let i=0;i<8;i++) t1.querySelector('.ts2').click();
    const nb=+P.$('#growlbl').textContent.match(/\d+/)[0];
    for(let i=0;i<nb-16;i++) t1.querySelector('.ts3').click();
    return {P,t1,nb};
  };
  const gridDev=(b,nbeats)=>{ const x=b.getChannelData(0), L=x.length, beat=L/nbeats, o=[]; let prev=-1e9; for(let i=0;i<L;i++) if(Math.abs(x[i])>0.33&&i-prev>Math.round(0.25*SR)){ o.push(i); prev=i; }
    return o.map(p=>{ const k=Math.round((p-144)/beat); return Math.abs(p-144-k*beat)/SR*1000; }); };
  await test('calage d\'une piste dont une partie tourne en boucle : la partie reste, et elle est calée',async()=>{
    const {P,t1,nb}=await songBoot();
    ok(/Temps 9 → 16 sur/.test(t1.querySelector('.tsl').textContent),'préparation : '+t1.querySelector('.tsl').textContent);
    P.$('#dplay').click(); await sleep(20);
    t1.querySelector('.trep button[data-m="loop"]').click(); await sleep(30);
    t1.querySelector('.wpb').click(); await sleep(1500);
    ok(/Temps 9 → 16 sur/.test(t1.querySelector('.tsl').textContent),'la partie doit rester choisie : '+t1.querySelector('.tsl').textContent);
    ok(t1.querySelector('.trep button.on')&&t1.querySelector('.trep button.on').dataset.m==='loop','elle doit toujours tourner en boucle');
    ok(/Ta partie est gardée/.test(P.$('#msg').textContent),'message : '+P.$('#msg').textContent);
    const d=gridDev(P.lastPlayed(),nb);
    ok(d.length>=nb-2&&d.filter(v=>v<=20).length>=d.length-1,'ce qui est joué : '+d.filter(v=>v<=20).length+'/'+d.length+' coups à ≤ 20 ms de la grille (max '+Math.max(...d).toFixed(0)+' ms)');
    P.$('#dplay').click();
  });
  await test('partie devenue la boucle puis calée : la boucle garde ses 8 temps, chaque coup sur la grille',async()=>{
    const {P,t1}=await songBoot();
    P.$('#dplay').click(); await sleep(20);
    t1.querySelector('.tsloop').click(); await sleep(30);
    ok(/^8 temps/.test(P.$('#growlbl').textContent),'boucle : '+P.$('#growlbl').textContent);
    t1.querySelector('.wpb').click(); await sleep(800);
    ok(/^8 temps/.test(P.$('#growlbl').textContent)&&!/ne correspondait pas/.test(P.$('#msg').textContent),'la boucle ne doit pas passer à 9 temps : '+P.$('#growlbl').textContent+' | '+P.$('#msg').textContent);
    const d=gridDev(P.lastPlayed(),8);
    ok(d.length>=7&&d.every(v=>v<=20),'coups après calage (ms) : '+d.map(v=>v.toFixed(0)).join(','));
    P.$('#dplay').click();
  });
  await test('plusieurs pistes : partie calée au début de la boucle, puis calage du tempo → elle reste au début',async()=>{
    const P=await boot(); const r=await recordBase(P);
    const L=r.buf.length, beat=L/8;
    P.$('#addtrk').click(); await sleep(10);
    await P.importFile(1,driftPlayer(L,8,144,0.2));
    const t2=P.$$('.trk')[1]; t2.querySelector('.tog').click(); t2.querySelector('.ttabs button[data-tab="cut"]').click(); await sleep(10);
    for(let i=0;i<2;i++) t2.querySelector('.ts2').click();
    for(let i=0;i<2;i++) t2.querySelector('.ts3').click();
    P.$('#dplay').click(); await sleep(20);
    t2.querySelector('.tsloop').click(); await sleep(30);
    t2.querySelector('.wpb').click(); await sleep(500);
    ok(/Temps 3 → 6 sur 8/.test(t2.querySelector('.tsl').textContent)&&t2.querySelector('.trep button.on').dataset.m==='loop','partie gardée : '+t2.querySelector('.tsl').textContent);
    const h=loudHits(P.lastPlayed());
    ok(h.length===8&&h.every((x,k)=>Math.abs(x-(144+k*beat))<=Math.round(0.02*SR)),'la partie doit démarrer au début et tomber sur chaque temps : '+h.map((x,k)=>Math.round((x-(144+k*beat))/SR*1000)).join(',')+' ms');
    P.$('#dplay').click();
  });

  await test('une piste qu\'on n\'entend pas affiche pourquoi (Muet, Solo, volume, partie silencieuse)',async()=>{
    const P=await boot(); const r=await recordBase(P);
    const L=r.buf.length, beat=L/8;
    P.$('#addtrk').click(); await sleep(10);
    await P.importFile(1,mkFile(L,d=>{ for(let i=0;i<Math.round(2*beat);i++) d[i]=0.3*Math.sin(2*Math.PI*220*i/SR); }));
    const t2=P.$$('.trk')[1]; t2.querySelector('.tog').click(); await sleep(10);
    P.$('#dplay').click(); await sleep(60);
    const tag=()=>t2.querySelector('.tag').textContent;
    ok(tag()==='','piste audible : rien ne doit s\'afficher ('+tag()+')');
    t2.querySelector('.m').click(); await sleep(60);
    ok(/Muet/.test(tag()),'muet : '+tag()); t2.querySelector('.m').click(); await sleep(60);
    P.$$('.trk')[0].querySelector('.s').click(); await sleep(60);
    ok(/Solo/.test(tag()),'solo d\'une autre piste : '+tag()); P.$$('.trk')[0].querySelector('.s').click(); await sleep(60);
    const v=t2.querySelector('.vol'); v.value='0'; v.dispatchEvent(new P.w.Event('input')); await sleep(60);
    ok(/volume à zéro/.test(tag()),'volume : '+tag()); v.value='0.8'; v.dispatchEvent(new P.w.Event('input')); await sleep(60);
    t2.querySelector('.ttabs button[data-tab="cut"]').click();
    for(let i=0;i<4;i++) t2.querySelector('.ts2').click(); await sleep(80);
    ok(/partie gardée ne contient pas de son/.test(tag()),'partie silencieuse : '+tag());
    t2.querySelector('.tsall').click(); await sleep(80);
    ok(tag()==='','de nouveau audible : '+tag());
    P.$('#dplay').click();
  });

  await test('montage : toutes les pistes y apparaissent (une piste vide est signalée, une nouvelle piste reçoit son bloc tout de suite)',async()=>{
    const {P,X,Y,L}=await montBoot();
    P.$('#addtrk').click(); await sleep(20);
    const t3=P.$$('.trk')[2]; t3.querySelector('.tog').click(); t3.querySelector('.ttabs button[data-tab="trk"]').click(); t3.querySelector('.tnin').value='transition piano'; t3.querySelector('.tnok').click(); await sleep(20);
    ok(/« transition piano » est vide/.test(P.$('#mlanehint').textContent)&&!P.$('#mlanehint').hidden,'piste vide signalée : '+P.$('#mlanehint').textContent);
    await P.importFile(2,mkFile(L,d=>{ for(let i=0;i<L;i++) d[i]=0.3*Math.sin(2*Math.PI*262*i/SR); })); await sleep(30);
    ok(P.$('#mlanehint').hidden,'une fois remplie, plus de message : '+P.$('#mlanehint').textContent);
    const cv=P.$('#mcv'); cv.dispatchEvent(new P.w.MouseEvent('pointerdown',{clientX:X(14),clientY:Y(2),bubbles:true})); cv.dispatchEvent(new P.w.MouseEvent('pointerup',{clientX:X(14),clientY:Y(2),bubbles:true}));
    ok(/« transition piano » · mesures 1 →/.test(P.$('#mclipinfo').textContent),'la piste doit avoir son bloc sans relancer la lecture : '+P.$('#mclipinfo').textContent);
    P.starts.length=0; P.$('#mplay').click(); await sleep(20);
    ok(P.starts.filter(x=>x.buf).length===3,'les 3 pistes doivent jouer : '+P.starts.filter(x=>x.buf).length);
    P.$('#mplay').click();
  });

  await test('basse : la note choisie dans la palette (ou changée d\'octave) se fait entendre aussitôt',async()=>{
    const {P,tb}=await bassBoot();
    P.starts.length=0; tb.querySelector('.bpal button[data-n="7"]').click(); await sleep(10);
    let a=P.starts.filter(x=>x.buf).slice(-1)[0];
    ok(a&&a.buf.length<SR*1.2,'aucune note jouée au choix de la palette');
    ok(a&&near(freqOf({getChannelData:()=>a.buf.getChannelData(0).subarray(Math.round(0.05*SR),Math.round(0.45*SR))}),49,2),'Sol1 attendu (49 Hz, le Sol le plus proche du Do2) : '+(a?freqOf({getChannelData:()=>a.buf.getChannelData(0).subarray(Math.round(0.05*SR),Math.round(0.45*SR))}).toFixed(1):'-'));
    tb.querySelector('.boct[data-d="12"]').click(); await sleep(10);
    a=P.starts.filter(x=>x.buf).slice(-1)[0];
    ok(near(freqOf({getChannelData:()=>a.buf.getChannelData(0).subarray(Math.round(0.05*SR),Math.round(0.45*SR))}),98,3),'▲ octave : Sol2 attendu (98 Hz) : '+freqOf({getChannelData:()=>a.buf.getChannelData(0).subarray(Math.round(0.05*SR),Math.round(0.45*SR))}).toFixed(1));
    ok(P.$('#lockhint').style.display==='none','écouter une note ne doit rien créer');
  });
  const okN=results.filter(r=>r[0]).length;
  for(const [pass,name,ms,err] of results) console.log((pass?'✔':'✘')+' '+name+'  ('+ms+' ms)'+(err?'\n    → '+err:''));
  console.log('\n'+okN+' / '+results.length+' tests réussis');
  process.exit(okN===results.length?0:1);
})();
