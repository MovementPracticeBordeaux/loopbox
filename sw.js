// Service worker de LoopBox : permet l'installation et le fonctionnement hors connexion.
// La page est cherchée d'abord sur le réseau (pour avoir la dernière version), puis dans le cache si hors ligne.
const VER='loopbox-v40';
const SHELL=['./','./index.html','./style.css?v=40','./app.js?v=40','./manifest.webmanifest','./icon-192.png','./icon-512.png','./icon-maskable-512.png'];
self.addEventListener('install',e=>{ e.waitUntil(caches.open(VER).then(c=>c.addAll(SHELL))); });
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('loopbox-')&&k!==VER).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('message',e=>{ if(e.data==='skip') self.skipWaiting(); });
self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET') return;
  const url=new URL(req.url);
  if(req.mode==='navigate'){
    e.respondWith(fetch(req).then(r=>{ const cp=r.clone(); caches.open(VER).then(c=>c.put('./index.html',cp)); return r; }).catch(()=>caches.match('./index.html')));
    return;
  }
  const fonts=/^fonts\.(googleapis|gstatic)\.com$/.test(url.host);
  if(url.origin!==location.origin&&!fonts) return;
  e.respondWith(caches.match(req).then(hit=>{
    const net=fetch(req).then(r=>{ if(r&&(r.ok||r.type==='opaque')){ const cp=r.clone(); caches.open(VER).then(c=>c.put(req,cp)); } return r; }).catch(()=>hit);
    return hit||net;
  }));
});
