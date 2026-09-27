import { forwardRef, type FocusEvent, type MouseEvent, type PointerEvent } from 'react'
import { Link, useLocation, type LinkProps } from 'react-router-dom'
import { useTransitionNavigate } from '../app/TransitionProvider'

type TransitionLinkProps = LinkProps & {
  /** Cursor label to show on hover/focus (12-motion.md §Cursor). */
  cursor?: 'open' | 'next'
}

function hasScheme(to: string) {
  return /^[a-z][a-z0-9+.-]*:/i.test(to)
}

function centerOf(el: HTMLElement) {
  const rect = el.getBoundingClientRect()
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}

function pathnameOf(to: string) {
  const hashIndex = to.indexOf('#')
  return hashIndex === -1 ? to : to.slice(0, hashIndex) || '/'
}

// 46-polish-plan.md item 3(e): diagnosis found two SERIAL round trips inside
// every swap -- vite-react-ssg's own client loader (transformStaticLoaderRoute
// in node_modules/vite-react-ssg/dist/index.mjs) fetches a shared manifest,
// then the destination route's own JSON, and only starts either once
// `navigate()` has already committed to the swap. Both writes land in the
// exact same `window` globals that loader reads, keyed the same way
// (manifest by pathname, data by pathname again) -- so warming them here,
// before the click, makes the real loader's own guards (`if
// (!window.__VITE_REACT_SSG_..._) `) see a hit and skip the network
// entirely. Dev serves loader data over a different path (a `_data=`
// query against the dev server) and never sets `__VITE_REACT_SSG_HASH__`,
// so this silently no-ops there (both globals are typed non-optional by
// vite-react-ssg's own `declare global` -- real in dev too, just unset). No
// public prefetch API exists for this -- if vite-react-ssg's internals
// change, this degrades to doing nothing, same as today.
let manifestPromise: Promise<Record<string, string> | null> | null = null
const prefetchedPaths = new Set<string>()

function loadManifest(): Promise<Record<string, string> | null> {
  if (window.__VITE_REACT_SSG_STATIC_LOADER_MANIFEST__) {
    return Promise.resolve(window.__VITE_REACT_SSG_STATIC_LOADER_MANIFEST__)
  }
  if (!manifestPromise) {
    const hash = window.__VITE_REACT_SSG_HASH__
    manifestPromise = hash
      ? fetch(`/static-loader-data-manifest-${hash}.json`)
          .then((res) => res.json())
          .then((json) => {
            window.__VITE_REACT_SSG_STATIC_LOADER_MANIFEST__ = json
            return json
          })
          .catch(() => null)
      : Promise.resolve(null)
  }
  return manifestPromise
}

function prefetchLoaderData(pathname: string) {
  if (!window.__VITE_REACT_SSG_HASH__ || prefetchedPaths.has(pathname)) return
  prefetchedPaths.add(pathname)
  loadManifest().then((manifest) => {
    const dataFilePath = manifest?.[pathname]
    if (!dataFilePath || window.__VITE_REACT_SSG_STATIC_LOADER_DATA__?.[pathname]) return
    fetch(`/${dataFilePath}`)
      .then((res) => res.json())
      .then((json) => {
        window.__VITE_REACT_SSG_STATIC_LOADER_DATA__ ??= {}
        window.__VITE_REACT_SSG_STATIC_LOADER_DATA__[pathname] = json
      })
      .catch(() => {})
  })
}

/**
 * 01-spec.md §8 edge cases: a modifier key, a non-left click, an explicit
 * `target`, a `download`, or a scheme (mailto:, tel:, http(s):// …) all
 * fall through to the browser/RR's own `Link` handling untouched.
 */
export const TransitionLink = forwardRef<HTMLAnchorElement, TransitionLinkProps>(function TransitionLink(
  { cursor, onClick, onPointerEnter, onFocus, to, ...props },
  ref,
) {
  const navigate = useTransitionNavigate()
  const location = useLocation()

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e)
    if (e.defaultPrevented || typeof to !== 'string') return
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    if (props.target || props.download !== undefined || hasScheme(to)) return
    e.preventDefault()
    // 45 §Storyboards "0 click → ink seeds at the pointer (keyboard:
    // element centre)". A keyboard-activated click (Enter/Space on an <a>)
    // is a real, trusted MouseEvent but carries clientX/Y = 0,0 and
    // detail = 0 — the standard way to tell it apart from an actual click.
    const origin = e.detail === 0 ? centerOf(e.currentTarget) : { x: e.clientX, y: e.clientY }
    navigate(to, { origin })
  }

  function maybePrefetch() {
    if (typeof to !== 'string' || hasScheme(to) || props.target || props.download !== undefined) return
    const pathname = pathnameOf(to)
    if (pathname !== location.pathname) prefetchLoaderData(pathname)
  }

  function handlePointerEnter(e: PointerEvent<HTMLAnchorElement>) {
    onPointerEnter?.(e)
    maybePrefetch()
  }

  function handleFocus(e: FocusEvent<HTMLAnchorElement>) {
    onFocus?.(e)
    maybePrefetch()
  }

  return (
    <Link
      ref={ref}
      to={to}
      onClick={handleClick}
      onPointerEnter={handlePointerEnter}
      onFocus={handleFocus}
      data-cursor={cursor ? 'text' : undefined}
      data-cursor-text={cursor}
      {...props}
    />
  )
})
