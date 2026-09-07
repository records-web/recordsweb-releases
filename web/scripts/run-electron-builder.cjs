const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return
  const text = fs.readFileSync(filePath, 'utf8')
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!match) continue
    const key = match[1]
    let value = match[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
}

function buildTimestamp() {
  const now = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    '-',
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('')
}

loadEnvFile(path.join(root, '.env'))
loadEnvFile(path.join(root, '.env.local'))

const owner = String(process.env.VITE_GITHUB_UPDATE_OWNER || '').trim()
const repo = String(process.env.VITE_GITHUB_UPDATE_REPO || '').trim()

if (!owner || !repo || owner.startsWith('YOUR_') || repo.startsWith('YOUR_')) {
  console.error('\nRecordsWeb build stopped: GitHub update repository is not configured.')
  console.error('Set VITE_GITHUB_UPDATE_OWNER and VITE_GITHUB_UPDATE_REPO in .env, then run the build again.\n')
  process.exit(1)
}

const packageJsonPath = path.join(root, 'package.json')
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
const version = packageJson.version || '0.0.0'

// Build into a NEW directory every time. On Windows a previously launched
// release\\win-unpacked\\RecordsWeb.exe can keep resources\\app.asar locked.
// Using a unique output directory means the builder never has to delete or
// overwrite that locked file, so a stale unpacked test instance cannot block
// a new installer build.
const relativeOutput = path.join('release', `RecordsWeb-${version}-${buildTimestamp()}`)
const outputDirectory = path.join(root, relativeOutput)
fs.mkdirSync(outputDirectory, { recursive: true })

const requestedArgs = process.argv.slice(2)
const buildingMac = requestedArgs.some((arg) => arg === '--mac' || arg === '-m')
const hasMacSigningCertificate = Boolean(String(process.env.CSC_LINK || process.env.CSC_NAME || '').trim())

const builderConfig = {
  ...(packageJson.build || {}),
  directories: {
    ...((packageJson.build && packageJson.build.directories) || {}),
    output: relativeOutput.replace(/\\/g, '/'),
  },
}

// A GitHub macOS runner can produce a test/internal DMG without an Apple
// Developer certificate. Hardened Runtime must be disabled for that unsigned
// fallback. When CSC_LINK/CSC_NAME is present, the normal signed mac config is
// retained so electron-builder can sign (and notarize when Apple credentials
// are also supplied). Signed macOS builds are required for auto-updating.
if (buildingMac && !hasMacSigningCertificate) {
  builderConfig.mac = {
    ...(builderConfig.mac || {}),
    identity: null,
    hardenedRuntime: false,
    gatekeeperAssess: false,
    notarize: false,
  }
  console.warn('\nRecordsWeb macOS build: no signing certificate was supplied.')
  console.warn('An unsigned DMG will be produced. macOS automatic updates require a signed build.\n')
}

const tempConfigPath = path.join(root, '.recordsweb-electron-builder.json')
fs.writeFileSync(tempConfigPath, JSON.stringify(builderConfig, null, 2), 'utf8')

console.log(`Building RecordsWeb ${version} into:`)
console.log(outputDirectory)
console.log('A fresh output directory is used so locked older win-unpacked builds are ignored.\n')

const bin = process.platform === 'win32'
  ? path.join(root, 'node_modules', '.bin', 'electron-builder.cmd')
  : path.join(root, 'node_modules', '.bin', 'electron-builder')

const args = [
  ...process.argv.slice(2),
  `--config=${tempConfigPath}`,
  '--publish',
  'never',
]

let result
try {
  result = spawnSync(bin, args, {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
} finally {
  try { fs.rmSync(tempConfigPath, { force: true }) } catch {}
}

if (result?.error) {
  console.error(result.error)
  process.exit(1)
}

if ((result?.status ?? 1) === 0) {
  console.log('\nRecordsWeb package completed successfully.')
  console.log('GitHub release assets are in:')
  console.log(outputDirectory)

  let assets = []
  try {
    assets = fs.readdirSync(outputDirectory)
      .filter((name) => /(?:\.exe|\.dmg|\.zip|\.blockmap|latest(?:-mac)?\.yml)$/i.test(name))
      .sort()
  } catch {}

  if (assets.length) {
    console.log('\nUpload these release assets:')
    for (const asset of assets) console.log(`  ${asset}`)
    console.log('')
  }
}

process.exit(result?.status ?? 1)
