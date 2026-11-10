const $ = (id) => document.getElementById(id);
let fa = new URLSearchParams(location.search).get("locale") === "fa-IR";
let localeResolved = new URLSearchParams(location.search).has('locale');
if(!localeResolved){try{const saved=localStorage.getItem('sofreh.locale');if(['en-CA','fa-IR'].includes(saved)){fa=saved==='fa-IR';localeResolved=true;}}catch{}}
const tr = (en, persian) => (fa ? persian : en);
const h = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const money = (cents) =>
  new Intl.NumberFormat(fa ? "fa-IR" : "en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(Number(cents) / 100);
const number = (value) =>
  new Intl.NumberFormat(fa ? "fa-IR" : "en-CA", {
    maximumFractionDigits: 1,
  }).format(value);
const date = (value) =>
  new Intl.DateTimeFormat(fa ? "fa-IR" : "en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Toronto",
    calendar: "gregory",
  }).format(new Date(value));
const state = {
  profile: null,
  cooks: [],
  cart: null,
  orders: [],
  addresses: [],
  own: null,
  areas: {},
  tab: "",
  origin: null,
  area: "",
  sort: false,
  map: null,
  busy: false,
  hydrated: false,
  editDish: null,
  checkoutKey: null,
  query: '',
  fulfillmentFilter: '',
  availableOnly: false,
  markers: [],
  pushConfig: null,
};
const isCook = () => state.profile?.account.role === "COOK";
const locale = () => (fa ? "fa-IR" : "en-CA");
const modeText = (mode) =>
  mode === "pickup" ? tr("Pickup", "دریافت حضوری") : tr("Delivery", "ارسال");
const statusText = (status) =>
  ({
    PENDING: tr("Waiting for acceptance", "در انتظار پذیرش"),
    ACCEPTED: tr("Accepted", "پذیرفته شد"),
    PREPARING: tr("Preparing", "در حال آماده‌سازی"),
    READY: tr("Ready", "آماده تحویل"),
    COMPLETED: tr("Completed", "تکمیل شد"),
    REJECTED: tr("Declined", "رد شد"),
    CANCELLED: tr("Cancelled", "لغو شد"),
  })[status] || status;

