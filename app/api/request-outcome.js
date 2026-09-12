import { createRequestMailer } from '../server/requestMailer.js'
import { createClient } from '@supabase/supabase-js'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const VALID_DECISIONS = new Set(['approved', 'declined', 'denied'])

function clean(value, max = 500) {
  return String(value ?? '').trim().slice(0, max)
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function organisationType(mode) {
  if (mode === 'hospital') return 'Secondary Care (Hospital)'
  if (mode === 'ambulance') return 'Ambulance / PHEM'
  return 'Primary Care (GP)'
}

function normaliseDecision(value) {
  const decision = clean(value, 32).toLowerCase()
  return decision === 'denied' ? 'declined' : decision
}

function commentsText(value) {
  const comments = clean(value, 3000)
  return comments ? ['Comments from the provider', '', comments, ''].join('\n') : ''
}

function commentsHtml(value) {
  const comments = clean(value, 3000)
  if (!comments) return ''
  const html = escapeHtml(comments).replace(/\r?\n/g, '<br>')
  return `
    <div style="margin:22px 0;border:1px solid #bfd8e6;background:#f7fcff">
      <div style="padding:10px 14px;background:#e8f4fb;color:#0f6fbd;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.6px">Comments from the provider</div>
      <div style="padding:14px 16px;color:#294657">${html}</div>
    </div>
  `
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function sendDecisionMail(mailOptions, decision) {
  let firstError = null

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const { transporter } = createRequestMailer()
    const options = attempt === 1
      ? mailOptions
      : { ...mailOptions, html: undefined }

    try {
      return await transporter.sendMail(options)
    } catch (error) {
      if (!firstError) firstError = error
      console.error(`RecordsWeb ${decision} email attempt ${attempt} failed:`, error)
      if (attempt < 2) await wait(750)
    }
  }

  throw firstError || new Error(`Unable to send the RecordsWeb ${decision} email.`)
}

function requiredEnv(name, fallback = '') {
  const value = clean(process.env[name] || fallback, 4000)
  if (!value) throw new Error(`Server configuration error: ${name} is unavailable.`)
  return value
}

function bearerToken(req) {
  const header = clean(req.headers?.authorization, 5000)
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || ''
}

function serverSupabase() {
  const url = requiredEnv('SUPABASE_URL', process.env.VITE_SUPABASE_URL)
  const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function verifyReviewer(req) {
  const token = bearerToken(req)
  if (!token) return false

  const url = requiredEnv('SUPABASE_URL', process.env.VITE_SUPABASE_URL)
  const anonKey = requiredEnv('SUPABASE_ANON_KEY', process.env.VITE_SUPABASE_ANON_KEY)

  const reviewerClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  })

  const { data: userData, error: userError } = await reviewerClient.auth.getUser(token)
  if (userError || !userData?.user) return false

  const { data, error } = await reviewerClient.rpc('recordsweb_is_access_request_reviewer')
  if (error) throw new Error(error.message || 'Unable to verify RecordsWeb reviewer access.')
  return data === true
}

