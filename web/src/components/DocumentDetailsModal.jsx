import React, { useEffect, useState } from 'react'
import { Download, LockKeyhole, Printer, X } from 'lucide-react'
import ModalPortal from './ModalPortal'
import { ORGANISATION } from '../lib/demoData'
import { listDocumentVersions } from '../lib/documentVersions'
import { recordAudit } from '../lib/auditService'
import { getFitNotePdfBlob } from '../lib/dataService'

function fmt(value) {
  if (!value) return '—'
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('en-GB')
}

function adjustments(details = {}) {
  return [
    details.phased_return && 'Phased return to work',
    details.amended_duties && 'Amended duties',
    details.altered_hours && 'Altered hours',
    details.workplace_adaptations && 'Workplace adaptations',
  ].filter(Boolean)
}

export default function DocumentDetailsModal({ document, patient, onClose }) {
  const details = document?.details || {}
  const isFitNote = document?.document_type === 'Fit Note' || document?.category === 'Fit Note'
  const locked = Boolean(document?.immutable || document?.locked_at || document?.status === 'Signed')
  const [pdfState, setPdfState] = useState('')
  const [pdfUrl, setPdfUrl] = useState('')
  const [pdfBlob, setPdfBlob] = useState(null)
  const [versions, setVersions] = useState([])

  useEffect(() => { if (document?.id && !isFitNote) listDocumentVersions(document.id).then(setVersions).catch(() => {}) }, [document?.id, isFitNote])

  useEffect(() => {
    if (!isFitNote || !document?.id) return undefined
    let active = true
    let objectUrl = ''

    async function loadPdf() {
      setPdfState('Loading signed PDF…')
      try {
        let blob = await getFitNotePdfBlob(document.id, document.storage_path)
        if (!blob && window.recordsWebDesktop?.renderPdfBase64) {
          const html = buildFitNoteHtml(document, patient)
          const rendered = await window.recordsWebDesktop.renderPdfBase64({ html })
          if (rendered?.base64) blob = base64PdfBlob(rendered.base64)
        }
        if (!blob) throw new Error('No PDF archive is available for this fit note.')
        objectUrl = URL.createObjectURL(blob)
        if (!active) return
        setPdfBlob(blob)
        setPdfUrl(`${objectUrl}#toolbar=0&navpanes=0&view=FitH`)
        setPdfState('')
      } catch (error) {
        if (active) setPdfState(error?.message || 'Unable to load the fit note PDF.')
      }
    }

    loadPdf()
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [isFitNote, document?.id, document?.storage_path, patient?.id])

  async function savePdf() {
    setPdfState('Preparing PDF…')
    try {
      if (pdfBlob) {
        const url = URL.createObjectURL(pdfBlob)
        const link = window.document.createElement('a')
        link.href = url
        link.download = fitNoteFileName(document, patient)
        window.document.body.appendChild(link)
        link.click()
        link.remove()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
        setPdfState('PDF saved.')
        await recordAudit({ action: 'document.pdf.exported', entityType: 'documents', entityId: document?.id, patientId: patient?.id, description: 'Saved signed fit note PDF.' })
        return
      }
      const html = buildFitNoteHtml(document, patient)
      if (window.recordsWebDesktop?.savePdf) {
        const result = await window.recordsWebDesktop.savePdf({ html, defaultFilename: fitNoteFileName(document, patient) })
        setPdfState(result?.cancelled ? '' : 'PDF saved.')
        if (!result?.cancelled) await recordAudit({ action: 'document.pdf.exported', entityType: 'documents', entityId: document?.id, patientId: patient?.id, description: 'Saved fit note PDF.' })
        return
      }
      fallbackPrint(html)
      setPdfState('Use the print dialog to save as PDF.')
    } catch (error) {
      setPdfState(error?.message || 'Unable to save the PDF.')
    }
  }

  async function printPdf() {
    setPdfState('Opening print dialog…')
    try {
      const html = buildFitNoteHtml(document, patient)
      if (window.recordsWebDesktop?.printHtml) {
        const result = await window.recordsWebDesktop.printHtml({ html })
        setPdfState(result?.cancelled ? '' : 'Print dialog opened.')
        if (!result?.cancelled) await recordAudit({ action: 'document.printed', entityType: 'documents', entityId: document?.id, patientId: patient?.id, description: 'Printed signed fit note.' })
        return
      }
      fallbackPrint(html)
      setPdfState('Print dialog opened.')
    } catch (error) {
      setPdfState(error?.message || 'Unable to print the fit note.')
    }
  }

  if (isFitNote) {
    return (
      <ModalPortal onClose={onClose} ariaLabel={document?.title || 'Fit note PDF'}>
        <div className="records-modal document-details-modal fit-note-pdf-modal">
          <header>
            <div><strong>{document?.title || 'Statement of Fitness for Work'}</strong><span>PDF document · {locked ? 'Signed and locked' : 'Issued'}</span></div>
            <button onClick={onClose} aria-label="Close"><X size={18} /></button>
          </header>
          <div className="modal-patient-strip fit-note-pdf-strip">
            <span>{patient ? `${patient.last_name?.toUpperCase()}, ${patient.first_name} (${patient.title || ''})` : 'Patient record'}</span>
            <span className="fit-note-lock-state"><LockKeyhole size={13} /> {locked ? 'Signed document — editing disabled' : 'Issued fit note'}</span>
          </div>
          <div className="fit-note-pdf-viewer-shell">
            {pdfUrl ? (
              <iframe className="fit-note-pdf-viewer" src={pdfUrl} title="Signed fit note PDF" />
            ) : (
              <div className="fit-note-pdf-loading"><strong>{pdfState || 'Loading PDF…'}</strong><span>The filed fit note is displayed as a read-only PDF.</span></div>
            )}
          </div>
          <footer>
            {pdfState && pdfUrl && <span className="document-pdf-state" role="status">{pdfState}</span>}
            <span className="fit-note-immutable-note"><LockKeyhole size={13} /> Once issued, this fit note cannot be edited.</span>
            <button className="secondary-button" onClick={printPdf}><Printer size={14} /> Print</button>
            <button className="primary-button" onClick={savePdf}><Download size={14} /> Save PDF</button>
            <button className="secondary-button" onClick={onClose}>Close</button>
          </footer>
        </div>
      </ModalPortal>
    )
  }

  return (
    <ModalPortal onClose={onClose} ariaLabel={document?.title || 'Document'}>
      <div className="records-modal document-details-modal">
        <header>
          <div><strong>{document?.title || 'Document'}</strong><span>{document?.category || 'Clinical document'}</span></div>
          <button onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        <div className="modal-patient-strip">{patient ? `${patient.last_name?.toUpperCase()}, ${patient.first_name} (${patient.title || ''})` : 'Patient record'}</div>
        <div className="document-detail-sections">
          <section><span>Document</span><strong>{document?.title || '—'}</strong></section>
          <section><span>Date</span><strong>{fmt(document?.date)}</strong></section>
          <section><span>Author</span><strong>{document?.author || '—'}</strong></section>
          {versions.length > 0 && <section className="document-detail-wide document-version-history"><span>Version history</span><div>{versions.slice(0,8).map((version)=><em key={version.id}>Version {version.version_number} · {new Date(version.changed_at).toLocaleString('en-GB')}</em>)}</div></section>}
        </div>
        <footer><button className="secondary-button" onClick={onClose}>Close</button></footer>
      </div>
    </ModalPortal>
  )
}

function base64PdfBlob(base64) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return new Blob([bytes], { type: 'application/pdf' })
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[char]))
}

