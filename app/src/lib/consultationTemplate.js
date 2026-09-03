export const CONSULTATION_TEMPLATE = [
  'Problem',
  'History',
  'Examination',
  'Medication',
  'Comment',
  'Follow Up',
  'Test Requests',
  'Referral',
  'Document',
  'Allergies',
]

export function normaliseConsultationEntryType(type) {
  if (type === 'Test Request') return 'Test Requests'
  return type || 'Comment'
}

export function consultationEntriesToMap(entries = []) {
  const mapped = Object.fromEntries(CONSULTATION_TEMPLATE.map((section) => [section, '']))
  const legacy = []
  for (const entry of entries || []) {
    const type = normaliseConsultationEntryType(entry?.type)
    const text = String(entry?.text || '')
    if (CONSULTATION_TEMPLATE.includes(type)) {
      mapped[type] = mapped[type] ? `${mapped[type]}\n${text}`.trim() : text
    } else if (text.trim()) {
      legacy.push({ type, text })
    }
  }
  return { mapped, legacy }
}
