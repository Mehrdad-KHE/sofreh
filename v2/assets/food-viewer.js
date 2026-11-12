// Food images open independently of ordering; no cart or account state is changed.
const isFa=()=>document.documentElement.lang.startsWith('fa');
const t=(fa,en)=>isFa()?fa:en;
const style=document.createElement('style');style.textContent=`
img[data-food-view]{cursor:zoom-in}img[data-food-view]:focus-visible{outline:3px solid #9c2940;outline-offset:3px}
.food-viewer{padding:48px 14px 18px;border:1px solid #bbc5b7;border-radius:18px;background:#fbf8f1;color:#23392f;width:min(94vw,1000px);max-width:94vw;max-height:94dvh;box-sizing:border-box}
.food-viewer::backdrop{background:#14271edb}.food-viewer img{display:block;width:100%;height:auto;max-height:73dvh;object-fit:contain;border-radius:8px}.food-viewer p{font:400 14px Vazirmatn,sans-serif;text-align:center;margin:12px 0 0}.food-viewer button{position:absolute;top:9px;inset-inline-end:12px;border:1px solid #bac5b7;border-radius:22px;padding:5px 16px;background:white;color:#23392f;font:400 14px Vazirmatn,sans-serif;cursor:pointer}
.active-role{border:1px solid #bbc8ba;border-inline-start:4px solid #9c2940;border-radius:12px;padding:12px 15px;background:#eef2e9;color:#23392f;margin:12px 0;font:400 13px/1.9 Vazirmatn,sans-serif}.active-role strong{display:block;font-weight:500;font-size:16px}.active-role p{margin:3px 0 0}
`;document.head.append(style);
const dialog=document.createElement('dialog');dialog.className='food-viewer';dialog.setAttribute('aria-label',t('تصویر کامل غذا','Full food photo'));
const close=document.createElement('button');close.type='button';close.textContent=t('بستن تصویر','Close photo');
const photo=document.createElement('img'),caption=document.createElement('p');dialog.append(close,photo,caption);document.body.append(dialog);
close.onclick=()=>dialog.close();dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
let previous=null;dialog.addEventListener('close',()=>previous?.isConnected&&previous.focus());
function open(img){previous=img;photo.src=img.currentSrc||img.src;photo.alt=img.alt;caption.textContent=img.alt;dialog.showModal();close.focus();}
function mark(){for(const img of document.images){if(img===photo||!(/\/assets\/demo-food\/|\/api\/.*photos?\//.test(img.getAttribute('src')||'')))continue;if(img.hasAttribute('data-food-view'))continue;img.dataset.foodView='';img.tabIndex=0;img.setAttribute('role','button');img.setAttribute('aria-label',t('نمایش کامل عکس: ','View full photo: ')+img.alt);img.setAttribute('aria-haspopup','dialog');}}
document.addEventListener('click',e=>{if(e.target.matches('img[data-food-view]')){e.preventDefault();e.stopPropagation();open(e.target);}},true);
document.addEventListener('keydown',e=>{if(e.target.matches('img[data-food-view]')&&['Enter',' '].includes(e.key)){e.preventDefault();open(e.target);}});
new MutationObserver(mark).observe(document.body,{childList:true,subtree:true});mark();
