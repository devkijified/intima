'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Pause, Play } from '@/lib/icons'
import { cn } from '@/lib/utils/helpers'

function fmtSecs(s: number): string {
  if (!isFinite(s) || s < 0) s = 0
  const m = Math.floor(s / 60)
  const r = Math.round(s % 60)
  return `${m}:${String(r).padStart(2, '0')}`
}

/** Deterministic bar heights, so the waveform looks like a waveform
 * without decoding the audio: seeded by the duration and position. */
function barHeight(i: number, seed: number): number {
  const x = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453
  const frac = x - Math.floor(x)
  return 5 + Math.round(frac * 13)
}

/**
 * A WhatsApp-style voice note: round play button, bar waveform that
 * fills as it plays, elapsed and total time. The first play by the
 * recipient calls onPlayed, which is what marks the note played
 * (and read) for the sender, the way WhatsApp turns a played note
 * blue even when read receipts are off.
 */
export default function VoiceNote({
  src,
  durationSeconds,
  mine,
  played,
  onPlayed,
}: {
  src?: string | null
  durationSeconds?: number | null
  mine: boolean
  played: boolean
  onPlayed?: () => void
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [total, setTotal] = useState(durationSeconds ?? 0)
  const playedRef = useRef(false)

  useEffect(() => {
    if (durationSeconds && durationSeconds > 0) setTotal(durationSeconds)
  }, [durationSeconds])

  const bars = useMemo(() => {
    const n = 30
    return Array.from({ length: n }, (_, i) => barHeight(i, (durationSeconds ?? 7) + n))
  }, [durationSeconds])

  const progress = total > 0 ? Math.min(1, current / total) : 0

  const toggle = () => {
    const a = audioRef.current
    if (!a || !src) return
    if (playing) {
      a.pause()
      setPlaying(false)
      return
    }
    if (!mine && !playedRef.current) {
      playedRef.current = true
      onPlayed?.()
    }
    void a.play().catch(() => setPlaying(false))
  }

  if (!src) {
    return (
      <div className={cn('flex w-[230px] items-center gap-2.5 px-1 py-1.5', mine ? 'text-white' : 'text-charcoal')}>
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', mine ? 'bg-white/20' : 'bg-cream')}>
          <Play className="h-4 w-4 opacity-60" />
        </span>
        <span className="text-xs opacity-70">Loading voice note…</span>
      </div>
    )
  }

  return (
    <div className={cn('flex w-[230px] items-center gap-2.5 px-1 py-1.5', mine ? 'text-white' : 'text-charcoal')}>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false)
          setCurrent(0)
        }}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration
          if (isFinite(d) && d > 0) setTotal(Math.round(d))
        }}
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? 'Pause voice note' : 'Play voice note'}
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-transform active:scale-95',
          mine ? 'bg-white text-primary' : 'bg-primary text-white',
        )}
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex h-[22px] items-center gap-[2px]" aria-hidden>
          {bars.map((h, i) => {
            const filled = i / bars.length <= progress
            return (
              <span
                key={i}
                className={cn(
                  'w-[3px] shrink-0 rounded-full',
                  filled
                    ? mine
                      ? 'bg-white'
                      : 'bg-primary'
                    : mine
                      ? 'bg-white/40'
                      : played
                        ? 'bg-primary/35'
                        : 'bg-neutral-300',
                )}
                style={{ height: `${h}px` }}
              />
            )
          })}
        </div>
        <p className={cn('mt-0.5 text-[11px] leading-none', mine ? 'text-white/75' : 'text-neutral-500')}>
          {fmtSecs(playing || current > 0 ? current : total)} · Voice note
        </p>
      </div>
    </div>
  )
}
