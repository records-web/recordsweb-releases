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
import SharedCarePatientPage from './pages/SharedCarePatientPage'
import SharedCareWorkspacePage from './pages/SharedCareWorkspacePage'
import HospitalWorkspacePage from './pages/HospitalWorkspacePage'
import AmbulanceWorkspacePage from './pages/AmbulanceWorkspacePage'
import CareWorkQueuePage from './pages/CareWorkQueuePage'
import AppShell from './components/AppShell'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import UpdateGate from './components/update/UpdateGate'
import MaintenanceGate from './components/maintenance/MaintenanceGate'
import AccountAccessGuard from './components/security/AccountAccessGuard'
import PatientSecurityGate from './components/security/PatientSecurityGate'
import InstallationGate from './components/installation/InstallationGate'

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
    <InstallationGate>
    <UpdateGate>
      <AuthProvider>
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
                <Route path="patients/:patientId" element={<PatientSecurityGate section="summary"><PatientSummaryPage /></PatientSecurityGate>} />
                <Route path="patients/:patientId/consultations" element={<PatientSecurityGate section="consultations"><ConsultationsPage /></PatientSecurityGate>} />
                <Route path="patients/:patientId/consultations/new" element={<PatientSecurityGate section="consultations.new"><NewConsultationPage /></PatientSecurityGate>} />
                <Route path="patients/:patientId/medication" element={<PatientSecurityGate section="medication"><MedicationPage /></PatientSecurityGate>} />
                <Route path="patients/:patientId/problems" element={<PatientSecurityGate section="problems"><ProblemsPage /></PatientSecurityGate>} />
                <Route path="patients/:patientId/investigations" element={<PatientSecurityGate section="investigations"><InvestigationsPage /></PatientSecurityGate>} />
                <Route path="patients/:patientId/care-history" element={<PatientSecurityGate section="care-history"><CareHistoryPage /></PatientSecurityGate>} />
                <Route path="patients/:patientId/diary" element={<PatientSecurityGate section="diary"><DiaryPage /></PatientSecurityGate>} />
                <Route path="patients/:patientId/documents" element={<PatientSecurityGate section="documents"><DocumentsPage /></PatientSecurityGate>} />
                <Route path="patients/:patientId/referrals" element={<PatientSecurityGate section="referrals"><ReferralsPage /></PatientSecurityGate>} />
            <Route path="patients/:patientId/shared-care" element={<PatientSecurityGate section="shared-care"><SharedCarePatientPage /></PatientSecurityGate>} />
            <Route path="shared-care" element={<SharedCareWorkspacePage />} />
            <Route path="hospital/ward-board" element={<HospitalWorkspacePage view="ward" />} />
            <Route path="hospital/admissions" element={<HospitalWorkspacePage view="admissions" />} />
            <Route path="hospital/discharge" element={<HospitalWorkspacePage view="discharge" />} />
            <Route path="ambulance/incidents" element={<AmbulanceWorkspacePage view="incidents" />} />
            <Route path="ambulance/handover" element={<AmbulanceWorkspacePage view="handover" />} />
            <Route path="work-queue" element={<CareWorkQueuePage />} />
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
    </UpdateGate>
    </InstallationGate>
  )
}
