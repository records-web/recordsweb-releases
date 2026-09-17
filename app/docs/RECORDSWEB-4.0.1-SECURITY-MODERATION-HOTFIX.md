# RecordsWeb 4.0.1 — Security & Moderation hotfix

This hotfix corrects two issues in the RecordsWeb 4.0.0 Security & Moderation panel:

1. Platform-operator authorisation inside `recordsweb-security` now uses the same authorised operator identity rules as Platform Management. The previous service-role RPC check could incorrectly return `false` because it had no end-user `auth.uid()` context.
2. The Security & Moderation forms, support-access panel and moderation history now render correctly in RecordsWeb dark mode instead of using light/white panels with low-contrast text.

After updating the source, redeploy the `recordsweb-security` Edge Function:

```powershell
supabase functions deploy recordsweb-security --no-verify-jwt --project-ref cdakocrmfstsknbgugkc
```

No new SQL migration is required for 4.0.1.
