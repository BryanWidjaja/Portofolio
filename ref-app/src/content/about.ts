// Copy deck: notes/plan/10-direction.md Â§Copy deck.
// D3 variant mechanism (notes/plan/14-approved.md Â§Variant mechanism): the
// variant is selected at build time by the Vite mode, read here in one
// place. `npm run dev`/`build` -> "bio" (default). `npm run dev:accordion`/
// `build:accordion` (mode "about-accordion", via .env.about-accordion) ->
// "accordion". Both variants share the h1, location, experience and tools;
// "accordion" additionally renders `whatIDo` as a "What I do" accordion (M16).

import type { Img } from './projects'

export type AboutVariant = 'bio' | 'accordion'

export const aboutVariant: AboutVariant =
  import.meta.env.VITE_ABOUT_VARIANT === 'accordion' ? 'accordion' : 'bio'

// Placeholder art direction (10-direction.md): 4:5 block, `BW` in italic
// ink at 40% of block width, rasterised (scripts/placeholders.mjs) and
// shown as a grey leaf (V12, 41-ink-replace-map.md: grayscale + multiply,
// no brush). TODO(owner): replace with a photo.
export const portrait: Img = {
  src: '/placeholders/portrait-1200.webp',
  alt: "Placeholder portrait: Bryan's initials",
  width: 800,
  height: 1000,
}

export const aboutCommon = {
  h1: 'About me',
  // TODO(owner): confirm location line.
  location: 'Jakarta, Indonesia',
  experienceHeading: 'Experience',
  toolsHeading: 'Tools I use',
  resume: {
    prompt: 'Want the one-page version?',
    pill: 'Download resume',
    // Shown as the disabled pill's title while site.resumeAvailable is false.
    unavailableTitle: 'Resume coming soon',
  },
}

export const experience = [
  // TODO(owner): confirm role, employer and dates.
  { role: 'Software engineer', org: 'Arus Logistik', period: 'Since 2023' },
  // TODO(owner): confirm role, employer and dates.
  { role: 'Frontend developer', org: 'Studio Rintik', period: '2020-2023' },
  // TODO(owner): confirm role, employer and dates.
  { role: 'Developer intern', org: 'Kas Kecil', period: '2019-2020' },
]

export const tools = [
  { group: 'Languages', items: ['TypeScript', 'Rust', 'SQL', 'Python'] },
  { group: 'Frontend', items: ['React', 'React Native', 'Tailwind CSS', 'GSAP'] },
  { group: 'Backend', items: ['Node.js', 'PostgreSQL', 'Supabase'] },
  { group: 'Workflow', items: ['Figma', 'Git', 'Docker'] },
]

// `bio` variant (D3 default/rec).
export const bio = {
  // Accent phrase: "small teams".
  // TODO(owner): confirm bio lead.
  lead: "I've spent six years building web and mobile software, mostly for small teams that need one person to own the whole stack.",
  paragraphs: [
    // TODO(owner): confirm bio paragraph.
    "I start with the people using it: a dispatcher at 6 a.m., a barista with a queue at the door. Then I pick the simplest stack that will still be easy to change a year later.",
    // TODO(owner): confirm bio paragraph.
    'Outside client work I maintain Halftone, print the odd zine and hunt for good kopi susu.',
  ],
}

// `accordion` variant only (D3 option 2, M16). Rendered as a "What I do" accordion.
export const whatIDo = [
  {
    id: 'product-engineering',
    // TODO(owner): confirm row copy.
    title: 'Product engineering',
    body: 'I take a feature from rough idea to shipped code: the data model, the API, the interface and the tests that keep it working.',
  },
  {
    id: 'offline-first-mobile-apps',
    // TODO(owner): confirm row copy.
    title: 'Offline-first mobile apps',
    body: 'I build React Native apps that keep working without signal and sync once the connection comes back.',
  },
  {
    id: 'maintenance-and-rescue',
    // TODO(owner): confirm row copy.
    title: 'Maintenance and rescue',
    body: "I pick up existing codebases and fix what's breaking first. Then I make them easier for the next person to change.",
  },
]
