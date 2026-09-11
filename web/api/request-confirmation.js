import { createRequestMailer } from '../server/requestMailer.js'
import { createClient } from '@supabase/supabase-js'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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

function requiredEnv(name, fallback = '') {
  const value = clean(process.env[name] || fallback, 2000)
  if (!value) throw new Error(`Server configuration error: ${name} is unavailable.`)
  return value
}

function serverSupabase() {
  const url = requiredEnv('SUPABASE_URL', process.env.VITE_SUPABASE_URL)
  const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed.' })
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const requestId = clean(body.requestId, 64)

    if (!UUID_PATTERN.test(requestId)) {
      return res.status(400).json({ error: 'A valid RecordsWeb request reference is required.' })
    }

    const admin = serverSupabase()
    const { data: requestRow, error: requestError } = await admin
      .from('recordsweb_access_requests')
      .select('id,community_name,requested_mode,discord_url,roblox_group_url,member_range,contact_name,contact_email,discord_username,created_at,confirmation_email_sent_at')
      .eq('id', requestId)
      .maybeSingle()

    if (requestError) throw new Error(requestError.message)
    if (!requestRow) return res.status(404).json({ error: 'RecordsWeb deployment request was not found.' })

    // Idempotent: reloading/retrying the browser must not send duplicate mail.
    if (requestRow.confirmation_email_sent_at) {
      return res.status(200).json({ ok: true, alreadySent: true })
    }

    const { transporter, smtpUser, supportEmail } = createRequestMailer()

    const name = clean(requestRow.contact_name, 120)
    const communityName = clean(requestRow.community_name, 120)
    const orgType = organisationType(requestRow.requested_mode)
    const discordUrl = clean(requestRow.discord_url, 500)
    const contactEmail = clean(requestRow.contact_email, 254)
    const discordUsername = clean(requestRow.discord_username, 80) || 'Not provided'

    const safeName = escapeHtml(name)
    const safeCommunityName = escapeHtml(communityName)
    const safeOrgType = escapeHtml(orgType)
    const safeDiscordUrl = escapeHtml(discordUrl)
    const safeContactEmail = escapeHtml(contactEmail)
    const safeDiscordUsername = escapeHtml(discordUsername)
    const safeSupportEmail = escapeHtml(supportEmail)

    await transporter.sendMail({
      from: `RecordsWeb <${smtpUser}>`,
      to: contactEmail,
      replyTo: supportEmail,
      subject: `RecordsWeb deployment request received — ${communityName}`,
      text: [
        `Hello ${name},`,
        '',
        `Thank you for submitting a request for a RecordsWeb deployment for ${communityName}.`,
        '',
        "We’re pleased to confirm that your request has been successfully received and has been added to our review queue.",
        '',
        'Our team will now review the information provided in your application, including your community details, organisation type, community size, Discord server, Roblox community, and the information included in your request. This review helps us ensure that RecordsWeb is set up appropriately for your community and that the required information has been provided.',
        '',
        'Your request details',
        '',
        `Community name: ${communityName}`,
        `Organisation type: ${orgType}`,
        `Discord server: ${discordUrl}`,
        `Contact email: ${contactEmail}`,
        `Discord username: ${discordUsername}`,
        '',
        'What happens next?',
        '',
        'Your request will be reviewed by the RecordsWeb team. Depending on the information provided, we may contact you if we need clarification or additional details before making a decision.',
        '',
        'If your request is approved, we’ll proceed with the necessary steps to provision your RecordsWeb environment and provide you with the relevant access or setup information.',
        '',
        'Please be aware that submitting this form does not guarantee approval or deployment. All requests are subject to review, and approval may depend on the suitability of the community and the information provided.',
        '',
        'The community logo submitted with your request is used only for request review and setup purposes. It does not replace or modify RecordsWeb branding.',
        '',
        'Please keep this email for your records',
        '',
        'You do not need to submit the request again unless a member of the RecordsWeb team specifically asks you to do so. If you need to provide additional information regarding your application, contact contactus@recordsweb.org and include your community name so we can locate your request quickly.',
        '',
        'We appreciate your interest in RecordsWeb and thank you for taking the time to complete the deployment request.',
        '',
        'Kind Regards',
        '',
        'RecordsWeb Support Team',
        'Clinical Systems & Digital Services',
        '',
        'RecordsWeb',
        'Email: contactus@recordsweb.org',
        'Web: RecordsWeb.org | Digital Clinical Services',
        '',
        '------------------------------------------------------------',
        '',
        'CONFIDENTIALITY & DISCLAIMER',
        '',
        'This email and any attachments are intended solely for the named recipient and may contain confidential, sensitive or privileged information. If you are not the intended recipient, please notify the sender immediately and delete this email and any attachments. You must not copy, disclose, distribute or otherwise use the information contained within this message.',
        '',
        'RecordsWeb accepts no responsibility for any unauthorised access, alteration, disclosure or use of this communication after transmission. While reasonable precautions are taken, recipients should ensure that this email and any attachments are free from viruses or other malicious content.',
        '',
        'Where this communication contains patient or clinical information, it must be handled in accordance with applicable confidentiality, information governance and data protection requirements. Patient-identifiable information must only be accessed, used or shared where there is a legitimate professional need and appropriate authorisation.',
        '',
        'RecordsWeb is a fictional/demonstration clinical records system and is not an NHS service unless otherwise stated.',
      ].join('\n'),
      html: `
        <div style="margin:0;padding:32px 16px;background:#eef6fb;font-family:Arial,Helvetica,sans-serif;color:#17384d;line-height:1.6">
          <div style="max-width:720px;margin:0 auto;background:#ffffff;border:1px solid #c8dce8">
            <div style="padding:24px 28px;background:#102d3d;border-bottom:4px solid #0f8fe8">
              <div style="font-size:24px;font-weight:700;color:#ffffff">RecordsWeb</div>
              <div style="margin-top:4px;color:#91c9ea;font-size:11px;letter-spacing:1.4px;text-transform:uppercase">Deployment Request</div>
            </div>
            <div style="padding:30px 28px">
              <h1 style="margin:0 0 20px;color:#123d58;font-size:22px">Request received</h1>
              <p>Hello ${safeName},</p>
              <p>Thank you for submitting a request for a RecordsWeb deployment for <strong>${safeCommunityName}</strong>.</p>
              <p>We’re pleased to confirm that your request has been successfully received and has been added to our review queue.</p>
              <p>Our team will now review the information provided in your application, including your community details, organisation type, community size, Discord server, Roblox community, and the information included in your request. This review helps us ensure that RecordsWeb is set up appropriately for your community and that the required information has been provided.</p>

              <div style="margin:26px 0;border:1px solid #c9dce8;background:#f6fbfe">
                <div style="padding:12px 16px;background:#e8f4fb;color:#0f6fbd;font-weight:700;text-transform:uppercase;font-size:12px;letter-spacing:.8px">Your request details</div>
                <table style="width:100%;border-collapse:collapse;font-size:14px">
                  <tr><td style="padding:10px 16px;font-weight:700;border-bottom:1px solid #dbe7ee;width:180px">Community name</td><td style="padding:10px 16px;border-bottom:1px solid #dbe7ee">${safeCommunityName}</td></tr>
                  <tr><td style="padding:10px 16px;font-weight:700;border-bottom:1px solid #dbe7ee">Organisation type</td><td style="padding:10px 16px;border-bottom:1px solid #dbe7ee">${safeOrgType}</td></tr>
                  <tr><td style="padding:10px 16px;font-weight:700;border-bottom:1px solid #dbe7ee">Discord server</td><td style="padding:10px 16px;border-bottom:1px solid #dbe7ee"><a href="${safeDiscordUrl}" style="color:#0f6fbd">${safeDiscordUrl}</a></td></tr>
                  <tr><td style="padding:10px 16px;font-weight:700;border-bottom:1px solid #dbe7ee">Contact email</td><td style="padding:10px 16px;border-bottom:1px solid #dbe7ee">${safeContactEmail}</td></tr>
                  <tr><td style="padding:10px 16px;font-weight:700">Discord username</td><td style="padding:10px 16px">${safeDiscordUsername}</td></tr>
                </table>
              </div>

              <h2 style="margin-top:26px;color:#123d58;font-size:17px">What happens next?</h2>
              <p>Your request will be reviewed by the RecordsWeb team. Depending on the information provided, we may contact you if we need clarification or additional details before making a decision.</p>
              <p>If your request is approved, we’ll proceed with the necessary steps to provision your RecordsWeb environment and provide you with the relevant access or setup information.</p>
              <div style="margin:22px 0;padding:14px 16px;border-left:4px solid #e3a008;background:#fff9e8">Submitting this form does not guarantee approval or deployment. All requests are subject to review, and approval may depend on the suitability of the community and the information provided.</div>
              <p>The community logo submitted with your request is used only for request review and setup purposes. It does not replace or modify RecordsWeb branding.</p>

              <h2 style="margin-top:26px;color:#123d58;font-size:17px">Please keep this email for your records</h2>
              <p>You do not need to submit the request again unless a member of the RecordsWeb team specifically asks you to do so.</p>
              <p>If you need to provide additional information regarding your application, contact <a href="mailto:${safeSupportEmail}" style="color:#0f6fbd">${safeSupportEmail}</a> and include your community name so we can locate your request quickly.</p>
              <p>We appreciate your interest in RecordsWeb and thank you for taking the time to complete the deployment request.</p>

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
                <p>Where this communication contains patient or clinical information, it must be handled in accordance with applicable confidentiality, information governance and data protection requirements. Patient-identifiable information must only be accessed, used or shared where there is a legitimate professional need and appropriate authorisation.</p>
                <p style="font-weight:700;color:#17384d;margin-bottom:0">RecordsWeb is a fictional/demonstration clinical records system and is not an NHS service unless otherwise stated.</p>
              </div>
            </div>
          </div>
        </div>
      `,
    })

    const sentAt = new Date().toISOString()
    const { error: updateError } = await admin
      .from('recordsweb_access_requests')
      .update({ confirmation_email_sent_at: sentAt })
      .eq('id', requestId)

    if (updateError) {
      // The email is already sent. Do not send it again just because the marker
      // failed to persist; log this for platform operators to inspect.
      console.error('RecordsWeb request confirmation marker failed:', updateError)
    }

    return res.status(200).json({ ok: true, sentAt })
  } catch (error) {
    console.error('RecordsWeb deployment request confirmation error:', error)
    return res.status(500).json({ error: 'The deployment request was saved, but the confirmation email could not be sent.' })
  }
}
