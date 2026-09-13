const DEFAULT_API_URL = 'https://api.recordsweb.org'
const GITHUB_RELEASE_URL = 'https://github.com/records-web/recordsweb-releases/releases/latest'
const STRIPE_API_URL = 'https://api.stripe.com/v1/balance'
const TIMEOUT_MS = 6500

function json(res, body, status = 200) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')
  res.end(JSON.stringify(body))
}

async function timedFetch(url, options = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
  const started = Date.now()
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'RecordsWeb-Public-Status/1.0',
        ...(options.headers || {}),
      },
    })
    return { response, latencyMs: Date.now() - started }
  } finally {
    clearTimeout(timeout)
  }
}

function component(id, name, group, status, latencyMs = null, note = '') {
  return { id, name, group, status, latencyMs, note }
}

function normaliseSupabaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '')
}

async function checkWebsite() {
  return component('website', 'RecordsWeb Website', 'Platform', 'operational', null, 'Public web deployment is responding.')
}

async function checkRecordsWebApi() {
  try {
    const { response, latencyMs } = await timedFetch(process.env.RECORDSWEB_GAME_API_URL || process.env.VITE_RECORDSWEB_GAME_API_URL || DEFAULT_API_URL, {
      method: 'GET',
      redirect: 'manual',
    })

    if (response.status === 405 || response.status === 400 || response.status === 401 || response.status === 403 || response.ok) {
      return component('api', 'RecordsWeb API & Roblox Bridge', 'Integrations', 'operational', latencyMs, 'Public API gateway is responding.')
    }

    if (response.status >= 500) {
      return component('api', 'RecordsWeb API & Roblox Bridge', 'Integrations', 'outage', latencyMs, `API returned HTTP ${response.status}.`)
    }

    return component('api', 'RecordsWeb API & Roblox Bridge', 'Integrations', 'degraded', latencyMs, `Unexpected API response: HTTP ${response.status}.`)
  } catch (error) {
    return component('api', 'RecordsWeb API & Roblox Bridge', 'Integrations', 'outage', null, error?.name === 'AbortError' ? 'API check timed out.' : 'API gateway could not be reached.')
  }
}

async function checkSupabaseAuth(baseUrl, anonKey) {
  if (!baseUrl || !anonKey) return component('auth', 'Staff Authentication', 'Platform', 'unknown', null, 'Health check is not configured in this deployment.')

  try {
    const { response, latencyMs } = await timedFetch(`${baseUrl}/auth/v1/health`, {
      headers: { apikey: anonKey },
    })
    if (response.ok) return component('auth', 'Staff Authentication', 'Platform', 'operational', latencyMs, 'Authentication service is responding.')
    if (response.status >= 500) return component('auth', 'Staff Authentication', 'Platform', 'outage', latencyMs, `Authentication service returned HTTP ${response.status}.`)
    return component('auth', 'Staff Authentication', 'Platform', 'degraded', latencyMs, `Authentication health returned HTTP ${response.status}.`)
  } catch (error) {
    return component('auth', 'Staff Authentication', 'Platform', 'outage', null, error?.name === 'AbortError' ? 'Authentication check timed out.' : 'Authentication service could not be reached.')
  }
}

async function checkSupabaseData(baseUrl, anonKey) {
  if (!baseUrl || !anonKey) return component('data', 'Clinical Data Service', 'Platform', 'unknown', null, 'Health check is not configured in this deployment.')

  try {
    const { response, latencyMs } = await timedFetch(`${baseUrl}/rest/v1/`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
    })

    if (response.status < 500) return component('data', 'Clinical Data Service', 'Platform', 'operational', latencyMs, 'Database API is responding.')
    return component('data', 'Clinical Data Service', 'Platform', 'outage', latencyMs, `Database API returned HTTP ${response.status}.`)
  } catch (error) {
    return component('data', 'Clinical Data Service', 'Platform', 'outage', null, error?.name === 'AbortError' ? 'Database check timed out.' : 'Database API could not be reached.')
  }
}

async function checkSupabaseStorage(baseUrl, anonKey) {
  if (!baseUrl || !anonKey) return component('storage', 'Document & File Storage', 'Platform', 'unknown', null, 'Health check is not configured in this deployment.')

  try {
    const { response, latencyMs } = await timedFetch(`${baseUrl}/storage/v1/bucket`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
    })

    // This endpoint is protected by Storage auth/policies. 2xx and expected 4xx
    // responses all prove the gateway is healthy. Only rate limits, 5xx or a
    // network failure should affect the public availability status.
    if (response.status === 429) {
      return component('storage', 'Document & File Storage', 'Platform', 'degraded', latencyMs, 'Storage gateway is temporarily rate limited.')
    }
    if (response.status < 500) {
      return component('storage', 'Document & File Storage', 'Platform', 'operational', latencyMs, 'Storage gateway is responding.')
    }
    return component('storage', 'Document & File Storage', 'Platform', 'outage', latencyMs, `Storage gateway returned HTTP ${response.status}.`)
  } catch (error) {
    return component('storage', 'Document & File Storage', 'Platform', 'outage', null, error?.name === 'AbortError' ? 'Storage check timed out.' : 'Storage gateway could not be reached.')
  }
}

