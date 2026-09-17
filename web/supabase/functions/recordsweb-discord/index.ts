import { createClient } from 'npm:@supabase/supabase-js@2'
import React from 'npm:react@^19'
import { ImageResponse } from 'npm:@vercel/og@^0'
import { PDFDocument, StandardFonts, rgb, degrees } from 'npm:pdf-lib@1.17.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const DISCORD_API = 'https://discord.com/api/v10'
const BOT_PERMISSIONS = '19456' // View Channel + Send Messages + Embed Links
const OPERATOR_EMAIL_PATTERN = /^(?:gus\.farnsworth|alfie\.james)@[a-z]{2}\.[a-z]{2}$/i

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Server configuration error: ${name} is unavailable.`)
  return value
}

function snowflake(value: unknown, label: string) {
  const clean = String(value || '').trim()
  if (!/^\d{17,20}$/.test(clean)) {
    const error = new Error(`${label} must be a 17–20 digit Discord ID.`) as Error & { status?: number }
    error.status = 400
    throw error
  }
  return clean
}

function cleanText(value: unknown, max = 500) {
  return String(value ?? '').trim().slice(0, max)
}

const COMMON_PASSWORDS = new Set(['password123','password1','qwerty123','letmein123','welcome123','recordsweb1','groveway123','changeme123','admin12345','1234567890'])

function validatePassword(password: string, username = '') {
  if (password.length < 10) return 'Password must contain at least 10 characters.'
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return 'Password must contain at least one letter and one number.'
  if (COMMON_PASSWORDS.has(password.toLowerCase())) return 'Choose a less common password.'
  const local = String(username || '').split('@')[0].replace(/[^a-z0-9]/gi, '').toLowerCase()
  if (local.length >= 5 && password.replace(/[^a-z0-9]/gi, '').toLowerCase().includes(local)) return 'Password must not contain the RecordsWeb username.'
  return ''
}

const h = React.createElement

function svgDataUri(svg: string) {
  return `data:image/svg+xml;base64,${btoa(svg)}`
}

function seededRandomFactory(seedValue: string) {
  let seed = 2166136261 >>> 0
  for (const char of String(seedValue || 'recordsweb-signature')) {
    seed ^= char.charCodeAt(0)
    seed = Math.imul(seed, 16777619) >>> 0
  }
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
}

function buildSignatureScribbleSvg(seedValue: string) {
  const rand = seededRandomFactory(seedValue)
  const width = 320
  const height = 86
  const baseline = 50 + rand() * 6
  let x = 10
  let path = `M ${x.toFixed(1)} ${baseline.toFixed(1)}`
  for (let index = 0; index < 11; index += 1) {
    const nextX = x + 20 + rand() * 14
    const endY = baseline + (rand() - 0.5) * (18 + rand() * 20)
    const c1x = x + 7 + rand() * 10
    const c1y = baseline + (rand() - 0.5) * 24
    const c2x = nextX - (8 + rand() * 10)
    const c2y = baseline + (rand() - 0.5) * 24
    path += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${nextX.toFixed(1)} ${endY.toFixed(1)}`
    x = nextX
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="none"/><path d="${path}" fill="none" stroke="#171717" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
}

async function ensurePrescriberSignature(admin: any, prescriber: any) {
  const existingSvg = cleanText(prescriber?.signature_svg, 20000)
  if (existingSvg) {
    return { svg: existingSvg, dataUri: svgDataUri(existingSvg), saved: false }
  }

  const seedValue = [prescriber?.id, prescriber?.display_name, prescriber?.username, crypto.randomUUID()].filter(Boolean).join('|')
  const svg = buildSignatureScribbleSvg(seedValue)
  if (prescriber?.id) {
    try {
      await admin
        .from('profiles')
        .update({ prescriber_signature_svg: svg })
        .eq('id', prescriber.id)
    } catch (error) {
      console.warn('Unable to save generated prescriber signature to the profile.', error)
    }
  }
  return { svg, dataUri: svgDataUri(svg), saved: true }
}

function loginField(label: string, value: string, mono = false) {
  return h('div', {
    style: {
      display: 'flex',
      alignItems: 'center',
      width: '100%',
      marginBottom: 22,
    },
  },
    h('div', {
      style: {
        display: 'flex',
        width: 205,
        color: '#f0f7fb',
        fontSize: 22,
        fontWeight: 600,
      },
    }, label),
    h('div', {
      style: {
        display: 'flex',
        alignItems: 'center',
        width: 650,
        height: 64,
        padding: '0 22px',
        border: '1px solid #436274',
        background: '#0d1b23',
        color: '#dceaf2',
        fontSize: 24,
        fontWeight: mono ? 600 : 500,
        fontFamily: mono ? 'monospace' : 'sans-serif',
      },
    }, value || '—'),
  )
}

let recordsWebLogoDataUri: string | null = null

async function getRecordsWebLogoDataUri() {
  if (recordsWebLogoDataUri) return recordsWebLogoDataUri
  const logoUrl = String(Deno.env.get('RECORDSWEB_LOGO_URL') || 'https://cdn.recordsweb.org/RW-Logo.png').trim()
  const response = await fetch(logoUrl, { headers: { 'User-Agent': 'RecordsWeb-Bot/4.0.0' } })
  if (!response.ok) {
    throw Object.assign(new Error(`Unable to load the official RecordsWeb logo (HTTP ${response.status}).`), { status: 502 })
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)))
  }
  recordsWebLogoDataUri = `data:image/png;base64,${btoa(binary)}`
  return recordsWebLogoDataUri
}

async function renderRecordsWebLoginCard(payload: {
  username: string
  temporaryPassword: string
  organisationName: string
  organisationCode: string
  publicUrl: string
  version: string
}) {
  const { username, temporaryPassword, organisationName, organisationCode, publicUrl, version } = payload
  const logoDataUri = await getRecordsWebLogoDataUri()
  const staffArea = publicUrl.replace(/^https?:\/\//i, '').replace(/\/$/, '')

  const element = h('div', {
    style: {
      width: '100%',
      height: '100%',
      display: 'flex',
      background: '#0d171d',
      color: '#ffffff',
      fontFamily: 'sans-serif',
    },
  },
    h('div', {
      style: {
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: '#101c23',
      },
    },
      h('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          minHeight: 150,
          padding: '24px 34px 18px',
          background: '#101c23',
        },
      },
        h('img', {
          src: logoDataUri,
          width: 360,
          height: 120,
          style: {
            objectFit: 'contain',
            objectPosition: 'left center',
          },
        }),
        h('div', {
          style: {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            justifyContent: 'center',
            gap: 6,
            maxWidth: 520,
          },
        },
          h('div', { style: { color: '#73a8c7', fontSize: 15, textAlign: 'right' } }, `RecordsWeb ${version} · Desktop Clinical System`),
          h('div', { style: { color: '#ffffff', fontSize: 29, fontWeight: 800, textAlign: 'right' } }, organisationName),
          h('div', { style: { color: '#64a8d0', fontSize: 17, textAlign: 'right' } }, 'Health care records'),
        ),
      ),

      h('div', { style: { display: 'flex', width: '100%', height: 4, background: '#078ce1' } }),

      h('div', {
        style: {
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          padding: '38px 58px 30px',
          background: '#101c23',
        },
      },
        h('div', {
          style: {
            display: 'flex',
            color: '#ffffff',
            fontSize: 27,
            fontWeight: 800,
            marginBottom: 34,
          },
        }, 'Your RecordsWeb login details'),

        loginField('Username', username, true),
        loginField('Temporary password', temporaryPassword, true),

        h('div', {
          style: {
            display: 'flex',
            alignItems: 'center',
            marginLeft: 205,
            gap: 18,
            marginTop: 4,
          },
        },
          h('div', {
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 176,
              height: 58,
              border: '1px solid #5e8094',
              background: '#1a3545',
              color: '#ffffff',
              fontSize: 21,
              fontWeight: 700,
            },
          }, 'Sign in'),
          h('div', {
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 176,
              height: 58,
              border: '1px solid #5e8094',
              background: '#142832',
              color: '#ffffff',
              fontSize: 21,
              fontWeight: 700,
            },
          }, 'Close'),
        ),

        h('div', {
          style: {
            display: 'flex',
            marginLeft: 205,
            gap: 34,
            marginTop: 25,
            color: '#1b9bf0',
            fontSize: 17,
          },
        },
          h('div', null, `Staff area: ${staffArea}`),
          h('div', null, 'Change password after sign-in'),
        ),
      ),

      h('div', {
        style: {
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          borderTop: '1px solid #355264',
          background: '#10222c',
        },
      },
        h('div', {
          style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            minHeight: 66,
            padding: '0 30px',
            borderBottom: '1px solid #355264',
            color: '#a8cee5',
            fontSize: 16,
          },
        },
          h('div', null, 'Connection: RecordsWeb Supabase'),
          h('div', { style: { display: 'flex', gap: 20 } },
            h('div', null, `Organisation: ${organisationCode}`),
            h('div', { style: { color: '#1b9bf0' } }, 'Keep credentials private'),
          ),
        ),
        h('div', {
          style: {
            display: 'flex',
            alignItems: 'center',
            minHeight: 74,
            padding: '0 30px',
            color: '#7fa4ba',
            fontSize: 14,
            lineHeight: 1.4,
          },
        }, `${organisationName} · RecordsWeb temporary staff credentials. Sign in with the password above, then choose a new password when prompted. Do not share this image.`),
      ),
    ),
  )

  const response = new ImageResponse(element as any, { width: 1200, height: 900 })
  if (!response.ok) throw Object.assign(new Error(`Unable to generate RecordsWeb login image (HTTP ${response.status}).`), { status: 502 })
  return new Uint8Array(await response.arrayBuffer())
}


type DiscordUploadFile = {
  bytes: Uint8Array
  filename: string
  contentType: string
  description?: string
}

async function discordMultipartFilesRequest(path: string, payload: Record<string, unknown>, files: DiscordUploadFile[]) {
  const token = requiredEnv('RECORDSWEB_DISCORD_BOT_TOKEN')
  const form = new FormData()
  form.append('payload_json', JSON.stringify({
    ...payload,
    attachments: files.map((file, index) => ({
      id: index,
      filename: file.filename,
      description: file.description || file.filename,
    })),
    allowed_mentions: { parse: [] },
  }))
  files.forEach((file, index) => {
    form.append(`files[${index}]`, new Blob([file.bytes], { type: file.contentType }), file.filename)
  })
  const response = await fetch(`${DISCORD_API}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bot ${token}` },
    body: form,
  })
  const raw = await response.text()
  let data: any = null
  try { data = raw ? JSON.parse(raw) : null } catch { data = raw }
  if (!response.ok) {
    const detail = data?.message || (typeof data === 'string' ? data : '') || `Discord returned HTTP ${response.status}.`
    const error = new Error(detail) as Error & { status?: number, code?: unknown }
    error.status = response.status
    error.code = data?.code
    throw error
  }
  return data
}

async function discordMultipartRequest(path: string, payload: Record<string, unknown>, imageBytes: Uint8Array, filename: string) {
  return discordMultipartFilesRequest(path, payload, [{
    bytes: imageBytes,
    filename,
    contentType: 'image/png',
    description: 'RecordsWeb generated image',
  }])
}