function emailShell({ eyebrow, heading, name, communityName, bodyHtml, supportEmail, accent = '#0f8fe8' }) {
  const safeEyebrow = escapeHtml(eyebrow)
  const safeHeading = escapeHtml(heading)
  const safeName = escapeHtml(name)
  const safeCommunityName = escapeHtml(communityName)
  const safeSupportEmail = escapeHtml(supportEmail)

  return `
    <div style="margin:0;padding:32px 16px;background:#eef6fb;font-family:Arial,Helvetica,sans-serif;color:#17384d;line-height:1.6">
      <div style="max-width:720px;margin:0 auto;background:#ffffff;border:1px solid #c8dce8">
        <div style="padding:24px 28px;background:#102d3d;border-bottom:4px solid ${accent}">
          <div style="font-size:24px;font-weight:700;color:#ffffff">RecordsWeb</div>
          <div style="margin-top:4px;color:#91c9ea;font-size:11px;letter-spacing:1.4px;text-transform:uppercase">${safeEyebrow}</div>
        </div>
        <div style="padding:30px 28px">
          <h1 style="margin:0 0 20px;color:#123d58;font-size:22px">${safeHeading}</h1>
          <p>Hello ${safeName},</p>
          ${bodyHtml}

          <div style="margin:26px 0;border:1px solid #c9dce8;background:#f6fbfe">
            <div style="padding:12px 16px;background:#e8f4fb;color:#0f6fbd;font-weight:700;text-transform:uppercase;font-size:12px;letter-spacing:.8px">Request reference</div>
            <div style="padding:14px 16px"><strong>${safeCommunityName}</strong></div>
          </div>

          <h2 style="margin-top:26px;color:#123d58;font-size:17px">Need to contact us?</h2>
          <p>This mailbox is not monitored for replies. If you need to contact the RecordsWeb team about this decision, email <a href="mailto:${safeSupportEmail}" style="color:#0f6fbd">${safeSupportEmail}</a> and include your community name.</p>

          <div style="margin-top:32px;padding-top:22px;border-top:1px solid #d6e3eb">
            <strong>Kind Regards</strong><br><br>
            <strong>RecordsWeb Support Team</strong><br>
            Clinical Systems &amp; Digital Services<br><br>
            <strong>RecordsWeb</strong><br>
            📧 <a href="mailto:${safeSupportEmail}" style="color:#0f6fbd;text-decoration:none">${safeSupportEmail}</a><br>
            🌐 <a href="https://recordsweb.org" style="color:#0f6fbd;text-decoration:none">RecordsWeb.org</a> | Digital Clinical Services
          </div>

          <div style="margin-top:28px;padding-top:18px;border-top:1px solid #d6e3eb;color:#617985;font-size:11px;line-height:1.55">
            <p style="font-weight:700;color:#17384d;margin-bottom:12px">CONFIDENTIALITY &amp; DISCLAIMER</p>
            <p>This email and any attachments are intended solely for the named recipient and may contain confidential, sensitive or privileged information. If you are not the intended recipient, please notify the sender immediately and delete this email and any attachments. You must not copy, disclose, distribute or otherwise use the information contained within this message.</p>
            <p>RecordsWeb accepts no responsibility for any unauthorised access, alteration, disclosure or use of this communication after transmission. While reasonable precautions are taken, recipients should ensure that this email and any attachments are free from viruses or other malicious content.</p>
            <p style="font-weight:700;color:#17384d;margin-bottom:0">RecordsWeb is a fictional/demonstration clinical records system and is not an NHS service unless otherwise stated.</p>
          </div>
        </div>
      </div>
    </div>
  `
}

function approvedMessage({ name, communityName, orgType, contactEmail, supportEmail, providerComments, amended = false }) {
  return {
    subject: amended
      ? `RecordsWeb deployment request decision amended — ${communityName}`
      : `RecordsWeb deployment request approved — ${communityName}`,
    text: [
      `Hello ${name},`,
      '',
      amended
        ? `This is an amended decision for the RecordsWeb deployment request for ${communityName}. The request is now approved. This email replaces any previous approval or denial decision email for this request.`
        : `We’re pleased to confirm that the RecordsWeb deployment request for ${communityName} has been approved.`,
      '',
      `Approved organisation type: ${orgType}`,
      `Contact email: ${contactEmail}`,
      '',
      'What happens next?',
      '',
      'The RecordsWeb team will now proceed with the necessary provisioning and setup steps for your community. Approval of the request does not necessarily mean that the environment is already live; any remaining setup information, access details, or actions required from your community will be provided separately.',
      '',
      'You do not need to submit another deployment request for this community.',
      '',
      commentsText(providerComments),
      `If you need to provide additional information, contact ${supportEmail} and include your community name.`,
      '',
      'Kind Regards',
      '',
      'RecordsWeb Support Team',
      'Clinical Systems & Digital Services',
      '',
      'RecordsWeb',
      `Email: ${supportEmail}`,
      'Web: RecordsWeb.org | Digital Clinical Services',
      '',
      '------------------------------------------------------------',
      '',
      'CONFIDENTIALITY & DISCLAIMER',
      '',
      'This email and any attachments are intended solely for the named recipient and may contain confidential, sensitive or privileged information. If you are not the intended recipient, please notify the sender immediately and delete this email and any attachments.',
      '',
      'RecordsWeb is a fictional/demonstration clinical records system and is not an NHS service unless otherwise stated.',
    ].join('\n'),
    html: emailShell({
      eyebrow: amended ? 'Amended Deployment Request Decision' : 'Deployment Request Decision',
      heading: amended ? 'Decision amended — request approved' : 'Request approved',
      name,
      communityName,
      supportEmail,
      accent: '#1b9a59',
      bodyHtml: `
        ${amended ? '<div style="margin:0 0 22px;padding:14px 16px;border-left:4px solid #0f8fe8;background:#eef8ff"><strong>Amended decision:</strong> this email replaces any previous decision email sent for this request.</div>' : ''}
        <p>${amended ? 'The RecordsWeb deployment request for' : 'We’re pleased to confirm that the RecordsWeb deployment request for'} <strong>${escapeHtml(communityName)}</strong> ${amended ? 'is now' : 'has been'} <strong style="color:#18794e">approved</strong>.</p>
        <div style="margin:22px 0;padding:14px 16px;border-left:4px solid #1b9a59;background:#effaf3">
          <strong>Approved organisation type:</strong> ${escapeHtml(orgType)}
        </div>
        <h2 style="margin-top:26px;color:#123d58;font-size:17px">What happens next?</h2>
        <p>The RecordsWeb team will now proceed with the necessary provisioning and setup steps for your community.</p>
        <p>Approval of the request does not necessarily mean that the environment is already live. Any remaining setup information, access details, or actions required from your community will be provided separately.</p>
        <p>You do not need to submit another deployment request for this community.</p>
        ${commentsHtml(providerComments)}
      `,
    }),
  }
}

