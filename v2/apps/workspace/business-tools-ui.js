export function createBusinessToolsUI(env) {
  const { $, state, api, action, refresh, h, tr, money, date, locale, input, dt, renderBusiness } = env;
  const number = value => new Intl.NumberFormat(locale()).format(value);
  const status = value => ({ PENDING:tr('Pending','در انتظار'), ACCEPTED:tr('Accepted','پذیرفته‌شده'), PREPARING:tr('Preparing','در حال آماده‌سازی'), READY:tr('Ready','آمادهٔ تحویل'), COMPLETED:tr('Completed','تکمیل‌شده'), REJECTED:tr('Declined','ردشده'), CANCELLED:tr('Cancelled','لغوشده') }[value] || value);
  function inlineError(form) {
    let node = form.querySelector('[data-business-error]');
    if (!node) { node=document.createElement('p'); node.dataset.businessError=''; node.setAttribute('role','alert'); node.tabIndex=-1; form.append(node); }
    return node;
  }
  function save(form, work) {
    const error=inlineError(form); error.textContent='';
    return action(async()=>{try{await work();}catch(e){if(error.isConnected){error.textContent=e.message;error.focus();}throw e;}},tr('Changes saved.','تغییرات ذخیره شد.'));
  }
  function editorDetails(form, label, initiallyOpen) {
    const section=form.closest('section'),columns=section.parentElement;
    const list=[...columns.children].find(node=>node!==section);
    if(list)columns.insertBefore(list,section);
    const details=document.createElement('details');details.className='business-editor';details.open=initiallyOpen;
    const summary=document.createElement('summary');summary.textContent=label;
    section.before(details);details.append(summary,section);
    return {details,summary};
  }
  function decorateOverview(panel, business) {
    const destinations=['all','pending','completed','completed'];
    panel.querySelectorAll('.metric').forEach((node,i)=>{
      const button=document.createElement('button');button.type='button';button.className=node.className;button.innerHTML=node.innerHTML;
      if(i<3)button.querySelector('strong').textContent=number([business.orderCount,business.pendingCount,business.completedCount][i]);
      button.setAttribute('aria-label',tr('View related orders: ','دیدن سفارش‌های مرتبط: ')+button.textContent.trim());
      button.onclick=()=>action(async()=>{state.tab='orders';state.orderFilter=destinations[i];await refresh();});node.replaceWith(button);
    });
    if($('businessOrders'))$('businessOrders').textContent=tr('View orders','دیدن سفارش‌ها')+' · '+number(business.pendingCount);
    const insight=business.insights;if(!insight)return;
    const points=insight.daily;const maximum=Math.max(1,...points.map(d=>d.orders));
    const coordinates=points.map((d,i)=>`${20+i*560/Math.max(1,points.length-1)},${145-d.orders*115/maximum}`).join(' ');
    const change=(current,previous)=>previous?`${new Intl.NumberFormat(locale(),{style:'percent',signDisplay:'always',maximumFractionDigits:1}).format((current-previous)/previous)}`:current?tr('First orders in this comparison','نخستین سفارش‌ها در این مقایسه'):tr('No change','بدون تغییر');
    const section=document.createElement('section');section.className='card business-trend';
    section.innerHTML=`<div class="trend-heading"><div><p class="eyebrow">${tr('Your kitchen, over time','آشپزخانه‌ات در گذر زمان')}</p><h3 id="trendTitle">${tr('Orders over time','روند سفارش‌ها')}</h3></div><p class="trend-comparison">${tr('Compared with the previous ','در مقایسه با ')}${number(business.periodDays)}${tr(' days',' روز قبل')}: <bdi>${h(change(insight.current.orderCount,insight.previous.orderCount))}</bdi></p></div><svg class="trend-chart" viewBox="0 0 600 170" role="img" aria-labelledby="trendTitle trendDescription"><desc id="trendDescription">${h(tr('Daily orders. Current period: ','سفارش روزانه. دورهٔ فعلی: ')+number(insight.current.orderCount)+tr('; previous period: ','؛ دورهٔ قبل: ')+number(insight.previous.orderCount))}</desc><path d="M20 145H580" stroke="currentColor" opacity=".2"/><polyline points="${coordinates}" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>${points.map((d,i)=>d.orders?`<circle cx="${20+i*560/Math.max(1,points.length-1)}" cy="${145-d.orders*115/maximum}" r="4" fill="currentColor"/>`:'').join('')}</svg><div class="trend-axis"><span>${h(date(insight.startIso))}</span><span>${h(date(insight.asOfIso))}</span></div><div class="period-comparison"><p>${tr('Previous completed value','ارزش تکمیل‌شدهٔ دورهٔ قبل')}<strong>${money(insight.previous.completedValueCents)}</strong></p><p>${tr('Current completed value','ارزش تکمیل‌شدهٔ این دوره')}<strong>${money(insight.current.completedValueCents)}</strong></p></div><details><summary>${tr('Read daily figures','دیدن آمار روزانه')}</summary><div class="table-scroll" role="region" tabindex="0" aria-label="${tr('Daily order figures','آمار روزانهٔ سفارش')}"><table><thead><tr><th>${tr('Day — Toronto','روز — تورنتو')}</th><th>${tr('Orders','سفارش')}</th><th>${tr('Completed value','ارزش تکمیل‌شده')}</th></tr></thead><tbody>${points.map(d=>`<tr><td><bdi>${h(new Intl.DateTimeFormat(locale(),{dateStyle:'medium',calendar:'gregory',timeZone:'America/Toronto'}).format(new Date(d.day+'T12:00:00Z')))}</bdi></td><td>${number(d.orders)}</td><td>${money(d.completedValueCents)}</td></tr>`).join('')}</tbody></table></div></details><p class="muted">${tr('Days use Toronto time. The comparison covers the same rolling duration; today is partial. Values remain simulated.','روزها به وقت تورنتو هستند. دو دوره هم‌طول‌اند و امروز هنوز کامل نشده است. مبلغ‌ها همچنان آزمایشی‌اند.')}</p>`;
    panel.querySelector('.business-columns').before(section);
  }

  function decorateCustomers(panel, business) {
    panel.querySelectorAll('tbody tr').forEach((row,i)=>{
      const customer=business.customers[i];if(!customer?.id)return;
      const button=document.createElement('button');button.type='button';button.className='customer-link';button.textContent=customer.name;
      button.setAttribute('aria-label',tr('Order history for ','سابقهٔ سفارش‌های ')+customer.name);
      const cell=row.firstElementChild;cell.replaceChild(button,cell.firstChild);button.onclick=()=>showCustomer(customer);
    });
  }
  async function showCustomer(customer) {
    const owner=state.profile?.account.id,opener=document.activeElement;
    let dialog=$('customerHistory');if(!dialog){dialog=document.createElement('dialog');dialog.id='customerHistory';document.body.append(dialog);}
    let sequence=0;dialog.setAttribute('aria-labelledby','customerHistoryTitle');
    dialog.onclose=()=>{sequence++;if(opener?.isConnected)opener.focus();};
    async function load(page){
      const token=++sequence;dialog.innerHTML=`<button type="button" class="dialog-close" aria-label="${tr('Close','بستن')}">×</button><h2 id="customerHistoryTitle">${h(customer.name)}</h2><div id="customerHistoryBody" aria-live="polite">${tr('Opening order history…','در حال بازکردن سابقهٔ سفارش‌ها…')}</div>`;
      dialog.querySelector('.dialog-close').onclick=()=>dialog.close();if(!dialog.open)dialog.showModal();
      try{
        const {history}=await api('/api/cook/customers/'+encodeURIComponent(customer.id)+'?page='+page);
        if(token!==sequence||!dialog.open||state.profile?.account.id!==owner)return;
        $('customerHistoryBody').innerHTML=`<p class="muted">${tr('Only orders placed with your kitchen. No private contact details are shown.','فقط سفارش‌های همین آشپزخانه؛ اطلاعات تماس خصوصی نمایش داده نمی‌شود.')}</p><div class="history-summary"><span>${number(history.customer.orderCount)} ${tr('orders','سفارش')}</span><strong>${money(history.customer.completedValueCents)}</strong><small>${tr('Completed order value','ارزش سفارش تکمیل‌شده')}</small></div><div class="customer-order-list">${history.orders.map(o=>`<article><div class="row"><strong>${h(status(o.status))}</strong><time>${h(date(o.createdAtIso))}</time></div><p>${o.items.map(i=>h(i.title)+' × '+number(i.quantity)).join('، ')}</p><div class="row"><b>${money(o.totalCents)}</b><a class="text-link" href="/receipts/${encodeURIComponent(o.id)}?locale=${locale()}" target="_blank" rel="noopener">${tr('View receipt','دیدن رسید')}</a></div></article>`).join('')}</div><nav class="history-pagination" aria-label="${tr('Customer history pages','صفحه‌های سابقهٔ مشتری')}"><button type="button" id="historyPrevious" ${page<=1?'disabled':''}>${tr('Previous','قبلی')}</button><span>${number(page)} / ${number(history.pageCount)}</span><button type="button" id="historyNext" ${page>=history.pageCount?'disabled':''}>${tr('Next','بعدی')}</button></nav>`;
        $('historyPrevious').onclick=()=>load(page-1);$('historyNext').onclick=()=>load(page+1);
      }catch(error){if(token===sequence&&dialog.open){$('customerHistoryBody').innerHTML=`<p role="alert" tabindex="-1">${h(error.message)}</p>`;$('customerHistoryBody').firstElementChild.focus();}}
    }
    await load(1);
  }

  function decorateSchedule(panel, business) {
    let editing=null;const form=$('slotForm'),heading=form.closest('section').querySelector('h3'),submit=form.querySelector('[type=submit]');
    const editor=editorDetails(form,tr('Add a fulfillment window','افزودن نوبت تازه'),!business.slots.length);
    const cancel=document.createElement('button');cancel.type='button';cancel.className='cancel-edit';cancel.hidden=true;cancel.textContent=tr('Cancel edit','لغو ویرایش');form.append(cancel);cancel.onclick=()=>{$('feedback').textContent='';renderBusiness();};
    const note=document.createElement('p');note.className='muted edit-lock-note';note.hidden=true;form.before(note);
    panel.querySelectorAll('[data-slot]').forEach(pause=>{
      const slot=business.slots.find(s=>s.id===pause.dataset.slot),edit=document.createElement('button');edit.type='button';edit.textContent=tr('Edit','ویرایش');edit.dataset.editSlot=slot.id;edit.disabled=Date.parse(slot.startIso)<=Date.now();
      const actions=document.createElement('div');actions.className='tool-actions';pause.replaceWith(actions);actions.append(edit,pause);
      edit.onclick=()=>{
        editing=slot;editor.details.open=true;editor.summary.textContent=tr('Edit fulfillment window','ویرایش نوبت دریافت');heading.textContent=tr('Edit fulfillment window','ویرایش نوبت دریافت');submit.textContent=tr('Save window','ذخیرهٔ نوبت');cancel.hidden=false;
        $('slotStart').value=dt(slot.startIso);$('slotEnd').value=dt(slot.endIso);$('slotMode').value=slot.mode;$('slotCapacity').value=slot.capacity;$('slotCapacity').min=Math.max(1,slot.bookedCount);$('slotCutoff').value=slot.cutoffMinutes;
        for(const id of ['slotStart','slotEnd','slotMode'])$(id).disabled=slot.bookedCount>0;
        note.hidden=!slot.bookedCount;note.textContent=tr('This window has bookings. Its time and method stay fixed; capacity cannot fall below existing orders.','این نوبت رزرو دارد؛ زمان و روش ثابت می‌ماند و ظرفیت از سفارش‌های قبلی کمتر نمی‌شود.');inlineError(form).textContent='';$('slotCapacity').focus();
      };
    });
    form.onsubmit=event=>{event.preventDefault();save(form,async()=>{
      const locked=editing?.bookedCount>0;
      const value={startIso:locked?editing.startIso:new Date($('slotStart').value).toISOString(),endIso:locked?editing.endIso:new Date($('slotEnd').value).toISOString(),mode:locked?editing.mode:$('slotMode').value,capacity:Number($('slotCapacity').value),cutoffMinutes:Number($('slotCutoff').value),...(editing?{expectedVersion:editing.version}:{})};
      await api('/api/cook/slots'+(editing?'/'+encodeURIComponent(editing.id):''),value,editing?'PUT':'POST');await renderBusiness();
    });};
  }

  function decoratePromotions(panel, business) {
    let editing=null;const form=$('couponForm'),heading=form.closest('section').querySelector('h3'),submit=form.querySelector('[type=submit]');
    const editor=editorDetails(form,tr('Create a new offer','ساخت تخفیف تازه'),!business.coupons.length);
    const cancel=document.createElement('button');cancel.type='button';cancel.className='cancel-edit';cancel.hidden=true;cancel.textContent=tr('Cancel edit','لغو ویرایش');form.append(cancel);cancel.onclick=()=>{$('feedback').textContent='';renderBusiness();};
    const note=document.createElement('p');note.className='muted edit-lock-note';note.hidden=true;form.before(note);
    panel.querySelectorAll('[data-coupon]').forEach(pause=>{
      const coupon=business.coupons.find(c=>c.id===pause.dataset.coupon),edit=document.createElement('button');edit.type='button';edit.textContent=tr('Edit','ویرایش');edit.dataset.editCoupon=coupon.id;
      const actions=document.createElement('div');actions.className='tool-actions';pause.replaceWith(actions);actions.append(edit,pause);
      edit.onclick=()=>{
        editing=coupon;editor.details.open=true;editor.summary.textContent=tr('Edit promotion','ویرایش تخفیف');heading.textContent=tr('Edit promotion','ویرایش تخفیف');submit.textContent=tr('Save offer','ذخیرهٔ تخفیف');cancel.hidden=false;
        $('promotionCode').value=coupon.code;$('promotionCode').disabled=true;$('promotionKind').value=coupon.kind;$('promotionValue').value=coupon.kind==='fixed'?coupon.value/100:coupon.value;$('promotionMinimum').value=coupon.minimumCents/100;$('promotionLimit').value=coupon.maxUses;$('promotionLimit').min=Math.max(1,coupon.used);$('promotionPerCustomer').value=coupon.perCustomer;$('promotionStart').value=dt(coupon.startsIso);$('promotionEnd').value=dt(coupon.endsIso);
        for(const id of ['promotionKind','promotionValue','promotionMinimum','promotionPerCustomer','promotionStart'])$(id).disabled=coupon.used>0;
        note.hidden=!coupon.used;note.textContent=tr('This offer has been used. Keep its terms; extend the end or increase the total limit. Existing orders never change.','این تخفیف استفاده شده است؛ شرایطش ثابت می‌ماند. پایان و سقف کل را تغییر دهید؛ سفارش‌های قبلی عوض نمی‌شوند.');inlineError(form).textContent='';$('promotionEnd').focus();
      };
    });
    form.onsubmit=event=>{event.preventDefault();save(form,async()=>{
      const locked=editing?.used>0,kind=locked?editing.kind:$('promotionKind').value;
      const value={code:editing?.code||$('promotionCode').value,kind,value:locked?editing.value:kind==='fixed'?Math.round(Number($('promotionValue').value)*100):Number($('promotionValue').value),minimumCents:locked?editing.minimumCents:Math.round(Number($('promotionMinimum').value)*100),maxUses:Number($('promotionLimit').value),perCustomer:locked?editing.perCustomer:Number($('promotionPerCustomer').value),startsIso:locked?editing.startsIso:new Date($('promotionStart').value).toISOString(),endsIso:new Date($('promotionEnd').value).toISOString(),...(editing?{expectedVersion:editing.version}:{})};
      await api('/api/cook/coupons'+(editing?'/'+encodeURIComponent(editing.id):''),value,editing?'PUT':'POST');await renderBusiness();
    });};
  }

  function decorateIdentity(panel, business) {
    const identity=business.identity||{publicName:'',links:{}},section=document.createElement('section');section.className='card brand-editor';
    section.innerHTML=`<p class="eyebrow">${tr('A kitchen people can recognise','آشپزخانه‌ای که به خاطر می‌ماند')}</p><h3>${tr('Your public kitchen identity','هویت عمومی آشپزخانه')}</h3><p class="muted">${tr('Choose what visitors can see. Your private account name and contact details are not published automatically.','خودت انتخاب کن بازدیدکننده چه ببیند؛ نام و اطلاعات تماس خصوصی حساب خودکار منتشر نمی‌شود.')}</p><div class="branding-preview">${identity.coverUrl?`<img class="branding-cover" src="${h(identity.coverUrl)}" alt="${tr('Current kitchen cover','کاور فعلی آشپزخانه')}">`:''}<div>${identity.avatarUrl?`<img class="branding-avatar" src="${h(identity.avatarUrl)}" alt="${tr('Current kitchen identity image','تصویر معرفی فعلی آشپزخانه')}">`:'<span class="branding-monogram" aria-hidden="true">س</span>'}<strong>${h(identity.publicName||(locale()==='fa-IR'?state.own.nameFa:state.own.nameEn))}</strong></div></div><form id="identityForm"><div class="form-grid">${input('publicCookName',tr('Public cook name — optional','نام عمومی آشپز — اختیاری'),identity.publicName,'text','maxlength="100"')}${input('instagramLink',tr('Instagram profile — optional','پروفایل اینستاگرام — اختیاری'),identity.links.instagram||'','url','maxlength="300" dir="ltr"')}${input('tiktokLink',tr('TikTok profile — optional','پروفایل تیک‌تاک — اختیاری'),identity.links.tiktok||'','url','maxlength="300" dir="ltr"')}${input('youtubeLink',tr('YouTube channel — optional','کانال یوتیوب — اختیاری'),identity.links.youtube||'','url','maxlength="300" dir="ltr"')}</div><button type="submit" class="primary">${tr('Save public identity','ذخیرهٔ هویت عمومی')}</button></form><div class="identity-photo-grid">${[['avatar',tr('Kitchen or cook image','تصویر معرفی آشپز یا آشپزخانه')],['cover',tr('Storefront cover','کاور فروشگاه')]].map(([kind,label])=>`<form data-identity-photo="${kind}"><label for="identity-${kind}-file">${label}</label><input type="file" id="identity-${kind}-file" accept="image/jpeg,image/png,image/webp" required><p class="muted">${tr('Public image. Use your own or an authorised image, under 1.8 MB.','این تصویر عمومی می‌شود. عکس خودت یا تصویر مجاز، کمتر از۱٫۸مگابایت، انتخاب کن.')}</p><label class="filter-check"><input type="checkbox" name="isSample">${tr('This is an illustrative image','این تصویر نمایشی است')}</label><button type="submit">${tr('Upload image','بارگذاری تصویر')}</button></form>`).join('')}</div>`;
    const socialFields=document.createElement('details');socialFields.className='identity-disclosure';
    const socialSummary=document.createElement('summary');socialSummary.textContent=tr('Social profiles — optional','شبکه‌های اجتماعی — اختیاری');socialFields.append(socialSummary);
    const socialGrid=document.createElement('div');socialGrid.className='form-grid';
    for(const id of ['instagramLink','tiktokLink','youtubeLink'])socialGrid.append(section.querySelector('#'+id).parentElement);
    socialFields.append(socialGrid);section.querySelector('#identityForm .form-grid').after(socialFields);
    const photos=section.querySelector('.identity-photo-grid'),photoDetails=document.createElement('details');photoDetails.className='identity-disclosure';
    const photoSummary=document.createElement('summary');photoSummary.textContent=tr('Change kitchen images','تغییر تصاویر آشپزخانه');photos.before(photoDetails);photoDetails.append(photoSummary,photos);
    panel.prepend(section);
    $('identityForm').onsubmit=event=>{event.preventDefault();save(event.currentTarget,async()=>{await api('/api/cook/identity',{publicName:$('publicCookName').value,links:{instagram:$('instagramLink').value,tiktok:$('tiktokLink').value,youtube:$('youtubeLink').value}},'PUT');await renderBusiness();});};
    section.querySelectorAll('[data-identity-photo]').forEach(form=>form.onsubmit=event=>{event.preventDefault();save(form,async()=>{
      const file=form.querySelector('input[type=file]').files[0];if(!file||file.size>1800000)throw new Error(tr('Choose an image under 1.8 MB.','عکسی کمتر از۱٫۸مگابایت انتخاب کنید.'));
      const imageBase64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error(tr('Could not read this image.','خواندن این تصویر ممکن نشد.')));reader.readAsDataURL(file);});
      await api('/api/cook/identity/'+form.dataset.identityPhoto,{imageBase64,isSample:form.querySelector('[name=isSample]').checked},'PUT');await renderBusiness();
    });});
  }
  return { decorateOverview, decorateCustomers, decorateSchedule, decoratePromotions, decorateIdentity };
}