async function sendRecordsWebLoginImageDm(payload: {
  discordUserId: string
  username: string
  temporaryPassword: string
  organisationName: string
  organisationCode: string
  publicUrl: string
  version: string
}) {
  const dm = await discordRequest('/users/@me/channels', {
    method: 'POST',
    body: JSON.stringify({ recipient_id: payload.discordUserId }),
  })
  const image = await renderRecordsWebLoginCard(payload)
  const filename = 'recordsweb-login-details.png'

  // v3.4.2 deliberately sends ONLY the generated RecordsWeb image.
  // No Discord content, embed, fields or fallback credential message is sent.
  return discordMultipartRequest(`/channels/${String(dm.id)}/messages`, {
    attachments: [{ id: 0, filename, description: 'RecordsWeb temporary login details' }],
  }, image, filename)
}


function formatDiscordDate(value: unknown) {
  if (!value) return 'Not specified'
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) return 'Not specified'
  return `<t:${Math.floor(date.getTime() / 1000)}:F> (<t:${Math.floor(date.getTime() / 1000)}:R>)`
}

async function discordRequest(path: string, init: RequestInit = {}) {
  const token = requiredEnv('RECORDSWEB_DISCORD_BOT_TOKEN')
  const response = await fetch(`${DISCORD_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
  const raw = await response.text()
  let data: any = null
  try { data = raw ? JSON.parse(raw) : null } catch { data = raw }
  if (!response.ok) {
    const detail = data?.message || (typeof data === 'string' ? data : '') || `Discord returned HTTP ${response.status}.`
    const error = new Error(detail) as Error & { status?: number, code?: unknown }
    error.status = response.status
    error.code = data?.code
    throw error
  }
  return data
}

async function getBotIdentity() {
  const bot = await discordRequest('/users/@me')
  const clientId = String(Deno.env.get('RECORDSWEB_DISCORD_CLIENT_ID') || bot?.id || '').trim()
  return {
    id: String(bot?.id || ''),
    username: String(bot?.username || 'RecordsWeb Bot'),
    discriminator: String(bot?.discriminator || '0'),
    avatar: bot?.avatar || null,
    client_id: clientId,
    invite_url: clientId
      ? `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(clientId)}&permissions=${BOT_PERMISSIONS}&scope=bot%20applications.commands`
      : '',
  }
}

async function discoverGuild(guildId: string) {
  const guild = await discordRequest(`/guilds/${guildId}`)
  const allChannels = await discordRequest(`/guilds/${guildId}/channels`)
  const channels = (Array.isArray(allChannels) ? allChannels : [])
    .filter((channel: any) => [0, 5].includes(Number(channel.type)))
    .sort((a: any, b: any) => Number(a.position || 0) - Number(b.position || 0) || String(a.name || '').localeCompare(String(b.name || '')))
    .map((channel: any) => ({ id: String(channel.id), name: String(channel.name || 'channel'), type: Number(channel.type) }))
  return { guild: { id: String(guild.id), name: String(guild.name || 'Discord server'), icon: guild.icon || null }, channels }
}

async function verifyChannel(guildId: string, channelId: string) {
  const channel = await discordRequest(`/channels/${channelId}`)
  if (String(channel?.guild_id || '') !== guildId) throw new Error('The selected channel does not belong to that Discord server.')
  if (![0, 5].includes(Number(channel?.type))) throw new Error('Choose a Discord text or announcement channel for maintenance messages.')
  return { id: String(channel.id), name: String(channel.name || 'channel'), type: Number(channel.type) }
}

async function sendMessage(channelId: string, payload: Record<string, unknown>) {
  return discordRequest(`/channels/${channelId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ ...payload, allowed_mentions: { parse: [] } }),
  })
}


function displayDateOnly(value: unknown) {
  const clean = cleanText(value, 40)
  if (!clean) return 'Not specified'
  const date = new Date(`${clean.slice(0, 10)}T12:00:00Z`)
  if (Number.isNaN(date.getTime())) return clean
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(date)
}

function formatForHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[char] || char))
}

function patientFullName(patient: any) {
  return [patient?.title, patient?.first_name, patient?.last_name].filter(Boolean).join(' ').trim() || 'Patient'
}

function patientAddressLines(patient: any, maxLines = 5) {
  return String(patient?.address || '')
    .split(/\r?\n|,/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, maxLines)
}

function patientAgeOn(dateOfBirth: unknown, referenceDate: unknown) {
  const dob = String(dateOfBirth || '').slice(0, 10)
  const ref = String(referenceDate || '').slice(0, 10)
  if (!dob || !ref) return ''
  const dobDate = new Date(`${dob}T12:00:00Z`)
  const refDate = new Date(`${ref}T12:00:00Z`)
  if (Number.isNaN(dobDate.getTime()) || Number.isNaN(refDate.getTime())) return ''
  let age = refDate.getUTCFullYear() - dobDate.getUTCFullYear()
  const monthDelta = refDate.getUTCMonth() - dobDate.getUTCMonth()
  if (monthDelta < 0 || (monthDelta === 0 && refDate.getUTCDate() < dobDate.getUTCDate())) age -= 1
  return age >= 0 ? String(age) : ''
}

function medicationDirections(medication: any) {
  const dose = cleanText(medication?.dose, 300)
  const usage = cleanText(medication?.usage, 300)
  const usageLooksLikeContact = /@/.test(usage)
  if (dose && usage && !usageLooksLikeContact && usage.toLowerCase() !== dose.toLowerCase()) return `${dose} · ${usage}`
  if (dose) return dose
  if (usage && !usageLooksLikeContact) return usage
  return 'Directions not specified'
}

function medicationQuantityText(medication: any) {
  return cleanText(medication?.quantity, 120) || 'Not specified'
}


async function renderPrescriptionImage(payload: { patient: any, medication: any, medicationItems?: any[], organisation: any, eventType: string, prescriber?: any }) {
  const { patient, medication, organisation, prescriber } = payload
  const medicationItems = (Array.isArray(payload.medicationItems) && payload.medicationItems.length ? payload.medicationItems : [medication]).filter(Boolean).slice(0, 4)
  const medicationItemCount = Math.max(1, medicationItems.length)
  const issueDate = displayDateOnly(medication?.last_issue_date || new Date().toISOString().slice(0, 10))
  const patientName = patientFullName(patient).toUpperCase()
  const addressLines = patientAddressLines(patient)
  const age = patientAgeOn(patient?.dob, medication?.last_issue_date || new Date().toISOString())
  const nhsNumber = cleanText(patient?.nhs_number, 30) || 'NHS NUMBER'
  const organisationName = cleanText(organisation?.name, 120) || 'RecordsWeb Community'
  const authoriser = cleanText(medication?.authoriser, 100) || cleanText(prescriber?.display_name, 100) || 'RecordsWeb clinician'
  const prescriberEmail = cleanText(prescriber?.email || prescriber?.username, 160) || 'Not recorded'
  const prescriberRole = cleanText(prescriber?.role, 120) || 'Clinician'
  const prescriberLocation = cleanText(prescriber?.location || organisation?.default_location, 120) || 'Main Site'
  const prescriberSignatureDataUri = cleanText(prescriber?.signature_data_uri, 24000)

  const text = (value: unknown, style: Record<string, unknown> = {}) => h('div', {
    style: {
      display: 'flex',
      color: '#111111',
      fontFamily: 'Arial, sans-serif',
      ...style,
    },
  }, String(value ?? ''))

  const itemRowHeight = medicationItemCount >= 4 ? 100 : medicationItemCount === 3 ? 112 : medicationItemCount === 2 ? 130 : 150
  const itemRow = (index: number, name = '', qty = '', dosage = '', right = false) => h('div', {
    style: {
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      width: '100%',
      minHeight: itemRowHeight,
      padding: right ? '13px 54px 10px 14px' : '11px 14px 9px',
      borderTop: right ? '2px solid #474747' : '1px solid #607760',
      background: right ? 'transparent' : 'rgba(255,255,255,0.10)',
    },
  },
    text(`MEDICATION ITEM DESCRIPTION ${index}`, { fontSize: 15, fontWeight: 700 }),
    text(name ? name.toUpperCase() : ' ', { fontSize: 20, fontWeight: 500, marginTop: 3, minHeight: 24 }),
    text(`QUANTITY ${qty || ' '}`, { fontSize: 15, marginTop: 3 }),
    text(dosage ? dosage.toUpperCase() : ' ', { fontSize: 15, marginTop: 2, maxWidth: right ? 520 : 490 }),
    right ? h('div', {
      style: {
        display: 'flex',
        position: 'absolute',
        right: 12,
        top: 25,
        width: 28,
        height: 28,
        border: '2px solid #333333',
      },
    }) : null,
  )

  const leftAddress = addressLines.length ? addressLines.slice(0, 5) : ['']
  const rightAddress = addressLines.length ? addressLines.slice(0, 5) : ['']

  const element = h('div', {
    style: {
      display: 'flex',
      width: '100%',
      height: '100%',
      background: '#efede4',
      color: '#111111',
      fontFamily: 'Arial, sans-serif',
      padding: 10,
    },
  },
    h('div', {
      style: {
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        width: 635,
        height: '100%',
        background: '#d9ecc7',
        border: '2px solid #647764',
        overflow: 'hidden',
      },
    },
      text('NHS', { position: 'absolute', left: 36, top: 70, fontSize: 92, fontWeight: 800, color: 'rgba(42,110,52,0.08)', transform: 'rotate(-23deg)' }),
      text('NHS', { position: 'absolute', left: 42, top: 360, fontSize: 92, fontWeight: 800, color: 'rgba(42,110,52,0.08)', transform: 'rotate(-23deg)' }),
      text('NHS', { position: 'absolute', left: 40, top: 650, fontSize: 92, fontWeight: 800, color: 'rgba(42,110,52,0.08)', transform: 'rotate(-23deg)' }),
      h('div', { style: { display: 'flex', width: '100%', height: 170, borderBottom: '1px solid #607760' } },
        h('div', { style: { display: 'flex', flexDirection: 'column', width: 118, borderRight: '1px solid #607760', padding: '10px 8px' } },
          text('Pharmacy Stamp', { fontSize: 13, fontWeight: 700 }),
          text('Age', { fontSize: 13, fontWeight: 700, marginTop: 48 }),
          text(age || '—', { fontSize: 21, marginTop: 5 }),
          text('D.o.B', { fontSize: 13, fontWeight: 700, marginTop: 8 }),
          text(displayDateOnly(patient?.dob), { fontSize: 15, marginTop: 3 }),
        ),
        h('div', { style: { display: 'flex', flexDirection: 'column', flex: 1, padding: '10px 12px' } },
          text('Title, Forename, Surname & Address', { fontSize: 13, fontWeight: 700 }),
          text(patientName, { fontSize: 19, fontWeight: 600, marginTop: 5 }),
          ...leftAddress.map((line: string, index: number) => text(line.toUpperCase(), { fontSize: 16, marginTop: index === 0 ? 6 : 2 })),
          h('div', { style: { display: 'flex', marginTop: 'auto', alignItems: 'center' } },
            text('NHS Number:', { fontSize: 13, fontWeight: 700, marginRight: 8 }),
            text(nhsNumber, { fontSize: 15 }),
          ),
        ),
      ),
      h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: 48, borderBottom: '1px solid #607760' } },
        text('NOMINATED EPS TOKEN', { fontSize: 21, fontWeight: 700 }),
      ),
      h('div', { style: { display: 'flex', width: '100%', flex: 1 } },
        h('div', { style: { display: 'flex', flexDirection: 'column', width: 557, flex: 1 } },
          ...medicationItems.map((item: any, index: number) => itemRow(index + 1, cleanText(item?.name, 120) || 'Medication item', medicationQuantityText(item), medicationDirections(item))),
          h('div', { style: { display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flex: 1, minHeight: 190, padding: '10px 14px 12px', borderTop: '1px solid #607760', overflow: 'hidden' } },
            h('div', { style: { display: 'flex', flexDirection: 'column' } },
              text('Signature of Prescriber', { fontSize: 13, fontWeight: 700 }),
              text('PRESCRIBING TOKEN - not to be used as a prescription, even if signed by an authorised prescriber.', { fontSize: 10, marginTop: 3, lineHeight: 1.2, maxWidth: 505, color: '#2f2f2f' }),
              prescriberSignatureDataUri
                ? h('img', {
                  src: prescriberSignatureDataUri,
                  width: 210,
                  height: 46,
                  style: { display: 'flex', width: 210, height: 46, marginTop: 8, marginLeft: 2, objectFit: 'contain' },
                })
                : h('div', { style: { display: 'flex', width: 210, height: 46, marginTop: 8 } }),
              h('div', { style: { display: 'flex', flexDirection: 'column', marginTop: 4, paddingLeft: 6 } },
                text(authoriser, { fontSize: 14, fontWeight: 700 }),
                text(`Prescriber email: ${prescriberEmail}`, { fontSize: 11, marginTop: 3, color: '#333333' }),
                text(`Role: ${prescriberRole}`, { fontSize: 11, marginTop: 2, color: '#333333' }),
                text(`Location: ${prescriberLocation}`, { fontSize: 11, marginTop: 2, color: '#333333' }),
              ),
            ),
            h('div', { style: { display: 'flex', alignItems: 'flex-end', marginTop: 8 } },
              text('NHS', { fontSize: 30, fontWeight: 800, color: '#315f9f', marginRight: 22 }),
              h('div', { style: { display: 'flex', flexDirection: 'column' } },
                text(organisationName.toUpperCase(), { fontSize: 14, fontWeight: 700 }),
                text(`ISSUED BY ${authoriser.toUpperCase()}`, { fontSize: 13, marginTop: 3 }),
                text(`DATE ${issueDate}`, { fontSize: 13, marginTop: 3 }),
              ),
            ),
          ),
        ),
        h('div', { style: { display: 'flex', width: 76, background: '#8fd15f', border: '1px solid #607760', alignItems: 'center', justifyContent: 'center' } },
          text(`R${String(medication?.id || 'X').slice(-6).toUpperCase()}`, { fontSize: 18, fontWeight: 700, transform: 'rotate(-90deg)' }),
        ),
      ),
    ),
    h('div', {
      style: {
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        height: '100%',
        padding: '18px 18px 10px 28px',
        border: '2px solid #c7c2b4',
        background: '#f3f0e7',
      },
    },
      h('div', { style: { display: 'flex', width: '100%', minHeight: 170 } },
        h('div', { style: { display: 'flex', flexDirection: 'column', flex: 1 } },
          text(patientFullName(patient), { fontSize: 20 }),
          ...rightAddress.map((line: string, index: number) => text(line, { fontSize: 16, marginTop: index === 0 ? 5 : 2 })),
          h('div', { style: { display: 'flex', marginTop: 6 } },
            text('D.O.B', { fontSize: 14, marginRight: 12 }),
            text(displayDateOnly(patient?.dob), { fontSize: 16 }),
          ),
        ),
        h('div', { style: { display: 'flex', flexDirection: 'column', width: 220, alignItems: 'flex-start' } },
          text('Date of issue', { fontSize: 14 }),
          text(issueDate, { fontSize: 17, marginTop: 4 }),
          text('Page 1 of (n)', { fontSize: 14, marginTop: 10 }),
          text('NHS Number', { fontSize: 14, marginTop: 24 }),
          text(nhsNumber, { fontSize: 16, marginTop: 4 }),
        ),
      ),
      ...medicationItems.map((item: any, index: number) => itemRow(index + 1, cleanText(item?.name, 120) || 'Medication item', medicationQuantityText(item), medicationDirections(item), true)),
      h('div', { style: { display: 'flex', flexDirection: 'column', marginTop: 'auto', padding: '8px 4px 0' } },
        text('Issued by ' + authoriser + ' · ' + organisationName, { fontSize: 16, color: '#222222' }),
        text('This RecordsWeb prescription copy is an automated patient notification for roleplay / simulation use.', { fontSize: 14, marginTop: 7, color: '#333333' }),
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: 38, border: '1px solid #7f969f', marginTop: 10 } },
          text('PATIENTS – please read the notes overleaf', { fontSize: 17, fontWeight: 700, color: '#31546c' }),
        ),
      ),
    ),
  )

  try {
    const response = new ImageResponse(element as any, { width: 1400, height: 900 })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return new Uint8Array(await response.arrayBuffer())
  } catch (error) {
    console.error('Primary RecordsWeb prescription renderer failed; using the safe prescription renderer.', error)
    return renderPrescriptionFallbackImage(payload)
  }
}


