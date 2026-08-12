import { supabase } from './supabase';

export interface AdminSignatureAsset {
  name: string;
  dataUrl: string;
  format: 'PNG' | 'JPEG';
}

export function imageFormatFromDataUrl(dataUrl: string): 'PNG' | 'JPEG' {
  return dataUrl.toLowerCase().startsWith('data:image/png') ? 'PNG' : 'JPEG';
}

export function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Could not read file.'));
    reader.readAsDataURL(file);
  });
}

async function urlToDataUrl(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Could not load admin signature image.');
  const blob = await response.blob();
  return fileToDataUrl(blob);
}

export async function getAdminSignatureAsset(): Promise<AdminSignatureAsset> {
  const fallback: AdminSignatureAsset = { name: 'Authorized Signatory', dataUrl: '', format: 'JPEG' };
  try {
    const { data } = await supabase
      .from('company_settings')
      .select('key,value')
      .in('key', ['admin_signature_name', 'admin_signature_data_url', 'admin_signature_url']);
    const settings = Object.fromEntries((data || []).map((row: any) => [row.key, row.value]));
    const name = settings.admin_signature_name || fallback.name;
    let dataUrl = settings.admin_signature_data_url || '';
    if (!dataUrl && settings.admin_signature_url) dataUrl = await urlToDataUrl(settings.admin_signature_url);
    if (!dataUrl) return { ...fallback, name };
    return { name, dataUrl, format: imageFormatFromDataUrl(dataUrl) };
  } catch {
    return fallback;
  }
}
