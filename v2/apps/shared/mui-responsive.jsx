import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Box, Button, CssBaseline, GlobalStyles, ThemeProvider, createTheme } from '@mui/material';

const theme = createTheme({
  direction: 'rtl',
  typography: { fontFamily: 'Vazirmatn, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Tahoma, sans-serif' },
  components: { MuiCssBaseline: { styleOverrides: { 'html, body': { width: '100%', minWidth: 0 }, body: { overflowX: 'hidden' } } } }
});

const globalStyles = {
  '*, *::before, *::after': { boxSizing: 'border-box' },
  'html, body': { margin: 0, width: '100%', minWidth: 0 },
  '@media (max-width: 600px)': {
    body: { padding: '0 !important' },
    '.phone-frame': { width: '100% !important', maxWidth: 'none !important', minHeight: '100vh', borderRadius: '0 !important', borderLeft: '0 !important', borderRight: '0 !important', boxShadow: 'none !important' }
  }
};

const proxyConfigs = {
  ca: ['localeToggleBtn', 'customerTopMenuBtn', 'locateMeBtn', 'navTabDiscover', 'navTabCart', 'navTabOrders'],
  cook: ['localeToggleBtn', 'cookTopMenuBtn', 'saveFeeBtn', 'refreshCookOrdersBtn']
};

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
}

const mount = document.getElementById('muiRuntime');
if (mount) {
  const appId = document.querySelector('[data-app-id]')?.dataset.appId?.endsWith('.cook') ? 'cook' : 'ca';
  createRoot(mount).render(<ThemeProvider theme={theme}><CssBaseline /><GlobalStyles styles={globalStyles} /><Box component="span" aria-hidden="true" sx={{ display: 'none' }} /></ThemeProvider>);
  const enhance = () => enhanceNativeControls(appId);
  enhance();
  new MutationObserver(enhance).observe(document.body, { childList: true, subtree: true });
}