function declinedMessage({ name, communityName, orgType, supportEmail, providerComments, amended = false }) {
  return {
    // Keep the subject neutral enough to avoid over-aggressive mailbox filtering;
    // the message body clearly states that the request is denied.
    subject: amended
      ? `RecordsWeb deployment request decision amended — ${communityName}`
      : `RecordsWeb deployment request update — ${communityName}`,
    text: [
      `Hello ${name},`,
      '',
      `Thank you for your interest in RecordsWeb and for submitting a deployment request for ${communityName}.`,
      '',
      amended
        ? 'This is an amended decision. The request is now denied, and this email replaces any previous approval or denial decision email for this request.'
        : 'Following review, we’re unable to approve this deployment request at this time. The request has been denied.',
      '',
      `Requested organisation type: ${orgType}`,
      '',
      'No RecordsWeb environment will be provisioned from this request.',
      '',
      commentsText(providerComments),
      'Private reviewer notes are not included in automated decision emails. If you require clarification about the decision, contact the RecordsWeb team using the address below and include your community name so the request can be located.',
      '',
      'If your community circumstances or the information relevant to your request materially change, you may contact us before submitting another request.',
      '',
      `Support: ${supportEmail}`,
      '',
      'Kind Regards',
      '',
      'RecordsWeb Support Team',
      'Clinical Systems & Digital Services',
      '',
      'RecordsWeb',
      `Email: ${supportEmail}`,
      'Web: RecordsWeb.org | Digital Clinical Services',
      '',
      '------------------------------------------------------------',
      '',
      'CONFIDENTIALITY & DISCLAIMER',
      '',
      'This email and any attachments are intended solely for the named recipient and may contain confidential, sensitive or privileged information. If you are not the intended recipient, please notify the sender immediately and delete this email and any attachments.',
      '',
      'RecordsWeb is a fictional/demonstration clinical records system and is not an NHS service unless otherwise stated.',
    ].join('\n'),
    html: emailShell({
      eyebrow: amended ? 'Amended Deployment Request Decision' : 'Deployment Request Decision',
      heading: amended ? 'Decision amended — request denied' : 'Request denied',
      name,
      communityName,
      supportEmail,
      accent: '#c84848',
      bodyHtml: `
        ${amended ? '<div style="margin:0 0 22px;padding:14px 16px;border-left:4px solid #0f8fe8;background:#eef8ff"><strong>Amended decision:</strong> this email replaces any previous decision email sent for this request.</div>' : ''}
        <p>Thank you for your interest in RecordsWeb and for submitting a deployment request for <strong>${escapeHtml(communityName)}</strong>.</p>
        <p>${amended ? 'The decision on this request has changed. The request is now' : 'Following review, we’re unable to approve this deployment request at this time. The request has been'} <strong style="color:#a62b2b">denied</strong>.</p>
        <div style="margin:22px 0;padding:14px 16px;border-left:4px solid #c84848;background:#fff4f4">
          <strong>No RecordsWeb environment will be provisioned from this request.</strong>
        </div>
        <p><strong>Requested organisation type:</strong> ${escapeHtml(orgType)}</p>
        ${commentsHtml(providerComments)}
        <p>Private reviewer notes are not included in automated decision emails. If you require clarification about the decision, contact the RecordsWeb team and include your community name so the request can be located.</p>
        <p>If your community circumstances or the information relevant to your request materially change, you may contact us before submitting another request.</p>
      `,
    }),
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed.' })
  }

  try {
    if (!(await verifyReviewer(req))) {
      return res.status(403).json({ error: 'You are not authorised to send RecordsWeb request decisions.' })
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const requestId = clean(body.requestId, 64)
    const decision = normaliseDecision(body.decision)
    const force = body.force === true

    if (!UUID_PATTERN.test(requestId)) {
      return res.status(400).json({ error: 'A valid RecordsWeb request reference is required.' })
    }
    if (!['approved', 'declined'].includes(decision)) {
      return res.status(400).json({ error: 'Decision must be approved or declined.' })
    }

    const admin = serverSupabase()
    const { data: requestRow, error: requestError } = await admin
      .from('recordsweb_access_requests')
      .select('id,community_name,requested_mode,contact_name,contact_email,status,provider_comments,approved_email_sent_at,declined_email_sent_at,decision_revision,decision_email_revision,last_decision_email_status,last_decision_email_sent_at')
      .eq('id', requestId)
      .maybeSingle()

    if (requestError) throw new Error(requestError.message)
    if (!requestRow) return res.status(404).json({ error: 'RecordsWeb deployment request was not found.' })

    // Do not let this endpoint send an outcome that does not match the saved
    // platform-review decision.
    if (requestRow.status !== decision) {
      return res.status(409).json({ error: `The saved request status is ${requestRow.status}, not ${decision}.` })
    }

    const markerField = decision === 'approved' ? 'approved_email_sent_at' : 'declined_email_sent_at'
    const decisionRevision = Number(requestRow.decision_revision || 0)
    const emailRevision = Number(requestRow.decision_email_revision || 0)

    // Email delivery is tied to the decision revision, not to whether this
    // outcome has ever been emailed before. That allows Approved -> Denied ->
    // Approved changes to each send an amended decision email while still
    // preventing duplicate sends for the same saved decision.
    if (!force && decisionRevision > 0 && emailRevision >= decisionRevision && requestRow.last_decision_email_status === decision) {
      return res.status(200).json({
        ok: true,
        alreadySent: true,
        sentAt: requestRow.last_decision_email_sent_at || requestRow[markerField] || null,
        decisionRevision,
      })
    }

    const { smtpUser, supportEmail } = createRequestMailer()
    const amended = decisionRevision > 1 || (
      requestRow.last_decision_email_status
      && requestRow.last_decision_email_status !== decision
    )

    const messageInput = {
      name: clean(requestRow.contact_name, 120),
      communityName: clean(requestRow.community_name, 120),
      orgType: organisationType(requestRow.requested_mode),
      contactEmail: clean(requestRow.contact_email, 254),
      supportEmail,
      providerComments: clean(requestRow.provider_comments, 3000),
      amended,
    }

    const message = decision === 'approved'
      ? approvedMessage(messageInput)
      : declinedMessage(messageInput)

    const delivery = await sendDecisionMail({
      from: `RecordsWeb <${smtpUser}>`,
      to: messageInput.contactEmail,
      replyTo: supportEmail,
      subject: message.subject,
      text: message.text,
      html: message.html,
      headers: {
        'X-RecordsWeb-Message': 'deployment-request-decision',
        'X-RecordsWeb-Decision': decision === 'declined' ? 'denied' : 'approved',
        'X-RecordsWeb-Decision-Revision': String(decisionRevision),
      },
    }, decision)

    const sentAt = new Date().toISOString()
    const markerUpdate = {
      [markerField]: sentAt,
      decision_email_revision: decisionRevision,
      last_decision_email_status: decision,
      last_decision_email_sent_at: sentAt,
    }

    const { error: markerError } = await admin
      .from('recordsweb_access_requests')
      .update(markerUpdate)
      .eq('id', requestId)
      .eq('status', decision)
      .eq('decision_revision', decisionRevision)

    if (markerError) {
      console.error(`RecordsWeb ${decision} email marker failed:`, markerError)
    }

    return res.status(200).json({
      ok: true,
      decision,
      amended,
      sentAt,
      decisionRevision,
      messageId: delivery?.messageId || null,
      forcedResend: force,
    })
  } catch (error) {
    console.error('RecordsWeb deployment request outcome email error:', error)
    const detail = clean(error?.message, 500)
    return res.status(500).json({
      error: detail
        ? `The request decision was saved, but the automatic decision email could not be sent: ${detail}`
        : 'The request decision was saved, but the automatic decision email could not be sent.',
    })
  }
}
