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
import {
  Room,
  RoomEvent,
  Track,
  createLocalAudioTrack,
  createLocalVideoTrack,
  type LocalAudioTrack,
  type LocalVideoTrack,
  type RemoteVideoTrack,
} from 'livekit-client';
import { createClient } from '@/lib/supabase/client';
import { CallModal } from './CallModal';

export type CallKind = 'voice' | 'video';
export type CallDirection = 'outgoing' | 'incoming' | 'active';

interface ActiveCall {
  direction: CallDirection;
  kind: CallKind;
  peerId: string;
  peerName: string;
  peerAvatar?: string;
  room: string;
}

interface IncomingRing {
  from: string;
  fromName: string;
  fromAvatar?: string;
  kind: CallKind;
  room: string;
}

interface CallContextValue {
  startCall: (
    peerId: string,
    peerName: string,
    kind: CallKind,
    peerAvatar?: string,
  ) => Promise<void>;
}

const CallContext = createContext<CallContextValue>({
  startCall: async () => undefined,
});

export const useCall = () => useContext(CallContext);

const RING_TIMEOUT_MS = 45_000;

async function fetchCallToken(peerId: string, kind: CallKind) {
  const res = await fetch('/api/calls/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ peerId, kind }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || 'Could not start call');
  }
  return (await res.json()) as { token: string; url: string; room: string };
}

