const PLACEHOLDER_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='

function pictureOf(target: HTMLElement) {
  return target instanceof HTMLImageElement ? target.closest('picture') ?? target : target
}

function observedElement(target: HTMLElement) {
  return target.closest<HTMLElement>('[data-reveal="scroll"]') ?? target.querySelector<HTMLImageElement>('img') ?? target
}

function isReady(target: HTMLElement) {
  return pictureOf(target).dataset.deferredImageReady === 'true'
}

function activate(target: HTMLElement) {
  const picture = pictureOf(target)
  if (picture.dataset.deferredImageReady === 'true') return
  for (const source of picture.querySelectorAll<HTMLSourceElement>('source[data-srcset]')) {
    const sizes = source.dataset.sizes
    const srcSet = source.dataset.srcset
    if (sizes) source.sizes = sizes
    if (srcSet) source.srcset = srcSet
    delete source.dataset.sizes
    delete source.dataset.srcset
  }
  const image = target instanceof HTMLImageElement ? target : picture.querySelector<HTMLImageElement>('img[data-src]')
  if (image) {
    const sizes = image.dataset.sizes
    const srcSet = image.dataset.srcset
    const src = image.dataset.src
    if (sizes) image.sizes = sizes
    if (srcSet) image.srcset = srcSet
    if (src) image.src = src
    delete image.dataset.sizes
    delete image.dataset.srcset
    delete image.dataset.src
  }
  picture.dataset.deferredImageReady = 'true'
  delete picture.dataset.deferredImage
}

/** Hydration-safe source activation: keep responsive sources dormant in SSR,
 * then activate visible art immediately and below-fold art only when it
 * enters a controlled near-viewport margin. */
export function observeNearViewportImages(root: HTMLElement, rootMargin = '220px 0px') {
  const pending = Array.from(root.querySelectorAll<HTMLElement>('[data-deferred-image]'))
  if (pending.length === 0) return () => {}
  let observer: IntersectionObserver | undefined

  function activateVisible() {
    for (const image of pending) {
      if (isReady(image)) continue
      const rect = observedElement(image).getBoundingClientRect()
      if (rect.bottom > 0 && rect.top < window.innerHeight) activate(image)
    }
  }

  activateVisible()
  if ('IntersectionObserver' in window) {
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const targets = pending.filter((image) => observedElement(image) === entry.target)
        targets.forEach(activate)
        observer?.unobserve(entry.target)
      }
    }, { rootMargin })
    pending.filter((image) => !isReady(image)).forEach((image) => observer?.observe(observedElement(image)))
  } else {
    // Content is preferable to an indefinitely blank image on older engines.
    pending.filter((image) => !isReady(image)).forEach(activate)
  }

  return () => {
    observer?.disconnect()
  }
}

export function deferredImagePlaceholder() {
  return PLACEHOLDER_PIXEL
}