async function renderPrescriptionFallbackImage(payload: { patient: any, medication: any, medicationItems?: any[], organisation: any, eventType: string, prescriber?: any }) {
  const { patient, medication, organisation, prescriber } = payload
  const medicationItems = (Array.isArray(payload.medicationItems) && payload.medicationItems.length ? payload.medicationItems : [medication]).filter(Boolean).slice(0, 4)
  const issueDate = displayDateOnly(medication?.last_issue_date || new Date().toISOString().slice(0, 10))
  const patientName = patientFullName(patient)
  const address = patientAddressLines(patient, 4).join(', ') || 'Address not recorded'
  const nhsNumber = cleanText(patient?.nhs_number, 30) || 'Not specified'
  const medicationName = cleanText(medication?.name, 120) || 'Medication item'
  const quantity = medicationQuantityText(medication)
  const directions = medicationDirections(medication)
  const authoriser = cleanText(medication?.authoriser, 100) || cleanText(prescriber?.display_name, 100) || 'RecordsWeb clinician'
  const organisationName = cleanText(organisation?.name, 120) || 'RecordsWeb Community'
  const location = cleanText(prescriber?.location || organisation?.default_location, 120) || 'Main Site'
  const email = cleanText(prescriber?.email || prescriber?.username, 160) || 'Not recorded'
  const role = cleanText(prescriber?.role, 120) || 'Clinician'
  const method = cleanText(medication?.method, 80) || 'Electronic R2'
  const form = cleanText(medication?.form, 80) || 'Medication'

  const safeText = (value: unknown, style: Record<string, unknown> = {}) => h('div', {
    style: { display: 'flex', color: '#111111', fontFamily: 'Arial, sans-serif', ...style },
  }, String(value ?? ''))

  const row = (label: string, value: string) => h('div', {
    style: { display: 'flex', width: '100%', border: '1px solid #9aa79a', background: '#ffffff' },
  },
    h('div', { style: { display: 'flex', width: 235, padding: '12px', background: '#dfeecd', fontWeight: 700, fontFamily: 'Arial, sans-serif', color: '#243124' } }, label),
    h('div', { style: { display: 'flex', flex: 1, padding: '12px', fontFamily: 'Arial, sans-serif', color: '#111111' } }, value || 'Not specified'),
  )

  const element = h('div', {
    style: {
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      height: '100%',
      padding: '26px',
      background: '#f1efe6',
      fontFamily: 'Arial, sans-serif',
      color: '#111111',
    },
  },
    h('div', {
      style: {
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        border: '3px solid #677c67',
        background: '#f7f6ef',
      },
    },
      h('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '18px 22px',
          border: '1px solid #677c67',
          background: '#d8ebc6',
        },
      },
        safeText('NOMINATED EPS TOKEN', { fontSize: 28, fontWeight: 800, color: '#273827' }),
        safeText(issueDate, { fontSize: 18, fontWeight: 700 }),
      ),
      h('div', { style: { display: 'flex', width: '100%', padding: '18px 22px', border: '1px solid #9aa79a', background: '#edf4e5' } },
        h('div', { style: { display: 'flex', flexDirection: 'column', flex: 1 } },
          safeText(patientName, { fontSize: 24, fontWeight: 800 }),
          safeText(address, { fontSize: 17, marginTop: 5 }),
          safeText(`D.O.B: ${displayDateOnly(patient?.dob)}`, { fontSize: 16, marginTop: 8 }),
        ),
        h('div', { style: { display: 'flex', flexDirection: 'column', width: 310 } },
          safeText('NHS Number', { fontSize: 14, fontWeight: 700 }),
          safeText(nhsNumber, { fontSize: 20, marginTop: 5 }),
        ),
      ),
      h('div', { style: { display: 'flex', flexDirection: 'column', width: '100%', padding: '20px 22px' } },
        ...medicationItems.flatMap((item: any, index: number) => [
          safeText(`MEDICATION ITEM DESCRIPTION ${index + 1}`, { fontSize: 16, fontWeight: 800, marginTop: index ? 18 : 0 }),
          safeText((cleanText(item?.name, 120) || 'Medication item').toUpperCase(), { fontSize: 26, fontWeight: 700, marginTop: 6 }),
          safeText(`QUANTITY ${medicationQuantityText(item)}`, { fontSize: 18, marginTop: 8 }),
          safeText(medicationDirections(item).toUpperCase(), { fontSize: 18, marginTop: 7 }),
        ]),
        h('div', { style: { display: 'flex', flexDirection: 'column', width: '100%', marginTop: 24 } },
          row('Issue method', method),
          h('div', { style: { display: 'flex', marginTop: 8 } }, row('Reference form', form)),
          h('div', { style: { display: 'flex', marginTop: 8 } }, row('Issued by', authoriser)),
          h('div', { style: { display: 'flex', marginTop: 8 } }, row('Prescriber email', email)),
          h('div', { style: { display: 'flex', marginTop: 8 } }, row('Prescriber role', role)),
          h('div', { style: { display: 'flex', marginTop: 8 } }, row('Location', location)),
          h('div', { style: { display: 'flex', marginTop: 8 } }, row('Community', organisationName)),
        ),
      ),
      h('div', {
        style: {
          display: 'flex',
          marginTop: 'auto',
          padding: '13px 22px',
          border: '1px solid #677c67',
          background: '#d8ebc6',
          fontSize: 14,
          fontFamily: 'Arial, sans-serif',
          color: '#334433',
        },
      }, 'ROLEPLAY / SIMULATION ONLY · RecordsWeb automated patient prescription copy'),
    ),
  )

  const response = new ImageResponse(element as any, { width: 1200, height: 760 })
  if (!response.ok) throw Object.assign(new Error(`Unable to generate fallback prescription image (HTTP ${response.status}).`), { status: 502 })
  return new Uint8Array(await response.arrayBuffer())
}


function fitNoteAttachmentBaseName(document: any, patient: any) {
  const surname = String(patient?.last_name || 'Patient').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'Patient'
  const date = String(document?.date || new Date().toISOString().slice(0, 10)).slice(0, 10)
  return `RecordsWeb-Fit-Note-${surname}-${date}`
}

