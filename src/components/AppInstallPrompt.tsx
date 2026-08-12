import { useEffect, useState } from 'react';

export function AppInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<any>(null);
  const [hidden, setHidden] = useState(() => localStorage.getItem('mezzo_install_prompt_closed') === 'yes');
  const [standalone, setStandalone] = useState(false);

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

  return <div className="install-prompt">
    <div><strong>Add Mezzo Staff to your phone</strong><span>Install it as a shortcut for faster access.</span></div>
    {installEvent ? <button className="primary small-button" onClick={install}>Install</button> : <span className="hint">Use browser menu → Add to Home Screen</span>}
    <button className="small-button" onClick={close}>Later</button>
  </div>;
}
