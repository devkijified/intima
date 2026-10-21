'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type CSSProperties } from 'react'
import { coinsWithNgn } from '@/lib/utils/helpers'
import type { GiftFxEvent } from './giftTypes'

export type { GiftFxEvent }

export interface GiftFxHandle {
  push: (evt: GiftFxEvent) => void
}

/**
 * The live gift animation engine. Four tiers, emoji plus CSS only
 * (keyframes in globals.css, `giftfx-` prefix), no sound:
 *
 * FLOAT: right-side lane, emoji rises and fades; at most 6 alive.
 *   Repeat sends of the same gift by the same sender merge into one
 *   float with a xN counter, mirrored by a sender chip on the left
 *   rail (max 3 chips). The Rose carries signature pulse rings.
 * BURST: lower-third spring pop with a particle spray. Strictly one
 *   at a time, queue at most 2 deep; a third waiting burst degrades
 *   to a float so a busy room never falls behind its own chat.
 * STAGE: 25% scrim, centre performance (~3s) with a signature loop
 *   per gift and a full sender banner. One at a time, and a stage
 *   gift waits while a takeover owns the screen; when the stage
 *   lane and its one waiting slot are both full, the gift plays as
 *   a burst with the full banner preserved, so credit is never lost.
 * TAKEOVER: full screen, strict FIFO, never interruptible. Toy
 *   Chest ~4s, Golden Rose ~5s hard cap; once three or more are in
 *   line, the later ones play a compressed 2.5s cut. A sender whose
 *   takeover is queued gets a "yours is next" toast.
 *
 * Sender credit shows at every tier. prefers-reduced-motion
 * collapses all of it to a gentle fade pulse (globals.css).
 */

const FLOAT_LIFE_MS = 3200
const FLOAT_MAX = 6
const BURST_MS = 2100
const BURST_QUEUE_MAX = 2
const STAGE_MS = 3200
const TAKEOVER_COMPRESSED_MS = 2500

function takeoverMs(evt: GiftFxEvent, compressed: boolean): number {
  if (compressed) return TAKEOVER_COMPRESSED_MS
  if (evt.giftId === 'golden-rose') return 5000
  if (evt.giftId === 'chest') return 4000
  return 4500
}

/* Deterministic pseudo-random from a string seed, so particle
   layouts are stable across re-renders of the same event. */
function rng(seed: string) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
}

interface Particle {
  tx: number
  ty: number
  delay: number
  size: number
  glyph: string
}

function makeParticles(seed: string, n: number, glyphs: string[], spread = 130): Particle[] {
  const rand = rng(seed)
  return Array.from({ length: n }, (_, i) => {
    const ang = (i / n) * Math.PI * 2 + rand() * 0.6
    const dist = spread * (0.55 + rand() * 0.65)
    return {
      tx: Math.round(Math.cos(ang) * dist),
      ty: Math.round(Math.sin(ang) * dist),
      delay: rand() * 0.12,
      size: 13 + rand() * 9,
      glyph: glyphs[Math.floor(rand() * glyphs.length)],
    }
  })
}

interface Faller {
  left: number
  delay: number
  dur: number
  sway: number
  size: number
  dot: boolean
}

function makeFallers(seed: string, n: number): Faller[] {
  const rand = rng(seed + ':fall')
  return Array.from({ length: n }, () => ({
    left: 2 + rand() * 94,
    delay: rand() * 1.5,
    dur: 2.4 + rand() * 1.5,
    sway: Math.round(rand() * 44 - 22),
    size: 12 + rand() * 10,
    dot: rand() > 0.55,
  }))
}

interface FxPlay {
  evt: GiftFxEvent
  particles: Particle[]
  fallers: Faller[]
  compressed: boolean
  /** Degraded stage gift: burst motion, full stage banner. */
  banner: boolean
}

interface FloatItem {
  key: string
  instance: string
  evt: GiftFxEvent
  count: number
  x: number
}

