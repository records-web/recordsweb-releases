import nodemailer from 'nodemailer'

const MAX_NAME = 120
const MAX_EMAIL = 254
const MAX_SUBJECT = 160
const MAX_MESSAGE = 5000

function text(value, max) {
  return String(value ?? '').trim().slice(0, max)
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= MAX_EMAIL
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed.' })
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})

    // Honeypot. Real visitors never fill this field.
    if (text(body.website, 200)) {
      return res.status(200).json({ ok: true })
    }

    const name = text(body.name, MAX_NAME)
    const email = text(body.email, MAX_EMAIL)
    const subject = text(body.subject, MAX_SUBJECT)
    const category = text(body.category, 80) || 'General enquiry'
    const message = text(body.message, MAX_MESSAGE)

    if (!name) return res.status(400).json({ error: 'Your name is required.' })
    if (!validEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' })
    if (!subject) return res.status(400).json({ error: 'A subject is required.' })
    if (!message) return res.status(400).json({ error: 'A message is required.' })

    const smtpUser = process.env.IONOS_SMTP_USER
    const smtpPassword = process.env.IONOS_SMTP_PASSWORD
    const recipient = process.env.CONTACT_TO || 'contactus@recordsweb.org'

    if (!smtpUser || !smtpPassword) {
      console.error('Contact form SMTP environment variables are not configured.')
      return res.status(500).json({ error: 'The contact service is not configured yet.' })
    }

    const transporter = nodemailer.createTransport({
      host: 'smtp.ionos.co.uk',
      port: 465,
      secure: true,
      auth: {
        user: smtpUser,
        pass: smtpPassword,
      },
    })

    const submittedAt = new Date().toISOString()
    const safeName = escapeHtml(name)
    const safeEmail = escapeHtml(email)
    const safeSubject = escapeHtml(subject)
    const safeCategory = escapeHtml(category)
    const safeMessage = escapeHtml(message).replaceAll('\n', '<br>')

    await transporter.sendMail({
      from: `RecordsWeb Contact <${smtpUser}>`,
      to: recipient,
      replyTo: `${name} <${email}>`,
      subject: `[RecordsWeb Contact] ${subject}`,
      text: [
        'New RecordsWeb contact form submission',
        '',
        `Name: ${name}`,
        `Email: ${email}`,
        `Category: ${category}`,
        `Subject: ${subject}`,
        `Submitted: ${submittedAt}`,
        '',
        'Message:',
        message,
      ].join('\n'),
      html: `
        <div style="font-family:Arial,sans-serif;color:#17384d;line-height:1.5">
          <h2 style="margin:0 0 16px;color:#0f6fbd">New RecordsWeb contact form submission</h2>
          <table style="border-collapse:collapse;width:100%;max-width:680px">
            <tr><td style="padding:6px 10px;font-weight:700;border-bottom:1px solid #d9e6ee">Name</td><td style="padding:6px 10px;border-bottom:1px solid #d9e6ee">${safeName}</td></tr>
            <tr><td style="padding:6px 10px;font-weight:700;border-bottom:1px solid #d9e6ee">Email</td><td style="padding:6px 10px;border-bottom:1px solid #d9e6ee"><a href="mailto:${safeEmail}">${safeEmail}</a></td></tr>
            <tr><td style="padding:6px 10px;font-weight:700;border-bottom:1px solid #d9e6ee">Category</td><td style="padding:6px 10px;border-bottom:1px solid #d9e6ee">${safeCategory}</td></tr>
            <tr><td style="padding:6px 10px;font-weight:700;border-bottom:1px solid #d9e6ee">Subject</td><td style="padding:6px 10px;border-bottom:1px solid #d9e6ee">${safeSubject}</td></tr>
          </table>
          <div style="margin-top:18px;padding:14px;border:1px solid #c5d9e5;background:#f6fbfe;max-width:650px">${safeMessage}</div>
          <p style="margin-top:16px;color:#6b8190;font-size:12px">Submitted ${escapeHtml(submittedAt)}. Use Reply to respond directly to ${safeName}.</p>
        </div>
      `,
    })

    return res.status(200).json({ ok: true })
  } catch (error) {
    console.error('RecordsWeb contact form error:', error)
    return res.status(500).json({ error: 'Unable to send your message right now. Please try again later.' })
  }
}
