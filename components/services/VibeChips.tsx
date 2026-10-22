import { Sparkles } from '@/lib/icons';

/**
 * A companion's vibe tags, shown as gold chips. Used on her
 * profile and in her map card, above the services list.
 */
export function VibeChips({ vibes }: { vibes: string[] | null | undefined }) {
  const list = (vibes ?? []).filter((v) => typeof v === 'string' && v.trim().length > 0);
  if (list.length === 0) return null;
  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">
        <Sparkles aria-hidden className="h-3.5 w-3.5 text-[#C9A84C]" /> Her vibes
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {list.map((v) => (
          <span
            key={v}
            className="rounded-full border border-[#C9A84C]/60 bg-[#C9A84C]/10 px-3 py-1.5 text-[13px] font-medium text-neutral-800"
          >
            {v}
          </span>
        ))}
      </div>
    </div>
  );
}
