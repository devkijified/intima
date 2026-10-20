/**
 * Tiny gold pill shown next to the name of a fan club subscriber
 * (live chat, message threads). Purely presentational.
 */
export function FanBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full bg-gold px-1.5 py-px align-middle text-[9px] font-bold uppercase tracking-wide text-charcoal ${className}`}
    >
      Fan
    </span>
  );
}
