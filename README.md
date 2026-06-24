# Mezzo Staff Portal

A deployable React + Supabase web app for staff details updates, school-location attendance, weekly reports, staff updates, comments, meetings, employment letters and payslips.

## Features included

- Supabase Auth login with show/hide password visibility
- Staff profile update page with profile photo and password update
- Admin staff creation/deletion, including initial password setup
- Admin school setup with latitude, longitude and allowed radius
- Staff-to-school assignment, including multiple schools per staff
- Attendance check-in within 100m or school-defined radius
- Selfie capture during check-in, saved in private Supabase Storage
- Manual checkout and client-side 4pm auto checkout
- Supabase Cron database function for reliable server-side 4pm auto checkout
- Weekly teaching report submission
- Company dashboard with updates and comments
- Realtime refresh for updates, comments and meetings
- Jitsi Meet voice/video meeting embed
- Employment letter PDF generation
- Monthly payslip PDF generation from admin payroll data
- Row Level Security policies for staff/admin access control

## Tech stack

- Vite + React + TypeScript
- Supabase Auth, Postgres, Storage, Realtime and RLS
- Jitsi Meet iframe API for voice/video meetings
- jsPDF for generated employment letters and payslips

## 1. Create your Supabase project

1. Go to Supabase and create a project.
2. Open **SQL Editor**.
3. Copy and run the full contents of `supabase/schema.sql`.
4. In Supabase **Authentication > Users**, create your first admin user.
5. Run this SQL, replacing the email:

```sql
update public.profiles
set role = 'admin', full_name = 'Admin Name'
where email = 'admin@example.com';
```

## 2. Configure environment variables

Create `.env.local` from `.env.example`:

```bash
cp .env.example .env.local
```

Fill in:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_COMPANY_NAME=Mezzo House Limited
VITE_ATTENDANCE_RADIUS_M=100
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-secret-service-role-key-for-vercel-api-only
```

You can find these under **Supabase > Project Settings > API**. Keep `SUPABASE_SERVICE_ROLE_KEY` private. Add it only in Vercel Environment Variables; never expose it in client code or share it publicly.

## 3. Run locally

```bash
npm install
npm run dev
```

Open the local URL shown in your terminal.

## 4. Deploy to Vercel

1. Push this folder to GitHub.
2. Import the repository into Vercel.
3. Add the environment variables in Vercel Project Settings. The staff-management API needs `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_URL` in addition to the `VITE_` variables.
4. Deploy.

## 5. Configure attendance auto checkout

The app will attempt client-side auto checkout at 4pm when a staff member has the app open. For reliable auto checkout even when the app is closed, uncomment and run the cron line at the bottom of `supabase/schema.sql`:

```sql
select cron.schedule(
  'auto-close-attendance-4pm-ghana',
  '5 16 * * 1-5',
  'select public.auto_checkout_attendance();'
);
```

Ghana uses UTC, so `16:05` equals 4:05pm Ghana time.

## 6. How to set up schools for geofencing

1. Sign in as admin.
2. Go to **Admin**.
3. Add each school with its latitude and longitude.
4. Keep radius at `100` meters, or adjust if the school compound is larger.
5. Assign teachers to the school. A teacher can be assigned to more than one school.

Tip: You can get a school's latitude/longitude from Google Maps by right-clicking the location and copying the coordinates.

## 7. Creating and deleting staff accounts

Admin can now create staff accounts directly from the **Admin** page. The admin sets an initial password, and the staff member can sign in and later update the password from **My Details**.

Admin can:

- Add staff login accounts
- Delete staff login accounts
- Assign school locations
- Create monthly payslip data
- Post company updates
- Create meeting rooms

The add/delete staff feature uses the Vercel serverless function at `/api/staff`, so the project must have `SUPABASE_SERVICE_ROLE_KEY` set in Vercel. Do not put the service role key inside `VITE_` variables.

## 8. Important production notes

- Geolocation works best on mobile devices with GPS and must be served over HTTPS.
- A GPS radius of 100m is reasonable, but low-end devices may have weak accuracy. You can widen individual school radius values if needed.
- Jitsi free public rooms are convenient. For sensitive meetings, consider Jitsi-as-a-Service or a private Jitsi deployment.
- Payslip and employment letter templates are basic and should be reviewed by management before official use.
- Selfie files are stored privately. For stronger anti-fraud attendance, add face verification or manual admin review of selfie photos.

## 9. Future improvements

- Admin attendance report export to Excel/PDF
- Push notifications using Firebase Cloud Messaging or OneSignal
- Leave requests and approvals
- Staff disciplinary notes and HR documents
- Bulk staff import
- Email payslip delivery
- Facial recognition verification