function pdfWrapText(font: any, text: string, size: number, maxWidth: number) {
  const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  if (!words.length) return ['']
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (!current || font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next
    } else {
      lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  return lines
}

function pdfDrawWrapped(page: any, font: any, text: string, x: number, y: number, size: number, maxWidth: number, lineHeight: number, options: Record<string, unknown> = {}) {
  const lines = pdfWrapText(font, text, size, maxWidth)
  lines.forEach((line, index) => page.drawText(line, { x, y: y - (index * lineHeight), size, font, ...options }))
  return y - Math.max(0, lines.length - 1) * lineHeight
}

function pdfDrawField(page: any, regular: any, bold: any, label: string, value: string, x: number, y: number, width: number, height: number) {
  page.drawText(label, { x, y, size: 8.4, font: bold, color: rgb(0.08, 0.08, 0.08) })
  const boxY = y - height - 5
  page.drawRectangle({ x, y: boxY, width, height, borderColor: rgb(0.18, 0.18, 0.18), borderWidth: 0.8, color: rgb(1, 1, 1) })
  const lines = pdfWrapText(regular, value || '—', 8.5, width - 10).slice(0, Math.max(1, Math.floor((height - 8) / 10)))
  lines.forEach((line, index) => page.drawText(line, { x: x + 5, y: boxY + height - 11 - (index * 10), size: 8.5, font: regular, color: rgb(0.05, 0.05, 0.05) }))
  return boxY - 10
}

function pdfCheck(page: any, bold: any, checked: boolean, label: string, x: number, y: number, width: number) {
  page.drawRectangle({ x, y: y - 8, width: 9, height: 9, borderColor: rgb(0.1, 0.1, 0.1), borderWidth: 0.8 })
  if (checked) page.drawText('X', { x: x + 1.6, y: y - 6.4, size: 7.5, font: bold, color: rgb(0, 0, 0) })
  pdfDrawWrapped(page, bold, label, x + 14, y, 7.9, width - 14, 9.5, { color: rgb(0.08, 0.08, 0.08) })
}

async function renderFitNotePdf(document: any, patient: any, organisation: any) {
  const details = document?.details && typeof document.details === 'object' ? document.details : {}
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([841.89, 595.28])
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const { width, height } = page.getSize()
  const margin = 24
  const gap = 24
  const colWidth = (width - (margin * 2) - gap) / 2
  const leftX = margin
  const rightX = margin + colWidth + gap
  const organisationName = cleanText(organisation?.name, 200) || 'RecordsWeb Community'
  const fullPatient = patientFullName(patient)
  const addressLines = patientAddressLines(patient, 6)
  const adjustments = [
    details.phased_return && 'Phased return to work',
    details.amended_duties && 'Amended duties',
    details.altered_hours && 'Altered hours',
    details.workplace_adaptations && 'Workplace adaptations',
  ].filter(Boolean)
  const period = details.period_mode === 'duration'
    ? `${cleanText(details.duration_value, 30) || '—'} ${cleanText(details.duration_unit, 40) || ''}`.trim()
    : `${displayDateOnly(details.period_from)} to ${displayDateOnly(details.period_to)}`

  page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(1, 1, 1) })
  page.drawText('ROLEPLAY ONLY', {
    x: 260,
    y: 270,
    size: 62,
    font: bold,
    color: rgb(0.93, 0.93, 0.93),
    rotate: degrees(-28),
  })

  page.drawRectangle({ x: margin, y: height - 40, width: width - margin * 2, height: 24, borderColor: rgb(0, 0, 0), borderWidth: 1.2 })
  page.drawText('ROLEPLAY / SIMULATION ONLY — NOT A REAL STATUTORY FIT NOTE', { x: 175, y: height - 32, size: 9.4, font: bold, color: rgb(0, 0, 0) })

  let ly = height - 62
  page.drawText('Statement of Fitness for Work', { x: leftX, y: ly, size: 17, font: bold, color: rgb(0, 0, 0) })
  ly -= 16
  page.drawText('For roleplay use only', { x: leftX, y: ly, size: 8.5, font: bold, color: rgb(0.15, 0.15, 0.15) })
  ly -= 15

  ly = pdfDrawField(page, regular, bold, "Patient's name", fullPatient, leftX, ly, colWidth, 24)
  ly = pdfDrawField(page, regular, bold, 'I assessed your case on', displayDateOnly(details.assessed_on), leftX, ly, colWidth, 22)
  ly = pdfDrawField(page, regular, bold, 'Condition(s)', cleanText(details.condition, 4000) || 'Not specified', leftX, ly, colWidth, 42)

  page.drawText('I advise you that:', { x: leftX, y: ly, size: 8.5, font: bold })
  ly -= 12
  pdfCheck(page, bold, details.advice === 'Not fit for work', 'you are not fit for work.', leftX, ly, colWidth)
  ly -= 18
  pdfCheck(page, bold, details.advice === 'May be fit for work', 'you may be fit for work taking account of the following advice.', leftX, ly, colWidth)
  ly -= 24

  page.drawRectangle({ x: leftX, y: ly - 72, width: colWidth, height: 72, borderColor: rgb(0.2, 0.2, 0.2), borderWidth: 0.8 })
  page.drawText("If available, and with your employer's agreement, you may benefit from:", { x: leftX + 5, y: ly - 11, size: 7.8, font: bold })
  const optionY = ly - 26
  const half = colWidth / 2 - 8
  pdfCheck(page, bold, adjustments.includes('Phased return to work'), 'phased return to work', leftX + 5, optionY, half)
  pdfCheck(page, bold, adjustments.includes('Amended duties'), 'amended duties', leftX + colWidth / 2, optionY, half)
  pdfCheck(page, bold, adjustments.includes('Altered hours'), 'altered hours', leftX + 5, optionY - 17, half)
  pdfCheck(page, bold, adjustments.includes('Workplace adaptations'), 'workplace adaptations', leftX + colWidth / 2, optionY - 17, half)
  page.drawText('Comments / functional effects:', { x: leftX + 5, y: ly - 59, size: 7.5, font: bold })
  const commentLines = pdfWrapText(regular, cleanText(details.comments, 5000) || 'Not specified', 7.2, colWidth - 115).slice(0, 2)
  commentLines.forEach((line, index) => page.drawText(line, { x: leftX + 110, y: ly - 59 - index * 8, size: 7.2, font: regular }))
  ly -= 82

  ly = pdfDrawField(page, regular, bold, 'This will be the case for / period', period || 'Not specified', leftX, ly, colWidth, 24)
  pdfCheck(page, bold, Boolean(details.no_reassessment_required), 'I will not need to assess your fitness for work again at the end of this period.', leftX, ly + 1, colWidth)
  ly -= 22
  ly = pdfDrawField(page, regular, bold, "Issuer's name", cleanText(details.issuer_name || document?.author, 250) || 'RecordsWeb clinician', leftX, ly, colWidth, 20)
  ly = pdfDrawField(page, regular, bold, "Issuer's profession", cleanText(details.issuer_profession, 200) || 'Not specified', leftX, ly, colWidth, 20)
  ly = pdfDrawField(page, regular, bold, 'Date of statement', displayDateOnly(details.statement_date || document?.date), leftX, ly, colWidth, 20)
  ly = pdfDrawField(page, regular, bold, "Issuer's address", cleanText(details.issuer_address, 1000) || organisationName, leftX, ly, colWidth, 28)

  let ry = height - 62
  page.drawText('What your advice means', { x: rightX, y: ry, size: 14, font: bold })
  ry -= 18
  page.drawText('‘You are not fit for work’', { x: rightX, y: ry, size: 9, font: bold })
  ry -= 11
  ry = pdfDrawWrapped(page, regular, 'This indicates, for the roleplay scenario, that the character may not be able to work for the period shown.', rightX, ry, 8, colWidth, 10, { color: rgb(0.1, 0.1, 0.1) }) - 16
  page.drawText('‘You may be fit for work’', { x: rightX, y: ry, size: 9, font: bold })
  ry -= 11
  ry = pdfDrawWrapped(page, regular, 'This indicates that a return to work may be possible with support such as altered hours, amended duties, workplace adaptations or a phased return.', rightX, ry, 8, colWidth, 10, { color: rgb(0.1, 0.1, 0.1) }) - 18

  page.drawLine({ start: { x: rightX, y: ry }, end: { x: rightX + colWidth, y: ry }, thickness: 0.8, color: rgb(0.2, 0.2, 0.2) })
  ry -= 16
  page.drawText('Your details — Please use BLOCK CAPITALS', { x: rightX, y: ry, size: 10, font: bold })
  ry -= 14
  ry = pdfDrawField(page, regular, bold, 'Surname', String(patient?.last_name || '').toUpperCase(), rightX, ry, colWidth, 20)
  ry = pdfDrawField(page, regular, bold, 'Other names', String(patient?.first_name || '').toUpperCase(), rightX, ry, colWidth, 20)
  ry = pdfDrawField(page, regular, bold, 'Address', addressLines.join('\n') || 'Not specified', rightX, ry, colWidth, 45)
  ry = pdfDrawField(page, regular, bold, 'Date of birth', displayDateOnly(patient?.dob), rightX, ry, colWidth * 0.48, 20)
  const nhsX = rightX + colWidth * 0.52
  page.drawText('NHS number', { x: nhsX, y: ry + 35, size: 8.4, font: bold })
  page.drawRectangle({ x: nhsX, y: ry + 10, width: colWidth * 0.48, height: 20, borderColor: rgb(0.18, 0.18, 0.18), borderWidth: 0.8 })
  page.drawText(cleanText(patient?.nhs_number, 40) || 'Not specified', { x: nhsX + 5, y: ry + 16, size: 8.5, font: regular })
  ry -= 4
  ry = pdfDrawField(page, regular, bold, 'Community', organisationName, rightX, ry, colWidth, 22)

  page.drawText('What you need to do now', { x: rightX, y: ry, size: 10, font: bold })
  ry -= 12
  const todo = [
    'Use this document only inside the RecordsWeb roleplay or simulation.',
    'Do not present it to an employer, benefits service, healthcare provider or other real organisation.',
    'For real sickness certification, use the appropriate official healthcare process.',
  ]
  for (const item of todo) {
    page.drawText('•', { x: rightX + 2, y: ry, size: 8, font: bold })
    ry = pdfDrawWrapped(page, regular, item, rightX + 13, ry, 7.8, colWidth - 13, 9.5) - 11
  }

  page.drawRectangle({ x: rightX, y: Math.max(42, ry - 22), width: colWidth, height: 22, borderColor: rgb(0, 0, 0), borderWidth: 1 })
  page.drawText('NOT VALID FOR REAL-WORLD USE', { x: rightX + 100, y: Math.max(49, ry - 15), size: 9, font: bold })

  page.drawLine({ start: { x: margin, y: 24 }, end: { x: width - margin, y: 24 }, thickness: 0.5, color: rgb(0.65, 0.65, 0.65) })
  page.drawText(`RecordsWeb roleplay document · ${organisationName}`, { x: margin, y: 10, size: 6.8, font: regular, color: rgb(0.25, 0.25, 0.25) })
  page.drawText('ROLEPLAY ONLY · SIMULATION DOCUMENT', { x: width - 205, y: 10, size: 6.8, font: bold, color: rgb(0.1, 0.1, 0.1) })

  pdf.setTitle(`RecordsWeb Fit Note - ${fullPatient}`)
  pdf.setSubject('RecordsWeb roleplay Statement of Fitness for Work')
  pdf.setCreator('RecordsWeb')
  return new Uint8Array(await pdf.save())
}

