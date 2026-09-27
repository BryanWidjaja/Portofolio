// Copy deck: notes/plan/10-direction.md Â§Copy deck.
// Strings are sentence case, no em/en dashes. `TODO(owner)` marks placeholders
// the owner still needs to confirm or replace.
//
// A few strings carry one italic-accent word or phrase in the deck (marked
// with *asterisks* there). That markup isn't reproduced here: these are kept
// as plain strings, and the word to render with the `Accent` component is
// called out in a comment so E3 can wire it up.

export type NavLink = { label: string; href: string }

export const site = {
  name: 'Bryan Widjaja',
  monogram: 'BW',
  skipLabel: 'Skip to content',

  // TODO(owner): confirm production domain before launch (used for canonical/OG URLs and the sitemap).
  url: 'https://bryanwidjaja.com',
  // TODO(owner): confirm contact email.
  email: 'hello@bryanwidjaja.com',
  // TODO(owner): add the real file at public/resume.pdf, then flip
  // `resumeAvailable` to true. Until then the About page renders the pill
  // disabled instead of linking to a 404 (src/pages/About.tsx).
  resumeUrl: '/resume.pdf',
  resumeAvailable: false,
  // TODO(owner): confirm location line.
  location: 'Jakarta, Indonesia',
  ogImage: '/og/default.png',

  nav: [
    { label: 'Work', href: '/#work' },
    { label: 'About', href: '/about' },
    { label: 'Contact', href: '#contact' },
  ],

  menuLinks: [
    { label: 'Home', href: '/' },
    { label: 'Work', href: '/#work' },
    { label: 'About', href: '/about' },
    { label: 'Contact', href: '#contact' },
  ],

  // 45 §Owner feedback item 9: the open state keeps its "Menu" label; the
  // close state is a drawn X (Nav.tsx), so `closeLabel` only ever reaches
  // the accessible-name tree via `aria-label`, never rendered as text.
  menuButton: { open: 'Menu', closeLabel: 'Close menu' },

  socials: [
    // TODO(owner): replace with the real GitHub profile URL.
    { label: 'GitHub', href: 'https://github.com/TODO-owner' },
    // TODO(owner): replace with the real LinkedIn profile URL.
    { label: 'LinkedIn', href: 'https://linkedin.com/in/TODO-owner' },
    // TODO(owner): replace with the real Bluesky profile URL.
    { label: 'Bluesky', href: 'https://bsky.app/profile/TODO-owner' },
  ],

  cursor: { open: 'open', next: 'next', copy: 'copy', copied: 'copied' },

  meta: {
    home: {
      // R3-1 (47-round3-plan.md §R1 item 1, owner's pick): the home tab
      // title is just the name -- every other route keeps its own
      // `X · Bryan Widjaja` pattern (see about/notFound below).
      title: `Bryan Widjaja`,
      // G9 (46 item 9): no longer echoes home.heroDescription (deleted below)
      // -- kept as its own sentence so this meta copy doesn't depend on a
      // string the hero page no longer renders.
      description: 'Developer building software for small businesses. Recent projects, background and contact.',
    },
    about: {
      title: `About · Bryan Widjaja`,
      description: 'Background, experience and the tools Bryan Widjaja uses to build web and mobile software.',
    },
    notFound: {
      title: `Page not found · Bryan Widjaja`,
      description: "This page doesn't exist. The home page lists recent projects.",
    },
  },

  home: {
    heroName: ['Bryan', 'Widjaja'] as const,
    // G9 (46 item 9, 45 §Polish round decision 3): the hero description line
    // is gone -- with it, the name moves to bottom-left in the dissolve band
    // (pages/Home.tsx moves the h1 to `md:row-start-3`), matching the mobile
    // crop and the zone with the better luminance headroom.
    // 45-ink-approved.md §Adjustments "Inscription", V32 (41-ink-replace-map.md):
    // deferred by the owner at G2 -- traditional characters only, never
    // invented or machine-translated (bar §C2). Filling this one string is
    // meant to be the whole diff: pages/Home.tsx renders no CJK column and
    // no CJK font while it's null; once it's set, the column renders
    // lang="zh-Hant" vertical-rl beside the name (the seal that used to
    // move to its foot is gone, 45 §Owner feedback item 4).
    heroInscription: null as string | null,
    // Accent phrase: "Recent work" (the whole eyebrow is accent italic).
    workEyebrow: 'Recent work',
    workHeading: "What I've been building",
    aboutCta: {
      // Accent phrase: "after launch".
      lead: "I'm most useful after launch, when real people start using what we built.",
      pill: 'About me',
    },
  },

  footer: {
    // Accent phrase: "Contact" (the whole eyebrow is accent italic).
    eyebrow: 'Contact',
    heading: "Tell me what you're building.",
    openMailLabel: 'Open mail app',
    copyLabel: 'Copy',
    copiedLabel: 'Copied',
    copiedAnnouncement: 'Email address copied',
    copyFailureAnnouncement: "Couldn't copy, opening your mail app",
    // TODO(owner): confirm current availability line.
    availability: 'Currently open to full-time roles.',
    pagesLabel: 'Pages',
    socialLabel: 'Social',
    pageLinks: [
      { label: 'Home', href: '/' },
      { label: 'Work', href: '/#work' },
      { label: 'About', href: '/about' },
    ],
    newTabSuffix: '(opens in new tab)',
    // R3-1 (47 §R1 item 7, owner's pick): the colophon line ("Designed and
    // built by me. Set in Cormorant and Public Sans.") is removed outright
    // -- Footer.tsx no longer renders a `signOff` node.
    copyright: `© 2026 Bryan Widjaja`,
  },

  notFound: {
    // Accent phrase: "Error 404" (the whole eyebrow is accent italic).
    eyebrow: 'Error 404',
    heading: "This page doesn't exist.",
    body: "The link may be old, or I moved something. Everything I've built is on the home page.",
    pill: 'Back to home',
  },
} as const
