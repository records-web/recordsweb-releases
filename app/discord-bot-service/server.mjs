import http from 'node:http'
import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCanvas, loadImage } from '@napi-rs/canvas'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT || 8787)
const DISCORD_API = 'https://discord.com/api/v10'
const BOT_TOKEN = String(process.env.RECORDSWEB_DISCORD_BOT_TOKEN || '').trim()
const SHARED_SECRET = String(process.env.RECORDSWEB_DISCORD_RENDERER_SECRET || '').trim()
const DEFAULT_PUBLIC_URL = String(process.env.RECORDSWEB_PUBLIC_URL || 'https://www.recordsweb.org').replace(/\/$/, '')
const DEFAULT_VERSION = String(process.env.RECORDSWEB_VERSION || '3.4.1').trim()

function json(res, status, body) {
  const payload = Buffer.from(JSON.stringify(body))
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': String(payload.length),
    'Cache-Control': 'no-store',
  })
  res.end(payload)
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''))
  const right = Buffer.from(String(b || ''))
  if (left.length !== right.length || !left.length) return false
  return crypto.timingSafeEqual(left, right)
}

async function readJson(req) {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    total += chunk.length
    if (total > 128 * 1024) throw Object.assign(new Error('Request body is too large.'), { status: 413 })
    chunks.push(chunk)
  }
  if (!chunks.length) return {}
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) }
  catch { throw Object.assign(new Error('Invalid JSON request body.'), { status: 400 }) }
}

function required(value, label, max = 500) {
  const clean = String(value || '').trim().slice(0, max)
  if (!clean) throw Object.assign(new Error(`${label} is required.`), { status: 400 })
  return clean
}

function discordId(value, label = 'Discord User ID') {
  const clean = required(value, label, 24)
  if (!/^\d{17,20}$/.test(clean)) throw Object.assign(new Error(`${label} must be a valid Discord snowflake.`), { status: 400 })
  return clean
}

async function discord(pathname, init = {}) {
  if (!BOT_TOKEN) throw Object.assign(new Error('RECORDSWEB_DISCORD_BOT_TOKEN is not configured.'), { status: 503 })
  const response = await fetch(`${DISCORD_API}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bot ${BOT_TOKEN}`,
      ...(init.headers || {}),
    },
  })
  const text = await response.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (!response.ok) {
    const message = data?.message || (typeof data === 'string' ? data : '') || `Discord returned HTTP ${response.status}.`
    const error = Object.assign(new Error(message), { status: response.status, code: data?.code })
    throw error
  }
  return data
}

