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
  /** Optional caption. Not part of the spec §3 `Img` type, and unused by `ProjectCollage` (52 §Item 4: tiles carry only their own `alt`) -- kept as authored reference copy. */
  caption?: string
  /**
   * 51-round5-plan.md §E3/45 R5c: light or dark surface at this image's own
   * crop, read straight off the master (paper background = light, terminal
   * or dark-theme UI = dark). Agent E4's monogram tone registry keys off
   * this field wherever the image sits under the fixed header. Optional on
   * the shared `Img` type only because content/about.ts's placeholder
   * portrait (not a project image, not under the fixed header the same
   * way) predates it -- every image below in `projects` sets it.
   */
  tone?: 'light' | 'dark'
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
  /**
   * 51-round5-plan.md §E3, 45 R5c, 52 §Item 4: the project-page collage's
   * secondary tiles (the "2x2" of layout 4A). The hero tile is `cover`
   * (or, on the malware-detection page, E2's `ProjectVideo`, wired in
   * ProjectDetail.tsx) -- never part of this array. Five real images per
   * project is the target; fewer only when a capture genuinely could not
   * be produced (52 §Item 4, InstaTags without a runnable backend/build
   * step in this sandbox -- see the round-5 report).
   */
  collage: Img[]
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
      alt: "Three real input channels of one benign Windows executable (w64.exe, 101,888 bytes): byte value, block entropy and PE section type.",
      width: 1600,
      height: 1000,
      tone: 'light',
    },
    // Hero tile (ProjectDetail.tsx) is E2's <ProjectVideo>, not this array
    // -- the malware trailer, muted-loop-first. These four are the
    // collage's 2x2.
    collage: [
      {
        // Same master as `cover` above (51 §E5, R5e: the home card's cover
        // was replaced with the album-leaves image -- this collage tile
        // reuses that same file by design, so its alt was updated to match
        // rather than describing the byte channel alone it no longer is).
        src: '/projects/malware-detection/cover-1600.webp',
        alt: "Three real input channels of one benign Windows executable (w64.exe, 101,888 bytes): byte value, block entropy and PE section type.",
        width: 1600,
        height: 1000,
        tone: 'light',
      },
      {
        src: '/projects/malware-detection/gallery-1-1600.webp',
        // The alt carries every value: it doubles as the chart's table view.
        alt: 'Bar charts comparing the proposed CNN with SqueezeNet and MobileNetV2 on the family-disjoint split. Accuracy 85.7% against 79.3% and 78.5%. Malware recall 81.1% against 71.2% and 72.0%. ROC-AUC 0.988 against 0.959 and 0.968. False-positive rate 1.14% against 0.43% and 2.00%. Parameters 114K against 392K and 251K. CPU latency 4.68 ms against 8.33 and 10.42 ms. No difference is statistically significant at five folds.',
        width: 1200,
        height: 900,
        caption: 'Paper results against two standard backbones',
        tone: 'light',
      },
      {
        src: '/projects/malware-detection/gallery-2-1600.webp',
        alt: "The same file's three input channels with their legends: byte value, block entropy, and PE section type.",
        width: 900,
        height: 1200,
        caption: 'One executable, three input channels',
        tone: 'light',
      },
      {
        src: '/projects/malware-detection/gallery-3-1600.webp',
        // A still pulled from the trailer itself (ffmpeg, no re-render):
        // a batch of five held-out byte-images the paper's demo scores,
        // outlined in red where the detector flags one malicious.
        alt: "A trailer frame: five held-out byte-images, four outlined blue and one red for a malicious verdict, with 82.26% recall beneath.",
        width: 1280,
        height: 720,
        caption: 'One frame from the trailer: the detector scoring a held-out batch',
        tone: 'dark',
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
      alt: "Btardew Walley's Plant Farm on day 4: ripe wheat (W) beside growing beetroot (b), the player (P), and the day and keybinds panel.",
      width: 1600,
      height: 1000,
      tone: 'light',
    },
    // Round 6 (58 §F2, R6d/R6e): the whole 4B ink-print family was
    // recaptured -- the compiled game driven live over stdin again (dev
    // mode's own commands, `registry/DevModeCommandRegistry.java`), every
    // feature its views expose visited fresh, each screen's raw text
    // re-typeset the same way the kept woodblock `cover` was: monospace
    // `#141a1e` on `#F2ECDE`, one 1600x1000 canvas, one font size, tight
    // centred crop, no baked captions, no fake window chrome -- replacing
    // round 5's dark terminal-window mockups below. Ordered by importance
    // (R6e): home map, animal farm, inventory, a store.
    //
    // Round 6, agent F2b (58 §F2 "cover every feature"): the owner's
    // correction that the image list is hero + four most important +
    // *every remaining feature*, not a cap of five -- gallery-5..12 below
    // add the rest of what the game's views expose (planting, the grown
    // crop, animal harvest, the farm/seed and animal stores, sleep/day,
    // the login/register menu, the tutorial), captured in one fresh
    // playthrough with the same JDK 21 build and re-typeset the same way.
    // Line pitch is 34px here (vs the four above's 40px) -- still one
    // Consolas 30px, just tighter leading, the minimum needed to fit the
    // tutorial's first page (27 real lines) on the fixed 1600x1000 canvas
    // without shrinking the font or cropping real content.
    collage: [
      {
        src: '/projects/btardew-walley/gallery-1-1600.webp',
        alt: "The Home map on day 1: the player (P) below the farm buildings, with the day and money panel.",
        width: 1600,
        height: 1000,
        caption: 'The home map',
        tone: 'light',
      },
      {
        src: '/projects/btardew-walley/gallery-2-1600.webp',
        alt: "The Animal Farm map: nine animals, three each of chicken, sheep and cow, with the player (P) and the day and money panel.",
        width: 1600,
        height: 1000,
        caption: 'The animal farm',
        tone: 'light',
      },
      {
        src: '/projects/btardew-walley/gallery-3-1600.webp',
        alt: "The Inventory menu: animal products, farm products, animals, tools and plant seeds.",
        width: 1600,
        height: 1000,
        caption: 'The inventory menu',
        tone: 'light',
      },
      {
        src: '/projects/btardew-walley/gallery-4-1600.webp',
        alt: "The Buy Tools store: Bucket $1,000, Shears $1,500, Hoe $3,000.",
        width: 1600,
        height: 1000,
        caption: 'The tool store',
        tone: 'light',
      },
      // Round 6 (58 §F2b): the owner's "cover every feature" correction --
      // hero, the four most important (kept above, same order), then every
      // remaining feature the game's views expose, re-typeset the same
      // way from a fresh live playthrough (dev-mode teleport + BFS-routed
      // walks over the grids decoded from GameMaps.java, one input at a
      // time). Ordered by gameplay importance.
      {
        src: '/projects/btardew-walley/gallery-5-1600.webp',
        alt: "The plant prompt on an empty tile: choose Wheat or Beetroot to plant.",
        width: 1600,
        height: 1000,
        caption: 'Planting a seed',
        tone: 'light',
      },
      {
        src: '/projects/btardew-walley/gallery-6-1600.webp',
        alt: "The Plant Farm after twenty days: a ripe wheat tile (W) beside the player.",
        width: 1600,
        height: 1000,
        caption: 'A ripe crop, ready to harvest',
        tone: 'light',
      },
      {
        src: '/projects/btardew-walley/gallery-7-1600.webp',
        alt: "The animal harvest prompt: “Want to take Chicken3's Egg?” with Take and Don't take.",
        width: 1600,
        height: 1000,
        caption: 'Taking an animal product',
        tone: 'light',
      },
      {
        src: '/projects/btardew-walley/gallery-8-1600.webp',
        alt: "The Buy Seeds table: Wheat and Beetroot with their growth time and price.",
        width: 1600,
        height: 1000,
        caption: 'The farm and seed store',
        tone: 'light',
      },
      {
        src: '/projects/btardew-walley/gallery-9-1600.webp',
        alt: "The Buy Farm Animals table: Chicken, Cow and Sheep with their harvest rate and price.",
        width: 1600,
        height: 1000,
        caption: 'The animal store',
        tone: 'light',
      },
      {
        src: '/projects/btardew-walley/gallery-10-1600.webp',
        alt: "The sleep prompt, “Do you want to sleep? [y/n]”, which advances the day.",
        width: 1600,
        height: 1000,
        caption: 'Sleep and the day cycle',
        tone: 'light',
      },
      {
        src: '/projects/btardew-walley/gallery-11-1600.webp',
        alt: "The main menu: the game's ASCII banner over Login, Register, Tutorial and Exit.",
        width: 1600,
        height: 1000,
        caption: 'The login and register menu',
        tone: 'light',
      },
      {
        src: '/projects/btardew-walley/gallery-12-1600.webp',
        alt: "The tutorial's first page, “Getting Started”, page 1 of 8.",
        width: 1600,
        height: 1000,
        caption: 'The tutorial',
        tone: 'light',
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
    // Round 6 (58 §F2, R6c/R6d/R6e): the popup is the renewed extension
    // (`instatags-ChromeExtension-Renewed`), rendered at its own native
    // 352x416 (22 x 26rem) and mounted in the same framed paper field the
    // previous cover used. The FrontEnd repo's `npm install` + `npm run
    // dev` (owner-approved, 45 R6d) succeeded in a scratch dir outside the
    // repo, so the web pages below are the real running SvelteKit site.
    cover: {
      src: '/projects/instatags/cover-1600.webp',
      alt: "The InstaTags Chrome extension popup, idle, with its Get Tags button.",
      width: 1600,
      height: 1000,
      tone: 'light',
    },
    // Ordered by importance (R6e): landing, upload, extension loading,
    // how-to-use, then round 6b's three additions. The result screen is
    // skipped throughout (owner: no backend) -- never the `output.json`
    // fixture, never invented tags.
    //
    // Round 6 (58 §F2b) fixed two flaws in the round-6 set: gallery-4 (how
    // to use) had been captured mid-carousel, Step 6 before Step 1 and
    // cards sliced at both edges -- a real bug in the vendored Carousel's
    // own mount effect (it clones extra slides into the DOM *after* Siema
    // already computed its initial transform, permanently offsetting it
    // by one cloneCount). Recaptured after one real click of the
    // carousel's own "next" control, which lands on the same offset the
    // component's manual clone-insertion introduces, giving the correct
    // reading order (Step 1 first) with no card cut -- the frame is
    // narrower than the other web captures (1043 vs 1440) because that is
    // the widest crop with zero mid-card cuts at this viewport. gallery-3
    // (extension loading) was the bare popup capture, not in the paper
    // mount the cover uses -- both it and the new toast below are now
    // mounted the same way as `cover` (thin ink border, wide paper
    // field), with no baked caption on either.
    collage: [
      {
        src: '/projects/instatags/gallery-1-1600.webp',
        alt: "The InstaTags landing page: “Save time on tags. Spend it on content.” with Try Now and Install for Chrome.",
        width: 1440,
        height: 900,
        caption: 'The landing page',
        tone: 'dark',
      },
      {
        src: '/projects/instatags/gallery-2-1600.webp',
        alt: "The InstaTags upload page, with a drag-and-drop area and a Browse Files button.",
        width: 1440,
        height: 900,
        caption: 'The upload page',
        tone: 'dark',
      },
      {
        src: '/projects/instatags/gallery-3-1600.webp',
        alt: "The extension popup loading: a spinner and “Getting tags...”.",
        width: 1600,
        height: 1000,
        caption: 'The extension, loading',
        tone: 'light',
      },
      {
        src: '/projects/instatags/gallery-4-1600.webp',
        alt: "The How To Use page, extension tab: steps 1 to 3.",
        width: 1043,
        height: 900,
        caption: 'How to use it',
        tone: 'dark',
      },
      {
        src: '/projects/instatags/gallery-5-1600.webp',
        alt: "The extension popup's error toast: “Image not found on this page.”",
        width: 1600,
        height: 1000,
        caption: 'The extension, no image found',
        tone: 'light',
      },
      {
        src: '/projects/instatags/gallery-6-1600.webp',
        alt: "The About Us page: the mission statement over its usage stats.",
        width: 1440,
        height: 900,
        caption: 'The about us page',
        tone: 'dark',
      },
      {
        src: '/projects/instatags/gallery-7-1600.webp',
        alt: "The thank-you page, “Thank You For Joining Us”, with Learn How to Use and Support Us buttons.",
        width: 1440,
        height: 900,
        caption: 'The thank-you page',
        tone: 'dark',
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
