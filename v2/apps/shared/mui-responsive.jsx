import React from 'react';
import { createRoot } from 'react-dom/client';
import { Box, CssBaseline, GlobalStyles, ThemeProvider, createTheme } from '@mui/material';

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

const mount = document.getElementById('muiRuntime');
if (mount) createRoot(mount).render(<ThemeProvider theme={theme}><CssBaseline /><GlobalStyles styles={globalStyles} /><Box component="span" aria-hidden="true" sx={{ display: 'none' }} /></ThemeProvider>);
