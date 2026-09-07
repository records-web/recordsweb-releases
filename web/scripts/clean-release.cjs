const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const release = path.join(root, 'release')

if (process.platform === 'win32') {
  spawnSync('taskkill.exe', ['/IM', 'RecordsWeb.exe', '/F'], {
    stdio: 'ignore',
    windowsHide: true,
  })
}

try {
  fs.rmSync(release, {
    recursive: true,
    force: true,
    maxRetries: 12,
    retryDelay: 300,
  })
  console.log('RecordsWeb release output cleaned.')
} catch (error) {
  console.error('Could not clean the release folder. Close RecordsWeb and try again.')
  console.error(error)
  process.exit(1)
}