export function fitNoteFileName(document, patient) {
  const surname = String(patient?.last_name || 'Patient').replace(/[^A-Za-z0-9_-]+/g, '-')
  const date = String(document?.date || new Date().toISOString().slice(0, 10)).slice(0, 10)
  return `RecordsWeb-Fit-Note-${surname}-${date}.pdf`
}

export function buildFitNoteHtml(document, patient) {
  const d = document?.details || {}
  const opts = adjustments(d)
  const fullPatient = [patient?.title, patient?.first_name, patient?.last_name].filter(Boolean).join(' ')
  const surname = String(patient?.last_name || '').toUpperCase()
  const otherNames = [patient?.first_name].filter(Boolean).join(' ').toUpperCase()
  const periodDuration = d.period_mode === 'duration' ? `${esc(d.duration_value || '')} ${esc(d.duration_unit || '')}` : ''
  const periodFrom = d.period_mode === 'dates' ? fmt(d.period_from) : '—'
  const periodTo = d.period_mode === 'dates' ? fmt(d.period_to) : '—'
  const notFit = d.advice === 'Not fit for work'
  const mayFit = d.advice === 'May be fit for work'
  const checked = (value) => value ? 'X' : ''
  const addressLines = String(patient?.address || '').split(/\r?\n|,/).map((line) => line.trim()).filter(Boolean)
  const addressHtml = (addressLines.length ? addressLines : ['']).slice(0, 3).map((line) => `<div class="field line">${esc(line)}</div>`).join('')
  const conditionClass = String(d.condition || '').length > 140 ? ' dense' : ''
  const commentsLength = String(d.comments || '').length
  const commentsClass = commentsLength > 420 ? ' ultra-dense' : commentsLength > 220 ? ' dense' : ''

  return `<!doctype html><html><head><meta charset="utf-8"><title>Roleplay Fit Note - ${esc(fullPatient)}</title><style>
    @page{size:A4 landscape;margin:5mm}*{box-sizing:border-box}html,body{margin:0;width:287mm;height:200mm;overflow:hidden;background:#fff;color:#111}body{font-family:Arial,Helvetica,sans-serif;font-size:9px;line-height:1.15}.page{position:relative;width:287mm;height:200mm;max-height:200mm;padding:2mm 3mm;background:#fff;overflow:hidden;display:grid;grid-template-rows:auto minmax(0,1fr) auto;gap:1.5mm;break-after:avoid;page-break-after:avoid}.watermark{position:absolute;z-index:0;left:50%;top:50%;transform:translate(-50%,-50%) rotate(-28deg);font-size:54px;font-weight:800;letter-spacing:3px;color:rgba(70,70,70,.08);white-space:nowrap;pointer-events:none}.roleplay{position:relative;z-index:2;border:1.5px solid #111;padding:2.5px 7px;margin:0;text-align:center;font-size:9.5px;line-height:1.05;font-weight:800;letter-spacing:.35px}.cols{position:relative;z-index:1;display:grid;grid-template-columns:1fr 1fr;gap:8mm;min-height:0;height:100%;overflow:hidden;break-inside:avoid;page-break-inside:avoid}.col{min-width:0;min-height:0;overflow:hidden}.heading{font-size:15px;font-weight:800;line-height:1}.subheading{font-size:10px;font-weight:800;margin:1px 0 4px}.rule{height:1px;background:#111;margin:2px 0 4px}.r{display:grid;grid-template-columns:34mm 1fr;gap:2mm;align-items:start;margin:2px 0}.lab{font-weight:700;line-height:1.08}.field{border:1px solid #333;min-height:17px;padding:2px 4px;background:#fff;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.08}.field.large{min-height:38px;max-height:38px;overflow:hidden}.field.dense{font-size:7.5px;line-height:1.02}.field.comments{min-height:58px;max-height:58px;overflow:hidden}.field.comments.ultra-dense{font-size:6.6px;line-height:1}.field.line{min-height:17px;margin-top:-1px}.datebox{display:inline-block;min-width:30mm}.advice{margin:3px 0}.checkrow{display:flex;align-items:flex-start;gap:4px;margin:2px 0}.box{width:12px;height:12px;border:1px solid #222;display:inline-flex;align-items:center;justify-content:center;font-size:8px;font-weight:800;flex:0 0 12px}.adjust{border:1px solid #333;padding:4px;margin:3px 0}.adjust-title{font-weight:700;margin-bottom:2px}.adjust-grid{display:grid;grid-template-columns:1fr 1fr;gap:1px 12px}.period{display:grid;grid-template-columns:39mm 1fr;gap:2mm;margin-top:3px}.period-dates{display:grid;grid-template-columns:auto 1fr auto 1fr;gap:3px;align-items:center;margin-top:2px}.issuer{display:grid;grid-template-columns:34mm 1fr;gap:2px 5px;margin-top:3px}.issuer .field.large{min-height:34px;max-height:34px}.right-title{font-size:13px;font-weight:800;margin-bottom:5px}.right h3{font-size:10px;margin:4px 0 1px}.right p{margin:0 0 4px;line-height:1.16}.right .muted{font-size:8px;color:#333}.details-title{border-top:1px solid #111;margin-top:5px;padding-top:3px;font-size:10px;font-weight:800}.detail-row{display:grid;grid-template-columns:30mm 1fr;gap:4px;align-items:center;margin:2px 0}.dob-mobile{display:grid;grid-template-columns:30mm 28mm 12mm 1fr;gap:4px;align-items:center;margin:2px 0}.ni-boxes{display:flex;gap:2px}.ni-boxes span{width:16px;height:16px;border:1px solid #333}.todo{border-top:1px solid #111;margin-top:4px;padding-top:3px}.todo ul{margin:2px 0 0 12px;padding:0}.todo li{margin:1px 0;line-height:1.12}.bottom{position:relative;z-index:2;display:flex;justify-content:space-between;align-items:center;min-height:8mm;font-size:7.5px;border-top:1px solid #bbb;padding-top:1mm}.roleplay-badge{border:1.5px solid #111;padding:3px 9px;font-size:8px;line-height:1.05;font-weight:800;text-align:center;min-width:34mm}.no-links{font-size:7px;color:#444;margin-top:2px}@media print{html,body,.page{width:287mm!important;height:200mm!important;max-height:200mm!important;overflow:hidden!important}.page{break-inside:avoid!important;page-break-inside:avoid!important;break-after:avoid!important;page-break-after:avoid!important}}
  </style></head><body><div class="page"><div class="watermark">ROLEPLAY ONLY</div><div class="roleplay">ROLEPLAY / SIMULATION ONLY — NOT A REAL STATUTORY FIT NOTE</div><div class="cols">
  <section class="col left"><div class="heading">Statement of Fitness for Work</div><div class="subheading">For roleplay use only</div><div class="rule"></div>
    <div class="r"><div class="lab">Patient's name</div><div class="field">${esc(fullPatient)}</div></div>
    <div class="r"><div class="lab">I assessed your case on:</div><div class="field datebox">${esc(fmt(d.assessed_on))}</div></div>
    <div class="r"><div class="lab">and, because of the following condition(s):</div><div class="field large${conditionClass}">${esc(d.condition || '')}</div></div>
    <div class="advice"><div class="lab">I advise you that:</div><div class="checkrow"><span class="box">${checked(notFit)}</span><span>you are not fit for work.</span></div><div class="checkrow"><span class="box">${checked(mayFit)}</span><span>you may be fit for work taking account of the following advice:</span></div></div>
    <div class="adjust"><div class="adjust-title">If available, and with your employer's agreement, you may benefit from:</div><div class="adjust-grid">
      <div class="checkrow"><span class="box">${checked(opts.includes('Phased return to work'))}</span><span>phased return to work</span></div>
      <div class="checkrow"><span class="box">${checked(opts.includes('Amended duties'))}</span><span>amended duties</span></div>
      <div class="checkrow"><span class="box">${checked(opts.includes('Altered hours'))}</span><span>altered hours</span></div>
      <div class="checkrow"><span class="box">${checked(opts.includes('Workplace adaptations'))}</span><span>workplace adaptations</span></div>
    </div><div class="lab" style="margin-top:7px">Comments, including functional effects of your condition(s):</div><div class="field comments${commentsClass}">${esc(d.comments || '')}</div></div>
    <div class="period"><div class="lab">This will be the case for</div><div class="field">${periodDuration || '—'}</div></div>
    <div class="period-dates"><span class="lab">or from</span><div class="field">${esc(periodFrom)}</div><span class="lab">to</span><div class="field">${esc(periodTo)}</div></div>
    <div style="margin:7px 0"><span class="box">${checked(d.no_reassessment_required)}</span> <b>I will not need to assess your fitness for work again at the end of this period.</b></div>
    <div class="issuer"><div class="lab">Issuer's name</div><div>${esc(d.issuer_name || document?.author || '')}</div><div class="lab">Issuer's profession</div><div>${esc(d.issuer_profession || '')}</div><div class="lab">Date of statement</div><div class="field">${esc(fmt(d.statement_date || document?.date))}</div><div class="lab">Issuer's address</div><div class="field large">${esc(d.issuer_address || ORGANISATION.name)}</div></div>
  </section>
  <section class="col right"><div class="right-title">What your advice means</div><h3>‘You are not fit for work’</h3><p>This indicates, for the roleplay scenario, that the character may not be able to work for the period shown.</p><h3>‘You may be fit for work’</h3><p>This indicates that a return to work may be possible with support such as altered hours, amended duties, workplace adaptations or a phased return.</p><p class="muted">This roleplay document contains no external service links and has no real-world validity.</p>
    <div class="details-title">Your details <span style="font-weight:400">— Please use BLOCK CAPITALS</span></div>
    <div class="detail-row"><div class="lab">Surname</div><div class="field">${esc(surname)}</div></div>
    <div class="detail-row"><div class="lab">Other names</div><div class="field">${esc(otherNames)}</div></div>
    <div class="detail-row"><div class="lab">Address</div><div>${addressHtml}</div></div>
    <div class="dob-mobile"><div class="lab">Date of birth</div><div class="field">${esc(fmt(patient?.dob))}</div><div class="lab">Mobile</div><div class="field">${esc(patient?.mobile || patient?.phone || '')}</div></div>
    <div class="detail-row"><div class="lab">NI number</div><div class="ni-boxes">${'<span></span>'.repeat(9)}</div></div>
    <div class="todo"><div class="right-title" style="font-size:12px;margin-bottom:3px">What you need to do now</div><ul><li>Use this document only inside the RecordsWeb roleplay or simulation.</li><li>Do not present it to an employer, benefits service, healthcare provider or other real organisation.</li><li>For real sickness certification, use the appropriate official healthcare process.</li></ul></div>
    <div class="roleplay" style="margin-top:5px">NOT VALID FOR REAL-WORLD USE</div>
  </section></div><div class="bottom"><span>RecordsWeb roleplay document · ${esc(ORGANISATION.name)}</span><span class="roleplay-badge">ROLEPLAY ONLY · SIMULATION DOCUMENT</span></div></div></body></html>`
}

function fallbackPrint(html) {
  const frame = window.document.createElement('iframe')
  frame.style.position = 'fixed'
  frame.style.right = '0'
  frame.style.bottom = '0'
  frame.style.width = '1px'
  frame.style.height = '1px'
  frame.style.opacity = '0'
  frame.style.border = '0'
  frame.setAttribute('aria-hidden', 'true')
  window.document.body.appendChild(frame)
  const doc = frame.contentDocument
  doc.open()
  doc.write(`${html}<script>window.onload=()=>setTimeout(()=>window.print(),150)<\/script>`)
  doc.close()
  setTimeout(() => frame.remove(), 60000)
}
