'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { CallManager, type CallKind } from '@/lib/calls/webrtc';
import { CallModal } from './CallModal';

type CallDirection = 'outgoing' | 'incoming' | 'active';
type CallEndStatus = 'ended' | 'rejected' | 'missed';

interface ActiveCall {
  direction: CallDirection;
  kind: CallKind;
  peerId: string;
  peerName: string;
  peerAvatar?: string;
  callId: string;
}

interface CallContextValue {
  startCall: (
    providerId: string,
    providerName: string,
    kind: CallKind,
    providerAvatar?: string,
  ) => Promise<void>;
}

const CallContext = createContext<CallContextValue>({
  startCall: async () => undefined,
});

export const useCall = () => useContext(CallContext);

// Broadcast payload shapes (see lib/calls/webrtc.ts for the protocol).
interface RingPayload {
  from: string;
  fromName: string;
  fromAvatar?: string;
  kind: CallKind;
  callId: string;
}
interface OfferPayload {
  sdp: RTCSessionDescriptionInit;
  kind: CallKind;
  callId: string;
}
interface AnswerPayload {
  sdp: RTCSessionDescriptionInit;
  callId: string;
}
interface IcePayload {
  candidate: RTCIceCandidateInit;
  callId: string;
}
interface EndPayload {
  callId: string;
  reason?: string;
}

const RING_TIMEOUT_MS = 45_000;

