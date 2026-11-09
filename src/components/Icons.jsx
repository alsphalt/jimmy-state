const Svg = ({ children, size = 20, strokeWidth = 1.7, ...rest }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...rest}
  >
    {children}
  </svg>
)

export const IconHome = (p) => (
  <Svg {...p}>
    <path d="M3 10.6 12 3.2l9 7.4V20a1 1 0 0 1-1 1h-4.6v-6.2H8.6V21H4a1 1 0 0 1-1-1z" />
  </Svg>
)

export const IconCompass = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m16.2 7.8-2.3 6.1-6.1 2.3 2.3-6.1z" />
  </Svg>
)

export const IconPlay = ({ size = 20, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
    <path d="M8.5 5.4c0-.9 1-1.4 1.7-.9l9 6.6c.7.5.7 1.6 0 2.1l-9 6.6c-.7.5-1.7 0-1.7-.9z" />
  </svg>
)

export const IconPause = ({ size = 20, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
    <rect x="6.5" y="5" width="4" height="14" rx="1.4" />
    <rect x="13.5" y="5" width="4" height="14" rx="1.4" />
  </svg>
)

export const IconSearch = (p) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m16.4 16.4 4 4" />
  </Svg>
)

export const IconVideo = (p) => (
  <Svg {...p}>
    <rect x="2.5" y="6" width="19" height="12" rx="3" />
    <path d="m10.4 9.6 4.2 2.4-4.2 2.4z" fill="currentColor" stroke="none" />
  </Svg>
)

export const IconLibrary = (p) => (
  <Svg {...p}>
    <path d="M4 6.5v13" />
    <path d="M8.5 4v15.5" />
    <rect x="13" y="5.5" width="7" height="14" rx="1.6" />
  </Svg>
)

export const IconDownload = (p) => (
  <Svg {...p}>
    <path d="M12 3.5v11.5" />
    <path d="m7.5 10.8 4.5 4.4 4.5-4.4" />
    <path d="M4 20h16" />
  </Svg>
)

export const IconHeart = ({ filled = false, ...p }) => (
  <Svg {...p} fill={filled ? 'currentColor' : 'none'}>
    <path d="M12 20.3 4.9 13.5a4.6 4.6 0 0 1 0-6.6 4.6 4.6 0 0 1 6.5 0l.6.6.6-.6a4.6 4.6 0 0 1 6.5 0 4.6 4.6 0 0 1 0 6.6z" />
  </Svg>
)

export const IconClock = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.6" />
    <path d="M12 7.4V12l3.2 2" />
  </Svg>
)

export const IconList = (p) => (
  <Svg {...p}>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <circle cx="4.5" cy="6" r="1.2" fill="currentColor" />
    <circle cx="4.5" cy="12" r="1.2" fill="currentColor" />
    <circle cx="4.5" cy="18" r="1.2" fill="currentColor" />
  </Svg>
)

export const IconLink = (p) => (
  <Svg {...p}>
    <path d="M10.5 13.5a4 4 0 0 0 5.7 0l2.1-2.1a4 4 0 0 0-5.7-5.7l-1 1" />
    <path d="M13.5 10.5a4 4 0 0 0-5.7 0l-2.1 2.1a4 4 0 0 0 5.7 5.7l1-1" />
  </Svg>
)

/** Music-note mark — used for the TikTok tool. */
export const IconCamera = (p) => (
  <Svg {...p}>
    <path d="M3.4 8.4h2.8l1.4-2h7.2l1.4 2h2.4a1.4 1.4 0 0 1 1.4 1.4v7.4a1.4 1.4 0 0 1-1.4 1.4H3.4A1.4 1.4 0 0 1 2 17.2V9.8a1.4 1.4 0 0 1 1.4-1.4Z" />
    <circle cx="12" cy="13" r="3.1" />
  </Svg>
)

export const IconFolder = (p) => (
  <Svg {...p}>
    <path d="M3 7.2a1.8 1.8 0 0 1 1.8-1.8h4l2 2.2h6.4A1.8 1.8 0 0 1 19 9.4v7.6a1.8 1.8 0 0 1-1.8 1.8H4.8A1.8 1.8 0 0 1 3 17V7.2Z" />
  </Svg>
)

export const IconTube = (p) => (
  <Svg {...p}>
    <rect x="2.6" y="5.2" width="18.8" height="13.6" rx="4" />
    <path d="M10.4 9.6l4.6 2.4-4.6 2.4z" />
  </Svg>
)

export const IconTikTok = (p) => (
  <Svg {...p}>
    <path d="M15 4v9.2a3.3 3.3 0 1 1-2.6-3.2" />
    <path d="M15 4c.4 2.2 1.9 3.6 4 3.9" />
  </Svg>
)

export const IconMenu = (p) => (
  <Svg {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
)

export const IconSettings = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19.4 14.2a7.6 7.6 0 0 0 0-4.4l1.7-1.2-2-3.4-1.9.9a7.6 7.6 0 0 0-3.8-2.2L13 1.9h-4l-.4 2a7.6 7.6 0 0 0-3.8 2.2l-1.9-.9-2 3.4L2.6 9.8a7.6 7.6 0 0 0 0 4.4l-1.7 1.2 2 3.4 1.9-.9a7.6 7.6 0 0 0 3.8 2.2l.4 2h4l.4-2a7.6 7.6 0 0 0 3.8-2.2l1.9.9 2-3.4z" />
  </Svg>
)

