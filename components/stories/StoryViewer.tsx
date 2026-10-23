'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Eye } from '@/lib/icons';
import { createClient } from '@/lib/supabase/client';
import { Tooltip } from '@/components/ui/Tooltip';
import { PhotoWatermark } from '@/components/media/PhotoWatermark';
import { formatCompactCount } from '@/lib/utils/helpers';

export interface Story {
  id: string;
  provider_id: string;
  media_url: string;
  media_type: 'photo' | 'video';
  caption: string | null;
  created_at: string;
  provider_name: string;
  provider_avatar: string | null;
  provider_username: string | null;
}

interface StoryViewerProps {
  stories: Story[];
  initialIndex: number;
  onClose: () => void;
  /** Tapping the header (avatar or name) opens her profile. */
  onViewProfile?: (story: Story) => void;
  /** CTA under the story: start a connection with this companion. */
  onRequestConnection?: (story: Story) => void;
}

const SLIDE_MS = 5000;

/**
 * Fullscreen story viewer in the flow people already know from
 * Instagram and WhatsApp Status.
 *
 * The story list arrives grouped by companion. The progress bars
 * show only the current companion's segments. Tap right = next
 * story of THIS companion, and only at her last story does the
 * tap cross into the next companion (tap left mirrors it back).
 * A horizontal swipe jumps straight between companions, landing
 * where you left that companion if you visited her this session.
 * Swipe down closes. Press and hold pauses, and letting go after
 * a hold never advances: the hold was for reading, not a tap.
 * The header opens her profile, and a CTA row sits under the
 * media so a story can turn into a connection.
 */
