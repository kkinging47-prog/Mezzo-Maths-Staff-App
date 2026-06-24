import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

type StaffPayload = {
  email?: string;
  password?: string;
  full_name?: string;
  staff_no?: string;
  role?: 'admin' | 'staff';
  phone?: string;
  position?: string;
  department?: string;
  date_employed?: string;
  date_of_birth?: string;
  location?: string;
  digital_address?: string;
  home_address?: string;
  guardian_name?: string;
  guardian_contact?: string;
};

function getBearerToken(req: any) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  const value = Array.isArray(header) ? header[0] : header;
  return value.startsWith('Bearer ') ? value.slice(7) : '';
}

function readBody(req: any) {
  if (!req.body) return {};
  if (typeof req.body === 'string') return JSON.parse(req.body);
  return req.body;
}

function cleanText(value?: string) {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

async function requireAdmin(adminClient: ReturnType<typeof createClient>, accessToken: string) {
  if (!accessToken) throw new Error('Missing admin session token. Please sign in again.');
  const { data: userData, error: userError } = await adminClient.auth.getUser(accessToken);
  if (userError || !userData.user) throw new Error('Invalid admin session. Please sign in again.');

  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('id, role')
    .eq('id', userData.user.id)
    .single();

  if (profileError || profile?.role !== 'admin') throw new Error('Only admin users can manage staff accounts.');
  return userData.user;
}

async function createStaff(adminClient: ReturnType<typeof createClient>, staff: StaffPayload) {
  const email = cleanText(staff.email)?.toLowerCase();
  const password = staff.password || '';
  const fullName = cleanText(staff.full_name);

  if (!email) throw new Error('Staff email is required.');
  if (!password || password.length < 6) throw new Error('Initial password must be at least 6 characters.');
  if (!fullName) throw new Error('Staff full name is required.');

  const { data: createdUser, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (createError) throw createError;
  const userId = createdUser.user?.id;
  if (!userId) throw new Error('Staff user could not be created.');

  const { error: profileError } = await adminClient.from('profiles').upsert({
    id: userId,
    role: staff.role === 'admin' ? 'admin' : 'staff',
    email,
    full_name: fullName,
    staff_no: cleanText(staff.staff_no),
    phone: cleanText(staff.phone),
    position: cleanText(staff.position) || 'Mezzo Maths Tutor',
    department: cleanText(staff.department),
    date_employed: cleanText(staff.date_employed),
    date_of_birth: cleanText(staff.date_of_birth),
    location: cleanText(staff.location),
    digital_address: cleanText(staff.digital_address),
    home_address: cleanText(staff.home_address),
    guardian_name: cleanText(staff.guardian_name),
    guardian_contact: cleanText(staff.guardian_contact),
    status: 'active',
    updated_at: new Date().toISOString(),
  });

  if (profileError) throw profileError;
  return { id: userId, email };
}

async function deleteStaff(adminClient: ReturnType<typeof createClient>, staffId: string, adminId: string) {
  if (!staffId) throw new Error('Staff ID is required.');
  if (staffId === adminId) throw new Error('You cannot delete your own admin account while signed in.');

  const { error } = await adminClient.auth.admin.deleteUser(staffId);
  if (error) throw error;
  return { id: staffId };
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_URL environment variable on Vercel.' });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const body = readBody(req);
    const adminUser = await requireAdmin(adminClient, getBearerToken(req));

    if (body.action === 'create') {
      const staff = await createStaff(adminClient, body.staff || {});
      return res.status(200).json({ ok: true, staff });
    }

    if (body.action === 'delete') {
      const deleted = await deleteStaff(adminClient, body.staff_id, adminUser.id);
      return res.status(200).json({ ok: true, deleted });
    }

    return res.status(400).json({ error: 'Unknown staff action.' });
  } catch (error: any) {
    return res.status(400).json({ error: error.message || 'Staff action failed.' });
  }
}
