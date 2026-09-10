import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { applySettings } from './lib/settings'
import { applyRecordsWebProductBrand } from './lib/organisationSettings'
import { installEmbeddedMediaBehavior } from './lib/embeddedMedia'

document.documentElement.classList.add('rw-web-runtime')
applySettings()
applyRecordsWebProductBrand()
installEmbeddedMediaBehavior()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
)
