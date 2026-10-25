'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { isAdmin } from '@/lib/admin/isAdmin'
import { clearSettingsCache } from '@/lib/settings/platformSettings'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ShieldAlert, ShieldCheck, Save, Loader2 } from '@/lib/icons'
import { HelpTip } from '@/components/ui/Tooltip'

/** Plain-language warnings for the keys where a wrong value breaks
 * money flows. Shown as a help icon beside the setting name. */
const SETTING_HELP: Record<string, string> = {
  connection_fee_ngn:
    'What every client pays to open a connection, in naira. This one number drives the connect buttons, the booking modal and checkout. A wrong value charges every client the wrong fee.',
  gift_platform_cut_pct:
    'The platform share of every gift, as a percent. The companion keeps the rest. It applies to new gifts from the moment you save.',
  subscription_platform_cut_pct:
    'The platform share of fan club subscriptions, as a percent. The companion keeps the rest. It applies at the next charge or renewal.',
  cashout_min_coins:
    'The smallest number of coins a companion can cash out. Requests below this are refused, so raising it can strand small balances.',
  boost_cost_coins:
    'What a 30 minute boost costs a companion, in coins. The boost screen and the charge both read this. Applies to the next boost bought.',
  referral_reward_companion_coins:
    'Coins a companion earns when a friend who joined through her link opens their first paid connection. Applies to rewards granted after you save.',
  referral_reward_client_coins:
    'Coins a client earns when a friend who joined through their link opens their first paid connection. Applies to rewards granted after you save.',
  watermark_text:
    'The line printed across companion photos and videos, with her username joined to it. Leave it empty to print the live domain automatically. It applies to new views as pages load.',
  refund_pct:
    'The percentage of a fee refunded when a refund is due on the request board or a fee dispute. The platform keeps the rest. It applies to refunds made after you save.',
  usd_ngn_rate:
    'The naira rate used when dollar amounts are shown or converted. A wrong rate misstates prices anywhere dollars appear.',
}

interface SettingRow {
  key: string
  value: unknown
  description: string | null
  updated_at: string
}

type EditorKind = 'number' | 'boolean' | 'text' | 'nullable-number'

function kindOf(key: string, value: unknown): EditorKind {
  if (typeof value === 'boolean') return 'boolean'
  if (value === null) return 'nullable-number'
  if (typeof value === 'number') return 'number'
  return 'text'
}

function displayValue(value: unknown): string {
  if (value === null) return 'Not set'
  if (typeof value === 'boolean') return value ? 'On' : 'Off'
  return String(value)
}

interface DiditModeState {
  mode: 'sandbox' | 'live'
  sandboxConfigured: boolean
  liveConfigured: boolean
}

