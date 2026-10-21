import Link from 'next/link'

/**
 * Auth shell: on desktop, a deep burgundy brand panel sits beside the
 * form (wordmark, tagline, quiet trust cues). On mobile the panel
 * collapses to a slim burgundy band so the form is the focus.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-dvh bg-cream">
      <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col md:flex-row">
        {/* Brand panel */}
        <div className="relative hidden w-[46%] shrink-0 overflow-hidden md:block">
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(160deg, #C22A57 0%, #8F1D40 55%, #5E1228 100%)',
            }}
          />
          {/* Gold hairline ornament + soft glows */}
          <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-[#C9A84C]/20 blur-3xl" />
          <div className="absolute -bottom-32 -right-16 h-80 w-80 rounded-full bg-black/25 blur-3xl" />
          <div className="relative flex h-full flex-col justify-between p-10 lg:p-14">
            <Link href="/" className="font-display text-2xl font-semibold tracking-tight text-white">
              Intima<span className="text-[#C9A84C]">.</span>
            </Link>
            <div>
              <p className="font-display text-4xl font-medium leading-[1.15] text-white text-balance lg:text-5xl">
                Where Elegance<br />Meets Connection
              </p>
              <div className="mt-6 h-px w-16 bg-[#C9A84C]/70" />
              <div className="mt-6 space-y-3 text-sm text-white/75">
                <p className="flex items-center gap-2.5">
                  <span className="h-1 w-1 rounded-full bg-[#C9A84C]" />
                  Verified companions, real profiles
                </p>
                <p className="flex items-center gap-2.5">
                  <span className="h-1 w-1 rounded-full bg-[#C9A84C]" />
                  Direct connection, no middlemen
                </p>
                <p className="flex items-center gap-2.5">
                  <span className="h-1 w-1 rounded-full bg-[#C9A84C]" />
                  Private by design
                </p>
              </div>
            </div>
            <p className="text-xs text-white/45">Nigeria&apos;s premium companion community</p>
          </div>
        </div>

        {/* Mobile band */}
        <div
          className="relative overflow-hidden px-6 pb-8 pt-[max(2.5rem,env(safe-area-inset-top))] md:hidden"
          style={{
            background: 'linear-gradient(160deg, #C22A57 0%, #8F1D40 70%, #701A33 100%)',
          }}
        >
          <div className="absolute -right-10 -top-16 h-44 w-44 rounded-full bg-[#C9A84C]/20 blur-3xl" />
          <Link href="/" className="relative font-display text-xl font-semibold tracking-tight text-white">
            Intima<span className="text-[#C9A84C]">.</span>
          </Link>
          <p className="relative mt-1 font-display text-sm italic text-white/75">
            Where Elegance Meets Connection
          </p>
        </div>

        {/* Form column */}
        <div className="flex flex-1 items-center justify-center px-4 py-10 md:px-12">
          <div className="w-full max-w-md animate-rise-in">{children}</div>
        </div>
      </div>
    </div>
  )
}
