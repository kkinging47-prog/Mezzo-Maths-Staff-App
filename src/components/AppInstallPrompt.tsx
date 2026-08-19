import { useEffect, useMemo, useState } from 'react';

function isAndroid() {
  return /Android/i.test(navigator.userAgent || '');
}

function isIos() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent || '');
}

export function AppInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<any>(null);
  const [hidden, setHidden] = useState(() => localStorage.getItem('mezzo_install_prompt_closed') === 'yes');
  const [standalone, setStandalone] = useState(false);
  const android = useMemo(() => isAndroid(), []);
  const ios = useMemo(() => isIos(), []);

  useEffect(() => {
    setStandalone(window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true);
    const register = async () => {
      if ('serviceWorker' in navigator) {
        try { await navigator.serviceWorker.register('/sw.js'); } catch { /* service worker is optional */ }
      }
    };
    register();
    const handler = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event);
      setHidden(false);
    };
    window.addEventListener('beforeinstallprompt', handler as any);
    return () => window.removeEventListener('beforeinstallprompt', handler as any);
  }, []);

  if (hidden || standalone) return null;

  async function install() {
    if (!installEvent) return;
    installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
    setHidden(true);
  }

  function close() {
    localStorage.setItem('mezzo_install_prompt_closed', 'yes');
    setHidden(true);
  }

  const manualText = ios
    ? 'On iPhone: Safari → Share → Add to Home Screen. Delete the old shortcut first if it still shows the old M icon.'
    : android
      ? 'On older Android phones: open in Chrome → menu ⋮ → Add to Home screen. Update Chrome if the Install button does not appear.'
      : 'Use browser menu → Add to Home Screen.';

  return <div className="install-prompt">
    <div><strong>Add Mezzo Staff to your phone</strong><span>Install it as a shortcut for faster access.</span><small>{manualText}</small></div>
    {installEvent ? <button className="primary small-button" onClick={install}>Install</button> : <span className="hint">Manual install</span>}
    <button className="small-button" onClick={close}>Later</button>
  </div>;
}
