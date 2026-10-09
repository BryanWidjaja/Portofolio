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
  email: 'bryan.widjaja1708@gmail.com',
  // The owner's CV (public/Bryan-Widjaja-CV.pdf), downloaded under
  // `resumeFileName`. `resumeAvailable: false` would put the About page's
  // pill back to disabled and drop the nav/menu CV buttons (CvButton.tsx)
  // instead of linking to a missing file.
  resumeUrl: '/Bryan-Widjaja-CV.pdf',
  resumeFileName: 'Bryan-Widjaja-CV.pdf',
  resumeAvailable: true,
  cvButton: { label: 'CV', ariaLabel: 'Download CV (PDF)' },
  location: 'Banten, Indonesia',
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

  // 47-round3-plan.md §R5 item 6: the "Menu" text pill is gone -- the
  // button is icon-only (a burger that morphs into a drawn X, Nav.tsx) at
  // every width, so both labels only ever reach the accessible-name tree
  // via `aria-label`, never rendered as visible text.
  menuButton: { openLabel: 'Open menu', closeLabel: 'Close menu' },

  // The CV's own two links. The deck's Bluesky placeholder is gone -- the
  // CV lists no Bluesky account.
  socials: [
    { label: 'GitHub', href: 'https://github.com/BryanWidjaja' },
    { label: 'LinkedIn', href: 'https://www.linkedin.com/in/bryan-widjaja-193949251/' },
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
      description:
        'Computer science student at BINUS University building across machine learning, backend and frontend. Projects, experience and contact.',
    },
    about: {
      title: `About · Bryan Widjaja`,
      description: 'Education, experience and the tools Bryan Widjaja uses, from PyTorch research to Svelte frontends.',
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
      eyebrow: 'About',
      // Accent phrase: "100+ students".
      lead: 'I build machine learning and web projects, publish malware research, and teach programming labs to 100+ students a semester at BINUS University.',
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
    // TODO(owner): confirm -- the CV doesn't say. The deck's "open to
    // full-time roles" read wrong for a current undergraduate, so this is a
    // guess to correct.
    availability: 'Currently open to internships.',
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