async function fitNoteStoredAttachment(admin: any, document: any, patient: any) {
  let storagePath = cleanText(document?.storage_path, 500)
  if (!storagePath) {
    try {
      const { data } = await admin.from('fit_note_pdfs').select('storage_path').eq('document_id', document.id).maybeSingle()
      storagePath = cleanText(data?.storage_path, 500)
    } catch {}
  }
  if (!storagePath) return null
  try {
    const { data, error } = await admin.storage.from('recordsweb-documents').download(storagePath)
    if (error || !data) return null
    const isPdf = /\.pdf$/i.test(storagePath) || /pdf/i.test(String(data.type || ''))
    if (!isPdf) return null
    return {
      bytes: new Uint8Array(await data.arrayBuffer()),
      filename: `${fitNoteAttachmentBaseName(document, patient)}.pdf`,
      contentType: 'application/pdf',
      description: 'RecordsWeb fit note PDF',
      source: 'archived_pdf',
      storage_path: storagePath,
    }
  } catch {
    return null
  }
}

async function ensureFitNotePdfAttachment(admin: any, context: any, document: any, patient: any) {
  const existing = await fitNoteStoredAttachment(admin, document, patient)
  if (existing) return existing

  const bytes = await renderFitNotePdf(document, patient, context.organisation)
  const storagePath = `${context.organisation.id}/${patient.id}/fit-notes/${document.id}.pdf`
  let archived = false
  let archiveError = ''

  try {
    const { error: uploadError } = await admin.storage
      .from('recordsweb-documents')
      .upload(storagePath, bytes, { contentType: 'application/pdf', upsert: true, cacheControl: '0' })
    if (uploadError) throw uploadError

    const { error: rowError } = await admin
      .from('fit_note_pdfs')
      .upsert({
        document_id: document.id,
        patient_id: patient.id,
        storage_path: storagePath,
        mime_type: 'application/pdf',
        file_size: bytes.byteLength,
      }, { onConflict: 'document_id' })
    if (rowError) throw rowError

    // Do not update the signed/locked documents row here. Production installations can
    // enforce audited/licensed document mutations. The app already falls back to
    // fit_note_pdfs.storage_path when documents.storage_path is empty.
    archived = true
  } catch (error) {
    archiveError = error instanceof Error ? error.message : 'Unable to archive generated fit note PDF.'
    console.warn('RecordsWeb generated the fit note PDF but could not archive it before Discord delivery.', error)
  }

  return {
    bytes,
    filename: `${fitNoteAttachmentBaseName(document, patient)}.pdf`,
    contentType: 'application/pdf',
    description: 'RecordsWeb issued fit note PDF',
    source: archived ? 'generated_pdf_archived' : 'generated_pdf_unarchived',
    storage_path: archived ? storagePath : null,
    archive_error: archiveError || null,
  }
}


async function patientDiscordTarget(admin: any, context: any, patientId: string) {
  if (!patientId) return { error: 'Patient is required.', status: 400 }
  const { data: patient, error } = await admin
    .from('patients')
    .select('id,organisation_id,title,first_name,last_name,address,dob,nhs_number,discord_user_id')
    .eq('id', patientId)
    .eq('organisation_id', context.profile.organisation_id)
    .maybeSingle()
  if (error) {
    if (/discord_user_id|schema cache|column/i.test(error.message || '')) {
      throw Object.assign(new Error('Patient Discord IDs are not installed in Supabase. Run supabase/recordsweb-3.8.2-patient-discord-dms.sql.'), { status: 500 })
    }
    throw error
  }
  if (!patient) return { error: 'Patient record not found.', status: 404 }
  if (!patient.discord_user_id) return { patient, skipped: true, reason: 'missing_patient_discord_id' }
  return { patient, discordUserId: snowflake(patient.discord_user_id, 'Patient Discord User ID') }
}

async function openDiscordDmChannel(discordUserId: string) {
  return discordRequest('/users/@me/channels', {
    method: 'POST',
    body: JSON.stringify({ recipient_id: discordUserId }),
  })
}

async function sendPatientDm(discordUserId: string, payload: Record<string, unknown>) {
  const dm = await openDiscordDmChannel(discordUserId)
  return sendMessage(String(dm.id), payload)
}

async function sendPatientFileDm(discordUserId: string, payload: Record<string, unknown>, files: DiscordUploadFile[]) {
  const dm = await openDiscordDmChannel(discordUserId)
  return discordMultipartFilesRequest(`/channels/${String(dm.id)}/messages`, payload, files)
}

async function writeAudit(admin: any, caller: any, action: string, entityType: string, entityId: string | null, description: string, metadata: Record<string, unknown> = {}) {
  try {
    await admin.from('audit_log').insert({
      organisation_id: caller.organisation_id,
      actor_id: caller.id,
      actor_name: caller.display_name,
      actor_role: caller.role,
      action,
      entity_type: entityType,
      entity_id: entityId,
      description,
      metadata,
    })
  } catch (error) {
    console.warn('RecordsWeb Discord audit write failed', error)
  }
}

async function getIntegration(admin: any, organisationId: string) {
  const { data, error } = await admin
    .from('recordsweb_discord_integrations')
    .select('*')
    .eq('organisation_id', organisationId)
    .maybeSingle()
  if (error) {
    if (/does not exist|schema cache|recordsweb_discord_integrations/i.test(error.message || '')) {
      throw new Error('Discord integration is not installed in Supabase. Run supabase/recordsweb-3.4.0-discord-integration.sql.')
    }
    throw error
  }
  return data
}

function integrationPayload(row: any) {
  if (!row) return null
  return {
    organisation_id: row.organisation_id,
    guild_id: row.guild_id,
    guild_name: row.guild_name,
    channel_id: row.channel_id,
    channel_name: row.channel_name,
    maintenance_notifications: row.maintenance_notifications !== false,
    platform_announcements_enabled: row.platform_announcements_enabled !== false,
    critical_notifications_enabled: row.critical_notifications_enabled !== false,
    login_dm_enabled: row.login_dm_enabled !== false,
    verified_at: row.verified_at,
    connected_by_name: row.connected_by_name,
    last_notification_at: row.last_notification_at,
    last_health_check_at: row.last_health_check_at || null,
    last_error: row.last_error,
    updated_at: row.updated_at,
  }
}

async function getSessionContext(admin: any, token: string) {
  const { data: callerData, error: callerError } = await admin.auth.getUser(token)
  if (callerError || !callerData.user) throw Object.assign(new Error('Unauthorised session.'), { status: 401 })
  const { data: profile, error } = await admin
    .from('profiles')
    .select('id,organisation_id,is_management,active,display_name,role,username,title,first_name,last_name,prescriber_signature_svg,organisations!inner(id,org_code,name,active,default_location)')
    .eq('id', callerData.user.id)
    .single()
  if (error || !profile) throw Object.assign(new Error('Unable to verify the RecordsWeb account.'), { status: 403 })
  const organisation = (profile as any).organisations
  if (!profile.active || !organisation?.active) throw Object.assign(new Error('This RecordsWeb account or community is inactive.'), { status: 403 })
  return { user: callerData.user, profile, organisation }
}

function platformOperator(context: any) {
  const email = String(context?.user?.email || '').trim().toLowerCase()
  const orgCode = String(context?.organisation?.org_code || '').trim().toLowerCase()
  const emailCode = email.split('@')[1] || ''
  return Boolean(OPERATOR_EMAIL_PATTERN.test(email) && orgCode && orgCode === emailCode)
}

async function botStatusSafe() {
  try { return { configured: true, bot: await getBotIdentity(), error: '' } }
  catch (error) {
    const message = error instanceof Error ? error.message : 'RecordsWeb Bot is unavailable.'
    if (/RECORDSWEB_DISCORD_BOT_TOKEN|configuration error/i.test(message)) return { configured: false, bot: null, error: message }
    return { configured: true, bot: null, error: message }
  }
}


function relationOne(value: any) {
  return Array.isArray(value) ? value[0] || null : value || null
}

function discordBroadcastColour(severity: string, type: string) {
  if (severity === 'critical' || type === 'critical' || type === 'incident') return 0xB91C1C
  if (severity === 'warning' || type.startsWith('maintenance_')) return 0xD97706
  if (severity === 'success' || type === 'maintenance_complete') return 0x15803D
  return 0x0F6FBD
}

function discordBroadcastTitle(type: string, requested: string) {
  const clean = cleanText(requested, 120)
  if (clean) return clean
  const defaults: Record<string, string> = {
    announcement: 'RecordsWeb announcement',
    incident: 'RecordsWeb service incident',
    critical: 'Critical RecordsWeb notice',
    maintenance_planned: 'Planned RecordsWeb Maintenance',
    maintenance_started: 'RecordsWeb maintenance has started',
    maintenance_update: 'RecordsWeb maintenance update',
    maintenance_complete: 'RecordsWeb maintenance complete',
  }
  return defaults[type] || 'RecordsWeb platform notice'
}

function discordBroadcastEmbed(broadcast: any, organisation: any, operatorName: string) {
  const publicBase = String(Deno.env.get('RECORDSWEB_PUBLIC_URL') || 'https://www.recordsweb.org').replace(/\/$/, '')
  const statusUrl = `${publicBase}/#/status`
  const fields: any[] = []
  if (broadcast.starts_at) fields.push({ name: 'Starts', value: formatDiscordDate(broadcast.starts_at), inline: true })
  if (broadcast.ends_at) fields.push({ name: 'Expected end', value: formatDiscordDate(broadcast.ends_at), inline: true })
  if (Array.isArray(broadcast.affected_services) && broadcast.affected_services.length) {
    fields.push({ name: 'Affected services', value: broadcast.affected_services.map((item: string) => `• ${cleanText(item, 80)}`).join('\n').slice(0, 1024), inline: false })
  }
  fields.push({ name: 'Community', value: `${organisation?.name || 'RecordsWeb community'} (@${organisation?.org_code || 'XX.XX'})`, inline: false })
  return {
    title: discordBroadcastTitle(String(broadcast.broadcast_type || ''), String(broadcast.title || '')),
    description: cleanText(broadcast.message, 1800),
    color: discordBroadcastColour(String(broadcast.severity || 'info'), String(broadcast.broadcast_type || 'announcement')),
    fields,
    url: statusUrl,
    footer: { text: `RecordsWeb Platform Operations${operatorName ? ` · ${operatorName}` : ''}` },
    timestamp: new Date().toISOString(),
  }
}

async function platformIntegrationRows(admin: any) {
  const { data, error } = await admin
    .from('recordsweb_discord_integrations')
    .select('*, organisations!inner(id,name,org_code,system_mode,active)')
    .eq('organisations.active', true)
    .order('updated_at', { ascending: false })
  if (error) {
    if (/does not exist|schema cache|recordsweb_discord_integrations/i.test(error.message || '')) {
      throw new Error('Discord integration is not installed in Supabase. Run the RecordsWeb Discord migrations first.')
    }
    throw error
  }
  return data || []
}

function flattenedIntegration(row: any) {
  const org = relationOne(row.organisations)
  return {
    organisation_id: row.organisation_id,
    organisation_name: org?.name || 'RecordsWeb community',
    organisation_code: org?.org_code || '',
    system_mode: org?.system_mode || 'general_practice',
    guild_id: row.guild_id,
    guild_name: row.guild_name,
    channel_id: row.channel_id,
    channel_name: row.channel_name,
    maintenance_notifications: row.maintenance_notifications !== false,
    platform_announcements_enabled: row.platform_announcements_enabled !== false,
    critical_notifications_enabled: row.critical_notifications_enabled !== false,
    login_dm_enabled: row.login_dm_enabled !== false,
    verified_at: row.verified_at,
    last_health_check_at: row.last_health_check_at || null,
    last_notification_at: row.last_notification_at,
    last_error: row.last_error,
    updated_at: row.updated_at,
  }
}

