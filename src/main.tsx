import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Attendance } from './pages/Attendance';
import { ProfilePage } from './pages/ProfilePage';
import { WeeklyReport } from './pages/WeeklyReport';
import { Documents } from './pages/Documents';
import { Meetings } from './pages/Meetings';
import { WorkbookOrders } from './pages/WorkbookOrders';
import { ReportSummary } from './pages/ReportSummary';
import { AdminDocuments } from './pages/AdminDocuments';
import { AdminSettings } from './pages/AdminSettings';
import { Admin } from './pages/Admin';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/attendance" element={<Attendance />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/reports" element={<WeeklyReport />} />
            <Route path="/documents" element={<Documents />} />
            <Route path="/meetings" element={<Meetings />} />
            <Route path="/workbooks" element={<WorkbookOrders />} />
            <Route path="/report-summary" element={<ProtectedRoute adminOnly><ReportSummary /></ProtectedRoute>} />
            <Route path="/admin-documents" element={<ProtectedRoute adminOnly><AdminDocuments /></ProtectedRoute>} />
            <Route path="/admin-settings" element={<ProtectedRoute adminOnly><AdminSettings /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute adminOnly><Admin /></ProtectedRoute>} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
