'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import { Room, RoomEvent, Track } from 'livekit-client';
import { Pause, Play, X } from '@/lib/icons';

/**
 * In-app floating player (the TikTok-style dock). Native browser
 * picture-in-picture is unreliable on iPhone Safari, so the player
 * lives at the app shell level instead: a live stream or a media
 * video handed to the dock keeps playing while the user browses,
 * until they expand back into it or close it for real.
 *
 * Live: the dock holds its own viewer connection (a fresh token from
 * /api/live/token; the paid gate there is access based, so re-entry
 * never double charges). Expanding routes back to the full room,
 * which reconnects there. Hosts never dock: their publishing stays
 * in the room.
 *
 * Media: a plain video element with play/pause, an expand toggle
 * and close.
 */

export interface DockLive {
  kind: 'live';
  sessionId: string;
  title: string;
  hostName: string;
}

export interface DockMedia {
  kind: 'media';
  src: string;
  poster?: string | null;
  title?: string | null;
}

export type DockContent = DockLive | DockMedia;

interface DockApi {
  content: DockContent | null;
  showLive: (live: Omit<DockLive, 'kind'>) => void;
  showMedia: (media: Omit<DockMedia, 'kind'>) => void;
  clear: () => void;
  clearLiveSession: (sessionId: string) => void;
}

const DockContext = createContext<DockApi | null>(null);

export function useDock(): DockApi {
  const ctx = useContext(DockContext);
  if (!ctx) throw new Error('useDock must be used inside DockProvider');
  return ctx;
}

export function DockProvider({ children }: { children: React.ReactNode }) {
  const [content, setContent] = useState<DockContent | null>(null);

  const showLive = useCallback((live: Omit<DockLive, 'kind'>) => {
    setContent({ kind: 'live', ...live });
  }, []);
  const showMedia = useCallback((media: Omit<DockMedia, 'kind'>) => {
    setContent({ kind: 'media', ...media });
  }, []);
  const clear = useCallback(() => setContent(null), []);
  const clearLiveSession = useCallback((sessionId: string) => {
    setContent((prev) =>
      prev && prev.kind === 'live' && prev.sessionId === sessionId
        ? null
        : prev
    );
  }, []);

  return (
    <DockContext.Provider
      value={{ content, showLive, showMedia, clear, clearLiveSession }}
    >
      {children}
      {content && <DockShell content={content} onClear={clear} />}
    </DockContext.Provider>
  );
}

