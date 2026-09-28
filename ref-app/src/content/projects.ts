// Content: the owner's CV (2026-09-28) and each project's own repository
// (the links the CV underlines), replacing the copy deck's invented
// projects. Words are the CV's own where it has them, filled out from the
// repo READMEs and code, never beyond what either one states.
// Content model: spec §3 (notes/prompts/portfolio-build/01-spec.md).
//
// Every image is real output from the project itself -- screenshots of the
// running app or game, or figures built from the repo's own code and the
// paper's published numbers (scripts/project-images.mjs lists the source
// of each). `TODO(owner)` marks the few strings the CV didn't settle.

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
    cover: {
      src: '/projects/malware-detection/cover-1600.webp',
      alt: "The byte channel of a benign Windows executable (w64.exe) as the detector sees it: a 64 by 64 grid of bytes laid along a Hilbert curve, shaded light to dark blue by value.",
      width: 1600,
      height: 1000,
    },
    gallery: [
      {
        src: '/projects/malware-detection/gallery-1-1600.webp',
        // The alt carries every value: it doubles as the chart's table view.
        alt: 'Bar charts comparing the proposed CNN with SqueezeNet and MobileNetV2 on the family-disjoint split. Accuracy 85.7% against 79.3% and 78.5%. Malware recall 81.1% against 71.2% and 72.0%. ROC-AUC 0.988 against 0.959 and 0.968. False-positive rate 1.14% against 0.43% and 2.00%. Parameters 114K against 392K and 251K. CPU latency 4.68 ms against 8.33 and 10.42 ms. No difference is statistically significant at five folds.',
        width: 1200,
        height: 900,
        caption: 'Paper results against two standard backbones',
      },
      {
        src: '/projects/malware-detection/gallery-2-1600.webp',
        alt: "The same executable's three input channels, as computed by the repo's own preprocessing: byte value, block entropy, and PE section type (code, initialized data, headers).",
        width: 900,
        height: 1200,
        caption: 'One executable, three input channels',
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
    cover: {
      src: '/projects/btardew-walley/cover-1600.webp',
      alt: "Terminal screenshot of Btardew Walley's Home map: ASCII-art houses, the player marked P, and a side panel showing day 1, $1,000 and the key bindings.",
      width: 1600,
      height: 1000,
    },
    gallery: [
      {
        src: '/projects/btardew-walley/gallery-1-1600.webp',
        alt: 'Terminal screenshot of the Plant Farm on day 4: ripe wheat shown as a capital W beside beetroot still growing as a lowercase b.',
        width: 1200,
        height: 900,
        caption: 'The plant farm on day 4, wheat ripe and beetroot still growing',
      },
      {
        src: '/projects/btardew-walley/gallery-2-1600.webp',
        alt: 'Terminal screenshot of the Buy Tools store: bucket $1,000, shears $1,500, hoe $3,000.',
        width: 900,
        height: 1200,
        caption: 'The tool store',
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
    cover: {
      src: '/projects/instatags/cover-1600.webp',
      alt: "The InstaTags landing page: 'Save time on tags. Spend it on content.' above Try Now and Install for Chrome buttons.",
      width: 1600,
      height: 1000,
    },
    gallery: [
      {
        src: '/projects/instatags/gallery-1-1600.webp',
        alt: 'The InstaTags upload page, with its drag-and-drop image area and Browse Files button.',
        width: 1200,
        height: 900,
        caption: 'The upload page',
      },
      {
        src: '/projects/instatags/gallery-2-1600.webp',
        alt: 'The InstaTags Chrome extension popup: a Get Tags button above an empty Tags Generated panel with a copy button.',
        width: 900,
        height: 1200,
        caption: 'The Chrome extension popup',
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
