// Run explicitly with an existing Playwright installation. All state is synthetic
// and stays in ElegantRuntime; this script never contacts production services.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {randomBytes,randomUUID} from 'node:crypto';
import {copyRuntimeSource,runtimeRoot} from '../scripts/runtime-source.mjs';

if(process.env.SOFREH_ALLOW_ISOLATED_BROWSER!=='1')throw new Error('This standalone harness needs explicit owner authorization for an isolated browser. Use the connected owner Chrome for profile-restricted acceptance.');
if (!process.env.SOFREH_PLAYWRIGHT_MODULE || !process.env.SOFREH_BROWSER_EXECUTABLE) throw new Error('Set SOFREH_PLAYWRIGHT_MODULE to an installed Playwright package.json and SOFREH_BROWSER_EXECUTABLE to a browser executable.');
const {chromium}=createRequire(path.resolve(process.env.SOFREH_PLAYWRIGHT_MODULE))('playwright');
fs.mkdirSync(path.join(runtimeRoot,'tests'),{recursive:true});
const root=fs.mkdtempSync(path.join(runtimeRoot,'tests/workspace-'));
const source=copyRuntimeSource(path.join(root,'source'),{dependencies:true});
const load=rel=>import(pathToFileURL(path.join(source,rel)));
const {openSofrehDatabase}=await load('packages/backend/src/db.mjs');
const {createIdentityProvider}=await load('packages/backend/src/identity.mjs');
const {createSofrehHttpServer}=await load('packages/backend/src/server.mjs');
const db=openSofrehDatabase(path.join(root,'synthetic.sqlite'));
const provider={};const {server}=createSofrehHttpServer({database:db,seedFixtures:false,identityProvider:provider});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const results={root,checks:[],layouts:[],accessibility:[],pageErrors:[]};let browser;
const kitchen={nameEn:'Browser test kitchen',nameFa:'آشپزخانهٔ آزمون مرورگر',bioEn:'Synthetic local test',bioFa:'آزمون محلی با داده ساختگی',area:'willowdale',pickupAddress:'123 Synthetic Pickup Street',pickupWindowEn:'Today',pickupWindowFa:'امروز',fulfillmentMode:'both',deliveryFeeCents:450,deliveryRadiusKm:5,isPublished:true,pickupAddressConsent:true};
const dishInput={category:'food',titleEn:'Browser test meal',titleFa:'غذای آزمون مرورگر',descriptionEn:'Synthetic test only',descriptionFa:'فقط آزمون ساختگی',priceCents:1299,remainingPortions:1,serviceWindowStartIso:new Date(Date.now()-60000).toISOString(),serviceWindowEndIso:new Date(Date.now()+86400000).toISOString(),allergens:[],availabilityMode:'TODAY_AVAILABLE'};
const {remainingPortions,...metadata}=dishInput;
async function check(name,run){await run();results.checks.push(name);console.log('PASS '+name);}
async function request(ctx,route,data,method=data?'POST':'GET'){const r=await ctx.request.fetch(base+route,{method,headers:{Origin:base},...(data?{data}:{})});return {status:r.status(),data:await r.json()};}
async function api(ctx,route,data,method=data?'POST':'GET',status=200){const r=await request(ctx,route,data,method);assert.equal(r.status,status,route+' '+JSON.stringify(r.data));return r.data;}
async function idle(page){await page.waitForLoadState('networkidle');await page.waitForFunction(()=>!document.querySelector('button[type=submit]:disabled'));}
async function layout(page,name){await page.bringToFront();for(const width of [375,390,412,1440]){await page.setViewportSize({width,height:900});await page.evaluate(()=>document.fonts.ready);const size=await page.evaluate(()=>({viewport:innerWidth,content:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight}));assert.ok(size.content<=size.viewport,name+' overflow '+width);results.layouts.push({name,width,...size});console.log('LAYOUT '+name+' '+JSON.stringify(size));if(width===390||width===1440)await page.screenshot({path:path.join(root,name+'-'+width+'.png'),fullPage:true,animations:'disabled',timeout:60000});}}
try {
  Object.assign(provider,await createIdentityProvider({db,baseURL:base,secret:randomBytes(48).toString('base64url')}));
  browser=await chromium.launch({headless:true,args:['--disable-gpu','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows'],executablePath:process.env.SOFREH_BROWSER_EXECUTABLE});
  const cook=await browser.newContext(),customer=await browser.newContext();
  const password=randomBytes(24).toString('base64url');
  for(const [ctx,role] of [[cook,'COOK'],[customer,'CUSTOMER']]){await api(ctx,'/api/auth/sign-up/email',{name:role,email:role.toLowerCase()+'@example.test',password});await api(ctx,'/api/account/setup',{role,locale:'en-CA'});}
  await api(cook,'/api/cook/kitchen',kitchen,'PUT');
  const own=(await api(cook,'/api/cook/kitchen')).kitchen;
  const dish=(await api(cook,'/api/cook/dishes',dishInput,'PUT')).dish;
  db.prepare('UPDATE dish_slots SET photo_url=? WHERE id=?').run('/assets/demo-food/ash-reshteh-480.webp',dish.id);
  const cp=await cook.newPage(),up=await customer.newPage();
  for(const page of [cp,up])page.on('pageerror',error=>results.pageErrors.push(error.message));
  const orderInput={cookId:own.id,items:[{dishId:dish.id,quantity:1}],fulfillmentType:'pickup',simulatedPaymentMethod:'SIMULATED_CARD'};
  const place=()=>api(customer,'/api/customer/orders',{...orderInput,idempotencyKey:randomUUID()},'POST',201);
  const stock=()=>db.prepare('SELECT remaining_portions FROM dish_slots WHERE id=?').get(dish.id).remaining_portions;
  if(!process.env.SOFREH_COMMERCE_ONLY){
  await check('metadata edit preserves a last portion sold while the form was open',async()=>{
    await cp.goto(base+'/app/cook?locale=en-CA');await cp.getByRole('button',{name:'Menu',exact:true}).click();await cp.locator('[data-edit-dish]').click();
    const first=await place();assert.equal(stock(),0);
    await cp.locator('[name=descriptionEn]').fill('Description changed without restocking');await cp.getByRole('button',{name:'Save dish',exact:true}).click();await cp.waitForFunction(()=>document.getElementById('feedback').textContent.includes('Dish saved'));
    assert.equal(stock(),0);
    await api(cook,'/api/cook/orders/'+first.order.id+'/status',{nextStatus:'REJECTED'});
  });
  await check('explicit stock edit rejects a stale form and preserves its fields',async()=>{
    await api(cook,'/api/cook/dishes/'+dish.id,{...dishInput,remainingPortions:10,expectedRemainingPortions:stock()},'PUT');
    await cp.goto(base+'/app/cook?locale=en-CA');await cp.getByRole('button',{name:'Menu',exact:true}).click();await cp.locator('[data-edit-dish]').click();
    const second=await place();assert.equal(stock(),9);
    await cp.locator('[name=remainingPortions]').fill('12');await cp.getByRole('button',{name:'Save dish',exact:true}).click();await cp.waitForFunction(()=>document.getElementById('feedback').textContent.includes('Available portions changed'));
    assert.equal(stock(),9);assert.equal(await cp.locator('[name=remainingPortions]').inputValue(),'12');
    await api(cook,'/api/cook/orders/'+second.order.id+'/status',{nextStatus:'REJECTED'});
  });
  await check('revoking pickup consent updates an existing cart to reviewable delivery',async()=>{
    await api(customer,'/api/customer/cart/items',{cookId:own.id,dishId:dish.id,quantity:1,fulfillmentType:'pickup'});
    await api(cook,'/api/cook/kitchen',{...kitchen,pickupAddressConsent:false},'PUT');
    const cart=(await api(customer,'/api/customer/cart')).cart;assert.equal(cart.fulfillmentType,'delivery');assert.equal(cart.deliveryFeeCents,450);assert.equal(cart.supportsPickup,false);
    const blocked=await request(customer,'/api/customer/orders',{...orderInput,idempotencyKey:randomUUID()});assert.equal(blocked.status,409);assert.equal(blocked.data.error.code,'PICKUP_ADDRESS_UNAVAILABLE');
    await up.goto(base+'/app/customer?locale=en-CA');await up.getByRole('button',{name:'Cart',exact:true}).click();assert.equal(await up.locator('#fulfillment').inputValue(),'delivery');assert.equal(await up.locator('#deliveryFields').isVisible(),true);
    await api(cook,'/api/cook/kitchen',{...kitchen,fulfillmentMode:'pickup',pickupAddressConsent:false},'PUT');
    assert.equal((await api(customer,'/api/discovery/cooks')).cooks.length,0);
    await cp.goto(base+'/app/cook?locale=en-CA');await cp.getByRole('button',{name:'Kitchen',exact:true}).click();assert.equal(await cp.locator('#fulfillmentMode').inputValue(),'pickup');assert.equal(await cp.locator('[name=pickupAddressConsent]').isChecked(),false);
    await cp.locator('[name=pickupAddressConsent]').check();await cp.locator('#fulfillmentMode').selectOption('both');await cp.getByRole('button',{name:'Save kitchen',exact:true}).click();await cp.waitForFunction(()=>document.getElementById('feedback').textContent.includes('Kitchen saved'));
    assert.equal((await api(customer,'/api/discovery/cooks')).cooks[0].supportsPickup,true);
  });
  const address=(await api(customer,'/api/customer/addresses',{label:'Synthetic home',address:'456 Synthetic Delivery Avenue'},'POST',201)).address;
  for(const locale of ['en-CA','fa-IR']) {
    const fa=locale==='fa-IR',tab=name=>({cart:fa?'سبد':'Cart',orders:fa?'سفارش‌ها':'Orders',discover:fa?'کشف غذا':'Discover'}[name]);
    const clickTab=name=>up.getByRole('button',{name:tab(name),exact:true}).click();
    const assertDraft=async(addressValue,notes)=>{assert.equal(await up.locator('#deliveryAddress').inputValue(),addressValue);assert.equal(await up.locator('#notes').inputValue(),notes);};
    const notes='Synthetic note < & '+locale,delivery='789 Synthetic Delivery Road';
    const newCart=()=>api(customer,'/api/customer/cart/items',{cookId:own.id,dishId:dish.id,quantity:1,fulfillmentType:'delivery'});
    await api(customer,'/api/customer/cart',undefined,'DELETE');await newCart();
    await up.goto(base+'/app/customer?locale='+locale);await clickTab('cart');
    await check(locale+' draft survives quantity, fulfillment, tabs, locale and refresh',async()=>{
      await up.locator('#deliveryAddress').fill(delivery);await up.locator('#notes').fill(notes);
      await up.locator('[data-qty][data-next="2"]').click();await up.waitForFunction(()=>document.querySelector('[data-qty][data-next="3"]'));await idle(up);await assertDraft(delivery,notes);
      await up.locator('[data-qty][data-next="1"]').click();await up.waitForFunction(()=>document.querySelector('[data-qty][data-next="2"]'));await idle(up);await assertDraft(delivery,notes);
      await up.locator('#savedAddress').selectOption(address.id);await up.locator('[data-qty][data-next="2"]').click();await up.waitForFunction(()=>document.querySelector('[data-qty][data-next="3"]'));await idle(up);await assertDraft(address.address,notes);assert.equal(await up.locator('#savedAddress').inputValue(),address.id);
      await up.locator('#fulfillment').selectOption('pickup');await idle(up);await assertDraft(address.address,notes);
      await up.locator('#fulfillment').selectOption('delivery');await idle(up);await assertDraft(address.address,notes);
      await clickTab('orders');await clickTab('cart');await assertDraft(address.address,notes);
      await up.locator('#language').click();await idle(up);await assertDraft(address.address,notes);await up.locator('#language').click();await idle(up);await assertDraft(address.address,notes);
      await up.locator('#refresh').click();await idle(up);await assertDraft(address.address,notes);
    });
    await check(locale+' changed quote keeps draft and requires review',async()=>{
      const price=fa?1599:1499;await api(cook,'/api/cook/dishes/'+dish.id,{...metadata,priceCents:price},'PUT');
      await up.locator('#checkout button[type=submit]').click();await up.waitForFunction(()=>/Your cart or prices changed|سبد یا قیمت/.test(document.getElementById('feedback').textContent));await idle(up);await assertDraft(address.address,notes);
    });
    await layout(up,'cart-'+locale);
    await check(locale+' lost order response retries without duplication and preserves submitted fields',async()=>{
      const before=db.prepare('SELECT count(*) AS n FROM orders').get().n;
      await up.route('**/api/customer/orders',async route=>{if(route.request().method()!=='POST')return route.continue();await route.fetch();await route.abort('failed');});
      await up.locator('#checkout button[type=submit]').click();await up.waitForFunction(()=>/Connection unavailable|اتصال برقرار نیست/.test(document.getElementById('feedback').textContent));await idle(up);
      assert.equal(db.prepare('SELECT count(*) AS n FROM orders').get().n,before+1);await assertDraft(address.address,notes);await up.unroute('**/api/customer/orders');
      await up.locator('#checkout button[type=submit]').click();await up.waitForFunction(()=>document.querySelector('#content .live-heading'));await idle(up);assert.equal(db.prepare('SELECT count(*) AS n FROM orders').get().n,before+1);
      const order=(await api(customer,'/api/customer/orders')).orders.find(o=>o.customerNotes===notes);assert.ok(order);assert.equal(order.deliveryAddress,address.address);
      await cp.goto(base+'/app/cook?locale='+locale);
      for(const [nextStatus,label] of [['ACCEPTED',fa?'پذیرش':'Accept'],['PREPARING',fa?'شروع آماده‌سازی':'Start preparing'],['READY',fa?'آماده تحویل':'Mark ready'],['COMPLETED',fa?'تکمیل سفارش':'Complete']]){
        const response=cp.waitForResponse(r=>r.url().endsWith('/api/cook/orders/'+order.id+'/status')&&r.request().method()==='POST');await cp.locator('article').filter({hasText:order.id}).getByRole('button',{name:label,exact:true}).click();assert.equal((await response).status(),200);await idle(cp);
        assert.equal((await api(customer,'/api/customer/orders/'+order.id)).order.status,nextStatus);
      }
      const refreshed=up.waitForResponse(r=>r.url().endsWith('/api/customer/orders')&&r.request().method()==='GET',{timeout:5000});
      await up.locator('#refresh').click();
      const refreshedOrders=await (await refreshed).json();
      assert.equal(refreshedOrders.orders.find(o=>o.id===order.id)?.status,'COMPLETED');
      await idle(up);
      await up.locator('[data-order-filter=history]').click();
      const displayed=await up.locator('article').filter({hasText:order.id}).innerText();
      assert.ok(displayed.includes(fa?'تکمیل شد':'Completed'),JSON.stringify({locale,displayed,documentLanguage:await up.locator('html').getAttribute('lang'),feedback:await up.locator('#feedback').innerText()}));
    });
    await layout(up,'customer-orders-'+locale);await layout(cp,'cook-orders-'+locale);
    await check(locale+' old draft is cleared after success and a second-tab empty cart',async()=>{
      await newCart();await up.locator('#refresh').click();await idle(up);await clickTab('cart');assert.equal(await up.locator('#notes').inputValue(),'');
      await up.locator('#notes').fill('Must not reappear');await up.locator('#deliveryAddress').fill('Old synthetic address');await clickTab('orders');
      await api(customer,'/api/customer/cart',undefined,'DELETE');await up.locator('#refresh').click();await idle(up);await newCart();await up.locator('#refresh').click();await idle(up);await clickTab('cart');assert.equal(await up.locator('#notes').inputValue(),'');assert.equal(await up.locator('#deliveryAddress').inputValue(),'');
    });
    await check(locale+' delayed clear tolerates switching tabs',async()=>{
      let release,entered;const gate=new Promise(r=>release=r),waiting=new Promise(r=>entered=r);
      await up.route('**/api/customer/cart',async route=>{if(route.request().method()!=='DELETE')return route.continue();const response=await route.fetch();entered();await gate;await route.fulfill({response});});
      await up.locator('#clearCart').click();await waiting;await clickTab('orders');release();await idle(up);await up.unroute('**/api/customer/cart');assert.equal((await api(customer,'/api/customer/cart')).cart.items.length,0);assert.ok(!/null|Cannot read/.test(await up.locator('#feedback').innerText()));
    });
    await clickTab('discover');await layout(up,'customer-discover-'+locale);
    await cp.getByRole('button',{name:fa?'منو':'Menu',exact:true}).click();await layout(cp,'cook-menu-'+locale);
    await cp.getByRole('button',{name:fa?'آشپزخانه':'Kitchen',exact:true}).click();await layout(cp,'cook-kitchen-'+locale);
  }
  await check('pickup acceptance exposes the address and active pickup prevents consent withdrawal',async()=>{
    const placed=await place();await cp.goto(base+'/app/cook?locale=en-CA');
    await cp.locator('article').filter({hasText:placed.order.id}).getByRole('button',{name:'Accept',exact:true}).click();await idle(cp);
    assert.equal((await api(customer,'/api/customer/orders/'+placed.order.id)).order.pickupAddressReleased,kitchen.pickupAddress);
    await cp.getByRole('button',{name:'Kitchen',exact:true}).click();await cp.locator('[name=pickupAddressConsent]').uncheck();await cp.getByRole('button',{name:'Save kitchen',exact:true}).click();await cp.waitForFunction(()=>document.getElementById('feedback').textContent.includes('Complete or cancel'));await idle(cp);assert.equal((await api(cook,'/api/cook/kitchen')).kitchen.pickupAddressConsent,true);
    await api(cook,'/api/cook/orders/'+placed.order.id+'/status',{nextStatus:'CANCELLED'});
  });
  }else await api(cook,'/api/cook/dishes/'+dish.id,{...dishInput,remainingPortions:10,expectedRemainingPortions:stock()},'PUT');
  for(const language of ['en-CA','fa-IR']) {
    const fa=language==='fa-IR';
    await api(customer,'/api/customer/cart',undefined,'DELETE');
    await cp.goto(base+'/app/cook?locale='+language+'&tab=business');
    await cp.locator('[data-business-tab=settings]').click();
    await cp.locator('#prepMinutes').fill('40');
    await cp.locator('#announcementEn').fill('Fresh from our local test kitchen');
    await cp.locator('#announcementFa').fill('تازه از آشپزخانهٔ آزمون');
    await cp.locator('#businessSettings button[type=submit]').click();await idle(cp);
    assert.equal((await api(cook,'/api/cook/business')).business.config.prepMinutes,40);
    await cp.locator('[data-business-tab=schedule]').click();
    const localTime=hours=>{const d=new Date(Date.now()+hours*3600000);return new Date(d-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
    await cp.locator('#slotStart').fill(localTime(4));await cp.locator('#slotEnd').fill(localTime(5));
    await cp.locator('#slotForm button[type=submit]').click();await idle(cp);
    await cp.locator('[data-slot]').last().waitFor();
    const slotId=await cp.locator('[data-slot]').last().getAttribute('data-slot');
    await cp.locator('[data-business-tab=promotions]').click();
    const code=fa?'LOCALFA':'LOCALEN';await cp.locator('#promotionCode').fill(code);
    await cp.locator('#couponForm button[type=submit]').click();await idle(cp);await cp.locator('[data-coupon]').last().waitFor();
    await layout(cp,'business-promotions-'+language);
    await cp.getByRole('button',{name:fa?'منو':'Menu',exact:true}).click();
    await cp.locator('[data-edit-dish]').first().click();
    await cp.locator('.menu-option-editor summary').click();await cp.locator('[data-add-group]').click();
    await cp.locator('#option-en-0').fill('Size');await cp.locator('#option-fa-0').fill('اندازه');
    await cp.locator('#choice-en-0-0').fill('Large');await cp.locator('#choice-fa-0-0').fill('بزرگ');
    await cp.locator('#choice-price-0-0').fill('2');await cp.locator('[data-required="0"]').check();
    await cp.locator('#dishForm button[type=submit]').click();await idle(cp);
    const saved=(await api(cook,'/api/cook/kitchen')).kitchen.storefront.dishes.find(d=>d.id===dish.id);
    assert.equal(saved.options[0].choices[0].priceCents,200);
    const shop=await customer.newPage();shop.on('pageerror',error=>results.pageErrors.push(String(error)));
    await shop.goto(base+'/kitchens/'+own.id+'?locale='+language);await shop.locator('[data-meal]').first().waitFor();
    assert.ok((await shop.locator('body').innerText()).includes(fa?'تازه از آشپزخانهٔ آزمون':'Fresh from our local test kitchen'));
    if(process.env.SOFREH_AXE_SCRIPT){await shop.addScriptTag({path:process.env.SOFREH_AXE_SCRIPT});assert.deepEqual(await shop.evaluate(async()=>(await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>v.id)),[]);results.accessibility.push('public-store-'+language);}
    await layout(shop,'public-store-'+language);
    await shop.locator('[data-meal]').first().click();await shop.locator('#mealForm input[type=radio]').check();
    await shop.locator('#mealForm button[type=submit]').click();await shop.waitForURL('**/app/customer?**');await shop.locator('#couponCode').waitFor();
    await shop.locator('#couponCode').fill(code);await shop.locator('#applyCoupon').click();await idle(shop);
    await shop.locator('#deliverySlot').selectOption(slotId);await idle(shop);
    await api(customer,'/api/customer/cart/preferences',{scheduledSlotId:null},'PUT');
    await shop.locator('#checkout button[type=submit]').click();
    await shop.waitForFunction(()=>/Your cart or prices changed|سبد یا قیمت/.test(document.getElementById('feedback').textContent));
    assert.equal((await api(customer,'/api/customer/cart')).cart.scheduledSlotId,null);
    await shop.locator('#deliverySlot').selectOption(slotId);await idle(shop);
    const cart=(await api(customer,'/api/customer/cart')).cart;assert.ok(cart.discountCents>0);assert.equal(cart.scheduledSlotId,slotId);
    await shop.locator('#checkout button[type=submit]').click();await shop.locator('.order-conversation').first().waitFor();
    const order=(await api(customer,'/api/customer/orders')).orders.find(o=>o.scheduledSlotId===slotId);assert.ok(order);
    const conversation=shop.locator('article.card').filter({hasText:order.id}).locator('.order-conversation');
    await conversation.locator('summary').click();await conversation.locator('textarea').fill('Customer <script>window.injected=true</script> '+language);
    await conversation.locator('button[type=submit]').click();await conversation.locator('.message').waitFor();
    await cp.goto(base+'/app/cook?locale='+language);
    const reply=cp.locator('article.card').filter({hasText:order.id}).locator('.order-conversation');
    await reply.locator('summary').click();await reply.locator('.message').waitFor();
    await reply.locator('textarea').fill('Cook reply '+language);await reply.locator('button[type=submit]').click();await reply.locator('.message').nth(1).waitFor();
    await shop.goto(base+'/app/customer?locale='+language+'&tab=orders');await shop.reload();const reloaded=shop.locator('article.card').filter({hasText:order.id}).locator('.order-conversation');
    await reloaded.locator('summary').click();await reloaded.locator('.message').nth(1).waitFor();assert.equal(await shop.evaluate(()=>window.injected),undefined);
    const stranger=await browser.newContext();assert.equal((await request(stranger,'/api/orders/'+order.id+'/messages')).status,401);await stranger.close();
    const receipt=await customer.newPage();await receipt.goto(base+'/receipts/'+order.id+'?locale='+language);await layout(receipt,'receipt-'+language);await receipt.close();
    await shop.locator('article.card').filter({hasText:order.id}).locator('[data-cancel]').click();await idle(shop);
    assert.equal((await api(customer,'/api/customer/orders/'+order.id)).order.status,'CANCELLED');
    await shop.locator('article.card').filter({hasText:order.id}).locator('[data-repeat]').click();await shop.locator('#checkout').waitFor();assert.equal((await api(customer,'/api/customer/cart')).cart.items.length,1);
    const line=(await api(customer,'/api/customer/cart')).cart.items[0];
    await api(customer,'/api/customer/cart/items',{cookId:own.id,dishId:dish.id,quantity:3,selectedOptions:line.selectedOptions,fulfillmentType:'pickup'});
    await shop.evaluate(intent=>sessionStorage.setItem('sofreh.purchaseIntent',JSON.stringify(intent)),{cookId:own.id,dishId:dish.id,quantity:1,selectedOptions:line.selectedOptions,fulfillmentType:'pickup'});
    await shop.reload();await shop.locator('#checkout').waitFor();assert.equal((await api(customer,'/api/customer/cart')).cart.items[0].quantity,4);
    await cp.goto(base+'/app/cook?locale='+language+'&tab=business');
    await cp.locator('#businessOrders').click();await cp.locator('body[data-page=orders]').waitFor();await cp.goto(base+'/app/cook?locale='+language+'&tab=business');
    for(const tab of ['overview','schedule','customers','settings']){await cp.locator('[data-business-tab='+tab+']').click();await cp.locator('#businessPanel .card, #businessPanel .metric').first().waitFor();await layout(cp,'business-'+tab+'-'+language);}
    if(process.env.SOFREH_AXE_SCRIPT){for(const [page,name] of [[shop,'upgraded-cart-'+language],[cp,'business-settings-'+language]]){await page.addScriptTag({path:process.env.SOFREH_AXE_SCRIPT});const violations=await page.evaluate(async()=>(await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.length})));assert.deepEqual(violations,[],name+' accessibility');results.accessibility.push(name);}}
    await shop.close();
    await api(cook,'/api/cook/dishes/'+dish.id,{...metadata,options:[]},'PUT');
    results.checks.push(language+' business tools, menu options, storefront purchase, promotion, slot, messages, receipt, cancellation and repeat');
  }
  const catalogue=await customer.newPage();for(const language of ['fa','en']){await catalogue.goto(base+'/'+language);await catalogue.locator('footer').scrollIntoViewIfNeeded();await layout(catalogue,'catalogue-'+language);}
  await up.goto(base+'/app/customer?locale=fa-IR');await up.locator('.kitchen-card').first().waitFor();
  await cp.goto(base+'/app/cook?locale=fa-IR&tab=kitchen');await cp.locator('#fulfillmentMode').waitFor();
  if(process.env.SOFREH_AXE_SCRIPT){for(const [page,name] of [[up,'customer-discover'],[cp,'cook-kitchen'],[catalogue,'catalogue']]){await page.addScriptTag({path:process.env.SOFREH_AXE_SCRIPT});const violations=await page.evaluate(async()=>{const r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return r.violations.map(v=>({id:v.id,nodes:v.nodes.length}));});assert.deepEqual(violations,[],name+' accessibility');results.accessibility.push(name);}}
  assert.deepEqual(results.pageErrors,[]);results.completed=true;
} catch(error){results.failure=String(error.stack||error);process.exitCode=1;}
finally {if(browser)await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));db.close();fs.writeFileSync(path.join(root,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));}
