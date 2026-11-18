const CACHE='move-pwa-v6-glass';
const ASSETS=['./','./index.html','./manifest.json','./css/style.css','./css/features.css','./css/theme-glass.css','./js/config.js','./js/api.js','./js/database.js','./js/workout-engine.js','./js/stats.js','./js/routines.js','./js/history.js','./js/app.js'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET')return;
 if(new URL(event.request.url).origin!==self.location.origin)return; // let Apps Script calls go straight to the network
 event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{
  const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response;
 }).catch(()=>caches.match('./index.html'))));
});