function DockShell({
  content,
  onClear,
}: {
  content: DockContent;
  onClear: () => void;
}) {
  const router = useRouter();
  const [big, setBig] = useState(false);

  const expand = () => {
    if (content.kind === 'live') {
      const sessionId = content.sessionId;
      onClear();
      router.push(`/live/${sessionId}`);
    } else {
      setBig((b) => !b);
    }
  };

  return (
    <div
      className={`fixed right-3 z-[80] overflow-hidden rounded-2xl bg-black shadow-2xl ring-1 ring-white/25 transition-all bottom-[calc(5.75rem+env(safe-area-inset-bottom))] md:right-6 md:bottom-6 ${
        big ? 'w-[86vw] max-w-[430px]' : 'w-[188px] md:w-[228px]'
      }`}
    >
      <div className="relative aspect-video w-full">
        {content.kind === 'live' ? (
          <LiveDockVideo sessionId={content.sessionId} onEnded={onClear} />
        ) : (
          <MediaDockVideo src={content.src} poster={content.poster} />
        )}
        {/* Top row: badge/title + close */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 bg-gradient-to-b from-black/60 to-transparent p-2">
          <span className="flex min-w-0 items-center gap-1.5">
            {content.kind === 'live' && (
              <span className="rounded bg-primary px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                Live
              </span>
            )}
            <span className="truncate text-[11px] font-semibold text-white">
              {content.kind === 'live' ? content.hostName : content.title ?? ''}
            </span>
          </span>
          <button
            onClick={onClear}
            aria-label="Close player"
            className="pointer-events-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm active:scale-95"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        {/* Bottom row: expand */}
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/60 to-transparent p-2">
          <span className="max-w-[70%] truncate text-[10px] text-white/85">
            {content.kind === 'live' ? content.title : 'Tap to expand'}
          </span>
          <button
            onClick={expand}
            aria-label="Open full player"
            className="rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-bold text-charcoal active:scale-95"
          >
            {content.kind === 'live' || big ? 'Open' : 'Expand'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Viewer connection for a docked live stream. Mints a fresh viewer
 * token, connects a Room, and attaches the host's camera + audio.
 * If the room disconnects (stream over), the dock closes itself.
 */
function LiveDockVideo({
  sessionId,
  onEnded,
}: {
  sessionId: string;
  onEnded: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioHolderRef = useRef<HTMLDivElement>(null);
  const [connecting, setConnecting] = useState(true);
  const endedRef = useRef(onEnded);
  endedRef.current = onEnded;

  useEffect(() => {
    let cancelled = false;
    const room = new Room({ adaptiveStream: true, dynacast: true });
    const attached = new Map<string, { detach: () => void }>();

    const attach = (track: any, pub: any) => {
      if (cancelled) return;
      if (track.kind === Track.Kind.Video) {
        // Prefer the camera; a screen share may replace it.
        const isScreen = pub?.source === Track.Source.ScreenShare;
        const existing = attached.get('video');
        if (existing && !isScreen) return;
        existing?.detach();
        const el = videoRef.current;
        if (el) track.attach(el);
        attached.set('video', { detach: () => track.detach() });
        setConnecting(false);
      } else if (track.kind === Track.Kind.Audio) {
        const el = track.attach() as HTMLMediaElement;
        el.setAttribute('playsinline', 'true');
        audioHolderRef.current?.appendChild(el);
        attached.set(`audio-${track.sid}`, {
          detach: () => {
            track.detach();
            el.remove();
          },
        });
      }
    };

    room.on(RoomEvent.TrackSubscribed, (track: any, pub: any) => {
      attach(track, pub);
    });
    room.on(RoomEvent.TrackUnsubscribed, (track: any) => {
      if (track.kind === Track.Kind.Video) {
        track.detach();
        attached.delete('video');
      } else {
        attached.get(`audio-${track.sid}`)?.detach();
        attached.delete(`audio-${track.sid}`);
      }
    });
    room.on(RoomEvent.Disconnected, () => {
      if (!cancelled) endedRef.current();
    });

    (async () => {
      try {
        const res = await fetch('/api/live/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, role: 'viewer' }),
        });
        if (!res.ok) throw new Error('token');
        const { token, url } = (await res.json()) as {
          token: string;
          url: string;
        };
        if (cancelled) return;
        await room.connect(url, token);
        // Tracks that were already subscribed at connect time.
        room.remoteParticipants.forEach((p) => {
          p.trackPublications.forEach((pub: any) => {
            if (pub.track) attach(pub.track, pub);
          });
        });
      } catch {
        if (!cancelled) endedRef.current();
      }
    })();

    return () => {
      cancelled = true;
      attached.forEach((a) => a.detach());
      attached.clear();
      void room.disconnect();
    };
  }, [sessionId]);

  return (
    <>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div ref={audioHolderRef} className="hidden" />
      {connecting && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[11px] font-medium text-white/80">
            Connecting...
          </span>
        </div>
      )}
    </>
  );
}

function MediaDockVideo({
  src,
  poster,
}: {
  src: string;
  poster?: string | null;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(true);

  const toggle = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      void v.play().catch(() => {});
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  };

  return (
    <>
      <video
        ref={videoRef}
        src={src}
        poster={poster ?? undefined}
        autoPlay
        loop
        playsInline
        onClick={toggle}
        className="absolute inset-0 h-full w-full cursor-pointer object-cover"
      />
      {!playing && (
        <button
          onClick={toggle}
          aria-label="Play"
          className="absolute inset-0 flex items-center justify-center bg-black/35 text-white"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/55 backdrop-blur-sm">
            <Play className="h-5 w-5" />
          </span>
        </button>
      )}
      {playing && (
        <span className="pointer-events-none absolute bottom-9 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/45 text-white">
          <Pause className="h-3 w-3" />
        </span>
      )}
    </>
  );
}
