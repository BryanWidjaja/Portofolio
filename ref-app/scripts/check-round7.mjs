#!/usr/bin/env node
import { chromium } from 'playwright'
import { preview } from 'vite'

const failures = []
function check(name, pass, detail = '') {
  console.log(`[check-round7] ${pass ? 'PASS' : 'FAIL'}  ${name}${pass || !detail ? '' : `  ${detail}`}`)
  if (!pass) failures.push(name)
}

async function inspectCompleteImage(page, selector) {
  const image = page.locator(selector).first()
  await image.scrollIntoViewIfNeeded()
  await page.waitForFunction((target) => {
    const element = document.querySelector(target)
    return element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0 && element.naturalHeight > 0
  }, selector)
  await image.evaluate(async (element) => {
    await element.decode()
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  })
  return image.evaluate((element) => {
    if (!(element instanceof HTMLImageElement)) return null
    const rect = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    const sourceAspect = element.naturalWidth / element.naturalHeight
    const boxAspect = rect.width / rect.height
    const paintedWidth = style.objectFit === 'contain' && sourceAspect > boxAspect ? rect.width : rect.height * sourceAspect
    const paintedHeight = style.objectFit === 'contain' && sourceAspect > boxAspect ? rect.width / sourceAspect : rect.height
    const painted = {
      left: rect.left + (rect.width - paintedWidth) / 2,
      right: rect.right - (rect.width - paintedWidth) / 2,
      top: rect.top + (rect.height - paintedHeight) / 2,
      bottom: rect.bottom - (rect.height - paintedHeight) / 2,
    }
    const clippingAncestors = []
    let ancestor = element.parentElement
    while (ancestor && ancestor !== document.body) {
      const ancestorStyle = getComputedStyle(ancestor)
      if ([ancestorStyle.overflow, ancestorStyle.overflowX, ancestorStyle.overflowY].some((value) => value === 'hidden' || value === 'clip')) {
        const clip = ancestor.getBoundingClientRect()
        clippingAncestors.push({
          tag: ancestor.tagName,
          survives: painted.left >= clip.left - 1 && painted.right <= clip.right + 1 && painted.top >= clip.top - 1 && painted.bottom <= clip.bottom + 1,
        })
      }
      ancestor = ancestor.parentElement
    }
    return {
      complete: element.complete,
      naturalWidth: element.naturalWidth,
      naturalHeight: element.naturalHeight,
      objectFit: style.objectFit,
      sourceAspect,
      boxAspect,
      paintedWidth,
      paintedHeight,
      clippingAncestors,
      fullPaintedFrameVisible: paintedWidth > 0 && paintedHeight > 0 && clippingAncestors.every((item) => item.survives),
    }
  })
}

