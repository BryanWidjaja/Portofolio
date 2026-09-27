/**
 * src/app/inkCover.ts
 *
 * 45-ink-approved.md D7 + 44-ink-build-plan.md §Architecture: the full-
 * screen ink page-transition cover, hand-written raw WebGL (no library, so
 * this stays a JS-budget line item rather than pulling in OGL/three — 45
 * D10 keeps the 180kB cap as-is). Plain DOM/WebGL — no React, no GSAP —
 * mirroring src/ink/brush.ts's split from components/BrushReveal.tsx:
 * components/InkCover.tsx owns the singleton DOM node and the module-level
 * proxy functions; this module owns the engine.
 *
 * Two looks share one shader, picked by `uMode`:
 *  - cover (mode 0): an irregular ink front spreads outward from the click/
 *    keyboard origin (fbm-perturbed circle, a crisp ~1.5px edge, a darker
 *    "水痕" rim right at the front).
 *  - recede (mode 1): not a shrinking circle — a full-field fbm threshold
 *    sweep, so patches clear unevenly across the whole screen at once, the
 *    way a wet stroke dries and sinks into xuan paper rather than
 *    retracting to a point.
 * If WebGL is unavailable, or the context is lost mid-run and never
 * restored in time, both phases fall back to a plain CSS opacity fade on
 * the same canvas element (a flat ink-coloured fill) — D7's "falls back to
 * the ink fade on context loss".
 *
 * Cancellation matches the old GSAP-timeline behaviour: `abort()` bumps a
 * token that makes any in-flight cover()/recede() tween go quiet mid-frame
 * without ever resolving its own promise (the same as `timeline.kill()`
 * never firing `onComplete`) — TransitionProvider's `handlePop` already
 * treats that call as abandoned and drives phase/focus/scroll itself.
 */

export interface InkCoverEngine {
  /** Compiles the shader on browser idle after mount, so the first real
   * click never pays for context creation + shader compile/link. */
  prewarm(): void
  /** Spreads the ink front from `origin` (CSS px) to full cover, ~600ms. */
  cover(origin: { x: number; y: number }): Promise<void>
  /** Dissolves the cover back to nothing, ~700ms, then releases the canvas. */
  recede(): Promise<void>
  /** POP mid-transition: quickly fades whatever's on screen, then releases. */
  abort(): Promise<void>
  /** Shrinks the canvas to 1x1 and hides the root — idle GPU footprint. */
  release(): void
  dispose(): void
}

const COVER_MS = 600
const RECEDE_MS = 700
const ABORT_MS = 300
// 1x CSS px, DPR ignored — the same call src/ink/brush.ts makes ("color is
// low-frequency"): a full-viewport wash doesn't need retina-sharp pixels,
// and this quarters the fragment count SwiftShader (headless Chromium's
// software rasterizer) has to shade per frame on a 2x display.
const CANVAS_DPR = 1

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`

const FRAG = `
precision mediump float;
varying vec2 vUv;
uniform vec2 uResolution;
uniform vec2 uOrigin;
uniform float uMaxRadius;
uniform float uProgress;
uniform float uMode;
uniform float uSeed;
uniform vec3 uInk;
uniform vec3 uInkMuted;
uniform vec3 uRim;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

// 2 octaves, not 3: this runs per-pixel on a full-viewport quad every
// frame of the animation, and SwiftShader (headless Chromium's software
// rasterizer, 44 §Exec tasks E5 risk note) pays for every extra octave in
// real time. One fbm sample doubles as both the mode's own field and the
// tone variation below, instead of a separate fbm call for each.
float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 2; i++) {
    v += amp * noise(p);
    p *= 2.02;
    amp *= 0.5;
  }
  return v;
}

