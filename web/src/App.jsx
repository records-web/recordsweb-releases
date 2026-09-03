import React from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import HomePage from './pages/HomePage'
import PatientSearchPage from './pages/PatientSearchPage'
import PatientSummaryPage from './pages/PatientSummaryPage'
import ConsultationsPage from './pages/ConsultationsPage'
import NewConsultationPage from './pages/NewConsultationPage'
import MedicationPage from './pages/MedicationPage'
import ProblemsPage from './pages/ProblemsPage'
import InvestigationsPage from './pages/InvestigationsPage'
import CareHistoryPage from './pages/CareHistoryPage'
import DiaryPage from './pages/DiaryPage'
import DocumentsPage from './pages/DocumentsPage'
import ReferralsPage from './pages/ReferralsPage'
import AppointmentBookPage from './pages/AppointmentBookPage'
import RegistrationPage from './pages/RegistrationPage'
import StaffAreaPage from './pages/StaffAreaPage'
import ManagementPage from './pages/ManagementPage'
import SecurityPage from './pages/SecurityPage'
import SettingsPage from './pages/SettingsPage'
import AppShell from './components/AppShell'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import MaintenanceGate from './components/maintenance/MaintenanceGate'
import AccountAccessGuard from './components/security/AccountAccessGuard'
import WebUpdateManager from './components/WebUpdateManager'

function Protected({ children }) {
  const { session } = useAuth()
  const location = useLocation()
  if (!session) return <Navigate to="/login" state={{ from: location }} replace />
  return children
}

function ManagementOnly({ children }) {
  const { session } = useAuth()
  if (!session?.profile?.is_management) return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <AuthProvider>
        <WebUpdateManager />
        <MaintenanceGate>
        <AccountAccessGuard>
        <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/*" element={
          <Protected>
            <AppShell>
              <Routes>
                <Route index element={<HomePage />} />
                <Route path="patients" element={<PatientSearchPage />} />
                <Route path="patients/:patientId" element={<PatientSummaryPage />} />
                <Route path="patients/:patientId/consultations" element={<ConsultationsPage />} />
                <Route path="patients/:patientId/consultations/new" element={<NewConsultationPage />} />
                <Route path="patients/:patientId/medication" element={<MedicationPage />} />
                <Route path="patients/:patientId/problems" element={<ProblemsPage />} />
                <Route path="patients/:patientId/investigations" element={<InvestigationsPage />} />
                <Route path="patients/:patientId/care-history" element={<CareHistoryPage />} />
                <Route path="patients/:patientId/diary" element={<DiaryPage />} />
                <Route path="patients/:patientId/documents" element={<DocumentsPage />} />
                <Route path="patients/:patientId/referrals" element={<ReferralsPage />} />
                <Route path="appointments" element={<AppointmentBookPage />} />
                <Route path="registration" element={<RegistrationPage />} />
                <Route path="staff-area" element={<StaffAreaPage />} />
                <Route path="management" element={<ManagementOnly><ManagementPage /></ManagementOnly>} />
                <Route path="security" element={<SecurityPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </AppShell>
          </Protected>
        } />
        </Routes>
        </AccountAccessGuard>
        </MaintenanceGate>
    </AuthProvider>
  )
}
