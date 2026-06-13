import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// TODO P0-cleanup: localize fonts — styles/ds/styles.css @imports Noto/IBM Plex
// from the Google Fonts CDN. Self-host them in a later pass.
import './styles/ds/styles.css'
import './styles/app.css'

import { App } from './App'
import { ToastProvider } from './shell/Toast'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, refetchOnWindowFocus: false } },
})

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <App />
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
