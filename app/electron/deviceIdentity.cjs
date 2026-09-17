const crypto = require('crypto')
const fs = require('node:fs')
const os = require('node:os')
const { spawnSync } = require('node:child_process')

function readWindowsMachineGuid() {
  if (process.platform !== 'win32') return ''
  try {
    const result = spawnSync('reg.exe', ['QUERY', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], { encoding: 'utf8', windowsHide: true })
    if (result.status !== 0) return ''
    return String(result.stdout || '').match(/MachineGuid\s+REG_\w+\s+([^\r\n]+)/i)?.[1]?.trim() || ''
  } catch { return '' }
}

function readLinuxMachineId() {
  if (process.platform !== 'linux') return ''
  for (const file of ['/etc/machine-id', '/var/lib/dbus/machine-id']) {
    try { const value = fs.readFileSync(file, 'utf8').trim(); if (value) return value } catch {}
  }
  return ''
}

function readMacPlatformUuid() {
  if (process.platform !== 'darwin') return ''
  try {
    const result = spawnSync('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'], { encoding: 'utf8' })
    if (result.status !== 0) return ''
    return String(result.stdout || '').match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/i)?.[1]?.trim() || ''
  } catch { return '' }
}

function stableRawId() {
  return readWindowsMachineGuid() || readLinuxMachineId() || readMacPlatformUuid() || `${os.hostname()}|${os.platform()}|${os.arch()}|${os.userInfo().uid ?? ''}`
}

function deviceIdentity() {
  const raw = stableRawId()
  return {
    hash: crypto.createHash('sha256').update(`recordsweb-device-v4|${raw}`).digest('hex'),
    name: os.hostname() || 'RecordsWeb Desktop',
    platform: `${os.platform()} ${os.release()} ${os.arch()}`,
  }
}

module.exports = { deviceIdentity }
