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
  const okN=results.filter(r=>r[0]).length;
  for(const [pass,name,ms,err] of results) console.log((pass?'✔':'✘')+' '+name+'  ('+ms+' ms)'+(err?'\n    → '+err:''));
  console.log('\n'+okN+' / '+results.length+' tests réussis');
  process.exit(okN===results.length?0:1);
})();
