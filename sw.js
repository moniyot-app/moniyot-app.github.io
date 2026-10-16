/* רמוניות: service worker for device notifications (no caching) */
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick',e=>{e.notification.close();
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>{for(const c of cs){if('focus' in c)return c.focus()}return self.clients.openWindow('./')}))});
/* push from the server: shown even when the app is closed */
self.addEventListener('push',e=>{let d={};try{d=e.data?e.data.json():{}}catch(_){d={body:e.data&&e.data.text()}}
  e.waitUntil(self.registration.showNotification(d.title||'רמוניות',{body:d.body||'',tag:d.tag||'ramoniyot',renotify:true,icon:'icons/icon-192.png',badge:'icons/icon-192.png',lang:'he',dir:'rtl'}))});
