import type { ReactNode } from 'react'

/**
 * Expansion gift models: original gradient-shaded vector artwork for
 * the wider toy-type catalog, drawn from the real-product reference
 * pack in ~/workspace/research_notes/intima-gift-models-50/ (exemplar
 * silhouettes only, no brand artwork). Keyed by gift id; rendered by
 * GiftObjectIcon when the id is not one of the core twelve.
 *
 * `p` is the gradient-id prefix supplied by GiftObjectIcon.
 */
export function renderMoreArt(id: string, p: string): ReactNode | null {
  const shadow = <ellipse cx="24" cy="43" rx="12" ry="2.3" fill="#000" opacity="0.16" />
  switch (id) {
    case 'bullet':
      return (
        <>
          <defs>
            <linearGradient id={`${p}-b`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#5B7FB8" /><stop offset="100%" stopColor="#2C4470" />
            </linearGradient>
          </defs>
          {shadow}
          <path d="M19 40.5 L19 15 C19 9.5 21.5 6 26 4.5 L29 3.8 L29 40.5 C29 42 27.8 43 26 43 L22 43 C20.2 43 19 42 19 40.5 Z" fill={`url(#${p}-b)`} />
          <path d="M21.5 12 C21.2 18 21.2 26 21.5 33" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" opacity="0.25" fill="none" />
          <circle cx="24" cy="37.5" r="1.5" fill="#D9E4F5" />
          <circle cx="24" cy="33.8" r="1.1" fill="#D9E4F5" opacity="0.7" />
        </>
      )
    case 'air-pulse':
      return (
        <>
          <defs>
            <linearGradient id={`${p}-b`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FFFFFF" /><stop offset="100%" stopColor="#E3D9E8" />
            </linearGradient>
          </defs>
          {shadow}
          <path d="M24 14 C31 14 36 20.5 36 29 C36 37.5 31 43 24.5 43 C17.5 43 12.5 37 12.5 28.5 C12.5 21 17 14 24 14 Z" fill={`url(#${p}-b)`} stroke="#C9B8D4" strokeWidth="1" />
          <ellipse cx="24" cy="13.5" rx="8" ry="5.4" fill="#F3E3EC" stroke="#C08A3E" strokeWidth="1.8" />
          <ellipse cx="24" cy="13.5" rx="4.4" ry="2.8" fill="#5E2440" />
          <circle cx="24" cy="27" r="1.7" fill="#B08BB5" />
          <circle cx="24" cy="32" r="1.7" fill="#B08BB5" />
        </>
      )
    case 'suction':
      return (
        <>
          <defs>
            <linearGradient id={`${p}-b`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7A4A5E" /><stop offset="100%" stopColor="#40222F" />
            </linearGradient>
          </defs>
          {shadow}
          <path d="M24 6 C31.5 6 36.5 14 36.5 24 C36.5 34.5 31 42.5 24 42.5 C17 42.5 11.5 34.5 11.5 24 C11.5 14 16.5 6 24 6 Z" fill={`url(#${p}-b)`} />
          <ellipse cx="24" cy="13" rx="5.4" ry="4" fill="#2C1620" />
          <ellipse cx="24" cy="13" rx="3" ry="2.2" fill="#120A0E" stroke="#8A5A6E" strokeWidth="1" />
          <circle cx="32.5" cy="24" r="1.2" fill="#C9A0B2" />
          <circle cx="32.5" cy="29" r="1.2" fill="#C9A0B2" opacity="0.7" />
          <ellipse cx="18" cy="22" rx="2.2" ry="4.5" fill="#FFFFFF" opacity="0.16" transform="rotate(-14 18 22)" />
        </>
      )
    case 'butterfly':
      return (
        <>
          <defs>
            <linearGradient id={`${p}-b`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#B678E8" /><stop offset="100%" stopColor="#6D34B0" />
            </linearGradient>
          </defs>
          {shadow}
          <path d="M7 14 C3 20 5 27 10 29 L19 31 L19 17 L10 12 C8.6 12.3 7.6 13 7 14 Z" fill={`url(#${p}-b)`} opacity="0.92" />
          <path d="M41 14 C45 20 43 27 38 29 L29 31 L29 17 L38 12 C39.4 12.3 40.4 13 41 14 Z" fill={`url(#${p}-b)`} opacity="0.92" />
          <ellipse cx="24" cy="24" rx="6" ry="10.5" fill={`url(#${p}-b)`} stroke="#552A86" strokeWidth="1" />
          <path d="M21 12.5 C20 10 18.4 8.4 16.4 7.6 M27 12.5 C28 10 29.6 8.4 31.6 7.6" stroke="#552A86" strokeWidth="1.7" fill="none" strokeLinecap="round" />
          <circle cx="24" cy="21" r="1.7" fill="#E9D8FB" />
          <path d="M4 27 L7.5 28.5 M44 27 L40.5 28.5" stroke="#8A8F98" strokeWidth="1.6" strokeLinecap="round" />
        </>
      )
    case 'finger-vibe':
      return (
        <>
          <defs>
            <linearGradient id={`${p}-b`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#A8D8CE" /><stop offset="100%" stopColor="#5FA396" />
            </linearGradient>
          </defs>
          {shadow}
          <path d="M15 33 C13 29 14.5 25.5 17.5 25 L30.5 25 C33.5 25.5 35 29 33 33" fill="none" stroke="#4E8A7E" strokeWidth="2.6" />
          <path d="M13 30 C11.5 20 16.5 11 24 11 C31.5 11 36.5 20 35 30 C34.4 34.5 31 37 27 36.4 C22 35.6 14 35.5 13 30 Z" fill={`url(#${p}-b)`} />
          <ellipse cx="19.5" cy="19" rx="3" ry="5" fill="#FFFFFF" opacity="0.3" transform="rotate(-16 19.5 19)" />
          <circle cx="24" cy="29" r="1.6" fill="#2F5D54" />
        </>
      )
    case 'egg-remote':
      return (
        <>
          <defs>
            <linearGradient id={`${p}-b`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#D96C8C" /><stop offset="100%" stopColor="#8E1F42" />
            </linearGradient>
          </defs>
          {shadow}
          <path d="M18 8 C23.5 8 28 15.5 28 24.5 C28 34 23.5 41 18 41 C12.5 41 8 34 8 24.5 C8 15.5 12.5 8 18 8 Z" fill={`url(#${p}-b)`} />
          <path d="M8.6 24.5 L27.4 24.5" stroke="#C9A84C" strokeWidth="1.6" />
          <ellipse cx="14.5" cy="17" rx="2" ry="3.6" fill="#FFFFFF" opacity="0.3" transform="rotate(-14 14.5 17)" />
          <path d="M35.5 19 C39.5 19 42 23.5 42 29 C42 34.5 39.5 38.5 35.5 38.5 C31.5 38.5 29.5 34.5 29.5 29 C29.5 23.5 31.5 19 35.5 19 Z" fill="#3A3330" />
          <circle cx="35.5" cy="28.5" r="2.2" fill="#C9A84C" />
        </>
      )
    case 'panty-vibe':
      return (
        <>
          <defs>
            <linearGradient id={`${p}-b`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7FC7C9" /><stop offset="100%" stopColor="#3E8A8F" />
            </linearGradient>
          </defs>
          {shadow}
          <path d="M14 8 C22 5.5 30 9 32.5 17 C34.6 24 33 33 28.5 39.5 C26.8 42 23.8 42.6 21.6 40.8 C16.5 36.6 13.4 28 13.2 19 C13.1 14.5 13.3 10.5 14 8 Z" fill={`url(#${p}-b)`} />
          <ellipse cx="19" cy="16" rx="2.4" ry="4.6" fill="#FFFFFF" opacity="0.3" transform="rotate(-18 19 16)" />
          <circle cx="37.5" cy="34" r="4.6" fill="#59636C" stroke="#3D4750" strokeWidth="1" />
          <circle cx="37.5" cy="34" r="2" fill="#2E353B" />
        </>
      )
    case 'tongue':
      return (
        <>
          <defs>
            <linearGradient id={`${p}-b`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7A2E4D" /><stop offset="100%" stopColor="#45182B" />
            </linearGradient>
            <linearGradient id={`${p}-t`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#F0A0B5" /><stop offset="100%" stopColor="#C24B72" />
            </linearGradient>
          </defs>
          {shadow}
          <path d="M10 34 C10 25 16 20 24 20 C32 20 38 25 38 34 C38 39 34.5 42 24 42 C13.5 42 10 39 10 34 Z" fill={`url(#${p}-b)`} />
          <path d="M24 24 C20.5 19 19.8 12.5 21.6 7.6 C22.3 5.7 25.7 5.7 26.4 7.6 C28.2 12.5 27.5 19 24 24 Z" fill={`url(#${p}-t)`} />
          <path d="M24 9 L24 20" stroke="#A03A5C" strokeWidth="1.5" strokeLinecap="round" />
          <ellipse cx="17" cy="29" rx="2.4" ry="3.6" fill="#FFFFFF" opacity="0.22" transform="rotate(-20 17 29)" />
          <circle cx="31" cy="36.5" r="1.5" fill="#C9A84C" />
        </>
      )
    case 'gspot':
      return (
        <>
          <defs>
            <linearGradient id={`${p}-b`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#9A5B7E" /><stop offset="100%" stopColor="#54263F" />
            </linearGradient>
          </defs>
          {shadow}
          <path d="M30.5 4.5 C36 6 38 11 36.8 17 C35.8 22.4 32.8 26 30.6 30.5 C28.8 34.2 28.6 38 29.4 41.5 C29.7 42.9 28.6 43.8 26.9 43.8 L22.4 43.8 C20.9 43.8 20 42.9 20.2 41.4 C21.2 33.5 23.4 27.5 25.4 20.5 C26.8 15.6 26.4 9.8 27.6 6.4 C28.2 4.8 29.2 4.1 30.5 4.5 Z" fill={`url(#${p}-b)`} />
          <ellipse cx="31" cy="10.5" rx="3.4" ry="5" fill="#B57E9E" opacity="0.8" transform="rotate(18 31 10.5)" />
          <circle cx="24.8" cy="39.5" r="1.5" fill="#E5C7D7" />
        </>
      )
    case 'glass-dildo':
      return (
        <>
          {shadow}
          <path d="M24 3.5 C28.6 3.5 31 6.6 31.3 11.3 C31.8 18.5 30.6 25.5 31.3 32.5 C31.7 36 30 38.6 27.2 39.2 L20.8 39.2 C18 38.6 16.3 36 16.7 32.5 C17.4 25.5 16.2 18.5 16.7 11.3 C17 6.6 19.4 3.5 24 3.5 Z" fill="#DFF3F7" opacity="0.6" stroke="#9CC8D4" strokeWidth="1.2" />
          <path d="M17.5 14 C20.5 16.5 27.5 16.5 30.5 14 M17.3 21 C20.4 23.5 27.6 23.5 30.7 21 M17.5 28 C20.5 30.5 27.5 30.5 30.5 28" stroke="#7FB6C6" strokeWidth="1.5" fill="none" opacity="0.85" />
          <path d="M20 8 C19.2 15 19.4 24 20.2 31" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" opacity="0.8" fill="none" />
          <ellipse cx="24" cy="41.3" rx="9.4" ry="2.8" fill="#CDEAF1" opacity="0.75" stroke="#9CC8D4" strokeWidth="1" />
        </>
      )
    case 'metal-dildo':
      return (
        <>
          <defs>
            <linearGradient id={`${p}-b`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#F4F5F7" /><stop offset="45%" stopColor="#AEB4BC" /><stop offset="70%" stopColor="#E8EAED" /><stop offset="100%" stopColor="#878E97" />
            </linearGradient>
          </defs>
          {shadow}
          <path d="M19.5 12 C19.5 7 21.2 4.5 24 4.5 C26.8 4.5 28.5 7 28.5 12 L28.5 33 L19.5 33 Z" fill={`url(#${p}-b)`} stroke="#788089" strokeWidth="0.8" />
          <circle cx="24" cy="38.5" r="5.6" fill={`url(#${p}-b)`} stroke="#788089" strokeWidth="0.8" />
          <path d="M21.8 9 C21.4 16 21.4 24 21.8 31" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" opacity="0.6" fill="none" />
        </>
      )
    case 'suction-cup-dildo':
      return (
        <>
          <defs>
            <linearGradient id={`${p}-b`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#EFC3AC" /><stop offset="100%" stopColor="#C68D68" />
            </linearGradient>
          </defs>
          {shadow}
          <path d="M24 3.5 C28.6 3.5 31 6.6 31.2 11 C31.6 18 30.6 24 31 30.5 L17 30.5 C17.4 24 16.4 18 16.8 11 C17 6.6 19.4 3.5 24 3.5 Z" fill={`url(#${p}-b)`} />
          <path d="M16.9 13.5 C20 15.2 28 15.2 31.1 13.5" stroke="#A9765133" strokeWidth="4" fill="none" />
          <circle cx="20" cy="34" r="4.2" fill={`url(#${p}-b)`} />
          <circle cx="28" cy="34" r="4.2" fill={`url(#${p}-b)`} />
          <ellipse cx="24" cy="41.6" rx="10.5" ry="2.9" fill="#B57E55" />
          <ellipse cx="24" cy="40.8" rx="10.5" ry="2.9" fill={`url(#${p}-b)`} />
        </>
      )
    case 'strap-on':
      return (
        <>
          <defs>
            <linearGradient id={`${p}-b`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#B678E8" /><stop offset="100%" stopColor="#6D34B0" />
            </linearGradient>
          </defs>
          {shadow}
          <path d="M11 20 L37 20 L35.5 35 C35.2 38 33.4 40 30 40.5 L26 40.5 L24 33 L22 40.5 L18 40.5 C14.6 40 12.8 38 12.5 35 Z" fill="#2A2A30" />
          <path d="M11 20 L37 20" stroke="#3D3D45" strokeWidth="3" />
          <path d="M20.5 26 L20.5 10.5 C20.5 6.8 21.9 4.5 24 4.5 C26.1 4.5 27.5 6.8 27.5 10.5 L27.5 26 Z" fill={`url(#${p}-b)`} />
          <circle cx="24" cy="27" r="6" fill="none" stroke="#C9CCD2" strokeWidth="2.6" />
          <path d="M22.3 9 C22.1 14 22.1 19 22.3 23" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" opacity="0.3" fill="none" />
        </>
      )
    case 'double-dildo':
      return (
        <>
          <defs>
            <linearGradient id={`${p}-b`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#9B6BD6" /><stop offset="100%" stopColor="#5E3A9E" />
            </linearGradient>
          </defs>
          {shadow}
          <path d="M33 4.5 C37 4.5 39 7.2 39 11.5 L39 25 C39 30 36.8 33.4 32.6 35.2 C27.5 37.4 21 37 15.8 34.6 L17.8 27.6 C21.8 29.6 26.8 29.8 29.8 28.2 C31 27.6 31.6 26.4 31.6 24.8 L31.6 11.5 C31.6 7.2 29 4.5 33 4.5 Z" fill={`url(#${p}-b)`} transform="rotate(38 26 24)" />
          <circle cx="13.5" cy="30.5" r="5" fill={`url(#${p}-b)`} transform="rotate(38 26 24)" />
          <path d="M30 10 C29.4 15 29.4 20 30 24" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" opacity="0.22" fill="none" transform="rotate(38 26 24)" />
        </>
      )
    case 'thrusting-dildo':
      return (
        <>
          <defs>
            <linearGradient id={`${p}-b`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#4A4A52" /><stop offset="100%" stopColor="#1E1E24" />
            </linearGradient>
          </defs>
          {shadow}
          <path d="M24 3 C28.4 3 30.8 6 31 10.4 C31.3 15.5 30.7 19 31 22 L17 22 C17.3 19 16.7 15.5 17 10.4 C17.2 6 19.6 3 24 3 Z" fill="#33333B" />
          <path d="M17.1 12.4 C20 14 28 14 30.9 12.4" stroke="#101014" strokeWidth="2.6" fill="none" opacity="0.5" />
          <path d="M16 22 L32 22 L32.8 38 C32.9 40 31.6 41.2 29.6 41.2 L18.4 41.2 C16.4 41.2 15.1 40 15.2 38 Z" fill={`url(#${p}-b)`} />
          <circle cx="24" cy="29" r="1.8" fill="#C9A84C" />
          <path d="M20 34.5 L28 34.5" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" opacity="0.25" />
          <ellipse cx="24" cy="42.6" rx="8.6" ry="2" fill="#101014" />
        </>
      )
    case 'inflatable-dildo':
      return (
        <>
          <defs>
            <linearGradient id={`${p}-b`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#5A5A64" /><stop offset="100%" stopColor="#17171C" />
            </linearGradient>
          </defs>
          {shadow}
          <path d="M19 4.5 C23.8 4.5 26.8 8.4 27.4 14 C28.2 21 27.4 27 27.8 32 L12.2 32 C12.6 27 11.8 21 12.6 14 C13.2 8.4 14.2 4.5 19 4.5 Z" fill={`url(#${p}-b)`} transform="translate(2 0)" />
          <path d="M15.5 10 C14.8 16 15 22 15.6 27" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" opacity="0.28" fill="none" />
          <path d="M22 32 C22 37 26 38.6 29.5 37.6" stroke="#3A3A42" strokeWidth="1.8" fill="none" />
          <ellipse cx="35" cy="36" rx="6.4" ry="4.6" fill={`url(#${p}-b)`} transform="rotate(-18 35 36)" />
          <circle cx="40.6" cy="31.8" r="1.5" fill="#C9A84C" />
        </>
      )
    case 'anal-beads':
      return (
        <>
          <defs>
            <linearGradient id={`${p}-b`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4A4A52" /><stop offset="100%" stopColor="#1E1E24" />
            </linearGradient>
          </defs>
          {shadow}
          <circle cx="24" cy="7.5" r="3.4" fill={`url(#${p}-b)`} />
          <circle cx="24" cy="14.5" r="4.1" fill={`url(#${p}-b)`} />
          <circle cx="24" cy="22.4" r="4.8" fill={`url(#${p}-b)`} />
          <circle cx="24" cy="31.2" r="5.5" fill={`url(#${p}-b)`} />
          <circle cx="24" cy="40.8" r="3.1" fill="none" stroke="#33333B" strokeWidth="2.2" />
          <path d="M21.5 5.5 C20.8 4 20.8 2.8 21.5 1.8 M26.5 5.5 C27.2 4 27.2 2.8 26.5 1.8" stroke="#FFFFFF" strokeWidth="0" fill="none" />
          <ellipse cx="22.4" cy="29.6" rx="1.4" ry="2" fill="#FFFFFF" opacity="0.22" />
        </>
      )
    case 'butt-plug':
      return (
        <>
          <defs>
            <linearGradient id={`${p}-b`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#4A4A52" /><stop offset="100%" stopColor="#17171C" />
            </linearGradient>
            <radialGradient id={`${p}-gem`} cx="0.38" cy="0.32" r="0.9">
              <stop offset="0%" stopColor="#FF8FA3" /><stop offset="60%" stopColor="#D21F3C" /><stop offset="100%" stopColor="#7E0E22" />
            </radialGradient>
          </defs>
          {shadow}
          <path d="M24 4.5 C29.5 4.5 33 10.5 33 18 C33 24.5 29.8 29.4 26.4 31 L21.6 31 C18.2 29.4 15 24.5 15 18 C15 10.5 18.5 4.5 24 4.5 Z" fill={`url(#${p}-b)`} />
          <rect x="21.4" y="30.6" width="5.2" height="3.6" fill="#232329" />
          <ellipse cx="24" cy="37.6" rx="10.5" ry="3.9" fill="#232329" />
          <path d="M24 33.4 L28 37.6 L24 41.8 L20 37.6 Z" fill={`url(#${p}-gem)`} stroke="#F3C6D3" strokeWidth="0.7" />
          <ellipse cx="19.5" cy="13" rx="2" ry="4" fill="#FFFFFF" opacity="0.2" transform="rotate(-14 19.5 13)" />
        </>
      )
    case 'vibe-plug':
      return (
        <>
          <defs>
            <linearGradient id={`${p}-b`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#454550" /><stop offset="100%" stopColor="#191920" />
            </linearGradient>
          </defs>
          {shadow}
          <path d="M20 5 C24.8 5 28 10 28.4 16.5 C28.7 22 27 27.4 24.8 30.6 L20.6 30.6 C18 26.8 16.4 21.5 16.8 16 C17.2 9.8 15.2 5 20 5 Z" fill={`url(#${p}-b)`} transform="translate(-1.5 0)" />
          <path d="M12.5 34.4 L29.5 34.4 L29.5 31 L12.5 31 Z" fill="#232329" transform="translate(-1.5 2.5)" />
          <path d="M33 24 C36.8 24 39.2 28.2 39.2 33 C39.2 37.8 36.8 41.4 33 41.4 C29.2 41.4 27.2 37.8 27.2 33 C27.2 28.2 29.2 24 33 24 Z" fill="#3A3330" transform="translate(3.5 -1)" />
          <circle cx="36.5" cy="31.5" r="1.9" fill="#C9A84C" />
        </>
      )
    case 'prostate':
      return (
        <>
          <defs>
            <linearGradient id={`${p}-b`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7A4A63" /><stop offset="100%" stopColor="#3A2030" />
            </linearGradient>
          </defs>
          {shadow}
          <path d="M31 5.5 C35 9.5 36 16 34.3 22.8 C33.2 27.2 31 30.8 27.6 33.2 C23.8 35.9 19.2 35.7 15.8 32.9 C14.6 31.9 15 29.9 16.6 29.6 C20.4 28.9 23.4 30 25.4 28.2 C27.6 26.2 28.6 22.8 28.4 18.6 C28.2 14.2 28.4 9.8 29.4 6.6 C29.7 5.5 30.4 5 31 5.5 Z" fill={`url(#${p}-b)`} />
          <path d="M32 24.8 C34.8 26.9 36 29.8 35.6 32.9 C35.4 34.3 33.9 34.9 32.9 34 C31.4 32.7 30.6 30.9 30.7 28.9 C30.8 27.3 31.2 25.9 32 24.8 Z" fill={`url(#${p}-b)`} />
          <path d="M29.8 11.5 C30.6 15.5 30.7 19.5 29.9 23.5" fill="none" stroke="#FFFFFF" strokeWidth="1.7" strokeLinecap="round" opacity="0.3" />
          <ellipse cx="30.8" cy="7.2" rx="2.8" ry="3.6" fill="#9A6B85" transform="rotate(24 30.8 7.2)" />
        </>
      )
    case 'inflatable-plug':
      return (
        <>
          <defs>
            <linearGradient id={`${p}-b`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#4A4A52" /><stop offset="100%" stopColor="#17171C" />
            </linearGradient>
          </defs>
          {shadow}
          <path d="M19 5.5 C24 5.5 27.4 10.8 27.4 17.5 C27.4 23.4 24.6 27.8 21.6 29.2 L16.4 29.2 C13.4 27.8 10.6 23.4 10.6 17.5 C10.6 10.8 14 5.5 19 5.5 Z" fill={`url(#${p}-b)`} />
          <rect x="16.8" y="28.8" width="4.4" height="3.2" fill="#232329" />
          <ellipse cx="19" cy="34.6" rx="8.6" ry="3" fill="#232329" />
          <path d="M24 34.5 C27 37 30.5 37.8 33.5 36.8" stroke="#3A3A42" strokeWidth="1.7" fill="none" />
          <ellipse cx="38.6" cy="35.4" rx="5.6" ry="4" fill={`url(#${p}-b)`} transform="rotate(-16 38.6 35.4)" />
          <ellipse cx="15.5" cy="12.5" rx="1.7" ry="3.4" fill="#FFFFFF" opacity="0.2" transform="rotate(-12 15.5 12.5)" />
        </>
      )
    case 'glass-plug':
      return (
        <>
          {shadow}
          <path d="M24 4.5 C29.5 4.5 33 10.5 33 18 C33 24.5 29.8 29.4 26.4 31 L21.6 31 C18.2 29.4 15 24.5 15 18 C15 10.5 18.5 4.5 24 4.5 Z" fill="#DFF3F7" opacity="0.6" stroke="#9CC8D4" strokeWidth="1.2" />
          <path d="M20 12 C24 9.5 28.5 12 27.5 16.5 C26.6 20.5 22 21.5 20.5 18" fill="none" stroke="#E86A92" strokeWidth="2" opacity="0.75" strokeLinecap="round" />
          <rect x="21.4" y="30.6" width="5.2" height="3.6" fill="#CDEAF1" opacity="0.8" />
          <ellipse cx="24" cy="37.6" rx="10.5" ry="3.9" fill="#CDEAF1" opacity="0.75" stroke="#9CC8D4" strokeWidth="1" />
          <ellipse cx="19.5" cy="12" rx="1.8" ry="3.6" fill="#FFFFFF" opacity="0.7" transform="rotate(-14 19.5 12)" />
        </>
      )
    case 'weighted-plug':
      return (
        <>
          <defs>
            <linearGradient id={`${p}-b`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#454550" /><stop offset="100%" stopColor="#191920" />
            </linearGradient>
          </defs>
          {shadow}
          <path d="M24 3.5 C28.3 3.5 30.8 8.5 30.8 15.5 C30.8 23 28.3 29.5 25.9 32.4 L22.1 32.4 C19.7 29.5 17.2 23 17.2 15.5 C17.2 8.5 19.7 3.5 24 3.5 Z" fill={`url(#${p}-b)`} />
          <rect x="22.3" y="32" width="3.4" height="3.4" fill="#232329" />
          <path d="M15.5 38.8 L32.5 38.8 L32.5 35.4 L15.5 35.4 Z" fill="#232329" />
          <ellipse cx="21" cy="11" rx="1.6" ry="3.6" fill="#FFFFFF" opacity="0.2" transform="rotate(-10 21 11)" />
        </>
      )
    case 'ring-plug':
      return (
        <>
          <defs>
            <linearGradient id={`${p}-b`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#F4F5F7" /><stop offset="50%" stopColor="#AEB4BC" /><stop offset="100%" stopColor="#878E97" />
            </linearGradient>
          </defs>
          {shadow}
          <path d="M24 6 C28.6 6 31.6 10.6 31.6 16.8 C31.6 22.4 28.9 26.6 26.2 28.4 L21.8 28.4 C19.1 26.6 16.4 22.4 16.4 16.8 C16.4 10.6 19.4 6 24 6 Z" fill={`url(#${p}-b)`} stroke="#788089" strokeWidth="0.8" />
          <rect x="22.2" y="28" width="3.6" height="3" fill="#9AA0A8" />
          <circle cx="24" cy="37" r="6" fill="none" stroke={`url(#${p}-b)`} strokeWidth="3.4" />
          <ellipse cx="20.5" cy="12.5" rx="1.7" ry="3.4" fill="#FFFFFF" opacity="0.55" transform="rotate(-12 20.5 12.5)" />
        </>
      )
    case 'remote-plug':
      return (
        <>
          <defs>
            <linearGradient id={`${p}-b`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#E8813A" /><stop offset="100%" stopColor="#B34E10" />
            </linearGradient>
          </defs>
          {shadow}
          <path d="M19.5 4.5 C24 4.5 27 9.3 27.2 15.5 C27.3 19.5 26.2 23 24.6 25.6 L18.4 25.6 C16.4 22.6 15.4 19 15.6 15 C15.9 9 15 4.5 19.5 4.5 Z" fill={`url(#${p}-b)`} transform="translate(-1 0)" />
          <path d="M14.8 26.4 C17.5 27.8 22.5 27.8 25.2 26.4 M14.6 29.6 C17.4 31 22.6 31 25.4 29.6" stroke="#8A3A08" strokeWidth="1.8" fill="none" />
          <path d="M11.5 35.4 L28.5 35.4 L28.5 32.2 L11.5 32.2 Z" fill="#8A3A08" />
          <path d="M36 22.5 C39.6 22.5 41.8 26.6 41.8 31.2 C41.8 35.8 39.6 39.3 36 39.3 C32.4 39.3 30.6 35.8 30.6 31.2 C30.6 26.6 32.4 22.5 36 22.5 Z" fill="#3A3330" />
          <circle cx="36" cy="30.8" r="1.9" fill="#C9A84C" />
        </>
      )
    case 'anal-hook':
      return (
        <>
          <defs>
            <linearGradient id={`${p}-b`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#F4F5F7" /><stop offset="100%" stopColor="#878E97" />
            </linearGradient>
          </defs>
          {shadow}
          <path d="M30 12 L30 27 C30 35 25.5 39.5 19 39.5 C13.5 39.5 9.8 36.4 8.6 31.6" fill="none" stroke={`url(#${p}-b)`} strokeWidth="3.6" strokeLinecap="round" />
          <circle cx="30" cy="8.6" r="3.6" fill="none" stroke={`url(#${p}-b)`} strokeWidth="2.6" />
          <circle cx="9.4" cy="28.4" r="4.6" fill={`url(#${p}-b)`} stroke="#788089" strokeWidth="0.8" />
          <ellipse cx="7.8" cy="26.8" rx="1.3" ry="1.8" fill="#FFFFFF" opacity="0.6" />
        </>
      )
    case 'sleeve':
      return (
        <>
          <defs>
            <linearGradient id={`${p}-b`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#EFC3AC" /><stop offset="100%" stopColor="#D29B77" />
            </linearGradient>
          </defs>
          {shadow}
          <ellipse cx="24" cy="24" rx="12.5" ry="13.5" fill={`url(#${p}-b)`} opacity="0.9" />
          <ellipse cx="24" cy="24" rx="6" ry="7" fill="#B57E55" />
          <ellipse cx="24" cy="24" rx="4" ry="5" fill="#8A5A3A" />
          <path d="M6 17 C3.5 21 3.5 27 6 31 L11 31 C9.4 26.5 9.4 21.5 11 17 Z" fill="#2A2A30" />
          <path d="M42 17 C44.5 21 44.5 27 42 31 L37 31 C38.6 26.5 38.6 21.5 37 17 Z" fill="#2A2A30" />
          <ellipse cx="19" cy="15.5" rx="2.4" ry="4" fill="#FFFFFF" opacity="0.3" transform="rotate(-18 19 15.5)" />
        </>
      )
    case 'stroker-case':
      return (
        <>
          <defs>
            <linearGradient id={`${p}-b`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#4A4A52" /><stop offset="100%" stopColor="#1E1E24" />
            </linearGradient>
          </defs>
          {shadow}
          <path d="M15 12 C15 8.6 17.2 6.5 20.5 6.5 L27.5 6.5 C30.8 6.5 33 8.6 33 12 L33 37.5 C33 40.4 31.2 42 28.4 42 L19.6 42 C16.8 42 15 40.4 15 37.5 Z" fill={`url(#${p}-b)`} />
          <path d="M24 7 L24 41.5" stroke="#101014" strokeWidth="1.8" />
          <path d="M17.8 12 L17.8 36 M30.2 12 L30.2 36" stroke="#FFFFFF" strokeWidth="1.4" opacity="0.16" />
          <rect x="19" y="3.2" width="10" height="3.6" rx="1.6" fill="#33333B" />
        </>
      )
    case 'stroker-machine':
      return (
        <>
          <defs>
            <linearGradient id={`${p}-b`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#454550" /><stop offset="100%" stopColor="#191920" />
            </linearGradient>
          </defs>
          {shadow}
          <path d="M10 33 C10 26 15 21.5 24 21.5 C33 21.5 38 26 38 33 C38 38.5 34 42 27 42 L21 42 C14 42 10 38.5 10 33 Z" fill={`url(#${p}-b)`} />
          <path d="M19.5 21.5 L19.5 10.5 C19.5 7.6 21.2 6 24 6 C26.8 6 28.5 7.6 28.5 10.5 L28.5 21.5 Z" fill="#33333B" />
          <ellipse cx="24" cy="7.6" rx="3.4" ry="1.7" fill="#101014" />
          <circle cx="17" cy="31" r="1.5" fill="#C9A84C" />
          <circle cx="17" cy="35.5" r="1.5" fill="#59636C" />
          <path d="M30 28.5 L34.5 28.5" stroke="#69D2E7" strokeWidth="1.7" strokeLinecap="round" />
        </>
      )
    case 'fleshlight':
      return (
        <>
          <defs>
            <linearGradient id={`${p}-b`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#3E3E46" /><stop offset="100%" stopColor="#15151A" />
            </linearGradient>
          </defs>
          {shadow}
          <path d="M17.5 10 L30.5 10 L32 33 C32.2 36.5 30.6 38.6 27.6 38.6 L20.4 38.6 C17.4 38.6 15.8 36.5 16 33 Z" fill={`url(#${p}-b)`} />
          <ellipse cx="24" cy="10" rx="6.5" ry="2.8" fill="#2A2A30" />
          <ellipse cx="24" cy="10" rx="4" ry="1.7" fill="#E8A0B4" />
          <ellipse cx="24" cy="10" rx="1.9" ry="0.8" fill="#B45B78" />
          <rect x="16.4" y="36.8" width="15.2" height="4.6" rx="2" fill="#232329" stroke="#3E3E46" strokeWidth="0.8" />
          <path d="M19.5 15 L20.3 31" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" opacity="0.16" />
        </>
      )
    case 'masturbator-egg':
      return (
        <>
          {shadow}
          <path d="M24 4.5 C30.5 4.5 35.5 13.5 35.5 24 C35.5 34.8 30.5 42.5 24 42.5 C17.5 42.5 12.5 34.8 12.5 24 C12.5 13.5 17.5 4.5 24 4.5 Z" fill="#F4F1EC" stroke="#D8D2C8" strokeWidth="1.1" />
          <path d="M12.9 21.5 L35.1 21.5 L35.1 27.5 L12.9 27.5 Z" fill="#F2B8C6" />
          <path d="M12.9 21.5 L35.1 21.5" stroke="#D98CA3" strokeWidth="1" />
          <path d="M12.9 27.5 L35.1 27.5" stroke="#D98CA3" strokeWidth="1" />
          <circle cx="24" cy="24.5" r="1.5" fill="#FFFFFF" opacity="0.8" />
          <ellipse cx="18.5" cy="13.5" rx="2.2" ry="4" fill="#FFFFFF" opacity="0.65" transform="rotate(-14 18.5 13.5)" />
        </>
      )
    case 'cock-ring':
      return (
        <>
          {shadow}
          <circle cx="24" cy="24" r="12" fill="none" stroke="#6E2438" strokeWidth="8.5" />
          <circle cx="24" cy="24" r="12" fill="none" stroke="#C24B72" strokeWidth="8.5" opacity="0.55" strokeDasharray="16 60" transform="rotate(-50 24 24)" />
          <circle cx="24" cy="24" r="12" fill="none" stroke="#F0A0B5" strokeWidth="2" opacity="0.5" strokeDasharray="8 68" transform="rotate(-30 24 24)" />
        </>
      )
    case 'triple-ring':
      return (
        <>
          {shadow}
          <circle cx="24" cy="15.5" r="8" fill="none" stroke="#9AA0A8" strokeWidth="4.6" />
          <circle cx="15.5" cy="29" r="6.6" fill="none" stroke="#878E97" strokeWidth="4.2" />
          <circle cx="32.5" cy="29" r="6.6" fill="none" stroke="#B4BAC1" strokeWidth="4.2" />
          <circle cx="24" cy="15.5" r="8" fill="none" stroke="#FFFFFF" strokeWidth="1" opacity="0.35" strokeDasharray="10 40" transform="rotate(-40 24 15.5)" />
        </>
      )
    case 'ball-stretcher':
      return (
        <>
          <defs>
            <linearGradient id={`${p}-b`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8B8F96" /><stop offset="50%" stopColor="#6E7278" /><stop offset="100%" stopColor="#54575C" />
            </linearGradient>
          </defs>
          {shadow}
          <path d="M13 13.5 C13 11 15 9.8 18 9.8 L30 9.8 C33 9.8 35 11 35 13.5 L35 16 L13 16 Z" fill={`url(#${p}-b)`} opacity="0.9" />
          <path d="M13.8 16 L34.2 16 L34.2 30 L13.8 30 Z" fill={`url(#${p}-b)`} opacity="0.75" />
          <path d="M13 30 L35 30 L35 33.5 C35 36 33 37.2 30 37.2 L18 37.2 C15 37.2 13 36 13 33.5 Z" fill={`url(#${p}-b)`} opacity="0.9" />
          <ellipse cx="24" cy="10.4" rx="7.5" ry="2" fill="#3C3F44" />
          <path d="M17 19 L17 27" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" opacity="0.3" />
        </>
      )
    case 'prostate-wand':
      return (
        <>
          <defs>
            <linearGradient id={`${p}-b`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#F4F5F7" /><stop offset="100%" stopColor="#878E97" />
            </linearGradient>
          </defs>
          {shadow}
          <path d="M13 10 C13 24 19 36 31.5 38.5" fill="none" stroke={`url(#${p}-b)`} strokeWidth="3.4" strokeLinecap="round" />
          <circle cx="12.4" cy="8" r="5.6" fill={`url(#${p}-b)`} stroke="#788089" strokeWidth="0.8" />
          <circle cx="35" cy="38.6" r="3.9" fill={`url(#${p}-b)`} stroke="#788089" strokeWidth="0.8" />
          <ellipse cx="10.6" cy="6.2" rx="1.5" ry="2.1" fill="#FFFFFF" opacity="0.65" />
        </>
      )
    case 'nipple-clamps':
      return (
        <>
          {shadow}
          <path d="M14 20 C18 30 30 30 34 20" fill="none" stroke="#9AA0A8" strokeWidth="1.7" />
          <g>
            <path d="M10.5 7 L15.5 7 L14.6 15 L11.4 15 Z" fill="#B4BAC1" stroke="#788089" strokeWidth="0.8" />
            <rect x="11.6" y="15" width="2.8" height="4.4" fill="#232329" />
            <rect x="9.8" y="4.4" width="6.4" height="2.6" rx="1.2" fill="#878E97" />
          </g>
          <g>
            <path d="M32.5 7 L37.5 7 L36.6 15 L33.4 15 Z" fill="#B4BAC1" stroke="#788089" strokeWidth="0.8" />
            <rect x="33.6" y="15" width="2.8" height="4.4" fill="#232329" />
            <rect x="31.8" y="4.4" width="6.4" height="2.6" rx="1.2" fill="#878E97" />
          </g>
          <circle cx="13" cy="20.6" r="1.2" fill="#69D2E7" opacity="0" />
        </>
      )
    case 'vibe-nipple-clamps':
      return (
        <>
          {shadow}
          <path d="M12 14 C14 20 18 23 22 24.5 M36 14 C34 20 30 23 26 24.5" fill="none" stroke="#3A3A42" strokeWidth="1.3" />
          <g>
            <ellipse cx="12" cy="9" rx="3" ry="4.6" fill="#232329" />
            <path d="M10.6 13.4 L13.4 13.4 L12.9 17.5 L11.1 17.5 Z" fill="#B4BAC1" stroke="#788089" strokeWidth="0.7" />
            <rect x="11.2" y="17.5" width="1.9" height="3.2" fill="#232329" />
          </g>
          <g>
            <ellipse cx="36" cy="9" rx="3" ry="4.6" fill="#232329" />
            <path d="M34.6 13.4 L37.4 13.4 L36.9 17.5 L35.1 17.5 Z" fill="#B4BAC1" stroke="#788089" strokeWidth="0.7" />
            <rect x="35.2" y="17.5" width="1.9" height="3.2" fill="#232329" />
          </g>
          <rect x="18.5" y="24" width="11" height="15" rx="2.4" fill="#2A2A30" stroke="#454550" strokeWidth="0.9" />
          <circle cx="24" cy="29.5" r="1.7" fill="#C9A84C" />
          <circle cx="24" cy="34.5" r="1.3" fill="#59636C" />
        </>
      )
    case 'nipple-suckers':
      return (
        <>
          {shadow}
          {[17, 31].map((x) => (
            <g key={x}>
              <path d={`M${x - 5.5} 40 L${x - 4.2} 20 C${x - 4} 16.5 ${x + 4} 16.5 ${x + 4.2} 20 L${x + 5.5} 40 Z`} fill="#DFF3F7" opacity="0.5" stroke="#9CC8D4" strokeWidth="1.1" />
              <ellipse cx={x} cy="35.5" rx="3.4" ry="4.6" fill="#C98A6B" opacity="0.85" />
              <circle cx={x} cy="33.5" r="1.5" fill="#8E5A3B" />
              <rect x={x - 2.2} y={8.5} width="4.4" height="8" rx="2" fill="#3A3330" />
              <path d={`M${x - 2.2} 11 L${x + 2.2} 11 M${x - 2.2} 13.6 L${x + 2.2} 13.6`} stroke="#C9A84C" strokeWidth="0.9" />
            </g>
          ))}
        </>
      )
    case 'paddle':
      return (
        <>
          <defs>
            <linearGradient id={`${p}-b`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#8A5A33" /><stop offset="100%" stopColor="#5E3A1E" />
            </linearGradient>
          </defs>
          {shadow}
          <g transform="rotate(28 24 24)">
            <path d="M16 4 L32 4 C35 4 36.8 6.4 36.8 10 L36.8 24 C36.8 27 35.4 28.8 33 29.6 L33 39 C33 41.4 31.6 42.6 29.6 42.6 L18.4 42.6 C16.4 42.6 15 41.4 15 39 L15 29.6 C12.6 28.8 11.2 27 11.2 24 L11.2 10 C11.2 6.4 13 4 16 4 Z" fill={`url(#${p}-b)`} transform="scale(0.94) translate(1.5 1.5)" />
            <path d="M15.5 8.5 L15.5 25 M32.5 8.5 L32.5 25" stroke="#3E2712" strokeWidth="1.1" strokeDasharray="2.4 2.2" opacity="0.7" />
            <circle cx="24" cy="40" r="1.7" fill="none" stroke="#C9A84C" strokeWidth="1.2" />
          </g>
        </>
      )
    case 'flogger':
      return (
        <>
          {shadow}
          <rect x="20.6" y="3" width="6.8" height="13" rx="2.6" fill="#232329" />
          <rect x="20.6" y="9" width="6.8" height="2.4" fill="#C9A84C" opacity="0.75" />
          <circle cx="24" cy="3.4" r="1.7" fill="none" stroke="#454550" strokeWidth="1.3" />
          <path d="M21.5 16.5 C20 24 18.6 31 17.8 39.5 M23 16.5 C22.4 24 21.8 31.5 21.4 40.5 M24.6 16.5 C24.6 24 24.6 32 24.8 41 M26.2 16.5 C26.8 24 27.6 31.5 28.4 40.5 M27.6 16.5 C29 24 30.2 31 31 39.5" stroke="#2A2A30" strokeWidth="2.1" fill="none" strokeLinecap="round" />
        </>
      )
    case 'pinwheel':
      return (
        <>
          {shadow}
          <g transform="rotate(38 24 24)">
            <rect x="21.6" y="16" width="4.8" height="24" rx="2.4" fill="#B4BAC1" stroke="#788089" strokeWidth="0.8" />
            <circle cx="24" cy="10.5" r="6.4" fill="none" stroke="#878E97" strokeWidth="1.7" />
            <path d="M24 4.6 L24 16.4 M18.6 7.6 L29.4 13.4 M29.4 7.6 L18.6 13.4" stroke="#878E97" strokeWidth="1.4" />
            <circle cx="24" cy="10.5" r="1.7" fill="#59636C" />
            <path d="M24 3.4 L24 1.8 M29.8 5.4 L30.9 4.2 M18.2 5.4 L17.1 4.2" stroke="#59636C" strokeWidth="1.2" strokeLinecap="round" />
          </g>
        </>
      )
    case 'blindfold':
      return (
        <>
          {shadow}
          <path d="M4 22 L10 21 M44 22 L38 21" stroke="#3A0E1B" strokeWidth="4" strokeLinecap="round" />
          <path d="M9 15.5 C15 12.8 20 13.4 24 16 C28 13.4 33 12.8 39 15.5 L39 24.5 C39 29.5 35.6 32.4 31.4 31.6 C28.2 31 25.8 29.2 24 26.8 C22.2 29.2 19.8 31 16.6 31.6 C12.4 32.4 9 29.5 9 24.5 Z" fill="#5E1224" />
          <path d="M9 15.5 C15 12.8 20 13.4 24 16 C28 13.4 33 12.8 39 15.5" fill="none" stroke="#C9A84C" strokeWidth="1.6" />
          <ellipse cx="16.5" cy="21" rx="3.4" ry="2" fill="#FFFFFF" opacity="0.16" transform="rotate(-8 16.5 21)" />
        </>
      )
    case 'ruler':
      return (
        <>
          <defs>
            <linearGradient id={`${p}-b`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#C89B62" /><stop offset="100%" stopColor="#9A6B38" />
            </linearGradient>
          </defs>
          {shadow}
          <g transform="rotate(-32 24 24)">
            <rect x="5" y="19" width="38" height="9" rx="2" fill={`url(#${p}-b)`} stroke="#7A5226" strokeWidth="0.9" />
            <path d="M10 19 L10 23 M15 19 L15 22 M20 19 L20 23 M25 19 L25 22 M30 19 L30 23 M35 19 L35 22 M40 19 L40 23" stroke="#5E3A1E" strokeWidth="1.1" />
            <path d="M7 25.8 L41 25.8" stroke="#FFFFFF" strokeWidth="1.2" opacity="0.22" />
          </g>
        </>
      )
    case 'bondage-tape':
      return (
        <>
          <defs>
            <linearGradient id={`${p}-b`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#454550" /><stop offset="100%" stopColor="#191920" />
            </linearGradient>
          </defs>
          {shadow}
          <ellipse cx="21" cy="24" rx="14" ry="15" fill={`url(#${p}-b)`} />
          <ellipse cx="21" cy="24" rx="6" ry="6.8" fill="#0F0F13" />
          <ellipse cx="21" cy="24" rx="6" ry="6.8" fill="none" stroke="#59636C" strokeWidth="1" opacity="0.6" />
          <path d="M33 30 C38 33 40 37.5 38.4 41.6 C37.6 43.6 35.2 44 33.8 42.6 C35 39.8 34.4 36.6 32 34.4 Z" fill="#33333B" />
          <ellipse cx="15.5" cy="14.5" rx="3" ry="5" fill="#FFFFFF" opacity="0.2" transform="rotate(-20 15.5 14.5)" />
        </>
      )
    case 'wrist-cuffs':
      return (
        <>
          {shadow}
          <path d="M20.5 23.5 L27.5 23.5" stroke="#59636C" strokeWidth="2.2" />
          <rect x="2.5" y="14" width="18" height="19" rx="4" fill="#232329" />
          <rect x="27.5" y="14" width="18" height="19" rx="4" fill="#232329" />
          <rect x="2.5" y="20.5" width="18" height="4.6" fill="#33333B" />
          <rect x="27.5" y="20.5" width="18" height="4.6" fill="#33333B" />
          <rect x="8" y="19.8" width="6" height="6" rx="1.2" fill="none" stroke="#C9A84C" strokeWidth="1.4" />
          <rect x="34" y="19.8" width="6" height="6" rx="1.2" fill="none" stroke="#C9A84C" strokeWidth="1.4" />
          <path d="M5.5 17 C9 15.8 13 15.8 16.5 17 M31.5 17 C35 15.8 39 15.8 42.5 17" stroke="#FFFFFF" strokeWidth="1.3" opacity="0.16" fill="none" strokeLinecap="round" />
        </>
      )
    default:
      return null
  }
}
