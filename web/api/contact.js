import nodemailer from "nodemailer";

const MAX_NAME = 120;
const MAX_EMAIL = 254;
const MAX_SUBJECT = 160;
const MAX_MESSAGE = 5000;

function text(value, max) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= MAX_EMAIL;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");

    return res.status(405).json({
      error: "Method not allowed.",
    });
  }

  try {
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : req.body || {};

    // Honeypot. Real visitors should never fill this field.
    if (text(body.website, 200)) {
      return res.status(200).json({ ok: true });
    }

    const name = text(body.name, MAX_NAME);
    const email = text(body.email, MAX_EMAIL);
    const subject = text(body.subject, MAX_SUBJECT);
    const category = text(body.category, 80) || "General enquiry";
    const message = text(body.message, MAX_MESSAGE);

    if (!name) {
      return res.status(400).json({
        error: "Your name is required.",
      });
    }

    if (!validEmail(email)) {
      return res.status(400).json({
        error: "Enter a valid email address.",
      });
    }

    if (!subject) {
      return res.status(400).json({
        error: "A subject is required.",
      });
    }

    if (!message) {
      return res.status(400).json({
        error: "A message is required.",
      });
    }

    /*
      Contact-form SMTP account. This is intentionally separate from
      the deployment-request confirmation mailer.

      Preferred configuration:

      IONOS_CONTACT_SMTP_USER=contactus@recordsweb.org
      IONOS_CONTACT_SMTP_PASSWORD=your-contact-mailbox-password
      CONTACT_TO=contactus@recordsweb.org

      The older IONOS_SMTP_USER / IONOS_SMTP_PASSWORD names remain as
      fallbacks so existing RecordsWeb deployments do not suddenly break.
    */

    const smtpUser =
      process.env.IONOS_CONTACT_SMTP_USER ||
      process.env.IONOS_SMTP_USER ||
      "contactus@recordsweb.org";

    const smtpPassword =
      process.env.IONOS_CONTACT_SMTP_PASSWORD ||
      process.env.IONOS_SMTP_PASSWORD;

    const recipient = process.env.CONTACT_TO || "contactus@recordsweb.org";

    if (!smtpPassword) {
      console.error(
        "RecordsWeb contact-form SMTP environment variables are not configured.",
      );

      return res.status(500).json({
        error: "The contact service is not configured yet.",
      });
    }

    const transporter = nodemailer.createTransport({
      host: "smtp.ionos.co.uk",
      port: 465,
      secure: true,

      auth: {
        user: smtpUser,
        pass: smtpPassword,
      },
    });

    const submittedAt = new Date().toISOString();

    const safeName = escapeHtml(name);
    const safeEmail = escapeHtml(email);
    const safeSubject = escapeHtml(subject);
    const safeCategory = escapeHtml(category);
    const safeMessage = escapeHtml(message).replaceAll("\n", "<br>");

    /*
     * ------------------------------------------------------------
     * 1. SEND CONTACT FORM TO RECORDSWEB
     * ------------------------------------------------------------
     */

    await transporter.sendMail({
      from: `RecordsWeb Contact <${smtpUser}>`,

      to: recipient,

      // Pressing Reply on this email replies directly to the visitor.
      replyTo: `${name} <${email}>`,

      subject: `[RecordsWeb Contact] ${subject}`,

      text: [
        "New RecordsWeb contact form submission",
        "",
        `Name: ${name}`,
        `Email: ${email}`,
        `Category: ${category}`,
        `Subject: ${subject}`,
        `Submitted: ${submittedAt}`,
        "",
        "Message:",
        message,
      ].join("\n"),

      html: `
        <div style="
          font-family:Arial,Helvetica,sans-serif;
          color:#17384d;
          line-height:1.5;
        ">

          <h2 style="
            margin:0 0 16px;
            color:#0f6fbd;
          ">
            New RecordsWeb contact form submission
          </h2>

          <table style="
            border-collapse:collapse;
            width:100%;
            max-width:680px;
          ">

            <tr>
              <td style="
                padding:6px 10px;
                font-weight:700;
                border-bottom:1px solid #d9e6ee;
              ">
                Name
              </td>

              <td style="
                padding:6px 10px;
                border-bottom:1px solid #d9e6ee;
              ">
                ${safeName}
              </td>
            </tr>

            <tr>
              <td style="
                padding:6px 10px;
                font-weight:700;
                border-bottom:1px solid #d9e6ee;
              ">
                Email
              </td>

              <td style="
                padding:6px 10px;
                border-bottom:1px solid #d9e6ee;
              ">
                <a href="mailto:${safeEmail}">
                  ${safeEmail}
                </a>
              </td>
            </tr>

            <tr>
              <td style="
                padding:6px 10px;
                font-weight:700;
                border-bottom:1px solid #d9e6ee;
              ">
                Category
              </td>

              <td style="
                padding:6px 10px;
                border-bottom:1px solid #d9e6ee;
              ">
                ${safeCategory}
              </td>
            </tr>

            <tr>
              <td style="
                padding:6px 10px;
                font-weight:700;
                border-bottom:1px solid #d9e6ee;
              ">
                Subject
              </td>

              <td style="
                padding:6px 10px;
                border-bottom:1px solid #d9e6ee;
              ">
                ${safeSubject}
              </td>
            </tr>

            <tr>
              <td style="
                padding:6px 10px;
                font-weight:700;
                border-bottom:1px solid #d9e6ee;
              ">
                Submitted
              </td>

              <td style="
                padding:6px 10px;
                border-bottom:1px solid #d9e6ee;
              ">
                ${escapeHtml(submittedAt)}
              </td>
            </tr>

          </table>

          <div style="
            margin-top:18px;
            padding:14px;
            border:1px solid #c5d9e5;
            background:#f6fbfe;
            max-width:650px;
          ">
            ${safeMessage}
          </div>

          <p style="
            margin-top:16px;
            color:#6b8190;
            font-size:12px;
          ">
            Submitted ${escapeHtml(submittedAt)}.
            Use Reply to respond directly to ${safeName}.
          </p>

        </div>
      `,
    });

    /*
     * ------------------------------------------------------------
     * 2. SEND AUTOMATIC CONFIRMATION TO THE VISITOR
     * ------------------------------------------------------------
     */

    try {
      await transporter.sendMail({
        from: `RecordsWeb <${smtpUser}>`,

        to: email,

        // If they reply to the automated confirmation, it goes
        // to the actual RecordsWeb contact mailbox.
        replyTo: "contactus@recordsweb.org",

        subject: `We've received your message — RecordsWeb`,

        text: [
          `Hi ${name},`,
          "",
          "Thanks for contacting RecordsWeb.",
          "",
          "We've received your message and a member of the RecordsWeb Support Team will respond as soon as possible.",
          "",
          "A copy of your submission is included below.",
          "",
          `Category: ${category}`,
          `Subject: ${subject}`,
          `Submitted: ${submittedAt}`,
          "",
          "Your message:",
          "",
          message,
          "",
          "",
          "Kind Regards",
          "",
          "RecordsWeb Support Team",
          "Clinical Systems & Digital Services",
          "",
          "",
          "RecordsWeb",
          "Email: contactus@recordsweb.org",
          "Web: RecordsWeb.org | Digital Clinical Services",
          "",
          "------------------------------------------------------------",
          "",
          "CONFIDENTIALITY & DISCLAIMER",
          "",
          "This email and any attachments are intended solely for the named recipient and may contain confidential, sensitive or privileged information. If you are not the intended recipient, please notify the sender immediately and delete this email and any attachments. You must not copy, disclose, distribute or otherwise use the information contained within this message.",
          "",
          "RecordsWeb accepts no responsibility for any unauthorised access, alteration, disclosure or use of this communication after transmission. While reasonable precautions are taken, recipients should ensure that this email and any attachments are free from viruses or other malicious content.",
          "",
          "Where this communication contains patient or clinical information, it must be handled in accordance with applicable confidentiality, information governance and data protection requirements. Patient-identifiable information must only be accessed, used or shared where there is a legitimate professional need and appropriate authorisation.",
          "",
          "RecordsWeb is a fictional/demonstration clinical records system and is not an NHS service unless otherwise stated.",
        ].join("\n"),

        html: `
          <div style="
            font-family:Arial,Helvetica,sans-serif;
            color:#17384d;
            line-height:1.6;
            max-width:680px;
            margin:0 auto;
          ">

            <h2 style="
              margin:0 0 18px;
              color:#0f6fbd;
              font-size:24px;
            ">
              We've received your message
            </h2>

            <p>
              Hi ${safeName},
            </p>

            <p>
              Thanks for contacting RecordsWeb.
            </p>

            <p>
              We've received your message and a member of the
              RecordsWeb Support Team will respond as soon as possible.
            </p>

            <p>
              A copy of your submission is included below.
            </p>

            <table style="
              border-collapse:collapse;
              width:100%;
              margin-top:20px;
              margin-bottom:20px;
            ">

              <tr>
                <td style="
                  padding:8px 10px;
                  font-weight:700;
                  border-bottom:1px solid #d9e6ee;
                  width:120px;
                ">
                  Category
                </td>

                <td style="
                  padding:8px 10px;
                  border-bottom:1px solid #d9e6ee;
                ">
                  ${safeCategory}
                </td>
              </tr>

              <tr>
                <td style="
                  padding:8px 10px;
                  font-weight:700;
                  border-bottom:1px solid #d9e6ee;
                ">
                  Subject
                </td>

                <td style="
                  padding:8px 10px;
                  border-bottom:1px solid #d9e6ee;
                ">
                  ${safeSubject}
                </td>
              </tr>

              <tr>
                <td style="
                  padding:8px 10px;
                  font-weight:700;
                  border-bottom:1px solid #d9e6ee;
                ">
                  Submitted
                </td>

                <td style="
                  padding:8px 10px;
                  border-bottom:1px solid #d9e6ee;
                ">
                  ${escapeHtml(submittedAt)}
                </td>
              </tr>

            </table>

            <p style="
              font-weight:700;
              margin:20px 0 8px;
            ">
              Your message:
            </p>

            <div style="
              padding:14px;
              border:1px solid #c5d9e5;
              background:#f6fbfe;
              border-radius:6px;
              margin-bottom:28px;
              overflow-wrap:anywhere;
            ">
              ${safeMessage}
            </div>

            <p style="margin-bottom:0;">
              <strong>Kind Regards</strong>
            </p>

            <p style="margin-top:8px;">
              <strong>RecordsWeb Support Team</strong><br>
              Clinical Systems &amp; Digital Services
            </p>

            <p style="margin-top:22px;">
              <strong>RecordsWeb</strong><br>

              📧
              <a
                href="mailto:contactus@recordsweb.org"
                style="
                  color:#0f6fbd;
                  text-decoration:none;
                "
              >
                contactus@recordsweb.org
              </a>

              <br>

              🌐
              <a
                href="https://recordsweb.org"
                style="
                  color:#0f6fbd;
                  text-decoration:none;
                "
              >
                RecordsWeb.org
              </a>
              | Digital Clinical Services
            </p>

            <hr style="
              border:0;
              border-top:1px solid #d9e6ee;
              margin:28px 0 22px;
            ">

            <div style="
              color:#5d707d;
              font-size:12px;
              line-height:1.55;
            ">

              <p style="
                font-weight:700;
                color:#17384d;
                margin-bottom:12px;
              ">
                CONFIDENTIALITY &amp; DISCLAIMER
              </p>

              <p>
                This email and any attachments are intended solely for the
                named recipient and may contain confidential, sensitive or
                privileged information. If you are not the intended recipient,
                please notify the sender immediately and delete this email and
                any attachments. You must not copy, disclose, distribute or
                otherwise use the information contained within this message.
              </p>

              <p>
                RecordsWeb accepts no responsibility for any unauthorised
                access, alteration, disclosure or use of this communication
                after transmission. While reasonable precautions are taken,
                recipients should ensure that this email and any attachments
                are free from viruses or other malicious content.
              </p>

              <p>
                Where this communication contains patient or clinical
                information, it must be handled in accordance with applicable
                confidentiality, information governance and data protection
                requirements. Patient-identifiable information must only be
                accessed, used or shared where there is a legitimate
                professional need and appropriate authorisation.
              </p>

              <p style="
                font-weight:700;
                color:#17384d;
                margin-bottom:0;
              ">
                RecordsWeb is a fictional/demonstration clinical records
                system and is not an NHS service unless otherwise stated.
              </p>

            </div>

          </div>
        `,
      });
    } catch (confirmationError) {
      /*
       * The original contact message has already reached RecordsWeb.
       *
       * Don't return an error to the visitor here because they could
       * submit the form again and create duplicate support requests.
       */
      console.error("RecordsWeb confirmation email failed:", confirmationError);
    }

    return res.status(200).json({
      ok: true,
    });
  } catch (error) {
    console.error("RecordsWeb contact form error:", error);

    return res.status(500).json({
      error: "Unable to send your message right now. Please try again later.",
    });
  }
}
