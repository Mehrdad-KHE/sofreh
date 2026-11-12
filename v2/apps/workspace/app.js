import {createCommerceUI} from '/app/commerce-ui.js';
const $ = (id) => document.getElementById(id);
let fa = new URLSearchParams(location.search).get("locale") === "fa-IR";
let localeResolved = new URLSearchParams(location.search).has('locale');
if(!localeResolved){try{const saved=localStorage.getItem('sofreh.locale');if(['en-CA','fa-IR'].includes(saved)){fa=saved==='fa-IR';localeResolved=true;}}catch{}}
const tr = (en, persian) => (fa ? persian : en);
const menuCategories = () => ({all:tr('All items','همه اقلام'),food:tr('Food','غذا'),bread:tr('Bread','نان'),pickles:tr('Pickles','ترشی'),sides:tr('Sides','کنار غذا'),other:tr('Other items','سایر اقلام')});
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
  category: 'all',
  cart: null,
  orders: [],
  orderFilter: "active",
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
  checkoutDraft: null,
  query: '',
  fulfillmentFilter: '',
  availableOnly: false,
  markers: [],
  pushConfig: null,
  favoriteIds: [],favoritesOnly:false,intentConsumed:false,businessTab:'overview',reportDays:30,
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
const commerce=createCommerceUI({$,state,api,action,refresh,h,tr,money,date,locale,isCook,renderKitchenCards,rememberCheckoutDraft});

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
      OPTION_REQUIRED:tr('Choose the required menu options.','گزینه‌های لازم غذا را انتخاب کنید.'),
      OPTIONS_CHANGED:tr('This meal’s options changed. Remove it and choose again.','انتخاب‌های این غذا تغییر کرده‌اند؛ آن را از سبد حذف و دوباره انتخاب کنید.'),
      INVALID_OPTIONS:tr('Check your meal options.','انتخاب‌های غذا را بررسی کنید.'),
      SLOT_REQUIRED:tr('Choose a fulfillment window before ordering.','پیش از سفارش، نوبت دریافت را انتخاب کنید.'),
      SLOT_FULL:tr('That window is full. Choose another time.','ظرفیت این نوبت تکمیل شده؛ زمان دیگری انتخاب کنید.'),
      SLOT_UNAVAILABLE:tr('That window is no longer available. Refresh and choose another.','این نوبت دیگر در دسترس نیست؛ بازخوانی و زمان دیگری انتخاب کنید.'),
      COUPON_UNAVAILABLE:tr('This promotion is unavailable for your cart.','این کد تخفیف برای سبد فعلی قابل استفاده نیست.'),
      COUPON_LIMIT:tr('This promotion has reached its usage limit.','سقف استفاده از این کد تخفیف پر شده است.'),
      COUPON_EXISTS:tr('That promotion code already exists.','این کد تخفیف قبلاً ثبت شده است.'),
      DELIVERY_OUTSIDE_AREA:tr('Enter a full postal code inside the kitchen’s delivery area.','نشانی را همراه کد پستی کامل و داخل محدودهٔ ارسال آشپزخانه وارد کنید.'),
      CART_NOT_EMPTY:tr('Review or clear your current cart before repeating another order.','پیش از سفارش دوباره، سبد فعلی را بررسی یا خالی کنید.'),
      CANCELLATION_REQUIRES_COOK:tr('The cook is handling this order. Use the order message to discuss cancellation.','آشپز رسیدگی به این سفارش را شروع کرده است؛ برای لغو، داخل سفارش پیام بدهید.'),
      DISH_STOCK_CHANGED: tr('Available portions changed while you were editing. Reopen the dish and review its current stock.','تعداد پرس هنگام ویرایش تغییر کرده است؛ غذا را دوباره باز کنید و موجودی فعلی را بررسی کنید.'),
      PICKUP_ADDRESS_UNAVAILABLE: tr('Pickup is currently unavailable. Choose delivery, or wait for the cook to enable pickup address sharing.','دریافت حضوری فعلاً فعال نیست؛ ارسال را انتخاب کنید یا منتظر فعال‌کردن اشتراک نشانی توسط آشپز بمانید.'),
      ACTIVE_PICKUP_ORDERS: tr('Complete or cancel accepted pickup orders before turning off address sharing.','پیش از خاموش‌کردن اشتراک نشانی، سفارش‌های حضوری پذیرفته‌شده را تکمیل یا لغو کنید.'),
      ORDER_QUOTE_CHANGED: tr('The price or fee changed. Review the updated total before placing your order.','قیمت یا هزینه تغییر کرده است؛ جمع تازه را پیش از ثبت سفارش بررسی کنید.'),
      KITCHEN_PAUSED: tr('This kitchen has paused new orders. Choose another kitchen or try later.','این آشپزخانه سفارش تازه نمی‌گیرد؛ آشپزخانه دیگری انتخاب کنید یا بعداً برگردید.'),
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
    const error = new Error(
      message[code] ||
        tr(
          "Could not save this change. Check your entries and refresh.",
          "ذخیره انجام نشد؛ اطلاعات را بررسی و صفحه را بازخوانی کنید.",
        ),
    );
    error.code = code;
    throw error;
  }
  return data;
}
async function action(work, success = "") {
  if (state.busy) return;
  state.busy = true;
  $("feedback").textContent = "";
  const submitButtons = [...document.querySelectorAll("button[type=submit]")]
    .filter(button => !button.disabled);
  submitButtons.forEach(button => { button.disabled = true; });
  try {
    await work();
    if (success) $("feedback").textContent = success;
  } catch (error) {
    $("feedback").textContent = error.message;
  } finally {
    state.busy = false;
    // A refresh can replace the form with an intentionally blocked quote.
    // Restore only controls disabled by this action, never the new form.
    submitButtons.forEach(button => { if (button.isConnected) button.disabled = false; });
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
  let subscription;
  try {
    const registration = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    subscription =
      (await registration.pushManager.getSubscription()) ||
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: config.publicKey,
      }));
  } catch {
    throw new Error(tr(
      "Your browser could not enable alerts. Check notification permissions or try another browser. Orders keep updating while open.",
      "اعلان در این مرورگر فعال نشد. مجوز اعلان را بررسی کنید یا با مرورگر دیگری امتحان کنید. سفارش‌ها با صفحه باز به‌روز می‌شوند.",
    ));
  }
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
  const nextProfile = await api("/api/account");
  const identityChanged = Boolean(state.profile?.account?.id && state.profile.account.id !== nextProfile.account?.id);
  if (identityChanged || !nextProfile.account) {
    state.map?.remove();
    state.profile = null;
    state.cooks = [];
    state.category = 'all';
    state.cart = null;
    state.orders = [];
    state.orderFilter = "active";
    state.addresses = [];
    state.own = null;
    state.areas = {};
    state.tab = "";
    state.origin = null;
    state.area = "";
    state.sort = false;
    state.map = null;
    state.markers = [];
    state.checkoutKey = null;
    state.checkoutDraft = null;
    state.favoriteIds=[];state.favoritesOnly=false;
    state.hydrated = false;
    $("feedback").textContent = "";
    $("connection").textContent = "";
    $("welcome").textContent = "";
    $("heading").textContent = "";
    $("eyebrow").textContent = "";
    $("tabs").replaceChildren();
    $("content").replaceChildren();
    if (!nextProfile.account) {
      location.replace("/account?locale=" + locale());
      return;
    }
    state.profile = nextProfile;
    render();
  }
  state.profile = nextProfile;
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
    if (!state.cart.items.length) {
      state.checkoutDraft = null;
      if ($('checkout')) delete $('checkout').dataset.cookId;
    }
    orders = history.orders;
    state.addresses = addresses.addresses;
    state.favoriteIds=(await api('/api/customer/favorites')).kitchenIds;
    if(!state.intentConsumed){
      state.intentConsumed=true;
      let intent;try{const value=sessionStorage.getItem('sofreh.purchaseIntent');if(value&&value.length<12000)intent=JSON.parse(value);sessionStorage.removeItem('sofreh.purchaseIntent');}catch{}
      if(intent&&typeof intent.cookId==='string'&&typeof intent.dishId==='string'){
        if(!state.cart.items.length||state.cart.cookId===intent.cookId){const key=value=>JSON.stringify([...(value||[])].sort());const previous=state.cart.items.find(item=>item.dishId===intent.dishId&&key(item.selectedOptions)===key(intent.selectedOptions));await api('/api/customer/cart/items',{...intent,quantity:(previous?.quantity||0)+1});state.cart=(await api('/api/customer/cart')).cart;state.tab='cart';}
        else $('feedback').textContent=tr('Your existing cart is from another kitchen. Review it before adding this meal.','سبد موجود از آشپزخانهٔ دیگری است؛ پیش از افزودن غذا آن را بررسی کنید.');
      }
    }
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
  if (!state.tab) {
    const requested=new URLSearchParams(location.search).get('tab');
    state.tab=(isCook()?['orders','menu','kitchen','business','profile']:['discover','cart','orders','profile']).includes(requested)?requested:isCook()?(state.own?'orders':'kitchen'):'discover';
  }
  if (full || identityChanged) render();
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
  const pageTitles = {
    discover: tr('What sounds good today?', 'امروز هوس چه غذایی داری؟'),
    cart: tr('Your table', 'سبد سفرهٔ تو'),
    orders: isCook() ? tr('Orders to take care of', 'سفارش‌های آشپزخانه') : tr('Your orders', 'سفارش‌های تو'),
    menu: tr('Your menu', 'منوی آشپزخانه'),
    business: tr('Your kitchen at a glance', 'آشپزخانه در یک نگاه'),
    kitchen: tr('Your kitchen', 'آشپزخانهٔ تو'),
    profile: tr('Your account', 'حساب تو'),
  };
  $('heading').textContent = pageTitles[state.tab] || pageTitles.orders;
  document.body.dataset.page = state.tab;
  $("welcome").textContent = tr("Welcome, ", "خوش آمدی، ") + state.profile.name;
  $("paymentNotice").textContent = tr(
    "Payments are simulated. No money is charged.",
    "پرداخت آزمایشی است؛ هیچ مبلغی برداشت نمی‌شود.",
  );
  document.body.dataset.role=isCook()?'cook':'customer';
  const tabs = isCook()
    ? [
        ["orders", tr("Orders", "سفارش‌ها")],
        ["menu", tr("Menu", "منو")],
        ["business",tr('Business','کسب‌وکار')],
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
  return `<div><label for="${name}">${label}</label><input id="${name}" name="${name}" type="${type}" value="${h(value)}" ${!extra.includes("dir=") ? (/En$/.test(name)?'dir="ltr" lang="en-CA"':/Fa$/.test(name)?'dir="rtl" lang="fa"':'dir="auto"') : ""} ${extra}></div>`;
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
  rememberCheckoutDraft();
  if (state.map) {
    state.map.remove();
    state.map = null;
    state.mapViewKey = null;
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
    const categoryNav = document.createElement('nav');
    categoryNav.className = 'controls menu-categories';
    categoryNav.setAttribute('aria-label',tr('Menu categories','دسته‌بندی منو'));
    for(const [key,label] of Object.entries(menuCategories())){
      const button=document.createElement('button');button.type='button';button.textContent=label;
      button.setAttribute('aria-pressed',String(state.category===key));
      button.onclick=()=>{state.category=key;for(const item of categoryNav.children)item.setAttribute('aria-pressed',String(item===button));renderKitchenCards();};
      categoryNav.append(button);
    }
    $('kitchens').before(categoryNav);
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
    const filterDetails=document.createElement('details');
    filterDetails.className='extra-filters';
    filterDetails.innerHTML=`<summary>${tr('Filters','فیلترها')}</summary><div class="filter-options"></div>`;
    const filterOptions=filterDetails.querySelector('.filter-options');
    [...filters.children].slice(1).forEach(child=>filterOptions.append(child));
    filters.append(filterDetails);
    const originalControls=filters.nextElementSibling;
    const note=originalControls.nextElementSibling;
    const map=$('map');
    const locationGroup=document.createElement('details');
    locationGroup.className='location-filters';
    locationGroup.innerHTML=`<summary id="locationSummary">${tr('Location and map','مکان و نقشه')}</summary>`;
    content.insertBefore(locationGroup,originalControls);
    locationGroup.append(originalControls,note,map);
    filterOptions.append(locationGroup);
    const resizeMap=()=>{if(state.map&&!map.hidden)requestAnimationFrame(()=>state.map?.resize());};
    locationGroup.ontoggle=resizeMap;filterDetails.ontoggle=resizeMap;
    $('foodSearch').oninput=()=>{state.query=$('foodSearch').value;renderKitchenCards();};
    $('fulfillmentFilter').onchange=()=>{state.fulfillmentFilter=$('fulfillmentFilter').value;renderKitchenCards();};
    $('availableOnly').onchange=()=>{state.availableOnly=$('availableOnly').checked;renderKitchenCards();};
    const savedFilter=document.createElement('label');savedFilter.className='filter-check';savedFilter.innerHTML=`<input id="favoritesOnly" type="checkbox" ${state.favoritesOnly?'checked':''}>${tr('My saved kitchens','آشپزخانه‌های ذخیره‌شدهٔ من')}`;filters.querySelector('.filter-options').append(savedFilter);$('favoritesOnly').onchange=()=>{state.favoritesOnly=$('favoritesOnly').checked;renderKitchenCards();};
    renderKitchenCards();
  } else if (state.tab === "cart") renderCart();
  else if (state.tab === "orders") renderOrders();
  else if (state.tab === "kitchen") renderKitchenForm();
  else if (state.tab === "menu") renderMenu();
  else if (state.tab === 'business') commerce.renderBusiness();
  else renderProfile();
}
function searchText(value){return String(value||'').normalize('NFKC').toLocaleLowerCase().replace(/ي/g,'ی').replace(/ك/g,'ک');}
function matchingDishes(cook){const query=searchText(state.query).trim();const kitchenMatches=searchText([cook.kitchenName,...Object.values(cook.kitchenNameLocalized),cook.neighborhood].join(' ')).includes(query);
  return cook.dishes.filter(dish=>(state.category==='all'||(dish.category||'other')===state.category)&&(!state.availableOnly||(dish.isAvailableToday&&Date.parse(dish.serviceWindowEndIso)>Date.now()))&&(!query||kitchenMatches||searchText([...Object.values(dish.titleLocalized),...Object.values(dish.descriptionLocalized)].join(' ')).includes(query)));
}
function filteredKitchens(){return state.cooks.filter(cook=>(!state.favoritesOnly||state.favoriteIds.includes(cook.id))&&(!state.fulfillmentFilter||(state.fulfillmentFilter==='pickup'?cook.supportsPickup:cook.supportsDelivery))&&matchingDishes(cook).length);}
function updateDeliveryAreas(){
  const map=state.map;if(!map?.isStyleLoaded?.())return;
  const features=filteredKitchens().filter(cook=>cook.supportsDelivery&&cook.deliveryRadiusKm>0).map(cook=>{
    const lat=Number(cook.publicLat)*Math.PI/180,lng=Number(cook.publicLng)*Math.PI/180,d=Number(cook.deliveryRadiusKm)/6371;
    const ring=[];for(let i=0;i<=64;i++){const bearing=i*2*Math.PI/64;const phi=Math.asin(Math.sin(lat)*Math.cos(d)+Math.cos(lat)*Math.sin(d)*Math.cos(bearing));const lambda=lng+Math.atan2(Math.sin(bearing)*Math.sin(d)*Math.cos(lat),Math.cos(d)-Math.sin(lat)*Math.sin(phi));ring.push([lambda*180/Math.PI,phi*180/Math.PI]);}
    ring[64]=[...ring[0]];
    return {type:'Feature',properties:{cookId:cook.id},geometry:{type:'Polygon',coordinates:[ring]}};
  });
  const coordinates=[...features.flatMap(feature=>feature.geometry.coordinates[0]),...filteredKitchens().map(cook=>[Number(cook.publicLng),Number(cook.publicLat)]),...(state.origin?[[state.origin.lng,state.origin.lat]]:[])];
  const viewKey=JSON.stringify([filteredKitchens().map(cook=>[cook.id,cook.publicLat,cook.publicLng,cook.deliveryRadiusKm]),state.origin]);
  if(coordinates.length&&state.mapViewKey!==viewKey){
    const lngs=coordinates.map(point=>point[0]),lats=coordinates.map(point=>point[1]);
    map.fitBounds([[Math.min(...lngs),Math.min(...lats)],[Math.max(...lngs),Math.max(...lats)]],{padding:40,maxZoom:12,duration:0});state.mapViewKey=viewKey;
  }
  const data={type:'FeatureCollection',features},source=map.getSource('sofreh-delivery-areas');
  if(source){source.setData(data);return;}
  map.addSource('sofreh-delivery-areas',{type:'geojson',data});
  map.addLayer({id:'sofreh-delivery-areas-fill',type:'fill',source:'sofreh-delivery-areas',paint:{'fill-color':'#9c2940','fill-opacity':0.06}});
  map.addLayer({id:'sofreh-delivery-areas-outline',type:'line',source:'sofreh-delivery-areas',paint:{'line-color':'#9c2940','line-width':2,'line-dasharray':[3,2]}});
}
function refreshMarkers(){
  state.markers.forEach(marker=>marker.remove());state.markers=[];if(!state.map)return;
  const add=(lng,lat,label,color)=>{
    const element=document.createElement('button');element.type='button';element.className='map-pin';element.style.backgroundColor=color;element.setAttribute('aria-label',label);
    // Native buttons synthesize a click. Suppress MapLibre's additional
    // keypress toggle so Enter/Space cannot open and immediately close it.
    element.addEventListener('keypress',event=>{if(event.key==='Enter'||event.key===' ')event.stopImmediatePropagation();});
    const marker=new maplibregl.Marker({element}).setLngLat([lng,lat]).setPopup(new maplibregl.Popup().setText(label)).addTo(state.map);
    // MapLibre assigns a generic label when a popup is attached.
    element.setAttribute('aria-label',label);
    state.markers.push(marker);
  };
  for(const cook of filteredKitchens())add(cook.publicLng,cook.publicLat,cook.kitchenName+' · '+cook.neighborhood,'#9c2940');
  if(state.origin)add(state.origin.lng,state.origin.lat,tr('Your selected origin','مبدأ انتخاب‌شده شما'),'#2679a8');
}
function renderKitchenCards() {
  const kitchens = filteredKitchens();
  updateDeliveryAreas();
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
  commerce.decorateDiscover();
}
function kitchenCard(cook) {
  const rating = cook.reviewSummary.reviewCount
    ? `${number(cook.reviewSummary.averageRating)} / ${number(5)} · ${number(cook.reviewSummary.reviewCount)} ${tr(cook.reviewSummary.reviewCount===1?'review':'reviews','نظر')}`
    : tr('No ratings yet','هنوز امتیازی ثبت نشده');
  return `<article class="card kitchen-card">
    <div class="row"><h3>${h(cook.kitchenName)}</h3>${cook.isSyntheticTestFixture ? `<span class="tag">${tr('TEST ONLY','فقط نمایشی')}</span>` : ''}<span class="tag">${h(cook.neighborhood)}</span></div>
    <p class="muted kitchen-meta" ${!state.origin&&!cook.reviewSummary.reviewCount?'hidden':''}>${state.origin ? tr('Approx. ','حدود ') + number(distance(cook)) + tr(' km to kitchen area',' کیلومتر تا محدوده آشپز') : tr('Choose an origin to see distance','برای دیدن فاصله، مبدأ را انتخاب کنید')} · ${rating}</p>
    <div class="kitchen-meals">${matchingDishes(cook).map(dish=>dishCard(cook,dish)).join('')}</div>
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
  const sample = dish.isSamplePhoto || dish.photoUrl?.startsWith('/assets/demo-food/');
  const photo = dish.photoUrl
    ? `<img src="${h(dish.photoUrl)}" alt="${h(dish.title)}" loading="lazy">`
    : `<span class="missing-photo">${tr('Photo coming soon', 'عکس غذا ثبت نشده')}</span>`;
  return `<div class="dish">
    <div class="dish-media">${photo}${sample ? `<a class="photo-caption" href="/assets/credits.html">${tr('Sample photo', 'عکس نمونه')}</a>` : ''}</div>
    <div class="dish-copy">
      <div class="row"><h3>${h(dish.title)}</h3><span class="price">${money(dish.priceCents)}</span></div>
      <p class="dish-description">${h(dish.description)}</p>
      <div class="row dish-order"><span class="stock-label">${available ? number(dish.remainingPortions) + tr(' portions left', ' پرس مانده') : tr('Unavailable', 'ناموجود')}</span><button class="primary" type="button" data-add="${h(dish.id)}" data-cook="${h(cook.id)}" ${available ? '' : 'disabled'}>${tr('Add to cart', 'افزودن به سبد')}</button></div>
      <details class="meal-information"><summary>${tr('Ingredients, allergens & time', 'حساسیت‌ها و زمان دریافت')}</summary>
        <p class="full-meal-title">${h(dish.title)}</p><p>${tr('Allergens: ', 'مواد حساسیت‌زا: ')}${dish.allergens.length ? h(dish.allergens.join('، ')) : tr('Not declared. Ask the cook.', 'اعلام نشده؛ از آشپز بپرسید.')}</p>
        <p>${date(dish.serviceWindowStartIso)} — ${date(dish.serviceWindowEndIso)}</p>
      </details>
    </div>
  </div>`;
}
async function showMap() {
  if (!$("map")) return;
  $("map").hidden = false;
  if(state.map){state.map.resize();updateDeliveryAreas();return;}
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
  state.map.on('load',updateDeliveryAreas);
  if(!$('mapNotice')){const mapNotice=document.createElement('p');mapNotice.id='mapNotice';mapNotice.className='muted';mapNotice.textContent=tr('Pins mark public kitchen areas and your selected origin. Circles show cook-set delivery radii from approximate area centres, not verified delivery coverage or road routes.','پین‌ها محدوده عمومی آشپز و مبدأ انتخاب‌شده شما هستند. دایره‌ها شعاع ارسالی‌اند که آشپز از مرکز تقریبی محله تعیین کرده؛ پوشش قطعی ارسال یا مسیر خیابانی نیستند.');$('map').after(mapNotice);}
  refreshMarkers();
}
function rememberCheckoutDraft() {
  const form=$('checkout');
  if (!form?.dataset.cookId) return;
  state.checkoutDraft={cookId:form.dataset.cookId,deliveryAddress:$('deliveryAddress').value,notes:$('notes').value,savedAddress:$('savedAddress').value,couponInput:$('couponCode')?.value};
}
function renderCart() {
  rememberCheckoutDraft();
  const cart = state.cart;
  const content = $("content");
  if (!cart?.items.length) {
    state.checkoutDraft = null;
    content.innerHTML = `<h2>${tr("Your cart", "سبد شما")}</h2><p class="empty">${tr("Your cart is empty. Find something good to eat.", "سبد خالی است؛ غذای دلخواهت را پیدا کن.")}</p>`;
    return;
  }
  const cook = state.cooks.find((c) => c.id === cart.cookId);
  const invalidQuote=cart.quoteValid===false||cart.items.some(item=>item.optionsChanged);
  const cartMoney=value=>invalidQuote?tr("Needs review","نیازمند بازبینی"):money(value);
  content.innerHTML = `<div class="card"><h2>${h(cart.kitchenName || cook?.kitchenName || tr("Your cart", "سبد شما"))}</h2>${cart.items.map((item) => `<div class="dish row"><div><strong>${h(item.title || item.titleLocalized?.[locale()] || item.titleEn)}</strong><p>${item.optionsChanged?tr("Price unavailable — choices changed","قیمت در دسترس نیست؛ انتخاب‌ها تغییر کرده‌اند"):money(item.unitPriceCents)+" × "+number(item.quantity)}</p><small>${h((item.options||[]).map(o=>locale()==='fa-IR'?o.labelFa:o.labelEn).join(fa?'، ':', '))}</small>${item.optionsChanged?`<p class="notice">${tr("The cook changed this meal’s choices. Remove this line and select the meal again; the total cannot be confirmed yet.","آشپز انتخاب‌های این غذا را تغییر داده است. این ردیف را حذف و غذا را دوباره انتخاب کنید؛ جمع کل هنوز قابل تأیید نیست.")}</p><a class="text-link" href="/app/customer?tab=discover&locale=${locale()}">${tr("Choose meals again","انتخاب دوبارهٔ غذا")}</a>`:""}</div><div class="actions"><button type="button" data-qty="${h(item.dishId)}" data-selection="${h(item.selectionKey||'')}" data-next="${item.optionsChanged?0:item.quantity - 1}" aria-label="${item.optionsChanged?tr("Remove changed meal","حذف غذای تغییرکرده"):tr("Remove one", "کاهش یک پرس")}">−</button><span>${number(item.quantity)}</span><button type="button" data-qty="${h(item.dishId)}" data-selection="${h(item.selectionKey||'')}" data-next="${item.quantity + 1}" ${item.optionsChanged?"disabled":""} aria-label="${tr("Add one", "افزایش یک پرس")}">+</button></div></div>`).join("")}<form id="checkout"><label for="fulfillment">${tr("Receive your food", "دریافت غذا")}</label><select id="fulfillment">${cart.supportsPickup ? `<option value="pickup" ${cart.fulfillmentType === "pickup" ? "selected" : ""}>${modeText("pickup")}</option>` : ""}${cart.supportsDelivery ? `<option value="delivery" ${cart.fulfillmentType === "delivery" ? "selected" : ""}>${modeText("delivery")}</option>` : ""}</select><div id="deliveryFields" ${cart.fulfillmentType === "delivery" ? "" : "hidden"}><label for="savedAddress">${tr("Saved address", "نشانی ذخیره‌شده")}</label><select id="savedAddress"><option value="">${tr("Enter an address", "واردکردن نشانی")}</option>${state.addresses.map((address) => `<option value="${h(address.id)}">${h(address.label)}</option>`).join("")}</select><label for="deliveryAddress">${tr("Delivery address", "نشانی تحویل")}</label><textarea id="deliveryAddress" dir="auto" maxlength="500">${h(cart.deliveryAddress || "")}</textarea></div><label for="notes">${tr("Order notes", "توضیح سفارش")}</label><textarea id="notes" maxlength="1000"></textarea><div class="total"><div class="row"><span>${tr("Food", "غذا")}</span><strong>${cartMoney(cart.subtotalCents)}</strong></div><div class="row"><span>${tr("Delivery fee", "هزینه ارسال")}</span><strong>${money(cart.deliveryFeeCents)}</strong></div><div class="row"><span>${tr("Total", "جمع کل")}</span><strong class="price">${cartMoney(cart.totalCents)}</strong></div></div><p class="notice">${tr("Simulated payment — no charge. The cook must accept your order.", "پرداخت آزمایشی است و هزینه‌ای برداشت نمی‌شود. آشپز باید سفارش را بپذیرد.")}</p><button class="primary" type="submit" ${invalidQuote?"disabled":""}>${tr("Place order", "ثبت سفارش")}</button><button type="button" id="clearCart" class="danger">${tr("Clear cart", "خالی‌کردن سبد")}</button></form></div>`;
  $('checkout').dataset.cookId=cart.cookId;
  if(invalidQuote)$('fulfillment').disabled=true;
  const draft=state.checkoutDraft?.cookId===cart.cookId ? state.checkoutDraft : null;
  if (draft) {
    $('deliveryAddress').value=draft.deliveryAddress;
    $('notes').value=draft.notes;
    $('savedAddress').value=draft.savedAddress;
  }
  $('deliveryAddress').oninput=rememberCheckoutDraft;
  $('notes').oninput=rememberCheckoutDraft;
  const selectedMethod=document.createElement('p');selectedMethod.className='fulfillment-choice';
  const methodIcon=document.createElementNS('http://www.w3.org/2000/svg','svg');methodIcon.setAttribute('viewBox','0 0 24 24');methodIcon.setAttribute('width','24');methodIcon.setAttribute('height','24');methodIcon.setAttribute('aria-hidden','true');
  const methodPath=document.createElementNS(methodIcon.namespaceURI,'path');methodPath.setAttribute('d',cart.fulfillmentType==='delivery'?'M2 5h12v12H2zM14 10h4l4 4v3h-8M7 17v3M18 17v3':'M6 8h12l2 13H4L6 8M9 9V6a3 3 0 0 1 6 0v3');methodPath.setAttribute('fill','none');methodPath.setAttribute('stroke','currentColor');methodPath.setAttribute('stroke-width','1.8');methodIcon.append(methodPath);
  selectedMethod.append(methodIcon,document.createTextNode(tr('Selected: ','انتخاب شما: ')+modeText(cart.fulfillmentType)));
  $('fulfillment').after(selectedMethod);
  if (!cart.supportsPickup && !cart.supportsDelivery) {
    selectedMethod.textContent=tr('This kitchen currently has no available pickup or delivery method. Clear this cart or wait for the cook to enable one.','این آشپزخانه فعلاً روش دریافت فعالی ندارد؛ سبد را خالی کنید یا منتظر فعال‌شدن یک روش دریافت توسط آشپز بمانید.');
    $('fulfillment').disabled=true;
  }
  content.querySelectorAll("[data-qty]").forEach(
    (button) =>
      (button.onclick = () =>
        action(async () => {
          rememberCheckoutDraft();
          await api("/api/customer/cart/items", {
            cookId: cart.cookId,
            dishId: button.dataset.qty,
            quantity: Number(button.dataset.next),
            selectedOptions:cart.items.find(i=>i.dishId===button.dataset.qty&&(i.selectionKey||'')===(button.dataset.selection||''))?.selectedOptions||[],
            fulfillmentType: cart.fulfillmentType,
            deliveryAddress: state.checkoutDraft.deliveryAddress,
          });
          state.checkoutKey = null;
          await refresh();
        })),
  );
  $("clearCart").onclick = () =>
    action(async () => {
      await api("/api/customer/cart", null, "DELETE");
      state.checkoutKey = null;
      state.checkoutDraft = null;
      $('checkout')?.remove();
      await refresh();
    });
  $("savedAddress").onchange = () => {
    $("deliveryAddress").value =
      state.addresses.find((address) => address.id === $("savedAddress").value)
        ?.address || "";
    rememberCheckoutDraft();
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
              selectedOptions:item.selectedOptions||[],
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
        if(invalidQuote)throw new Error(tr('Review changed meals before ordering.','پیش از سفارش، غذاهای تغییرکرده را بازبینی کنید.'));
        const latest=(await api('/api/customer/cart')).cart;
        const quote=value=>JSON.stringify({cook:value.cookId,fulfillment:value.fulfillmentType,coupon:value.couponCode||'',slot:value.scheduledSlotId||null,total:value.totalCents,items:value.items.map(item=>[item.dishId,item.selectionKey||'',item.quantity,item.unitPriceCents])});
        if(quote(latest)!==quote(cart)){
          state.checkoutKey=null;state.cart=latest;
          if(!latest.items.length){state.checkoutDraft=null;$('checkout')?.remove();state.tab='orders';await refresh();}else renderCart();
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
        try {
          await api("/api/customer/orders", {
            cookId: cart.cookId,
            items: cart.items.map((item) => ({
              dishId: item.dishId,
              quantity: item.quantity,
              selectedOptions:item.selectedOptions||[],
            })),
            fulfillmentType: cart.fulfillmentType,
            couponCode: cart.couponCode || '',
            scheduledSlotId: cart.scheduledSlotId || null,
            deliveryAddress: $("deliveryAddress").value,
            customerNotes: $("notes").value,
            simulatedPaymentMethod: "SIMULATED_CARD",
            idempotencyKey: state.checkoutKey,
            expectedSubtotalCents: cart.subtotalCents,
            expectedDeliveryFeeCents: cart.deliveryFeeCents,
            expectedTotalCents: cart.totalCents,
          });
        } catch (error) {
          if (error.code === "ORDER_QUOTE_CHANGED") {
            state.checkoutKey = null;
            state.cart = (await api("/api/customer/cart")).cart;
            renderCart();
          }
          throw error;
        }
        state.checkoutKey = null;
        state.checkoutDraft = null;
        $('checkout')?.remove();
        state.tab = "orders";
        await refresh();
      },
      tr("Order sent to the cook.", "سفارش برای آشپز فرستاده شد."),
    );
  };
  commerce.decorateCart();
}
function renderOrders() {
  const content = $("content");
  const active=order=>['PENDING','ACCEPTED','PREPARING','READY'].includes(order.status);
  const filters=[['active',tr('In progress','در جریان')],['pending',tr('Needs acceptance','منتظر پذیرش')],['history',tr('History','سوابق')],['all',tr('All orders','همهٔ سفارش‌ها')]];
  const visibleOrders=state.orders.filter(order=>state.orderFilter==='all'||(state.orderFilter==='pending'?order.status==='PENDING':state.orderFilter==='history'?!active(order):active(order))).sort((a,b)=>{
    if(isCook()){const rank={PENDING:0,READY:1,PREPARING:2,ACCEPTED:3};const priority=(rank[a.status]??4)-(rank[b.status]??4);if(priority)return priority;if(a.status==='PENDING')return Date.parse(a.createdAtIso)-Date.parse(b.createdAtIso);}
    return Date.parse(b.createdAtIso)-Date.parse(a.createdAtIso);
  });
  content.innerHTML = `<nav class="order-filters" aria-label="${tr('Filter orders','فیلتر سفارش‌ها')}">${filters.filter(([key])=>isCook()||key!=='pending').map(([key,label])=>`<button type="button" data-order-filter="${key}" aria-pressed="${state.orderFilter===key}">${label} · ${number(state.orders.filter(order=>key==='all'||(key==='pending'?order.status==='PENDING':key==='history'?!active(order):active(order))).length)}</button>`).join('')}</nav><div class="live-heading"><h2>${tr("Your orders", "سفارش‌های شما")}</h2><button id="notifications" type="button">${tr("Allow order alerts", "فعال‌کردن اعلان سفارش")}</button></div><p class="muted">${tr("Allow push alerts to receive order changes while away from this page. Delivery depends on browser, permission and device settings.", "با فعال‌کردن اعلان، تغییرات سفارش را هنگام دوربودن از صفحه هم دریافت کنید؛ دریافت به مرورگر، مجوز و تنظیمات دستگاه وابسته است.")}</p><div class="grid">${visibleOrders.length ? visibleOrders.map((order) => `<article class="card" data-order-id="${h(order.id)}"><div class="row"><h3>${h(fa ? order.kitchenNameFa : order.kitchenNameEn) || tr("Order", "سفارش")}</h3><span class="order-status">${statusText(order.status)}</span></div><p class="muted"><bdi>${h(order.id)}</bdi> · ${date(order.createdAtIso)}</p><p>${modeText(order.fulfillmentType)} · <strong>${money(order.totalCents)}</strong></p>${order.items.map((item) => `<p>${number(item.quantity)} × ${h(fa ? item.titleFa : item.titleEn)}</p>`).join("")}${order.pickupAddressReleased ? `<p><strong>${tr("Pickup address: ", "نشانی دریافت: ")}</strong><bdi>${h(order.pickupAddressReleased)}</bdi></p>` : ""}${order.deliveryAddressForFulfillment || order.deliveryAddress ? `<p dir="auto">${h(order.deliveryAddressForFulfillment || order.deliveryAddress)}</p>` : ""}${order.customerNotes ? `<p>${h(order.customerNotes)}</p>` : ""}${order.simulatedPaymentStatus === "SIMULATED_REFUNDED" ? `<p class="muted">${tr("Simulated payment refunded", "بازگشت وجه آزمایشی ثبت شد")}</p>` : ""}<div class="actions">${isCook() ? nextActions(order) : ""}</div>${reviewsMarkup(order)}${order.status === "COMPLETED" && !(order.reviews||[]).some(review=>review.reviewerUserId===state.profile.account.id) ? `<details><summary>${tr("Rate this order", "ثبت نظر برای سفارش")}</summary><form data-review="${h(order.id)}"><label>${tr("Rating", "امتیاز")}<select name="rating">${[5, 4, 3, 2, 1].map((value) => `<option value="${value}">${number(value)} / 5</option>`).join("")}</select></label><label>${tr("Your comment", "نظر شما")}<textarea name="comment" maxlength="1000" required></textarea></label><button type="submit">${tr("Save review", "ثبت نظر")}</button></form></details>` : ""}</article>`).join("") : `<p class="empty">${tr("No orders in this view. Choose another filter to see your history.", "سفارشی در این بخش نیست؛ برای دیدن سوابق فیلتر را تغییر دهید.")}</p>`}</div>`;
  content.querySelectorAll('[data-order-filter]').forEach(button=>button.onclick=()=>{state.orderFilter=button.dataset.orderFilter;renderOrders();});
  content.querySelectorAll('.order-status').forEach(badge=>{
    if(state.orders.find(order=>order.id===badge.closest('[data-order-id]').dataset.orderId)?.status!=='PENDING')return;
    const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('width','18');icon.setAttribute('height','18');icon.setAttribute('aria-hidden','true');
    const circle=document.createElementNS(icon.namespaceURI,'circle');circle.setAttribute('cx','12');circle.setAttribute('cy','12');circle.setAttribute('r','9');
    const hand=document.createElementNS(icon.namespaceURI,'path');hand.setAttribute('d','M12 7v5l3 2');
    for(const shape of [circle,hand]){shape.setAttribute('fill','none');shape.setAttribute('stroke','currentColor');shape.setAttribute('stroke-width','2');icon.append(shape);}badge.prepend(icon);
  });
  const alertsButton=$("notifications");
  if(!state.pushConfig?.enabled||!window.isSecureContext||!('PushManager' in window)||!('Notification' in window)||!('serviceWorker' in navigator)){
    alertsButton.parentElement.nextElementSibling.remove();
    alertsButton.remove();
  }else alertsButton.onclick = () => action(enablePush);
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
  commerce.decorateOrders();
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
  const cook = own?.storefront || state.cooks.find((item) => item.id === own?.id);
  const area =
    Object.entries(state.areas).find(
      ([, value]) => value.name === own?.neighborhood,
    )?.[0] || "willowdale";
  $("content").innerHTML =
    `<h2>${tr("Your kitchen", "آشپزخانه شما")}</h2><p>${tr("Only the selected area is public. With your consent, your pickup address is shared only with an accepted pickup order.", "فقط محله انتخاب‌شده عمومی است. با رضایت شما، نشانی فقط پس از پذیرش سفارش حضوری نمایش داده می‌شود.")}</p><form id="kitchenForm" class="card"><div class="form-grid">${field("nameEn", tr("Kitchen name — English", "نام آشپزخانه — انگلیسی"), own?.nameEn || "", "text", 'required maxlength="180"')}${field("nameFa", tr("Kitchen name — Persian", "نام آشپزخانه — فارسی"), own?.nameFa || "", "text", 'required maxlength="180"')}${field("bioEn", tr("About your kitchen — English", "معرفی آشپزخانه — انگلیسی"), own?.bioEn || "", "text", 'maxlength="1500"')}${field("bioFa", tr("About your kitchen — Persian", "معرفی آشپزخانه — فارسی"), own?.bioFa || "", "text", 'maxlength="1500"')}<div><label for="kitchenArea">${tr("Public area", "محله عمومی")}</label><select name="area" id="kitchenArea">${Object.entries(
      state.areas,
    )
      .map(
        ([key, value]) =>
          `<option value="${key}" ${key === area ? "selected" : ""}>${h(value.name)}</option>`,
      )
      .join(
        "",
      )}</select></div>${field("pickupAddress", tr("Private pickup address", "نشانی خصوصی دریافت"), own?.pickupAddress || "", "text", 'required maxlength="500"')}${field("pickupWindowEn", tr("Pickup / delivery window — English", "بازه دریافت / ارسال — انگلیسی"), own?.pickupWindowEn || "", "text", 'required maxlength="180"')}${field("pickupWindowFa", tr("Pickup / delivery window — Persian", "بازه دریافت / ارسال — فارسی"), own?.pickupWindowFa || "", "text", 'required maxlength="180"')}<div><label for="fulfillmentMode">${tr("How customers receive food", "روش دریافت غذا")}</label><select id="fulfillmentMode" name="fulfillmentMode">${["both", "pickup", "delivery"].map((mode) => `<option value="${mode}" ${mode === (own?.fulfillmentMode || "both") ? "selected" : ""}>${mode === "both" ? tr("Pickup and delivery", "حضوری و ارسال") : modeText(mode)}</option>`).join("")}</select></div>${field("deliveryFee", tr("Delivery fee (CAD)", "هزینه ارسال (دلار کانادا)"), (cook?.deliveryFeeCents || 0) / 100, "number", 'required min="0" max="500" step="0.01"')}${field("deliveryRadiusKm", tr("Delivery area radius (km)", "شعاع محدوده ارسال (کیلومتر)"), cook?.deliveryRadiusKm ?? 5, "number", 'required min="0" max="100" step="1"')}</div><label class="filter-check"><input type="checkbox" name="isPublished" ${own?.isPublished ? 'checked' : ''}>${tr('Show my kitchen and accept new orders','نمایش آشپزخانه و پذیرش سفارش تازه')}</label><p class="notice">${tr('Keep this off while preparing your menu or taking a break. Existing orders remain available to complete. Publish only accurate kitchen details and allergens.','هنگام آماده‌کردن منو یا استراحت، این گزینه را خاموش نگه دارید. سفارش‌های قبلی همچنان قابل پیگیری‌اند. معرفی آشپزخانه و مواد حساسیت‌زا را دقیق وارد کنید.')}</p><button type="submit" class="primary">${tr("Save kitchen", "ذخیره آشپزخانه")}</button></form>`;
  const consentLabel = document.createElement('label');
  consentLabel.className = 'filter-check';
  const consentInput = document.createElement('input');
  consentInput.type = 'checkbox';
  consentInput.name = 'pickupAddressConsent';
  consentInput.checked = own?.pickupAddressConsent === true;
  consentLabel.append(consentInput, document.createTextNode(tr(
    'Share my private pickup address only with my accepted pickup orders. It stays hidden from public discovery and delivery customers.',
    'نشانی خصوصی دریافت را فقط با مشتری سفارش حضوریِ پذیرفته‌شده به اشتراک می‌گذارم. نشانی در فهرست عمومی و سفارش ارسالی پنهان می‌ماند.'
  )));
  $("kitchenForm").insertBefore(consentLabel, $("kitchenForm").lastElementChild);
  const consentNote=document.createElement('p');consentNote.className='muted';
  consentNote.textContent=tr('Pickup is offered to customers only while address sharing is enabled. Delivery can stay available without it. Complete or cancel accepted pickup orders before withdrawing consent.','دریافت حضوری فقط با فعال‌بودن اشتراک نشانی به مشتری پیشنهاد می‌شود. ارسال بدون آن هم فعال می‌ماند. پیش از پس‌گرفتن رضایت، سفارش‌های حضوری پذیرفته‌شده را تکمیل یا لغو کنید.');
  consentLabel.after(consentNote);
  $("kitchenForm").onsubmit = (event) => {
    event.preventDefault();
    action(
      async () => {
        const form = Object.fromEntries(new FormData(event.target));
        form.deliveryFeeCents = Math.round(Number(form.deliveryFee) * 100);
        delete form.deliveryFee;
        form.deliveryRadiusKm = Number(form.deliveryRadiusKm);
        form.isPublished = event.target.elements.isPublished.checked;
        form.pickupAddressConsent = event.target.elements.pickupAddressConsent.checked;
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
  const cook = state.own.storefront || state.cooks.find((item) => item.id === state.own.id);
  const dish = cook?.dishes.find((item) => item.id === state.editDish);
  $("content").innerHTML =
    `<h2>${tr("Menu and portions", "منو و تعداد پرس")}</h2><div class="grid">${(cook?.dishes || []).map((item) => `<article class="card menu-card"><div class="menu-photo">${item.photoUrl ? `<img src="${h(item.photoUrl)}" alt="${h(item.title)}" loading="lazy">` : `<span>${tr('Add a food photo','عکس غذا را اضافه کن')}</span>`}</div><h3>${h(item.title)}</h3><p>${money(item.priceCents)} · ${number(item.remainingPortions)} ${tr("portions left", "پرس مانده")}</p><p>${date(item.serviceWindowEndIso)}</p><button type="button" data-edit-dish="${h(item.id)}">${tr("Edit dish", "ویرایش غذا")}</button></article>`).join("")}</div><div class="card" style="margin-top:24px"><h3>${dish ? tr("Edit dish", "ویرایش غذا") : tr("Add a dish", "افزودن غذا")}</h3><form id="dishForm"><div class="form-grid">${field("titleEn", tr("Dish name — English", "نام غذا — انگلیسی"), dish?.titleLocalized["en-CA"] || "", "text", 'required maxlength="180"')}${field("titleFa", tr("Dish name — Persian", "نام غذا — فارسی"), dish?.titleLocalized["fa-IR"] || "", "text", 'required maxlength="180"')}${field("descriptionEn", tr("Description — English", "توضیحات — انگلیسی"), dish?.descriptionLocalized["en-CA"] || "", "text", 'maxlength="1500"')}${field("descriptionFa", tr("Description — Persian", "توضیحات — فارسی"), dish?.descriptionLocalized["fa-IR"] || "", "text", 'maxlength="1500"')}${field("price", tr("Price per portion (CAD)", "قیمت هر پرس (دلار کانادا)"), dish ? dish.priceCents / 100 : "", "number", 'required min="0.01" max="1000" step="0.01"')}${field("remainingPortions", tr("Portions available to order", "پرس قابل سفارش"), dish?.remainingPortions ?? 0, "number", 'required min="0" max="10000" step="1"')}${field("serviceWindowStartIso", tr("Service starts (your device time)", "شروع تحویل (ساعت دستگاه شما)"), localDateTime(dish?.serviceWindowStartIso || new Date()), "datetime-local", "required")}${field("serviceWindowEndIso", tr("Service ends (your device time)", "پایان تحویل (ساعت دستگاه شما)"), localDateTime(dish?.serviceWindowEndIso || new Date(Date.now() + 86400000)), "datetime-local", "required")}${field("allergens", tr("Allergens, separated by commas", "مواد حساسیت‌زا، با ویرگول جدا شوند"), dish?.allergens.join(", ") || "", "text", 'maxlength="1500"')}<div><label for="availabilityMode">${tr("Availability", "وضعیت عرضه")}</label><select id="availabilityMode" name="availabilityMode"><option value="TODAY_AVAILABLE">${tr("Available in this service window", "قابل سفارش در این بازه")}</option><option value="REGULAR_UNAVAILABLE" ${dish?.availabilityMode === "REGULAR_UNAVAILABLE" ? "selected" : ""}>${tr("On the menu, unavailable now", "در منو، فعلاً ناموجود")}</option></select></div></div><p class="muted">${tr("List every relevant allergen. A blank field is not an allergen-free guarantee.", "مواد حساسیت‌زا را کامل وارد کنید. خالی‌بودن این قسمت به معنی بی‌خطر بودن غذا برای حساسیت نیست.")}</p><div class="actions"><button type="submit" class="primary">${tr("Save dish", "ذخیره غذا")}</button>${dish ? `<button id="newDish" type="button">${tr("Add another dish", "افزودن غذای دیگر")}</button>` : ""}</div></form></div>`;
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
      form.innerHTML = `<label for="photo-${h(item.id)}">${tr("Food photo (becomes public)", "عکس غذا (عمومی می‌شود)")}</label><input id="photo-${h(item.id)}" type="file" accept="image/jpeg,image/png,image/webp" required><label><input type="checkbox" data-enhance-photo>${tr("Adjust photo lighting", "تنظیم نور عکس")}</label><button type="submit">${tr("Upload photo", "بارگذاری عکس")}</button>`;
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
              { imageBase64, enhance: form.querySelector('[data-enhance-photo]').checked },
              "PUT",
            );
            await refresh();
          },
          tr("Photo saved.", "عکس ذخیره شد."),
        );
      };
      const photoDetails = document.createElement('details');
      photoDetails.className = 'photo-settings';
      const photoSummary = document.createElement('summary');
      photoSummary.textContent = tr('Food photo', 'عکس غذا');
      photoDetails.append(photoSummary, form);
      button.parentElement.append(photoDetails);
    });
  if ($("newDish"))
    $("newDish").onclick = () => {
      state.editDish = null;
      renderContent();
    };
  const categoryLabel=document.createElement('label');categoryLabel.textContent=tr('Menu category','دستهٔ منو');categoryLabel.htmlFor='dishCategory';
  const categorySelect=document.createElement('select');categorySelect.id='dishCategory';categorySelect.name='category';
  for(const [key,label] of Object.entries(menuCategories())){if(key==='all')continue;const option=document.createElement('option');option.value=key;option.textContent=label;categorySelect.append(option);}
  categorySelect.value=dish?.category||'other';
  const categoryField=document.createElement('div');categoryField.append(categoryLabel,categorySelect);$('dishForm').querySelector('.form-grid').append(categoryField);
  $("dishForm").onsubmit = (event) => {
    event.preventDefault();
    action(
      async () => {
        const form = Object.fromEntries(new FormData(event.target));
        form.options=$('dishForm').sofrehMenuOptions?.()||[];
        form.priceCents = Math.round(Number(form.price) * 100);
        delete form.price;
        form.remainingPortions = Number(form.remainingPortions);
        if (dish) {
          if (form.remainingPortions === dish.remainingPortions) delete form.remainingPortions;
          else form.expectedRemainingPortions=dish.remainingPortions;
        }
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
  const editor = $('dishForm').parentElement;
  const editorDetails = document.createElement('details');
  editorDetails.className = 'dish-editor';
  editorDetails.open = Boolean(dish);
  const editorSummary = document.createElement('summary');
  editorSummary.textContent = dish ? tr('Edit dish', 'ویرایش غذا') : tr('Add a dish', 'افزودن غذا');
  $('content').querySelector('.grid').before(editorDetails);
  editorDetails.append(editorSummary, editor);
  commerce.decorateMenu();
  if (dish) {
    editorDetails.scrollIntoView({block: 'start'});
    $('titleEn').focus({preventScroll: true});
  }
}
function renderProfile() {
  const content = $("content");
  content.innerHTML = `<h2>${tr("Your account", "حساب شما")}</h2><div class="card"><h3>${h(state.profile.name)}</h3><p dir="ltr">${h(state.profile.email)}</p><p>${isCook() ? tr("Cook account", "حساب آشپز") : tr("Customer account", "حساب مشتری")}</p><details><summary>${tr("Change password", "تغییر گذرواژه")}</summary><form id="passwordForm">${field("currentPassword", tr("Current password", "گذرواژه فعلی"), "", "password", 'required autocomplete="current-password"')}${field("newPassword", tr("New password, 12–128 characters", "گذرواژه جدید، ۱۲ تا ۱۲۸ نویسه"), "", "password", 'required minlength="12" maxlength="128" autocomplete="new-password"')}<button type="submit">${tr("Update password", "تغییر گذرواژه")}</button></form></details></div>${!isCook() ? `<div class="card" style="margin-top:22px"><h3>${tr("Delivery addresses", "نشانی‌های تحویل")}</h3>${state.addresses.map((address) => `<div class="dish row"><div><strong>${h(address.label)}</strong><p dir="auto">${h(address.address)}</p></div><button type="button" class="danger" data-remove-address="${h(address.id)}">${tr("Remove", "حذف")}</button></div>`).join("")}<form id="addressForm">${field("addressLabel", tr("Label", "عنوان"), "", "text", 'required maxlength="60"')}${field("address", tr("Delivery address", "نشانی تحویل"), "", "text", 'required minlength="5" maxlength="500"')}<button type="submit">${tr("Save address", "ذخیره نشانی")}</button></form></div>` : ""}`;
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