function SenderDisc({ name, className = 'h-6 w-6 text-[10px]' }: { name: string; className?: string }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full bg-primary font-bold text-white ${className}`}>
      {(name || 'S')[0]?.toUpperCase()}
    </span>
  )
}

export const GiftFxLayer = forwardRef<GiftFxHandle, { myId: string | null }>(function GiftFxLayer({ myId }, ref) {
  const [floats, setFloats] = useState<FloatItem[]>([])
  const [burst, setBurst] = useState<FxPlay | null>(null)
  const [stage, setStage] = useState<FxPlay | null>(null)
  const [take, setTake] = useState<FxPlay | null>(null)
  const [nextToast, setNextToast] = useState<string | null>(null)

  const burstRef = useRef<FxPlay | null>(null)
  const stageRef = useRef<FxPlay | null>(null)
  const takeRef = useRef<FxPlay | null>(null)
  const burstQ = useRef<FxPlay[]>([])
  const stageQ = useRef<FxPlay[]>([])
  const takeQ = useRef<FxPlay[]>([])
  const floatTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const myIdRef = useRef(myId)
  myIdRef.current = myId

  /* ------------------------------ floats ------------------------------ */
  const scheduleFloatRemoval = (key: string, instance: string) => {
    const old = floatTimers.current.get(key)
    if (old) clearTimeout(old)
    floatTimers.current.set(
      key,
      setTimeout(() => {
        floatTimers.current.delete(key)
        setFloats((prev) => prev.filter((f) => !(f.key === key && f.instance === instance)))
      }, FLOAT_LIFE_MS)
    )
  }

  const pushFloat = (evt: GiftFxEvent) => {
    const key = `${evt.senderId}:${evt.giftId}`
    setFloats((prev) => {
      const existing = prev.find((f) => f.key === key)
      if (existing) {
        scheduleFloatRemoval(key, existing.instance)
        return prev.map((f) => (f.key === key ? { ...f, count: f.count + 1, evt } : f))
      }
      const rand = rng(evt.id)
      const item: FloatItem = { key, instance: evt.id, evt, count: 1, x: Math.floor(rand() * 46) }
      scheduleFloatRemoval(key, item.instance)
      return [...prev, item].slice(-FLOAT_MAX)
    })
  }

  /* ------------------------------ centre lanes ------------------------------ */
  const startStageIfFree = () => {
    if (stageRef.current || takeRef.current) return
    const next = stageQ.current.shift() ?? null
    if (next) {
      stageRef.current = next
      setStage(next)
    }
  }

  const pushBurst = (evt: GiftFxEvent, banner = false) => {
    const play: FxPlay = {
      evt,
      particles: makeParticles(evt.id, 12, ['✨', '💕', '✦']),
      fallers: [],
      compressed: false,
      banner,
    }
    if (!burstRef.current) {
      burstRef.current = play
      setBurst(play)
    } else if (burstQ.current.length < BURST_QUEUE_MAX) {
      burstQ.current.push(play)
    } else {
      // Third waiting burst: degrade to a float, chip intact.
      pushFloat(evt)
    }
  }

  const pushStage = (evt: GiftFxEvent) => {
    const play: FxPlay = {
      evt,
      particles: makeParticles(evt.id, 8, ['✨', '💕']),
      fallers: [],
      compressed: false,
      banner: false,
    }
    if (!stageRef.current && !takeRef.current && stageQ.current.length === 0) {
      stageRef.current = play
      setStage(play)
    } else if (stageQ.current.length < 1) {
      stageQ.current.push(play)
    } else {
      // Stage lane and its waiting slot are full: play as a burst,
      // banner preserved so the sender keeps the full credit.
      pushBurst(evt, true)
    }
  }

  const showNextToast = (text: string) => {
    setNextToast(text)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setNextToast(null), 3000)
  }

  const pushTakeover = (evt: GiftFxEvent) => {
    // In line behind a playing takeover with 2+ already waiting,
    // this one is third or later: compressed cut.
    const compressed = !!takeRef.current && takeQ.current.length >= 2
    // The Toy Chest bursts open with mini toy glyphs; the Golden
    // Rose sprays gold. Anything else keeps the sparkle set.
    const glyphs =
      evt.giftId === 'chest'
        ? ['🌹', '🪄', '🍆', '💋']
        : evt.giftId === 'golden-rose'
          ? ['✦', '✨', '💛']
          : ['✨', '💕', '✦']
    const play: FxPlay = {
      evt,
      particles: makeParticles(evt.id, evt.giftId === 'chest' ? 16 : 14, glyphs, evt.giftId === 'chest' ? 165 : 130),
      fallers: makeFallers(evt.id, 30),
      compressed,
      banner: false,
    }
    if (!takeRef.current) {
      takeRef.current = play
      setTake(play)
    } else {
      takeQ.current.push(play)
      if (evt.senderId && evt.senderId === myIdRef.current) {
        showNextToast(`Your ${evt.name} is next`)
      }
    }
  }

  useImperativeHandle(ref, () => ({
    push: (evt: GiftFxEvent) => {
      if (evt.animTier === 'burst') pushBurst(evt)
      else if (evt.animTier === 'stage') pushStage(evt)
      else if (evt.animTier === 'takeover') pushTakeover(evt)
      else pushFloat(evt)
    },
  }))

  /* ------------------------------ lane clocks ------------------------------ */
  useEffect(() => {
    if (!burst) return
    const t = setTimeout(() => {
      const next = burstQ.current.shift() ?? null
      burstRef.current = next
      setBurst(next)
    }, BURST_MS)
    return () => clearTimeout(t)
  }, [burst])

  useEffect(() => {
    if (!stage) return
    const t = setTimeout(() => {
      stageRef.current = null
      setStage(null)
      startStageIfFree()
    }, STAGE_MS)
    return () => clearTimeout(t)
  }, [stage])

  useEffect(() => {
    if (!take) return
    const t = setTimeout(() => {
      const next = takeQ.current.shift() ?? null
      takeRef.current = next
      setTake(next)
      // A stage gift that waited out the takeover can play now.
      startStageIfFree()
    }, takeoverMs(take.evt, take.compressed))
    return () => clearTimeout(t)
  }, [take])

  useEffect(() => {
    const timers = floatTimers.current
    return () => {
      timers.forEach((t) => clearTimeout(t))
      if (toastTimer.current) clearTimeout(toastTimer.current)
    }
  }, [])

  const chips = floats.slice(-3)

  return (
    <div className="giftfx-root pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden>
      {/* Sender chips: left rail, newest last, max 3 visible */}
      <div className="absolute left-3 top-20 flex flex-col items-start gap-2">
        {chips.map((f) => (
          <div
            key={f.key}
            className="giftfx-chip flex items-center gap-2 rounded-full bg-black/55 py-1.5 pl-1.5 pr-3 backdrop-blur-sm"
            style={{ animation: `giftfx-chip-life ${FLOAT_LIFE_MS}ms linear forwards` }}
          >
            <SenderDisc name={f.evt.senderName} />
            <div className="leading-tight">
              <p className="max-w-[120px] truncate text-[11px] font-semibold text-white">{f.evt.senderName}</p>
              <p className="text-[11px] text-white/70">
                sent {f.evt.name} {f.evt.emoji}
              </p>
            </div>
            {f.count > 1 && (
              <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold ${f.count >= 10 ? 'bg-gold text-charcoal' : 'bg-white/15 text-white'}`}>
                ×{f.count}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Float lane: right side, clear of the host's face and centre */}
      {floats.map((f) => (
        <span
          key={`${f.key}:${f.instance}`}
          className="giftfx-emoji absolute bottom-[23%] leading-none"
          style={{ right: 16 + f.x, fontSize: 42, animation: 'giftfx-rise 1.7s ease-out forwards' }}
        >
          <span className="relative inline-block">
            {f.evt.giftId === 'rose' && (
              <>
                <span
                  className="giftfx-ring absolute left-1/2 top-1/2 h-10 w-10 rounded-full border-2 border-primary"
                  style={{ animation: 'giftfx-ring 1s ease-out forwards' }}
                />
                <span
                  className="giftfx-ring absolute left-1/2 top-1/2 h-10 w-10 rounded-full border-2 border-gold/80"
                  style={{ animation: 'giftfx-ring 1s ease-out 0.35s forwards' }}
                />
              </>
            )}
            <span
              className="relative inline-block"
              style={f.evt.giftId === 'rose' ? { animation: 'giftfx-heartbeat 1.2s ease-in-out' } : undefined}
            >
              {f.evt.emoji}
            </span>
          </span>
        </span>
      ))}

      {/* Burst: lower third, one at a time */}
      {burst && (
        <div key={burst.evt.id} className="absolute inset-x-0 top-[54%] flex flex-col items-center">
          <div className="relative">
            <span
              className="giftfx-emoji relative block leading-none"
              style={{
                fontSize: 104,
                animation:
                  'giftfx-pop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both, giftfx-fadeout 0.35s ease-in 1.8s forwards',
              }}
            >
              {burst.evt.emoji}
            </span>
            {burst.particles.map((p, i) => (
              <span
                key={i}
                className="giftfx-particle absolute left-1/2 top-1/2 leading-none"
                style={
                  {
                    fontSize: p.size,
                    '--tx': `${p.tx}px`,
                    '--ty': `${p.ty}px`,
                    animation: `giftfx-particle 1s ease-out ${p.delay}s forwards`,
                  } as CSSProperties
                }
              >
                {p.glyph}
              </span>
            ))}
          </div>
          {burst.banner ? (
            <div
              className="giftfx-banner mt-2 flex items-center gap-2 rounded-2xl border border-gold/40 bg-black/70 px-5 py-2.5 backdrop-blur-sm"
              style={{ animation: 'giftfx-banner-down 0.35s ease-out both, giftfx-fadeout 0.3s ease-in 1.85s forwards' }}
            >
              <SenderDisc name={burst.evt.senderName} className="h-7 w-7 text-[11px]" />
              <p className="font-display text-sm font-semibold text-white">
                {burst.evt.senderName} <span className="font-normal text-white/75">sent {burst.evt.name} · {coinsWithNgn(burst.evt.coinCost)}</span>
              </p>
            </div>
          ) : (
            <div
              className="giftfx-banner mt-1 flex items-center gap-2 rounded-full bg-primary/90 py-1.5 pl-1.5 pr-4 backdrop-blur-sm"
              style={{ animation: 'giftfx-banner-down 0.3s ease-out both, giftfx-fadeout 0.3s ease-in 1.85s forwards' }}
            >
              <SenderDisc name={burst.evt.senderName} />
              <p className="text-xs font-semibold text-white">
                {burst.evt.senderName} <span className="font-normal text-white/80">sent {burst.evt.name} · {coinsWithNgn(burst.evt.coinCost)}</span>
              </p>
            </div>
          )}
        </div>
      )}

      {/* Stage: scrim, banner, signature loop */}
      {stage && (
        <div key={stage.evt.id} className="absolute inset-0">
          <div
            className="giftfx-scrim absolute inset-0 bg-black/25"
            style={{ animation: 'fade-in 0.3s ease-out both, giftfx-fadeout 0.3s ease-in 2.9s forwards' }}
          />
          <div className="absolute inset-x-0 top-[14%] flex justify-center px-4">
            <div
              className="giftfx-banner flex items-center gap-2 rounded-full border border-gold/30 bg-black/65 py-2 pl-2 pr-5 backdrop-blur-sm"
              style={{ animation: 'giftfx-banner-down 0.35s ease-out both, giftfx-fadeout 0.3s ease-in 2.9s forwards' }}
            >
              <SenderDisc name={stage.evt.senderName} className="h-8 w-8 text-xs" />
              <p className="font-display text-sm font-semibold text-white">
                {stage.evt.senderName}{' '}
                <span className="font-normal text-white/75">sent {stage.evt.name} · {coinsWithNgn(stage.evt.coinCost)}</span>
              </p>
            </div>
          </div>
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <span className="relative block" style={{ animation: 'giftfx-stage-in 0.35s ease-out both' }}>
              {stage.evt.giftId === 'egg' && (
                <>
                  {[0, 0.45, 0.9].map((d) => (
                    <span
                      key={d}
                      className="giftfx-ring absolute left-1/2 top-1/2 h-40 w-40 rounded-full border-[3px] border-gold/70"
                      style={{ animation: `giftfx-ring 1.35s ease-out ${d}s infinite` }}
                    />
                  ))}
                </>
              )}
              <span
                className="giftfx-emoji relative block leading-none"
                style={{
                  fontSize: 216,
                  animation:
                    stage.evt.giftId === 'dildo'
                      ? 'giftfx-bounce-arc 1.6s ease-in-out infinite'
                      : 'giftfx-throb 0.9s ease-in-out infinite',
                }}
              >
                {stage.evt.emoji}
              </span>
              {stage.evt.giftId === 'dildo' &&
                stage.particles.map((p, i) => (
                  <span
                    key={i}
                    className="giftfx-particle absolute leading-none"
                    style={
                      {
                        left: `${18 + ((i * 13) % 70)}%`,
                        top: `${12 + ((i * 29) % 66)}%`,
                        fontSize: 16 + (i % 3) * 5,
                        animation: `giftfx-fade-pulse 1.5s ease-in-out ${(i % 4) * 0.3}s infinite`,
                      } as CSSProperties
                    }
                  >
                    {p.glyph}
                  </span>
                ))}
            </span>
          </div>
        </div>
      )}

      {/* Takeover: full screen, FIFO, never interruptible */}
      {take && (
        <div key={take.evt.id} className="absolute inset-0 z-10">
          <div
            className="giftfx-scrim absolute inset-0 bg-black/45 shadow-[inset_0_0_120px_rgba(201,168,76,0.35)]"
            style={{
              animation: `fade-in 0.3s ease-out both, giftfx-fadeout 0.4s ease-in ${takeoverMs(take.evt, take.compressed) - 400}ms forwards`,
            }}
          />
          {take.fallers.map((p, i) =>
            p.dot ? (
              <span
                key={i}
                className="giftfx-particle absolute top-0 rounded-full bg-gold"
                style={
                  {
                    left: `${p.left}%`,
                    width: 6,
                    height: 6,
                    '--sway': `${p.sway}px`,
                    animation: `giftfx-fall ${p.dur}s linear ${p.delay}s forwards`,
                  } as CSSProperties
                }
              />
            ) : (
              <span
                key={i}
                className="giftfx-particle absolute top-0 leading-none text-gold"
                style={
                  {
                    left: `${p.left}%`,
                    fontSize: p.size,
                    '--sway': `${p.sway}px`,
                    animation: `giftfx-fall ${p.dur}s linear ${p.delay}s forwards`,
                  } as CSSProperties
                }
              >
                ✨
              </span>
            )
          )}
          <div className="absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2">
            <span className="relative block">
              {take.evt.giftId === 'golden-rose' && (
                <>
                  {[0, 0.55, 1.1].map((d) => (
                    <span
                      key={d}
                      className="giftfx-ring absolute left-1/2 top-1/2 h-64 w-64 rounded-full border-4 border-gold/80"
                      style={{ animation: `giftfx-ring 1.65s ease-out ${d}s infinite` }}
                    />
                  ))}
                </>
              )}
              <span
                className="giftfx-emoji relative block leading-none"
                style={{
                  fontSize: 230,
                  animation: `giftfx-takeover-in 0.5s cubic-bezier(0.22, 0.9, 0.28, 1) both${
                    take.evt.giftId === 'chest' ? ', giftfx-pop-open 0.6s ease-in-out 0.55s' : ''
                  }, giftfx-fadeout 0.45s ease-in ${takeoverMs(take.evt, take.compressed) - 450}ms forwards`,
                }}
              >
                {take.evt.emoji}
              </span>
              {take.evt.giftId === 'chest' &&
                take.particles.map((p, i) => (
                  <span
                    key={i}
                    className="giftfx-particle absolute left-1/2 top-1/2 leading-none"
                    style={
                      {
                        fontSize: p.size + 6,
                        '--tx': `${p.tx}px`,
                        '--ty': `${p.ty}px`,
                        animation: `giftfx-particle 1.15s ease-out ${0.55 + p.delay}s forwards`,
                        opacity: 0,
                      } as CSSProperties
                    }
                  >
                    {p.glyph}
                  </span>
                ))}
              {take.evt.giftId === 'golden-rose' &&
                take.particles.map((p, i) => (
                  <span
                    key={i}
                    className="giftfx-particle absolute left-1/2 top-1/2 leading-none"
                    style={
                      {
                        fontSize: p.size + 4,
                        '--tx': `${p.tx * 1.7}px`,
                        '--ty': `${p.ty * 1.7}px`,
                        animation: `giftfx-particle 1.1s ease-out ${1.15 + p.delay}s forwards`,
                        opacity: 0,
                      } as CSSProperties
                    }
                  >
                    {p.glyph}
                  </span>
                ))}
            </span>
          </div>
          <div className="absolute inset-x-0 bottom-[17%] flex justify-center px-4">
            <p
              className="giftfx-banner rounded-full bg-black/60 px-6 py-2.5 text-center font-display text-base font-bold text-gold backdrop-blur-sm"
              style={{
                animation: `giftfx-banner-down 0.4s ease-out 0.25s both, giftfx-fadeout 0.4s ease-in ${takeoverMs(take.evt, take.compressed) - 400}ms forwards`,
              }}
            >
              {take.evt.senderName} sent a {take.evt.name.toUpperCase()} · {coinsWithNgn(take.evt.coinCost)}
            </p>
          </div>
        </div>
      )}

      {/* Yours is next: only the queued sender sees it */}
      {nextToast && (
        <div className="absolute inset-x-0 bottom-[27%] flex justify-center px-4">
          <span
            className="rounded-full bg-gold px-4 py-2 text-xs font-bold text-charcoal shadow-lg"
            style={{ animation: 'giftfx-next-in 0.3s ease-out both' }}
          >
            {nextToast}
          </span>
        </div>
      )}
    </div>
  )
})