function broadcastAllowedForIntegration(row: any, type: string) {
  if (type.startsWith('maintenance_')) return row.maintenance_notifications !== false
  if (type === 'critical' || type === 'incident') return row.critical_notifications_enabled !== false
  return row.platform_announcements_enabled !== false
}

function targetIntegration(row: any, broadcast: any, forcedOrganisationIds: string[] | null = null) {
  const org = relationOne(row.organisations)
  const orgId = String(row.organisation_id || '')
  if (forcedOrganisationIds) return forcedOrganisationIds.includes(orgId)
  if (broadcast.target_scope === 'selected') return (broadcast.target_organisation_ids || []).map(String).includes(orgId)
  if (broadcast.target_scope === 'modes') return (broadcast.target_modes || []).map(String).includes(String(org?.system_mode || 'general_practice'))
  return true
}

async function createPlatformBroadcast(admin: any, context: any, input: any) {
  const broadcastType = cleanText(input.broadcast_type, 60) || 'announcement'
  const severity = cleanText(input.severity, 30) || 'info'
  const title = discordBroadcastTitle(broadcastType, input.title)
  const message = cleanText(input.message, 1800)
  if (!message) throw Object.assign(new Error('Enter a Discord broadcast message.'), { status: 400 })
  const targetScope = ['all','modes','selected'].includes(String(input.target_scope)) ? String(input.target_scope) : 'all'
  const targetModes = Array.isArray(input.target_modes) ? input.target_modes.map((x: unknown) => cleanText(x, 40)).filter(Boolean).slice(0, 10) : []
  const targetOrganisationIds = Array.isArray(input.target_organisation_ids) ? input.target_organisation_ids.map((x: unknown) => cleanText(x, 80)).filter(Boolean).slice(0, 200) : []
  const affectedServices = Array.isArray(input.affected_services) ? input.affected_services.map((x: unknown) => cleanText(x, 80)).filter(Boolean).slice(0, 20) : []
  if (targetScope === 'modes' && !targetModes.length) throw Object.assign(new Error('Select at least one care setting.'), { status: 400 })
  if (targetScope === 'selected' && !targetOrganisationIds.length) throw Object.assign(new Error('Select at least one community.'), { status: 400 })

  const row = {
    broadcast_type: broadcastType,
    severity,
    title,
    message,
    target_scope: targetScope,
    target_modes: targetModes,
    target_organisation_ids: targetOrganisationIds,
    affected_services: affectedServices,
    starts_at: input.starts_at || null,
    ends_at: input.ends_at || null,
    status: 'sending',
    created_by: context.profile.id,
    created_by_name: context.profile.display_name || context.user.email || 'Platform operator',
  }
  const { data, error } = await admin.from('recordsweb_discord_broadcasts').insert(row).select('*').single()
  if (error) {
    if (/does not exist|schema cache|recordsweb_discord_broadcasts/i.test(error.message || '')) {
      throw new Error('Platform Discord Operations is not installed in Supabase. Run supabase/recordsweb-3.8.0-platform-discord-operations.sql.')
    }
    throw error
  }
  return data
}

