import { escapeHtmlText } from './privacy.mjs';
import { foodPhotograph } from '../../shared/src/sampleFoodPhotos.mjs';

export const PUBLIC_SITE_URL = 'https://sofreh-v2.vercel.app';

const content = {
  en: {
    lang: 'en-CA', dir: 'ltr', title: 'Sofreh | Local cooks. Food that feels like home.',
    description: 'Discover home-style meals from local cooks in Toronto and nearby neighbourhoods. Explore kitchens, compare pickup and delivery options, and meet Sofreh.',
    brand: 'Sofreh', nav: ['The idea', 'On the menu', 'For cooks', 'Questions'],
    eyebrow: 'A little closer to home', heading: 'Good food.\nGood neighbours.',
    intro: 'There is a story behind every home-cooked meal. Find a kitchen near you, discover a new favourite, and bring a little of that story to your table.',
    browse: 'Explore the kitchens', cook: 'Your kitchen, your business',
    locality: 'Made for Toronto and the neighbourhoods around it',
    imageAlt: 'A plate of Persian herb stew, an illustrative sample meal',
    photoNote: 'A taste of the possibilities', photoCaption: 'Food photos are illustrative samples.',
    howTitle: 'From their kitchen.\nTo your table.',
    steps: [
      ['Find your neighbourhood', 'Choose an area or use your location. See local kitchens and their approximate distance.'],
      ['Find your kind of food', 'Explore the menu, price, portions and available pickup or delivery options before you order.'],
      ['Follow every step', 'Your cook receives the order. Follow it from acceptance to preparation and handoff.']
    ],
    menuLabel: 'Something worth sitting down for', menuTitle: 'Familiar favourites.\nA new discovery.',
    dishes: [['ghormeh-sabzi-majidi.jpg', 'Slow-simmered comfort', 'Herb-rich stews and a little patience.'], ['zereshk-polo.jpg', 'A brighter lunch', 'Saffron rice, barberries and home-style flavour.'], ['ash-reshteh.jpg', 'A bowl of belonging', 'Warming soups and recipes made to share.']],
    trustTitle: 'Know your cook.\nKnow your order.',
    trust: [['Clear choices', 'See price, availability and fulfillment options together.'], ['Your address, with care', 'A kitchen’s public area helps you discover nearby food while private addresses follow the order’s access rules.'], ['Real feedback matters', 'Ratings come from completed orders. A new kitchen starts without an invented score.']],
    cookLabel: 'For the person behind the apron', cookTitle: 'Less juggling.\nMore cooking.',
    cookText: 'Keep your menu, portions and orders in one place. Work at your desk or from your phone, with the same kitchen and the same order history.',
    cookItems: ['Set your menu and portions', 'Choose pickup, delivery, or both', 'Accept orders and manage preparation'],
    cookCta: 'Open the kitchen workspace', faqTitle: 'A few things to know',
    faqs: [
      ['Where is Sofreh focused?', 'Toronto and the surrounding neighbourhoods are the starting area. The current menu includes sample kitchens; actual availability must be checked in the ordering experience.'],
      ['Do I need a computer to manage a kitchen?', 'No. The kitchen web workspace is designed for phones as well as larger screens. Android and iPhone applications are part of the product plan.'],
      ['Does distance mean delivery time?', 'No. Discovery distance is an approximate straight-line distance to the public kitchen area. It is not a driving route, a delivery promise or permission to see a private address.'],
      ['Will I be charged?', 'Payments in the current ordering experience are simulated. No money is charged.'],
      ['Are the photographs actual products for sale?', 'The photographs on this site are licensed illustrative samples. They do not represent a particular cook’s actual portion or product.']
    ],
    footerLine: 'Food brings us to the same table.', credits: 'Image credits', source: 'About the project', switchLabel: 'فارسی', switchPath: '/fa',
    finalTitle: 'Find a little home,\nclose to yours.', footerNotice: 'Current experience: sample kitchens and simulated payments.'
  },
  fa: {
    lang: 'fa', dir: 'rtl', title: 'سفره | غذای خانگی و آشپزهای محله در تورنتو',
    description: 'با سفره، غذاهای خانگی و آشپزهای محله را در تورنتو و اطراف پیدا کنید؛ منو و قیمت را ببینید و روش دریافت غذا را انتخاب کنید.',
    brand: 'سفره', nav: ['قصه سفره', 'روی سفره', 'برای آشپزها', 'پرسش‌ها'],
    eyebrow: 'کمی نزدیک‌تر به طعم خانه', heading: 'غذای خوب.\nهمسایه‌های خوب.',
    intro: 'پشت هر غذای خانگی، قصه‌ای هست. آشپزخانه‌ای نزدیک خودت پیدا کن، طعم تازه‌ای بچش و تکه‌ای از آن قصه را به سفره‌ات بیاور.',
    browse: 'آشپزخانه‌ها را ببین', cook: 'آشپزخانه تو، کسب‌وکار تو', locality: 'برای تورنتو و محله‌های اطرافش',
    imageAlt: 'بشقاب قورمه‌سبزی ایرانی؛ تصویر نمونه غذا', photoNote: 'یک لقمه از طعم‌های پیش رو', photoCaption: 'تصویر غذاها نمونه و برای معرفی است.',
    howTitle: 'از آشپزخانه همسایه،\nتا سفره تو.',
    steps: [
      ['از محله‌ات شروع کن', 'منطقه را انتخاب کن یا موقعیتت را بده؛ آشپزخانه‌ها و فاصله تقریبی آن‌ها را ببین.'],
      ['غذای دلخواهت را پیدا کن', 'قبل از سفارش، منو، قیمت، تعداد پرس و روش دریافت حضوری یا ارسال را بررسی کن.'],
      ['سفارشت را دنبال کن', 'آشپز سفارش را دریافت می‌کند؛ از پذیرش تا آماده‌شدن و تحویل، وضعیت را دنبال کن.']
    ],
    menuLabel: 'بهانه‌ای برای دور هم نشستن', menuTitle: 'طعم‌های آشنا.\nکشف‌های تازه.',
    dishes: [['ghormeh-sabzi-majidi.jpg', 'آرام‌آرام، جاافتاده', 'خورشت‌های خوش‌عطر و چاشنی صبر.'], ['zereshk-polo.jpg', 'رنگی تازه برای ناهار', 'برنج زعفرانی، زرشک و طعم خانه.'], ['ash-reshteh.jpg', 'یک کاسه حس خوب', 'آش‌ها و دستورهایی برای با هم بودن.']],
    trustTitle: 'آشپزت را بشناس.\nبا خیال روشن سفارش بده.',
    trust: [['انتخاب روشن', 'قیمت، موجودی و روش دریافت را کنار هم ببین.'], ['مراقبت از نشانی', 'محدوده عمومی آشپز برای کشف غذا نمایش داده می‌شود؛ دسترسی به نشانی خصوصی تابع وضعیت و مجوز سفارش است.'], ['نظر واقعی ارزش دارد', 'امتیاز از سفارش تکمیل‌شده می‌آید؛ برای آشپزخانه تازه، امتیاز ساختگی نمی‌گذاریم.']],
    cookLabel: 'برای کسی که پشت اجاق است', cookTitle: 'دردسر کمتر.\nوقت بیشتر برای پختن.',
    cookText: 'منو، تعداد پرس و سفارش‌ها را یک‌جا مدیریت کن؛ پشت میز یا با گوشی، با همان آشپزخانه و همان سابقه سفارش.',
    cookItems: ['تنظیم منو و تعداد پرس', 'انتخاب دریافت حضوری، ارسال یا هر دو', 'پذیرش سفارش و پیگیری آماده‌سازی'],
    cookCta: 'ورود به فضای کار آشپز', faqTitle: 'چند پرسش پیش از شروع',
    faqs: [
      ['سفره برای کدام منطقه است؟', 'نقطه شروع، تورنتو و محله‌های اطراف آن است. منوی فعلی شامل آشپزخانه‌های نمونه است؛ موجودی و دسترسی را در بخش سفارش بررسی کنید.'],
      ['برای مدیریت آشپزخانه، رایانه لازم دارم؟', 'نه. فضای وب آشپز برای گوشی و صفحه‌های بزرگ‌تر طراحی شده است. برنامه‌های اندروید و آیفون هم در برنامه محصول قرار دارند.'],
      ['فاصله همان زمان رسیدن غذاست؟', 'نه. فاصله، برآورد مستقیم تا محدوده عمومی آشپز است؛ مسافت رانندگی، وعده زمان تحویل یا مجوز دیدن نشانی خصوصی نیست.'],
      ['پولی از حسابم کم می‌شود؟', 'پرداخت در تجربه فعلی شبیه‌سازی‌شده است و پولی جابه‌جا نمی‌شود.'],
      ['عکس‌ها غذای واقعی فروشنده‌اند؟', 'عکس‌های سایت، تصاویر نمونه دارای مجوزند؛ اندازه پرس یا محصول واقعی یک آشپز مشخص را نشان نمی‌دهند.']
    ],
    footerLine: 'غذا، بهانه دور هم بودن.', credits: 'منبع تصاویر', source: 'درباره پروژه', switchLabel: 'English', switchPath: '/en',
    finalTitle: 'طعم خانه را،\nنزدیک خودت پیدا کن.', footerNotice: 'تجربه فعلی: آشپزخانه‌های نمونه و پرداخت شبیه‌سازی‌شده.'
  }
};