export default function AdminSettingsPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [settings, setSettings] = useState<SettingRow[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [didit, setDidit] = useState<DiditModeState | null>(null)
  const [diditSaving, setDiditSaving] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    async function init() {
      const ok = await isAdmin()
      setAuthorized(ok)
      if (!ok) return
      const { data } = await supabase
        .from('platform_settings')
        .select('key, value, description, updated_at')
        .order('key')
      if (data) {
        setSettings(data as SettingRow[])
        const initial: Record<string, string> = {}
        for (const row of data as SettingRow[]) {
          initial[row.key] =
            row.value === null ? '' : String(row.value as string | number | boolean)
        }
        setDrafts(initial)
      }
      try {
        const res = await fetch('/api/admin/didit-mode')
        const modeData = (await res.json().catch(() => null)) as DiditModeState | null
        if (modeData && (modeData.mode === 'live' || modeData.mode === 'sandbox')) {
          setDidit(modeData)
        }
      } catch {
        // The switch card simply stays hidden if the read fails.
      }
    }
    init()
  }, [supabase])

  async function switchDiditMode(mode: 'sandbox' | 'live') {
    if (!didit || didit.mode === mode || diditSaving) return
    setDiditSaving(true)
    setNotice('')
    try {
      const res = await fetch('/api/admin/didit-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      })
      if (!res.ok) throw new Error('save failed')
      setDidit((prev) => (prev ? { ...prev, mode } : prev))
      setNotice(
        mode === 'live'
          ? 'Didit is now LIVE. Instant verification runs real checks.'
          : 'Didit is back in TEST MODE. Instant verification is simulated.'
      )
    } catch {
      setNotice('The Didit switch did not save. Please try again.')
    } finally {
      setDiditSaving(false)
    }
  }

  async function handleSave(row: SettingRow) {
    const kind = kindOf(row.key, row.value)
    const raw = (drafts[row.key] ?? '').trim()
    let nextValue: unknown

    try {
      if (kind === 'boolean') {
        nextValue = raw === 'true' || raw === 'on' || raw === '1'
      } else if (kind === 'number') {
        nextValue = Number(raw)
        if (!Number.isFinite(nextValue) || (nextValue as number) < 0) {
          throw new Error('Enter a valid number')
        }
      } else if (kind === 'nullable-number') {
        if (raw === '') {
          nextValue = null
        } else {
          nextValue = Number(raw)
          if (!Number.isFinite(nextValue) || (nextValue as number) < 0) {
            throw new Error('Enter a valid number or leave empty')
          }
        }
      } else {
        if (!raw) throw new Error('Value cannot be empty')
        nextValue = raw
      }
    } catch (err) {
      setNotice('That value is not valid for this setting.')
      return
    }

    setSaving(row.key)
    setNotice('')
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')

      const { error } = await supabase
        .from('platform_settings')
        .update({ value: nextValue })
        .eq('key', row.key)
      if (error) throw error

      await supabase.from('admin_audit_logs').insert({
        admin_id: user.id,
        action: 'setting_updated',
        target_type: 'platform_setting',
        target_id: row.key,
        details: { old_value: row.value, new_value: nextValue },
      })

      clearSettingsCache()
      setSettings((prev) =>
        prev.map((s) =>
          s.key === row.key ? { ...s, value: nextValue, updated_at: new Date().toISOString() } : s
        )
      )
      setNotice(`Saved ${row.key}.`)
    } catch (err) {
      setNotice('Save failed. Please check the value and try again.')
    } finally {
      setSaving(null)
    }
  }

  if (authorized === null) {
    return <div className="text-center py-10">Loading...</div>
  }

  if (!authorized) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <ShieldAlert className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-gray-900">Not authorized</h1>
        <p className="text-gray-600 mt-2">
          This area is restricted to platform administrators.
        </p>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Platform Settings</h1>
      <p className="text-gray-600 mb-6">
        Every important tunable lives here. Changes take effect within a minute and are audit logged.
      </p>

      {notice && (
        <div className="mb-4 bg-primary-muted border border-primary/20 text-charcoal text-sm rounded-xl px-4 py-3">
          {notice}
        </div>
      )}

      {didit && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-1 text-base">
              <ShieldCheck className="w-5 h-5 mr-1 text-primary" />
              Identity verification (Didit)
              <HelpTip
                text="The Test / Live switch for instant identity checks, like the one on Paystack. Test mode uses the Didit sandbox application: the flow works end to end but verdicts are simulated and free. Live mode uses the real Didit application: checks are real and Didit bills the account balance for each one. Flipping the switch takes effect immediately, no redeploy."
                label="About the Didit mode switch"
              />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
              <div className="text-sm text-gray-500 sm:w-40 flex-shrink-0">
                Current:{' '}
                <span
                  className={`inline-flex items-center gap-1.5 font-semibold ${
                    didit.mode === 'live' ? 'text-green-700' : 'text-amber-700'
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      didit.mode === 'live' ? 'bg-green-600' : 'bg-amber-500'
                    }`}
                  />
                  {didit.mode === 'live' ? 'LIVE MODE' : 'TEST MODE'}
                </span>
              </div>
              <div className="flex flex-1 gap-2">
                <button
                  type="button"
                  onClick={() => switchDiditMode('sandbox')}
                  disabled={diditSaving || didit.mode === 'sandbox'}
                  className={`min-h-[44px] flex-1 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
                    didit.mode === 'sandbox'
                      ? 'border-amber-500 bg-amber-100 text-amber-800'
                      : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
                  } disabled:opacity-70`}
                >
                  Test mode
                </button>
                <button
                  type="button"
                  onClick={() => switchDiditMode('live')}
                  disabled={diditSaving || didit.mode === 'live'}
                  className={`min-h-[44px] flex-1 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
                    didit.mode === 'live'
                      ? 'border-green-600 bg-green-100 text-green-800'
                      : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
                  } disabled:opacity-70`}
                >
                  {diditSaving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Live mode'}
                </button>
              </div>
            </div>
            <p className="text-sm text-gray-600 mt-3">
              Sandbox keys: {didit.sandboxConfigured ? 'set' : 'missing'}. Live keys:{' '}
              {didit.liveConfigured ? 'set' : 'missing'}.
              {didit.mode === 'live' && !didit.liveConfigured
                ? ' Live keys are not set yet, so the instant verification card stays hidden until they are.'
                : ''}
              {didit.mode === 'sandbox' && !didit.sandboxConfigured
                ? ' Sandbox keys are not set, so the instant verification card is hidden.'
                : ''}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {settings.map((row) => {
          const kind = kindOf(row.key, row.value)
          return (
            <Card key={row.key}>
              <CardHeader>
                <CardTitle className="flex items-center gap-1 text-base font-mono">
                  {row.key}
                  {SETTING_HELP[row.key] && (
                    <HelpTip text={SETTING_HELP[row.key]} label={`About ${row.key}`} />
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {row.description && (
                  <p className="text-sm text-gray-600 mb-3">{row.description}</p>
                )}
                <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                  <div className="text-sm text-gray-500 sm:w-40 flex-shrink-0">
                    Current: <span className="font-semibold text-charcoal">{displayValue(row.value)}</span>
                  </div>
                  {kind === 'boolean' ? (
                    <select
                      value={drafts[row.key] ?? ''}
                      onChange={(e) =>
                        setDrafts((d) => ({ ...d, [row.key]: e.target.value }))
                      }
                      className="min-h-[44px] flex-1 rounded-xl border border-gray-300 px-3 py-2 text-base md:text-sm"
                    >
                      <option value="true">On</option>
                      <option value="false">Off</option>
                    </select>
                  ) : (
                    <Input
                      value={drafts[row.key] ?? ''}
                      onChange={(e) =>
                        setDrafts((d) => ({ ...d, [row.key]: e.target.value }))
                      }
                      placeholder={kind === 'nullable-number' ? 'Empty means not set' : 'New value'}
                      type={kind === 'text' ? 'text' : 'number'}
                      min={0}
                      className="flex-1"
                    />
                  )}
                  <Button
                    onClick={() => handleSave(row)}
                    disabled={saving === row.key}
                    className="sm:w-auto"
                  >
                    {saving === row.key ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4 mr-2" />
                    )}
                    Save
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
