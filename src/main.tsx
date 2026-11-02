import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n'
import App from './App'
import { syncServerClock } from './lib/serverClock'
import { keepFullScreen } from './lib/iosViewport'

// Learn how far this device's clock is from the server's, for the shared match clock
syncServerClock()

// An iPhone's Home Screen app can get stuck with a short screen after the keyboard closes
const root = document.getElementById('root')!
keepFullScreen(root)

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
