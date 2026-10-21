'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Eye } from '@/lib/icons';
import { createClient } from '@/lib/supabase/client';
import { Tooltip } from '@/components/ui/Tooltip';
import { PhotoWatermark } from '@/components/media/PhotoWatermark';

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
}

const SLIDE_MS = 5000;

/**
 * WhatsApp Status-style fullscreen story viewer.
 * Tap right = next, tap left = previous, progress bars on top.
 * Photos auto-advance after 5s; videos play through once.
 */
export function StoryViewer({ stories, initialIndex, onClose }: StoryViewerProps) {
  const [index, setIndex] = useState(initialIndex);
  const [progress, setProgress] = useState(0);
  const [viewCount, setViewCount] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const story = stories[index];

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

  // Auto-advance for photos.
  useEffect(() => {
    if (!story || story.media_type === 'video') return;
    const start = Date.now();
    timer.current = setInterval(() => {
      const elapsed = Date.now() - start;
      setProgress(Math.min(1, elapsed / SLIDE_MS));
      if (elapsed >= SLIDE_MS) next();
    }, 50);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [story, next]);

  // Video: advance on ended, track progress.
  const onVideoTime = () => {
    const v = videoRef.current;
    if (v && v.duration) setProgress(v.currentTime / v.duration);
  };

  if (!story) return null;

  return (
    <div className="fixed inset-0 z-[90] bg-black">
      {/* Progress bars */}
      <div className="absolute left-0 right-0 top-0 z-10 flex gap-1 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        {stories.map((s, i) => (
          <div key={s.id} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/30">
            <div
              className="h-full rounded-full bg-white transition-none"
              style={{ width: `${i < index ? 100 : i === index ? progress * 100 : 0}%` }}
            />
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="absolute left-0 right-0 top-8 z-10 flex items-center gap-3 px-4 pt-2">
        {story.provider_avatar ? (
          <img src={story.provider_avatar} alt="" className="h-9 w-9 rounded-full object-cover ring-2 ring-white/50" />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 font-display text-white">
            {(story.provider_name[0] ?? '?').toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{story.provider_name}</p>
          <p className="text-xs text-white/60">
            {new Date(story.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <Tooltip label="Close">
        <button onClick={onClose} aria-label="Close" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/15 text-white">
          <X className="h-5 w-5" />
        </button>
        </Tooltip>
      </div>

      {/* Media with tap zones */}
      <div className="relative h-full w-full">
        {story.media_type === 'photo' ? (
          <img src={story.media_url} alt="" className="h-full w-full object-contain" draggable={false} />
        ) : (
          <video
            ref={videoRef}
            src={story.media_url}
            autoPlay
            playsInline
            onTimeUpdate={onVideoTime}
            onEnded={next}
            className="h-full w-full object-contain"
          />
        )}
        <PhotoWatermark username={story.provider_username} variant="edge" />
        <button aria-label="Previous" onClick={prev} className="absolute inset-y-0 left-0 w-1/3" />
        <button aria-label="Next" onClick={next} className="absolute inset-y-0 right-0 w-1/3" />
      </div>

      {/* Caption + views */}
      <div className="absolute bottom-0 left-0 right-0 z-10 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {story.caption && (
          <p className="rounded-2xl bg-black/50 px-4 py-2.5 text-sm text-white backdrop-blur">
            {story.caption}
          </p>
        )}
        {viewCount !== null && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-white/60">
            <Eye className="h-3.5 w-3.5" /> {viewCount} views
          </p>
        )}
      </div>

      {/* Edge arrows for desktop */}
      <Tooltip label="Previous story" wrapperClassName="absolute left-3 top-1/2 z-10 hidden -translate-y-1/2 md:block">
      <button onClick={prev} aria-label="Previous story"
        className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white">
        <ChevronLeft className="h-5 w-5" />
      </button>
      </Tooltip>
      <Tooltip label="Next story" wrapperClassName="absolute right-3 top-1/2 z-10 hidden -translate-y-1/2 md:block">
      <button onClick={next} aria-label="Next story"
        className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white">
        <ChevronRight className="h-5 w-5" />
      </button>
      </Tooltip>
    </div>
  );
}
