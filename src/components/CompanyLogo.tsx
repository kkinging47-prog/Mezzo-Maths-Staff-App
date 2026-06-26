import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { mezzoLogoDataUrl } from '../lib/branding';

const logoCacheKey = 'mezzo_company_logo_url';
const logoCacheVersionKey = 'mezzo_company_logo_loaded_at';

function saveLogo(value: string, setLogoUrl: (value: string) => void) {
  const cacheBusted = value.includes('?') ? `${value}&v=${Date.now()}` : `${value}?v=${Date.now()}`;
  localStorage.setItem(logoCacheKey, cacheBusted);
  localStorage.setItem(logoCacheVersionKey, new Date().toISOString());
  setLogoUrl(cacheBusted);
}

export function useCompanyLogo() {
  const [logoUrl, setLogoUrl] = useState(() => localStorage.getItem(logoCacheKey) || mezzoLogoDataUrl);

  useEffect(() => {
    let active = true;

    fetch('/api/public-settings')
      .then((response) => response.ok ? response.json() : null)
      .then((settings) => {
        const value = settings?.company_logo_url;
        if (active && value) saveLogo(value, setLogoUrl);
      })
      .catch(() => undefined);

    supabase.from('company_settings').select('value').eq('key', 'company_logo_url').maybeSingle().then(({ data }) => {
      const value = data?.value;
      if (!active || !value) return;
      saveLogo(value, setLogoUrl);
    });
    return () => { active = false; };
  }, []);

  return logoUrl;
}

export function CompanyLogo({ className, alt = 'Mezzo Maths logo' }: { className?: string; alt?: string }) {
  const logoUrl = useCompanyLogo();
  return <img className={className} src={logoUrl} alt={alt} />;
}