async function deliverPlatformBroadcast(admin: any, context: any, broadcast: any, forcedOrganisationIds: string[] | null = null) {
  const integrations = await platformIntegrationRows(admin)
  const targets = integrations.filter((row: any) => targetIntegration(row, broadcast, forcedOrganisationIds))
  let sent = 0
  let failed = 0
  let skipped = 0
  const failures: Array<{ organisation_id: string, error: string }> = []

  for (const row of targets) {
    const org = relationOne(row.organisations)
    if (!broadcastAllowedForIntegration(row, String(broadcast.broadcast_type || 'announcement'))) {
      skipped += 1
      await admin.from('recordsweb_discord_deliveries').insert({
        broadcast_id: broadcast.id,
        organisation_id: row.organisation_id,
        guild_id: row.guild_id,
        guild_name: row.guild_name || '',
        channel_id: row.channel_id,
        channel_name: row.channel_name || '',
        status: 'skipped',
        error: 'Community notification preference disabled for this broadcast type.',
      })
      continue
    }

    try {
      const result = await sendMessage(String(row.channel_id), { embeds: [discordBroadcastEmbed(broadcast, org, context.profile.display_name || '')] })
      sent += 1
      await admin.from('recordsweb_discord_deliveries').insert({
        broadcast_id: broadcast.id,
        organisation_id: row.organisation_id,
        guild_id: row.guild_id,
        guild_name: row.guild_name || '',
        channel_id: row.channel_id,
        channel_name: row.channel_name || '',
        status: 'sent',
        discord_message_id: String(result?.id || ''),
        delivered_at: new Date().toISOString(),
      })
      await admin.from('recordsweb_discord_integrations').update({ last_notification_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() }).eq('organisation_id', row.organisation_id)
    } catch (error) {
      failed += 1
      const message = error instanceof Error ? error.message : 'Discord notification failed.'
      failures.push({ organisation_id: String(row.organisation_id), error: message })
      await admin.from('recordsweb_discord_deliveries').insert({
        broadcast_id: broadcast.id,
        organisation_id: row.organisation_id,
        guild_id: row.guild_id,
        guild_name: row.guild_name || '',
        channel_id: row.channel_id,
        channel_name: row.channel_name || '',
        status: 'failed',
        error: message.slice(0, 1000),
      })
      await admin.from('recordsweb_discord_integrations').update({ last_error: message.slice(0, 500), updated_at: new Date().toISOString() }).eq('organisation_id', row.organisation_id)
    }
  }

  const finalStatus = failed === 0 ? 'sent' : sent > 0 ? 'partial' : 'failed'
  await admin.from('recordsweb_discord_broadcasts').update({ status: finalStatus, sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', broadcast.id)
  await writeAudit(admin, context.profile, 'platform.discord.broadcast.sent', 'discord_broadcast', broadcast.id, `Sent ${broadcast.broadcast_type} Discord broadcast to ${sent} community channel(s); ${failed} failed; ${skipped} skipped.`, { sent, failed, skipped, broadcast_type: broadcast.broadcast_type })
  return { ok: failed === 0, broadcast_id: broadcast.id, sent, failed, skipped, failures }
}



async function resolvePrescriptionPrescriber(admin: any, context: any, medication: any) {
  const authoriser = cleanText(medication?.authoriser, 160).toLowerCase()
  let matched: any = null
  try {
    const { data } = await admin
      .from('profiles')
      .select('id,username,title,first_name,last_name,display_name,role,active,prescriber_signature_svg')
      .eq('organisation_id', context.profile.organisation_id)
      .eq('active', true)
    matched = (data || []).find((profile: any) => {
      const fullName = [profile?.title, profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim().toLowerCase()
      return [profile?.username, profile?.display_name, fullName].filter(Boolean).some((value: any) => String(value).trim().toLowerCase() === authoriser)
    }) || null
  } catch {}

  const currentFullName = [context.profile?.title, context.profile?.first_name, context.profile?.last_name].filter(Boolean).join(' ').trim()
  const currentMatches = [context.profile?.username, context.profile?.display_name, currentFullName]
    .filter(Boolean)
    .some((value: any) => String(value).trim().toLowerCase() === authoriser)

  return {
    id: matched?.id || (currentMatches ? context.profile?.id : null),
    display_name: cleanText(matched?.display_name || medication?.authoriser || currentFullName || context.profile?.display_name || context.profile?.username, 160),
    username: cleanText(matched?.username || (currentMatches ? context.profile?.username : ''), 160),
    email: cleanText(matched?.username || (currentMatches ? context.user?.email : ''), 160),
    role: cleanText(matched?.role || (currentMatches ? context.profile?.role : '') || 'Clinician', 120),
    location: cleanText(context.organisation?.default_location, 120) || 'Main Site',
    signature_svg: cleanText(matched?.prescriber_signature_svg || (currentMatches ? context.profile?.prescriber_signature_svg : ''), 20000),
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  try {
    const supabaseUrl = requiredEnv('SUPABASE_URL')
    const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })

    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!token || token === authHeader) return json({ error: 'Unauthorised: missing bearer token.' }, 401)
    const context = await getSessionContext(admin, token)
    const body = await req.json().catch(() => ({}))
    const action = cleanText(body.action, 80)

    if (action === 'broadcast-maintenance') {
      if (!platformOperator(context)) return json({ error: 'RecordsWeb platform operator permission is required.' }, 403)
      const botState = await botStatusSafe()
      if (!botState.configured || !botState.bot) return json({ ok: false, configured: botState.configured, error: botState.error || 'RecordsWeb Bot is unavailable.', sent: 0, failed: 0 }, 200)
      const enabled = Boolean(body.enabled)
      const broadcast = await createPlatformBroadcast(admin, context, {
        broadcast_type: enabled ? 'maintenance_started' : 'maintenance_complete',
        severity: enabled ? 'warning' : 'success',
        title: enabled ? 'RecordsWeb platform maintenance' : 'RecordsWeb maintenance complete',
        message: enabled
          ? (cleanText(body.message, 1800) || 'RecordsWeb is currently unavailable while scheduled maintenance is being carried out.')
          : 'RecordsWeb is available again. Staff can sign in normally.',
        target_scope: 'all',
        affected_services: enabled ? ['RecordsWeb staff website', 'Desktop clinical system'] : [],
        ends_at: enabled ? (body.estimated_end_at || null) : null,
      })
      return json({ configured: true, ...(await deliverPlatformBroadcast(admin, context, broadcast)) })
    }

    if (action === 'platform-overview') {
      if (!platformOperator(context)) return json({ error: 'RecordsWeb platform operator permission is required.' }, 403)
      const botState = await botStatusSafe()
      const integrations = await platformIntegrationRows(admin)
      const { count: activeCommunityCount } = await admin.from('organisations').select('id', { count: 'exact', head: true }).eq('active', true)
      const midnight = new Date(); midnight.setUTCHours(0, 0, 0, 0)
      const { data: todayRows, error: todayError } = await admin.from('recordsweb_discord_deliveries').select('status').gte('attempted_at', midnight.toISOString())
      if (todayError && /does not exist|schema cache/i.test(todayError.message || '')) throw new Error('Platform Discord Operations is not installed in Supabase. Run supabase/recordsweb-3.8.0-platform-discord-operations.sql.')
      if (todayError) throw todayError
      return json({
        configured: botState.configured,
        bot: botState.bot,
        error: botState.error || '',
        counts: {
          connected: integrations.length,
          status_channels: integrations.filter((row: any) => row.channel_id).length,
          missing: Math.max(0, Number(activeCommunityCount || 0) - integrations.length),
          sent_today: (todayRows || []).filter((row: any) => row.status === 'sent').length,
          failed_today: (todayRows || []).filter((row: any) => row.status === 'failed').length,
        },
      })
    }

    if (action === 'platform-integrations') {
      if (!platformOperator(context)) return json({ error: 'RecordsWeb platform operator permission is required.' }, 403)
      const rows = await platformIntegrationRows(admin)
      return json({ integrations: rows.map(flattenedIntegration) })
    }

    if (action === 'platform-logs') {
      if (!platformOperator(context)) return json({ error: 'RecordsWeb platform operator permission is required.' }, 403)
      const limit = Math.max(1, Math.min(500, Number(body.limit || 250)))
      const { data, error } = await admin
        .from('recordsweb_discord_deliveries')
        .select('*, recordsweb_discord_broadcasts(title,broadcast_type,severity), organisations(name,org_code)')
        .order('attempted_at', { ascending: false })
        .limit(limit)
      if (error) {
        if (/does not exist|schema cache/i.test(error.message || '')) throw new Error('Platform Discord Operations is not installed in Supabase. Run supabase/recordsweb-3.8.0-platform-discord-operations.sql.')
        throw error
      }
      const logs = (data || []).map((row: any) => {
        const broadcast = relationOne(row.recordsweb_discord_broadcasts)
        const org = relationOne(row.organisations)
        return {
          id: row.id,
          broadcast_id: row.broadcast_id,
          broadcast_title: broadcast?.title || '',
          broadcast_type: broadcast?.broadcast_type || '',
          severity: broadcast?.severity || '',
          organisation_id: row.organisation_id,
          organisation_name: org?.name || '',
          organisation_code: org?.org_code || '',
          guild_id: row.guild_id,
          guild_name: row.guild_name,
          channel_id: row.channel_id,
          channel_name: row.channel_name,
          status: row.status,
          discord_message_id: row.discord_message_id,
          error: row.error,
          attempted_at: row.attempted_at,
          delivered_at: row.delivered_at,
        }
      })
      return json({ logs })
    }

    if (action === 'platform-health-check') {
      if (!platformOperator(context)) return json({ error: 'RecordsWeb platform operator permission is required.' }, 403)
      const botState = await botStatusSafe()
      if (!botState.configured || !botState.bot) return json({ error: botState.error || 'RecordsWeb Bot is unavailable.' }, 503)
      const rows = await platformIntegrationRows(admin)
      let failed = 0
      const results: any[] = []
      for (const row of rows) {
        try {
          const channel = await verifyChannel(String(row.guild_id), String(row.channel_id))
          const now = new Date().toISOString()
          await admin.from('recordsweb_discord_integrations').update({ channel_name: channel.name, verified_at: now, last_health_check_at: now, last_error: null, updated_at: now }).eq('organisation_id', row.organisation_id)
          results.push({ organisation_id: row.organisation_id, ok: true })
        } catch (error) {
          failed += 1
          const message = error instanceof Error ? error.message : 'Discord connection check failed.'
          const now = new Date().toISOString()
          await admin.from('recordsweb_discord_integrations').update({ last_health_check_at: now, last_error: message.slice(0, 500), updated_at: now }).eq('organisation_id', row.organisation_id)
          results.push({ organisation_id: row.organisation_id, ok: false, error: message })
        }
      }
      await writeAudit(admin, context.profile, 'platform.discord.health_check', 'discord', null, `Checked ${rows.length} Discord integration(s); ${failed} failed.`, { checked: rows.length, failed })
      return json({ ok: failed === 0, checked: rows.length, failed, results })
    }

    if (action === 'platform-send-test') {
      if (!platformOperator(context)) return json({ error: 'RecordsWeb platform operator permission is required.' }, 403)
      const organisationId = cleanText(body.organisation_id, 80)
      const rows = await platformIntegrationRows(admin)
      const row = rows.find((item: any) => String(item.organisation_id) === organisationId)
      if (!row) return json({ error: 'That community does not have a configured Discord status channel.' }, 404)
      const org = relationOne(row.organisations)
      const result = await sendMessage(String(row.channel_id), { embeds: [{
        title: 'RecordsWeb Platform Management test',
        description: 'This is a test message from RecordsWeb Platform Management. This channel is configured correctly for platform notices.',
        color: 0x0F6FBD,
        fields: [{ name: 'Community', value: `${org?.name || 'RecordsWeb community'} (@${org?.org_code || 'XX.XX'})`, inline: false }],
        footer: { text: `RecordsWeb Platform Operations · ${context.profile.display_name || 'Operator'}` },
        timestamp: new Date().toISOString(),
      }] })
      const now = new Date().toISOString()
      await admin.from('recordsweb_discord_integrations').update({ verified_at: now, last_health_check_at: now, last_error: null, updated_at: now }).eq('organisation_id', row.organisation_id)
      await writeAudit(admin, context.profile, 'platform.discord.test', 'organisation', row.organisation_id, `Sent a platform Discord test to ${org?.name || 'community'} #${row.channel_name || row.channel_id}.`)
      return json({ ok: true, message_id: String(result?.id || '') })
    }

    if (action === 'platform-broadcast') {
      if (!platformOperator(context)) return json({ error: 'RecordsWeb platform operator permission is required.' }, 403)
      const botState = await botStatusSafe()
      if (!botState.configured || !botState.bot) return json({ error: botState.error || 'RecordsWeb Bot is unavailable.' }, 503)
      const broadcast = await createPlatformBroadcast(admin, context, body)
      return json(await deliverPlatformBroadcast(admin, context, broadcast))
    }

    if (action === 'platform-retry-broadcast') {
      if (!platformOperator(context)) return json({ error: 'RecordsWeb platform operator permission is required.' }, 403)
      const broadcastId = cleanText(body.broadcast_id, 80)
      if (!broadcastId) return json({ error: 'Broadcast id is required.' }, 400)
      const { data: broadcast, error: broadcastError } = await admin.from('recordsweb_discord_broadcasts').select('*').eq('id', broadcastId).maybeSingle()
      if (broadcastError || !broadcast) return json({ error: 'Discord broadcast was not found.' }, 404)
      const { data: deliveries, error: deliveriesError } = await admin.from('recordsweb_discord_deliveries').select('organisation_id,status,attempted_at').eq('broadcast_id', broadcastId).order('attempted_at', { ascending: false })
      if (deliveriesError) throw deliveriesError
      const latest = new Map<string, string>()
      for (const row of deliveries || []) {
        const orgId = String(row.organisation_id || '')
        if (orgId && !latest.has(orgId)) latest.set(orgId, String(row.status || ''))
      }
      const failedOrganisationIds = [...latest.entries()].filter(([, status]) => status === 'failed').map(([orgId]) => orgId)
      if (!failedOrganisationIds.length) return json({ ok: true, sent: 0, failed: 0, skipped: 0, message: 'There are no failed deliveries to retry.' })
      return json(await deliverPlatformBroadcast(admin, context, broadcast, failedOrganisationIds))
    }

    if (!context.profile.is_management) return json({ error: 'Management permission is required.' }, 403)

    if (action === 'status') {
      const botState = await botStatusSafe()
      const integration = await getIntegration(admin, context.profile.organisation_id)
      let channels: any[] = []
      let liveError = ''
      if (botState.configured && botState.bot && integration?.guild_id) {
        try {
          const discovered = await discoverGuild(String(integration.guild_id))
          channels = discovered.channels
        } catch (error) {
          liveError = error instanceof Error ? error.message : 'Discord server verification failed.'
        }
      }
      return json({ ...botState, integration: integrationPayload(integration), channels, live_error: liveError })
    }

    if (action === 'discover-server') {
      const botState = await botStatusSafe()
      if (!botState.configured || !botState.bot) return json({ error: botState.error || 'RecordsWeb Bot is not configured.' }, 503)
      const guildId = snowflake(body.guild_id, 'Discord Server ID')
      const discovered = await discoverGuild(guildId)
      return json({ configured: true, bot: botState.bot, ...discovered })
    }

    if (action === 'save-integration') {
      const botState = await botStatusSafe()
      if (!botState.configured || !botState.bot) return json({ error: botState.error || 'RecordsWeb Bot is not configured.' }, 503)
      const guildId = snowflake(body.guild_id, 'Discord Server ID')
      const channelId = snowflake(body.channel_id, 'Discord Channel ID')
      const discovered = await discoverGuild(guildId)
      const channel = await verifyChannel(guildId, channelId)
      const now = new Date().toISOString()
      const row = {
        organisation_id: context.profile.organisation_id,
        guild_id: guildId,
        guild_name: discovered.guild.name,
        channel_id: channelId,
        channel_name: channel.name,
        maintenance_notifications: body.maintenance_notifications !== false,
        platform_announcements_enabled: body.platform_announcements_enabled !== false,
        critical_notifications_enabled: true,
        login_dm_enabled: body.login_dm_enabled !== false,
        connected_by: context.profile.id,
        connected_by_name: context.profile.display_name,
        verified_at: now,
        last_error: null,
        updated_at: now,
      }
      const { data, error } = await admin.from('recordsweb_discord_integrations').upsert(row, { onConflict: 'organisation_id' }).select('*').single()
      if (error) {
        if (/duplicate|unique|23505/i.test(error.message || '')) return json({ error: 'That Discord channel is already linked to another RecordsWeb community.' }, 409)
        throw error
      }
      await writeAudit(admin, context.profile, 'discord.integration.saved', 'organisation', context.profile.organisation_id, `Connected RecordsWeb Bot to ${discovered.guild.name} #${channel.name}.`, { guild_id: guildId, channel_id: channelId })
      return json({ configured: true, bot: botState.bot, integration: integrationPayload(data), channels: discovered.channels })
    }

    if (action === 'disconnect') {
      const existing = await getIntegration(admin, context.profile.organisation_id)
      const { error } = await admin.from('recordsweb_discord_integrations').delete().eq('organisation_id', context.profile.organisation_id)
      if (error) throw error
      await writeAudit(admin, context.profile, 'discord.integration.disconnected', 'organisation', context.profile.organisation_id, 'Disconnected the community from RecordsWeb Bot.', { guild_id: existing?.guild_id || null, channel_id: existing?.channel_id || null })
      const botState = await botStatusSafe()
      return json({ ...botState, integration: null, channels: [] })
    }

    if (action === 'send-test') {
      const integration = await getIntegration(admin, context.profile.organisation_id)
      if (!integration?.channel_id) return json({ error: 'Connect a Discord server and RecordsWeb status channel first.' }, 400)
      await sendMessage(String(integration.channel_id), {
        embeds: [{
          title: 'RecordsWeb Bot connected',
          description: 'This channel is configured to receive RecordsWeb platform announcements, incidents and maintenance notifications.',
          color: 0x0F6FBD,
          fields: [
            { name: 'Community', value: `${context.organisation.name} (@${context.organisation.org_code})`, inline: true },
            { name: 'Channel', value: `#${integration.channel_name || 'configured-channel'}`, inline: true },
            { name: 'Automatic notifications', value: integration.maintenance_notifications ? 'Enabled' : 'Disabled', inline: true },
          ],
          footer: { text: `Test sent by ${context.profile.display_name}` },
          timestamp: new Date().toISOString(),
        }],
      })
      await admin.from('recordsweb_discord_integrations').update({ verified_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() }).eq('organisation_id', context.profile.organisation_id)
      await writeAudit(admin, context.profile, 'discord.integration.test', 'organisation', context.profile.organisation_id, `Sent a RecordsWeb Bot test message to #${integration.channel_name || integration.channel_id}.`)
      return json({ ok: true })
    }

    if (action === 'send-patient-prescription-dm') {
      const integration = await getIntegration(admin, context.profile.organisation_id)
      if (!integration?.guild_id) return json({ ok: true, sent: false, skipped: true, reason: 'discord_not_connected' })

      const patientId = cleanText(body.patient_id, 80)
      const medicationId = cleanText(body.medication_id, 80)
      const requestedEventType = cleanText(body.event_type, 40)
      const eventType = requestedEventType === 'reauthorised' ? 'reauthorised' : requestedEventType === 'resent' ? 'resent' : 'issued'
      if (!patientId || !medicationId) return json({ error: 'Patient and medication are required.' }, 400)

      const target = await patientDiscordTarget(admin, context, patientId)
      if ((target as any).error) return json({ error: (target as any).error }, Number((target as any).status || 400))
      if ((target as any).skipped) return json({ ok: true, sent: false, skipped: true, reason: (target as any).reason })

      const patient = (target as any).patient
      const { data: medication, error: medicationError } = await admin
        .from('medications')
        .select('id,patient_id,name,dose,quantity,usage,authoriser,last_issue_date,form,method,created_at')
        .eq('id', medicationId)
        .eq('patient_id', patientId)
        .maybeSingle()
      if (medicationError) throw medicationError
      if (!medication) return json({ error: 'Medication record not found.' }, 404)

      const title = eventType === 'reauthorised' ? 'Prescription re-authorised' : eventType === 'resent' ? 'Prescription copy re-sent' : 'Prescription issued'
      const medicationItems = [medication]
      const prescriber = await resolvePrescriptionPrescriber(admin, context, medication)
      const signature = await ensurePrescriberSignature(admin, prescriber)
      const prescriptionImage = await renderPrescriptionImage({ patient, medication, medicationItems, organisation: context.organisation, eventType, prescriber: { ...prescriber, signature_data_uri: signature.dataUri } })
      const fileName = `RecordsWeb-Prescription-${String(patient?.last_name || 'Patient').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'Patient'}-${String(medication?.last_issue_date || new Date().toISOString().slice(0, 10)).slice(0, 10)}.png`

      await sendPatientFileDm(String((target as any).discordUserId), {
        content: eventType === 'reauthorised'
          ? 'A prescription on your RecordsWeb patient record has been re-authorised. Your prescription copy is attached below.'
          : eventType === 'resent'
            ? 'A copy of your prescription has been re-sent from RecordsWeb. The prescription image is attached below.'
            : 'A new prescription has been issued on your RecordsWeb patient record. Your prescription copy is attached below.',
        embeds: [{
          title,
          description: 'The attached prescription copy was generated automatically by RecordsWeb for patient viewing in Discord.',
          color: 0x0F6FBD,
          fields: [
            { name: medicationItems.length > 1 ? 'Medications' : 'Medication', value: medicationItems.map((item: any, index: number) => `${index + 1}. ${cleanText(item?.name, 180) || 'Medication item'} — ${medicationQuantityText(item)}`).join('\n').slice(0, 1024), inline: false },
            { name: 'Items', value: String(medicationItems.length), inline: true },
            { name: 'Issue date', value: displayDateOnly(medication.last_issue_date), inline: true },
            { name: 'Community', value: `${context.organisation.name} (@${context.organisation.org_code})`, inline: false },
          ],
          footer: { text: 'ROLEPLAY / SIMULATION ONLY · Automated RecordsWeb patient notification · Do not reply to this bot' },
          timestamp: new Date().toISOString(),
        }],
      }, [{
        bytes: prescriptionImage,
        filename: fileName,
        contentType: 'image/png',
        description: 'RecordsWeb prescription image',
      }])

      await writeAudit(admin, context.profile, `patient.discord.prescription.${eventType}`, 'medications', medication.id, `${title} Discord DM with prescription image sent to patient.`, {
        patient_id: patientId,
        discord_user_id: (target as any).discordUserId,
        medication_item_count: medicationItems.length,
      })
      return json({ ok: true, sent: true, recipient_id: (target as any).discordUserId, event_type: eventType, attachment: fileName })
    }

    if (action === 'send-patient-fit-note-dm') {
      const integration = await getIntegration(admin, context.profile.organisation_id)
      if (!integration?.guild_id) return json({ ok: true, sent: false, skipped: true, reason: 'discord_not_connected' })

      const patientId = cleanText(body.patient_id, 80)
      const documentId = cleanText(body.document_id, 80)
      const resend = body.resend === true
      if (!patientId || !documentId) return json({ error: 'Patient and fit note are required.' }, 400)

      const target = await patientDiscordTarget(admin, context, patientId)
      if ((target as any).error) return json({ error: (target as any).error }, Number((target as any).status || 400))
      if ((target as any).skipped) return json({ ok: true, sent: false, skipped: true, reason: (target as any).reason })

      const patient = (target as any).patient
      const { data: document, error: documentError } = await admin
        .from('documents')
        .select('id,patient_id,title,category,document_type,status,date,author,details,storage_path')
        .eq('id', documentId)
        .eq('patient_id', patientId)
        .maybeSingle()
      if (documentError) throw documentError
      if (!document) return json({ error: 'Fit note record not found.' }, 404)
      if (document.document_type !== 'Fit Note' && document.category !== 'Fit Note') return json({ error: 'The selected document is not a fit note.' }, 400)

      const details = document.details && typeof document.details === 'object' ? document.details : {}
      const period = details.period_mode === 'duration'
        ? `${cleanText(details.duration_value, 30) || '—'} ${cleanText(details.duration_unit, 40) || ''}`.trim()
        : `${displayDateOnly(details.period_from)} to ${displayDateOnly(details.period_to)}`

      const attachment = await ensureFitNotePdfAttachment(admin, context, document, patient)

      await sendPatientFileDm(String((target as any).discordUserId), {
        content: resend
          ? 'Your Statement of Fitness for Work has been re-sent from RecordsWeb. The fit note PDF is attached below.'
          : 'A Statement of Fitness for Work has been issued on your RecordsWeb patient record. The issued fit note PDF is attached below.',
        embeds: [{
          title: resend ? 'Fit note re-sent' : 'Fit note issued',
          description: 'The attached PDF is the issued fit note document from the patient record.',
          color: 0x0F6FBD,
          fields: [
            { name: 'Advice', value: cleanText(details.advice, 1024) || 'Not specified', inline: false },
            { name: 'Condition(s)', value: cleanText(details.condition, 1024) || 'Not specified', inline: false },
            { name: 'Period', value: period || 'Not specified', inline: false },
            { name: 'Statement date', value: displayDateOnly(details.statement_date || document.date), inline: true },
            { name: 'Issued by', value: cleanText(details.issuer_name || document.author, 1024) || 'RecordsWeb clinician', inline: true },
            { name: 'Community', value: `${context.organisation.name} (@${context.organisation.org_code})`, inline: false },
          ],
          footer: { text: 'ROLEPLAY / SIMULATION ONLY · Automated RecordsWeb patient notification · Do not reply to this bot' },
          timestamp: new Date().toISOString(),
        }],
      }, [attachment])

      await writeAudit(admin, context.profile, resend ? 'patient.discord.fit_note.resent' : 'patient.discord.fit_note.sent', 'documents', document.id, resend ? 'Fit note Discord DM with attached PDF re-sent to patient.' : 'Fit note Discord DM with attached PDF sent to patient.', {
        patient_id: patientId,
        discord_user_id: (target as any).discordUserId,
        attachment_source: attachment.source,
      })
      return json({ ok: true, sent: true, resent: resend, recipient_id: (target as any).discordUserId, attachment: attachment.filename, attachment_source: attachment.source })
    }

    if (action === 'send-login-dm') {
      const integration = await getIntegration(admin, context.profile.organisation_id)
      if (!integration?.login_dm_enabled) return json({ error: 'Staff login DMs are disabled for this community.' }, 403)
      const userId = cleanText(body.user_id, 80)
      const temporaryPassword = String(body.temporary_password || '')
      const resetPassword = body.reset_password === true
      if (!userId) return json({ error: 'Staff account is required.' }, 400)
      if (temporaryPassword.length < 10) return json({ error: 'A valid temporary password is required before sending login details.' }, 400)
      const { data: target, error: targetError } = await admin.from('profiles').select('id,organisation_id,username,display_name,discord_user_id,active,must_change_password').eq('id', userId).maybeSingle()
      if (targetError || !target || target.organisation_id !== context.profile.organisation_id) return json({ error: 'Staff account not found.' }, 404)
      if (!target.active) return json({ error: 'This RecordsWeb staff account is disabled.' }, 400)
      const discordUserId = snowflake(target.discord_user_id, 'Staff Discord User ID')
      const publicUrl = String(Deno.env.get('RECORDSWEB_PUBLIC_URL') || 'https://www.recordsweb.org').replace(/\/$/, '')

      // When Management selects "Set password & send DM", do both operations in this
      // already-authorised server request. This prevents a self-password reset from
      // invalidating the browser session before the Discord delivery call is made.
      if (resetPassword) {
        const policy = validatePassword(temporaryPassword, target.username)
        if (policy) return json({ error: policy }, 400)
        const { data: recent, error: recentError } = await admin.rpc('recordsweb_service_password_recently_used', { p_user_id: target.id, p_password: temporaryPassword })
        if (recentError) return json({ error: recentError.message || 'Unable to check password history.' }, 500)
        if (recent) return json({ error: 'Choose a temporary password this user has not used recently.' }, 400)
        const { error: resetError } = await admin.auth.admin.updateUserById(target.id, { password: temporaryPassword })
        if (resetError) return json({ error: resetError.message }, 400)
        const { error: historyError } = await admin.rpc('recordsweb_service_record_password', { p_user_id: target.id, p_password: temporaryPassword })
        if (historyError) return json({ error: 'Password changed, but password history could not be recorded. Contact the RecordsWeb administrator.' }, 500)
        await admin.from('profiles').update({ must_change_password: true, updated_at: new Date().toISOString() }).eq('id', target.id)
        await writeAudit(admin, context.profile, 'account.password.reset_by_management', 'profile', target.id, `Reset password for ${target.username}; password change required at next sign-in.`, { delivery: 'discord' })
      }
      const deliveryFormat = 'image-only'
      await sendRecordsWebLoginImageDm({
        discordUserId,
        username: target.username,
        temporaryPassword,
        organisationName: context.organisation.name,
        organisationCode: context.organisation.org_code,
        publicUrl,
        version: String(Deno.env.get('RECORDSWEB_VERSION') || '4.0.0'),
      })

      await writeAudit(admin, context.profile, 'account.discord_login_dm.sent', 'profile', target.id, `Sent RecordsWeb login details by Discord DM to ${target.display_name}.`, { discord_user_id: discordUserId, delivery_format: deliveryFormat, password_reset: resetPassword })
      return json({ ok: true, recipient_id: discordUserId, delivery_format: deliveryFormat, password_reset: resetPassword })
    }

    return json({ error: 'Unknown action.' }, 400)
  } catch (error) {
    console.error('recordsweb-discord error', error)
    const status = Number((error as any)?.status || 500)
    let message = error instanceof Error ? error.message : 'Unexpected RecordsWeb Discord service error.'
    if (status === 403 && /Cannot send messages to this user|50007/i.test(message)) message = 'Discord would not accept a DM for this user. Make sure they share the community server with RecordsWeb Bot and allow DMs from server members.'
    if (status === 404 && /Unknown Guild|10004/i.test(message)) message = 'RecordsWeb Bot is not in that Discord server. Add the bot first, then retry.'
    if (status === 403 && /Missing Permissions|50013/i.test(message)) message = 'RecordsWeb Bot does not have permission to send messages in the selected channel.'
    return json({ error: message }, status >= 400 && status < 600 ? status : 500)
  }
})
