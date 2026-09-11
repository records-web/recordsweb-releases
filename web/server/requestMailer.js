import nodemailer from 'nodemailer'

function clean(value, max = 500) {
  return String(value ?? '').trim().slice(0, max)
}

function required(value, name) {
  const cleaned = clean(value, 4000)
  if (!cleaned) throw new Error(`Server configuration error: ${name} is unavailable.`)
  return cleaned
}

// Shared deployment-request mailer. Both the initial request confirmation and
// the approval/decline decision emails use this one noreply SMTP account.
export function createRequestMailer() {
  const smtpUser = clean(process.env.IONOS_NOREPLY_SMTP_USER || 'noreply@recordsweb.org', 254)
  const smtpPassword = required(
    process.env.IONOS_NOREPLY_SMTP_PASSWORD || process.env.IONOS_SMTP_PASSWORD,
    'IONOS_NOREPLY_SMTP_PASSWORD',
  )
  const supportEmail = clean(process.env.RECORDSWEB_SUPPORT_EMAIL || 'contactus@recordsweb.org', 254)
  const host = clean(process.env.IONOS_NOREPLY_SMTP_HOST || 'smtp.ionos.co.uk', 254)
  const port = Number(process.env.IONOS_NOREPLY_SMTP_PORT || 465)

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user: smtpUser,
      pass: smtpPassword,
    },
  })

  return {
    transporter,
    smtpUser,
    supportEmail,
  }
}
