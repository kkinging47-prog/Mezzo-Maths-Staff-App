import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

type AdminClient = any;

type StaffPayload = {
  email?: string;
  password?: string;
  temp_password?: string;
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
  status?: string;
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

function cleanText(value?: string | null) {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

async function requireAdmin(adminClient: AdminClient, accessToken: string) {
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

function profilePayload(staff: StaffPayload) {
  const email = cleanText(staff.email)?.toLowerCase();
  return {
    role: staff.role === 'admin' ? 'admin' : 'staff',
    email,
    full_name: cleanText(staff.full_name),
    staff_no: cleanText(staff.staff_no),
    phone: cleanText(staff.phone),
    position: cleanText(staff.position) || 'Tutor',
    department: cleanText(staff.department) || 'Teaching',
    date_employed: cleanText(staff.date_employed),
    date_of_birth: cleanText(staff.date_of_birth),
    location: cleanText(staff.location),
    digital_address: cleanText(staff.digital_address),
    home_address: cleanText(staff.home_address),
    guardian_name: cleanText(staff.guardian_name),
    guardian_contact: cleanText(staff.guardian_contact),
    status: staff.status === 'left' ? 'left' : 'active',
    updated_at: new Date().toISOString(),
  };
}

async function createStaff(adminClient: AdminClient, staff: StaffPayload) {
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

  const payload = profilePayload({ ...staff, status: 'active' });
  const { error: profileError } = await adminClient.from('profiles').upsert({ id: userId, ...payload });
  if (profileError) throw profileError;
  return { id: userId, email };
}

async function updateStaff(adminClient: AdminClient, staffId: string, staff: StaffPayload, adminId: string) {
  if (!staffId) throw new Error('Staff ID is required.');

  const authUpdates: Record<string, any> = {};
  const nextEmail = cleanText(staff.email)?.toLowerCase();
  const tempPassword = staff.temp_password || staff.password || '';

  if (nextEmail) authUpdates.email = nextEmail;
  if (tempPassword) {
    if (tempPassword.length < 6) throw new Error('Temporary password must be at least 6 characters.');
    authUpdates.password = tempPassword;
  }

  if (Object.keys(authUpdates).length > 0) {
    const { error: authError } = await adminClient.auth.admin.updateUserById(staffId, {
      ...authUpdates,
      email_confirm: true,
      user_metadata: { full_name: cleanText(staff.full_name) || undefined },
    });
    if (authError) throw authError;
  }

  const payload = profilePayload(staff);
  if (staffId === adminId) payload.status = 'active';
  const { error: profileError } = await adminClient.from('profiles').update(payload).eq('id', staffId);
  if (profileError) throw profileError;
  return { id: staffId, email: nextEmail, password_reset: Boolean(tempPassword) };
}

async function deleteStaff(adminClient: AdminClient, staffId: string, adminId: string) {
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
  }) as AdminClient;

  try {
    const body = readBody(req);
    const adminUser = await requireAdmin(adminClient, getBearerToken(req));

    if (body.action === 'create') {
      const staff = await createStaff(adminClient, body.staff || {});
      return res.status(200).json({ ok: true, staff });
    }

    if (body.action === 'update') {
      const updated = await updateStaff(adminClient, body.staff_id, body.staff || {}, adminUser.id);
      return res.status(200).json({ ok: true, updated });
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
