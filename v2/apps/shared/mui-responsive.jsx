import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Box, Button, CssBaseline, FormControl, GlobalStyles, InputLabel, MenuItem, Radio, Select, TextField, ThemeProvider, createTheme } from '@mui/material';

const theme = createTheme({
  direction: 'rtl',
  typography: { fontFamily: 'Vazirmatn, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Tahoma, sans-serif' },
  components: { MuiCssBaseline: { styleOverrides: { 'html, body': { width: '100%', minWidth: 0 }, body: { overflowX: 'hidden' } } } }
});

const globalStyles = {
  '*, *::before, *::after': { boxSizing: 'border-box' },
  'html, body': { margin: 0, width: '100%', minWidth: 0 },
  '[data-mui-enhanced="true"][hidden]': { display: 'none !important' },
  '@media (max-width: 600px)': {
    body: { padding: '0 !important' },
    '.phone-frame': { width: '100% !important', maxWidth: 'none !important', minHeight: '100vh', borderRadius: '0 !important', borderLeft: '0 !important', borderRight: '0 !important', boxShadow: 'none !important' }
  }
};

const proxyConfigs = {
  ca: ['localeToggleBtn', 'customerTopMenuBtn', 'locateMeBtn', 'navTabDiscover', 'navTabCart', 'navTabOrders', 'placeOrderBtn'],
  cook: ['localeToggleBtn', 'cookTopMenuBtn', 'saveFeeBtn', 'refreshCookOrdersBtn']
};
const selectorConfigs = { ca: ['button.qty-btn', 'button[data-review-submit]'], cook: ['button[data-save-dish]', 'button[data-order-id]', 'button[data-cook-review-submit]'] };
const inputConfigs = { ca: ['kitchenSearchInput', 'settingsAddressLabelInput', 'settingsDeliveryAddressInput'], cook: ['feeInput'] };
const selectConfigs = { ca: ['cookSelect'], cook: ['cookFulfillmentMode'] };
const inputSelectorConfigs = { ca: ['input[id^="review-comment-"]'], cook: ['input[id^="price-"], input[id^="total-"], input[id^="remaining-"], input[id^="cook-review-comment-"]'] };
const selectSelectorConfigs = { ca: ['select[id^="review-rating-"]'], cook: ['select[id^="availability-"]', 'select[id^="cook-review-rating-"]'] };
const radioSelectorConfigs = { ca: ['input[type="radio"][name="fulfillment"]'], cook: [] };

function MUIProxyButton({ native }) {
  const read = () => ({ label: native.textContent?.trim() || native.getAttribute('aria-label') || 'Button', disabled: native.disabled });
  const [state, setState] = useState(read);
  useEffect(() => {
    const sync = () => setState(read());
    const observer = new MutationObserver(sync);
    observer.observe(native, { childList: true, characterData: true, attributes: true });
    return () => observer.disconnect();
  }, [native]);
  return <Button size="small" variant="outlined" disabled={state.disabled} aria-label={native.getAttribute('aria-label') || state.label} onClick={() => native.click()} sx={{ minWidth: 0, px: 1.1, py: 0.45, borderRadius: 2, fontFamily: 'inherit', fontSize: '0.72rem', lineHeight: 1.3, textTransform: 'none', color: 'var(--text)', borderColor: 'var(--border)', backgroundColor: 'var(--bg)', '&:hover': { borderColor: 'var(--primary)', backgroundColor: 'var(--surface-subtle)' } }}>{state.label}</Button>;
}

function MUIProxyInput({ native }) {
  const [value, setValue] = useState(native.value || '');
  useEffect(() => {
    const sync = () => setValue(native.value || '');
    native.addEventListener('input', sync);
    native.addEventListener('change', sync);
    return () => { native.removeEventListener('input', sync); native.removeEventListener('change', sync); };
  }, [native]);
  const label = native.getAttribute('aria-label') || native.getAttribute('placeholder') || '';
  return <TextField size="small" fullWidth type={native.type === 'number' ? 'number' : 'text'} label={label} placeholder={native.placeholder || undefined} value={value} onChange={(event) => { native.value = event.target.value; native.dispatchEvent(new Event('input', { bubbles: true })); native.dispatchEvent(new Event('change', { bubbles: true })); setValue(event.target.value); }} inputProps={{ min: native.min || undefined, max: native.max || undefined, step: native.step || undefined }} sx={{ '& .MuiInputBase-input, & .MuiInputLabel-root': { fontFamily: 'inherit', fontSize: '0.78rem' }, '& .MuiOutlinedInput-root': { borderRadius: 2, backgroundColor: 'var(--bg)' } }} />;
}

function MUIProxySelect({ native }) {
  const [value, setValue] = useState(native.value);
  useEffect(() => {
    const sync = () => setValue(native.value);
    native.addEventListener('change', sync);
    return () => native.removeEventListener('change', sync);
  }, [native]);
  const label = native.getAttribute('aria-label') || '';
  return <FormControl size="small" fullWidth sx={{ minWidth: 0 }}><InputLabel sx={{ fontFamily: 'inherit', fontSize: '0.78rem' }}>{label}</InputLabel><Select value={value} label={label} onChange={(event) => { native.value = event.target.value; native.dispatchEvent(new Event('change', { bubbles: true })); setValue(event.target.value); }} sx={{ borderRadius: 2, backgroundColor: 'var(--bg)', fontFamily: 'inherit', fontSize: '0.78rem' }}>{[...native.options].map((option) => <MenuItem key={option.value} value={option.value} sx={{ fontFamily: 'inherit', fontSize: '0.78rem' }}>{option.textContent}</MenuItem>)}</Select></FormControl>;
}

