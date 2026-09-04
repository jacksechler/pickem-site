self.addEventListener('push',event=>{
  let data={title:"Pick'em",body:'League update',url:'./'};
  try{ if(event.data) data={...data,...event.data.json()}; }catch{
    try{ data.body=event.data?.text()||data.body; }catch{}
  }
  event.waitUntil(self.registration.showNotification(data.title||"Pick'em",{
    body:data.body||'',
    data:{url:data.url||'./'},
    tag:'pickem-league-update',
    renotify:true
  }));
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=event.notification?.data?.url||'./';
  event.waitUntil((async()=>{
    const clientsList=await clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of clientsList){
      if('focus' in client){
        try{ await client.navigate(target); }catch{}
        return client.focus();
      }
    }
    if(clients.openWindow) return clients.openWindow(target);
  })());
});
