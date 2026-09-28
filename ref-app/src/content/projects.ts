// Content: the owner's CV (2026-09-28) and each project's own repository
// (the links the CV underlines), replacing the copy deck's invented
// projects. Words are the CV's own where it has them, filled out from the
// repo READMEs and code, never beyond what either one states.
// Content model: spec §3 (notes/prompts/portfolio-build/01-spec.md).
//
// Every image below is still a stand-in: none of the three repos carries a
// product screenshot, so each slot is a "replace with" box saying what
// belongs there (scripts/placeholders.mjs). `TODO(owner)` marks each one,
// plus the few strings the CV didn't settle outright.

export type Img = {
  src: string
  alt: string
  width: number
  height: number
  /** Gallery caption shown next to the image. Not part of the spec §3 `Img` type; added here since the copy deck ties one caption per gallery image. */
  caption?: string
}

export type ProjectSection = { label: string; body: string }

export type ProjectLink = { label: string; href: string }

export type Project = {
  slug: string
  title: string
  summary: string
  role: string
  year: number
  category: string
  stack: string[]
  // `repos` is a list because InstaTags ships as two repositories (the web
  // frontend and the Chrome extension), each its own pill.
  links: { live?: string; repos?: ProjectLink[] }
  cover: Img
  gallery: Img[]
  sections: ProjectSection[]
}

