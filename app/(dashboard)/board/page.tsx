'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { BadgeCheck, Clock, ListChecks, MapPin, RefreshCw } from '@/lib/icons'
import { HelpTip } from '@/components/ui/Tooltip'
import { IntimaLoader } from '@/components/shared/IntimaLoader'
import { showToast } from '@/lib/toast'
import { createClient } from '@/lib/supabase/client'
import { formatCompactPrice } from '@/lib/utils/helpers'
import { useCities } from '@/lib/citiesLive'
import { SERVICE_TYPE_KEYS, SERVICE_TYPE_LABELS } from '@/lib/connections/serviceType'
import { BOARD_TIMINGS, BOARD_TIMING_LABELS } from '@/lib/board/shared'

interface ProviderSummary {
  display_name: string | null
  username: string | null
  avatar_url: string | null
  verified: boolean
}
interface BoardResponse {
  id: string
  provider_id: string | null
  author_role: 'provider' | 'client'
  kind: 'accept' | 'counter' | 'client_counter'
  rate_ngn: number | null
  created_at: string
  provider: ProviderSummary | null
}
interface BoardRequest {
  id: string
  city: string
  service_type: string
  serviceLabel: string
  proposed_rate_ngn: number
  timing: string
  timingLabel: string
  status: string
  refund_state: string | null
  expires_at: string | null
  created_at: string
  picked_provider_id: string | null
  connection_id: string | null
  responses: BoardResponse[]
  trust?: { connections: number; memberSince: string | null }
}
interface MyResponse {
  id: string
  kind: string
  rate_ngn: number | null
  request: {
    id: string
    city: string
    serviceLabel: string
    proposed_rate_ngn: number
    status: string
    pickedYou: boolean
  } | null
}
interface BoardData {
  role: string
  canRespond: boolean
  mine: BoardRequest[]
  board: BoardRequest[]
  myResponses: MyResponse[]
}

const inputCls =
  'w-full rounded-2xl border border-gray-200 bg-white px-3.5 py-3 text-base text-charcoal outline-none focus:border-primary transition-colors md:text-sm'

function timeLeft(iso: string | null): string {
  if (!iso) return ''
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return 'Expired'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return h >= 1 ? `${h}h ${m}m left` : `${m}m left`
}

function memberSince(iso: string | null): string {
  if (!iso) return 'New member'
  const d = new Date(iso)
  return `Member since ${d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`
}

