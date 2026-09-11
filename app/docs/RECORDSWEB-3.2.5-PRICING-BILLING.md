# RecordsWeb 3.2.5 — Pricing & Billing

## Website
- Added a public `/pricing` page.
- Standard plan: £9.50/month.
- New organisation offer: £5 first month, including the normal £7 setup fee.
- Optional in-game announcement board integration: £10 one-off.
- Added Pricing links to the public site and confirmation wording on the contact form.

## Organisation Management
- Added a Subscription & billing tab for management users on both Web and Electron.
- Shows assigned plan, billing status, billing dates, introductory offer and optional announcement-board integration.

## Platform Management
- Added a Billing section for operator accounts.
- Operator can maintain status, monthly price, first-month offer, setup fee, dates, announcement-board state/fee and billing notes.
- Billing state is informational/manual: no card is charged and no organisation is automatically disabled by this feature.

## Supabase
Run `supabase/recordsweb-3.2.5-pricing-billing.sql`, then redeploy `recordsweb-platform-admin`.
