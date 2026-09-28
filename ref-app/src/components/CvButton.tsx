import { DownloadSimple } from '@phosphor-icons/react'
import { site } from '../content/site'

type CvButtonProps = {
  /** `ink`: a solid dark-ink pill for the paper nav. `paper`: a paper
   * outline for the dark menu panel, filling to paper on hover. */
  tone?: 'ink' | 'paper'
  className?: string
}

const tones = {
  // --color-ink-dark, the same fill as the nav's burger; paper text 11.34:1.
  ink: 'border-ink-dark bg-ink-dark text-background pointer-fine:hover:border-ink pointer-fine:hover:bg-ink focus-visible:bg-ink',
  paper:
    'border-line text-background pointer-fine:hover:border-background pointer-fine:hover:bg-background pointer-fine:hover:text-ink focus-visible:bg-background focus-visible:text-ink',
} as const

// Owner, 2026-09-28: a CV download button in the nav (and the menu panel,
// where the nav's links collapse to on scroll and on phones). One compact
// pill -- the short label plus a download glyph that dips on hover, as a
// plain `<a download>` so it saves the PDF under `site.resumeFileName`
// instead of navigating. Renders nothing if the CV is switched off.
export function CvButton({ tone = 'ink', className = '' }: CvButtonProps) {
  if (!site.resumeAvailable) return null
  return (
    <a
      href={site.resumeUrl}
      download={site.resumeFileName}
      aria-label={site.cvButton.ariaLabel}
      className={`group label inline-flex h-9 items-center gap-1.5 rounded-full border px-4 transition-[background-color,border-color,color] duration-[200ms] ease-dry ${tones[tone]} ${className}`.trim()}
    >
      <span>{site.cvButton.label}</span>
      <DownloadSimple
        aria-hidden="true"
        weight="bold"
        className="size-3.5 shrink-0 transition-transform duration-[200ms] ease-dry pointer-fine:group-hover:translate-y-0.5 group-focus-visible:translate-y-0.5 motion-reduce:translate-y-0!"
      />
    </a>
  )
}
