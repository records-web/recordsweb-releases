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

async function sendDecisionMail(transporter, mailOptions, decision) {
  try {
    return await transporter.sendMail(mailOptions)
  } catch (firstError) {
    console.error(`RecordsWeb ${decision} email first attempt failed:`, firstError)
    // Retry once. The second attempt omits HTML so a provider/content filter
    // cannot prevent the applicant from receiving the plain-text decision.
    await wait(500)
    return transporter.sendMail({ ...mailOptions, html: undefined })
  }
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

function approvedMessage({ name, communityName, orgType, contactEmail, supportEmail, providerComments }) {
  return {
    subject: `RecordsWeb deployment request approved — ${communityName}`,
    text: [
      `Hello ${name},`,
      '',
      `We’re pleased to confirm that the RecordsWeb deployment request for ${communityName} has been approved.`,
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
      eyebrow: 'Deployment Request Decision',
      heading: 'Request approved',
      name,
      communityName,
      supportEmail,
      accent: '#1b9a59',
      bodyHtml: `
        <p>We’re pleased to confirm that the RecordsWeb deployment request for <strong>${escapeHtml(communityName)}</strong> has been <strong style="color:#18794e">approved</strong>.</p>
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

function declinedMessage({ name, communityName, orgType, supportEmail, providerComments }) {
  return {
    subject: `RecordsWeb deployment request declined — ${communityName}`,
    text: [
      `Hello ${name},`,
      '',
      `Thank you for your interest in RecordsWeb and for submitting a deployment request for ${communityName}.`,
      '',
      'Following review, we’re unable to approve this deployment request at this time.',
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
      eyebrow: 'Deployment Request Decision',
      heading: 'Request declined',
      name,
      communityName,
      supportEmail,
      accent: '#c84848',
      bodyHtml: `
        <p>Thank you for your interest in RecordsWeb and for submitting a deployment request for <strong>${escapeHtml(communityName)}</strong>.</p>
        <p>Following review, we’re unable to approve this deployment request at this time.</p>
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

    if (!UUID_PATTERN.test(requestId)) {
      return res.status(400).json({ error: 'A valid RecordsWeb request reference is required.' })
    }
    if (!['approved', 'declined'].includes(decision)) {
      return res.status(400).json({ error: 'Decision must be approved or declined.' })
    }

    const admin = serverSupabase()
    const { data: requestRow, error: requestError } = await admin
      .from('recordsweb_access_requests')
      .select('id,community_name,requested_mode,contact_name,contact_email,status,provider_comments,approved_email_sent_at,declined_email_sent_at')
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
    if (requestRow[markerField]) {
      return res.status(200).json({ ok: true, alreadySent: true, sentAt: requestRow[markerField] })
    }

    const { transporter, smtpUser, supportEmail } = createRequestMailer()

    const messageInput = {
      name: clean(requestRow.contact_name, 120),
      communityName: clean(requestRow.community_name, 120),
      orgType: organisationType(requestRow.requested_mode),
      contactEmail: clean(requestRow.contact_email, 254),
      supportEmail,
      providerComments: clean(requestRow.provider_comments, 3000),
    }

    const message = decision === 'approved'
      ? approvedMessage(messageInput)
      : declinedMessage(messageInput)

    const delivery = await sendDecisionMail(transporter, {
      from: `RecordsWeb <${smtpUser}>`,
      to: messageInput.contactEmail,
      replyTo: supportEmail,
      subject: message.subject,
      text: message.text,
      html: message.html,
    }, decision)

    const sentAt = new Date().toISOString()
    const { error: markerError } = await admin
      .from('recordsweb_access_requests')
      .update({ [markerField]: sentAt })
      .eq('id', requestId)
      .eq('status', decision)

    if (markerError) {
      console.error(`RecordsWeb ${decision} email marker failed:`, markerError)
    }

    return res.status(200).json({ ok: true, decision, sentAt, messageId: delivery?.messageId || null })
  } catch (error) {
    console.error('RecordsWeb deployment request outcome email error:', error)
    return res.status(500).json({
      error: 'The request decision was saved, but the automatic decision email could not be sent.',
    })
  }
}
