import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './i18n'
import './index.css'
import App from './App.tsx'
import { RosProvider } from './ros/RosProvider.tsx'
import { ThemeProvider } from './theme/ThemeProvider.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <RosProvider>
        <App />
      </RosProvider>
    </ThemeProvider>
  </StrictMode>,
)
