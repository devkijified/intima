import { renderMoreArt } from './giftArtMore'

/**
 * Modeled gift icons: original vector artwork of the REAL sex objects
 * behind each gift, drawn from product references (the Rose is modeled
 * on the owner's own rose toy photo, the same artwork lineage as
 * IntimaLoader). Gradient-shaded so they read dimensional at panel
 * size and at stage/takeover size in the FX engine. No emojis.
 *
 * Keyed by gift_catalog id. Unknown ids fall back to a plain disc.
 */
export default function GiftObjectIcon({
  giftId,
  size = 44,
  className,
}: {
  giftId: string
  size?: number
  className?: string
}) {
  const p = `gi-${giftId}`
  const art = (() => {
    switch (giftId) {
      case 'condom':
        return (
          <>
            <defs>
              <linearGradient id={`${p}-foil`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#F0EBE6" />
                <stop offset="55%" stopColor="#CFC8C0" />
                <stop offset="100%" stopColor="#A79E93" />
              </linearGradient>
            </defs>
            <ellipse cx="24" cy="43" rx="13" ry="2.4" fill="#000" opacity="0.16" />
            <g transform="rotate(-8 24 24)">
              <rect x="10" y="10" width="28" height="28" rx="5" fill={`url(#${p}-foil)`} stroke="#8F887E" strokeWidth="1" />
              <rect x="13.5" y="13.5" width="21" height="21" rx="3.5" fill="none" stroke="#FFFFFF" strokeWidth="1" strokeDasharray="2.4 2.4" opacity="0.55" />
              <circle cx="24" cy="24" r="7.6" fill="#AC244D" />
              <circle cx="24" cy="24" r="7.6" fill="none" stroke="#C9A84C" strokeWidth="1.4" />
              <circle cx="24" cy="24" r="3.4" fill="none" stroke="#F3C6D3" strokeWidth="1.4" opacity="0.8" />
            </g>
          </>
        )
      case 'lube':
        return (
          <>
            <defs>
              <linearGradient id={`${p}-bot`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#CFE4F2" />
                <stop offset="50%" stopColor="#8FB6D4" />
                <stop offset="100%" stopColor="#5E87A8" />
              </linearGradient>
            </defs>
            <ellipse cx="24" cy="43" rx="11" ry="2.3" fill="#000" opacity="0.16" />
            <rect x="13" y="6.5" width="14" height="5" rx="2.5" fill="#3D4750" />
            <rect x="21.5" y="11" width="5" height="6" fill="#59636C" />
            <rect x="18.5" y="16.5" width="11" height="3.4" rx="1.2" fill="#3D4750" />
            <path d="M15.5 24 C15.5 21 17.5 19.8 20 19.8 L28 19.8 C30.5 19.8 32.5 21 32.5 24 L32.5 39 C32.5 41.6 30.6 43 28 43 L20 43 C17.4 43 15.5 41.6 15.5 39 Z" fill={`url(#${p}-bot)`} />
            <path d="M24 26.5 C26.3 29.4 27.6 31.4 27.6 33.2 C27.6 35.3 26 36.8 24 36.8 C22 36.8 20.4 35.3 20.4 33.2 C20.4 31.4 21.7 29.4 24 26.5 Z" fill="#FFFFFF" opacity="0.9" />
            <rect x="18.2" y="23" width="2.8" height="14" rx="1.4" fill="#FFFFFF" opacity="0.35" />
          </>
        )
      case 'rose':
      case 'golden-rose': {
        // Geometry ported 1:1 from IntimaLoader's RoseArt (itself drawn
        // from the owner's photo of the real rose toy).
        const gold = giftId === 'golden-rose'
        const body = gold ? ['#EFD07C', '#C49A35', '#96700F'] : ['#CE4A74', '#AC244D', '#7F1D3A']
        const ringFill = gold ? '#D9AE4A' : '#9C1F43'
        const edge = gold ? '#7D5F1A' : '#7F1D3A'
        const line = gold ? '#F6E3A1' : '#E59AB2'
        const hole = gold ? '#3A2A06' : '#2A0813'
        const btn = gold ? '#AC244D' : '#C9A84C'
        return (
          <>
            <defs>
              <linearGradient id={`${p}-body`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={body[0]} />
                <stop offset="55%" stopColor={body[1]} />
                <stop offset="100%" stopColor={body[2]} />
              </linearGradient>
            </defs>
            <ellipse cx="24" cy="43" rx="12" ry="2.4" fill="#000" opacity="0.16" />
            <path d="M24 9c8 0 14.5 6.3 14.5 15.2 0 9.8-6.3 16.8-14.5 16.8S9.5 33.8 9.5 24.2C9.5 15.3 16 9 24 9Z" fill={`url(#${p}-body)`} stroke={edge} strokeWidth="2" strokeLinejoin="round" />
            <path d="M13.8 15.5c0-3.8 4.6-6.8 10.2-6.8s10.2 3 10.2 6.8-4.6 6.8-10.2 6.8-10.2-3-10.2-6.8Z" fill={ringFill} stroke={line} strokeWidth="1.7" />
            <path d="M17.2 15.5c0-2.4 3-4.4 6.8-4.4s6.8 2 6.8 4.4-3 4.4-6.8 4.4-6.8-2-6.8-4.4Z" fill={body[1]} stroke={line} strokeWidth="1.5" />
            <path d="M16.2 11.6c1.5 1.2 2.3 2.8 2.4 4.8" fill="none" stroke={line} strokeWidth="1.4" strokeLinecap="round" />
            <path d="M31.8 11.6c-1.5 1.2-2.3 2.8-2.4 4.8" fill="none" stroke={line} strokeWidth="1.4" strokeLinecap="round" />
            <ellipse cx="24" cy="15.5" rx="3.1" ry="2.3" fill={hole} />
            <circle cx="24" cy="33.5" r="2.3" fill="none" stroke={btn} strokeWidth="1.5" />
            <path d="M24 32.3v2.4" stroke={btn} strokeWidth="1.5" strokeLinecap="round" />
          </>
        )
      }
      case 'lipstick':
        return (
          <>
            <defs>
              <linearGradient id={`${p}-red`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#D84B66" />
                <stop offset="55%" stopColor="#B02340" />
                <stop offset="100%" stopColor="#7E1830" />
              </linearGradient>
              <linearGradient id={`${p}-gold`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#E9CE7E" />
                <stop offset="100%" stopColor="#A87F27" />
              </linearGradient>
            </defs>
            <ellipse cx="24" cy="43.5" rx="10" ry="2.2" fill="#000" opacity="0.16" />
            <path d="M20 20 L20 10.5 L28 5.5 L28 20 Z" fill={`url(#${p}-red)`} />
            <rect x="19.8" y="19" width="8.4" height="4.6" fill="#3A3330" />
            <rect x="17.8" y="23.4" width="12.4" height="3.8" fill={`url(#${p}-gold)`} />
            <path d="M17.8 27.2 L30.2 27.2 L30.2 40.5 C30.2 42.3 28.9 43.4 27.2 43.4 L20.8 43.4 C19.1 43.4 17.8 42.3 17.8 40.5 Z" fill="#26211F" />
            <rect x="20" y="29.5" width="2.4" height="10" rx="1.2" fill="#FFFFFF" opacity="0.14" />
          </>
        )
      case 'ring':
        return (
          <>
            <defs>
              <linearGradient id={`${p}-sil`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#CE4A74" />
                <stop offset="100%" stopColor="#7F1D3A" />
              </linearGradient>
            </defs>
            <ellipse cx="24" cy="43" rx="12" ry="2.3" fill="#000" opacity="0.16" />
            <circle cx="24" cy="27" r="11.5" fill="none" stroke={`url(#${p}-sil)`} strokeWidth="7" />
            <rect x="16.5" y="4.5" width="15" height="11" rx="5.5" fill="#8E1F42" stroke="#6E1730" strokeWidth="0.8" />
            <circle cx="24" cy="10" r="2" fill="#C9A84C" />
            <path d="M9 8 C6.8 10 6.8 13 9 15" fill="none" stroke="#C9A84C" strokeWidth="1.6" strokeLinecap="round" opacity="0.85" />
            <path d="M39 8 C41.2 10 41.2 13 39 15" fill="none" stroke="#C9A84C" strokeWidth="1.6" strokeLinecap="round" opacity="0.85" />
          </>
        )
      case 'wand':
        return (
          <>
            <defs>
              <linearGradient id={`${p}-w`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#F4F0EA" />
                <stop offset="100%" stopColor="#CFC8BE" />
              </linearGradient>
            </defs>
            <ellipse cx="24" cy="43.5" rx="11" ry="2.2" fill="#000" opacity="0.14" />
            <g transform="rotate(22 24 24)">
              <rect x="16.5" y="3.5" width="15" height="16" rx="7.5" fill={`url(#${p}-w)`} stroke="#B4ACA0" strokeWidth="0.9" />
              <rect x="20.5" y="19" width="7" height="4" fill="#A79E93" />
              <path d="M19.8 23 L28.2 23 L27.4 40.5 C27.3 42.4 26 43.6 24 43.6 C22 43.6 20.7 42.4 20.6 40.5 Z" fill={`url(#${p}-w)`} stroke="#B4ACA0" strokeWidth="0.8" />
              <circle cx="24" cy="28.5" r="1.8" fill="#AC244D" />
              <circle cx="24" cy="33.5" r="1.3" fill="#8F887E" />
              <path d="M19.5 7.5 C18.4 10 18.4 13 19.5 15.5" fill="none" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
            </g>
          </>
        )
      case 'rabbit':
        return (
          <>
            <defs>
              <linearGradient id={`${p}-sil`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#CE4A74" />
                <stop offset="55%" stopColor="#AC244D" />
                <stop offset="100%" stopColor="#7F1D3A" />
              </linearGradient>
            </defs>
            <ellipse cx="25" cy="43.5" rx="12" ry="2.3" fill="#000" opacity="0.16" />
            <path d="M15.4 20.5 L13.4 13 M18.6 19.6 L18.2 12.4" stroke="#AC244D" strokeWidth="3.6" strokeLinecap="round" />
            <path d="M28.5 31.5 C21.8 30 17.4 26.2 15.8 20.8" fill="none" stroke={`url(#${p}-sil)`} strokeWidth="5.4" strokeLinecap="round" />
            <path d="M32 4.5 C36.8 4.5 39.3 8 39.3 13.5 L39.3 33 C39.3 38.8 36.4 42 32.4 42 C28.4 42 25.5 38.8 25.5 33 L25.5 13.5 C25.5 8 27.2 4.5 32 4.5 Z" fill={`url(#${p}-sil)`} />
            <path d="M29 9 C28 13 28 17 29 21" fill="none" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" opacity="0.28" />
            <circle cx="32.4" cy="36.5" r="1.9" fill="#C9A84C" />
          </>
        )
      case 'chains':
        return (
          <>
            <defs>
              <linearGradient id={`${p}-vel`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#93355A" />
                <stop offset="100%" stopColor="#57122B" />
              </linearGradient>
            </defs>
            <ellipse cx="24" cy="42" rx="17" ry="2.3" fill="#000" opacity="0.15" />
            <ellipse cx="20.9" cy="23.5" rx="2.1" ry="1.35" fill="none" stroke="#C9A84C" strokeWidth="1.5" transform="rotate(35 20.9 23.5)" />
            <ellipse cx="24" cy="23.5" rx="2.1" ry="1.35" fill="none" stroke="#C9A84C" strokeWidth="1.5" transform="rotate(-35 24 23.5)" />
            <ellipse cx="27.1" cy="23.5" rx="2.1" ry="1.35" fill="none" stroke="#C9A84C" strokeWidth="1.5" transform="rotate(35 27.1 23.5)" />
            <rect x="3" y="13.5" width="17" height="20" rx="7" fill={`url(#${p}-vel)`} stroke="#42102A" strokeWidth="0.9" />
            <rect x="28" y="13.5" width="17" height="20" rx="7" fill={`url(#${p}-vel)`} stroke="#42102A" strokeWidth="0.9" />
            <rect x="9.3" y="13.5" width="4.4" height="20" fill="#57122B" opacity="0.55" />
            <rect x="34.3" y="13.5" width="4.4" height="20" fill="#57122B" opacity="0.55" />
            <rect x="8.6" y="20.8" width="5.8" height="5.4" rx="1.2" fill="none" stroke="#C9A84C" strokeWidth="1.5" />
            <rect x="33.6" y="20.8" width="5.8" height="5.4" rx="1.2" fill="none" stroke="#C9A84C" strokeWidth="1.5" />
            <path d="M6.5 17.5 C9.5 16.2 13.5 16.2 16.5 17.5" fill="none" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" opacity="0.22" />
            <path d="M31.5 17.5 C34.5 16.2 38.5 16.2 41.5 17.5" fill="none" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" opacity="0.22" />
          </>
        )
      case 'egg':
        return (
          <>
            <defs>
              <linearGradient id={`${p}-sil`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#E087A4" />
                <stop offset="55%" stopColor="#C14A72" />
                <stop offset="100%" stopColor="#8E1F42" />
              </linearGradient>
            </defs>
            <ellipse cx="24" cy="43" rx="11" ry="2.3" fill="#000" opacity="0.16" />
            <path d="M24 8 C24 4 27.5 2.6 30 4.4" fill="none" stroke="#8E1F42" strokeWidth="1.9" strokeLinecap="round" />
            <path d="M24 8.5 C30.2 8.5 35 16.5 35 25.5 C35 35 30.2 41.5 24 41.5 C17.8 41.5 13 35 13 25.5 C13 16.5 17.8 8.5 24 8.5 Z" fill={`url(#${p}-sil)`} />
            <ellipse cx="19" cy="20" rx="2.5" ry="4.4" fill="#FFFFFF" opacity="0.3" transform="rotate(-16 19 20)" />
            <circle cx="24" cy="31" r="1.8" fill="#C9A84C" />
          </>
        )
      case 'dildo':
        return (
          <>
            <defs>
              <linearGradient id={`${p}-sil`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#CE5B82" />
                <stop offset="52%" stopColor="#A82A52" />
                <stop offset="100%" stopColor="#741A36" />
              </linearGradient>
            </defs>
            <ellipse cx="24" cy="43.8" rx="11" ry="2.1" fill="#000" opacity="0.16" />
            <path d="M24 3.5 C28.8 3.5 31.4 6.8 31.7 11.5 C32.1 18.5 30.9 25.5 31.7 32.5 C32.1 36.2 30.4 38.8 27.3 39.4 L20.7 39.4 C17.6 38.8 15.9 36.2 16.3 32.5 C17.1 25.5 15.9 18.5 16.3 11.5 C16.6 6.8 19.2 3.5 24 3.5 Z" fill={`url(#${p}-sil)`} />
            <path d="M16.8 13.5 C20 15.4 28 15.4 31.2 13.5" fill="none" stroke="#5E1229" strokeWidth="1.3" opacity="0.45" />
            <path d="M19.5 8 C18.6 14 18.8 24 19.6 31" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" opacity="0.22" />
            <ellipse cx="24" cy="41.3" rx="9" ry="2.7" fill="#57122B" />
            <ellipse cx="24" cy="40.6" rx="9" ry="2.7" fill="#7F1D3A" />
          </>
        )
      case 'chest':
        return (
          <>
            <defs>
              <linearGradient id={`${p}-gold`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#E9CE7E" />
                <stop offset="100%" stopColor="#A87F27" />
              </linearGradient>
              <linearGradient id={`${p}-wood`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8E2A4E" />
                <stop offset="100%" stopColor="#57122B" />
              </linearGradient>
            </defs>
            <ellipse cx="24" cy="42.5" rx="16" ry="2.3" fill="#000" opacity="0.17" />
            <path d="M8.5 22 L11.5 12.5 L36.5 12.5 L39.5 22 Z" fill="#7A1E3C" stroke="#42102A" strokeWidth="0.9" />
            <rect x="11" y="19.2" width="26" height="2.6" fill="#FFD979" opacity="0.85" />
            <path d="M7.5 22 L40.5 22 L40.5 38.5 C40.5 40.6 39 42 36.8 42 L11.2 42 C9 42 7.5 40.6 7.5 38.5 Z" fill={`url(#${p}-wood)`} stroke="#42102A" strokeWidth="0.9" />
            <rect x="12.5" y="22" width="2.6" height="20" fill={`url(#${p}-gold)`} opacity="0.6" />
            <rect x="32.9" y="22" width="2.6" height="20" fill={`url(#${p}-gold)`} opacity="0.6" />
            <rect x="21.3" y="19" width="5.4" height="7.6" rx="1.6" fill={`url(#${p}-gold)`} stroke="#7D5F1A" strokeWidth="0.8" />
            <circle cx="24" cy="22.8" r="1.2" fill="#57122B" />
          </>
        )
      default: {
        const more = renderMoreArt(giftId, p)
        if (more) return more
        return (
          <>
            <circle cx="24" cy="24" r="15" fill="#AC244D" opacity="0.9" />
            <circle cx="24" cy="24" r="15" fill="none" stroke="#C9A84C" strokeWidth="1.6" />
          </>
        )
      }
    }
  })()
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={className}
      role="img"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      {art}
    </svg>
  )
}
