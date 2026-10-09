import { useState } from 'react'
import { Icon } from './Icon'
import { site } from '../content/site'

type EmailCopyProps = {
  email: string
  size: 'md' | 'lg'
}

const sizeClasses: Record<'md' | 'lg', string> = {
  md: 'text-title',
  // 11-layout.md §Global: text-xl at 390 (text-title would overflow the
  // 342px column with the icon), text-title once the footer has room.
  lg: 'text-xl lg:text-title',
}

// D5: copy button with feedback, falling back to mailto on failure.
export function EmailCopy({ email, size }: EmailCopyProps) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle')

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(email)
      setStatus('copied')
    } catch {
      setStatus('failed')
      window.location.href = `mailto:${email}`
    }
    window.setTimeout(() => setStatus('idle'), 2000)
  }

  const announcement =
    status === 'copied'
      ? site.footer.copiedAnnouncement
      : status === 'failed'
        ? site.footer.copyFailureAnnouncement
        : ''

  return (
    <span className="relative inline-flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={handleCopy}
        data-cursor="text"
        data-cursor-text={status === 'copied' ? site.cursor.copied : site.cursor.copy}
        className={`group inline-flex items-center gap-2 underline decoration-2 underline-offset-4 transition-transform duration-[120ms] ease-dry active:scale-[0.99] [overflow-wrap:anywhere] ${sizeClasses[size]}`}
      >
        {email}
        {status === 'copied' ? (
          <Icon name="Check" aria-hidden="true" weight="bold" className="size-[0.7em] shrink-0" />
        ) : (
          <Icon name="Copy" aria-hidden="true" weight="bold" className="size-[0.7em] shrink-0" />
        )}
      </button>
      {status === 'copied' ? (
        <span className="rounded-full bg-line/20 px-3 py-1 text-small text-ink">{site.footer.copiedLabel}</span>
      ) : null}
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </span>
  )
}