export function CallProvider({ children }: { children: ReactNode }) {
  const [supabase] = useState<SupabaseClient>(() => createClient());
  const [call, setCall] = useState<ActiveCall | null>(null);
  const [incoming, setIncoming] = useState<IncomingRing | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [callError, setCallError] = useState<string | null>(null);

  const roomRef = useRef<Room | null>(null);
  const audioTrackRef = useRef<LocalAudioTrack | null>(null);
  const videoTrackRef = useRef<LocalVideoTrack | null>(null);
  const callRef = useRef<ActiveCall | null>(null);
  const incomingRef = useRef<IncomingRing | null>(null);
  const myIdRef = useRef<string | null>(null);
  const myNameRef = useRef<string>('Intima member');
  const myAvatarRef = useRef<string | undefined>(undefined);
  const inboundRef = useRef<RealtimeChannel | null>(null);
  const ringTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reringRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const peerChannelsRef = useRef(new Map<string, RealtimeChannel>());

  useEffect(() => {
    callRef.current = call;
  }, [call]);

  useEffect(() => {
    incomingRef.current = incoming;
  }, [incoming]);

  const clearRingTimer = useCallback(() => {
    if (ringTimerRef.current) {
      clearTimeout(ringTimerRef.current);
      ringTimerRef.current = null;
    }
    if (reringRef.current) {
      clearInterval(reringRef.current);
      reringRef.current = null;
    }
  }, []);

  const getPeerChannel = useCallback(
    (peerId: string): RealtimeChannel => {
      let ch = peerChannelsRef.current.get(peerId);
      if (!ch) {
        ch = supabase.channel(`call-${peerId}`);
        ch.subscribe();
        peerChannelsRef.current.set(peerId, ch);
      }
      return ch;
    },
    [supabase],
  );

  const signalPeer = useCallback(
    async (peerId: string, event: string, payload: Record<string, unknown>) => {
      try {
        await getPeerChannel(peerId).send({ type: 'broadcast', event, payload });
      } catch {
        // Signaling is best effort.
      }
    },
    [getPeerChannel],
  );

  const teardownRoom = useCallback(() => {
    clearRingTimer();
    const room = roomRef.current;
    roomRef.current = null;
    try {
      room?.disconnect();
    } catch {
      // Already gone.
    }
    audioTrackRef.current?.stop();
    videoTrackRef.current?.stop();
    audioTrackRef.current = null;
    videoTrackRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setMuted(false);
    setCameraOff(false);
    setCall(null);
  }, [clearRingTimer]);

  const endCall = useCallback(
    async (notifyPeerId?: string, room?: string) => {
      if (notifyPeerId && room) {
        await signalPeer(notifyPeerId, 'call:end', { room });
      }
      teardownRoom();
    },
    [signalPeer, teardownRoom],
  );

  const attachRemoteHandlers = useCallback((room: Room, kind: CallKind) => {
    const onTrackSubscribed = (track: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const t = track as any;
      if (t?.kind === Track.Kind.Video && kind === 'video') {
        const vt = t as RemoteVideoTrack;
        setRemoteStream(vt.mediaStream ?? null);
      }
    };
    room.on(RoomEvent.TrackSubscribed, onTrackSubscribed);
    // Already-subscribed tracks (race on fast join).
    room.remoteParticipants.forEach((p) => {
      p.videoTrackPublications.forEach((pub) => {
        if (pub.track && kind === 'video') {
          setRemoteStream((pub.track as RemoteVideoTrack).mediaStream ?? null);
        }
      });
    });
  }, []);

  const joinRoom = useCallback(
    async (token: string, url: string, roomName: string, kind: CallKind) => {
      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;

      const audio = await createLocalAudioTrack();
      audioTrackRef.current = audio;
      let video: LocalVideoTrack | null = null;
      if (kind === 'video') {
        video = await createLocalVideoTrack({ facingMode: 'user' });
        videoTrackRef.current = video;
        setLocalStream(video.mediaStream ?? null);
      }

      attachRemoteHandlers(room, kind);

      room.on(RoomEvent.ParticipantConnected, () => {
        setCall((c) => (c ? { ...c, direction: 'active' } : c));
      });
      room.on(RoomEvent.Disconnected, () => {
        teardownRoom();
      });

      await room.connect(url, token);
      await room.localParticipant.publishTrack(audio);
      if (video) {
        await room.localParticipant.publishTrack(video);
      }
      // If the peer is already in the room, mark active immediately.
      if (room.remoteParticipants.size > 0) {
        setCall((c) => (c ? { ...c, direction: 'active' } : c));
      }
    },
    [attachRemoteHandlers, teardownRoom],
  );

  const startCall = useCallback(
    async (peerId: string, peerName: string, kind: CallKind, peerAvatar?: string) => {
      if (callRef.current || incoming || !myIdRef.current) return;
      setCallError(null);
      try {
        const { token, url, room } = await fetchCallToken(peerId, kind);
        setCall({
          direction: 'outgoing',
          kind,
          peerId,
          peerName,
          peerAvatar,
          room,
        });
        await joinRoom(token, url, room, kind);
        await signalPeer(peerId, 'call:ring', {
          from: myIdRef.current,
          fromName: myNameRef.current,
          fromAvatar: myAvatarRef.current,
          kind,
          room,
        });
        // Push as well as ring: the realtime ring only reaches a callee
        // whose app is already open. The push wakes everyone else, and the
        // re-ring below means a callee who opens the app from the push
        // still catches the call instead of a missed broadcast.
        void fetch('/api/push/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_ids: [peerId],
            type: 'incoming_call',
            title: 'Incoming call',
            body: `${myNameRef.current} is calling you`,
            link: '/dashboard',
          }),
        }).catch(() => {});
        if (reringRef.current) clearInterval(reringRef.current);
        reringRef.current = setInterval(() => {
          void signalPeer(peerId, 'call:ring', {
            from: myIdRef.current,
            fromName: myNameRef.current,
            fromAvatar: myAvatarRef.current,
            kind,
            room,
          });
        }, 4000);
        ringTimerRef.current = setTimeout(() => {
          void endCall(peerId, room);
        }, RING_TIMEOUT_MS);
      } catch (e) {
        setCallError(e instanceof Error ? e.message : 'Could not start call');
        teardownRoom();
      }
    },
    [incoming, joinRoom, signalPeer, endCall, teardownRoom],
  );

  const acceptCall = useCallback(async () => {
    const ring = incoming;
    if (!ring || callRef.current) return;
    setIncoming(null);
    clearRingTimer();
    setCallError(null);
    try {
      const { token, url, room } = await fetchCallToken(ring.from, ring.kind);
      setCall({
        direction: 'active',
        kind: ring.kind,
        peerId: ring.from,
        peerName: ring.fromName,
        peerAvatar: ring.fromAvatar,
        room,
      });
      await joinRoom(token, url, room, ring.kind);
      await signalPeer(ring.from, 'call:accept', { room });
    } catch (e) {
      setCallError(e instanceof Error ? e.message : 'Could not join call');
      await signalPeer(ring.from, 'call:decline', { room: ring.room });
      teardownRoom();
    }
  }, [incoming, joinRoom, signalPeer, clearRingTimer, teardownRoom]);

  const declineCall = useCallback(async () => {
    const ring = incoming;
    setIncoming(null);
    clearRingTimer();
    if (ring) {
      await signalPeer(ring.from, 'call:decline', { room: ring.room });
    }
  }, [incoming, signalPeer, clearRingTimer]);

  const toggleMute = useCallback(() => {
    const track = audioTrackRef.current;
    if (!track) return;
    const next = !muted;
    void (next ? track.mute() : track.unmute());
    setMuted(next);
  }, [muted]);

  const toggleCamera = useCallback(() => {
    const track = videoTrackRef.current;
    if (!track) return;
    const next = !cameraOff;
    void (next ? track.mute() : track.unmute());
    setCameraOff(next);
  }, [cameraOff]);

  const switchCamera = useCallback(async () => {
    const current = videoTrackRef.current;
    const room = roomRef.current;
    if (!current || !room) return;
    try {
      const facing =
        current.mediaStreamTrack.getSettings().facingMode === 'user'
          ? 'environment'
          : 'user';
      const next = await createLocalVideoTrack({
        facingMode: facing as 'user' | 'environment',
      });
      await room.localParticipant.unpublishTrack(current);
      await room.localParticipant.publishTrack(next);
      current.stop();
      videoTrackRef.current = next;
      setLocalStream(next.mediaStream ?? null);
    } catch {
      // Keep the current camera on failure.
    }
  }, []);

  // Inbound signaling: listen on our own per-user channel.
  useEffect(() => {
    let cancelled = false;
    async function subscribe() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled || !user) return;
      myIdRef.current = user.id;
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name, avatar_url')
        .eq('id', user.id)
        .maybeSingle();
      myNameRef.current =
        (profile as { display_name?: string } | null)?.display_name ??
        user.user_metadata?.display_name ??
        'Intima member';
      myAvatarRef.current =
        (profile as { avatar_url?: string } | null)?.avatar_url ?? undefined;

      const ch = supabase.channel(`call-${user.id}`);

      ch.on('broadcast', { event: 'call:ring' }, ({ payload }) => {
        const ring = payload as IncomingRing;
        if (!ring || ring.from === myIdRef.current) return;
        // A re-ring for the call already ringing here is not a new call:
        // the caller repeats the ring so late joiners still catch it.
        if (incomingRef.current && incomingRef.current.room === ring.room) return;
        if (callRef.current || incomingRef.current) {
          // Busy: tell the caller.
          void getPeerChannel(ring.from).send({
            type: 'broadcast',
            event: 'call:decline',
            payload: { room: ring.room, reason: 'busy' },
          });
          return;
        }
        setIncoming(ring);
        ringTimerRef.current = setTimeout(() => {
          setIncoming((cur) => {
            if (cur && cur.room === ring.room) {
              void getPeerChannel(ring.from).send({
                type: 'broadcast',
                event: 'call:decline',
                payload: { room: ring.room, reason: 'missed' },
              });
              return null;
            }
            return cur;
          });
        }, RING_TIMEOUT_MS);
      });

      ch.on('broadcast', { event: 'call:accept' }, ({ payload }) => {
        const p = payload as { room?: string };
        setCall((c) =>
          c && c.direction === 'outgoing' && (!p?.room || p.room === c.room)
            ? { ...c, direction: 'active' }
            : c,
        );
        clearRingTimer();
      });

      ch.on('broadcast', { event: 'call:decline' }, ({ payload }) => {
        const p = payload as { room?: string };
        const current = callRef.current;
        if (current && (!p?.room || p.room === current.room)) {
          teardownRoom();
        }
      });

      ch.on('broadcast', { event: 'call:end' }, ({ payload }) => {
        const p = payload as { room?: string };
        const current = callRef.current;
        if (current && (!p?.room || p.room === current.room)) {
          teardownRoom();
        }
      });

      ch.subscribe();
      inboundRef.current = ch;
    }
    subscribe();
    return () => {
      cancelled = true;
      clearRingTimer();
      if (inboundRef.current) {
        supabase.removeChannel(inboundRef.current);
        inboundRef.current = null;
      }
      peerChannelsRef.current.forEach((ch) => supabase.removeChannel(ch));
      peerChannelsRef.current.clear();
    };
  }, [supabase, clearRingTimer, teardownRoom, getPeerChannel]);

  // Tear down the LiveKit room if the provider unmounts mid-call.
  useEffect(() => {
    return () => {
      roomRef.current?.disconnect();
      audioTrackRef.current?.stop();
      videoTrackRef.current?.stop();
    };
  }, []);

  const shown = incoming
    ? { state: 'incoming' as const, kind: incoming.kind, peerName: incoming.fromName, peerAvatar: incoming.fromAvatar }
    : call
      ? {
          state: (call.direction === 'active' ? 'active' : 'outgoing') as 'outgoing' | 'active',
          kind: call.kind,
          peerName: call.peerName,
          peerAvatar: call.peerAvatar,
        }
      : null;

  return (
    <CallContext.Provider value={{ startCall }}>
      {children}
      {shown && (
        <CallModal
          state={shown.state}
          kind={shown.kind}
          peerName={shown.peerName}
          peerAvatar={shown.peerAvatar}
          localStream={localStream}
          remoteStream={remoteStream}
          muted={muted}
          cameraOff={cameraOff}
          connecting={!!call && call.direction !== 'active'}
          error={callError}
          onAccept={() => void acceptCall()}
          onDecline={() => void declineCall()}
          onCancel={() => {
            const c = callRef.current;
            void endCall(c?.peerId, c?.room);
          }}
          onEnd={() => {
            const c = callRef.current;
            void endCall(c?.peerId, c?.room);
          }}
          onToggleMute={toggleMute}
          onToggleCamera={toggleCamera}
          onSwitchCamera={() => void switchCamera()}
        />
      )}
    </CallContext.Provider>
  );
}
