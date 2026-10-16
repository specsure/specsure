/**
 * The site's backdrop: a slow fractal noise seen through two ordered dithers, as in the Specsure
 * reel. It follows the FractalNoise and Dither components of shaders.com (MIT): golden-angle fBm
 * mixed between two colors in linear light, then a Bayer 8×8 dither over 3 px cells and a Bayer
 * 4×4 dither over 2 px cells, each darkening a cell ×0.3 or brightening it ×1.3. Written for
 * WebGL2 so the page needs a few kilobytes, not a WebGPU library.
 */

export interface BackdropLook {
  /** Base and patch colors, sRGB hex. */
  colorA: string
  colorB: string
  /** fBm persistence and lacunarity. */
  contrast: number
  detail: number
  /** Evolution speed, in noise units per second. */
  speed: number
  /** Strength of the fine 2 px dither, 0–1 (1 = as in the reel). */
  grain: number
  /** Light theme: dither between the colors instead of darkening and brightening them. */
  light: boolean
}

const VS = `#version 300 es
in vec2 p; void main() { gl_Position = vec4(p, 0., 1.); }`

const FS = `#version 300 es
precision highp float;
uniform vec2 res; uniform float time, contrast, detail, grain, light;
uniform vec3 colA, colB;
out vec4 o;

// 3D simplex noise (Ashima Arts / Stefan Gustavson, MIT).
vec3 mod289(vec3 x) { return x - floor(x * (1. / 289.)) * 289.; }
vec4 mod289(vec4 x) { return x - floor(x * (1. / 289.)) * 289.; }
vec4 permute(vec4 x) { return mod289(((x * 34.) + 10.) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - .85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1. / 6., 1. / 3.); const vec4 D = vec4(0., .5, 1., 2.);
  vec3 i = floor(v + dot(v, C.yyy)); vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz); vec3 l = 1. - g; vec3 i1 = min(g.xyz, l.zxy); vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx; vec3 x2 = x0 - i2 + C.yyy; vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0., i1.z, i2.z, 1.)) + i.y + vec4(0., i1.y, i2.y, 1.)) + i.x + vec4(0., i1.x, i2.x, 1.));
  float n_ = .142857142857; vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49. * floor(p * ns.z * ns.z); vec4 x_ = floor(j * ns.z); vec4 y_ = floor(j - 7. * x_);
  vec4 x = x_ * ns.x + ns.yyyy; vec4 y = y_ * ns.x + ns.yyyy; vec4 h = 1. - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy); vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2. + 1.; vec4 s1 = floor(b1) * 2. + 1.; vec4 sh = -step(h, vec4(0.));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy; vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x); vec3 p1 = vec3(a0.zw, h.y); vec3 p2 = vec3(a1.xy, h.z); vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.); m = m * m;
  return 105. * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

// Four octaves at base frequency 2, each turned by the golden angle and evolving on its own,
// so the field morphs in place instead of scrolling.
float fbm(vec2 pos, float t) {
  float sum = 0., wsum = 0., amp = 1., freq = 2.;
  for (int i = 0; i < 4; i++) {
    float a = float(i) * 2.39996323;
    vec2 q = mat2(cos(a), -sin(a), sin(a), cos(a)) * pos * freq;
    sum += amp * snoise(vec3(q + vec2(7., 4.9), t * (1. + .37 * float(i))));
    wsum += amp; amp *= contrast; freq *= detail;
  }
  return clamp(sum / wsum * .5 + .5, 0., 1.);
}

vec3 toLinear(vec3 c) { return pow(c, vec3(2.2)); }
vec3 toSrgb(vec3 c) { return pow(c, vec3(1. / 2.2)); }
float luma(vec3 c) { return dot(c, vec3(.299, .587, .114)); }
float quad(vec2 c) { return mod(2. * c.x + 3. * c.y, 4.); }
float bayer8(vec2 c) {
  vec2 t = mod(c, 8.);
  return (quad(mod(t, 2.)) * 16. + quad(floor(mod(t, 4.) / 2.)) * 4. + quad(floor(t / 4.))) / 64.;
}
float bayer4(vec2 c) { vec2 t = mod(c, 4.); return (quad(mod(t, 2.)) * 4. + quad(floor(t / 2.))) / 16.; }

// The noise color at a point (css px): mixed in linear light, dithered in sRGB as the
// components do.
vec3 field(vec2 px) {
  vec2 uv = (px - res * .5) / res.y;
  return toSrgb(mix(colA, colB, fbm(uv, time)));
}
// First dither: 3 px cells, Bayer 8×8, threshold 0.5, spread 0.5.
vec3 dither1(vec2 px) {
  vec2 cell = floor(px / 3.);
  vec3 c = field((cell + .5) * 3.);
  float level = step(.5 + (bayer8(cell) - .5) * .5, luma(c));
  if (light > .5) return mix(toSrgb(colA), c, .85 + .15 * level);
  return mix(c * .3, min(c * 1.3, vec3(1.)), level);
}

void main() {
  vec2 px = vec2(gl_FragCoord.x, res.y - gl_FragCoord.y);
  // Second dither: 2 px cells over the first, Bayer 4×4, threshold 1, spread 1.
  vec2 cell = floor(px / 2.);
  vec3 c = dither1((cell + .5) * 2.);
  float level = step(bayer4(cell), luma(c) + .5);
  vec3 fine = light > .5 ? mix(c * .985, c, level) : mix(c * .3, min(c * 1.3, vec3(1.)), level);
  o = vec4(mix(c, fine, grain), 1.);
}`