async function main() {
  const server = await preview({ root: process.cwd(), preview: { port: 4187, strictPort: true } })
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    await page.goto('http://localhost:4187/projects/instatags', { waitUntil: 'networkidle' })
    const collage = await inspectCompleteImage(page, '[data-collage-tile] img')
    check(
      'decoded project side previews preserve their complete painted source frame through clipping ancestors',
      Boolean(collage && collage.complete && collage.naturalWidth > 0 && collage.naturalHeight > 0 && collage.objectFit === 'contain' && collage.fullPaintedFrameVisible),
      JSON.stringify(collage),
    )

    await page.goto('http://localhost:4187/', { waitUntil: 'networkidle' })
    const home = await inspectCompleteImage(page, '[data-brush] img')
    check(
      'decoded home scroll artwork preserves its complete painted cover frame through the reveal mask',
      Boolean(home && home.complete && home.naturalWidth > 0 && home.naturalHeight > 0 && home.objectFit === 'contain' && home.fullPaintedFrameVisible),
      JSON.stringify(home),
    )

    await page.goto('http://localhost:4187/about', { waitUntil: 'networkidle' })
    const portraitSources = await page.locator('.brush-colour').evaluate((image) => ({
      tag: image.tagName,
      src: image.getAttribute('src'),
      srcSet: image.getAttribute('srcset'),
      hasPictureSource: Boolean(image.parentElement?.querySelector('source')),
    }))
    check(
      'JPEG portrait keeps its actual source without fabricated format or width descriptors',
      portraitSources.tag === 'IMG' && portraitSources.src === '/photo.jpeg' && portraitSources.srcSet === null && !portraitSources.hasPictureSource,
      JSON.stringify(portraitSources),
    )

    const shortPage = await browser.newPage({ viewport: { width: 844, height: 390 } })
    await shortPage.goto('http://localhost:4187/projects/btardew-walley', { waitUntil: 'networkidle' })
    await shortPage.locator('[data-collage-trigger]').first().click()
    const shortState = await shortPage.evaluate(() => {
      const selectors = ['[data-lightbox-counter]', '[aria-label="Close"]', '[aria-label="Previous photo"]', '[aria-label="Next photo"]']
      const rects = selectors.map((selector) => document.querySelector(selector)?.getBoundingClientRect() ?? null)
      const viewportFits = rects.every((rect) => rect && rect.top >= 0 && rect.left >= 0 && rect.bottom <= innerHeight && rect.right <= innerWidth)
      const image = document.querySelector('[data-lightbox] figure img')?.getBoundingClientRect()
      return { viewportFits, rects, image: image ? { top: image.top, bottom: image.bottom } : null, height: innerHeight }
    })
    check(
      'short landscape viewer keeps counter and all controls in the viewport without covering the media stage',
      Boolean(shortState.viewportFits && shortState.image && shortState.image.top >= 56 && shortState.image.bottom <= shortState.height - 72),
      JSON.stringify(shortState),
    )
    await shortPage.close()

    const thumbsPage = await browser.newPage({ viewport: { width: 390, height: 844 } })
    await thumbsPage.goto('http://localhost:4187/projects/btardew-walley', { waitUntil: 'networkidle' })
    await thumbsPage.locator('[data-collage-trigger]').first().click()
    await thumbsPage.keyboard.press('ArrowLeft')
    await thumbsPage.waitForFunction(() => {
      const strip = document.querySelector('[data-lightbox-thumbnails]')
      const active = strip?.querySelector('[aria-current="true"]')
      if (!(strip instanceof HTMLElement) || !(active instanceof HTMLElement)) return false
      const stripRect = strip.getBoundingClientRect()
      const activeRect = active.getBoundingClientRect()
      return activeRect.left >= stripRect.left && activeRect.right <= stripRect.right
    })
    const thumbState = await thumbsPage.evaluate(() => {
      const strip = document.querySelector('[data-lightbox-thumbnails]')
      const active = strip?.querySelector('[aria-current="true"]')
      const figure = document.querySelector('[data-lightbox] figure')
      const image = figure?.querySelector('img')
      const caption = figure?.querySelector('figcaption')
      if (!(strip instanceof HTMLElement) || !(active instanceof HTMLElement) || !(figure instanceof HTMLElement) || !(image instanceof HTMLImageElement) || !(caption instanceof HTMLElement)) return null
      const stripRect = strip.getBoundingClientRect()
      const activeRect = active.getBoundingClientRect()
      const figureRect = figure.getBoundingClientRect()
      const imageRect = image.getBoundingClientRect()
      const captionRect = caption.getBoundingClientRect()
      return {
        count: strip.children.length,
        scrollLeft: strip.scrollLeft,
        activeFullyVisible: activeRect.left >= stripRect.left && activeRect.right <= stripRect.right,
        imageCentered: Math.abs((imageRect.top + imageRect.bottom) / 2 - (figureRect.top + captionRect.top) / 2) <= 3,
        imageInsideMedia: imageRect.top >= figureRect.top - 1 && imageRect.bottom <= captionRect.top + 1,
        objectFit: getComputedStyle(image).objectFit,
      }
    })
    check(
      'long viewer keeps the active last thumbnail reachable after keyboard navigation',
      Boolean(thumbState && thumbState.count === 13 && thumbState.scrollLeft > 0 && thumbState.activeFullyVisible),
      JSON.stringify(thumbState),
    )
    check(
      'mobile viewer centers the full-frame slide in the media stage above its reserved caption',
      Boolean(thumbState?.imageCentered && thumbState.imageInsideMedia && thumbState.objectFit === 'contain'),
      JSON.stringify(thumbState),
    )
    await thumbsPage.close()

    const reducedPage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
    await reducedPage.goto('http://localhost:4187/projects/btardew-walley', { waitUntil: 'networkidle' })
    await reducedPage.locator('[data-collage]').scrollIntoViewIfNeeded()
    await reducedPage.evaluate(() => document.body.style.setProperty('--round7-existing', 'keep'))
    const beforeOpen = await reducedPage.evaluate(() => ({
      y: scrollY,
      landmarkTop: document.querySelector('[data-collage]')?.getBoundingClientRect().top ?? null,
    }))
    await reducedPage.locator('[data-collage-trigger]').first().click()
    await reducedPage.mouse.wheel(0, 600)
    await reducedPage.evaluate(() => {
      const target = document.querySelector('[data-collage]') ?? document.body
      target.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [new Touch({ identifier: 7, target, clientX: 200, clientY: 600 })] }))
      target.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [new Touch({ identifier: 7, target, clientX: 200, clientY: 200 })] }))
    })
    const lockState = await reducedPage.evaluate(() => ({
      landmarkTop: document.querySelector('[data-collage]')?.getBoundingClientRect().top ?? null,
      footerInert: document.querySelector('[data-footer]')?.inert ?? false,
      footerHidden: document.querySelector('[data-footer]')?.getAttribute('aria-hidden') === 'true',
      backgroundFocusable: (() => {
        const backgroundLink = document.querySelector('[data-footer] a')
        backgroundLink?.focus()
        return Boolean(backgroundLink && document.activeElement === backgroundLink)
      })(),
    }))
    check(
      'reduced-motion viewer keeps a real background landmark fixed through wheel and touch input and makes background content inaccessible',
      beforeOpen.landmarkTop !== null && lockState.landmarkTop !== null && Math.abs(beforeOpen.landmarkTop - lockState.landmarkTop) <= 1 &&
        lockState.footerInert && lockState.footerHidden && !lockState.backgroundFocusable,
      JSON.stringify({ beforeOpen, ...lockState }),
    )
    await reducedPage.keyboard.press('Escape')
    const closeState = await reducedPage.evaluate(() => ({
      restoredY: scrollY,
      focusReturned: document.activeElement?.hasAttribute('data-collage-trigger') ?? false,
      existingStyle: document.body.style.getPropertyValue('--round7-existing'),
    }))
    const restoredY = closeState.restoredY
    check('closing the viewer restores its exact background scroll position', restoredY === beforeOpen.y, `${restoredY} vs ${beforeOpen.y}`)
    check(
      'closing the viewer returns focus to its trigger and preserves existing body styles',
      closeState.focusReturned && closeState.existingStyle === 'keep',
      JSON.stringify(closeState),
    )
    await reducedPage.close()

    const malwarePage = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    const initialVideoRequests = []
    malwarePage.on('request', (request) => {
      if (/\.(?:mp4|webm)(?:\?|$)/.test(request.url())) initialVideoRequests.push(request.url())
    })
    await malwarePage.goto('http://localhost:4187/projects/malware-detection', { waitUntil: 'networkidle' })
    const malwareHero = malwarePage.locator('[data-collage-hero] [data-collage-trigger]')
    const malwareState = await malwarePage.evaluate(() => ({
      heroIsImageTrigger: Boolean(document.querySelector('[data-collage-hero] [data-collage-trigger]')),
      visibleSideCells: document.querySelectorAll('[data-collage-tile]').length,
      overflow: document.querySelector('[data-collage-overflow]')?.textContent?.trim() ?? null,
    }))
    if (await malwareHero.count()) await malwareHero.click()
    const slideState = await malwarePage.evaluate(() => ({
      counter: document.querySelector('[data-lightbox-counter]')?.textContent ?? null,
      thumbnails: Array.from(document.querySelectorAll('[data-lightbox-thumbnails] button')).map((button) => button.getAttribute('aria-label')),
      dialogLabel: document.querySelector('[data-lightbox]')?.getAttribute('aria-label') ?? null,
    }))
    check(
      'malware presentation opens on slide 1 with exactly ten chronological slides and +5 overflow',
      malwareState.heroIsImageTrigger && malwareState.visibleSideCells === 4 && malwareState.overflow === '+5' &&
        slideState.counter === 'Photo 1 of 10' && slideState.thumbnails.length === 10 && /Slide 1/.test(slideState.dialogLabel ?? ''),
      JSON.stringify({ malwareState, slideState }),
    )
    const slideOrder = []
    for (let slide = 1; slide <= 10; slide += 1) {
      slideOrder.push(await malwarePage.locator('[data-lightbox] figure img').getAttribute('src'))
      if (slide < 10) await malwarePage.locator('[aria-label="Next photo"]').click()
    }
    check(
      'malware viewer presents the supplied slide sources in exact numeric order through slide 10',
      slideOrder.every((src, index) => new RegExp(`slide-${index + 1}-1920\\.(?:avif|webp)$`).test(src ?? '')),
      JSON.stringify(slideOrder),
    )
    const evidenceState = await malwarePage.evaluate(() => {
      const figure = document.querySelector('[data-lightbox] figure')
      const caption = figure?.querySelector('figcaption')
      const image = figure?.querySelector('img')
      const fullSize = figure?.querySelector('a')
      const region = document.querySelector('[data-lightbox-thumbnails]')
      return {
        caption: caption?.textContent?.trim() ?? '',
        fullSizeHref: fullSize?.getAttribute('href') ?? '',
        fullSizeTarget: fullSize?.getAttribute('target') ?? '',
        fullSizeName: fullSize?.getAttribute('aria-label') ?? '',
        imageSrc: image?.getAttribute('src') ?? '',
        regionRole: region?.getAttribute('role') ?? '',
        regionName: region?.getAttribute('aria-label') ?? '',
      }
    })
    check(
      'viewer exposes each slide caption, a direct full-size image, and named thumbnail navigation',
      Boolean(evidenceState.caption && evidenceState.fullSizeHref === evidenceState.imageSrc &&
        evidenceState.fullSizeTarget === '_blank' && /Open full-size image/.test(evidenceState.fullSizeName) &&
        evidenceState.regionRole === 'region' && evidenceState.regionName === 'Photo thumbnail navigation'),
      JSON.stringify(evidenceState),
    )
    const fullSizePopup = malwarePage.waitForEvent('popup')
    await malwarePage.locator('[data-lightbox] figure a').click()
    const fullSizePage = await fullSizePopup
    await fullSizePage.close()
    check('opening a full-size slide leaves the lightbox open on its current evidence', await malwarePage.locator('[data-lightbox]').isVisible())
    await malwarePage.keyboard.press('Escape')
    await malwarePage.locator('[data-lightbox]').waitFor({ state: 'detached' })
    const initialVideoDom = await malwarePage.evaluate(() => ({
      sources: document.querySelectorAll('[data-secondary-video] video source, [data-loop-video] source').length,
      watchButton: Boolean(document.querySelector('[data-secondary-video] button')),
      section: Boolean(document.querySelector('[data-secondary-video]')) || document.body.textContent.includes('Watch the earlier results trailer'),
    }))
    check(
      'malware page omits the earlier experiment trailer and all of its video sources',
      initialVideoRequests.length === 0 && initialVideoDom.sources === 0 && !initialVideoDom.watchButton && !initialVideoDom.section,
      JSON.stringify({ requests: initialVideoRequests, dom: initialVideoDom }),
    )
    await malwarePage.close()

    const footerPage = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    await footerPage.goto('http://localhost:4187/', { waitUntil: 'networkidle' })
    const ending = await footerPage.evaluate(() => {
      const footer = document.querySelector('[data-footer]')
      const contact = footer?.querySelector('[data-footer-contact]')?.getBoundingClientRect()
      const pages = footer?.querySelector('[data-footer-pages]')?.getBoundingClientRect()
      const social = footer?.querySelector('[data-footer-social]')?.getBoundingClientRect()
      const about = Array.from(document.querySelectorAll('section')).find((section) =>
        section.querySelector('a[href="/about"]') && /100[–-]120 students/.test(section.textContent ?? ''),
      )?.textContent ?? ''
      return {
        contactTop: contact?.top ?? null,
        pagesTop: pages?.top ?? null,
        socialTop: social?.top ?? null,
        about,
        footerMinHeight: footer ? getComputedStyle(footer.querySelector(':scope > div') ?? footer).minHeight : null,
      }
    })
    check(
      'desktop ending shares one top-aligned contact/Pages/Social row and presents the integrated factual profile',
      ending.contactTop !== null && ending.pagesTop !== null && ending.socialTop !== null &&
        Math.abs(ending.contactTop - ending.pagesTop) <= 2 && Math.abs(ending.pagesTop - ending.socialTop) <= 2 &&
        /BINUS University/.test(ending.about) && /100[–-]120 students/.test(ending.about) && /malware research/.test(ending.about),
      JSON.stringify(ending),
    )
    await footerPage.close()

    const tabletPage = await browser.newPage({ viewport: { width: 768, height: 1024 } })
    await tabletPage.goto('http://localhost:4187/', { waitUntil: 'networkidle' })
    const tabletEnding = await tabletPage.evaluate(() => {
      const email = document.querySelector('[data-footer-contact] button[data-cursor-text]')
      const mail = document.querySelector('[data-footer-contact] a[href^="mailto:"]')
      const about = Array.from(document.querySelectorAll('a')).find((link) => link.textContent?.trim() === 'About me')
      const textLines = (element) => {
        if (!(element instanceof HTMLElement)) return 99
        const textNode = Array.from(element.childNodes).find((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())
          ?? Array.from(element.querySelectorAll('span')).flatMap((span) => Array.from(span.childNodes)).find((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())
        if (!textNode) return 99
        const range = document.createRange()
        range.selectNodeContents(textNode)
        const tops = Array.from(range.getClientRects()).map((rect) => Math.round(rect.top))
        return new Set(tops).size
      }
      return { emailLines: textLines(email), mailLines: textLines(mail), aboutLines: textLines(about) }
    })
    check(
      'tablet ending keeps email, mail action and About pill labels on one readable line',
      tabletEnding.emailLines <= 1.2 && tabletEnding.mailLines <= 1.2 && tabletEnding.aboutLines <= 1.2,
      JSON.stringify(tabletEnding),
    )
    await tabletPage.close()

    const routePage = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    await routePage.goto('http://localhost:4187/', { waitUntil: 'networkidle' })
    await routePage.locator('a[href="/projects/malware-detection"]').first().click()
    await routePage.waitForURL('**/projects/malware-detection')
    await routePage.waitForFunction(() => document.documentElement.dataset.transition === 'idle')
    const firstRoute = new URL(routePage.url()).pathname
    await routePage.locator('a[data-cursor-text="next"]').click()
    await routePage.waitForURL('**/projects/btardew-walley')
    await routePage.waitForFunction(() => document.documentElement.dataset.transition === 'idle')
    const nextRoute = new URL(routePage.url()).pathname
    await routePage.getByRole('link', { name: 'Bryan Widjaja, home' }).click()
    await routePage.waitForURL('http://localhost:4187/')
    check(
      'client route loaders preserve Home → project → NextProject → Home navigation',
      firstRoute === '/projects/malware-detection' && nextRoute === '/projects/btardew-walley' && new URL(routePage.url()).pathname === '/',
      JSON.stringify({ firstRoute, nextRoute, homeRoute: new URL(routePage.url()).pathname }),
    )
    await routePage.close()

    const deliveryPage = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 })
    await deliveryPage.goto('http://localhost:4187/projects/instatags', { waitUntil: 'networkidle' })
    await deliveryPage.locator('[data-collage-trigger]').first().click()
    await deliveryPage.waitForFunction(() =>
      Array.from(document.images).filter((image) => !image.closest('[data-ambient-scene]')).every((image) => image.complete),
    )
    const delivery = await deliveryPage.evaluate(() => ({
      hero: document.querySelector('[data-collage-hero] img')?.currentSrc ?? '',
      tile: document.querySelector('[data-collage-tile] img')?.currentSrc ?? '',
      thumbnails: Array.from(document.querySelectorAll('[data-lightbox-thumbnails] img')).map((image) => image.currentSrc),
    }))
    check(
      'narrow project slots and viewer thumbnails select genuinely smaller responsive derivatives',
      /-(?:320|640|960)\.(?:avif|webp)$/.test(delivery.hero) && /-(?:320|640)\.(?:avif|webp)$/.test(delivery.tile) &&
        delivery.thumbnails.length > 0 && delivery.thumbnails.every((src) => /-320\.(?:avif|webp)$/.test(src)),
      JSON.stringify(delivery),
    )
    await deliveryPage.close()
  } finally {
    await browser.close()
    await server.close()
  }
  if (failures.length) process.exit(1)
}

main()
