export type UserRole = 'admin' | 'staff';
export type AppointmentLetterStatus = 'pending' | 'approved' | 'rejected';

export interface Profile {
  id: string;
  role: UserRole;
  staff_no?: string | null;
  full_name?: string | null;
  date_of_birth?: string | null;
  date_employed?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  digital_address?: string | null;
  home_address?: string | null;
  guardian_name?: string | null;
  guardian_contact?: string | null;
  position?: string | null;
  department?: string | null;
  photo_url?: string | null;
  status?: string | null;
}

export interface School {
  id: string;
  name: string;
  address?: string | null;
  latitude: number;
  longitude: number;
  radius_m: number;
}

export interface AttendanceRecord {
  id: string;
  staff_id: string;
  school_id: string;
  work_date: string;
  check_in_at: string;
  check_out_at?: string | null;
  check_in_distance_m?: number | null;
  check_out_distance_m?: number | null;
  selfie_url?: string | null;
  status: string;
  schools?: School;
}

export interface CompanyPost {
  id: string;
  author_id: string;
  title: string;
  body: string;
  priority: 'normal' | 'important' | 'urgent';
  post_type?: 'update' | 'birthday' | string | null;
  image_url?: string | null;
  image_path?: string | null;
  created_at: string;
  profiles?: Pick<Profile, 'full_name' | 'email'> | null;
}

export interface Comment {
  id: string;
  post_id: string;
  author_id: string;
  body: string;
  created_at: string;
  profiles?: Pick<Profile, 'full_name' | 'email'> | null;
}

export interface Meeting {
  id: string;
  title: string;
  description?: string | null;
  room_name: string;
  scheduled_at?: string | null;
  active: boolean;
}

export interface Payroll {
  id: string;
  staff_id: string;
  month: string;
  basic_salary: number;
  allowances: number;
  deductions: number;
  paid_on?: string | null;
}

export interface AppointmentLetterRequest {
  id: string;
  staff_id: string;
  status: AppointmentLetterStatus;
  requested_at: string;
  decided_by?: string | null;
  decided_at?: string | null;
  appointment_date?: string | null;
  position?: string | null;
  monthly_salary?: number | string | null;
  admin_notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  profiles?: Pick<Profile, 'id' | 'full_name' | 'email' | 'position' | 'date_employed' | 'staff_no'> | null;
}
