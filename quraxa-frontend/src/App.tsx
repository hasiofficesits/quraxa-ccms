import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { ConfirmProvider } from '@/context/ConfirmContext';
import { Toaster } from '@/components/ui/sonner';
import ThemeToggle from '@/components/ThemeToggle';
import Layout from '@/components/Layout';
import RequirePermission from '@/components/RequirePermission';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import Patients from '@/pages/Patients';
import Doctors from '@/pages/Doctors';
import Sessions from './pages/Sessions';
import Consultation from './pages/Consultation';
import Pharmacy from './pages/Pharmacy';
import Billing from './pages/Billing';
import SalarySettlements from './pages/SalarySettlements';
import Administration from './pages/Administration';
import Reports from './pages/Reports';
import LabReports from './pages/LabReports';
import InsuranceClaims from './pages/InsuranceClaims';

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ConfirmProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route element={<Layout />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/patients" element={
                  <RequirePermission permission="patient.view"><Patients /></RequirePermission>
                } />
                <Route path="/doctors" element={
                  <RequirePermission permission="doctor.view"><Doctors /></RequirePermission>
                } />
                <Route path="/sessions" element={
                  <RequirePermission permission="session.view"><Sessions /></RequirePermission>
                } />
                <Route path="/consultation" element={
                  <RequirePermission permission="consultation.view"><Consultation /></RequirePermission>
                } />
                <Route path="/lab-reports" element={
                  <RequirePermission permission="lab.view"><LabReports /></RequirePermission>
                } />
                <Route path="/pharmacy" element={
                  <RequirePermission permission="stock.view"><Pharmacy /></RequirePermission>
                } />
                <Route path="/billing" element={
                  <RequirePermission permission="invoice.view"><Billing /></RequirePermission>
                } />
                <Route path="/insurance-claims" element={
                  <RequirePermission permission="claim.view"><InsuranceClaims /></RequirePermission>
                } />
                <Route path="/salary-settlements" element={
                  <RequirePermission permission="payment.doctor"><SalarySettlements /></RequirePermission>
                } />
                <Route path="/administration" element={
                  <RequirePermission permission={['user.view', 'role.manage', 'audit.view']}>
                    <Administration />
                  </RequirePermission>
                } />
                <Route path="/reports" element={
                  <RequirePermission permission={['report.operational', 'report.financial', 'audit.view']}>
                    <Reports />
                  </RequirePermission>
                } />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
          <ThemeToggle />
          <Toaster />
        </ConfirmProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
