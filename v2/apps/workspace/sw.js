self.addEventListener('push',event=>{
  let data={};try{data=event.data.json();}catch{}
  const url=typeof data.url==='string'&&/^\/app\/(customer|cook)(\?|$)/.test(data.url)?data.url:'/account';
  event.waitUntil(self.registration.showNotification(data.title||'Sofreh',{body:data.body||'Order update',tag:data.tag||'sofreh-orders',data:{url}}));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{const target=new URL(event.notification.data?.url||'/account',self.location.origin).href;const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const match=windows.find(client=>new URL(client.url).origin===self.location.origin);if(match){await match.navigate(target);return match.focus();}return self.clients.openWindow(target);
  })());
});
