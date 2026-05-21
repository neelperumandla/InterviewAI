/**
 * WebSocket base URL for the interview API.
 *
 * - Dev: defaults to same host as Vite (proxy forwards /ws → API).
 * - Vercel: set VITE_WS_URL to your Railway URL, e.g. wss://app.up.railway.app/ws
 */
export function getWebSocketBase(): string {
  const configured = import.meta.env.VITE_WS_URL?.trim()
  if (configured) {
    return configured.replace(/\/$/, '')
  }

  if (import.meta.env.DEV) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${window.location.host}/ws`
  }

  console.error(
    '[InterviewAI] VITE_WS_URL is not set. Add it in Vercel → Settings → Environment Variables.',
  )
  return `wss://${window.location.host}/ws`
}
