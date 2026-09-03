import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { applySettings } from './lib/settings'
import { applyOrganisationSettings } from './lib/organisationSettings'
import { installDesktopFocusFix } from './lib/desktopFocusFix'
import { installEmbeddedMediaBehavior } from './lib/embeddedMedia'

applySettings()
applyOrganisationSettings()
installDesktopFocusFix()
installEmbeddedMediaBehavior()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
)