const hex = (h: string): [number, number, number] => {
  const n = h.replace('#', '')
  return [0, 2, 4].map((i) => (parseInt(n.slice(i, i + 2), 16) / 255) ** 2.2) as [number, number, number]
}

/** Starts the backdrop on a canvas; returns a stop function. Does nothing without WebGL2. */
export function startBackdrop(canvas: HTMLCanvasElement, look: () => BackdropLook): () => void {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: false })
  if (!gl) return () => {}
  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!
    gl.shaderSource(s, src)
    gl.compileShader(s)
    return s
  }
  const prog = gl.createProgram()!
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS))
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS))
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return () => {}
  gl.useProgram(prog)
  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  const loc = gl.getAttribLocation(prog, 'p')
  gl.enableVertexAttribArray(loc)
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
  const uniform = (n: string) => gl.getUniformLocation(prog, n)
  const U = {
    res: uniform('res'),
    time: uniform('time'),
    contrast: uniform('contrast'),
    detail: uniform('detail'),
    grain: uniform('grain'),
    light: uniform('light'),
    colA: uniform('colA'),
    colB: uniform('colB'),
  }

  // Dither cells are whole CSS pixels, so the canvas renders at CSS resolution and the browser
  // scales it up without smoothing: crisp cells on any screen, a fraction of the work.
  const size = () => {
    const w = Math.ceil(innerWidth),
      h = Math.ceil(innerHeight)
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    gl.viewport(0, 0, w, h)
    gl.uniform2f(U.res, w, h)
  }
  const draw = (seconds: number) => {
    const l = look()
    gl.uniform1f(U.time, seconds * l.speed)
    gl.uniform1f(U.contrast, l.contrast)
    gl.uniform1f(U.detail, l.detail)
    gl.uniform1f(U.grain, l.grain)
    gl.uniform1f(U.light, l.light ? 1 : 0)
    gl.uniform3f(U.colA, ...hex(l.colorA))
    gl.uniform3f(U.colB, ...hex(l.colorB))
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  const still = matchMedia('(prefers-reduced-motion: reduce)')
  let raf = 0,
    last = 0
  const start = performance.now()
  const tick = (now: number) => {
    raf = requestAnimationFrame(tick)
    // About 30 fps is plenty for something this slow; small screens (phones) get 15.
    if (now - last < (innerWidth < 768 ? 66 : 33)) return
    last = now
    draw((now - start) / 1000)
  }
  const run = () => {
    cancelAnimationFrame(raf)
    size()
    if (still.matches || document.hidden) draw(12)
    else raf = requestAnimationFrame(tick)
  }
  const onResize = () => {
    size()
    if (still.matches) draw(12)
  }
  addEventListener('resize', onResize)
  document.addEventListener('visibilitychange', run)
  still.addEventListener('change', run)
  run()
  return () => {
    cancelAnimationFrame(raf)
    removeEventListener('resize', onResize)
    document.removeEventListener('visibilitychange', run)
    still.removeEventListener('change', run)
  }
}