async function checkStripeBilling(baseUrl, anonKey) {
  if (!baseUrl || !anonKey) return component('stripe', 'Stripe Billing & Payments', 'Integrations', 'unknown', null, 'Billing health check is not configured in this deployment.')

  try {
    const [stripeResult, billingResult] = await Promise.all([
      timedFetch(STRIPE_API_URL, { method: 'GET', redirect: 'manual' }),
      timedFetch(`${baseUrl}/functions/v1/recordsweb-stripe-billing`, {
        method: 'GET',
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
      }),
    ])

    const stripeStatus = stripeResult.response.status
    const billingStatus = billingResult.response.status
    const latencyMs = Math.max(stripeResult.latencyMs, billingResult.latencyMs)

    if (stripeStatus === 429 || billingStatus === 429) {
      return component('stripe', 'Stripe Billing & Payments', 'Integrations', 'degraded', latencyMs, 'Stripe or the RecordsWeb billing service is temporarily rate limited.')
    }

    if (stripeStatus >= 500 || billingStatus >= 500) {
      return component('stripe', 'Stripe Billing & Payments', 'Integrations', 'outage', latencyMs, `Billing health check failed (Stripe HTTP ${stripeStatus}; RecordsWeb HTTP ${billingStatus}).`)
    }

    // Stripe returns 401 without a private key, which confirms its API edge is
    // reachable. RecordsWeb 3.7.2 returns 200 from the billing function health
    // endpoint once the configured Stripe key has been verified.
    if (billingResult.response.ok && stripeStatus < 500) {
      return component('stripe', 'Stripe Billing & Payments', 'Integrations', 'operational', latencyMs, 'Stripe and the RecordsWeb billing service are responding.')
    }

    if (billingStatus === 405) {
      return component('stripe', 'Stripe Billing & Payments', 'Integrations', 'degraded', latencyMs, 'Billing service is reachable, but its 3.7.2 health endpoint has not been deployed yet.')
    }

    return component('stripe', 'Stripe Billing & Payments', 'Integrations', 'degraded', latencyMs, `Billing service returned HTTP ${billingStatus}.`)
  } catch (error) {
    return component('stripe', 'Stripe Billing & Payments', 'Integrations', 'outage', null, error?.name === 'AbortError' ? 'Stripe billing check timed out.' : 'Stripe billing service could not be reached.')
  }
}

async function checkSharedCare(baseUrl, anonKey) {
  if (!baseUrl || !anonKey) return component('sharedcare', 'Shared Care Network', 'Integrations', 'unknown', null, 'Shared Care health check is not configured in this deployment.')

  try {
    const { response, latencyMs } = await timedFetch(`${baseUrl}/rest/v1/rpc/recordsweb_public_shared_care_health`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    })

    if (response.ok) {
      const payload = await response.json().catch(() => null)
      if (payload?.ok === false) {
        return component('sharedcare', 'Shared Care Network', 'Integrations', 'degraded', latencyMs, 'Shared Care schema responded but reported an unhealthy state.')
      }
      return component('sharedcare', 'Shared Care Network', 'Integrations', 'operational', latencyMs, 'Shared Care workspace service is responding.')
    }

    if (response.status === 404 || response.status === 400) {
      return component('sharedcare', 'Shared Care Network', 'Integrations', 'degraded', latencyMs, 'Shared Care health endpoint is not installed. Run the 3.7.2 status migration.')
    }
    if (response.status >= 500) {
      return component('sharedcare', 'Shared Care Network', 'Integrations', 'outage', latencyMs, `Shared Care service returned HTTP ${response.status}.`)
    }
    return component('sharedcare', 'Shared Care Network', 'Integrations', 'degraded', latencyMs, `Shared Care health returned HTTP ${response.status}.`)
  } catch (error) {
    return component('sharedcare', 'Shared Care Network', 'Integrations', 'outage', null, error?.name === 'AbortError' ? 'Shared Care check timed out.' : 'Shared Care service could not be reached.')
  }
}

async function checkGitHubReleases() {
  try {
    const { response, latencyMs } = await timedFetch(GITHUB_RELEASE_URL, {
      method: 'GET',
      redirect: 'manual',
    })

    if (response.ok || [301, 302, 303, 307, 308].includes(response.status)) {
      return component('updates', 'Software Updates & Downloads', 'Integrations', 'operational', latencyMs, 'GitHub release delivery is responding.')
    }

    if (response.status === 429) {
      return component('updates', 'Software Updates & Downloads', 'Integrations', 'degraded', latencyMs, 'GitHub release delivery is temporarily rate limited.')
    }

    if (response.status >= 500) return component('updates', 'Software Updates & Downloads', 'Integrations', 'outage', latencyMs, `Release service returned HTTP ${response.status}.`)
    return component('updates', 'Software Updates & Downloads', 'Integrations', 'degraded', latencyMs, `Release service returned HTTP ${response.status}.`)
  } catch (error) {
    return component('updates', 'Software Updates & Downloads', 'Integrations', 'outage', null, error?.name === 'AbortError' ? 'Release service check timed out.' : 'Release service could not be reached.')
  }
}

function overallStatus(components) {
  const statuses = components.map((item) => item.status)
  if (statuses.includes('outage')) {
    const outageCount = statuses.filter((status) => status === 'outage').length
    return outageCount >= Math.max(2, Math.ceil(components.length / 2)) ? 'major_outage' : 'partial_outage'
  }
  if (statuses.includes('degraded')) return 'degraded'
  if (statuses.includes('unknown')) return 'unknown'
  return 'operational'
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return json(res, { error: 'Method not allowed.' }, 405)
  }

  const baseUrl = normaliseSupabaseUrl(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)
  const anonKey = String(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim()

  const components = await Promise.all([
    checkWebsite(),
    checkSupabaseAuth(baseUrl, anonKey),
    checkSupabaseData(baseUrl, anonKey),
    checkSupabaseStorage(baseUrl, anonKey),
    checkRecordsWebApi(),
    checkGitHubReleases(),
    checkStripeBilling(baseUrl, anonKey),
    checkSharedCare(baseUrl, anonKey),
  ])

  return json(res, {
    ok: true,
    automated: true,
    generatedAt: new Date().toISOString(),
    overall: overallStatus(components),
    components,
  })
}
