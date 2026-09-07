# RecordsWeb 3.2.1 — Public homepage and Request access

The website root (`#/`) is now public when no staff session is active. It explains RecordsWeb, its core workflow, multi-organisation extensions and deployment modes. Staff use **Staff sign in** to enter the existing organisation-selection/login flow.

## Request access

The form collects:

- community name
- requested mode (General Practitioner or Hospital)
- Discord URL
- Roblox group link
- member range (10+, 100+, 1,000+, 10,000+)
- community logo (PNG/JPEG/WebP, maximum 4 MB)
- contact name and email
- optional Discord username
- additional information
- confirmation that the requester is authorised

Run `supabase/recordsweb-3.2.1-public-access-requests.sql` after the existing multi-organisation migration. Requests are stored in `public.recordsweb_access_requests`. Logos are uploaded to the private `recordsweb-access-request-logos` Storage bucket. No anonymous read policy is created.

The public form submits through the `recordsweb_submit_access_request` security-definer RPC so anonymous users do not receive direct table read/update permissions.