async function api(route, body, method = body ? "POST" : "GET") {
  let response;
  try { response = await fetch(route, {
    method,
    headers: {
      "X-Sofreh-Locale": locale(),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  }); } catch {
    throw new Error(tr('Connection unavailable. Please reconnect and try again.','اتصال برقرار نیست؛ پس از اتصال دوباره تلاش کنید.'));
  }
  let data;
  try { data = await response.json(); } catch {
    throw new Error(tr('The service is unavailable. Please try again shortly.','سرویس در دسترس نیست؛ کمی بعد دوباره تلاش کنید.'));
  }
  if (response.status === 401) {
    location.replace("/account?locale=" + locale());
    throw new Error(tr("Please sign in.", "لطفاً وارد شوید."));
  }
  if (!response.ok) {
    const code = data.error?.code || data.code;
    const message = {
      INSUFFICIENT_PORTIONS: tr(
        "Some portions have sold out. Refresh and choose again.",
        "بخشی از موجودی تمام شده است؛ بازخوانی کنید و دوباره انتخاب کنید.",
      ),
      CART_COOK_MISMATCH: tr(
        "Your cart contains food from another kitchen. Clear it before switching.",
        "سبد شما از آشپزخانه دیگری است؛ پیش از تغییر، آن را خالی کنید.",
      ),
      IDEMPOTENCY_PAYLOAD_MISMATCH: tr(
        "This checkout changed. Review your cart and try again.",
        "سفارش تغییر کرده است؛ سبد را بررسی و دوباره تلاش کنید.",
      ),
      INVALID_DELIVERY_ADDRESS: tr(
        "Enter a complete delivery address.",
        "نشانی کامل تحویل را بنویسید.",
      ),
      INVALID_STATUS_TRANSITION: tr(
        "The order has already changed. Refresh it.",
        "وضعیت سفارش تغییر کرده است؛ آن را بازخوانی کنید.",
      ),
      INVALID_WINDOW: tr(
        "The service window must end in the future.",
        "پایان بازه تحویل باید در آینده باشد.",
      ),
    };
    throw new Error(
      message[code] ||
        tr(
          "Could not save this change. Check your entries and refresh.",
          "ذخیره انجام نشد؛ اطلاعات را بررسی و صفحه را بازخوانی کنید.",
        ),
    );
  }
  return data;
}
async function action(work, success = "") {
  if (state.busy) return;
  state.busy = true;
  $("feedback").textContent = "";
  document
    .querySelectorAll("button[type=submit]")
    .forEach((button) => (button.disabled = true));
  try {
    await work();
    if (success) $("feedback").textContent = success;
  } catch (error) {
    $("feedback").textContent = error.message;
  } finally {
    state.busy = false;
    document
      .querySelectorAll("button[type=submit]")
      .forEach((button) => (button.disabled = false));
  }
}
async function enablePush() {
  if (
    !("Notification" in window) ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  )
    throw new Error(
      tr(
        "Push alerts are unavailable in this browser. Keep orders open; on iPhone, install the web app on the Home Screen first.",
        "اعلان در این مرورگر در دسترس نیست؛ صفحه سفارش‌ها را باز نگه دارید. در آیفون ابتدا وب‌اپ را به صفحه اصلی اضافه کنید.",
      ),
    );
  const config = state.pushConfig;
  if (!config?.enabled)
    throw new Error(
      tr(
        "Push alerts are not configured on this server.",
        "اعلان روی این سرور پیکربندی نشده است.",
      ),
    );
  const permission = await Notification.requestPermission();
  if (permission !== "granted")
    throw new Error(
      tr(
        "Alerts were not allowed. Orders still refresh while open.",
        "مجوز اعلان داده نشد؛ سفارش‌ها با صفحه باز به‌روز می‌شوند.",
      ),
    );
  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: config.publicKey,
    }));
  await api("/api/notifications/subscription", {
    subscription: subscription.toJSON(),
  });
  $("feedback").textContent = tr(
    "Order alerts enabled for this browser. Device settings can still limit delivery.",
    "اعلان سفارش برای این مرورگر فعال شد؛ تنظیمات دستگاه می‌تواند دریافت آن را محدود کند.",
  );
}
function connection(ok) {
  $("connection").textContent = ok
    ? tr(
      "Connected · orders update automatically.",
      "متصل · سفارش‌ها خودکار به‌روز می‌شوند.",
      )
    : tr(
        "Connection lost. Your last saved state is shown. Reconnect before making changes.",
        "اتصال برقرار نیست؛ آخرین وضعیت ذخیره‌شده نمایش داده می‌شود. پیش از تغییر، دوباره متصل شوید.",
      );
}
async function refresh({ full = true } = {}) {
  state.profile = await api("/api/account");
  if (!state.profile.account) {
    location.replace("/account");
    return;
  }
  if(!localeResolved){fa=state.profile.account.preferredLocale==='fa-IR';localeResolved=true;}
  if(!state.pushConfig)state.pushConfig=await api('/api/notifications/config');
  const discovery = await api("/api/discovery/cooks?locale=" + locale());
  state.cooks = discovery.cooks;
  let orders;
  if (isCook()) {
    const own = await api("/api/cook/kitchen");
    state.own = own.kitchen;
    state.areas = own.areas;
    orders = state.own
      ? (
          await api(
            "/api/cook/kitchen/" + encodeURIComponent(state.own.id) + "/orders",
          )
        ).orders
      : [];
  } else {
    const [cart, history, addresses] = await Promise.all([
      api("/api/customer/cart"),
      api("/api/customer/orders"),
      api("/api/customer/addresses"),
    ]);
    state.cart = cart.cart;
    orders = history.orders;
    state.addresses = addresses.addresses;
  }
  const changes =
    state.hydrated &&
    orders.some((order) => {
      const previous = state.orders.find((old) => old.id === order.id);
      return !previous || previous.status !== order.status;
    });
  state.orders = orders;
  state.hydrated = true;
  connection(true);
  if (changes) {
    $("feedback").textContent = tr(
      "An order has changed.",
      "سفارشی به‌روز شده است.",
    );
  }
  if (!state.tab)
    state.tab = isCook() ? (state.own ? "orders" : "kitchen") : "discover";
  if (full) render();
  else if (changes && state.tab === "orders" && !document.querySelector('#content details[open]')) renderContent();
  else if (state.tab === "discover" && !state.map) renderKitchenCards();
}
function setTab(tab) {
  state.tab = tab;
  $("feedback").textContent = "";
  render();
}
function render() {
  try { localStorage.setItem("sofreh.locale", locale()); } catch {}
  document.documentElement.lang = fa ? "fa" : "en-CA";
  document.documentElement.dir = fa ? "rtl" : "ltr";
  document.title =
    tr("Sofreh", "سفره") +
    " | " +
    (isCook() ? tr("Kitchen", "آشپزخانه") : tr("Your table", "سفره شما"));
  $("brand").textContent = tr("Sofreh", "سفره");
  $("brand").href = fa ? "/fa" : "/en";
  $("language").textContent = fa ? "English" : "فارسی";
  $("signOut").textContent = tr("Sign out", "خروج");
  $("refresh").textContent = tr("Refresh", "بازخوانی");
  $("eyebrow").textContent = isCook()
    ? tr("Your kitchen, your rhythm", "آشپزخانه تو، با ریتم تو")
    : tr("Good food, close to home", "غذای خوب، نزدیک خانه");
  $("heading").textContent = isCook()
    ? tr("Time to put your food on the table.", "وقت چیدن سفره توست.")
    : tr("What are you craving?", "هوس چه غذایی کرده‌ای؟");
  $("welcome").textContent = tr("Welcome, ", "خوش آمدی، ") + state.profile.name;
  $("paymentNotice").textContent = tr(
    "Payments are simulated. No money is charged.",
    "پرداخت آزمایشی است؛ هیچ مبلغی برداشت نمی‌شود.",
  );
  const tabs = isCook()
    ? [
        ["orders", tr("Orders", "سفارش‌ها")],
        ["menu", tr("Menu", "منو")],
        ["kitchen", tr("Kitchen", "آشپزخانه")],
        ["profile", tr("Account", "حساب")],
      ]
    : [
        ["discover", tr("Discover", "کشف غذا")],
        ["cart", tr("Cart", "سبد")],
        ["orders", tr("Orders", "سفارش‌ها")],
        ["profile", tr("Account", "حساب")],
      ];
  $("tabs").innerHTML = tabs
    .map(
      ([key, label]) =>
        `<button type="button" data-tab="${key}" aria-pressed="${state.tab === key}">${label}</button>`,
    )
    .join("");
  $('tabs').setAttribute('aria-label',tr('Workspace','فضای کار'));
  $("tabs")
    .querySelectorAll("[data-tab]")
    .forEach((button) => (button.onclick = () => setTab(button.dataset.tab)));
  renderContent();
}
function field(name, label, value = "", type = "text", extra = "") {
  return `<div><label for="${name}">${label}</label><input id="${name}" name="${name}" type="${type}" value="${h(value)}" ${extra}></div>`;
}
function distance(cook) {
  if (!state.origin) return null;
  const radians = (v) => (v * Math.PI) / 180,
    lat = radians(cook.publicLat - state.origin.lat),
    lng = radians(cook.publicLng - state.origin.lng);
  const a =
    Math.sin(lat / 2) ** 2 +
    Math.cos(radians(state.origin.lat)) *
      Math.cos(radians(cook.publicLat)) *
      Math.sin(lng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
const areas = {
  willowdale: { name: "Willowdale", lat: 43.7701, lng: -79.4124 },
  northYork: { name: "North York Centre", lat: 43.7673, lng: -79.412 },
  downtown: { name: "Downtown Toronto", lat: 43.6532, lng: -79.3832 },
  scarborough: { name: "Scarborough Centre", lat: 43.7764, lng: -79.2318 },
  richmondHill: { name: "Richmond Hill", lat: 43.8828, lng: -79.4403 },
};

function acceptDeviceLocation(coords){
  const lat=coords?.latitude,lng=coords?.longitude;
  if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)return;
  state.origin={lat,lng};state.area='';if($('area'))$('area').value='';
  $('feedback').textContent=tr('Location used only on this device.','موقعیت فقط روی همین دستگاه استفاده شد.');
  if($('kitchens'))renderKitchenCards();
}
window.addEventListener('message',event=>{
  if(!window.ReactNativeWebView)return;
  let message;try{message=JSON.parse(event.data);}catch{return;}
  if(message.type!=='SOFREH_LOCATION_RESULT')return;
  if(message.coords)acceptDeviceLocation(message.coords);
  else{$('feedback').textContent=tr('Location unavailable. Choose an area instead.','موقعیت دریافت نشد؛ محله را انتخاب کنید.');state.origin=null;if($('kitchens'))renderKitchenCards();}
});
function renderContent() {
  if (state.map) {
    state.map.remove();
    state.map = null;
  }
  const content = $("content");
  if (state.tab === "discover") {
    content.innerHTML = `<h2>${tr("From kitchens around you", "از آشپزخانه‌های اطرافت")}</h2><div class="controls"><div><label for="area">${tr("Approximate origin", "مبدأ تقریبی")}</label><select id="area"><option value="">${tr("Choose an area", "انتخاب محله")}</option>${Object.entries(
      areas,
    )
      .map(
        ([key, area]) =>
          `<option value="${key}" ${key === state.area ? "selected" : ""}>${area.name}</option>`,
      )
      .join(
        "",
      )}</select></div><button type="button" id="locate">${tr("Use my location", "استفاده از موقعیت من")}</button><button id="nearest" type="button" aria-pressed="${state.sort}">${tr("Nearest first", "نزدیک‌ترین اول")}</button><button id="showMap" type="button">${tr("Show map", "نمایش نقشه")}</button></div><p class="muted">${tr("Distances are straight-line estimates to a public kitchen area. Your device location stays in this browser.", "فاصله‌ها مستقیم و تقریبی تا محدوده عمومی آشپز هستند. موقعیت دستگاه فقط در همین مرورگر می‌ماند.")}</p><div id="map" hidden></div><div id="kitchens" class="grid"></div>`;
    $("area").onchange = () => {
      state.area = $("area").value;
      state.origin = areas[state.area] || null;
      renderKitchenCards();
    };
    $("nearest").onclick = () => {
      if (!state.origin) {
        $("feedback").textContent = tr(
          "Choose an origin first.",
          "ابتدا مبدأ را انتخاب کنید.",
        );
        return;
      }
      state.sort = !state.sort;
      $("nearest").setAttribute("aria-pressed", String(state.sort));
      renderKitchenCards();
    };
    $("locate").onclick = () => {
      if(window.ReactNativeWebView){
        window.ReactNativeWebView.postMessage(JSON.stringify({type:'SOFREH_LOCATION_REQUEST'}));
        $('feedback').textContent=tr('Finding your location…','در حال دریافت موقعیت…');
        return;
      }
      if (!navigator.geolocation) {
        $("feedback").textContent = tr(
          "Location is unavailable. Choose an area.",
          "مکان‌یابی در دسترس نیست؛ محله را انتخاب کنید.",
        );
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude: lat, longitude: lng } = position.coords;
          if (
            !Number.isFinite(lat) ||
            !Number.isFinite(lng) ||
            Math.abs(lat) > 90 ||
            Math.abs(lng) > 180
          )
            return;
          state.origin = { lat, lng };
          state.area = "";
          $("area").value = "";
          $("feedback").textContent = tr(
            "Location used only on this device.",
            "موقعیت فقط روی همین دستگاه استفاده شد.",
          );
          renderKitchenCards();
        },
        () => {
          state.origin = null;
          state.area = "";
          $("area").value = "";
          renderKitchenCards();
          $("feedback").textContent = tr(
            "Could not use your location. Choose an area instead.",
            "موقعیت دریافت نشد؛ محله را انتخاب کنید.",
          );
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
      );
    };
    $("showMap").onclick = () => action(showMap);
    const filters=document.createElement('div');filters.className='controls food-filters';
    filters.innerHTML=`${field('foodSearch',tr('Search food or kitchen','جست‌وجوی غذا یا آشپزخانه'),state.query,'search','maxlength="120"')}<div><label for="fulfillmentFilter">${tr('Receive food','روش دریافت')}</label><select id="fulfillmentFilter"><option value="">${tr('Any method','همه روش‌ها')}</option><option value="pickup" ${state.fulfillmentFilter==='pickup'?'selected':''}>${modeText('pickup')}</option><option value="delivery" ${state.fulfillmentFilter==='delivery'?'selected':''}>${modeText('delivery')}</option></select></div><label class="filter-check"><input id="availableOnly" type="checkbox" ${state.availableOnly?'checked':''}> ${tr('Available now','قابل سفارش')}</label>`;
    content.insertBefore(filters,content.querySelector('.controls'));
    const originalControls=filters.nextElementSibling;
    const note=originalControls.nextElementSibling;
    const map=$('map');
    const locationGroup=document.createElement('details');
    locationGroup.innerHTML=`<summary id="locationSummary">${tr('Location and map','مکان و نقشه')}</summary>`;
    content.insertBefore(locationGroup,originalControls);
    locationGroup.append(originalControls,note,map);
    $('foodSearch').oninput=()=>{state.query=$('foodSearch').value;renderKitchenCards();};
    $('fulfillmentFilter').onchange=()=>{state.fulfillmentFilter=$('fulfillmentFilter').value;renderKitchenCards();};
    $('availableOnly').onchange=()=>{state.availableOnly=$('availableOnly').checked;renderKitchenCards();};
    renderKitchenCards();
  } else if (state.tab === "cart") renderCart();
  else if (state.tab === "orders") renderOrders();
  else if (state.tab === "kitchen") renderKitchenForm();
  else if (state.tab === "menu") renderMenu();
  else renderProfile();
}
function searchText(value){return String(value||'').normalize('NFKC').toLocaleLowerCase().replace(/ي/g,'ی').replace(/ك/g,'ک');}
function matchingDishes(cook){const query=searchText(state.query).trim();const kitchenMatches=searchText([cook.kitchenName,...Object.values(cook.kitchenNameLocalized),cook.neighborhood].join(' ')).includes(query);
  return cook.dishes.filter(dish=>(!state.availableOnly||(dish.isAvailableToday&&Date.parse(dish.serviceWindowEndIso)>Date.now()))&&(!query||kitchenMatches||searchText([...Object.values(dish.titleLocalized),...Object.values(dish.descriptionLocalized)].join(' ')).includes(query)));
}
function filteredKitchens(){return state.cooks.filter(cook=>(!state.fulfillmentFilter||(state.fulfillmentFilter==='pickup'?cook.supportsPickup:cook.supportsDelivery))&&matchingDishes(cook).length);}
function refreshMarkers(){state.markers.forEach(marker=>marker.remove());state.markers=[];if(!state.map)return;for(const cook of filteredKitchens())state.markers.push(new maplibregl.Marker({color:'#9c2940'}).setLngLat([cook.publicLng,cook.publicLat]).setPopup(new maplibregl.Popup().setText(cook.kitchenName+' · '+cook.neighborhood)).addTo(state.map));if(state.origin)state.markers.push(new maplibregl.Marker({color:'#2679a8'}).setLngLat([state.origin.lng,state.origin.lat]).setPopup(new maplibregl.Popup().setText(tr('Your selected origin','مبدأ انتخاب‌شده شما'))).addTo(state.map));}
function renderKitchenCards() {
  const kitchens = filteredKitchens();
  if (state.sort && state.origin)
    kitchens.sort((a, b) => distance(a) - distance(b));
  refreshMarkers();
  $("kitchens").innerHTML = kitchens.length
    ? kitchens
        .map(kitchenCard)
        .join("")
    : `<p class="empty">${(state.cooks.some(cook=>cook.dishes.length)?tr("No meals match these filters. Try another search.","غذایی با این فیلترها پیدا نشد؛ جست‌وجو را تغییر دهید."):tr("No kitchens have published a menu here yet.","هنوز آشپزخانه‌ای منویش را در اینجا ثبت نکرده است."))}</p>`;
  $("kitchens")
    .querySelectorAll("[data-add]")
    .forEach(
      (button) =>
        (button.onclick = () =>
          action(
            async () => {
              const cook = state.cooks.find(
                (c) => c.id === button.dataset.cook,
              );
              const dishId = button.dataset.add;
              if (state.cart?.items.length && state.cart.cookId !== cook.id) {
                throw new Error(tr('Your cart is from another kitchen. Clear it before switching.','سبد از آشپزخانه دیگری است؛ پیش از تغییر، آن را خالی کنید.'));
              }
              const quantity =
                (state.cart?.cookId === cook.id
                  ? state.cart.items.find((item) => item.dishId === dishId)
                      ?.quantity || 0
                  : 0) + 1;
              const fulfillmentType =
                state.cart?.cookId === cook.id
                  ? state.cart.fulfillmentType
                  : cook.supportsPickup
                    ? "pickup"
                    : "delivery";
              await api("/api/customer/cart/items", {
                cookId: cook.id,
                dishId,
                quantity,
                fulfillmentType,
              });
              state.checkoutKey = null;
              await refresh();
            },
            tr("Added to your cart.", "به سبد اضافه شد."),
          )),
    );
}
function kitchenCard(cook) {
  const rating = cook.reviewSummary.reviewCount
    ? `${number(cook.reviewSummary.averageRating)} / ${number(5)} · ${number(cook.reviewSummary.reviewCount)} ${tr(cook.reviewSummary.reviewCount===1?'review':'reviews','نظر')}`
    : tr('No ratings yet','هنوز امتیازی ثبت نشده');
  return `<article class="card kitchen-card">
    <div class="row"><h3>${h(cook.kitchenName)}</h3><span class="tag">${h(cook.neighborhood)}</span></div>
    <p class="muted kitchen-meta">${state.origin ? tr('Approx. ','حدود ') + number(distance(cook)) + tr(' km to kitchen area',' کیلومتر تا محدوده آشپز') : tr('Choose an origin to see distance','برای دیدن فاصله، مبدأ را انتخاب کنید')} · ${rating}</p>
    ${matchingDishes(cook).map(dish=>dishCard(cook,dish)).join('')}
    <details class="kitchen-details"><summary>${tr('Kitchen details and reviews','درباره آشپزخانه و نظرها')}</summary>
      <p>${h(cook.bio)}</p><p>${h(cook.pickupWindowLabel)}</p>
      <p>${cook.supportsPickup ? modeText('pickup') : ''}${cook.supportsPickup && cook.supportsDelivery ? ' · ' : ''}${cook.supportsDelivery ? modeText('delivery')+' '+money(cook.deliveryFeeCents) : ''}</p>
      ${cook.reviews.slice(0,3).map(review=>`<div class="review"><strong>${number(review.rating)} / ${number(5)}</strong><p>${review.commentEscaped}</p></div>`).join('')}
    </details>
  </article>`;
}
function dishCard(cook, dish) {
  const available =
    dish.isAvailableToday && Date.parse(dish.serviceWindowEndIso) > Date.now();
  return `<div class="dish">${dish.photoUrl ? `<img src="${h(dish.photoUrl)}" alt="${h(dish.title)}" loading="lazy">` : ""}<div class="row"><h3>${h(dish.title)}</h3><span class="price">${money(dish.priceCents)}</span></div><p>${h(dish.description)}</p><p class="muted">${tr("Allergens: ", "مواد حساسیت‌زا: ")}${dish.allergens.length ? h(dish.allergens.join("، ")) : tr("No allergens declared; ask the cook if needed.", "موردی اعلام نشده؛ در صورت نیاز از آشپز بپرسید.")}</p><p class="muted">${date(dish.serviceWindowStartIso)} — ${date(dish.serviceWindowEndIso)}</p><div class="row"><span>${available ? number(dish.remainingPortions) + tr(" portions left", " پرس مانده") : tr("Unavailable", "ناموجود")}</span><button class="primary" type="button" data-add="${h(dish.id)}" data-cook="${h(cook.id)}" ${available ? "" : "disabled"}>${tr("Add to cart", "افزودن به سبد")}</button></div></div>`;
}
async function showMap() {
  if (!$("map")) return;
  $("map").hidden = false;
  if (!window.maplibregl) {
    await new Promise((resolve, reject) => {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css";
      document.head.append(css);
      const script = document.createElement("script");
      script.src = "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js";
      script.onload = resolve;
      script.onerror = () =>
        reject(
          new Error(
            tr(
              "Map unavailable. The kitchen list still works.",
              "نقشه در دسترس نیست؛ فهرست آشپزخانه‌ها قابل استفاده است.",
            ),
          ),
        );
      document.head.append(script);
    });
  }
  if (!$("map")) return;
  state.map = new maplibregl.Map({
    container: "map",
    style: "https://tiles.openfreemap.org/styles/liberty",
    center: [-79.4124, 43.7701],
    zoom: 10,
  });
  state.map.addControl(new maplibregl.NavigationControl());
  refreshMarkers();
}
function renderCart() {
  const cart = state.cart;
  const content = $("content");
  if (!cart?.items.length) {
    content.innerHTML = `<h2>${tr("Your cart", "سبد شما")}</h2><p class="empty">${tr("Your cart is empty. Find something good to eat.", "سبد خالی است؛ غذای دلخواهت را پیدا کن.")}</p>`;
    return;
  }
  const cook = state.cooks.find((c) => c.id === cart.cookId);
  content.innerHTML = `<div class="card"><h2>${h(cart.kitchenName || cook?.kitchenName || tr("Your cart", "سبد شما"))}</h2>${cart.items.map((item) => `<div class="dish row"><div><strong>${h(item.title || item.titleLocalized?.[locale()] || item.titleEn)}</strong><p>${money(item.unitPriceCents)} × ${number(item.quantity)}</p></div><div class="actions"><button type="button" data-qty="${h(item.dishId)}" data-next="${item.quantity - 1}" aria-label="${tr("Remove one", "کاهش یک پرس")}">−</button><span>${number(item.quantity)}</span><button type="button" data-qty="${h(item.dishId)}" data-next="${item.quantity + 1}" aria-label="${tr("Add one", "افزایش یک پرس")}">+</button></div></div>`).join("")}<form id="checkout"><label for="fulfillment">${tr("Receive your food", "دریافت غذا")}</label><select id="fulfillment">${cook?.supportsPickup ? `<option value="pickup" ${cart.fulfillmentType === "pickup" ? "selected" : ""}>${modeText("pickup")}</option>` : ""}${cook?.supportsDelivery ? `<option value="delivery" ${cart.fulfillmentType === "delivery" ? "selected" : ""}>${modeText("delivery")}</option>` : ""}</select><div id="deliveryFields" ${cart.fulfillmentType === "delivery" ? "" : "hidden"}><label for="savedAddress">${tr("Saved address", "نشانی ذخیره‌شده")}</label><select id="savedAddress"><option value="">${tr("Enter an address", "واردکردن نشانی")}</option>${state.addresses.map((address) => `<option value="${h(address.id)}">${h(address.label)}</option>`).join("")}</select><label for="deliveryAddress">${tr("Delivery address", "نشانی تحویل")}</label><textarea id="deliveryAddress" maxlength="500">${h(cart.deliveryAddress || "")}</textarea></div><label for="notes">${tr("Order notes", "توضیح سفارش")}</label><textarea id="notes" maxlength="1000"></textarea><div class="total"><div class="row"><span>${tr("Food", "غذا")}</span><strong>${money(cart.subtotalCents)}</strong></div><div class="row"><span>${tr("Delivery fee", "هزینه ارسال")}</span><strong>${money(cart.deliveryFeeCents)}</strong></div><div class="row"><span>${tr("Total", "جمع کل")}</span><strong class="price">${money(cart.totalCents)}</strong></div></div><p class="notice">${tr("Simulated payment — no charge. The cook must accept your order.", "پرداخت آزمایشی است و هزینه‌ای برداشت نمی‌شود. آشپز باید سفارش را بپذیرد.")}</p><button class="primary" type="submit">${tr("Place order", "ثبت سفارش")}</button><button type="button" id="clearCart" class="danger">${tr("Clear cart", "خالی‌کردن سبد")}</button></form></div>`;
  content.querySelectorAll("[data-qty]").forEach(
    (button) =>
      (button.onclick = () =>
        action(async () => {
          await api("/api/customer/cart/items", {
            cookId: cart.cookId,
            dishId: button.dataset.qty,
            quantity: Number(button.dataset.next),
            fulfillmentType: cart.fulfillmentType,
            deliveryAddress: cart.deliveryAddress,
          });
          state.checkoutKey = null;
          await refresh();
        })),
  );
  $("clearCart").onclick = () =>
    action(async () => {
      await api("/api/customer/cart", null, "DELETE");
      state.checkoutKey = null;
      await refresh();
    });
  $("savedAddress").onchange = () => {
    $("deliveryAddress").value =
      state.addresses.find((address) => address.id === $("savedAddress").value)
        ?.address || "";
  };
  $("fulfillment").onchange = () =>
    action(async () => {
      const address = $("deliveryAddress").value;
      await api(
        "/api/customer/cart",
        {
          cookId: cart.cookId,
          items: cart.items.map((item) => ({
            dishId: item.dishId,
            quantity: item.quantity,
          })),
          fulfillmentType: $("fulfillment").value,
          deliveryAddress: address,
        },
        "PUT",
      );
      state.checkoutKey = null;
      await refresh();
    });
  $("checkout").onsubmit = (event) => {
    event.preventDefault();
    action(
      async () => {
        const latest=(await api('/api/customer/cart')).cart;
        const quote=value=>JSON.stringify({cook:value.cookId,fulfillment:value.fulfillmentType,total:value.totalCents,items:value.items.map(item=>[item.dishId,item.quantity,item.unitPriceCents])});
        if(quote(latest)!==quote(cart)){
          state.checkoutKey=null;state.cart=latest;
          if(!latest.items.length){state.tab='orders';await refresh();}else renderCart();
          throw new Error(tr('Your cart or prices changed. Review the latest total and orders before continuing.','سبد یا قیمت‌ها تغییر کرده‌اند؛ مبلغ تازه و سفارش‌ها را پیش از ادامه بررسی کنید.'));
        }
        if (
          cart.fulfillmentType === "delivery" &&
          !$("deliveryAddress").value.trim()
        )
          throw new Error(
            tr("Enter a delivery address.", "نشانی تحویل را وارد کنید."),
          );
        if (!state.checkoutKey) state.checkoutKey = crypto.randomUUID();
        await api("/api/customer/orders", {
          cookId: cart.cookId,
          items: cart.items.map((item) => ({
            dishId: item.dishId,
            quantity: item.quantity,
          })),
          fulfillmentType: cart.fulfillmentType,
          deliveryAddress: $("deliveryAddress").value,
          customerNotes: $("notes").value,
          simulatedPaymentMethod: "SIMULATED_CARD",
          idempotencyKey: state.checkoutKey,
        });
        state.checkoutKey = null;
        state.tab = "orders";
        await refresh();
      },
      tr("Order sent to the cook.", "سفارش برای آشپز فرستاده شد."),
    );
  };
}
function renderOrders() {
  const content = $("content");
  content.innerHTML = `<div class="live-heading"><h2>${tr("Your orders", "سفارش‌های شما")}</h2><button id="notifications" type="button">${tr("Allow order alerts", "فعال‌کردن اعلان سفارش")}</button></div><p class="muted">${tr("Allow push alerts to receive order changes while away from this page. Delivery depends on browser, permission and device settings.", "با فعال‌کردن اعلان، تغییرات سفارش را هنگام دوربودن از صفحه هم دریافت کنید؛ دریافت به مرورگر، مجوز و تنظیمات دستگاه وابسته است.")}</p><div class="grid">${state.orders.length ? state.orders.map((order) => `<article class="card"><div class="row"><h3>${h(fa ? order.kitchenNameFa : order.kitchenNameEn) || tr("Order", "سفارش")}</h3><span class="order-status">${statusText(order.status)}</span></div><p class="muted"><bdi>${h(order.id)}</bdi> · ${date(order.createdAtIso)}</p><p>${modeText(order.fulfillmentType)} · <strong>${money(order.totalCents)}</strong></p>${order.items.map((item) => `<p>${number(item.quantity)} × ${h(fa ? item.titleFa : item.titleEn)}</p>`).join("")}${order.pickupAddressReleased ? `<p><strong>${tr("Pickup address: ", "نشانی دریافت: ")}</strong><bdi>${h(order.pickupAddressReleased)}</bdi></p>` : ""}${order.deliveryAddressForFulfillment || order.deliveryAddress ? `<p dir="auto">${h(order.deliveryAddressForFulfillment || order.deliveryAddress)}</p>` : ""}${order.customerNotes ? `<p>${h(order.customerNotes)}</p>` : ""}${order.simulatedPaymentStatus === "SIMULATED_REFUNDED" ? `<p class="muted">${tr("Simulated payment refunded", "بازگشت وجه آزمایشی ثبت شد")}</p>` : ""}<div class="actions">${isCook() ? nextActions(order) : ""}</div>${reviewsMarkup(order)}${order.status === "COMPLETED" && !(order.reviews||[]).some(review=>review.reviewerUserId===state.profile.account.id) ? `<details><summary>${tr("Rate this order", "ثبت نظر برای سفارش")}</summary><form data-review="${h(order.id)}"><label>${tr("Rating", "امتیاز")}<select name="rating">${[5, 4, 3, 2, 1].map((value) => `<option value="${value}">${number(value)} / 5</option>`).join("")}</select></label><label>${tr("Your comment", "نظر شما")}<textarea name="comment" maxlength="1000" required></textarea></label><button type="submit">${tr("Save review", "ثبت نظر")}</button></form></details>` : ""}</article>`).join("") : `<p class="empty">${tr("No orders yet.", "هنوز سفارشی ثبت نشده است.")}</p>`}</div>`;
  $("notifications").onclick = () => action(enablePush);
  content.querySelectorAll("[data-transition]").forEach(
    (button) =>
      (button.onclick = () =>
        action(
          async () => {
            await api(
              "/api/cook/orders/" +
                encodeURIComponent(button.dataset.order) +
                "/status",
              { nextStatus: button.dataset.transition },
            );
            await refresh();
          },
          tr("Order updated.", "سفارش به‌روز شد."),
        )),
  );
  content.querySelectorAll("[data-review]").forEach(
    (form) =>
      (form.onsubmit = (event) => {
        event.preventDefault();
        action(
          async () => {
            const data = new FormData(form);
            await api(
              "/api/orders/" +
                encodeURIComponent(form.dataset.review) +
                "/reviews",
              {
                rating: Number(data.get("rating")),
                comment: data.get("comment"),
              },
            );
            await refresh();
          },
          tr("Review saved.", "نظر ثبت شد."),
        );
      }),
  );
}
function reviewsMarkup(order){return (order.reviews||[]).map(review=>`<div class="review"><strong>${review.reviewerRole==='COOK'?tr('Cook review','نظر آشپز'):tr('Customer review','نظر مشتری')} · ${number(review.rating)} / 5</strong><p>${review.commentEscaped}</p></div>`).join('');}
function nextActions(order) {
  const labels = {ACCEPTED:tr('Accept','پذیرش'),REJECTED:tr('Decline','رد سفارش'),PREPARING:tr('Start preparing','شروع آماده‌سازی'),READY:tr('Mark ready','آماده تحویل'),COMPLETED:tr('Complete','تکمیل سفارش'),CANCELLED:tr('Cancel','لغو سفارش')};
  const transitions = {
    PENDING: ["ACCEPTED", "REJECTED"],
    ACCEPTED: ["PREPARING", "READY", "CANCELLED"],
    PREPARING: ["READY", "CANCELLED"],
    READY: ["COMPLETED"],
  };
  return (transitions[order.status] || [])
    .map(
      (status) =>
        `<button type="button" data-transition="${status}" data-order="${h(order.id)}" class="${["REJECTED", "CANCELLED"].includes(status) ? "danger" : "primary"}">${labels[status]}</button>`,
    )
    .join("");
}
function renderKitchenForm() {
  const own = state.own;
  const cook = state.cooks.find((item) => item.id === own?.id);
  const area =
    Object.entries(state.areas).find(
      ([, value]) => value.name === own?.neighborhood,
    )?.[0] || "willowdale";
  $("content").innerHTML =
    `<h2>${tr("Your kitchen", "آشپزخانه شما")}</h2><p>${tr("Only the selected area is public. Your pickup address is shared with an accepted pickup order.", "فقط محله انتخاب‌شده عمومی است. نشانی دریافت، پس از پذیرش سفارش حضوری نمایش داده می‌شود.")}</p><form id="kitchenForm" class="card"><div class="form-grid">${field("nameEn", tr("Kitchen name — English", "نام آشپزخانه — انگلیسی"), own?.nameEn || "", "text", 'required maxlength="180"')}${field("nameFa", tr("Kitchen name — Persian", "نام آشپزخانه — فارسی"), own?.nameFa || "", "text", 'required maxlength="180"')}${field("bioEn", tr("About your kitchen — English", "معرفی آشپزخانه — انگلیسی"), own?.bioEn || "", "text", 'maxlength="1500"')}${field("bioFa", tr("About your kitchen — Persian", "معرفی آشپزخانه — فارسی"), own?.bioFa || "", "text", 'maxlength="1500"')}<div><label for="kitchenArea">${tr("Public area", "محله عمومی")}</label><select name="area" id="kitchenArea">${Object.entries(
      state.areas,
    )
      .map(
        ([key, value]) =>
          `<option value="${key}" ${key === area ? "selected" : ""}>${h(value.name)}</option>`,
      )
      .join(
        "",
      )}</select></div>${field("pickupAddress", tr("Private pickup address", "نشانی خصوصی دریافت"), own?.pickupAddress || "", "text", 'required maxlength="500"')}${field("pickupWindowEn", tr("Pickup / delivery window — English", "بازه دریافت / ارسال — انگلیسی"), own?.pickupWindowEn || "", "text", 'required maxlength="180"')}${field("pickupWindowFa", tr("Pickup / delivery window — Persian", "بازه دریافت / ارسال — فارسی"), own?.pickupWindowFa || "", "text", 'required maxlength="180"')}<div><label for="fulfillmentMode">${tr("How customers receive food", "روش دریافت غذا")}</label><select id="fulfillmentMode" name="fulfillmentMode">${["both", "pickup", "delivery"].map((mode) => `<option value="${mode}" ${mode === (cook ? (cook.supportsPickup && cook.supportsDelivery ? "both" : cook.supportsPickup ? "pickup" : "delivery") : "both") ? "selected" : ""}>${mode === "both" ? tr("Pickup and delivery", "حضوری و ارسال") : modeText(mode)}</option>`).join("")}</select></div>${field("deliveryFee", tr("Delivery fee (CAD)", "هزینه ارسال (دلار کانادا)"), (cook?.deliveryFeeCents || 0) / 100, "number", 'required min="0" max="500" step="0.01"')}${field("deliveryRadiusKm", tr("Delivery area radius (km)", "شعاع محدوده ارسال (کیلومتر)"), cook?.deliveryRadiusKm || 5, "number", 'required min="0" max="100" step="1"')}</div><p class="notice">${tr("Saving publishes your kitchen details to discovery. Enter accurate information and allergens. No verification or licensing badge is implied.", "با ذخیره، معرفی آشپزخانه در فهرست کشف غذا دیده می‌شود. اطلاعات و مواد حساسیت‌زا را دقیق وارد کنید. نشان تأیید یا مجوزی اعطا نمی‌شود.")}</p><button type="submit" class="primary">${tr("Save kitchen", "ذخیره آشپزخانه")}</button></form>`;
  $("kitchenForm").onsubmit = (event) => {
    event.preventDefault();
    action(
      async () => {
        const form = Object.fromEntries(new FormData(event.target));
        form.deliveryFeeCents = Math.round(Number(form.deliveryFee) * 100);
        delete form.deliveryFee;
        form.deliveryRadiusKm = Number(form.deliveryRadiusKm);
        await api("/api/cook/kitchen", form, "PUT");
        await refresh();
      },
      tr(
        "Kitchen saved. Add your menu next.",
        "آشپزخانه ذخیره شد؛ منو را هم اضافه کنید.",
      ),
    );
  };
}
function localDateTime(iso) {
  const value = new Date(iso);
  return new Date(value.getTime() - value.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
function renderMenu() {
  if (!state.own) {
    $("content").innerHTML =
      `<p class="empty">${tr("Create your kitchen before adding dishes.", "پیش از افزودن غذا، آشپزخانه را ثبت کنید.")}</p>`;
    return;
  }
  const cook = state.cooks.find((item) => item.id === state.own.id);
  const dish = cook?.dishes.find((item) => item.id === state.editDish);
  $("content").innerHTML =
    `<h2>${tr("Menu and portions", "منو و تعداد پرس")}</h2><div class="grid">${(cook?.dishes || []).map((item) => `<article class="card"><h3>${h(item.title)}</h3><p>${money(item.priceCents)} · ${number(item.remainingPortions)} ${tr("portions left", "پرس مانده")}</p><p>${date(item.serviceWindowEndIso)}</p><button type="button" data-edit-dish="${h(item.id)}">${tr("Edit dish", "ویرایش غذا")}</button></article>`).join("")}</div><div class="card" style="margin-top:24px"><h3>${dish ? tr("Edit dish", "ویرایش غذا") : tr("Add a dish", "افزودن غذا")}</h3><form id="dishForm"><div class="form-grid">${field("titleEn", tr("Dish name — English", "نام غذا — انگلیسی"), dish?.titleLocalized["en-CA"] || "", "text", 'required maxlength="180"')}${field("titleFa", tr("Dish name — Persian", "نام غذا — فارسی"), dish?.titleLocalized["fa-IR"] || "", "text", 'required maxlength="180"')}${field("descriptionEn", tr("Description — English", "توضیحات — انگلیسی"), dish?.descriptionLocalized["en-CA"] || "", "text", 'maxlength="1500"')}${field("descriptionFa", tr("Description — Persian", "توضیحات — فارسی"), dish?.descriptionLocalized["fa-IR"] || "", "text", 'maxlength="1500"')}${field("price", tr("Price per portion (CAD)", "قیمت هر پرس (دلار کانادا)"), dish ? dish.priceCents / 100 : "", "number", 'required min="0.01" max="1000" step="0.01"')}${field("remainingPortions", tr("Portions available to order", "پرس قابل سفارش"), dish?.remainingPortions ?? 0, "number", 'required min="0" max="10000" step="1"')}${field("serviceWindowStartIso", tr("Service starts (your device time)", "شروع تحویل (ساعت دستگاه شما)"), localDateTime(dish?.serviceWindowStartIso || new Date()), "datetime-local", "required")}${field("serviceWindowEndIso", tr("Service ends (your device time)", "پایان تحویل (ساعت دستگاه شما)"), localDateTime(dish?.serviceWindowEndIso || new Date(Date.now() + 86400000)), "datetime-local", "required")}${field("allergens", tr("Allergens, separated by commas", "مواد حساسیت‌زا، با ویرگول جدا شوند"), dish?.allergens.join(", ") || "", "text", 'maxlength="1500"')}<div><label for="availabilityMode">${tr("Availability", "وضعیت عرضه")}</label><select id="availabilityMode" name="availabilityMode"><option value="TODAY_AVAILABLE">${tr("Available in this service window", "قابل سفارش در این بازه")}</option><option value="REGULAR_UNAVAILABLE" ${dish?.availabilityMode === "REGULAR_UNAVAILABLE" ? "selected" : ""}>${tr("On the menu, unavailable now", "در منو، فعلاً ناموجود")}</option></select></div></div><p class="muted">${tr("List every relevant allergen. A blank field is not an allergen-free guarantee.", "مواد حساسیت‌زا را کامل وارد کنید. خالی‌بودن این قسمت به معنی بی‌خطر بودن غذا برای حساسیت نیست.")}</p><div class="actions"><button type="submit" class="primary">${tr("Save dish", "ذخیره غذا")}</button>${dish ? `<button id="newDish" type="button">${tr("Add another dish", "افزودن غذای دیگر")}</button>` : ""}</div></form></div>`;
  $("content")
    .querySelectorAll("[data-edit-dish]")
    .forEach((button) => {
      button.onclick = () => {
        state.editDish = button.dataset.editDish;
        renderContent();
      };
      const item = cook.dishes.find(
        (item) => item.id === button.dataset.editDish,
      );
      const form = document.createElement("form");
      form.innerHTML = `<label for="photo-${h(item.id)}">${tr("Food photo (becomes public)", "عکس غذا (عمومی می‌شود)")}</label><input id="photo-${h(item.id)}" type="file" accept="image/jpeg,image/png,image/webp" required><button type="submit">${tr("Upload photo", "بارگذاری عکس")}</button>`;
      if (item.photoUrl) {
        const image = document.createElement("img");
        image.src = item.photoUrl;
        image.alt = item.title;
        image.style.cssText =
          "width:100%;height:180px;object-fit:cover;border-radius:12px";
        button.parentElement.prepend(image);
      }
      form.onsubmit = (event) => {
        event.preventDefault();
        action(
          async () => {
            const file = form.querySelector("input").files[0];
            if (!file || file.size > 10000000)
              throw new Error(
                tr(
                  "Choose a photo under 10 MB.",
                  "عکس کوچک‌تر از ۱۰ مگابایت انتخاب کنید.",
                ),
              );
            const image = await createImageBitmap(file);
            const scale = Math.min(
              1,
              1200 / Math.max(image.width, image.height),
            );
            const canvas = document.createElement("canvas");
            canvas.width = Math.round(image.width * scale);
            canvas.height = Math.round(image.height * scale);
            canvas
              .getContext("2d")
              .drawImage(image, 0, 0, canvas.width, canvas.height);
            image.close();
            const imageBase64 = canvas
              .toDataURL("image/jpeg", 0.85)
              .split(",")[1];
            await api(
              "/api/cook/dishes/" + encodeURIComponent(item.id) + "/photo",
              { imageBase64 },
              "PUT",
            );
            await refresh();
          },
          tr("Photo saved.", "عکس ذخیره شد."),
        );
      };
      button.parentElement.append(form);
    });
  if ($("newDish"))
    $("newDish").onclick = () => {
      state.editDish = null;
      renderContent();
    };
  $("dishForm").onsubmit = (event) => {
    event.preventDefault();
    action(
      async () => {
        const form = Object.fromEntries(new FormData(event.target));
        form.priceCents = Math.round(Number(form.price) * 100);
        delete form.price;
        form.remainingPortions = Number(form.remainingPortions);
        form.allergens = form.allergens
          .split(/[,،]/)
          .map((item) => item.trim())
          .filter(Boolean);
        form.serviceWindowStartIso = new Date(
          form.serviceWindowStartIso,
        ).toISOString();
        form.serviceWindowEndIso = new Date(
          form.serviceWindowEndIso,
        ).toISOString();
        await api(
          "/api/cook/dishes" + (dish ? "/" + encodeURIComponent(dish.id) : ""),
          form,
          "PUT",
        );
        state.editDish = null;
        await refresh();
      },
      tr("Dish saved.", "غذا ذخیره شد."),
    );
  };
}
function renderProfile() {
  const content = $("content");
  content.innerHTML = `<h2>${tr("Your account", "حساب شما")}</h2><div class="card"><h3>${h(state.profile.name)}</h3><p dir="ltr">${h(state.profile.email)}</p><p>${isCook() ? tr("Cook account", "حساب آشپز") : tr("Customer account", "حساب مشتری")}</p><details><summary>${tr("Change password", "تغییر گذرواژه")}</summary><form id="passwordForm">${field("currentPassword", tr("Current password", "گذرواژه فعلی"), "", "password", 'required autocomplete="current-password"')}${field("newPassword", tr("New password, 12–128 characters", "گذرواژه جدید، ۱۲ تا ۱۲۸ نویسه"), "", "password", 'required minlength="12" maxlength="128" autocomplete="new-password"')}<button type="submit">${tr("Update password", "تغییر گذرواژه")}</button></form></details></div>${!isCook() ? `<div class="card" style="margin-top:22px"><h3>${tr("Delivery addresses", "نشانی‌های تحویل")}</h3>${state.addresses.map((address) => `<div class="dish row"><div><strong>${h(address.label)}</strong><p>${h(address.address)}</p></div><button type="button" class="danger" data-remove-address="${h(address.id)}">${tr("Remove", "حذف")}</button></div>`).join("")}<form id="addressForm">${field("addressLabel", tr("Label", "عنوان"), "", "text", 'required maxlength="60"')}${field("address", tr("Delivery address", "نشانی تحویل"), "", "text", 'required minlength="5" maxlength="500"')}<button type="submit">${tr("Save address", "ذخیره نشانی")}</button></form></div>` : ""}`;
  $("passwordForm").onsubmit = (event) => {
    event.preventDefault();
    action(
      async () => {
        const form = Object.fromEntries(new FormData(event.target));
        await api("/api/auth/change-password", {
          ...form,
          revokeOtherSessions: true,
        });
        event.target.reset();
      },
      tr(
        "Password changed. Other sessions were signed out.",
        "گذرواژه تغییر کرد؛ نشست‌های دیگر بسته شدند.",
      ),
    );
  };
  if ($("addressForm"))
    $("addressForm").onsubmit = (event) => {
      event.preventDefault();
      action(
        async () => {
          const form = new FormData(event.target);
          await api("/api/customer/addresses", {
            label: form.get("addressLabel"),
            address: form.get("address"),
          });
          await refresh();
        },
        tr("Address saved.", "نشانی ذخیره شد."),
      );
    };
  content.querySelectorAll("[data-remove-address]").forEach(
    (button) =>
      (button.onclick = () =>
        action(async () => {
          await api(
            "/api/customer/addresses/" +
              encodeURIComponent(button.dataset.removeAddress),
            null,
            "DELETE",
          );
          await refresh();
        })),
  );
}
$("language").onclick = () => {
  fa = !fa;
  history.replaceState(null, "", location.pathname + "?locale=" + locale());
  action(() => refresh());
};
$("signOut").onclick = () =>
  action(async () => {
    try {
      const registration = await navigator.serviceWorker?.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await api(
          "/api/notifications/subscription",
          { endpoint: subscription.endpoint },
          "DELETE",
        );
        await subscription.unsubscribe();
      }
    } catch {}
    await api("/api/auth/sign-out", {});
    location.replace("/account?locale=" + locale());
  });
$("refresh").onclick = () => action(() => refresh());
window.addEventListener("online", () =>
  refresh({ full: false }).catch(() => connection(false)),
);
window.addEventListener("offline", () => connection(false));
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && !state.busy)
    refresh({ full: false }).catch(() => connection(false));
});
setInterval(() => {
  if (!state.busy) refresh({ full: false }).catch(() => connection(false));
}, 15000);
refresh().catch((error) => {
  $("feedback").textContent = error.message;
  connection(false);
});
