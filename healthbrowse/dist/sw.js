const offlineCache='healthbrowse-offline-v1';
self.addEventListener('install',event=>event.waitUntil(caches.open(offlineCache).then(c=>c.add('/offline.html'))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('healthbrowse-offline-')&&k!==offlineCache).map(k=>caches.delete(k))))));
self.addEventListener('fetch',event=>{
  if(event.request.mode==='navigate' && event.request.method==='GET' && new URL(event.request.url).origin===self.location.origin)
    event.respondWith(fetch(event.request).catch(()=>caches.match('/offline.html')));
});