function roundedRect(ctx, x, y, w, h, radius = 10) {
  const r = Math.min(radius, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function fitText(ctx, text, maxWidth, initialSize, minSize = 17, weight = '400') {
  let size = initialSize
  while (size > minSize) {
    ctx.font = `${weight} ${size}px Arial`
    if (ctx.measureText(text).width <= maxWidth) return size
    size -= 1
  }
  return minSize
}

function field(ctx, { label, value, y, secret = false }) {
  const labelX = 68
  const inputX = 278
  const inputW = 520
  const inputH = 58
  ctx.fillStyle = '#d7e7f4'
  ctx.font = '500 21px Arial'
  ctx.fillText(label, labelX, y + 38)

  ctx.fillStyle = '#0b1a24'
  ctx.strokeStyle = '#355669'
  ctx.lineWidth = 1.5
  roundedRect(ctx, inputX, y, inputW, inputH, 2)
  ctx.fill(); ctx.stroke()

  const display = secret ? value : value
  const fontSize = fitText(ctx, display, inputW - 36, 22, 16)
  ctx.font = `400 ${fontSize}px Arial`
  ctx.fillStyle = '#f4f8fb'
  ctx.fillText(display, inputX + 18, y + 37)
}

function button(ctx, x, y, w, h, text, primary = false) {
  ctx.fillStyle = primary ? '#19384c' : '#102735'
  ctx.strokeStyle = primary ? '#5b8198' : '#446577'
  ctx.lineWidth = 1.4
  roundedRect(ctx, x, y, w, h, 1)
  ctx.fill(); ctx.stroke()
  ctx.font = '600 19px Arial'
  ctx.fillStyle = '#f5f8fa'
  const tw = ctx.measureText(text).width
  ctx.fillText(text, x + (w - tw) / 2, y + 31)
}

async function renderLoginCard(data) {
  const width = 1200
  const height = 760
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')

  const gradient = ctx.createLinearGradient(0, 0, width, height)
  gradient.addColorStop(0, '#07131c')
  gradient.addColorStop(1, '#0d202c')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)

  ctx.strokeStyle = '#29485b'
  ctx.lineWidth = 1.2
  roundedRect(ctx, 1, 1, width - 2, height - 2, 11)
  ctx.stroke()

  ctx.fillStyle = '#0f151b'
  ctx.fillRect(0, 0, width, 44)
  ctx.strokeStyle = '#232d34'
  ctx.beginPath(); ctx.moveTo(0, 44); ctx.lineTo(width, 44); ctx.stroke()

  ctx.fillStyle = '#d9e4ea'
  ctx.font = '500 17px Arial'
  ctx.fillText('RecordsWeb', 22, 29)
  ctx.textAlign = 'right'
  ctx.fillText('×', width - 24, 28)
  ctx.textAlign = 'left'

  try {
    const logo = await loadImage(path.join(__dirname, 'assets', 'RW-Logo.png'))
    const ratio = Math.min(126 / logo.width, 78 / logo.height)
    ctx.drawImage(logo, 42, 70, logo.width * ratio, logo.height * ratio)
  } catch {}

  ctx.fillStyle = '#058dec'
  ctx.font = '700 41px Arial'
  ctx.fillText('RecordsWeb', 158, 121)

  ctx.textAlign = 'right'
  ctx.fillStyle = '#78a9c7'
  ctx.font = '400 13px Arial'
  ctx.fillText(`RecordsWeb ${data.version} · Desktop Clinical System`, width - 54, 82)
  ctx.fillStyle = '#ffffff'
  const orgSize = fitText(ctx, data.organisationName, 360, 24, 17, '700')
  ctx.font = `700 ${orgSize}px Arial`
  ctx.fillText(data.organisationName, width - 54, 120)
  ctx.fillStyle = '#61a9d8'
  ctx.font = '400 14px Arial'
  ctx.fillText('Health care records', width - 54, 142)
  ctx.textAlign = 'left'

  ctx.strokeStyle = '#0789e6'
  ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(28, 166); ctx.lineTo(width - 28, 166); ctx.stroke()

  ctx.fillStyle = '#eef5f9'
  ctx.font = '700 25px Arial'
  ctx.fillText('Sign in with RecordsWeb credentials', 58, 226)
  ctx.fillStyle = '#8fb7d0'
  ctx.font = '400 16px Arial'
  ctx.fillText('Temporary access details generated securely by RecordsWeb Bot', 58, 254)

  field(ctx, { label: 'Username', value: data.username, y: 292 })
  field(ctx, { label: 'Temporary password', value: data.temporaryPassword, y: 372, secret: true })
  field(ctx, { label: 'Organisation', value: `@${data.organisationCode}`, y: 452 })

  button(ctx, 450, 536, 168, 54, 'Sign in', true)
  button(ctx, 634, 536, 168, 54, 'Close', false)

  ctx.fillStyle = '#5ba7d4'
  ctx.font = '400 14px Arial'
  ctx.fillText('Change this password after your first sign-in.', 278, 621)

  ctx.strokeStyle = '#2c4d60'
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(28, 653); ctx.lineTo(width - 28, 653); ctx.stroke()

  ctx.fillStyle = '#a8c4d5'
  ctx.font = '400 14px Arial'
  ctx.fillText('Connection: RecordsWeb Supabase', 32, 689)
  ctx.textAlign = 'right'
  ctx.fillText(`Organisation: @${data.organisationCode}`, width - 32, 689)
  ctx.textAlign = 'left'

  ctx.fillStyle = '#6f91a5'
  ctx.font = '400 12px Arial'
  ctx.fillText('Confidential staff access information. Do not share this image or temporary password with anyone.', 32, 723)
  ctx.fillText('RecordsWeb will never ask you to send your password back by Discord.', 32, 743)

  return canvas.toBuffer('image/png')
}

async function sendLoginCard(data) {
  const discordUserId = discordId(data.discord_user_id)
  const username = required(data.username, 'Username', 160)
  const temporaryPassword = required(data.temporary_password, 'Temporary password', 180)
  const organisationName = required(data.organisation_name, 'Organisation name', 120)
  const organisationCode = required(data.organisation_code, 'Organisation code', 24).replace(/^@/, '')
  const publicUrl = String(data.public_url || DEFAULT_PUBLIC_URL).replace(/\/$/, '')
  const version = String(data.version || DEFAULT_VERSION).trim().slice(0, 24)

  const png = await renderLoginCard({ username, temporaryPassword, organisationName, organisationCode, publicUrl, version })
  const dm = await discord('/users/@me/channels', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient_id: discordUserId }),
  })

  const payload = {
    content: `**RecordsWeb login details**\nYour temporary RecordsWeb access details are attached below. Keep this message private.\n\nStaff area: ${publicUrl}`,
    allowed_mentions: { parse: [] },
  }
  const form = new FormData()
  form.append('payload_json', JSON.stringify(payload))
  form.append('files[0]', new Blob([png], { type: 'image/png' }), 'recordsweb-login-details.png')

  const message = await discord(`/channels/${dm.id}/messages`, { method: 'POST', body: form })
  return { ok: true, recipient_id: discordUserId, dm_channel_id: String(dm.id), message_id: String(message?.id || ''), image_bytes: png.length }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
    if (req.method === 'GET' && url.pathname === '/health') {
      return json(res, 200, { ok: true, service: 'recordsweb-discord-bot-service', canvas: '@napi-rs/canvas', version: DEFAULT_VERSION })
    }
    if (req.method !== 'POST' || url.pathname !== '/send-login-card') return json(res, 404, { error: 'Not found.' })
    if (!SHARED_SECRET) return json(res, 503, { error: 'RECORDSWEB_DISCORD_RENDERER_SECRET is not configured.' })
    if (!safeEqual(req.headers['x-recordsweb-secret'], SHARED_SECRET)) return json(res, 401, { error: 'Unauthorised RecordsWeb renderer request.' })
    const body = await readJson(req)
    const result = await sendLoginCard(body)
    return json(res, 200, result)
  } catch (error) {
    const status = Number(error?.status || 500)
    let message = error instanceof Error ? error.message : 'RecordsWeb Discord Bot service failed.'
    if (status === 403 && /Cannot send messages to this user|50007/i.test(message)) message = 'Discord would not accept a DM for this user. They must share a server with RecordsWeb Bot and allow direct messages.'
    if (status === 403 && /Missing Permissions|50013/i.test(message)) message = 'RecordsWeb Bot is missing Discord permissions.'
    console.error('recordsweb-discord-bot-service', error)
    return json(res, status >= 400 && status < 600 ? status : 500, { error: message })
  }
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`RecordsWeb Discord Bot service listening on :${PORT}`)
})
