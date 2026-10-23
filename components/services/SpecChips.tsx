import { hasSpec, specChips, type SpecValues } from '@/lib/spec';

/**
 * A companion's declared spec, shown as burgundy chips on her
 * profile: the same words the client-side spec filter uses, so
 * what he searched for is what he sees confirmed here.
 */
export function SpecChips({ spec }: { spec: SpecValues | null | undefined }) {
  if (!spec || !hasSpec(spec)) return null;
  const list = specChips(spec);
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">
        Her spec
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {list.map((label) => (
          <span
            key={label}
            className="rounded-full border border-[#AC244D]/50 bg-[#AC244D]/[0.07] px-3 py-1.5 text-[13px] font-medium text-neutral-800"
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
