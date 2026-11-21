const CACHE='move-pwa-v8-builder';
const IMG_CACHE='move-images-v1';
const IMG_MAX=80;
const ASSETS=['./','./index.html','./manifest.json','./css/style.css','./css/features.css','./css/theme-glass.css','./js/config.js','./js/api.js','./js/database.js','./js/workout-engine.js','./js/stats.js','./js/routines.js','./js/builder.js','./js/history.js','./js/app.js'];

self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));

// Keep the app shell cache and the image cache. Delete anything else from older versions.
self.addEventListener('activate',event=>event.waitUntil(
  caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE&&k!==IMG_CACHE).map(k=>caches.delete(k))))
));

self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil(clients.openWindow('./'));});

// Drops the oldest images once the cache passes IMG_MAX entries.
async function trimImages(cache){
  const keys=await cache.keys();
  if(keys.length<=IMG_MAX)return;
  await Promise.all(keys.slice(0,keys.length-IMG_MAX).map(k=>cache.delete(k)));
}

// Cross-origin images (exercise pictures) use cache-first. Opaque responses are stored and shown as-is.
async function imageFromCache(request){
  const cache=await caches.open(IMG_CACHE);
  const hit=await cache.match(request);
  if(hit)return hit;
  try{
    const res=await fetch(request);
    if(res.ok||res.type==='opaque'){
      await cache.put(request,res.clone());
      trimImages(cache);
    }
    return res;
  }catch(err){
    return Response.error();
  }
}

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  if(event.request.destination==='image'&&new URL(event.request.url).origin!==self.location.origin){
    event.respondWith(imageFromCache(event.request));
    return;
  }
  if(new URL(event.request.url).origin!==self.location.origin)return; // Apps Script calls go straight to the network
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{
    const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response;
  }).catch(()=>caches.match('./index.html'))));
});
