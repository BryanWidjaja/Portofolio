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
 * 47-round3-plan.md §R4 / 45 §Round 3 R3b, replacing the old two-look
 * design: **one continuous ink wash**, not a cover-front-plus-separate-
 * recede-field. Both phases threshold the *same* pre-baked noise field
 * (`uNoise`, baked once in `bakeNoiseTexture` at prewarm and re-used
 * verbatim for cover and recede within one transition via `currentSeed`) —
 * cover adds a distance-from-origin bias so patches bloom in irregularly
 * but weighted toward the click, never a growing circle; recede drops the
 * bias so the same field dries away uniformly. Neither phase runs per-pixel
 * fbm any more (44/45's SwiftShader cost note): the field is 2 texture2D
 * reads, independent of how much detail was baked into the texture.
 *
 * **The gap diagnosis (47 §Diagnosis summary item 8, "0-480ms solid ink →
 * ~780ms bare page, no ink → ~1130ms blobs recede"):** the previous
 * `getContext('webgl', …)` call never set `preserveDrawingBuffer`, which
 * defaults to `false`. That flag doesn't just affect `toDataURL`/readPixels
 * — it tells the browser it may (and, per spec, *should*) clear the
 * drawing buffer to transparent black after any compositor present for
 * which the app didn't draw a fresh frame. cover()'s tween stops calling
 * `draw()` the instant it resolves (by design: no rAF while idle/React
 * works), so every compositor frame during `swapping`/`holding` — which is
 * exactly where the destination route mounts, `waitForPageReady` awaits,
 * and the `DURATION.hold` buffer runs — was presenting a canvas the
 * browser had already wiped, i.e. a fully transparent curtain over a
 * `#main` that `styles/motion.css` only hides for `swapping`, not
 * `holding`. That's the bare-page gap: not a state-machine bug, not a
 * missing draw call, but this one missing context attribute. Fixed below
 * with `preserveDrawingBuffer: true`, which keeps the last-drawn frame
 * (full ink cover) on screen with zero extra draw calls until recede()
 * starts overwriting it. `styles/motion.css` adds a CSS `background-color`
 * on the canvas for `swapping`/`holding` too, as a second, independent
 * layer: even if some driver's `preserveDrawingBuffer` support were flaky,
 * the curtain is still a solid ink-coloured element underneath, never bare
 * page.
 *
 * Cancellation matches the old GSAP-timeline behaviour: `abort()` bumps a
 * token that makes any in-flight cover()/recede() tween go quiet mid-frame
 * without ever resolving its own promise (the same as `timeline.kill()`
 * never firing `onComplete`) — TransitionProvider's `handlePop` already
 * treats that call as abandoned and drives phase/focus/scroll itself.
 */

export interface InkCoverEngine {
  /** Compiles the shader + bakes the noise texture on browser idle after
   * mount, so the first real click never pays for context creation, shader
   * compile/link or the (cheap, but non-zero) texture bake. */
  prewarm(): void
  /** Spreads the ink front from `origin` (CSS px) to full cover, ~450ms. */
  cover(origin: { x: number; y: number }): Promise<void>
  /** Dissolves the cover back to nothing, ~650ms, then releases the canvas. */
  recede(): Promise<void>
  /** POP mid-transition: quickly fades whatever's on screen, then releases. */
  abort(): Promise<void>
  /** Shrinks the canvas to 1x1 and hides the root — idle GPU footprint. */
  release(): void
  dispose(): void
}

// 47 §R4 timing ("~450ms in / ~650ms out, both eased"), down from 600/700 —
// keep motion/tokens.ts's DURATION.cover/recede/hold in sync by hand.
const COVER_MS = 450
const RECEDE_MS = 650
const ABORT_MS = 300
// 47 §Shared rules "Crisp means device pixels": every canvas is min(dpr,2).
// The old fixed 1x traded crispness for SwiftShader (headless Chromium's
// software rasterizer) fragment cost, back when the shader ran 2-octave
// per-pixel fbm. That cost is gone now (the field is 2 texture2D reads, not
// ~8 hash/mix ops per octave), so the budget for dpr 2 exists; re-measured
// under 4x CPU throttle in the R4 report.
function canvasDpr() {
  return Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2)
}

// A 128x128 luminance texture, baked once per engine instance (prewarm) from
// three periodic value-noise octaves (see bakeNoiseTexture below) — not
// downloaded, not decoded, just a few thousand JS multiplies. `gl.REPEAT`
// tiling needs a power-of-two size in WebGL1.
const NOISE_TEX_SIZE = 128

function hash01(x: number, y: number, seed: number) {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0
  h = (h ^ (h >>> 13)) * 1274126177
  h = h ^ (h >>> 16)
  return ((h >>> 0) % 4096) / 4096
}

/** Tileable value noise: lattice indices wrap at `period` (via `% period`),
 * so bilinear interpolation between lattice points repeats seamlessly once
 * the baked texture is sampled with `gl.REPEAT` — no seam at the wrap edge
 * regardless of how the shader scales/offsets `vUv`. */
function tileableValueNoise(size: number, period: number, seed: number): Float32Array {
  const cell = size / period
  const out = new Float32Array(size * size)
  for (let y = 0; y < size; y++) {
    const gy = y / cell
    const iy0 = Math.floor(gy) % period
    const iy1 = (iy0 + 1) % period
    const fy = gy - Math.floor(gy)
    const sy = fy * fy * (3 - 2 * fy)
    for (let x = 0; x < size; x++) {
      const gx = x / cell
      const ix0 = Math.floor(gx) % period
      const ix1 = (ix0 + 1) % period
      const fx = gx - Math.floor(gx)
      const sx = fx * fx * (3 - 2 * fx)
      const a = hash01(ix0, iy0, seed)
      const b = hash01(ix1, iy0, seed)
      const c = hash01(ix0, iy1, seed)
      const d = hash01(ix1, iy1, seed)
      const ab = a + (b - a) * sx
      const cd = c + (d - c) * sx
      out[y * size + x] = ab + (cd - ab) * sy
    }
  }
  return out
}

/** Three octaves at different (non-harmonic, so they don't alias against
 * each other) periods, baked once into one 8-bit luminance field. Sampling
 * this at two different UV frequencies in the shader (see FRAG's
 * `sampleField`) approximates 2-octave fbm for the cost of 2 texture reads
 * instead of ~2x8 hash/mix ops — the fragment cost this exists to flatten. */
function bakeNoiseTexture(size: number): Uint8Array {
  const base = tileableValueNoise(size, 8, 1)
  const mid = tileableValueNoise(size, 17, 2)
  const fine = tileableValueNoise(size, 37, 3)
  const out = new Uint8Array(size * size)
  for (let i = 0; i < size * size; i++) {
    const v = base[i] * 0.55 + mid[i] * 0.3 + fine[i] * 0.15
    out[i] = Math.max(0, Math.min(255, Math.round(v * 255)))
  }
  return out
}

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`

// Two fragment shader variants sharing everything but the edge-width term.
// `OES_standard_derivatives` (or WebGL2's built-in fwidth) gives an edge
// that's genuinely ~1-1.5 *device* px regardless of the field's local
// gradient steepness (47 §R4 "the threshold edge is anti-aliased with
// fwidth"); when the extension isn't available the fallback uses a fixed
// field-space epsilon, which is softer but still a threshold, not a blur.
function buildFrag(hasDerivatives: boolean) {
  const edgeDecl = hasDerivatives
    ? '#extension GL_OES_standard_derivatives : enable\nfloat edgeWidth(float field) { return max(fwidth(field), 0.0015) * 1.1; }'
    : 'float edgeWidth(float field) { return 0.012; }'
  return `
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
uniform sampler2D uNoise;

${edgeDecl}

// Two taps of the one pre-baked field at different frequencies: a cheap
// stand-in for a second fbm octave (47 §R4 "fine fibrous detail at the edge
// from the higher noise octaves"), no per-pixel hash math either tap.
float sampleField(vec2 uv, float seed) {
  float base = texture2D(uNoise, uv * 2.6 + seed).r;
  float detail = texture2D(uNoise, uv * 8.5 + seed * 1.7).r;
  return base * 0.72 + detail * 0.28;
}

void main() {
  vec2 px = vUv * uResolution;
  // Normalized against ~55% of the full diagonal, not the whole thing: a
  // click near the middle of one viewport (the common case) is never more
  // than ~0.6 of the full diagonal from any corner, so dividing by the full
  // uMaxRadius left the bias term barely decaying across the visible screen
  // at all — measured while proving this (a slow-motion capture at 44%
  // progress was *already* fully covered edge-to-edge, corners included,
  // instead of visibly still spreading). This falloff radius actually
  // reaches ~0 within one screen regardless of where the click landed.
  float d = length(px - uOrigin) / max(uMaxRadius * 0.55, 1.0);

  float field;
  float cutoff;
  if (uMode < 0.5) {
    // Cover: patches bloom in, biased toward the origin but never a disc —
    // the bias raises the field near the click so noise there crosses the
    // falling cutoff first, while the noise's own irregular contours (not
    // the circular distance term) decide each patch's actual shape. The
    // cutoff range (top comfortably above the max field incl. bias, bottom
    // comfortably below its floor) spends the *whole* progress range
    // sweeping through the field's real distribution, so coverage still
    // has visible ground left to cross at the midpoint instead of the
    // screen already being solid well before uProgress reaches 1.
    float bias = (1.0 - clamp(d, 0.0, 1.0)) * 0.38;
    field = sampleField(vUv, uSeed) + bias;
    cutoff = mix(1.2, -0.05, uProgress);
  } else {
    // Recede: the *same* field (same uSeed as this transition's cover — the
    // caller reuses it, see recede() below), no distance bias, so it's one
    // continuous gesture drying away evenly rather than retracting to a point.
    field = sampleField(vUv, uSeed);
    cutoff = mix(-0.05, 1.2, uProgress);
  }

  float edge = edgeWidth(field);
  float alpha = smoothstep(cutoff - edge, cutoff + edge, field);
  // water-mark (shui hen) rim: a thin darker band right at the front, ~2-3x the AA edge wide.
  float rim = 1.0 - smoothstep(0.0, edge * 3.2, abs(field - cutoff));

  vec3 color = mix(uInk, uInkMuted, clamp(field, 0.0, 1.0) * 0.15);
  color = mix(color, uRim, rim * 0.55);
  gl_FragColor = vec4(color * alpha, alpha);
}
`
}

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

type UniformName =
  | 'uResolution'
  | 'uOrigin'
  | 'uMaxRadius'
  | 'uProgress'
  | 'uMode'
  | 'uSeed'
  | 'uInk'
  | 'uInkMuted'
  | 'uRim'
  | 'uNoise'

export function createInkCoverEngine(canvas: HTMLCanvasElement): InkCoverEngine {
  let gl: WebGLRenderingContext | null = null
  let program: WebGLProgram | null = null
  let uniforms: Partial<Record<UniformName, WebGLUniformLocation | null>> = {}
  let noiseTexture: WebGLTexture | null = null
  let usable = false
  let contextLost = false
  let token = 0
  let inkRGB: [number, number, number] = [0.078, 0.102, 0.118]
  let inkMutedRGB: [number, number, number] = [0.263, 0.294, 0.322]
  let rimRGB: [number, number, number] = [0.039, 0.051, 0.059]
  // Shared between cover() and recede() within one transition, so recede
  // dries away the *same* field cover bloomed in with (47 §R4 "the same
  // noise field then dries away"), not a freshly-rolled one.
  let currentSeed = 0

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

  function uploadNoiseTexture(): boolean {
    const g = gl
    if (!g) return false
    const tex = g.createTexture()
    if (!tex) return false
    const data = bakeNoiseTexture(NOISE_TEX_SIZE)
    g.bindTexture(g.TEXTURE_2D, tex)
    g.texImage2D(g.TEXTURE_2D, 0, g.LUMINANCE, NOISE_TEX_SIZE, NOISE_TEX_SIZE, 0, g.LUMINANCE, g.UNSIGNED_BYTE, data)
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.REPEAT)
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.REPEAT)
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR)
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR)
    noiseTexture = tex
    return true
  }

  function setupProgram(): boolean {
    const g = gl
    if (!g) return false
    // WebGL1 needs this enabled *before* compiling a shader that declares
    // `#extension GL_OES_standard_derivatives : enable`, or the compile
    // fails outright — so the extension check picks which source to compile.
    const derivExt = g.getExtension('OES_standard_derivatives')
    const vs = compile(g.VERTEX_SHADER, VERT)
    const fs = compile(g.FRAGMENT_SHADER, buildFrag(Boolean(derivExt)))
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
      uNoise: g.getUniformLocation(prog, 'uNoise'),
    }
    if (!uploadNoiseTexture()) {
      usable = false
      return false
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
      // THE gap fix (see this file's header comment): without this, the
      // spec permits the browser to clear the drawing buffer to transparent
      // after any present the app didn't redraw for — which is every frame
      // during `swapping`/`holding`, since cover()'s tween has already
      // resolved and nothing else calls draw() until recede() starts.
      preserveDrawingBuffer: true,
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
    const dpr = canvasDpr()
    const w = Math.max(1, Math.round(window.innerWidth * dpr))
    const h = Math.max(1, Math.round(window.innerHeight * dpr))
    if (canvas.width !== w) canvas.width = w
    if (canvas.height !== h) canvas.height = h
    if (gl) gl.viewport(0, 0, canvas.width, canvas.height)
    return dpr
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
    g.activeTexture(g.TEXTURE0)
    g.bindTexture(g.TEXTURE_2D, noiseTexture)
    g.uniform1i(uniforms.uNoise ?? null, 0)
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
    currentSeed = Math.random() * 50
    const originPx = { x: origin.x * dpr, y: origin.y * dpr }
    if (ensureContext()) {
      canvas.style.opacity = '1'
      await tween(COVER_MS, easeCircOut, (eased, isLast) => draw(0, eased, originPx, currentSeed, isLast), myToken)
    } else {
      await cssFallback(0, 1, COVER_MS, easeCircOut, myToken)
    }
  }

  async function recede() {
    const myToken = ++token
    syncSize()
    // Reuses currentSeed from the cover() that started this transition — the
    // same field, drying away, not a new one (47 §R4).
    if (usable) {
      await tween(RECEDE_MS, easeSineInOut, (eased, isLast) => draw(1, eased, { x: 0, y: 0 }, currentSeed, isLast), myToken)
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
