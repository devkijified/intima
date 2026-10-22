import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Get the Android App | Intima',
  description:
    'Download the Intima Android app: the full Intima experience with screenshot and screen recording protection built in.',
}

/**
 * Public download page for the native Android shell. The shell is a
 * thin WebView over the live site with FLAG_SECURE set, so screenshots
 * and screen recordings inside the app come out black. That protection
 * is the whole point of the page, so it leads the copy.
 */
export default function DownloadPage() {
  return (
    <main className="min-h-dvh bg-cream px-5 pb-16 pt-12 text-charcoal">
      <div className="mx-auto w-full max-w-md">
        <Link href="/" className="font-display text-2xl font-bold tracking-tight text-primary">
          Intima
        </Link>

        <div className="mt-10 flex flex-col items-center text-center">
          <Image
            src="/icons/icon-512.png"
            alt="Intima app icon"
            width={96}
            height={96}
            className="rounded-[24px] shadow-[0_16px_40px_rgba(172,36,77,0.35)]"
          />
          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Welcome to Sincity (no one has to know)
          </p>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight">
            Intima for Android
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-neutral-600">
            The full Intima, in its own app, with one thing the browser
            can never give you: inside the app, screenshots and screen
            recordings of profiles, photos and chats come out black.
            What happens in Sincity stays in Sincity.
          </p>
        </div>

        <a
          href="/intima-1.0.apk"
          download
          className="btn-luxe mt-8 flex w-full items-center justify-center rounded-full px-6 py-4 text-base font-semibold"
        >
          Download the app
        </a>
        <p className="mt-3 text-center text-xs text-neutral-500">
          Version 1.0 · 133 KB · Android 8.0 and above
        </p>

        <section className="mt-10 rounded-3xl bg-white p-6 shadow-[0_10px_36px_rgba(26,26,26,0.07)] ring-1 ring-black/5">
          <h2 className="font-display text-lg font-semibold tracking-tight">
            Installing takes under a minute
          </h2>
          <ol className="mt-4 space-y-4 text-[15px] leading-relaxed text-neutral-600">
            <li className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">1</span>
              <span>Tap the download button above and let the file finish.</span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">2</span>
              <span>
                Open the file. If Android asks, allow installs from your
                browser just this once, then tap Install.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">3</span>
              <span>Open Intima from your apps and sign in. Same account, same everything.</span>
            </li>
          </ol>
        </section>

        <section className="mt-6 rounded-3xl bg-white p-6 shadow-[0_10px_36px_rgba(26,26,26,0.07)] ring-1 ring-black/5">
          <h2 className="font-display text-lg font-semibold tracking-tight">
            On iPhone?
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-neutral-600">
            Open Intima in Safari, tap the Share button, then Add to
            Home Screen. Intima installs as an app on your home screen,
            no App Store needed. Screenshot blocking is an Android app
            power for now; iPhone still covers your screen when you
            switch apps.
          </p>
        </section>

        <p className="mt-10 text-center text-xs text-neutral-400">
          <Link href="/terms" className="underline">Terms</Link>
          {' · '}
          <Link href="/privacy" className="underline">Privacy</Link>
          {' · '}
          <Link href="/" className="underline">Back to the map</Link>
        </p>
      </div>
    </main>
  )
}
