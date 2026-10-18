'use client';

import { useEffect, useRef } from 'react';
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
} from 'lucide-react';
import type { CallKind } from '@/lib/calls/webrtc';
import { getInitials } from '@/lib/utils/helpers';

export type CallModalState = 'outgoing' | 'incoming' | 'active';

interface CallModalProps {
  state: CallModalState;
  kind: CallKind;
  peerName: string;
  peerAvatar?: string;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  muted: boolean;
  cameraOff: boolean;
  speakerOn: boolean;
  connecting: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onCancel: () => void;
  onEnd: () => void;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onToggleSpeaker: () => void;
  onSwitchCamera: () => void;
}

const kindLabel = (kind: CallKind) => (kind === 'video' ? 'Video call' : 'Voice call');

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
    onAccept,
    onDecline,
    onCancel,
    onEnd,
    onToggleMute,
    onToggleCamera,
    onToggleSpeaker,
    onSwitchCamera,
  } = props;

  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localStream;
  }, [localStream]);

  const showVideoStage = kind === 'video' && state === 'active';

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-charcoal/95 text-white backdrop-blur-sm">
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
              className="absolute bottom-24 right-4 h-36 w-24 rounded-2xl border border-white/20 object-cover shadow-xl"
            />
          )}
          <div className="absolute left-4 top-4 rounded-full bg-black/50 px-4 py-1.5 text-sm backdrop-blur-sm">
            {peerName} · {kindLabel(kind)}
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
            <h2 className="font-serif text-2xl">{peerName}</h2>
            <p className="mt-1 text-sm text-white/60">
              {state === 'outgoing' && `Calling… ${kindLabel(kind).toLowerCase()}`}
              {state === 'incoming' && `Incoming ${kindLabel(kind).toLowerCase()}`}
              {state === 'active' && (connecting ? 'Connecting…' : kindLabel(kind))}
            </p>
          </div>
          {state === 'active' && kind === 'voice' && <AudioBars />}
          {state === 'outgoing' && (
            <Loader2 className="h-6 w-6 animate-spin text-[#C9A84C]" />
          )}
        </div>
      )}

      {/* Controls, bottom anchored for thumbs */}
      <div className="flex items-center justify-center gap-3 px-6 pb-10 pt-4">
        {state === 'outgoing' && (
          <button
            onClick={onCancel}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 shadow-lg transition-transform hover:scale-105"
            aria-label="Cancel call"
          >
            <PhoneOff className="h-7 w-7" />
          </button>
        )}

        {state === 'incoming' && (
          <>
            <button
              onClick={onDecline}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 shadow-lg transition-transform hover:scale-105"
              aria-label="Decline call"
            >
              <PhoneOff className="h-7 w-7" />
            </button>
            <button
              onClick={onAccept}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500 shadow-lg transition-transform hover:scale-105"
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
              className={`flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all hover:scale-105 ${
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
                  className={`flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all hover:scale-105 ${
                    cameraOff ? 'bg-white text-charcoal' : 'bg-white/15 text-white'
                  }`}
                  aria-label={cameraOff ? 'Turn camera on' : 'Turn camera off'}
                >
                  {cameraOff ? <VideoOff className="h-6 w-6" /> : <Video className="h-6 w-6" />}
                </button>
                <button
                  onClick={onSwitchCamera}
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-white/15 text-white shadow-lg transition-all hover:scale-105"
                  aria-label="Switch camera"
                >
                  <SwitchCamera className="h-6 w-6" />
                </button>
              </>
            )}
            <button
              onClick={onToggleSpeaker}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-white/15 text-white shadow-lg transition-all hover:scale-105"
              aria-label="Toggle speaker"
            >
              <Volume2 className="h-6 w-6" />
            </button>
            <button
              onClick={onEnd}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 shadow-lg transition-transform hover:scale-105"
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
