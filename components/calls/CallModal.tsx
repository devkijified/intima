'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Loader2,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  SwitchCamera,
  Video,
  VideoOff,
  Volume2,
} from '@/lib/icons';
import type { CallKind } from './CallProvider';
import { getInitials } from '@/lib/utils/helpers';

export type CallModalState = 'outgoing' | 'incoming' | 'active' | 'error';

interface CallModalProps {
  state: CallModalState;
  kind: CallKind;
  peerName: string;
  peerAvatar?: string;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  muted: boolean;
  cameraOff: boolean;
  connecting: boolean;
  error?: string | null;
  onAccept: () => void;
  onDecline: () => void;
  onCancel: () => void;
  onEnd: () => void;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onSwitchCamera: () => void;
}

const kindLabel = (kind: CallKind) => (kind === 'video' ? 'Video call' : 'Voice call');

/** Simple ringtone: Web Audio oscillator beep loop. */
function useRingtone(active: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    const beep = () => {
      try {
        if (!ctxRef.current) {
          const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          ctxRef.current = new AC();
        }
        const ctx = ctxRef.current;
        if (ctx.state === 'suspended') void ctx.resume();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
        osc.start();
        osc.stop(ctx.currentTime + 0.5);
      } catch {
        // Audio unavailable; the visual ring is enough.
      }
    };
    beep();
    timerRef.current = setInterval(() => {
      if (!stopped) beep();
    }, 1200);
    return () => {
      stopped = true;
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      try {
        void ctxRef.current?.close();
      } catch {
        // Already closed.
      }
      ctxRef.current = null;
    };
  }, [active]);
}

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function AudioBars() {
  return (
    <div className="flex h-10 items-end justify-center gap-1.5" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="w-1.5 animate-pulse rounded-full bg-[#C9A84C]"
          style={{ height: `${14 + ((i * 7) % 18)}px`, animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}

export function CallModal(props: CallModalProps) {
  const {
    state,
    kind,
    peerName,
    peerAvatar,
    localStream,
    remoteStream,
    muted,
    cameraOff,
    connecting,
    error,
    onAccept,
    onDecline,
    onCancel,
    onEnd,
    onToggleMute,
    onToggleCamera,
    onSwitchCamera,
  } = props;

  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [seconds, setSeconds] = useState(0);

  useRingtone(state === 'incoming');

  // Call duration timer.
  useEffect(() => {
    if (state !== 'active' || connecting) return;
    setSeconds(0);
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [state, connecting]);

  useEffect(() => {
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localStream;
  }, [localStream]);

  const showVideoStage = kind === 'video' && state === 'active';

  const statusLine =
    state === 'error'
      ? 'Call failed'
      : state === 'outgoing'
        ? `Calling… ${kindLabel(kind).toLowerCase()}`
        : state === 'incoming'
          ? `Incoming ${kindLabel(kind).toLowerCase()}`
          : connecting
            ? 'Connecting…'
            : formatDuration(seconds);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-[#141419] text-white">
      {showVideoStage ? (
        <div className="relative flex-1">
          {remoteStream ? (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
              {peerAvatar ? (
                <img
                  src={peerAvatar}
                  alt={peerName}
                  className="h-24 w-24 rounded-full object-cover ring-4 ring-[#AC244D]"
                />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[#AC244D] text-3xl font-bold">
                  {getInitials(peerName)}
                </div>
              )}
              <p className="flex items-center gap-2 text-sm text-white/70">
                <Loader2 className="h-4 w-4 animate-spin" />
                Connecting…
              </p>
            </div>
          )}
          {localStream && !cameraOff && (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="absolute bottom-28 right-4 h-40 w-28 rounded-2xl border border-white/20 object-cover shadow-xl"
            />
          )}
          {/* Top bar: name + timer */}
          <div className="absolute left-0 right-0 top-0 flex flex-col items-center gap-1 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
            <p className="text-sm font-semibold">{peerName}</p>
            <p className="text-xs text-white/70">{connecting ? 'Connecting…' : formatDuration(seconds)}</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
          {peerAvatar ? (
            <img
              src={peerAvatar}
              alt={peerName}
              className="h-28 w-28 rounded-full object-cover ring-4 ring-[#AC244D]"
            />
          ) : (
            <div className="flex h-28 w-28 items-center justify-center rounded-full bg-[#AC244D] text-4xl font-bold">
              {getInitials(peerName)}
            </div>
          )}
          <div>
            <h2 className="font-display text-2xl font-semibold">{peerName}</h2>
            <p className="mt-1 text-sm text-white/60">{statusLine}</p>
          </div>
          {state === 'active' && kind === 'voice' && !connecting && <AudioBars />}
          {state === 'outgoing' && !error && (
            <Loader2 className="h-6 w-6 animate-spin text-[#C9A84C]" />
          )}
          {error && (
            <p className="max-w-xs rounded-2xl bg-red-500/15 px-4 py-2 text-sm text-red-300">
              {error}
            </p>
          )}
        </div>
      )}

      {/* Controls, bottom anchored for thumbs */}
      <div className="flex items-center justify-center gap-3 px-6 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-4">
        {state === 'error' && (
          <button
            onClick={onCancel}
            className="rounded-full bg-white px-8 py-3.5 font-semibold text-charcoal shadow-lg transition-transform active:scale-95"
            aria-label="Dismiss"
          >
            Close
          </button>
        )}

        {state === 'outgoing' && (
          <button
            onClick={onCancel}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 shadow-lg transition-transform active:scale-95"
            aria-label="Cancel call"
          >
            <PhoneOff className="h-7 w-7" />
          </button>
        )}

        {state === 'incoming' && (
          <>
            <button
              onClick={onDecline}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 shadow-lg transition-transform active:scale-95"
              aria-label="Decline call"
            >
              <PhoneOff className="h-7 w-7" />
            </button>
            <button
              onClick={onAccept}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-[#AC244D] shadow-lg transition-transform active:scale-95"
              aria-label="Accept call"
            >
              <Phone className="h-7 w-7" />
            </button>
          </>
        )}

        {state === 'active' && (
          <>
            <button
              onClick={onToggleMute}
              className={`flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all active:scale-95 ${
                muted ? 'bg-white text-charcoal' : 'bg-white/15 text-white'
              }`}
              aria-label={muted ? 'Unmute' : 'Mute'}
            >
              {muted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
            </button>
            {kind === 'video' && (
              <>
                <button
                  onClick={onToggleCamera}
                  className={`flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all active:scale-95 ${
                    cameraOff ? 'bg-white text-charcoal' : 'bg-white/15 text-white'
                  }`}
                  aria-label={cameraOff ? 'Turn camera on' : 'Turn camera off'}
                >
                  {cameraOff ? <VideoOff className="h-6 w-6" /> : <Video className="h-6 w-6" />}
                </button>
                <button
                  onClick={onSwitchCamera}
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-white/15 text-white shadow-lg transition-all active:scale-95"
                  aria-label="Switch camera"
                >
                  <SwitchCamera className="h-6 w-6" />
                </button>
              </>
            )}
            <button
              onClick={() => setSpeakerOn((v) => !v)}
              className={`flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all active:scale-95 ${
                speakerOn ? 'bg-white/15 text-white' : 'bg-white text-charcoal'
              }`}
              aria-label="Toggle speaker"
            >
              <Volume2 className="h-6 w-6" />
            </button>
            <button
              onClick={onEnd}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 shadow-lg transition-transform active:scale-95"
              aria-label="End call"
            >
              <PhoneOff className="h-7 w-7" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
