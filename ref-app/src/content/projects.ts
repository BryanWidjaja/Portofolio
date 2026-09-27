// Copy deck: notes/plan/10-direction.md Â§Copy deck, Â§Placeholder art direction.
// Content model: spec Â§3 (notes/prompts/portfolio-build/01-spec.md). Every
// field below is deliberate placeholder copy the owner still needs to
// confirm or replace (`placeholder: true` on each project, `TODO(owner)`
// comments on each field), even where the draft text is specific rather
// than lorem ipsum.

export type Img = {
  src: string
  alt: string
  width: number
  height: number
  /** Gallery caption shown next to the image. Not part of the spec Â§3 `Img` type; added here since the copy deck ties one caption per gallery image. */
  caption?: string
}

export type ProjectSection = { label: string; body: string }

export type Project = {
  slug: string
  title: string
  summary: string
  role: string
  year: number
  category: string
  stack: string[]
  links: { live?: string; repo?: string }
  cover: Img
  gallery: Img[]
  sections: ProjectSection[]
  placeholder: true
}

export const projects: Project[] = [
  {
    slug: 'tidewater',
    // TODO(owner): confirm project title.
    title: 'Tidewater',
    // TODO(owner): confirm summary.
    summary:
      "An operations dashboard that shows a small shipping fleet where every vessel is and where it's headed next.",
    // TODO(owner): confirm role.
    role: 'Design and full-stack development',
    year: 2026,
    // TODO(owner): confirm category label.
    category: 'Web app',
    // TODO(owner): confirm stack.
    stack: ['React', 'TypeScript', 'Node.js', 'PostgreSQL', 'MapLibre GL'],
    // TODO(owner): no live/source links yet.
    links: {},
    // TODO(owner): cover and gallery images below are generated colour-chart
    // stand-ins (scripts/placeholders.mjs, 47-round3-plan.md §R3); replace
    // with real product screenshots.
    cover: {
      src: '/placeholders/tidewater/cover-1600.webp',
      alt: 'Placeholder art: an unrotated grid of saturated colour squares in thin paper gutters, an evenly spaced hue wheel starting from blue-teal.',
      width: 1600,
      height: 1000,
    },
    gallery: [
      {
        src: '/placeholders/tidewater/gallery-1-1600.webp',
        alt: 'Placeholder art: a grid of saturated colour squares in thin paper gutters, an evenly spaced hue wheel starting from blue-teal.',
        width: 1200,
        height: 900,
        // TODO(owner): confirm caption.
        caption: "Route planner with the day's port calls",
      },
      {
        src: '/placeholders/tidewater/gallery-2-1600.webp',
        alt: 'Placeholder art: a tall grid of saturated colour squares in thin paper gutters, an evenly spaced hue wheel starting from blue-teal.',
        width: 900,
        height: 1200,
        // TODO(owner): confirm caption.
        caption: 'Vessel list sorted by next arrival',
      },
    ],
    sections: [
      {
        label: 'The problem',
        // TODO(owner): confirm copy.
        body: 'Dispatchers tracked vessels across a shared spreadsheet, radio logs and phone calls, so nobody saw the same picture of the day.',
      },
      {
        label: 'What I built',
        // TODO(owner): confirm copy.
        body: 'One live view: vessel status on a map, a timeline of port calls and a route planner that flags weather and berth conflicts before a ship leaves.',
      },
      {
        label: 'What changed',
        // TODO(owner): confirm copy.
        body: 'Dispatch moved off the spreadsheet, and route changes that took a round of calls now happen in the planner.',
      },
    ],
    placeholder: true,
  },
  {
    slug: 'kopi-ledger',
    // TODO(owner): confirm project title.
    title: 'Kopi Ledger',
    // TODO(owner): confirm summary.
    summary: 'Inventory and point of sale for independent coffee shops, built to keep working when the Wi-Fi drops.',
    // TODO(owner): confirm role.
    role: 'Mobile and web development',
    year: 2025,
    // TODO(owner): confirm category label.
    category: 'Mobile + web',
    // TODO(owner): confirm stack.
    stack: ['React Native', 'Expo', 'TypeScript', 'Supabase', 'SQLite'],
    // TODO(owner): no live/source links yet.
    links: {},
    // TODO(owner): cover and gallery images below are generated colour-chart
    // stand-ins (scripts/placeholders.mjs, 47-round3-plan.md §R3); replace
    // with real product screenshots.
    cover: {
      src: '/placeholders/kopi-ledger/cover-1600.webp',
      alt: 'Placeholder art: a slightly rotated grid of saturated colour squares in thin paper gutters, an evenly spaced hue wheel starting from amber-terracotta.',
      width: 1600,
      height: 1000,
    },
    gallery: [
      {
        src: '/placeholders/kopi-ledger/gallery-1-1600.webp',
        alt: 'Placeholder art: a slightly rotated grid of saturated colour squares in thin paper gutters, an evenly spaced hue wheel starting from amber-terracotta.',
        width: 1200,
        height: 900,
        // TODO(owner): confirm caption.
        caption: 'Till screen during a morning rush',
      },
      {
        src: '/placeholders/kopi-ledger/gallery-2-1600.webp',
        alt: 'Placeholder art: a tall, slightly rotated grid of saturated colour squares in thin paper gutters, an evenly spaced hue wheel starting from amber-terracotta.',
        width: 900,
        height: 1200,
        // TODO(owner): confirm caption.
        caption: 'Stock view in the back office',
      },
    ],
    sections: [
      {
        label: 'The problem',
        // TODO(owner): confirm copy.
        body: 'Shops ran a tablet till, a paper stock sheet and a group chat for supplier orders. Stock counts drifted by the end of each week.',
      },
      {
        label: 'What I built',
        // TODO(owner): confirm copy.
        body: 'An offline-first till for the counter and a web back office for stock, recipes and supplier orders. Sales sync when the connection returns.',
      },
      {
        label: 'What changed',
        // TODO(owner): confirm copy.
        body: 'Owners close out the day from their phone, and reorders go out when stock drops below a level they set.',
      },
    ],
    placeholder: true,
  },
  {
    slug: 'halftone',
    // TODO(owner): confirm project title.
    title: 'Halftone',
    // TODO(owner): confirm summary.
    summary: 'A command-line tool and library that turns images into print-style halftone patterns.',
    // TODO(owner): confirm role.
    role: 'Author and maintainer',
    year: 2024,
    // TODO(owner): confirm category label.
    category: 'Open source',
    // TODO(owner): confirm stack.
    stack: ['Rust', 'WebAssembly', 'npm'],
    links: {
      // TODO(owner): replace with the real GitHub profile/repo URL.
      repo: 'https://github.com/TODO-owner/halftone',
    },
    // TODO(owner): cover and gallery images below are generated colour-chart
    // stand-ins (scripts/placeholders.mjs, 47-round3-plan.md §R3); replace
    // with real product screenshots.
    cover: {
      src: '/placeholders/halftone/cover-1600.webp',
      alt: 'Placeholder art: a slightly rotated grid of saturated colour squares in thin paper gutters, an evenly spaced hue wheel starting from violet.',
      width: 1600,
      height: 1000,
    },
    gallery: [
      {
        src: '/placeholders/halftone/gallery-1-1600.webp',
        alt: 'Placeholder art: a slightly rotated grid of saturated colour squares in thin paper gutters, an evenly spaced hue wheel starting from violet.',
        width: 1200,
        height: 900,
        // TODO(owner): confirm caption.
        caption: 'Dot screens at 15, 45 and 75 degrees',
      },
      {
        src: '/placeholders/halftone/gallery-2-1600.webp',
        alt: 'Placeholder art: a tall, slightly rotated grid of saturated colour squares in thin paper gutters, an evenly spaced hue wheel starting from violet.',
        width: 900,
        height: 1200,
        // TODO(owner): confirm caption.
        caption: 'One screen from light to dark',
      },
    ],
    sections: [
      {
        label: 'The problem',
        // TODO(owner): confirm copy.
        body: 'I wanted halftone effects for a zine, and every option was a Photoshop action or a slow script that choked on large scans.',
      },
      {
        label: 'What I built',
        // TODO(owner): confirm copy.
        body: 'A Rust core with a CLI and a WebAssembly build for the browser. Dot, line and cross screens at any angle, exported as SVG or PNG.',
      },
      {
        label: 'What changed',
        // TODO(owner): confirm copy.
        body: "It's the tool I reach for on every print project, and other people now send pull requests.",
      },
    ],
    placeholder: true,
  },
]