void main() {
  vec2 px = vUv * uResolution;
  float d = length(px - uOrigin);

  float alpha;
  float rim;
  float tone;
  if (uMode < 0.5) {
    // Cover: an irregular front grows outward from the origin. The noise
    // perturbs *where* the edge sits, not just its softness, so it never
    // reads as a perfect circle.
    float n = fbm(vUv * 6.0 + uSeed);
    tone = n;
    float front = uProgress * uMaxRadius + (n - 0.5) * uMaxRadius * 0.12;
    float edge = max(1.5, uMaxRadius * 0.0015);
    alpha = 1.0 - smoothstep(front - edge, front + edge, d);
    rim = 1.0 - smoothstep(0.0, edge * 5.0, abs(d - front));
  } else {
    // Recede: a full-field noise-threshold dissolve, not a retracting
    // circle — the ink dries and sinks into the paper unevenly everywhere
    // at once (45 §Adjustments "ink sinking into paper").
    float field = fbm(vUv * 5.0 + uSeed);
    tone = field;
    float threshold = uProgress * 1.2 - 0.1;
    float edge = 0.08;
    alpha = 1.0 - smoothstep(threshold - edge, threshold + edge, field);
    rim = 1.0 - smoothstep(0.0, edge * 2.0, abs(field - threshold));
  }

  vec3 color = mix(uInk, uInkMuted, tone * 0.15);
  color = mix(color, uRim, rim * 0.55);
  gl_FragColor = vec4(color * alpha, alpha);
}
`

function easeCircOut(t: number) {
  return Math.sqrt(1 - Math.pow(t - 1, 2))
}
function easeSineInOut(t: number) {
  return -(Math.cos(Math.PI * t) - 1) / 2
}

function hexToRgb01(hex: string, fallback: [number, number, number]): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return fallback
  const n = parseInt(m[1], 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

type UniformName = 'uResolution' | 'uOrigin' | 'uMaxRadius' | 'uProgress' | 'uMode' | 'uSeed' | 'uInk' | 'uInkMuted' | 'uRim'

export function createInkCoverEngine(canvas: HTMLCanvasElement): InkCoverEngine {
  let gl: WebGLRenderingContext | null = null
  let program: WebGLProgram | null = null
  let uniforms: Partial<Record<UniformName, WebGLUniformLocation | null>> = {}
  let usable = false
  let contextLost = false
  let token = 0
  let inkRGB: [number, number, number] = [0.078, 0.102, 0.118]
  let inkMutedRGB: [number, number, number] = [0.263, 0.294, 0.322]
  let rimRGB: [number, number, number] = [0.039, 0.051, 0.059]

  function onContextLost(e: Event) {
    // Required so the browser actually attempts a later `webglcontextrestored`
    // instead of leaving the context dead — until then, cover()/recede() run
    // the CSS ink-fade fallback (D7).
    e.preventDefault()
    contextLost = true
    usable = false
  }

  function onContextRestored() {
    contextLost = false
    setupProgram()
  }

  canvas.addEventListener('webglcontextlost', onContextLost, false)
  canvas.addEventListener('webglcontextrestored', onContextRestored, false)

  function compile(type: number, source: string): WebGLShader | null {
    const g = gl
    if (!g) return null
    const shader = g.createShader(type)
    if (!shader) return null
    g.shaderSource(shader, source)
    g.compileShader(shader)
    if (!g.getShaderParameter(shader, g.COMPILE_STATUS)) {
      g.deleteShader(shader)
      return null
    }
    return shader
  }

  function setupProgram(): boolean {
    const g = gl
    if (!g) return false
    const vs = compile(g.VERTEX_SHADER, VERT)
    const fs = compile(g.FRAGMENT_SHADER, FRAG)
    if (!vs || !fs) {
      usable = false
      return false
    }
    const prog = g.createProgram()
    if (!prog) {
      usable = false
      return false
    }
    g.attachShader(prog, vs)
    g.attachShader(prog, fs)
    g.linkProgram(prog)
    if (!g.getProgramParameter(prog, g.LINK_STATUS)) {
      g.deleteProgram(prog)
      usable = false
      return false
    }
    program = prog
    // A single oversized triangle covers the viewport with no index buffer.
    const buffer = g.createBuffer()
    g.bindBuffer(g.ARRAY_BUFFER, buffer)
    g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), g.STATIC_DRAW)
    const aPos = g.getAttribLocation(prog, 'aPos')
    g.enableVertexAttribArray(aPos)
    g.vertexAttribPointer(aPos, 2, g.FLOAT, false, 0, 0)
    uniforms = {
      uResolution: g.getUniformLocation(prog, 'uResolution'),
      uOrigin: g.getUniformLocation(prog, 'uOrigin'),
      uMaxRadius: g.getUniformLocation(prog, 'uMaxRadius'),
      uProgress: g.getUniformLocation(prog, 'uProgress'),
      uMode: g.getUniformLocation(prog, 'uMode'),
      uSeed: g.getUniformLocation(prog, 'uSeed'),
      uInk: g.getUniformLocation(prog, 'uInk'),
      uInkMuted: g.getUniformLocation(prog, 'uInkMuted'),
      uRim: g.getUniformLocation(prog, 'uRim'),
    }
    usable = true
    return true
  }

  function readTheme() {
    if (typeof getComputedStyle !== 'function') return
    const style = getComputedStyle(document.documentElement)
    inkRGB = hexToRgb01(style.getPropertyValue('--color-ink'), inkRGB)
    inkMutedRGB = hexToRgb01(style.getPropertyValue('--color-ink-muted'), inkMutedRGB)
    rimRGB = [inkRGB[0] * 0.5, inkRGB[1] * 0.5, inkRGB[2] * 0.5]
  }

  function ensureContext(): boolean {
    if (gl) return usable
    if (contextLost) return false
    gl = canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'low-power',
      // Lets the browser present frames without the extra readback some
      // drivers otherwise do to synchronise a WebGL canvas with the rest
      // of the page's compositing.
      desynchronized: true,
    } as WebGLContextAttributes) as WebGLRenderingContext | null
    if (!gl) return false
    readTheme()
    return setupProgram()
  }

  function prewarm() {
    const idle: (cb: () => void) => void =
      typeof requestIdleCallback === 'function' ? (cb) => requestIdleCallback(cb) : (cb) => window.setTimeout(cb, 200)
    idle(() => ensureContext())
  }

  function syncSize() {
    const w = Math.max(1, Math.round(window.innerWidth * CANVAS_DPR))
    const h = Math.max(1, Math.round(window.innerHeight * CANVAS_DPR))
    if (canvas.width !== w) canvas.width = w
    if (canvas.height !== h) canvas.height = h
    if (gl) gl.viewport(0, 0, canvas.width, canvas.height)
    return CANVAS_DPR
  }

  function setRootVisible(visible: boolean) {
    const root = canvas.parentElement
    if (root) root.style.visibility = visible ? 'visible' : 'hidden'
  }

  let lastDrawAt = 0
  const MIN_FRAME_MS = 1000 / 30 // draw at ~30fps, not 60 — see tween()'s call site

  function draw(mode: 0 | 1, progress: number, originPx: { x: number; y: number }, seed: number, force: boolean) {
    const g = gl
    if (!g || !program) return
    const now = performance.now()
    if (!force && now - lastDrawAt < MIN_FRAME_MS) return
    lastDrawAt = now
    g.useProgram(program)
    g.clearColor(0, 0, 0, 0)
    g.clear(g.COLOR_BUFFER_BIT)
    g.uniform2f(uniforms.uResolution ?? null, canvas.width, canvas.height)
    g.uniform2f(uniforms.uOrigin ?? null, originPx.x, canvas.height - originPx.y)
    g.uniform1f(uniforms.uMaxRadius ?? null, Math.hypot(canvas.width, canvas.height))
    g.uniform1f(uniforms.uProgress ?? null, progress)
    g.uniform1f(uniforms.uMode ?? null, mode)
    g.uniform1f(uniforms.uSeed ?? null, seed)
    g.uniform3f(uniforms.uInk ?? null, inkRGB[0], inkRGB[1], inkRGB[2])
    g.uniform3f(uniforms.uInkMuted ?? null, inkMutedRGB[0], inkMutedRGB[1], inkMutedRGB[2])
    g.uniform3f(uniforms.uRim ?? null, rimRGB[0], rimRGB[1], rimRGB[2])
    g.drawArrays(g.TRIANGLES, 0, 3)
  }

  /** Runs one eased tween. `myToken` lets abort() silently orphan whatever
   * is currently in flight instead of racing it — the same "kill() never
   * fires onComplete" semantics the old GSAP timeline had. `onFrame`'s
   * `isLast` tells draw() to bypass its own frame-rate throttle so the
   * animation always lands on its exact final value. */
  function tween(
    durationMs: number,
    ease: (t: number) => number,
    onFrame: (eased: number, isLast: boolean) => void,
    myToken: number,
  ) {
    return new Promise<void>((resolve) => {
      const start = performance.now()
      function frame(now: number) {
        if (myToken !== token) return
        const raw = Math.min(1, (now - start) / durationMs)
        onFrame(ease(raw), raw >= 1)
        if (raw < 1) requestAnimationFrame(frame)
        else resolve()
      }
      requestAnimationFrame(frame)
    })
  }

  function cssFallback(from: number, to: number, durationMs: number, ease: (t: number) => number, myToken: number) {
    const [r, g2, b] = inkRGB
    canvas.style.background = `rgb(${Math.round(r * 255)}, ${Math.round(g2 * 255)}, ${Math.round(b * 255)})`
    return tween(
      durationMs,
      ease,
      (eased) => {
        canvas.style.opacity = String(from + (to - from) * eased)
      },
      myToken,
    )
  }

  function release() {
    setRootVisible(false)
    canvas.style.opacity = ''
    canvas.style.background = ''
    canvas.width = 1
    canvas.height = 1
  }

  async function cover(origin: { x: number; y: number }) {
    const myToken = ++token
    const dpr = syncSize()
    setRootVisible(true)
    const seed = Math.random() * 50
    const originPx = { x: origin.x * dpr, y: origin.y * dpr }
    if (ensureContext()) {
      canvas.style.opacity = '1'
      await tween(COVER_MS, easeCircOut, (eased, isLast) => draw(0, eased, originPx, seed, isLast), myToken)
    } else {
      await cssFallback(0, 1, COVER_MS, easeCircOut, myToken)
    }
  }

  async function recede() {
    const myToken = ++token
    syncSize()
    const seed = Math.random() * 50
    if (usable) {
      await tween(RECEDE_MS, easeSineInOut, (eased, isLast) => draw(1, eased, { x: 0, y: 0 }, seed, isLast), myToken)
    } else {
      await cssFallback(1, 0, RECEDE_MS, easeSineInOut, myToken)
    }
    release()
  }

  async function abort() {
    const myToken = ++token
    // Whatever phase was running (cover or recede), a quick fade of the
    // last-drawn frame to nothing reads as "the ink gives up and sinks
    // away" regardless of where it was — the same abandon-in-place abort
    // the old curtain timeline.kill() did. Fades from whatever opacity is
    // *currently* showing (GL mode always leaves it at 1; the CSS fallback
    // may be mid-fade) rather than assuming 1, so this never snaps up first.
    const current = Number.parseFloat(canvas.style.opacity)
    const from = Number.isFinite(current) ? current : 1
    await tween(
      ABORT_MS,
      easeSineInOut,
      (eased) => {
        canvas.style.opacity = String(from * (1 - eased))
      },
      myToken,
    )
    release()
  }

  release()

  return {
    prewarm,
    cover,
    recede,
    abort,
    release,
    dispose() {
      canvas.removeEventListener('webglcontextlost', onContextLost)
      canvas.removeEventListener('webglcontextrestored', onContextRestored)
    },
  }
}
