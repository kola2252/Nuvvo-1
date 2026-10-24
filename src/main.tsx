import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { AppProvider } from './context/AppContext.tsx';
import './index.css';

// Guard against sandboxed iframe modal exceptions
if (typeof window !== 'undefined') {
  const nativeAlert = window.alert;
  window.alert = (message?: any) => {
    try {
      if (nativeAlert) nativeAlert(message);
    } catch {
      console.warn('[Notice]:', message);
    }
  };

  const nativeConfirm = window.confirm;
  window.confirm = (message?: string) => {
    try {
      if (nativeConfirm) return nativeConfirm(message);
    } catch {
      console.warn('[Notice confirm]:', message);
      return true;
    }
    return true;
  };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>,
);