const css = `
@font-face{font-family:Vazirmatn;src:url('/assets/fonts/Vazirmatn-wght.woff2') format('woff2');font-weight:100 900;font-display:optional}
:root{--paper:#fff9ef;--ink:#23392f;--red:#9c2940;--gold:#dfad51;--muted:#5d6c62;--line:#dedfd3}*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:100px}body{margin:0;background:var(--paper);color:var(--ink);font-family:Vazirmatn,system-ui,sans-serif;line-height:1.65}a{color:inherit}button,a,summary{touch-action:manipulation}a:focus-visible,summary:focus-visible{outline:3px solid var(--red);outline-offset:5px}img{display:block;width:100%;object-fit:cover}.wrap{max-width:1200px;width:calc(100% - 72px);margin:auto}.site-nav{position:sticky;top:0;z-index:5;background:#fff9eff2;border-bottom:1px solid var(--line);backdrop-filter:blur(14px)}.nav-inner{min-height:84px;display:flex;align-items:center;justify-content:space-between;gap:24px}.brand{font-size:32px;font-weight:600;text-decoration:none;letter-spacing:-1px}.brand:after{content:'';display:inline-block;width:9px;height:9px;border-radius:50%;background:var(--gold);margin-inline-start:5px}.links{display:flex;gap:26px;align-items:center}.links a{font-size:14px;text-decoration:none;min-height:44px;display:flex;align-items:center}.language{border:1px solid var(--line);padding:0 14px;border-radius:100px}.hero{display:grid;grid-template-columns:1.05fr 1fr;align-items:center;gap:70px;padding:88px 0 90px}.eyebrow{font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:2px;color:var(--red)}h1,h2,h3,p{margin-top:0}h1{font-size:clamp(48px,5.7vw,80px);line-height:1.06;letter-spacing:-3px;font-weight:600;margin:23px 0}h1 span,h2 span{display:block}h1 span:last-child{color:var(--red)}.intro{font-size:18px;max-width:500px;color:var(--muted);line-height:1.8}.actions{display:flex;gap:12px;flex-wrap:wrap;margin:28px 0}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:50px;padding:12px 22px;background:var(--red);color:white;border:1px solid var(--red);border-radius:100px;text-decoration:none;font-size:15px;font-weight:600}.btn.secondary{color:var(--ink);border-color:var(--line);background:transparent}.locality{font-size:12px;color:var(--muted);margin:24px 0 0}.hero-figure{position:relative;margin:0;padding:0 0 50px}.hero-image{aspect-ratio:1/1;border-radius:48% 48% 36px 36px;box-shadow:18px 18px 0 #efd6a5;isolation:isolate}.photo-caption{position:absolute;bottom:10px;inset-inline-start:-20px;background:var(--ink);color:var(--paper);padding:18px 24px;max-width:80%;border-radius:4px 20px 20px 20px;box-shadow:0 14px 32px #17332618}.photo-caption strong{display:block;font-size:17px}.photo-caption small{font-size:11px;opacity:.8}.section{padding:80px 0}.rule{border-top:1px solid var(--line)}h2{font-size:clamp(32px,4vw,52px);letter-spacing:-1.5px;line-height:1.16;margin-bottom:35px}.section-top{display:flex;align-items:end;justify-content:space-between;gap:24px;margin-bottom:34px}.section-top h2{margin:15px 0 0}.steps,.meals,.trust-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:28px}.step{padding-block:22px;border-top:2px solid var(--line)}.number{color:var(--red);font-size:14px;font-weight:600;display:block;margin-bottom:22px}h3{font-size:20px;margin:0 0 12px}.step p,.trust-card p{color:var(--muted);font-size:15px}.meal{background:#fffcf7;border:1px solid var(--line);border-radius:20px;overflow:hidden}.meal img{aspect-ratio:4/3}.meal-copy{padding:22px}.meal-copy p{margin-bottom:0;color:var(--muted);font-size:14px}.trust-section{background:#f0efe2}.trust-card{padding-inline-end:18px}.trust-card h3:before{content:'';display:block;background:var(--gold);width:28px;height:3px;margin-bottom:20px}.cook-panel{display:grid;grid-template-columns:1fr 1fr;background:var(--ink);border-radius:28px;overflow:hidden;color:var(--paper)}.cook-copy{padding:55px}.cook-copy .eyebrow{color:#f0cd8d}.cook-copy h2{margin:20px 0 24px}.cook-copy p{opacity:.85;line-height:1.8}.cook-copy ul{padding-inline-start:20px;font-size:14px;line-height:2.1;margin:20px 0 26px}.cook-copy .btn{background:var(--paper);color:var(--ink);border-color:var(--paper)}.cook-art{position:relative;min-height:400px;background:#e6bd7a;padding:35px;display:flex;align-items:center;justify-content:center}.work-card{background:var(--paper);color:var(--ink);width:100%;max-width:340px;border-radius:20px;padding:26px;box-shadow:0 25px 50px #17332626;transform:rotate(-4deg)}[dir=rtl] .work-card{transform:rotate(4deg)}.work-card .brand{font-size:23px}.work-line{display:flex;align-items:center;gap:14px;border-top:1px solid var(--line);padding:20px 0}.work-line:first-of-type{margin-top:22px}.work-dot{width:12px;height:12px;background:var(--gold);border-radius:50%;flex:none}.work-line span:last-child{font-size:14px}.faq{max-width:850px}.faq details{border-bottom:1px solid var(--line);padding:20px 0}.faq summary{font-size:17px;font-weight:600;cursor:pointer;min-height:44px}.faq details p{font-size:15px;color:var(--muted);margin:14px 0 8px;max-width:720px}.closing{padding:70px 0 80px;text-align:center}.closing h2{margin-bottom:24px}.footer{border-top:1px solid var(--line);padding:35px 0}.footer-main{display:flex;align-items:center;justify-content:space-between;gap:24px;flex-wrap:wrap}.footer-main p{font-size:14px;margin:0;color:var(--muted)}.footer-links{display:flex;gap:20px;font-size:13px}.footer-notice{font-size:12px;color:var(--muted);margin:24px 0 0}.skip{position:absolute;inset-inline-start:12px;top:-100px;z-index:10;background:white;padding:12px}.skip:focus{top:8px}[dir=rtl] h1{letter-spacing:-2px;line-height:1.3;font-size:clamp(42px,5vw,69px)}[dir=rtl] .eyebrow{letter-spacing:0}[dir=rtl] h2{line-height:1.35;letter-spacing:-1px}@media(max-width:850px){.wrap{width:calc(100% - 40px)}.links a:not(.language){display:none}.nav-inner{min-height:70px}.hero{gap:40px;padding:55px 0 65px}.hero h1{font-size:48px;letter-spacing:-2px}.intro{font-size:16px}.hero-figure{padding-bottom:25px}.photo-caption{inset-inline-start:0;bottom:0;padding:12px 16px}.photo-caption strong{font-size:14px}.steps,.meals,.trust-grid{gap:18px}.cook-copy{padding:35px}.cook-art{padding:24px}}@media(max-width:600px){.hero{grid-template-columns:1fr;gap:40px;padding-top:42px}.hero h1{font-size:53px}.hero-figure{max-width:440px;width:calc(100% - 20px);margin:auto}.hero-image{box-shadow:12px 12px 0 #efd6a5}.section{padding:56px 0}.steps,.meals,.trust-grid{grid-template-columns:1fr;gap:20px}.step{padding:18px 0 0}.number{margin-bottom:12px}.section-top{display:block}.cook-panel{grid-template-columns:1fr}.cook-copy{padding:30px}.cook-art{min-height:320px}.work-card{padding:22px}.footer-main{align-items:start;flex-direction:column}.closing{padding:50px 0}.actions{gap:10px}.btn{padding:12px 18px}.photo-caption{max-width:90%}h2{font-size:36px}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
`;

