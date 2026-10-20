'use client'

import { useEffect } from 'react'

/**
 * Mounts once in the root layout. Listens for uncaught errors and
 * unhandled promise rejections and posts a trimmed report to
 * /api/logs. Identical messages are deduped for 10 seconds so a
 * render loop cannot spam the endpoint. Renders nothing.
 */
export default function ErrorReporter() {
  useEffect(() => {
    const seen = new Map<string, number>()

    function report(message: string, stack: string | undefined) {
      const now = Date.now()
      const last = seen.get(message)
      if (last !== undefined && now - last < 10_000) return
      seen.set(message, now)

      try {
        void fetch('/api/logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: message.slice(0, 500),
            route: window.location.pathname,
            stack: stack ? stack.slice(0, 1500) : undefined,
          }),
          keepalive: true,
        }).catch(() => undefined)
      } catch {
        // Reporting must never throw into the app.
      }
    }

    function onError(event: ErrorEvent) {
      const message = event.message || 'Unknown error'
      const stack = event.error instanceof Error ? event.error.stack : undefined
      report(message, stack)
    }

    function onRejection(event: PromiseRejectionEvent) {
      const reason: unknown = event.reason
      if (reason instanceof Error) {
        report(reason.message || 'Unhandled rejection', reason.stack)
      } else {
        report(`Unhandled rejection: ${String(reason).slice(0, 400)}`, undefined)
      }
    }

    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  return null
}
