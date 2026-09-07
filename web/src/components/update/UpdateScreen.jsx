import React from 'react'
import recordsWebUpdateLogo from '../../assets/recordsweb-update-logo.png'

function formatBytes(bytes) {
  const value = Number(bytes || 0)
  if (!value) return ''
  if (value >= 1024 ** 3) return `${(value / (1024 ** 3)).toFixed(1)} GB`
  if (value >= 1024 ** 2) return `${(value / (1024 ** 2)).toFixed(1)} MB`
  if (value >= 1024) return `${(value / 1024).toFixed(0)} KB`
  return `${value} B`
}

export default function UpdateScreen({
  stage = 'checking',
  percent = 0,
  currentVersion,
  targetVersion,
  transferred,
  total,
  error,
  onRetry,
  onQuit,
}) {
  const checking = stage === 'checking'
  const installing = stage === 'installing'
  const failed = stage === 'error'
  const progress = Math.max(0, Math.min(100, Number(percent || 0)))

  const headline = failed
    ? 'RecordsWeb could not be updated'
    : checking
      ? 'Checking RecordsWeb version'
      : installing
        ? 'RecordsWeb is finishing the update'
        : 'RecordsWeb is being updated'

  const statusText = failed
    ? 'Update required'
    : checking
      ? 'Checking for updates'
      : installing
        ? 'Installing update'
        : 'System update in progress'

  return (
    <main className="update-screen-shell" aria-live="polite">
      <section className="update-card">
        <img draggable={false} className="update-logo" src={recordsWebUpdateLogo} alt="RecordsWeb" />

        <div className={`update-status-pill ${failed ? 'is-error' : ''}`}>
          <span className="update-status-dot" />
          {statusText}
        </div>

        <h1>{headline}</h1>

        {failed ? (
          <p className="update-copy">
            RecordsWeb must verify and install the latest version before staff can sign in.
            Check the network connection and try again.
          </p>
        ) : checking ? (
          <p className="update-copy">
            RecordsWeb is checking that this computer has the latest approved application version.
          </p>
        ) : (
          <p className="update-copy">
            We're making improvements to RecordsWeb to keep your clinical workspace fast, secure and reliable.
            Please don't close RecordsWeb while the update is underway.
          </p>
        )}

        {!checking && !failed && (
          <div className="update-progress-wrap">
            <div className="update-progress-labels">
              <strong>{installing ? 'Installing update' : 'Downloading update'}</strong>
              <strong>{Math.round(progress)}%</strong>
            </div>
            <div className="update-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(progress)}>
              <div className="update-progress-bar" style={{ width: `${progress}%` }} />
            </div>
            {(transferred || total) ? (
              <div className="update-transfer-copy">
                {formatBytes(transferred)}{total ? ` of ${formatBytes(total)}` : ''}
              </div>
            ) : null}
          </div>
        )}

        {checking && <div className="update-checking-line"><span /></div>}

        {failed ? (
          <div className="update-error-panel">
            <strong>RecordsWeb cannot continue on an unverified version.</strong>
            <span>{error || 'The update service could not be reached.'}</span>
          </div>
        ) : (
          <div className="update-information-panel">
            <strong>{installing ? 'Finishing up.' : checking ? 'Please wait.' : 'Almost there.'}</strong>{' '}
            {installing
              ? 'RecordsWeb will restart automatically when installation has finished.'
              : checking
                ? 'The sign-in page will open automatically when the version check is complete.'
                : 'RecordsWeb will automatically become available when the update has finished.'}
          </div>
        )}

        {failed && (
          <div className="update-error-actions">
            <button type="button" className="update-secondary-button" onClick={onQuit}>Close RecordsWeb</button>
            <button type="button" className="update-primary-button" onClick={onRetry}>Try again</button>
          </div>
        )}

        <footer className="update-footer">
          <span>RecordsWeb · Clinical Records Platform</span>
          <span>
            {currentVersion ? `Installed v${currentVersion}` : 'Version checking'}
            {targetVersion ? ` · Required v${targetVersion}` : ''}
          </span>
          <span>{new Date().getFullYear()} · Please contact your system administrator if you need assistance.</span>
        </footer>
      </section>
    </main>
  )
}
