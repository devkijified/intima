'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Plus, Loader2, Trash2, Eye } from 'lucide-react';
import { containsPhoneNumber, CONTACT_WARNING } from '@/lib/moderation/contactCheck';

/**
 * Provider story manager: post a 24h story (photo/video URL + caption),
 * see active stories with view counts, delete.
 * Media hosting: paste a URL for now (same pattern as gallery).
 */
export function StoryManager() {
  const [stories, setStories] = useState<{ id: string; media_url: string; media_type: string; caption: string | null; created_at: string; views: number }[]>([]);
  const [url, setUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [isVideo, setIsVideo] = useState(false);
  const [posting, setPosting] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data } = await supabase
      .from('stories')
      .select('id, media_url, media_type, caption, created_at')
      .eq('provider_id', user.id)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });
    const withViews = await Promise.all(
      (data ?? []).map(async (s) => {
        const { count } = await supabase
          .from('story_views')
          .select('story_id', { count: 'exact', head: true })
          .eq('story_id', s.id);
        return { ...s, views: count ?? 0 };
      })
    );
    setStories(withViews);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const post = async () => {
    const media = url.trim();
    if (!media || posting) return;
    if (containsPhoneNumber(caption)) {
      setBlocked(true);
      return;
    }
    setBlocked(false);
    setPosting(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('stories').insert({
        provider_id: user.id,
        media_url: media,
        media_type: isVideo ? 'video' : 'photo',
        caption: caption.trim() || null,
      });
      setUrl('');
      setCaption('');
      await load();
    }
    setPosting(false);
  };

  const remove = async (id: string) => {
    const supabase = createClient();
    await supabase.from('stories').delete().eq('id', id);
    setStories((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <div className="rounded-2xl border border-neutral-200/80 bg-white p-6 shadow-xs">
      <h2 className="mb-1 font-serif text-lg text-neutral-900">Stories</h2>
      <p className="mb-4 text-xs text-neutral-500">
        Post 24-hour stories like WhatsApp Status. Clients see them in the story tray.
      </p>

      <div className="space-y-3">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Photo or video URL"
          className="w-full rounded-2xl border border-neutral-200 px-4 py-3 text-sm outline-none focus:border-primary"
        />
        <input
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Caption (optional, 200 chars)"
          maxLength={200}
          className="w-full rounded-2xl border border-neutral-200 px-4 py-3 text-sm outline-none focus:border-primary"
        />
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-neutral-600">
            <input
              type="checkbox"
              checked={isVideo}
              onChange={(e) => setIsVideo(e.target.checked)}
              className="h-4 w-4 accent-[#AC244D]"
            />
            This is a video
          </label>
          {blocked && (
            <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {CONTACT_WARNING}
            </p>
          )}
          <button
            onClick={post}
            disabled={posting || !url.trim()}
            className="ml-auto flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Post story
          </button>
        </div>
      </div>

      <div className="mt-5">
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-neutral-300" />
        ) : stories.length === 0 ? (
          <p className="text-sm text-neutral-400">No active stories. They expire after 24 hours.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {stories.map((s) => (
              <div key={s.id} className="relative aspect-[3/4] overflow-hidden rounded-xl bg-neutral-100">
                {s.media_type === 'video' ? (
                  <video src={s.media_url} className="h-full w-full object-cover" muted playsInline />
                ) : (
                  <img src={s.media_url} alt="" className="h-full w-full object-cover" />
                )}
                <span className="absolute bottom-1 left-1 flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white">
                  <Eye className="h-2.5 w-2.5" /> {s.views}
                </span>
                <button
                  onClick={() => remove(s.id)}
                  aria-label="Delete story"
                  className="absolute right-1 top-1 rounded-full bg-black/55 p-1.5 text-white"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
