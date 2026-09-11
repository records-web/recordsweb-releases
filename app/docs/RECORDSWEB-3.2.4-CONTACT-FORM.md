# RecordsWeb 3.2.4 - Contact Us form

The public website footer now includes a Contact Us button which opens `/contact`.

The form sends through the Vercel server-side function at `/api/contact` using the IONOS SMTP service.

## Required Vercel environment variables

- `IONOS_SMTP_USER` = `contactus@recordsweb.org`
- `IONOS_SMTP_PASSWORD` = the password for that IONOS mailbox
- `CONTACT_TO` = `contactus@recordsweb.org`

Set them for Production (and Preview if required), then redeploy the website.

The visitor's supplied email is set as `Reply-To`, not as the SMTP From address. This is intentional: IONOS requires the From address to be the authenticated/authorised mailbox. Clicking Reply in IONOS Webmail will still reply directly to the visitor.

SMTP configuration used:
- Host: smtp.ionos.co.uk
- Port: 465
- SSL/TLS: enabled
