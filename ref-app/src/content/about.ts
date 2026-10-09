// Content: the owner's CV (2026-09-28), replacing the copy deck's invented
// bio, employers and tools. Wording follows the CV; `TODO(owner)` marks what
// it didn't settle (the portrait, and prose the CV only lists as bullets).
// D3 variant mechanism (notes/plan/14-approved.md §Variant mechanism): the
// variant is selected at build time by the Vite mode, read here in one
// place. `npm run dev`/`build` -> "bio" (default). `npm run dev:accordion`/
// `build:accordion` (mode "about-accordion", via .env.about-accordion) ->
// "accordion". Both variants share the h1, location, timelines and tools;
// "accordion" additionally renders `whatIDo` as a "What I do" accordion (M16).

import type { Img } from './projects'

export type AboutVariant = 'bio' | 'accordion'

export const aboutVariant: AboutVariant =
  import.meta.env.VITE_ABOUT_VARIANT === 'accordion' ? 'accordion' : 'bio'

export const portrait: Img = {
  src: '/photo.jpeg',
  alt: 'Bryan Widjaja',
  width: 800,
  height: 1000,
}

export const aboutCommon = {
  h1: 'About me',
  location: 'Banten, Indonesia',
  experienceHeading: 'Experience',
  educationHeading: 'Education',
  awardsHeading: 'Awards',
  toolsHeading: 'Tools I use',
  resume: {
    prompt: 'Want the one-page version?',
    pill: 'Download resume',
    // Shown as the disabled pill's title while site.resumeAvailable is false.
    unavailableTitle: 'Resume coming soon',
  },
}

// One row shape for every timeline on the page (Experience, Education,
// Awards): a title, where, and when.
export type TimelineRow = { role: string; org: string; period: string }

export const experience: TimelineRow[] = [
  { role: 'Part-time laboratory assistant', org: 'BINUS University Alam Sutera', period: 'Since 2025' },
]

export const education: TimelineRow[] = [
  { role: 'Undergraduate, Computer Science', org: 'BINUS University Alam Sutera · GPA 3.97', period: 'Since 2024' },
]

export const awards: TimelineRow[] = [
  { role: 'Mentoring Scholarship', org: 'BINUS University', period: '2026' },
]

export const tools = [
  { group: 'Languages', items: ['Python', 'Java', 'TypeScript'] },
  { group: 'Frontend', items: ['React', 'Svelte'] },
  { group: 'Backend', items: ['MySQL', 'PostgreSQL', 'Spring Boot'] },
  { group: 'Machine learning', items: ['PyTorch', 'scikit-learn', 'OpenCV', 'pandas', 'NumPy', 'Matplotlib'] },
  { group: 'Developer tools', items: ['Git', 'Docker'] },
]

// `bio` variant (D3 default/rec).
export const bio = {
  // TODO(owner): confirm bio lead -- the CV has no summary line, so this is
  // assembled from its Education and Projects sections.
  lead: "I'm a computer science student at BINUS University, building across machine learning, backend and frontend.",
  paragraphs: [
    'As a part-time lab assistant I teach 100 to 120 students a semester across four to five lab sections: Python, C and C++, data structures, Java and its design patterns, computer vision, enterprise data warehousing and web development. I also proctor exams, design the practical cases and grade the work.',
    "My research on static malware detection was accepted for presentation at ICoAILO 2026, and tutoring undergraduate calculus through BINUS University's SASC program earned me a one-semester mentoring scholarship.",
  ],
}

// `accordion` variant only (D3 option 2, M16). Rendered as a "What I do" accordion.
// TODO(owner): confirm row copy -- grouped from the CV's projects and experience.
export const whatIDo = [
  {
    id: 'machine-learning',
    title: 'Machine learning',
    body: 'I build and evaluate models end to end, from the data pipeline to a calibrated operating point. My byte-image malware detector reached 0.988 ROC-AUC with a 0.48 MB model.',
  },
  {
    id: 'teaching',
    title: 'Teaching',
    body: 'I run programming labs for 100 to 120 students a semester, write the practical exam cases and grade them.',
  },
  {
    id: 'frontend-and-extensions',
    title: 'Frontend and extensions',
    body: 'I build interfaces in Svelte and React with TypeScript and Tailwind CSS, including Manifest V3 Chrome extensions.',
  },
]