export function StoryViewer({
  stories,
  initialIndex,
  onClose,
  onViewProfile,
  onRequestConnection,
}: StoryViewerProps) {
  const [index, setIndex] = useState(initialIndex);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [viewCount, setViewCount] = useState<number | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pointerX = useRef<number | null>(null);
  const pointerY = useRef<number | null>(null);
  // When the current press began: a release after a long hold is
  // not a tap, and the zones must not advance on it.
  const downAt = useRef(0);
  // Stamp of the last swipe: the tap zones ignore the click a
  // browser synthesises right after a swipe ends on them.
  const lastSwipeAt = useRef(0);
  // Where each companion was left this session, by group index:
  // swiping back to a companion resumes her at that story instead
  // of restarting her or dumping you at a boundary.
  const leftAtByGroup = useRef(new Map<number, number>());
  const story = stories[index];

  // Group boundaries: runs of consecutive stories per companion.
  const groups = useMemo(() => {
    const out: { providerId: string; start: number; count: number }[] = [];
    stories.forEach((s, i) => {
      const last = out[out.length - 1];
      if (last && last.providerId === s.provider_id) last.count += 1;
      else out.push({ providerId: s.provider_id, start: i, count: 1 });
    });
    return out;
  }, [stories]);
  const groupIndex = groups.findIndex(
    (g) => index >= g.start && index < g.start + g.count,
  );
  const group = groups[groupIndex];
  const indexInGroup = group ? index - group.start : 0;

  const next = useCallback(() => {
    if (index < stories.length - 1) {
      setIndex(index + 1);
      setProgress(0);
    } else {
      onClose();
    }
  }, [index, stories.length, onClose]);

  const prev = useCallback(() => {
    if (index > 0) {
      setIndex(index - 1);
      setProgress(0);
    }
  }, [index]);

  const nextCompanion = useCallback(() => {
    const g = groups[groupIndex + 1];
    if (g) {
      const leftAt = leftAtByGroup.current.get(groupIndex + 1) ?? 0;
      setIndex(g.start + Math.min(leftAt, g.count - 1));
      setProgress(0);
    } else {
      onClose();
    }
  }, [groups, groupIndex, onClose]);

  const prevCompanion = useCallback(() => {
    // A swipe back always jumps to the previous companion, even
    // mid-group: restarting the current companion first (the old
    // behaviour) reads as the swipe being ignored.
    const g = groups[groupIndex - 1];
    if (g) {
      const leftAt = leftAtByGroup.current.get(groupIndex - 1) ?? 0;
      setIndex(g.start + Math.min(leftAt, g.count - 1));
      setProgress(0);
    }
  }, [groups, groupIndex]);

  // Remember where each companion is left, for swipe returns.
  useEffect(() => {
    if (group) leftAtByGroup.current.set(groupIndex, indexInGroup);
  }, [group, groupIndex, indexInGroup]);

  // Who am I (for hiding the CTA on my own stories) + view marking.
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setMyId(data.user?.id ?? null));
  }, []);

  // Mark as viewed + fetch view count.
  useEffect(() => {
    if (!story) return;
    const supabase = createClient();
    let live = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('story_views').upsert(
          { story_id: story.id, viewer_id: user.id },
          { onConflict: 'story_id,viewer_id' }
        );
      }
      const { count } = await supabase
        .from('story_views')
        .select('story_id', { count: 'exact', head: true })
        .eq('story_id', story.id);
      if (live) setViewCount(count ?? 0);
    })();
    return () => { live = false; };
  }, [story]);

  // Auto-advance for photos, frozen while paused (press and hold).
  useEffect(() => {
    if (!story || story.media_type === 'video' || paused) return;
    const start = Date.now() - progress * SLIDE_MS;
    const t = setInterval(() => {
      const elapsed = Date.now() - start;
      setProgress(Math.min(1, elapsed / SLIDE_MS));
      if (elapsed >= SLIDE_MS) next();
    }, 50);
    return () => clearInterval(t);
    // progress is the resume offset, read once per run on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story, next, paused]);

  // Video: pause with the hold state, advance on ended.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !story || story.media_type !== 'video') return;
    if (paused) v.pause();
    else void v.play().catch(() => {});
  }, [paused, story]);

  const onVideoTime = () => {
    const v = videoRef.current;
    if (v && v.duration) setProgress(v.currentTime / v.duration);
  };

  if (!story || !group) return null;

  const isMine = myId !== null && story.provider_id === myId;
  const showCta = !isMine && (onViewProfile || onRequestConnection);

  return (
    <div data-protect className="fixed inset-0 z-[90] bg-black">
      {/* Progress bars: this companion's segments only. */}
      <div className="absolute left-0 right-0 top-0 z-20 flex gap-1 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        {Array.from({ length: group.count }).map((_, i) => (
          <div key={i} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/30">
            <div
              className="h-full rounded-full bg-white transition-none"
              style={{ width: `${i < indexInGroup ? 100 : i === indexInGroup ? progress * 100 : 0}%` }}
            />
          </div>
        ))}
      </div>

      {/* Header: avatar + name open her profile. */}
      <div className="absolute left-0 right-0 top-8 z-20 flex items-center gap-3 px-4 pt-2">
        <button
          type="button"
          onClick={() => onViewProfile?.(story)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          aria-label={`View ${story.provider_name}'s profile`}
        >
          {story.provider_avatar ? (
            <img src={story.provider_avatar} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover ring-2 ring-white/50" />
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 font-display text-white">
              {(story.provider_name[0] ?? '?').toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{story.provider_name}</p>
            <p className="text-xs text-white/60">
              {new Date(story.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </button>
        <Tooltip label="Close">
        <button onClick={onClose} aria-label="Close" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/15 text-white">
          <X className="h-5 w-5" />
        </button>
        </Tooltip>
      </div>

      {/* Media: fills the frame. Tap zones go story to story
          (crossing into the next companion only at her last
          story), horizontal swipes jump straight between
          companions, a downward swipe closes, press and hold
          pauses without advancing on release. One pointer path
          covers touch and mouse drags alike. */}
      <div
        className="relative h-full w-full touch-none select-none"
        onPointerDown={(e) => {
          setPaused(true);
          pointerX.current = e.clientX;
          pointerY.current = e.clientY;
          downAt.current = Date.now();
        }}
        onPointerUp={(e) => {
          setPaused(false);
          if (pointerX.current === null || pointerY.current === null) return;
          const dx = e.clientX - pointerX.current;
          const dy = e.clientY - pointerY.current;
          pointerX.current = null;
          pointerY.current = null;
          if (dy >= 80 && Math.abs(dy) > Math.abs(dx)) {
            lastSwipeAt.current = Date.now();
            onClose();
          } else if (dx <= -45) {
            lastSwipeAt.current = Date.now();
            nextCompanion();
          } else if (dx >= 45) {
            lastSwipeAt.current = Date.now();
            prevCompanion();
          }
        }}
        onPointerLeave={() => {
          setPaused(false);
          pointerX.current = null;
          pointerY.current = null;
        }}
        onPointerCancel={() => {
          setPaused(false);
          pointerX.current = null;
          pointerY.current = null;
        }}
      >
        {story.media_type === 'photo' ? (
          <img src={story.media_url} alt="" className="h-full w-full object-cover" draggable={false} />
        ) : (
          <video
            ref={videoRef}
            src={story.media_url}
            autoPlay
            playsInline
            onTimeUpdate={onVideoTime}
            onEnded={next}
            className="h-full w-full object-cover"
          />
        )}
        <PhotoWatermark username={story.provider_username} variant="edge" />
        <button
          aria-label="Previous"
          onClick={() => {
            if (Date.now() - lastSwipeAt.current < 400) return;
            if (Date.now() - downAt.current > 350) return;
            prev();
          }}
          className="absolute inset-y-0 left-0 z-10 w-[30%]"
        />
        <button
          aria-label="Next"
          onClick={() => {
            if (Date.now() - lastSwipeAt.current < 400) return;
            if (Date.now() - downAt.current > 350) return;
            next();
          }}
          className="absolute inset-y-0 right-0 z-10 w-[70%]"
        />
      </div>

      {/* Caption + views + CTA */}
      <div className="absolute bottom-0 left-0 right-0 z-20 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {story.caption && (
          <p className="rounded-2xl bg-black/50 px-4 py-2.5 text-sm text-white backdrop-blur">
            {story.caption}
          </p>
        )}
        {viewCount !== null && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-white/60">
            <Eye className="h-3.5 w-3.5" /> {formatCompactCount(viewCount)} views
          </p>
        )}
        {showCta && (
          <div className="mt-3 flex gap-2">
            {onViewProfile && (
              <button
                type="button"
                onClick={() => onViewProfile(story)}
                className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-full bg-white/15 px-4 text-sm font-semibold text-white backdrop-blur transition-all active:scale-[0.98]"
              >
                View profile
              </button>
            )}
            {onRequestConnection && (
              <button
                type="button"
                onClick={() => onRequestConnection(story)}
                className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-full bg-[#AC244D] px-4 text-sm font-semibold text-white shadow-lg transition-all active:scale-[0.98]"
              >
                Request connection
              </button>
            )}
          </div>
        )}
      </div>

      {/* Edge arrows for desktop */}
      <Tooltip label="Previous story" wrapperClassName="absolute left-3 top-1/2 z-20 hidden -translate-y-1/2 md:block">
      <button onClick={prev} aria-label="Previous story"
        className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white">
        <ChevronLeft className="h-5 w-5" />
      </button>
      </Tooltip>
      <Tooltip label="Next story" wrapperClassName="absolute right-3 top-1/2 z-20 hidden -translate-y-1/2 md:block">
      <button onClick={next} aria-label="Next story"
        className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white">
        <ChevronRight className="h-5 w-5" />
      </button>
      </Tooltip>
    </div>
  );
}
