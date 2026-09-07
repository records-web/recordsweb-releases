function clean(value) {
  return String(value || '').trim()
}

export function getGitHubUpdateConfig() {
  return {
    owner: clean(import.meta.env.VITE_GITHUB_UPDATE_OWNER),
    repo: clean(import.meta.env.VITE_GITHUB_UPDATE_REPO),
    channel: clean(import.meta.env.VITE_GITHUB_UPDATE_CHANNEL) || 'latest',
  }
}

export function hasGitHubUpdateConfig(config = getGitHubUpdateConfig()) {
  return Boolean(config.owner && config.repo)
}
