import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { mezzoLogoDataUrl } from '../lib/branding';

const logoCacheKey = 'mezzo_company_logo_url';

export function useCompanyLogo() {
  const [logoUrl, setLogoUrl] = useState(() => localStorage.getItem(logoCacheKey) || mezzoLogoDataUrl);

  useEffect(() => {
    let active = true;
    supabase.from('company_settings').select('value').eq('key', 'company_logo_url').maybeSingle().then(({ data }) => {
      const value = data?.value;
      if (!active || !value) return;
      localStorage.setItem(logoCacheKey, value);
      setLogoUrl(value);
    });
    return () => { active = false; };
  }, []);

  return logoUrl;
}

export function CompanyLogo({ className, alt = 'Mezzo Maths logo' }: { className?: string; alt?: string }) {
  const logoUrl = useCompanyLogo();
  return <img className={className} src={logoUrl} alt={alt} />;
}
