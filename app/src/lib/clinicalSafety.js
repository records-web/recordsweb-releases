import { listForPatient } from './dataService'

export async function listActivePatientAlerts(patientId) {
  const rows = await listForPatient('patient_alerts', patientId, 'created_at', false)
  return rows.filter((row) => row.active !== false)
}