function MUIProxyRadio({ native }) {
  const [checked, setChecked] = useState(native.checked);
  useEffect(() => {
    const sync = () => setChecked(native.checked);
    native.addEventListener('change', sync);
    return () => native.removeEventListener('change', sync);
  }, [native]);
  const label = native.parentElement?.innerText?.trim() || native.getAttribute('aria-label') || '';
  return <Radio size="small" checked={checked} inputProps={{ 'aria-label': label }} onChange={() => { native.checked = true; native.dispatchEvent(new Event('change', { bubbles: true })); setChecked(true); }} sx={{ position: 'absolute', insetInlineStart: 6, top: 6, width: 1, height: 1, p: 0, opacity: 0, overflow: 'hidden' }} />;
}

function enhanceNativeControls(appId) {
  const ids = proxyConfigs[appId] || [];
  for (const id of ids) {
    const native = document.getElementById(id);
    if (!native || native.dataset.muiEnhanced === 'true' || !native.parentElement) continue;
    native.dataset.muiEnhanced = 'true';
    native.hidden = true;
    const host = document.createElement('span');
    host.className = 'mui-visible-control';
    host.style.display = 'inline-flex';
    host.style.alignItems = 'center';
    native.parentElement.insertBefore(host, native);
    createRoot(host).render(<MUIProxyButton native={native} />);
  }
  for (const selector of selectorConfigs[appId] || []) {
    for (const native of document.querySelectorAll(selector)) {
      if (native.dataset.muiEnhanced === 'true' || !native.parentElement) continue;
      native.dataset.muiEnhanced = 'true';
      native.hidden = true;
      const host = document.createElement('span');
      host.className = 'mui-visible-control';
      host.style.display = 'inline-flex';
      host.style.alignItems = 'center';
      native.parentElement.insertBefore(host, native);
      createRoot(host).render(<MUIProxyButton native={native} />);
    }
  }
}

function enhanceNativeFormControls(appId) {
  for (const id of inputConfigs[appId] || []) {
    const native = document.getElementById(id);
    if (!native || native.dataset.muiEnhanced === 'true' || !native.parentElement) continue;
    native.dataset.muiEnhanced = 'true';
    native.hidden = true;
    const host = document.createElement('span');
    host.className = 'mui-visible-form-control';
    host.style.display = 'block';
    host.style.width = '100%';
    native.parentElement.insertBefore(host, native);
    createRoot(host).render(<MUIProxyInput native={native} />);
  }
  for (const id of selectConfigs[appId] || []) {
    const native = document.getElementById(id);
    if (!native || native.dataset.muiEnhanced === 'true' || !native.parentElement) continue;
    native.dataset.muiEnhanced = 'true';
    native.hidden = true;
    const host = document.createElement('span');
    host.className = 'mui-visible-form-control';
    host.style.display = 'block';
    host.style.width = '100%';
    native.parentElement.insertBefore(host, native);
    createRoot(host).render(<MUIProxySelect native={native} />);
  }
  for (const selector of inputSelectorConfigs[appId] || []) {
    for (const native of document.querySelectorAll(selector)) {
      if (native.dataset.muiEnhanced === 'true' || !native.parentElement) continue;
      native.dataset.muiEnhanced = 'true'; native.hidden = true;
      const host = document.createElement('span'); host.className = 'mui-visible-form-control'; host.style.display = 'block'; host.style.width = '100%';
      native.parentElement.insertBefore(host, native); createRoot(host).render(<MUIProxyInput native={native} />);
    }
  }
  for (const selector of selectSelectorConfigs[appId] || []) {
    for (const native of document.querySelectorAll(selector)) {
      if (native.dataset.muiEnhanced === 'true' || !native.parentElement) continue;
      native.dataset.muiEnhanced = 'true'; native.hidden = true;
      const host = document.createElement('span'); host.className = 'mui-visible-form-control'; host.style.display = 'block'; host.style.width = '100%';
      native.parentElement.insertBefore(host, native); createRoot(host).render(<MUIProxySelect native={native} />);
    }
  }
  for (const selector of radioSelectorConfigs[appId] || []) {
    for (const native of document.querySelectorAll(selector)) {
      if (native.dataset.muiEnhanced === 'true' || !native.parentElement) continue;
      native.dataset.muiEnhanced = 'true'; native.hidden = true;
      const host = document.createElement('span'); host.className = 'mui-visible-form-control'; host.style.display = 'inline-flex'; host.style.alignItems = 'center';
      native.parentElement.insertBefore(host, native); createRoot(host).render(<MUIProxyRadio native={native} />);
    }
  }
}

const mount = document.getElementById('muiRuntime');
if (mount) {
  const appId = document.querySelector('[data-app-id]')?.dataset.appId?.endsWith('.cook') ? 'cook' : 'ca';
  createRoot(mount).render(<ThemeProvider theme={theme}><CssBaseline /><GlobalStyles styles={globalStyles} /><Box component="span" aria-hidden="true" sx={{ display: 'none' }} /></ThemeProvider>);
  const enhance = () => enhanceNativeControls(appId);
  const enhanceAll = () => { enhance(); enhanceNativeFormControls(appId); };
  enhanceAll();
  new MutationObserver(enhanceAll).observe(document.body, { childList: true, subtree: true });
}
