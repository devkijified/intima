'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Mail, CheckCircle2, XCircle, Loader2 } from '@/lib/icons'

/**
 * Admin → Email setup: one-time Gmail OAuth connection so the app's
 * own cron can read UBA credit alerts and auto-credit coin transfers.
 */
export default function EmailSetupPage() {
  const params = useSearchParams()
  const [connected, setConnected] = useState<boolean | null>(null)

  useEffect(() => {
    if (params.get('connected') === '1') setConnected(true)
    else if (params.get('error')) setConnected(false)
    else {
      // Check current status.
      fetch('/api/admin/email-status')
        .then((r) => r.json())
        .then((d) => setConnected(!!d.connected))
        .catch(() => setConnected(false))
    }
  }, [params])

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold text-gray-900">Transfer email setup</h1>
      <p className="mt-1 text-sm text-gray-500">
        Connect the Gmail inbox that receives UBA credit alerts. The app checks it
        every 5 minutes and credits coins automatically when a transfer matches.
      </p>

      <div className="mt-6 rounded-2xl border bg-white p-6">
        {connected === null ? (
          <p className="text-gray-500"><Loader2 className="inline h-4 w-4 animate-spin" /> Checking…</p>
        ) : connected ? (
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            <div>
              <p className="font-semibold text-gray-900">Gmail connected</p>
              <p className="text-sm text-gray-500">Transfer auto-confirm is live. Reconnect anytime to switch inboxes.</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <XCircle className="h-8 w-8 text-gray-300" />
            <div>
              <p className="font-semibold text-gray-900">Not connected</p>
              <p className="text-sm text-gray-500">Transfers will need manual confirmation until you connect.</p>
            </div>
          </div>
        )}

        <a
          href="/api/auth/gmail/connect"
          className="mt-5 flex items-center justify-center gap-2 rounded-full bg-[#AC244D] py-3 text-sm font-bold text-white"
        >
          <Mail className="h-4 w-4" />
          {connected ? 'Reconnect Gmail' : 'Connect Gmail'}
        </a>

        {params.get('error') === 'oauth_failed' && (
          <p className="mt-3 text-sm text-red-600">Connection failed. Try again.</p>
        )}
      </div>

      <div className="mt-6 rounded-2xl border bg-white p-6 text-sm text-gray-600">
        <p className="font-semibold text-gray-900">One-time Google Cloud setup</p>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5">
          <li>Go to <span className="font-mono">console.cloud.google.com</span> → create a project</li>
          <li>Enable the <span className="font-medium">Gmail API</span></li>
          <li>Create OAuth credentials (Web application)</li>
          <li>Add authorized redirect URI:<br />
            <code className="rounded bg-gray-100 px-2 py-0.5 text-xs">https://intima-snowy.vercel.app/api/auth/gmail/callback</code>
          </li>
          <li>Add to Vercel env vars: <code className="rounded bg-gray-100 px-1 text-xs">GOOGLE_CLIENT_ID</code>, <code className="rounded bg-gray-100 px-1 text-xs">GOOGLE_CLIENT_SECRET</code>, <code className="rounded bg-gray-100 px-1 text-xs">CRON_SECRET</code> (any random string)</li>
          <li>Redeploy, then click Connect above</li>
        </ol>
      </div>
    </div>
  )
}