export const IconShield = (p) => (
  <Svg {...p}>
    <path d="M12 3 5 6v5.5c0 4.3 2.9 7.7 7 9.5 4.1-1.8 7-5.2 7-9.5V6z" />
    <path d="m9.2 12 2 2 3.6-3.8" />
  </Svg>
)

export const IconChevron = (p) => (
  <Svg {...p}>
    <path d="m9.5 6 6 6-6 6" />
  </Svg>
)

export const IconX = (p) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
)

export const IconCheck = (p) => (
  <Svg {...p}>
    <path d="m5 12.5 4.5 4.5L19 6.5" />
  </Svg>
)

export const IconAlert = (p) => (
  <Svg {...p}>
    <path d="M12 4.2 21 19.5H3z" />
    <path d="M12 10v4.2" />
    <circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none" />
  </Svg>
)

export const IconRefresh = (p) => (
  <Svg {...p}>
    <path d="M20 11a8 8 0 1 0-2.6 6.3" />
    <path d="M20 4.5V11h-6" />
  </Svg>
)

export const IconExternal = (p) => (
  <Svg {...p}>
    <path d="M14 4h6v6" />
    <path d="M20 4 11 13" />
    <path d="M18 14.5V19a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V7.5A1.5 1.5 0 0 1 5 6h4.5" />
  </Svg>
)

export const IconTrash = (p) => (
  <Svg {...p}>
    <path d="M4 7h16" />
    <path d="M9 7V4.8h6V7" />
    <path d="M6.5 7 7.4 20a1 1 0 0 0 1 1h7.2a1 1 0 0 0 1-1L17.5 7" />
  </Svg>
)

export const IconPlus = (p) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)

export const IconMusic = (p) => (
  <Svg {...p}>
    <path d="M9 18V6.4l10-2v11.2" />
    <circle cx="6.6" cy="18" r="2.6" />
    <circle cx="16.6" cy="15.6" r="2.6" />
  </Svg>
)

export const IconMic = (p) => (
  <Svg {...p}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
    <path d="M12 18v3M9 21h6" />
  </Svg>
)

export const IconDisc = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.6" />
    <circle cx="12" cy="12" r="2.4" />
  </Svg>
)

export const IconMore = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="5.5" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="18.5" r="1.4" fill="currentColor" stroke="none" />
  </Svg>
)

export const IconArrowLeft = (p) => (
  <Svg {...p}>
    <path d="M19 12H5" />
    <path d="m11 6-6 6 6 6" />
  </Svg>
)

export const IconWifi = (p) => (
  <Svg {...p}>
    <path d="M2.5 9a14 14 0 0 1 19 0" />
    <path d="M6 12.5a9 9 0 0 1 12 0" />
    <path d="M9.5 16a4.5 4.5 0 0 1 5 0" />
    <circle cx="12" cy="19.2" r="0.9" fill="currentColor" stroke="none" />
  </Svg>
)

export const IconGlobe = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3.2 9h17.6M3.2 15h17.6" />
    <path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18z" />
  </Svg>
)

export const IconLanguage = (p) => (
  <Svg {...p}>
    <path d="M4 5.5h8.5M8.2 3.6v1.9" />
    <path d="M10.6 5.5c-.4 4-2.4 6.9-6.2 8.9" />
    <path d="M5.4 10.2c1.2 2 3 3.5 5.4 4.4" />
    <path d="M13.4 20.4l3.6-8.6 3.6 8.6" />
    <path d="M14.7 17.5h4.6" />
  </Svg>
)

export const IconPrev = (p) => (
  <Svg {...p}>
    <path d="M18 5.5v13L9 12z" fill="currentColor" stroke="none" />
    <path d="M6 5v14" />
  </Svg>
)

export const IconNext = (p) => (
  <Svg {...p}>
    <path d="M6 5.5v13L15 12z" fill="currentColor" stroke="none" />
    <path d="M18 5v14" />
  </Svg>
)

export const IconShuffle = (p) => (
  <Svg {...p}>
    <path d="M16 4h4v4" />
    <path d="M4 20 20 4" />
    <path d="M16 20h4v-4" />
    <path d="M4 4l5 5" />
    <path d="m14.5 14.5 5.5 5.5" />
  </Svg>
)

export const IconRepeat = (p) => (
  <Svg {...p}>
    <path d="M17 2.5 20.5 6 17 9.5" />
    <path d="M3.5 11V9a3 3 0 0 1 3-3h14" />
    <path d="M7 21.5 3.5 18 7 14.5" />
    <path d="M20.5 13v2a3 3 0 0 1-3 3h-14" />
  </Svg>
)

export const IconRepeatOne = (p) => (
  <Svg {...p}>
    <path d="M17 2.5 20.5 6 17 9.5" />
    <path d="M3.5 11V9a3 3 0 0 1 3-3h14" />
    <path d="M7 21.5 3.5 18 7 14.5" />
    <path d="M20.5 13v2a3 3 0 0 1-3 3h-14" />
    <path d="M11.5 14.5v-3.2l-1.2.8" />
  </Svg>
)

export const IconQueue = (p) => (
  <Svg {...p}>
    <path d="M4 6h11" />
    <path d="M4 12h11" />
    <path d="M4 18h7" />
    <path d="M17 14v7" />
    <path d="M20 17h-6" />
  </Svg>
)

export const IconShare = (p) => (
  <Svg {...p}>
    <circle cx="18" cy="5" r="2.6" />
    <circle cx="6" cy="12" r="2.6" />
    <circle cx="18" cy="19" r="2.6" />
    <path d="m8.3 10.7 7.4-4.2" />
    <path d="m8.3 13.3 7.4 4.2" />
  </Svg>
)