export function renderShowcase(language = 'en', { accountsEnabled = false } = {}) {
  const key = language === 'fa' ? 'fa' : 'en';
  const base = content[key];
  const c = accountsEnabled ? {...base,
    footerNotice: key==='fa'?'پرداخت این تجربه شبیه‌سازی‌شده است؛ پولی برداشت نمی‌شود.':'Payments in this experience are simulated; no money is charged.',
    faqs:[[base.faqs[0][0],key==='fa'?'نقطه شروع، تورنتو و محله‌های اطراف آن است. منو را آشپزها ثبت می‌کنند؛ موجودی و روش دریافت هر آشپزخانه را پیش از سفارش بررسی کنید.':'Sofreh starts in Toronto and surrounding neighborhoods. Cooks publish their menus; check each kitchen’s availability and fulfillment options before ordering.'],...base.faqs.slice(1)]
  } : base;
  const e = escapeHtmlText;
  const lines = (text) => text.split('\n').map((line) => `<span>${e(line)}</span>`).join('');
  const customer = `${accountsEnabled ? '/explore' : '/preview/customer'}${key === 'fa' ? '?locale=fa-IR' : ''}`;
  const cook = `${accountsEnabled ? '/app/cook' : '/preview/cook'}${key === 'fa' ? '?locale=fa-IR' : ''}`;
  const schema = { '@context': 'https://schema.org', '@type': 'Organization', name: 'Sofreh', alternateName: 'سفره', url: PUBLIC_SITE_URL, logo: `${PUBLIC_SITE_URL}/assets/brand/wordmark-fa.png` };
  const heroSizes='(max-width: 600px) calc(100vw - 60px), (max-width: 850px) 45vw, 600px';
  const mealSizes='(max-width: 600px) calc(100vw - 40px), (max-width: 850px) 30vw, 382px';
  const photographName=name=>({'ghormeh-sabzi-majidi':'ghormeh','zereshk-polo':'zereshk','ash-reshteh':'ash'}[name]||name);
  const imageSet=name=>[480,800,1200].map(width=>`${foodPhotograph(photographName(name),width)} ${width}w`).join(', ');
  const imageAttributes=(name,sizes)=>`src="${foodPhotograph(photographName(name))}" srcset="${imageSet(name)}" sizes="${sizes}"`;
  return `<!doctype html><html lang="${c.lang}" dir="${c.dir}"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#23392f">
<title>${e(c.title)}</title><meta name="description" content="${e(c.description)}">
<link rel="canonical" href="${PUBLIC_SITE_URL}/${key}"><link rel="alternate" hreflang="en-CA" href="${PUBLIC_SITE_URL}/en"><link rel="alternate" hreflang="fa" href="${PUBLIC_SITE_URL}/fa"><link rel="alternate" hreflang="x-default" href="${PUBLIC_SITE_URL}/en">
<meta property="og:type" content="website"><meta property="og:site_name" content="Sofreh"><meta property="og:title" content="${e(c.title)}"><meta property="og:description" content="${e(c.description)}"><meta property="og:url" content="${PUBLIC_SITE_URL}/${key}"><meta property="og:image" content="${PUBLIC_SITE_URL}/assets/demo-food/studio-ghormeh-1200.webp"><meta name="twitter:card" content="summary_large_image">
<link rel="preload" as="font" href="/assets/fonts/Vazirmatn-wght.woff2" type="font/woff2" crossorigin><link rel="preload" as="image" href="/assets/demo-food/studio-ghormeh-800.webp" imagesrcset="${imageSet('ghormeh-sabzi-majidi')}" imagesizes="${heroSizes}" fetchpriority="high"><style>${css}\n.hero-image,.meal img{height:auto}
.brand{display:inline-flex;align-items:center}.brand:has(img):after{display:none}.brand img{display:block;width:96px;height:46px;object-fit:contain}

@media(max-width:600px){.hero{gap:22px;padding:24px 0 36px}.hero h1{font-size:34px;line-height:1.4;margin:12px 0;font-weight:500}.hero .eyebrow{font-size:11px;letter-spacing:normal}.hero .intro{font-size:14px;line-height:1.85;margin-bottom:0}.hero .actions{margin:16px 0;gap:8px}.hero .btn{font-size:13px;min-height:44px;padding:9px 16px;font-weight:400}.hero .locality{margin:12px 0 0;font-size:11px}.hero-figure{padding-bottom:22px}.hero-image{aspect-ratio:1.65;border-radius:80px 80px 24px 24px;box-shadow:8px 8px 0 #efd6a5}.photo-caption{padding:10px 14px;bottom:0;inset-inline-start:8px}.photo-caption strong{font-weight:500;font-size:13px}.photo-caption small{font-size:10px}}
</style><script type="application/ld+json">${JSON.stringify(schema)}</script></head><body>
<a class="skip" href="#main">${key === 'fa' ? 'رفتن به محتوای اصلی' : 'Skip to content'}</a>
<header class="site-nav"><div class="wrap nav-inner"><a class="brand" href="/${key}" aria-label="${e(c.brand)}">${key==='fa'?'<img src="/assets/brand/wordmark-fa.svg" alt="سفره">':e(c.brand)}</a><nav class="links" aria-label="${key === 'fa' ? 'ناوبری اصلی' : 'Main navigation'}">${['idea','menu','cooks','questions'].map((id,i)=>`<a href="#${id}">${e(c.nav[i])}</a>`).join('')}<a class="language" href="${c.switchPath}" lang="${key === 'fa' ? 'en' : 'fa'}">${c.switchLabel}</a></nav></div></header>
<main id="main"><section class="wrap hero"><div><p class="eyebrow">${e(c.eyebrow)}</p><h1>${lines(c.heading)}</h1><p class="intro">${e(c.intro)}</p><div class="actions"><a class="btn" href="${customer}">${e(c.browse)}</a><a class="btn secondary" href="#cooks">${e(c.cook)}</a></div><p class="locality">${e(c.locality)}</p></div><figure class="hero-figure"><img class="hero-image" ${imageAttributes('ghormeh-sabzi-majidi',heroSizes)} width="600" height="600" fetchpriority="high" alt="${e(c.imageAlt)}"><figcaption class="photo-caption"><strong>${e(c.photoNote)}</strong><small>${e(c.photoCaption)}</small></figcaption></figure></section>
<section class="wrap section rule" id="idea"><h2>${lines(c.howTitle)}</h2><div class="steps">${c.steps.map((s,i)=>`<article class="step"><span class="number">0${i+1}</span><h3>${e(s[0])}</h3><p>${e(s[1])}</p></article>`).join('')}</div></section>
<section class="wrap section rule" id="menu"><div class="section-top"><div><p class="eyebrow">${e(c.menuLabel)}</p><h2>${lines(c.menuTitle)}</h2></div><a class="btn secondary" href="${customer}">${e(c.browse)}</a></div><div class="meals">${c.dishes.map(d=>`<article class="meal"><img ${imageAttributes(d[0].replace('.jpg',''),mealSizes)} width="480" height="360" loading="lazy" alt="${e(d[1])}"><div class="meal-copy"><h3>${e(d[1])}</h3><p>${e(d[2])}</p></div></article>`).join('')}</div></section>
<section class="section trust-section"><div class="wrap"><h2>${lines(c.trustTitle)}</h2><div class="trust-grid">${c.trust.map(t=>`<article class="trust-card"><h3>${e(t[0])}</h3><p>${e(t[1])}</p></article>`).join('')}</div></div></section>
<section class="wrap section" id="cooks"><div class="cook-panel"><div class="cook-copy"><p class="eyebrow">${e(c.cookLabel)}</p><h2>${lines(c.cookTitle)}</h2><p>${e(c.cookText)}</p><ul>${c.cookItems.map(t=>`<li>${e(t)}</li>`).join('')}</ul><a class="btn" href="${cook}">${e(c.cookCta)}</a></div><div class="cook-art" aria-hidden="true"><div class="work-card"><span class="brand">${key==='fa'?'<img src="/assets/brand/wordmark-fa.svg" alt="سفره">':e(c.brand)}</span>${c.cookItems.map(t=>`<div class="work-line"><span class="work-dot"></span><span>${e(t)}</span></div>`).join('')}</div></div></div></section>
<section class="wrap section rule faq" id="questions"><h2>${e(c.faqTitle)}</h2>${c.faqs.map(f=>`<details><summary>${e(f[0])}</summary><p>${e(f[1])}</p></details>`).join('')}</section><section class="wrap closing"><h2>${lines(c.finalTitle)}</h2><a class="btn" href="${customer}">${e(c.browse)}</a></section></main>
<footer class="footer"><div class="wrap"><div class="footer-main"><span class="brand">${key==='fa'?'<img src="/assets/brand/wordmark-fa.svg" alt="سفره">':e(c.brand)}</span><p>${e(c.footerLine)}</p><div class="footer-links"><a href="/assets/credits.html">${e(c.credits)}</a><a href="https://github.com/Mehrdad-KHE/sofreh">${e(c.source)}</a></div></div><p class="footer-notice">${e(c.footerNotice)}</p></div></footer></body></html>`;
}

export function renderSitemap() {
  const alternatives = `<xhtml:link rel="alternate" hreflang="en-CA" href="${PUBLIC_SITE_URL}/en"/><xhtml:link rel="alternate" hreflang="fa" href="${PUBLIC_SITE_URL}/fa"/>`;
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${['en','fa'].map(locale=>`<url><loc>${PUBLIC_SITE_URL}/${locale}</loc>${alternatives}</url>`).join('')}</urlset>`;
}

export function renderRobots() {
  return `User-agent: *\nAllow: /en\nAllow: /fa\nAllow: /assets/\nDisallow: /api/\nDisallow: /preview/\nDisallow: /app/\nDisallow: /account\nSitemap: ${PUBLIC_SITE_URL}/sitemap.xml\n`;
}
