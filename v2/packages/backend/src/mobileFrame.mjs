import { escapeHtmlText } from './privacy.mjs';

// A real narrow viewport keeps mobile layout and fixed navigation inside the
// centred frame. The normal account/role gate runs before this view is served.
export function renderMobileFrame(role, locale, requestedTab = '') {
  const cook = role === 'cook', fa = locale === 'fa-IR';
  const tabs = cook ? ['orders','menu','business','kitchen','profile'] : ['discover','cart','orders','profile'];
  const query = new URLSearchParams({locale});
  if (tabs.includes(requestedTab)) query.set('tab', requestedTab);
  const destination = '/app/' + (cook ? 'cook' : 'customer') + '?' + query;
  const iframeSource=destination+'&embedded=mobile';
  const title = fa ? (cook ? 'سفرهٔ آشپز' : 'سفرهٔ مشتری') : (cook ? 'Sofreh Cook' : 'Sofreh Customer');
  return `<!doctype html><html lang="${fa?'fa':'en-CA'}" dir="${fa?'rtl':'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${title}</title><style>
  @font-face{font-family:Vazirmatn;src:url('/assets/fonts/Vazirmatn-wght.woff2');font-weight:100 900;font-display:swap}
  *{box-sizing:border-box}body{margin:0;min-height:100svh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:20px;background:#e8ece5;color:#23392f;font-family:Vazirmatn,system-ui,sans-serif;font-weight:400}.frame-caption{display:flex;align-items:center;justify-content:space-between;gap:20px;width:min(392px,100%);font-size:13px}.frame-caption p{margin:0}.frame-caption a{color:inherit;text-underline-offset:4px}.phone-frame{width:min(392px,100%);height:min(844px,calc(100svh - 88px));min-height:320px;border:1px solid #b7c2b4;border-radius:26px;background:#fbf8f1;box-shadow:0 16px 48px #183c3218;overflow:hidden}.phone-frame iframe{display:block;width:100%;height:100%;border:0;background:#fbf8f1}.frame-caption a:focus-visible{outline:2px solid #9c2940;outline-offset:4px}@media(max-width:500px){body{padding:0;gap:0}.frame-caption{display:none}.phone-frame{width:100%;height:100svh;min-height:0;border:0;border-radius:0;box-shadow:none}}
  </style></head><body><div class="frame-caption"><p>${title} · ${fa?'نمای موبایل':'Mobile view'}</p><a href="${escapeHtmlText(destination)}">${fa?'نمای کامل':'Full view'}</a></div><main class="phone-frame"><iframe title="${title}" src="${escapeHtmlText(iframeSource)}"></iframe></main></body></html>`;
}