export const projects: Project[] = [
  {
    slug: 'malware-detection',
    // TODO(owner): confirm the short title -- the paper's full title
    // ("A Lightweight, Entropy-Aware Byte-Image CNN for Static Malware
    // Detection") is too long for the card and the h1, so it leads the
    // first section instead.
    title: 'Static Malware Detection',
    summary:
      'A lightweight byte-image CNN that flags malicious Windows executables from their raw bytes, without ever running them. Accepted at ICoAILO 2026.',
    // First of five authors on the paper (README §Citation/§Authors).
    role: 'First author, research team of five',
    year: 2026,
    category: 'Research',
    stack: ['Python', 'PyTorch', 'Computer Vision'],
    links: {
      repos: [{ label: 'View source', href: 'https://github.com/BryanWidjaja/MalwareDetection' }],
    },
    // TODO(owner): replace the three "replace with" boxes below with real images.
    cover: {
      src: '/placeholders/malware-detection/cover-1600.webp',
      alt: 'Placeholder: replace with a cover image for the malware detector, such as a byte-image of one PE file.',
      width: 1600,
      height: 1000,
    },
    gallery: [
      {
        src: '/placeholders/malware-detection/gallery-1-1600.webp',
        alt: 'Placeholder: replace with the ROC and precision-recall curves from a training run.',
        width: 1200,
        height: 900,
        caption: 'ROC and precision-recall curves, family-disjoint split',
      },
      {
        src: '/placeholders/malware-detection/gallery-2-1600.webp',
        alt: 'Placeholder: replace with one PE file rendered as its 64 by 64 byte-image.',
        width: 900,
        height: 1200,
        caption: 'One executable as a 64×64 byte-image',
      },
    ],
    sections: [
      {
        label: 'The problem',
        body: 'Most reliable malware analysis means running the file. The paper, "A Lightweight, Entropy-Aware Byte-Image CNN for Static Malware Detection", asks for a detector that decides from the bytes alone, stays small, and still holds up on malware families it has never seen.',
      },
      {
        label: 'What I built',
        body: 'Each Windows PE file becomes a 64×64 byte-image laid along a Hilbert curve, combining byte values, local entropy and PE section metadata with a learned byte embedding. A 114,485-parameter attention CNN scores it, and a calibrated threshold turns that score into a verdict at a target false-positive rate.',
      },
      {
        label: 'The result',
        body: '0.988 ROC-AUC at a 1.14% false-positive rate on family-disjoint evaluation, from a 0.48 MB model that scores a file in under 5 ms on a CPU. The paper was accepted for presentation at the 2nd International Conference on Artificial Intelligence for Learning and Optimization (ICoAILO 2026).',
      },
    ],
  },
  {
    slug: 'btardew-walley',
    title: 'Btardew Walley',
    summary:
      'A terminal farming and livestock simulation in Java, re-engineered into an MVVM codebase built on eight classic design patterns.',
    // The repo README lists a five-person group (Code Reengineering final project).
    role: 'Developer, team of five',
    year: 2026,
    category: 'Terminal game',
    stack: ['Java', 'OOP', 'Design Patterns', 'MVVM'],
    links: {
      repos: [{ label: 'View source', href: 'https://github.com/BryanWidjaja/BtardewWalley-Refactored' }],
    },
    // TODO(owner): replace the three "replace with" boxes below with terminal screenshots.
    cover: {
      src: '/placeholders/btardew-walley/cover-1600.webp',
      alt: 'Placeholder: replace with a terminal screenshot of the game.',
      width: 1600,
      height: 1000,
    },
    gallery: [
      {
        src: '/placeholders/btardew-walley/gallery-1-1600.webp',
        alt: 'Placeholder: replace with a terminal screenshot of the plant farm map.',
        width: 1200,
        height: 900,
        caption: 'The plant farm, crops mid-cycle',
      },
      {
        src: '/placeholders/btardew-walley/gallery-2-1600.webp',
        alt: 'Placeholder: replace with a terminal screenshot of a store or the inventory.',
        width: 900,
        height: 1200,
        caption: 'Store and inventory menus',
      },
    ],
    sections: [
      {
        label: 'The problem',
        body: 'Btardew Walley started as a working console game. For our Code Reengineering final project, the job was to keep every feature and give the code a structure the next person could actually extend.',
      },
      {
        label: 'What we built',
        body: 'User accounts, tile-based maps, a day cycle, crop and animal lifecycles, a stores-and-inventory economy and file-based saves. The codebase is split into model, view, viewmodel, service and repository layers: 111 classes across 32 packages.',
      },
      {
        label: 'The patterns',
        body: 'Eight Gang of Four patterns, each where it earns its place: Facade, Strategy, Command, Builder, Factory Method, Template Method, Iterator and Composite.',
      },
    ],
  },
  {
    slug: 'instatags',
    title: 'InstaTags',
    summary:
      'An AI-powered Instagram hashtag generator. Upload a photo on the web, or grab one straight from Instagram with the Chrome extension, and copy the tags it suggests.',
    role: 'Frontend and Chrome extension',
    year: 2026,
    category: 'Web app + extension',
    stack: ['SvelteKit', 'TypeScript', 'Tailwind CSS', 'Chrome Extensions'],
    links: {
      repos: [
        { label: 'Frontend source', href: 'https://github.com/InstaTags/FrontEnd' },
        { label: 'Extension source', href: 'https://github.com/InstaTags/ChromeExtension' },
      ],
    },
    // TODO(owner): replace the three "replace with" boxes below with screenshots.
    cover: {
      src: '/placeholders/instatags/cover-1600.webp',
      alt: 'Placeholder: replace with a screenshot of the InstaTags landing page.',
      width: 1600,
      height: 1000,
    },
    gallery: [
      {
        src: '/placeholders/instatags/gallery-1-1600.webp',
        alt: 'Placeholder: replace with the upload page showing generated hashtags.',
        width: 1200,
        height: 900,
        caption: 'Upload flow with generated hashtags',
      },
      {
        src: '/placeholders/instatags/gallery-2-1600.webp',
        alt: 'Placeholder: replace with the Chrome extension popup open over an Instagram post.',
        width: 900,
        height: 1200,
        caption: 'The extension popup on Instagram',
      },
    ],
    sections: [
      {
        label: 'The problem',
        body: 'Picking hashtags for a post is mostly guesswork. InstaTags looks at the image itself and suggests tags that match what is in it.',
      },
      {
        label: 'The web app',
        body: 'The SvelteKit site: a landing page, the image upload flow, usage guides and product pages, built from reusable Svelte components with TypeScript, Tailwind CSS and Siema carousels.',
      },
      {
        label: 'The extension',
        body: 'A Manifest V3 Chrome extension that pulls the image from the active Instagram tab with the Chrome Scripting API, sends it to the hashtag-generation API and shows the tags ready to copy.',
      },
    ],
  },
]
