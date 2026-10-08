import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n'
import App from './App'
import { syncServerClock } from './lib/serverClock'

// Learn how far this device's clock is from the server's, for the shared match clock
syncServerClock()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