export function CallProvider({ children }: { children: ReactNode }) {
  const [supabase] = useState<SupabaseClient>(() => createClient());
  const [call, setCall] = useState<ActiveCall | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);

  const managerRef = useRef<CallManager | null>(null);
  const channelsRef = useRef(new Map<string, RealtimeChannel>());
  const inboundChannelRef = useRef<RealtimeChannel | null>(null);
  const callRef = useRef<ActiveCall | null>(null);
  const pendingOfferRef = useRef<OfferPayload | null>(null);
  const ringTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callRowIdRef = useRef<string | null>(null);
  const myIdRef = useRef<string | null>(null);
  const myNameRef = useRef<string>('Intima member');
  const myAvatarRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    callRef.current = call;
  }, [call]);

  const clearRingTimer = useCallback(() => {
    if (ringTimerRef.current) {
      clearTimeout(ringTimerRef.current);
      ringTimerRef.current = null;
    }
  }, []);

  const getChannel = useCallback(
    (peerId: string): RealtimeChannel => {
      let ch = channelsRef.current.get(peerId);
      if (!ch) {
        ch = supabase.channel(`calls:${peerId}`);
        ch.subscribe();
        channelsRef.current.set(peerId, ch);
      }
      return ch;
    },
    [supabase],
  );

  const sendTo = useCallback(
    async (peerId: string, event: string, payload: Record<string, unknown>) => {
      try {
        await getChannel(peerId).send({ type: 'broadcast', event, payload });
      } catch {
        // Signaling is best effort; the call simply cannot proceed.
      }
    },
    [getChannel],
  );

  const updateCallRow = useCallback(
    async (status: 'active' | CallEndStatus) => {
      const rowId = callRowIdRef.current;
      if (!rowId) return;
      try {
        await supabase
          .from('calls')
          .update({ status, ended_at: new Date().toISOString() })
          .eq('id', rowId);
      } catch {
        // The calls table may not exist before the migration runs.
      }
    },
    [supabase],
  );

  const teardown = useCallback(() => {
    clearRingTimer();
    managerRef.current?.endCall();
    managerRef.current = null;
    pendingOfferRef.current = null;
    callRowIdRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setMuted(false);
    setCameraOff(false);
    setCall(null);
  }, [clearRingTimer]);

  const endCall = useCallback(
    async (status: CallEndStatus = 'ended', silent = false) => {
      const current = callRef.current;
      clearRingTimer();
      if (current && !silent) {
        await sendTo(current.peerId, 'call:end', { callId: current.callId });
      }
      await updateCallRow(status);
      teardown();
    },
    [clearRingTimer, sendTo, updateCallRow, teardown],
  );

  const makeManager = useCallback(
    (peerId: string, callId: string) => {
      const manager = new CallManager({
        onRemoteStream: (stream) => setRemoteStream(stream),
        onStateChange: (state) => {
          if (state === 'connected') {
            setCall((c) => (c ? { ...c, direction: 'active' } : c));
            void updateCallRow('active');
          }
        },
        onIceCandidate: (candidate) => {
          void sendTo(peerId, 'call:ice', { candidate, callId });
        },
      });
      managerRef.current = manager;
      return manager;
    },
    [sendTo, updateCallRow],
  );

  const startCall = useCallback(
    async (
      providerId: string,
      providerName: string,
      kind: CallKind,
      providerAvatar?: string,
    ) => {
      if (callRef.current || !myIdRef.current) return;
      const myId = myIdRef.current;
      const callId =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      // Best effort call log (the calls table lands with migration 002).
      try {
        const { data } = await supabase
          .from('calls')
          .insert({ caller_id: myId, callee_id: providerId, kind, status: 'ringing' })
          .select('id')
          .single();
        callRowIdRef.current = (data as { id: string } | null)?.id ?? null;
      } catch {
        callRowIdRef.current = null;
      }

      const manager = makeManager(providerId, callId);
      try {
        const offer = await manager.startCall(kind);
        setLocalStream(manager.getLocalStream());
        setCall({
          direction: 'outgoing',
          kind,
          peerId: providerId,
          peerName: providerName,
          peerAvatar: providerAvatar,
          callId,
        });
        await sendTo(providerId, 'call:ring', {
          from: myId,
          fromName: myNameRef.current,
          fromAvatar: myAvatarRef.current,
          kind,
          callId,
        });
        await sendTo(providerId, 'call:offer', { sdp: offer, kind, callId });
        ringTimerRef.current = setTimeout(() => {
          void endCall('missed');
        }, RING_TIMEOUT_MS);
      } catch {
        // Mic or camera denied: abort cleanly.
        teardown();
      }
    },
    [supabase, makeManager, sendTo, endCall, teardown],
  );

  const accept = useCallback(async () => {
    const current = callRef.current;
    const offer = pendingOfferRef.current;
    if (!current || current.direction !== 'incoming' || !offer) return;
    clearRingTimer();
    const manager = makeManager(current.peerId, current.callId);
    try {
      await sendTo(current.peerId, 'call:accept', { callId: current.callId });
      const answer = await manager.handleOffer(offer.sdp, current.kind);
      setLocalStream(manager.getLocalStream());
      await sendTo(current.peerId, 'call:answer', {
        sdp: answer,
        callId: current.callId,
      });
      setCall({ ...current, direction: 'active' });
    } catch {
      teardown();
    } finally {
      pendingOfferRef.current = null;
    }
  }, [makeManager, sendTo, clearRingTimer, teardown]);

  const decline = useCallback(
    async (reason = 'declined') => {
      const current = callRef.current;
      if (current) {
        await sendTo(current.peerId, 'call:reject', {
          callId: current.callId,
          reason,
        });
      }
      teardown();
    },
    [sendTo, teardown],
  );

  // Inbound signaling subscription.
  useEffect(() => {
    let cancelled = false;

    async function subscribe() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled || !user) return;
      myIdRef.current = user.id;
      myNameRef.current =
        user.user_metadata?.full_name ??
        user.user_metadata?.display_name ??
        'Intima member';
      myAvatarRef.current = user.user_metadata?.avatar_url ?? undefined;

      const ch = supabase.channel(`calls:${user.id}`);

      ch.on('broadcast', { event: 'call:ring' }, ({ payload }) => {
        const ring = payload as RingPayload;
        if (!ring || ring.from === myIdRef.current) return;
        if (callRef.current) {
          void sendTo(ring.from, 'call:reject', {
            callId: ring.callId,
            reason: 'busy',
          });
          return;
        }
        setCall({
          direction: 'incoming',
          kind: ring.kind,
          peerId: ring.from,
          peerName: ring.fromName,
          peerAvatar: ring.fromAvatar,
          callId: ring.callId,
        });
        ringTimerRef.current = setTimeout(() => {
          void decline('missed');
        }, RING_TIMEOUT_MS);
      });

      ch.on('broadcast', { event: 'call:offer' }, ({ payload }) => {
        const offer = payload as OfferPayload;
        if (!offer) return;
        pendingOfferRef.current = offer;
      });

      ch.on('broadcast', { event: 'call:accept' }, () => {
        setCall((c) => (c && c.direction === 'outgoing' ? { ...c, direction: 'active' } : c));
      });

      ch.on('broadcast', { event: 'call:answer' }, ({ payload }) => {
        const answer = payload as AnswerPayload;
        if (!answer) return;
        void managerRef.current?.handleAnswer(answer.sdp);
      });

      ch.on('broadcast', { event: 'call:ice' }, ({ payload }) => {
        const ice = payload as IcePayload;
        if (!ice) return;
        void managerRef.current?.handleIce(ice.candidate);
      });

      ch.on('broadcast', { event: 'call:reject' }, () => {
        void endCall('rejected', true);
      });

      ch.on('broadcast', { event: 'call:end' }, ({ payload }) => {
        const end = payload as EndPayload;
        if (!end) return;
        void endCall('ended', true);
      });

      ch.subscribe();
      inboundChannelRef.current = ch;
    }

    subscribe();
    return () => {
      cancelled = true;
      clearRingTimer();
      if (inboundChannelRef.current) {
        supabase.removeChannel(inboundChannelRef.current);
        inboundChannelRef.current = null;
      }
    };
  }, [supabase, sendTo, endCall, decline, clearRingTimer]);

  const toggleMute = useCallback(() => {
    const next = managerRef.current?.toggleMute() ?? false;
    setMuted(next);
  }, []);

  const toggleCamera = useCallback(() => {
    const next = managerRef.current?.toggleCamera() ?? false;
    setCameraOff(next);
  }, []);

  const modalState = !call
    ? null
    : call.direction === 'incoming'
      ? 'incoming'
      : call.direction === 'outgoing'
        ? 'outgoing'
        : 'active';

  return (
    <CallContext.Provider value={{ startCall }}>
      {children}
      {call && modalState && (
        <CallModal
          state={modalState}
          kind={call.kind}
          peerName={call.peerName}
          peerAvatar={call.peerAvatar}
          localStream={localStream}
          remoteStream={remoteStream}
          muted={muted}
          cameraOff={cameraOff}
          speakerOn={false}
          connecting={call.direction !== 'active' || remoteStream === null}
          onAccept={() => void accept()}
          onDecline={() => void decline()}
          onCancel={() => void endCall('ended')}
          onEnd={() => void endCall('ended')}
          onToggleMute={toggleMute}
          onToggleCamera={toggleCamera}
          onToggleSpeaker={() => undefined}
          onSwitchCamera={() => void managerRef.current?.switchCamera()}
        />
      )}
    </CallContext.Provider>
  );
}
