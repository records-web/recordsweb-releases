const RECORDSWEB_ORIGIN = 'https://recordsweb.vercel.app'
const COMMUNITY_HOST = /^[a-z0-9]{2}-[a-z0-9]{2}\.recordsweb\.org$/i

export default {
  async fetch(request) {
    const incoming = new URL(request.url)
    const hostname = incoming.hostname.toLowerCase()

    // The wildcard Worker route can also see existing service hosts such as
    // www/api/status/cdn. Pass anything that is not an XX-XX community host
    // through to its normal Cloudflare DNS origin unchanged.
    if (!COMMUNITY_HOST.test(hostname)) {
      return fetch(request)
    }

    const upstream = new URL(RECORDSWEB_ORIGIN)
    upstream.pathname = incoming.pathname
    upstream.search = incoming.search

    const headers = new Headers(request.headers)
    headers.set('X-Forwarded-Host', hostname)
    headers.set('X-RecordsWeb-Original-Host', hostname)
    headers.set('X-Forwarded-Proto', 'https')
    headers.delete('Host')

    const init = {
      method: request.method,
      headers,
      redirect: 'manual',
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      init.body = request.body
    }

    const upstreamResponse = await fetch(new Request(upstream.toString(), init))
    const responseHeaders = new Headers(upstreamResponse.headers)
    const location = responseHeaders.get('Location')

    if (location) {
      try {
        const redirect = new URL(location, RECORDSWEB_ORIGIN)
        if (redirect.hostname === 'recordsweb.vercel.app') {
          redirect.protocol = incoming.protocol
          redirect.hostname = hostname
          responseHeaders.set('Location', redirect.toString())
        }
      } catch {
        // Leave non-standard Location headers unchanged.
      }
    }

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    })
  },
}