export default function BoardPage() {
  const { cities: liveCities } = useCities()
  const [data, setData] = useState<BoardData | null>(null)
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [walletBalance, setWalletBalance] = useState<number | null>(null)

  // Post form
  const [city, setCity] = useState<string>('Lagos')
  const [service, setService] = useState<string>('short_time')
  const [rate, setRate] = useState('')
  const [timing, setTiming] = useState<string>('today')
  const [formError, setFormError] = useState('')

  // Per-request local state: counter inputs, intake answers
  const [counterInputs, setCounterInputs] = useState<Record<string, string>>({})
  const [intakeFor, setIntakeFor] = useState<{ requestId: string; responseId: string; questions: string[] } | null>(null)
  const [intakeAnswers, setIntakeAnswers] = useState<string[]>([])

  const load = useCallback(async () => {
    const res = await fetch('/api/board/requests')
    const json = await res.json().catch(() => null)
    if (!res.ok) {
      setLoadError(json?.error ?? 'Could not load the board')
      return
    }
    setData(json as BoardData)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    ;(async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: bal } = await supabase
        .from('coin_balances')
        .select('balance')
        .eq('user_id', user.id)
        .maybeSingle()
      setWalletBalance(bal?.balance ?? 0)
    })()
  }, [])

  const liveMine = data?.mine.find((r) => r.status === 'awaiting_payment' || r.status === 'open')

  async function createRequest() {
    setFormError('')
    const rateNgn = Number(rate.replace(/[^0-9]/g, ''))
    if (!rateNgn) {
      setFormError('Type the rate you are offering.')
      return
    }
    setBusy('create')
    try {
      const res = await fetch('/api/board/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city, service_type: service, proposed_rate_ngn: rateNgn, timing }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setFormError(json?.error ?? 'Could not create your request')
        return
      }
      showToast('Request created. Pay the connection fee to put it on the board.')
      await load()
    } finally {
      setBusy(null)
    }
  }

  async function pay(requestId: string, channel?: 'bank_transfer') {
    setBusy(`pay-${requestId}`)
    try {
      const res = await fetch(`/api/board/requests/${requestId}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(channel ? { channel } : {}),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.authorizationUrl) {
        showToast(json?.error ?? 'Could not start checkout')
        return
      }
      window.location.href = json.authorizationUrl
    } finally {
      setBusy(null)
    }
  }

  async function payWithWallet(requestId: string) {
    setBusy(`pay-${requestId}`)
    try {
      const res = await fetch(`/api/board/requests/${requestId}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pay_with_coins: true }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        showToast(json?.error ?? 'Could not pay from your wallet')
        return
      }
      showToast('Paid from your wallet. Your request is live on the board.')
      await load()
    } finally {
      setBusy(null)
    }
  }

  async function cancel(requestId: string) {
    setBusy(`cancel-${requestId}`)
    try {
      const res = await fetch(`/api/board/requests/${requestId}/cancel`, { method: 'POST' })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        showToast(json?.error ?? 'Could not cancel')
        return
      }
      showToast(
        json?.refund_state === 'refunded'
          ? 'Request cancelled. 85% of your fee (₦4,250) has been refunded.'
          : 'Request cancelled.'
      )
      await load()
    } finally {
      setBusy(null)
    }
  }

  async function pick(request: BoardRequest, response: BoardResponse, answers?: { q: string; a: string }[]) {
    setBusy(`pick-${response.id}`)
    try {
      const res = await fetch(`/api/board/requests/${request.id}/pick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response_id: response.id, ...(answers ? { intakeAnswers: answers } : {}) }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        if (json?.needsIntake && Array.isArray(json.questions)) {
          setIntakeFor({ requestId: request.id, responseId: response.id, questions: json.questions })
          setIntakeAnswers(json.questions.map(() => ''))
          return
        }
        showToast(json?.error ?? 'Could not connect')
        return
      }
      setIntakeFor(null)
      showToast('You are connected. Say hello in Messages.')
      await load()
    } finally {
      setBusy(null)
    }
  }

  async function counterBack(request: BoardRequest, response: BoardResponse) {
    const rateNgn = Number((counterInputs[response.id] ?? '').replace(/[^0-9]/g, ''))
    if (!rateNgn) {
      showToast('Type your counter amount first.')
      return
    }
    setBusy(`counter-${response.id}`)
    try {
      const res = await fetch(`/api/board/requests/${request.id}/counter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response_id: response.id, rate_ngn: rateNgn }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        showToast(json?.error ?? 'Could not send your counter')
        return
      }
      showToast('Counter sent. She can accept it or let it stand.')
      await load()
    } finally {
      setBusy(null)
    }
  }

  async function respond(request: BoardRequest, kind: 'accept' | 'counter') {
    const key = `resp-${request.id}`
    const rateNgn = kind === 'counter' ? Number((counterInputs[request.id] ?? '').replace(/[^0-9]/g, '')) : undefined
    if (kind === 'counter' && !rateNgn) {
      showToast('Type your counter amount first.')
      return
    }
    setBusy(key)
    try {
      const res = await fetch(`/api/board/requests/${request.id}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(kind === 'counter' ? { kind, rate_ngn: rateNgn } : { kind }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        showToast(json?.error ?? 'Could not respond')
        return
      }
      showToast(kind === 'accept' ? 'Accepted. The client can now pick you.' : 'Counter sent to the client.')
      await load()
    } finally {
      setBusy(null)
    }
  }

  async function acceptCounter(request: BoardRequest, response: BoardResponse) {
    setBusy(`accc-${response.id}`)
    try {
      const res = await fetch(`/api/board/requests/${request.id}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'accept_counter', response_id: response.id }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        showToast(json?.error ?? 'Could not accept')
        return
      }
      showToast(json?.filled ? 'You are connected. Say hello in Messages.' : 'Accepted. The client will finish the connection.')
      await load()
    } finally {
      setBusy(null)
    }
  }

  if (!data) {
    return (
      <div data-page-loader className="flex min-h-[50vh] items-center justify-center">
        {loadError ? <p className="text-sm text-red-500">{loadError}</p> : <IntimaLoader size="lg" />}
      </div>
    )
  }

  const isModel = data.role === 'model'
  const myProviderResponses = (request: BoardRequest) =>
    request.responses.filter((r) => r.author_role === 'provider')

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="t-page-title flex items-center gap-2 font-display font-semibold text-charcoal">
            Request board
            <HelpTip text="Post what you want and your offer. Verified companions in your city respond, and you pick who to connect with. If nobody fills your request in 48 hours, 85% of the connection fee (₦4,250 of ₦5,000) is refunded and 15% is kept for processing." />
          </h1>
          <p className="t-body mt-1 text-neutral-500">
            {isModel
              ? 'Clients post requests in your city. Respond, and the client picks.'
              : 'Tell the city what you want. Companions respond, you pick.'}
          </p>
        </div>
        <button
          onClick={load}
          aria-label="Refresh the board"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-black/[0.06] bg-white text-neutral-500"
        >
          <RefreshCw aria-hidden className="h-4 w-4" />
        </button>
      </div>

      {/* Client: post a request */}
      {!liveMine && (
        <section className="mt-6 rounded-3xl border border-black/[0.06] bg-white p-5">
          <h2 className="t-section-title font-display font-semibold text-charcoal">Post a request</h2>
          <div className="mt-4 space-y-4">
            <div>
              <label htmlFor="board-city" className="text-sm font-medium text-charcoal">City</label>
              <select id="board-city" value={city} onChange={(e) => setCity(e.target.value)} className={inputCls + ' mt-1.5'}>
                {liveCities.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <p className="text-sm font-medium text-charcoal">What do you want?</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {SERVICE_TYPE_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setService(key)}
                    className={`min-h-[40px] rounded-full px-4 py-2 text-sm font-medium transition ${
                      service === key ? 'bg-primary text-white' : 'bg-neutral-100 text-neutral-600 hover:text-charcoal'
                    }`}
                  >
                    {SERVICE_TYPE_LABELS[key]}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label htmlFor="board-rate" className="text-sm font-medium text-charcoal">
                Your offer {rate && <span className="text-neutral-400">({formatCompactPrice(Number(rate.replace(/[^0-9]/g, '')) || 0)})</span>}
              </label>
              <input
                id="board-rate"
                inputMode="numeric"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                placeholder="e.g. 60000"
                className={inputCls + ' mt-1.5'}
              />
              <p className="mt-1 text-xs text-neutral-400">This is the companion rate you are offering, paid to her directly. It is separate from the connection fee below.</p>
            </div>
            <div>
              <p className="text-sm font-medium text-charcoal">When?</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {BOARD_TIMINGS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTiming(t)}
                    className={`min-h-[40px] rounded-full px-4 py-2 text-sm font-medium transition ${
                      timing === t ? 'bg-primary text-white' : 'bg-neutral-100 text-neutral-600 hover:text-charcoal'
                    }`}
                  >
                    {BOARD_TIMING_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-2xl bg-primary/5 px-4 py-3">
              <p className="flex items-center gap-1.5 text-sm text-charcoal">
                The connection fee is ₦5,000, paid now.
                <HelpTip text="The fee holds your request on the board for 48 hours. If nobody fills it, or you cancel before it is filled, the fee comes back to you through the same payment method." />
              </p>
              <p className="mt-0.5 text-xs text-neutral-500">85% of the fee is refunded if your request is not filled in 48 hours.</p>
            </div>
            {formError && <p className="text-sm text-red-500">{formError}</p>}
            <button
              onClick={createRequest}
              disabled={busy === 'create'}
              className="btn-luxe flex min-h-[48px] w-full items-center justify-center px-6 py-3 text-sm disabled:opacity-60"
            >
              {busy === 'create' ? 'Creating…' : 'Create request'}
            </button>
          </div>
        </section>
      )}

      {/* Client: my requests */}
      {data.mine.length > 0 && (
        <section className="mt-8">
          <h2 className="t-section-title font-display font-semibold text-charcoal">Your requests</h2>
          <div className="mt-3 space-y-3">
            {data.mine.map((r) => (
              <article key={r.id} className="rounded-3xl border border-black/[0.06] bg-white p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-charcoal">
                    <MapPin aria-hidden className="h-4 w-4 text-primary" /> {r.city}
                  </span>
                  <span className="text-sm text-neutral-500">{r.serviceLabel}</span>
                  <span className="text-sm font-semibold text-charcoal">{formatCompactPrice(r.proposed_rate_ngn)}</span>
                  <span className="text-xs text-neutral-400">{r.timingLabel}</span>
                  <span className={`ml-auto rounded-full px-2.5 py-1 text-xs font-semibold ${
                    r.status === 'open' ? 'bg-emerald-50 text-emerald-700'
                    : r.status === 'filled' ? 'bg-primary/10 text-primary'
                    : r.status === 'awaiting_payment' ? 'bg-amber-50 text-amber-700'
                    : 'bg-neutral-100 text-neutral-500'
                  }`}>
                    {r.status === 'awaiting_payment' ? 'Waiting for fee' : r.status}
                  </span>
                </div>
                {r.status === 'open' && (
                  <p className="mt-1.5 flex items-center gap-1 text-xs text-neutral-400">
                    <Clock aria-hidden className="h-3.5 w-3.5" /> {timeLeft(r.expires_at)}
                  </p>
                )}

                {r.status === 'awaiting_payment' && (
                  <div className="mt-4 space-y-2">
                    {walletBalance !== null && walletBalance >= 500 && (
                      <button onClick={() => payWithWallet(r.id)} disabled={busy === `pay-${r.id}`} className="flex min-h-[48px] w-full items-center justify-center rounded-xl bg-charcoal px-6 py-3 text-sm font-semibold text-white disabled:opacity-60">
                        Pay ₦5,000 from your wallet (500 coins)
                      </button>
                    )}
                    <button onClick={() => pay(r.id)} disabled={busy === `pay-${r.id}`} className="btn-luxe flex min-h-[48px] w-full items-center justify-center px-6 py-3 text-sm disabled:opacity-60">
                      Pay ₦5,000 with card
                    </button>
                    <button onClick={() => pay(r.id, 'bank_transfer')} disabled={busy === `pay-${r.id}`} className="flex min-h-[48px] w-full items-center justify-center rounded-xl border border-primary/30 px-6 py-3 text-sm font-medium text-primary disabled:opacity-60">
                      Pay ₦5,000 with bank transfer
                    </button>
                    <button onClick={() => cancel(r.id)} disabled={busy === `cancel-${r.id}`} className="min-h-[44px] w-full py-2 text-sm font-medium text-neutral-400 hover:text-charcoal">
                      Cancel request
                    </button>
                  </div>
                )}

                {r.status === 'open' && (
                  <>
                    {r.responses.filter((x) => x.author_role === 'provider').length === 0 ? (
                      <p className="mt-3 text-sm text-neutral-500">No responses yet. Verified companions in {r.city} can see your request.</p>
                    ) : (
                      <div className="mt-4 space-y-3">
                        {r.responses.filter((x) => x.author_role === 'provider').map((resp) => {
                          const myCounter = r.responses.find((x) => x.kind === 'client_counter' && x.provider_id === resp.provider_id)
                          const agreed = resp.rate_ngn ?? r.proposed_rate_ngn
                          return (
                            <div key={resp.id} className="rounded-2xl bg-neutral-50 p-4">
                              <div className="flex items-center gap-3">
                                {resp.provider?.avatar_url ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={resp.provider.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                                ) : (
                                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                                    {(resp.provider?.display_name ?? 'C').slice(0, 1)}
                                  </span>
                                )}
                                <div className="min-w-0">
                                  <p className="flex items-center gap-1 text-sm font-medium text-charcoal">
                                    {resp.provider?.display_name ?? 'A companion'}
                                    {resp.provider?.verified && <BadgeCheck aria-hidden className="h-4 w-4 text-primary" />}
                                  </p>
                                  <p className="text-xs text-neutral-500">
                                    {resp.kind === 'accept'
                                      ? `Accepted your ${formatCompactPrice(r.proposed_rate_ngn)} offer`
                                      : `Countered at ${formatCompactPrice(resp.rate_ngn ?? 0)}`}
                                  </p>
                                </div>
                              </div>
                              {intakeFor?.responseId === resp.id ? (
                                <div className="mt-3 space-y-3">
                                  <p className="text-sm text-charcoal">She asks a few questions first:</p>
                                  {intakeFor.questions.map((q, i) => (
                                    <div key={i}>
                                      <label className="text-sm font-medium text-charcoal">{q}</label>
                                      <textarea
                                        value={intakeAnswers[i] ?? ''}
                                        onChange={(e) => setIntakeAnswers((prev) => { const n = [...prev]; n[i] = e.target.value; return n })}
                                        rows={2}
                                        maxLength={300}
                                        className={inputCls + ' mt-1'}
                                        placeholder="Your answer"
                                      />
                                    </div>
                                  ))}
                                  <button
                                    onClick={() => pick(r, resp, intakeFor.questions.map((q, i) => ({ q, a: (intakeAnswers[i] ?? '').trim() })))}
                                    disabled={busy === `pick-${resp.id}`}
                                    className="btn-luxe flex min-h-[44px] w-full items-center justify-center px-5 py-2.5 text-sm disabled:opacity-60"
                                  >
                                    Answer and connect
                                  </button>
                                </div>
                              ) : (
                                <div className="mt-3 flex flex-col gap-2">
                                  <button
                                    onClick={() => pick(r, resp)}
                                    disabled={busy === `pick-${resp.id}`}
                                    className="btn-luxe flex min-h-[44px] items-center justify-center px-5 py-2.5 text-sm disabled:opacity-60"
                                  >
                                    {resp.kind === 'accept' ? `Connect at ${formatCompactPrice(agreed)}` : `Accept ${formatCompactPrice(agreed)} and connect`}
                                  </button>
                                  {resp.kind === 'counter' && !myCounter && (
                                    <div className="flex gap-2">
                                      <input
                                        inputMode="numeric"
                                        value={counterInputs[resp.id] ?? ''}
                                        onChange={(e) => setCounterInputs((p) => ({ ...p, [resp.id]: e.target.value }))}
                                        placeholder="Your counter, e.g. 55000"
                                        className={inputCls}
                                      />
                                      <button
                                        onClick={() => counterBack(r, resp)}
                                        disabled={busy === `counter-${resp.id}`}
                                        className="shrink-0 rounded-xl border border-primary/30 px-4 text-sm font-medium text-primary disabled:opacity-60"
                                      >
                                        Counter
                                      </button>
                                    </div>
                                  )}
                                  {myCounter && (
                                    <p className="text-xs text-neutral-500">You countered at {formatCompactPrice(myCounter.rate_ngn ?? 0)}. She can accept it or let it stand.</p>
                                  )}
                                  {resp.provider?.username && (
                                    <Link href={`/companion/${resp.provider.username}`} className="text-xs font-medium text-primary">
                                      View her profile
                                    </Link>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                    <button onClick={() => cancel(r.id)} disabled={busy === `cancel-${r.id}`} className="mt-3 min-h-[44px] w-full py-2 text-sm font-medium text-neutral-400 hover:text-charcoal">
                      Cancel request and refund my fee
                    </button>
                  </>
                )}

                {r.status === 'filled' && (
                  <p className="mt-3 text-sm text-neutral-600">
                    Filled. Your connection is open.{' '}
                    <Link href="/messages" className="font-medium text-primary">Go to Messages</Link>
                  </p>
                )}
                {r.status === 'expired' && (
                  <p className="mt-3 text-sm text-neutral-600">
                    {r.refund_state === 'refunded'
                      ? 'Expired with no pick. 85% of your fee (₦4,250) has been refunded.'
                      : 'Expired with no pick. Your refund (85% of the fee, ₦4,250) is being processed.'}
                  </p>
                )}
                {r.status === 'cancelled' && (
                  <p className="mt-3 text-sm text-neutral-500">
                    Cancelled.{r.refund_state === 'refunded' ? ' 85% of your fee (₦4,250) has been refunded.' : r.refund_state ? ' Your refund (85% of the fee) is being processed.' : ''}
                  </p>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {/* Companion: the city board */}
      {isModel && (
        <section className="mt-10">
          <h2 className="t-section-title font-display font-semibold text-charcoal">Requests in your city</h2>
          {!data.canRespond && (
            <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
              You can see requests now, but only verified companions can respond. Finish your ID verification to start responding.
            </p>
          )}
          {data.board.length === 0 ? (
            <p className="mt-3 flex items-center gap-2 text-sm text-neutral-500">
              <ListChecks aria-hidden className="h-4 w-4" /> No open requests in your city right now. New ones land here and in your notifications.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {data.board.map((r) => {
                const mine = myProviderResponses(r)
                const accepted = mine.some((x) => x.kind === 'accept')
                const myCounterResp = mine.find((x) => x.kind === 'counter')
                const clientCounter = r.responses.find((x) => x.kind === 'client_counter')
                return (
                  <article key={r.id} className="rounded-3xl border border-black/[0.06] bg-white p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 text-sm font-medium text-charcoal">
                        <MapPin aria-hidden className="h-4 w-4 text-primary" /> {r.city}
                      </span>
                      <span className="text-sm text-neutral-500">{r.serviceLabel}</span>
                      <span className="text-sm font-semibold text-charcoal">{formatCompactPrice(r.proposed_rate_ngn)}</span>
                      <span className="text-xs text-neutral-400">{r.timingLabel}</span>
                      <span className="ml-auto inline-flex items-center gap-1 text-xs text-neutral-400">
                        <Clock aria-hidden className="h-3.5 w-3.5" /> {timeLeft(r.expires_at)}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs text-neutral-400">
                      A client · {r.trust?.connections ?? 0} past connections · {memberSince(r.trust?.memberSince ?? null)}
                    </p>

                    {clientCounter && !accepted && (
                      <div className="mt-3 rounded-2xl bg-primary/5 p-4">
                        <p className="text-sm text-charcoal">The client countered at <strong>{formatCompactPrice(clientCounter.rate_ngn ?? 0)}</strong>.</p>
                        <button
                          onClick={() => acceptCounter(r, clientCounter)}
                          disabled={busy === `accc-${clientCounter.id}` || !data.canRespond}
                          className="btn-luxe mt-3 flex min-h-[44px] w-full items-center justify-center px-5 py-2.5 text-sm disabled:opacity-60"
                        >
                          Accept {formatCompactPrice(clientCounter.rate_ngn ?? 0)} and connect
                        </button>
                      </div>
                    )}

                    {accepted ? (
                      <p className="mt-3 text-sm text-emerald-700">You accepted this request. The client can pick you now.</p>
                    ) : myCounterResp ? (
                      <p className="mt-3 text-sm text-neutral-600">You countered at {formatCompactPrice(myCounterResp.rate_ngn ?? 0)}. The client can accept, counter once, or pick someone else.</p>
                    ) : (
                      <div className="mt-4 space-y-2">
                        <button
                          onClick={() => respond(r, 'accept')}
                          disabled={busy === `resp-${r.id}` || !data.canRespond}
                          className="btn-luxe flex min-h-[48px] w-full items-center justify-center px-6 py-3 text-sm disabled:opacity-60"
                        >
                          Accept {formatCompactPrice(r.proposed_rate_ngn)}
                        </button>
                        <div className="flex gap-2">
                          <input
                            inputMode="numeric"
                            value={counterInputs[r.id] ?? ''}
                            onChange={(e) => setCounterInputs((p) => ({ ...p, [r.id]: e.target.value }))}
                            placeholder="Your counter, e.g. 80000"
                            className={inputCls}
                          />
                          <button
                            onClick={() => respond(r, 'counter')}
                            disabled={busy === `resp-${r.id}` || !data.canRespond}
                            className="shrink-0 rounded-xl border border-primary/30 px-4 text-sm font-medium text-primary disabled:opacity-60"
                          >
                            Counter
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {[0.25, 0.5, 1].map((pct) => {
                            const v = Math.round((r.proposed_rate_ngn * (1 + pct)) / 1000) * 1000
                            return (
                              <button
                                key={pct}
                                type="button"
                                onClick={() => setCounterInputs((p) => ({ ...p, [r.id]: String(v) }))}
                                className="rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-600"
                              >
                                {formatCompactPrice(v)} (+{Math.round(pct * 100)}%)
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
          )}

          {data.myResponses.length > 0 && (
            <>
              <h3 className="t-section-title mt-8 font-display font-semibold text-charcoal">Your responses</h3>
              <div className="mt-3 space-y-2">
                {data.myResponses.map((mr) => (
                  <div key={mr.id} className="rounded-2xl border border-black/[0.06] bg-white px-4 py-3 text-sm">
                    <span className="font-medium text-charcoal">{mr.kind === 'accept' ? 'Accepted' : `Countered at ${formatCompactPrice(mr.rate_ngn ?? 0)}`}</span>
                    {mr.request && (
                      <span className="text-neutral-500">
                        {' '}· {mr.request.city} · {mr.request.serviceLabel} · offered {formatCompactPrice(mr.request.proposed_rate_ngn)} ·{' '}
                        {mr.request.pickedYou ? 'Picked you' : mr.request.status === 'filled' ? 'Filled by another companion' : mr.request.status}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  )
}
