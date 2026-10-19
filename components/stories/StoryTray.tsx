'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { StoryViewer, type Story } from './StoryViewer';
import { Plus } from 'lucide-react';

interface TrayProvider {
  provider_id: string;
  provider_name: string;
  provider_avatar: string | null;
  stories: Story[];
  hasUnseen: boolean;
}

/**
 * WhatsApp Status-style story tray: horizontal scroll of avatar rings.
 * Gradient ring = unseen stories, gray = all seen. Tapping opens the viewer.
 */
export function StoryTray() {
  const [groups, setGroups] = useState<TrayProvider[]>([]);
  const [viewer, setViewer] = useState<{ stories: Story[]; index: number } | null>(null);
  const [myId, setMyId] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (live) setMyId(user?.id ?? null);

      const { data: rows } = await supabase
        .from('stories')
        .select('id, provider_id, media_url, media_type, caption, created_at')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(100);
      if (!rows || !live) return;

      // Group by provider.
      const byProvider = new Map<string, typeof rows>();
      for (const r of rows) {
        const list = byProvider.get(r.provider_id) ?? [];
        list.push(r);
        byProvider.set(r.provider_id, list);
      }

      const result: TrayProvider[] = [];
      for (const [pid, list] of byProvider) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('display_name, avatar_url')
          .eq('id', pid)
          .single();
        let hasUnseen = true;
        if (user) {
          const { data: seen } = await supabase
            .from('story_views')
            .select('story_id')
            .eq('viewer_id', user.id)
            .in('story_id', list.map((s) => s.id));
          const seenIds = new Set((seen ?? []).map((s) => s.story_id));
          hasUnseen = list.some((s) => !seenIds.has(s.id));
        }
        result.push({
          provider_id: pid,
          provider_name: prof?.display_name ?? 'Member',
          provider_avatar: prof?.avatar_url ?? null,
          stories: list
            .sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at))
            .map((s) => ({
              ...s,
              media_type: s.media_type as 'photo' | 'video',
              provider_name: prof?.display_name ?? 'Member',
              provider_avatar: prof?.avatar_url ?? null,
            })),
          hasUnseen,
        });
      }
      // Unseen first.
      result.sort((a, b) => Number(b.hasUnseen) - Number(a.hasUnseen));
      if (live) setGroups(result);
    })();
    return () => { live = false; };
  }, []);

  if (groups.length === 0) return null;

  const openViewer = (g: TrayProvider) => {
    const all: Story[] = [];
    const startIndex = groups.reduce((acc, grp) => {
      if (grp.provider_id === g.provider_id) return acc;
      return acc + grp.stories.length;
    }, 0);
    for (const grp of groups) all.push(...grp.stories);
    setViewer({ stories: all, index: startIndex });
  };

  return (
    <>
      <div className="flex gap-3 overflow-x-auto px-4 py-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {groups.map((g) => (
          <button
            key={g.provider_id}
            onClick={() => openViewer(g)}
            className="flex w-16 shrink-0 flex-col items-center gap-1"
          >
            <span
              className={`rounded-full p-[2.5px] ${
                g.hasUnseen
                  ? 'bg-gradient-to-tr from-gold via-primary to-gold'
                  : 'bg-neutral-200'
              }`}
            >
              <span className="block rounded-full bg-white p-[2px]">
                {g.provider_avatar ? (
                  <img src={g.provider_avatar} alt={g.provider_name} className="h-14 w-14 rounded-full object-cover" />
                ) : (
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-cream font-display text-lg text-neutral-400">
                    {(g.provider_name[0] ?? '?').toUpperCase()}
                  </span>
                )}
              </span>
            </span>
            <span className="w-full truncate text-center text-[11px] text-neutral-600">
              {g.provider_id === myId ? 'You' : g.provider_name.split(' ')[0]}
            </span>
          </button>
        ))}
      </div>
      {viewer && (
        <StoryViewer
          stories={viewer.stories}
          initialIndex={viewer.index}
          onClose={() => setViewer(null)}
        />
      )}
    </>
  );
}
