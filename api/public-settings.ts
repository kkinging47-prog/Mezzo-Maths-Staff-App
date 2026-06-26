import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(200).json({ company_logo_url: null });
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data } = await client
    .from('company_settings')
    .select('key,value,updated_at')
    .in('key', ['company_logo_url', 'current_academic_year', 'current_term']);

  const settings = Object.fromEntries((data || []).map((row: any) => [row.key, row.value]));
  return res.status(200).json(settings);
}
