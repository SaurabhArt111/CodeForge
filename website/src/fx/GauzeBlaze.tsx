/* eslint-disable */
// Gauze Blaze — Originkit

"use client"

/**
 * GauzeBlaze — a ribbon of gauze burning across the dark: a few sheets of
 * dotted strands twisting through real 3D space, folding back on themselves
 * in perspective, their leading edges drawn as neon filaments that run
 * yellow-white at the core and cool through hot pink to indigo, with glitter
 * caught in the mesh and embers thrown off the fire.
 *
 * Refined from the user's HorizontalRibbonLight to match their reference
 * still (a fiery particle-mesh wave on black). How the look is made:
 *   - Each sheet is a 3D surface — a spine that waves in y and z, a cross
 *     direction that twists about the length, a curl across the width and a
 *     shear that tips the strands so the sheet laps over itself — projected
 *     through a perspective camera. Where a sheet turns edge-on its strands
 *     stack into a bright fold; where it laps, it loops, as in the reference.
 *   - Strands are drawn as points a couple of pixels apart, so the mesh reads
 *     as the reference's dotted particle gauze, not solid lines.
 *   - All light is additive into an HDR target, then bloomed (threshold,
 *     ¼ and ⅛ resolution blur) and film tone-mapped: hot filaments burn to
 *     white with a saturated halo while dim faces stay dark.
 *
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight any
 * @framerIntrinsicWidth 1200
 * @framerIntrinsicHeight 800
 */
import { useEffect, useRef, type CSSProperties } from "react"

// ── renderer ──

type RGBA = [number, number, number, number]

const COLOR_CACHE = new Map<string, RGBA | null>()

function parseColor(input: string | undefined, fallback: RGBA): RGBA {
    if (typeof input !== "string") return fallback
    let hit = COLOR_CACHE.get(input)
    if (hit === undefined) {
        hit = parseColorRaw(input)
        COLOR_CACHE.set(input, hit)
    }
    return hit ?? fallback
}

function parseColorRaw(raw: string): RGBA | null {
    let s = raw.trim()
    const v = /^var\(\s*--[^,]+,\s*(.+)\)$/.exec(s)
    if (v) s = v[1].trim()
    if (s[0] === "#") {
        const h = s.slice(1)
        const x = (a: string) => parseInt(a, 16)
        let r: number, g: number, b: number, a = 255
        if (h.length === 3 || h.length === 4) {
            r = x(h[0] + h[0]); g = x(h[1] + h[1]); b = x(h[2] + h[2])
            if (h.length === 4) a = x(h[3] + h[3])
        } else if (h.length === 6 || h.length === 8) {
            r = x(h.slice(0, 2)); g = x(h.slice(2, 4)); b = x(h.slice(4, 6))
            if (h.length === 8) a = x(h.slice(6, 8))
        } else return null
        const out: RGBA = [r / 255, g / 255, b / 255, a / 255]
        return out.every(Number.isFinite) ? out : null
    }
    const m = /^(rgba?|hsla?)\(([^)]*)\)$/i.exec(s)
    if (!m) return null
    const parts = m[2].split(/[\s,/]+/).filter(Boolean)
    if (parts.length < 3) return null
    const num = (p: string, scale: number) =>
        p.endsWith("%") ? (parseFloat(p) / 100) * scale : parseFloat(p)
    const alpha = parts.length > 3 ? num(parts[3], 1) : 1
    let rgb: [number, number, number]
    if (m[1].toLowerCase().startsWith("rgb")) {
        rgb = [num(parts[0], 255) / 255, num(parts[1], 255) / 255, num(parts[2], 255) / 255]
    } else {
        const hh = (((parseFloat(parts[0]) % 360) + 360) % 360) / 360
        const ss = num(parts[1], 1), ll = num(parts[2], 1)
        const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss
        const p = 2 * ll - q
        const f = (t: number) => {
            t = (t + 1) % 1
            if (t < 1 / 6) return p + (q - p) * 6 * t
            if (t < 1 / 2) return q
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
            return p
        }
        rgb = [f(hh + 1 / 3), f(hh), f(hh - 1 / 3)]
    }
    const out: RGBA = [rgb[0], rgb[1], rgb[2], alpha]
    return out.every(Number.isFinite) ? out.map((c) => Math.min(1, Math.max(0, c))) as RGBA : null
}

const DEFAULTS = {
    background: "#030207",
    baseColor: "#4A4DFF",
    midColor: "#FF2A7E",
    accentColor: "#FF6A1A",
    particles: 400,
    amplitude: 37,
    scale: 89,
    speed: 20,
}

/** The look. Every field here is what the component hardcodes when Advanced is untouched. */
const DEFAULT_ADVANCED = {
    sheets: 4,
    lineCount: 56,
    ribbonWidth: 12,
    centerY: 50,
    waveLength: 45,
    twistLength: 140,
    lineWidth: 100,
    lineOpacity: 38,
    speckle: 40,
    backDim: 45,
    coreColor: "#FFD36A",
    coreGain: 300,
    edgeGlow: 160,
    glowSize: 24,
    exposure: 300,
    hazeColor: "#1A0A2E",
    haze: 40,
    vignette: 20,
    grain: 0,
    emberSize: 100,
    emberLife: 100,
    emberRise: 5,
    emberDrift: 3,
    travel: 20,
    twistMs: 30000,
    breathe: 15,
    breatheMs: 8000,
    hover: 50,
    pointerLift: 35,
    pointerRadius: 20,
}

/** Pointer response, on 0–10 scales. */
const DEFAULT_POINTER = {
    heat: 6,
    stir: 5,
    burst: 6,
}

function num(v: unknown, d: number): number {
    return typeof v === "number" && Number.isFinite(v) ? v : d
}

// Light is stored linear. A half-float target holds it as-is; where the GPU
// can't render to one, RGBA8 holds it scaled by ¼ (headroom to 4× white) so
// additive blending still sums correctly.
const STORE = `
uniform float uStore;
vec3 enc(vec3 c) { return c * uStore; }
vec3 dec(vec3 c) { return c / uStore; }
`

/* Shared by the sheet and ember vertex shaders: uniforms, hashes, colour ramp, ribbon spine. */
const COMMON = `
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uMouse;
uniform float uHover;
uniform vec3 uBase;
uniform vec3 uMid;
uniform vec3 uAccent;
uniform vec3 uCore;
uniform float uScale;
uniform float uAmp;
uniform float uWave;
uniform float uCy;
uniform float uTravel;
uniform float uBreathe;
uniform float uBreatheT;
uniform float uLift;
uniform float uPRad;
uniform float uCoreGain;
// Pointer events, timed on uNow (real seconds, unaffected by Speed):
// stir ripples (frame x, height, birth, –) and click bursts (frame x, frame y, birth, strength).
uniform float uNow;
uniform vec4 uImp[8];
uniform vec4 uBursts[4];
${STORE}
const float TAU = 6.2831853;
// Per sheet: wave phase, rest offset, wave height, wavelength factor, travel
// offset (whole cycles per 40 s). Different wavelengths let sheets drift
// through each other and cross, instead of riding as one stack.
const float PH[6] = float[6](-2.02, -1.35, -2.75, -0.75, -3.3, -1.75);
const float OFF[6] = float[6](0.0, 0.03, -0.035, 0.05, -0.02, 0.012);
const float WA[6] = float[6](1.0, 0.85, 1.15, 0.75, 0.95, 0.6);
const float LK[6] = float[6](1.0, 0.82, 1.18, 0.9, 1.3, 0.75);
const float SPD[6] = float[6](0.0, -1.0, 1.0, -2.0, 2.0, -1.0);

// Integer (PCG) hash on the float's bits: sin-based hashes lose precision on
// large arguments and clump differently from one GPU to the next.
float h11(float n) {
    uint x = floatBitsToUint(n) * 747796405u + 2891336453u;
    x = ((x >> ((x >> 28u) + 4u)) ^ x) * 277803737u;
    x = (x >> 22u) ^ x;
    return float(x) * (1.0 / 4294967296.0);
}

// Fixed along screen x, read off the reference: red-magenta tail, orange,
// yellow-white core, hot pink, then violet into indigo with a magenta glow
// low on the far right.
vec3 ramp(float x) {
    vec3 c = mix(mix(uMid, uAccent, 0.2), uMid, smoothstep(0.0, 0.1, x));
    c = mix(c, mix(uMid, uAccent, 0.6), smoothstep(0.1, 0.22, x));
    c = mix(c, uAccent, smoothstep(0.22, 0.32, x));
    c = mix(c, uMid, smoothstep(0.5, 0.6, x));
    c = mix(c, mix(uMid, uBase, 0.55), smoothstep(0.62, 0.72, x));
    c = mix(c, uBase, smoothstep(0.72, 0.84, x));
    c = mix(c, mix(uBase, uMid, 0.55), exp(-pow((x - 0.9) / 0.06, 2.0)));
    return mix(c, uCore, 0.15 * exp(-pow((x - 0.42) / 0.08, 2.0)));
}

// Stir ripples: run speed (frame widths/s), half-width, decay (/s), lifetime (s).
const float RIPPLE_SPEED = 0.45;
const float RIPPLE_WIDTH = 0.07;
const float RIPPLE_DECAY = 1.4;
const float RIPPLE_LIFE = 3.0;

float pull(float xn) { return uHover * exp(-pow((xn - uMouse.x) / max(uPRad, 1e-3), 2.0)); }

// Spine of sheet k at frame-x xn: (y, z) in frame heights, y from the centre.
vec2 spine(float xn, int k, float t) {
    float sc = max(uScale, 0.1);
    float pg = pull(xn);
    float A = uAmp * sc * (1.0 + uBreathe * sin(TAU * t / max(uBreatheT, 0.1))) * (1.0 + 0.3 * pg);
    float lam = max(uWave * sc * LK[k], 0.02);
    float n = max(1.0, uTravel + SPD[k]);
    float w1 = TAU * n / 40.0;
    float w2 = TAU * floor(n * 0.5 + 0.5) / 40.0;
    float w3 = TAU * floor(n * 0.25 + 0.5) / 40.0;
    float ph = PH[k];
    float y = (uCy - 0.5) + OFF[k] * sc + A * WA[k] * (sin(TAU * xn / lam - w1 * t + ph)
        + 0.3 * sin(TAU * xn / (lam * 0.55) + w2 * t + ph * 1.7 + 1.3)
        + 0.6 * sin(TAU * xn / (lam * 2.7) - w3 * t + ph * 0.6 + 0.4));
    y += ((uMouse.y - 0.5) - y) * uLift * pg;
    float z = A * 1.4 * cos(TAU * xn / (lam * 1.3) - w1 * t + ph * 1.3 + float(k));
    // stir: each ripple starts as a kick under the pointer, splits, and runs
    // out both ways along the ribbon, ringing once and dying away
    for (int j = 0; j < 8; j++) {
        vec4 I = uImp[j];
        float age = uNow - I.z;
        if (I.y == 0.0 || age < 0.0 || age > RIPPLE_LIFE) continue;
        float r = abs(xn - I.x) - age * RIPPLE_SPEED;
        float env = exp(-r * r / (RIPPLE_WIDTH * RIPPLE_WIDTH) - age * RIPPLE_DECAY);
        float ph2 = r * TAU / (RIPPLE_WIDTH * 3.0);
        y += I.y * env * cos(ph2);
        z += I.y * 0.8 * env * sin(ph2 + float(k));
    }
    return vec2(y, z);
}
`

/* Sheets: one point per strand sample, all from gl_VertexID — no vertex buffers. */
const SHEET_VS = `#version 300 es
precision highp float;
${COMMON}
uniform float uSamples;
uniform float uLines;
uniform float uLineW;
uniform float uLineA;
uniform float uWidth;
uniform float uTwistLen;
uniform float uTwistT;
uniform float uEdge;
uniform float uBack;
uniform float uSpeck;
uniform float uHeat;
out vec3 vCol;

// Per sheet: width, brightness, twist phase, twist direction.
const float WK[6] = float[6](1.0, 0.85, 0.75, 0.95, 0.7, 0.8);
const float SH[6] = float[6](1.0, 0.8, 0.68, 0.58, 0.5, 0.45);
const float TW[6] = float[6](1.15, 2.4, 3.7, 5.0, 0.4, 4.3);
const float TDIR[6] = float[6](1.0, -1.0, 1.0, -1.0, 1.0, -1.0);
// Camera distance in frame heights: enough perspective that a sheet coming
// forward swells and laps over the one behind, not so much it distorts.
const float CAM = 2.2;
// Cross-section bow (C-shaped sheets) and strand lean along x (sheets lap over).
const float CURL = 0.6;
const float SHEAR = 0.4;
// Strand dot diameter in design px (800 px frame), neon filament brightness
// against a plain strand, plain-strand gain, and the share of points that
// glitter at Speckle 100 %.
const float DOT = 1.6;
const float NEON = 0.9;
const float LINE_GAIN = 0.55;
const float GLITTER = 0.03;
// How fast a burst's ring of heat spreads (frame heights/s).
const float HEAT_WAVE_SPEED = 0.55;

void main() {
    int ns = int(uSamples);
    int nl = int(uLines);
    int id = gl_VertexID;
    int si = id % ns;
    int rest = id / ns;
    int li = rest % nl;
    int k = rest / nl;
    float t = uTime;
    float fk = float(k);
    float aspect = uRes.x / max(uRes.y, 1.0);
    float px = uRes.y / 800.0;
    float sc = max(uScale, 0.1);

    float u = float(si) / float(max(ns - 1, 1));
    float hs = h11(float(li) * 7.13 + fk * 31.7);
    float s = ((float(li) + 0.5) / float(nl)) * 2.0 - 1.0 + (hs - 0.5) / float(nl);
    float xn = mix(-0.1, 1.1, u);

    vec2 yz = spine(xn, k, t);
    float tl = max(uTwistLen * sc, 0.02);
    float th = TAU * xn / tl + TW[k] + 0.45 * sin(TAU * xn / (tl * 0.63) + fk * 1.9)
        - TAU * t / max(uTwistT, 0.1) * TDIR[k];
    float hw = uWidth * sc * WK[k] * (0.7 + 0.6 * xn);
    float lam = max(uWave * sc * LK[k], 0.02);
    vec3 D = vec3(SHEAR * sin(TAU * xn / (lam * 0.8) + fk * 2.3 - t * 0.35 * TDIR[k]), cos(th), sin(th));
    vec3 N = vec3(0.0, -sin(th), cos(th));
    vec3 P = vec3((xn - 0.5) * aspect, yz.x, yz.y) + hw * (s * D + CURL * (s * s - 0.33) * N);
    // flutter, so strands never run perfectly parallel
    P.y += hw * 0.1 * sin(TAU * (xn * 5.0 + s * 0.6) - t * 1.3 + fk * 1.7);
    P.z += hw * 0.25 * sin(TAU * (xn * 3.0 - s * 0.5) + t * 0.9 + fk);

    float persp = CAM / max(CAM - P.z, 0.2);
    vec2 sp = P.xy * persp;
    gl_Position = vec4(sp.x / (aspect * 0.5), sp.y / 0.5, 0.0, 1.0);

    float sx = sp.x / aspect + 0.5;
    float core = exp(-pow((sx - 0.42) / 0.16, 2.0));
    float back = smoothstep(0.0, -0.15 * sc, P.z);
    float gain = mix(1.0, uCoreGain, core);
    vec3 col = mix(ramp(sx), uBase, back * 0.65 * (1.0 - 0.7 * core));

    // the leading edge of every sheet is a neon filament; the trailing edge a fainter one
    float neon = li == nl - 1 ? 1.0 : (li == 0 ? 0.45 : 0.0);
    col = mix(col, uCore, neon * core * 0.6);
    float shade = SH[k] * mix(1.0, uBack, back) * gain;
    float b = uLineA * LINE_GAIN * mix(0.55, 1.3, hs) * shade;
    b = max(b, uEdge * NEON * neon * shade);

    float hg = h11(float(id) * 0.6180339 + 3.1);
    float glit = step(hg, uSpeck * GLITTER);
    b *= 1.0 + glit * 5.0 * (0.5 + 0.5 * sin(t * (3.0 + 4.0 * h11(hg * 91.0)) + hg * 400.0));

    // heat: the cursor is a flame held to the gauze, and a burst sends a ring
    // of heat out through it from where you clicked
    vec2 dm = sp - vec2((uMouse.x - 0.5) * aspect, uMouse.y - 0.5);
    float reach = max(uPRad * aspect * 0.45, 0.02);
    float heat = uHeat * uHover * exp(-dot(dm, dm) / (reach * reach));
    for (int j = 0; j < 4; j++) {
        vec4 B = uBursts[j];
        float age = uNow - B.z;
        if (B.w <= 0.0 || age < 0.0 || age > 3.0) continue;
        float d = length(sp - vec2((B.x - 0.5) * aspect, B.y - 0.5));
        float ring = d - age * HEAT_WAVE_SPEED;
        heat += B.w * exp(-age * 1.6) * (exp(-ring * ring / 0.004) + exp(-d * d / 0.003 - age * 5.0));
    }
    heat = min(heat, 3.0);
    col = mix(col, uCore, min(heat, 1.0) * 0.75);
    b *= 1.0 + 1.2 * heat;

    float size = DOT * uLineW * px * persp * (1.0 + 0.7 * neon) * (1.0 + 0.6 * glit) * (1.0 + 0.25 * min(heat, 1.0));
    gl_PointSize = max(size, 1.0);
    vCol = enc(col * b);
}`

/* Embers: stateless particles respawned each life on the ribbon, drifting up and right. */
const EMBER_VS = `#version 300 es
precision highp float;
${COMMON}
uniform float uEmberSize;
uniform float uLife;
uniform vec2 uDrift;
out vec3 vCol;

// Share of embers drawn large, soft and dim — out of focus.
const float BOKEH = 0.07;
const float EMBER = 8.0;

void main() {
    float i = float(gl_VertexID);
    float t = uTime;
    float aspect = uRes.x / max(uRes.y, 1.0);
    float px = uRes.y / 800.0;
    float sc = max(uScale, 0.1);

    float life = mix(1.5, 4.0, h11(i * 1.31 + 0.7)) * max(uLife, 0.05);
    float tt = t / life + h11(i * 2.17 + 0.3);
    float cyc = floor(tt);
    float age = tt - cyc;
    float sd = i * 3.7 + cyc * 17.31;

    // spawn mostly round the hot core, on one of the front sheets
    float xs = 0.42 + (h11(sd + 1.0) + h11(sd + 2.0) + h11(sd + 3.0) - 1.5) * 0.62;
    float spread = h11(sd + 4.0) + h11(sd + 5.0) - 1.0;
    vec2 yz = spine(xs, int(h11(sd + 9.0) * 3.0), t);
    vec2 pos = vec2((xs - 0.5) * aspect, yz.x + spread * 0.22 * sc)
        + vec2(uDrift.x * aspect, uDrift.y) * age * mix(0.55, 1.0, h11(sd + 6.0));
    vec2 m = vec2((uMouse.x - 0.5) * aspect, uMouse.y - 0.5);
    vec2 dm = pos - m;
    float dl = length(dm);
    pos += dm / max(dl, 1e-4) * 0.03 * uHover * exp(-dl * dl / 0.02);
    gl_Position = vec4(pos.x / (aspect * 0.5), pos.y / 0.5, 0.0, 1.0);

    float sx = pos.x / aspect + 0.5;
    float core = exp(-pow((sx - 0.42) / 0.2, 2.0));
    float bokeh = step(1.0 - BOKEH, h11(sd + 8.8));
    float fade = smoothstep(0.0, 0.15, age) * (1.0 - smoothstep(0.55, 1.0, age));
    float twk = 0.65 + 0.35 * sin(t * (5.0 + 6.0 * h11(sd + 1.1)) + h11(sd) * TAU);
    vec3 col = mix(ramp(sx), mix(uAccent, uCore, h11(sd + 5.5)), 0.75 * core);
    float b = EMBER * mix(0.3, 1.0, pow(h11(sd + 3.3), 1.5)) * fade * twk
        * mix(1.0, 0.22, bokeh) * mix(0.55, 1.0, core) * (1.0 - 0.75 * abs(spread));
    gl_PointSize = max(mix(2.4, 5.2, pow(h11(sd + 7.7), 2.0)) * px * uEmberSize * mix(1.0, 3.2, bokeh), 1.0);
    vCol = enc(col * b);
}`

/* Burst sparks: PER_BURST per click, flung out from the click point, dragged
   to a stop, rising as they cool from white through orange to red. */
const BURST_VS = `#version 300 es
precision highp float;
${COMMON}
uniform float uEmberSize;
out vec3 vCol;

const int PER_BURST = 90;
const float DRAG = 2.6;
const float SPARK = 12.0;

void main() {
    int bi = gl_VertexID / PER_BURST;
    float fi = float(gl_VertexID);
    vec4 B = uBursts[bi];
    float age = uNow - B.z;
    float life = mix(0.7, 1.9, h11(fi * 1.7 + B.z));
    if (B.w <= 0.0 || age < 0.0 || age > life) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        gl_PointSize = 0.0;
        vCol = vec3(0.0);
        return;
    }
    float aspect = uRes.x / max(uRes.y, 1.0);
    float px = uRes.y / 800.0;
    float ang = TAU * h11(fi * 3.1 + B.z);
    float spd = mix(0.08, 0.5, pow(h11(fi * 5.3 + B.z), 2.0)) * (0.6 + 0.4 * min(B.w, 2.0));
    vec2 dir = vec2(cos(ang), sin(ang) * 0.75);
    vec2 pos = vec2((B.x - 0.5) * aspect, B.y - 0.5)
        + dir * spd * (1.0 - exp(-age * DRAG)) / DRAG + vec2(0.02, 0.07) * age * age;
    gl_Position = vec4(pos.x / (aspect * 0.5), pos.y / 0.5, 0.0, 1.0);

    float k = age / life;
    vec3 col = mix(mix(uCore, uAccent, smoothstep(0.0, 0.5, k)), uMid, smoothstep(0.5, 1.0, k));
    float fade = pow(1.0 - k, 1.5) * smoothstep(0.0, 0.04, age);
    float twk = 0.7 + 0.3 * sin(age * (18.0 + 10.0 * h11(fi)) + fi);
    gl_PointSize = max(mix(2.2, 4.6, h11(fi * 7.7 + B.z)) * px * uEmberSize, 1.0);
    vCol = enc(col * SPARK * fade * twk * min(B.w, 2.0));
}`

/* Round soft dot; additive. */
const POINT_FS = `#version 300 es
precision highp float;
in vec3 vCol;
out vec4 outColor;
void main() {
    vec2 d = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(d, d);
    if (r2 > 1.0) discard;
    outColor = vec4(vCol * exp(-r2 * 4.0), 1.0);
}`

const QUAD_VS = `#version 300 es
layout(location = 0) in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`

/* 2:1 downsample — four bilinear taps cover a 4×4 block, so hairlines can't slip between samples.
   On the first step, uThresh keeps only the light above it: filaments, folds and embers bloom, faces don't. */
const DOWN = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uSrcTexel;
uniform vec2 uOutRes;
uniform float uThresh;
${STORE}
out vec4 outColor;
vec3 hot(vec3 c) {
    float m = max(c.r, max(c.g, c.b));
    return c * max(m - uThresh, 0.0) / max(m, 1e-4);
}
void main() {
    vec2 uv = gl_FragCoord.xy / uOutRes;
    vec2 o = uSrcTexel;
    vec3 c = hot(dec(texture(uSrc, uv + vec2(-o.x, -o.y)).rgb)) + hot(dec(texture(uSrc, uv + vec2(o.x, -o.y)).rgb))
           + hot(dec(texture(uSrc, uv + vec2(-o.x, o.y)).rgb)) + hot(dec(texture(uSrc, uv + vec2(o.x, o.y)).rgb));
    outColor = vec4(enc(c * 0.25), 1.0);
}`

// Scene light below this (before Exposure) doesn't bloom.
const BLOOM_THRESHOLD = 0.1

/* Separable 9-tap gaussian in 5 linear fetches; uDir carries direction × spread in texels. */
const BLUR = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uDir;
uniform vec2 uOutRes;
${STORE}
out vec4 outColor;
void main() {
    vec2 uv = gl_FragCoord.xy / uOutRes;
    vec2 a = uDir * 1.3846153846 / uOutRes;
    vec2 b = uDir * 3.2307692308 / uOutRes;
    vec3 c = dec(texture(uSrc, uv).rgb) * 0.2270270270
        + (dec(texture(uSrc, uv + a).rgb) + dec(texture(uSrc, uv - a).rgb)) * 0.3162162162
        + (dec(texture(uSrc, uv + b).rgb) + dec(texture(uSrc, uv - b).rgb)) * 0.0702702703;
    outColor = vec4(enc(c), 1.0);
}`

/* Scene + bloom, film tone-map (hot colour saturates toward white), haze, vignette, grain. */
const COMP = `#version 300 es
precision highp float;
uniform sampler2D uScene;
uniform sampler2D uBloomA;
uniform sampler2D uBloomB;
uniform vec2 uRes;
uniform float uTime;
uniform float uBloom;
uniform float uExposure;
uniform vec3 uBg;
uniform vec3 uHaze;
uniform float uHazeAmt;
uniform float uCy;
uniform float uVig;
uniform float uGrain;
${STORE}
out vec4 outColor;
// Share of the blurred light added back at Edge Glow 100 %.
const float BLOOM = 1.0;
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
// Tent-filtered upsample, so one bright texel at ⅛ res spreads as a round glow, not a lit square.
vec3 up(sampler2D s, vec2 uv) {
    vec2 o = 0.5 / vec2(textureSize(s, 0));
    return 0.25 * (dec(texture(s, uv + vec2(-o.x, -o.y)).rgb) + dec(texture(s, uv + vec2(o.x, -o.y)).rgb)
        + dec(texture(s, uv + vec2(-o.x, o.y)).rgb) + dec(texture(s, uv + vec2(o.x, o.y)).rgb));
}
void main() {
    vec2 uv = gl_FragCoord.xy / uRes;
    float aspect = uRes.x / max(uRes.y, 1.0);
    vec3 L = dec(texelFetch(uScene, ivec2(gl_FragCoord.xy), 0).rgb)
        + uBloom * BLOOM * (0.5 * up(uBloomA, uv) + 0.5 * up(uBloomB, uv));
    float hz = exp(-pow((uv.y - uCy) / 0.16, 2.0)) * (0.5 + 0.7 * exp(-pow((uv.x - 0.45) / 0.3, 2.0)));
    vec3 col = uBg + uHaze * hz * uHazeAmt;
    col += vec3(1.0) - exp(-L * uExposure);
    float vd = length((uv - 0.5) * vec2(aspect, 1.0)) / max(length(vec2(aspect, 1.0) * 0.5), 1e-4);
    col *= 1.0 - uVig * smoothstep(0.35, 1.0, vd);
    float n = h21(gl_FragCoord.xy + fract(uTime * 13.7) * 311.0) - 0.5;
    // half-LSB dither always, so the long bloom falloff doesn't band on 8-bit screens
    col += n * (uGrain * 0.18 + 1.0 / 255.0);
    outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`

// Ember points drawn per unit of Particles.
const EMBERS_PER_PARTICLE = 3
// Kept in step with BURST_VS: sparks per click, and clicks alive at once.
const PER_BURST = 90
const MAX_BURSTS = 4
const MAX_RIPPLES = 8

/** Pointer events the renderer plays back. Times are seconds on the same clock as `now`. */
interface Interaction {
    now: number
    /** MAX_RIPPLES × (frame x, height, birth, 0) */
    ripples: Float32Array
    /** MAX_BURSTS × (frame x, frame y, birth, strength) */
    bursts: Float32Array
}

const NO_INTERACTION: Interaction = {
    now: 0,
    ripples: new Float32Array(MAX_RIPPLES * 4),
    bursts: new Float32Array(MAX_BURSTS * 4),
}

interface Target { tex: WebGLTexture; fb: WebGLFramebuffer; w: number; h: number }

/** Owns the GL context, the point passes and the bloom chain. Throws if a shader fails to build. */
function createRenderer(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, depth: false })
    if (!gl) return null
    const half = !!gl.getExtension("EXT_color_buffer_float")
    const store = half ? 1 : 0.25

    const program = (vs: string, fs: string) => {
        const p = gl.createProgram()!
        for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]] as const) {
            const s = gl.createShader(type)!
            gl.shaderSource(s, src)
            gl.compileShader(s)
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "compile failed")
            gl.attachShader(p, s)
            gl.deleteShader(s)
        }
        gl.linkProgram(p)
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || "link failed")
        const cache = new Map<string, WebGLUniformLocation | null>()
        const u = (name: string) => {
            if (!cache.has(name)) cache.set(name, gl.getUniformLocation(p, name))
            return cache.get(name) ?? null
        }
        return { p, u }
    }
    type Prog = ReturnType<typeof program>
    const sheet = program(SHEET_VS, POINT_FS)
    const ember = program(EMBER_VS, POINT_FS)
    const burst = program(BURST_VS, POINT_FS)
    const down = program(QUAD_VS, DOWN)
    const blur = program(QUAD_VS, BLUR)
    const comp = program(QUAD_VS, COMP)

    // Points have no attributes (gl_VertexID); full-screen passes use one triangle.
    const vaoPoints = gl.createVertexArray()
    const vaoQuad = gl.createVertexArray()
    gl.bindVertexArray(vaoQuad)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

    const makeTarget = (w: number, h: number): Target => {
        w = Math.max(1, w)
        h = Math.max(1, h)
        const tex = gl.createTexture()!
        gl.bindTexture(gl.TEXTURE_2D, tex)
        gl.texImage2D(gl.TEXTURE_2D, 0, half ? gl.RGBA16F : gl.RGBA8, w, h, 0, gl.RGBA, half ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
        const fb = gl.createFramebuffer()!
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
        return { tex, fb, w, h }
    }
    let T: Target[] = []
    const freeTargets = () => {
        for (const t of T) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb) }
        T = []
    }
    let tw = 0, th = 0
    const ensureTargets = () => {
        if (canvas.width === tw && canvas.height === th && T.length) return
        freeTargets()
        tw = canvas.width
        th = canvas.height
        const c = (d: number) => makeTarget(Math.ceil(tw / d), Math.ceil(th / d))
        // scene, ½, ¼, ¼ scratch, ⅛, ⅛ scratch
        T = [c(1), c(2), c(4), c(4), c(8), c(8)]
    }

    const target = (out: Target | null) => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, out ? out.fb : null)
        gl.viewport(0, 0, out ? out.w : canvas.width, out ? out.h : canvas.height)
    }
    const pass = (pr: Prog, out: Target | null, set: () => void) => {
        target(out)
        gl.useProgram(pr.p)
        gl.uniform1f(pr.u("uStore"), store)
        set()
        gl.drawArrays(gl.TRIANGLES, 0, 3)
    }
    const bindTex = (pr: Prog, name: string, unit: number, t: Target) => {
        gl.activeTexture(gl.TEXTURE0 + unit)
        gl.bindTexture(gl.TEXTURE_2D, t.tex)
        gl.uniform1i(pr.u(name), unit)
    }
    const downTo = (src: Target, out: Target, thresh = 0) =>
        pass(down, out, () => {
            bindTex(down, "uSrc", 0, src)
            gl.uniform1f(down.u("uThresh"), thresh)
            gl.uniform2f(down.u("uSrcTexel"), 1 / src.w, 1 / src.h)
            gl.uniform2f(down.u("uOutRes"), out.w, out.h)
        })
    const blurTo = (src: Target, out: Target, dx: number, dy: number) =>
        pass(blur, out, () => {
            bindTex(blur, "uSrc", 0, src)
            gl.uniform2f(blur.u("uDir"), dx, dy)
            gl.uniform2f(blur.u("uOutRes"), out.w, out.h)
        })

    const render = (p: GauzeBlazeProps, clock: number, mx: number, my: number, hover: number, ix: Interaction = NO_INTERACTION) => {
        ensureTargets()
        const adv = { ...DEFAULT_ADVANCED, ...(p.advanced ?? {}) }
        const ptr = { ...DEFAULT_POINTER, ...(p.pointer ?? {}) }
        const cl = (v: unknown, d: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, num(v, d)))
        const A = DEFAULT_ADVANCED
        const D = DEFAULTS
        const [S, d1, d2, t2, d3, t3] = T
        const W = canvas.width, H = canvas.height
        const wave = cl(adv.waveLength, A.waveLength, 5, 200)
        const cy = 1 - cl(adv.centerY, A.centerY, 0, 100) / 100

        const common = (pr: Prog) => {
            const u = pr.u
            const c3 = (name: string, c: RGBA) => gl.uniform3f(u(name), c[0], c[1], c[2])
            gl.useProgram(pr.p)
            gl.uniform1f(u("uStore"), store)
            gl.uniform2f(u("uRes"), W, H)
            gl.uniform1f(u("uTime"), clock)
            gl.uniform2f(u("uMouse"), mx, my)
            gl.uniform1f(u("uHover"), hover * (cl(adv.hover, A.hover, 0, 100) / 50))
            c3("uBase", parseColor(p.baseColor, parseColor(D.baseColor, [0.29, 0.3, 1, 1])))
            c3("uMid", parseColor(p.midColor, parseColor(D.midColor, [1, 0.16, 0.49, 1])))
            c3("uAccent", parseColor(p.accentColor, parseColor(D.accentColor, [1, 0.42, 0.1, 1])))
            c3("uCore", parseColor(adv.coreColor, parseColor(A.coreColor, [1, 0.83, 0.42, 1])))
            gl.uniform1f(u("uScale"), cl(p.scale, D.scale, 10, 300) / 100)
            gl.uniform1f(u("uAmp"), (cl(p.amplitude, D.amplitude, 0, 100) / 50) * 0.07)
            gl.uniform1f(u("uWave"), wave / 100)
            gl.uniform1f(u("uCy"), cy)
            // Whole wave cycles per 40 s, so the cycle closes exactly.
            gl.uniform1f(u("uTravel"), Math.max(1, Math.round((cl(adv.travel, A.travel, 0, 50) * 40) / wave)))
            gl.uniform1f(u("uBreathe"), cl(adv.breathe, A.breathe, 0, 100) / 100)
            gl.uniform1f(u("uBreatheT"), cl(adv.breatheMs, A.breatheMs, 500, 60000) / 1000)
            gl.uniform1f(u("uLift"), cl(adv.pointerLift, A.pointerLift, 0, 100) / 100)
            gl.uniform1f(u("uPRad"), cl(adv.pointerRadius, A.pointerRadius, 2, 100) / 100)
            gl.uniform1f(u("uCoreGain"), cl(adv.coreGain, A.coreGain, 50, 400) / 100)
            gl.uniform1f(u("uNow"), ix.now)
            gl.uniform4fv(u("uImp"), ix.ripples)
            gl.uniform4fv(u("uBursts"), ix.bursts)
        }

        target(S)
        gl.clearColor(0, 0, 0, 1)
        gl.clear(gl.COLOR_BUFFER_BIT)
        gl.enable(gl.BLEND)
        gl.blendFunc(gl.ONE, gl.ONE)
        gl.bindVertexArray(vaoPoints)

        // ~1 CSS px between dots along a strand at any size or pixel ratio.
        const cssW = canvas.clientWidth || W
        const samples = Math.round(Math.max(160, Math.min(2000, cssW * 1.1)))
        const sheets = Math.round(cl(adv.sheets, A.sheets, 1, 6))
        const lines = Math.round(cl(adv.lineCount, A.lineCount, 4, 200))
        common(sheet)
        {
            const u = sheet.u
            gl.uniform1f(u("uSamples"), samples)
            gl.uniform1f(u("uLines"), lines)
            gl.uniform1f(u("uLineW"), cl(adv.lineWidth, A.lineWidth, 20, 400) / 100)
            gl.uniform1f(u("uLineA"), cl(adv.lineOpacity, A.lineOpacity, 0, 100) / 100)
            gl.uniform1f(u("uWidth"), cl(adv.ribbonWidth, A.ribbonWidth, 2, 60) / 100)
            gl.uniform1f(u("uTwistLen"), cl(adv.twistLength, A.twistLength, 5, 300) / 100)
            gl.uniform1f(u("uTwistT"), cl(adv.twistMs, A.twistMs, 500, 60000) / 1000)
            gl.uniform1f(u("uEdge"), cl(adv.edgeGlow, A.edgeGlow, 0, 300) / 100)
            gl.uniform1f(u("uBack"), cl(adv.backDim, A.backDim, 0, 100) / 100)
            gl.uniform1f(u("uSpeck"), cl(adv.speckle, A.speckle, 0, 100) / 100)
            gl.uniform1f(u("uHeat"), cl(ptr.heat, DEFAULT_POINTER.heat, 0, 10) / 5)
        }
        gl.drawArrays(gl.POINTS, 0, sheets * lines * samples)

        const embers = Math.round(cl(p.particles, D.particles, 0, 400)) * EMBERS_PER_PARTICLE
        if (embers > 0) {
            common(ember)
            const u = ember.u
            gl.uniform1f(u("uEmberSize"), cl(adv.emberSize, A.emberSize, 10, 400) / 100)
            gl.uniform2f(u("uDrift"), cl(adv.emberDrift, A.emberDrift, 0, 10) / 100, cl(adv.emberRise, A.emberRise, 0, 10) / 100)
            gl.uniform1f(u("uLife"), cl(adv.emberLife, A.emberLife, 20, 400) / 100)
            gl.drawArrays(gl.POINTS, 0, embers)
        }
        if (ix.bursts.some((v, i) => i % 4 === 3 && v > 0)) {
            common(burst)
            gl.uniform1f(burst.u("uEmberSize"), cl(adv.emberSize, A.emberSize, 10, 400) / 100)
            gl.drawArrays(gl.POINTS, 0, MAX_BURSTS * PER_BURST)
        }
        gl.disable(gl.BLEND)
        gl.bindVertexArray(vaoQuad)

        // Bloom: ½ → ¼ → ⅛, blurring the ¼ and ⅛ levels. Glow Size widens the taps.
        const spread = cl(adv.glowSize, A.glowSize, 1, 40) / 24
        downTo(S, d1, BLOOM_THRESHOLD)
        downTo(d1, d2)
        downTo(d2, d3)
        blurTo(d2, t2, spread, 0)
        blurTo(t2, d2, 0, spread)
        blurTo(d3, t3, spread, 0)
        blurTo(t3, d3, 0, spread)
        blurTo(d3, t3, spread * 1.6, 0)
        blurTo(t3, d3, 0, spread * 1.6)

        pass(comp, null, () => {
            const u = comp.u
            const bg = parseColor(p.background, parseColor(D.background, [0.01, 0.01, 0.03, 1]))
            const hz = parseColor(adv.hazeColor, parseColor(A.hazeColor, [0.1, 0.04, 0.18, 1]))
            bindTex(comp, "uScene", 0, S)
            bindTex(comp, "uBloomA", 1, d2)
            bindTex(comp, "uBloomB", 2, d3)
            gl.uniform2f(u("uRes"), W, H)
            gl.uniform1f(u("uTime"), clock)
            gl.uniform1f(u("uBloom"), cl(adv.edgeGlow, A.edgeGlow, 0, 300) / 100)
            gl.uniform1f(u("uExposure"), cl(adv.exposure, A.exposure, 10, 500) / 100)
            gl.uniform3f(u("uBg"), bg[0], bg[1], bg[2])
            gl.uniform3f(u("uHaze"), hz[0], hz[1], hz[2])
            gl.uniform1f(u("uHazeAmt"), cl(adv.haze, A.haze, 0, 200) / 100)
            gl.uniform1f(u("uCy"), cy)
            gl.uniform1f(u("uVig"), cl(adv.vignette, A.vignette, 0, 100) / 100)
            gl.uniform1f(u("uGrain"), cl(adv.grain, A.grain, 0, 100) / 100)
        })
    }

    const dispose = () => {
        freeTargets()
        for (const pr of [sheet, ember, burst, down, blur, comp]) gl.deleteProgram(pr.p)
        gl.deleteBuffer(buf)
        gl.deleteVertexArray(vaoPoints)
        gl.deleteVertexArray(vaoQuad)
    }
    return { render, dispose }
}

// ── /renderer ──

// Stir: seconds between ripples while moving, pointer speed (frames/s) below
// which none launch, and the tallest ripple (frame heights) at Stir 5.
const RIPPLE_EVERY = 0.07
const RIPPLE_MIN_SPEED = 0.15
const RIPPLE_MAX = 0.07
// Height of the kick a click gives the ribbon, per unit of burst strength.
const BURST_KICK = 0.045

export interface GauzeBlazeProps {
    background?: string
    baseColor?: string
    midColor?: string
    accentColor?: string
    /** Embers thrown off the ribbon. */
    particles?: number
    /** Height of the ribbon's waves. */
    amplitude?: number
    /** Size of the whole ribbon: wave length, width and twist together. */
    scale?: number
    /** Plays the hand-rolled rAF loop faster or slower; there is no Transition row because nothing here is framer-motion. */
    speed?: number
    /** The cursor as a flame: Heat warms the gauze under it, Stir sends ripples along the sheets, Burst flares on click. */
    pointer?: Partial<typeof DEFAULT_POINTER>
    advanced?: Partial<typeof DEFAULT_ADVANCED>
    style?: CSSProperties
}

function __OriginkitBase_GauzeBlaze(props: GauzeBlazeProps) {
    // Everything else is read live from propsRef each frame.
    const { background = DEFAULTS.background, style } = props
    const rootRef = useRef<HTMLDivElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const propsRef = useRef(props)
    propsRef.current = props

    useEffect(() => {
        const root = rootRef.current
        const canvas = canvasRef.current
        if (!root || !canvas) return
        let r: ReturnType<typeof createRenderer> = null
        try {
            r = createRenderer(canvas)
        } catch (err) {
            console.error("GauzeBlaze:", err)
        }
        if (!r) return
        const renderer = r
        const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches

        const resize = () => {
            const dpr = Math.min(window.devicePixelRatio || 1, 2)
            canvas.width = Math.max(1, Math.round(root.offsetWidth * dpr))
            canvas.height = Math.max(1, Math.round(root.offsetHeight * dpr))
        }
        const ro = new ResizeObserver(resize)
        ro.observe(root)
        resize()

        // Off-screen, skip the frame entirely.
        let visible = true
        const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting })
        io.observe(root)

        let mx = 0.5, my = 0.5, tx = 0.5, ty = 0.5, over = 0, hov = 0
        const t0 = performance.now()
        const ix: Interaction = { now: 0, ripples: new Float32Array(MAX_RIPPLES * 4), bursts: new Float32Array(MAX_BURSTS * 4) }
        let rippleAt = 0, burstAt = 0, lastRipple = -1
        const pointerOf = () => ({ ...DEFAULT_POINTER, ...(propsRef.current.pointer ?? {}) })
        const ripple = (x: number, height: number) => {
            ix.ripples.set([x, height, ix.now, 0], rippleAt * 4)
            rippleAt = (rippleAt + 1) % MAX_RIPPLES
        }
        const place = (e: PointerEvent) => {
            const b = root.getBoundingClientRect()
            if (b.width <= 0 || b.height <= 0) return false
            tx = (e.clientX - b.left) / b.width
            ty = 1 - (e.clientY - b.top) / b.height
            return true
        }
        const onMove = (e: PointerEvent) => {
            if (place(e)) over = 1
        }
        const onLeave = () => { over = 0 }
        const onDown = (e: PointerEvent) => {
            if (!place(e)) return
            over = 1
            const s = Math.max(0, Math.min(10, num(pointerOf().burst, DEFAULT_POINTER.burst))) / 5
            if (s <= 0) return
            ix.bursts.set([tx, ty, ix.now, s], burstAt * 4)
            burstAt = (burstAt + 1) % MAX_BURSTS
            // the flare kicks the ribbon too
            ripple(tx, BURST_KICK * s)
        }
        // A touch has no hover: let the heat go once the finger lifts.
        const onUp = (e: PointerEvent) => { if (e.pointerType !== "mouse") over = 0 }
        root.addEventListener("pointermove", onMove)
        root.addEventListener("pointerleave", onLeave)
        root.addEventListener("pointerdown", onDown)
        root.addEventListener("pointerup", onUp)
        let ptx = tx, pty = ty

        let clock = 0
        let raf = 0
        let last = -1
        const frame = (now: number) => {
            raf = requestAnimationFrame(frame)
            const dt = last < 0 ? 0 : Math.min((now - last) / 1000, 1 / 20)
            last = now
            if (!visible) return
            const p = propsRef.current
            clock = (clock + dt * (Math.max(0, Math.min(100, num(p.speed, DEFAULTS.speed))) / 50) * (reduced ? 0.25 : 1)) % 3600
            const k = 1 - Math.exp(-dt * 6)
            mx += (tx - mx) * k
            my += (ty - my) * k
            hov += (over - hov) * k

            // Stir: while the pointer moves, launch a ripple every RIPPLE_EVERY s,
            // its height from the pointer's speed — vertical moves push the
            // ribbon their way, sweeps across lift it toward the pointer's side.
            ix.now = (now - t0) / 1000
            const vx = dt > 0 ? (tx - ptx) / dt : 0
            const vy = dt > 0 ? (ty - pty) / dt : 0
            ptx = tx
            pty = ty
            const stir = Math.max(0, Math.min(10, num(pointerOf().stir, DEFAULT_POINTER.stir))) / 5
            if (over && stir > 0 && ix.now - lastRipple > RIPPLE_EVERY && Math.hypot(vx, vy) > RIPPLE_MIN_SPEED) {
                const restY = 1 - Math.max(0, Math.min(100, num(p.advanced?.centerY, DEFAULT_ADVANCED.centerY))) / 100
                const h = vy * 0.02 + Math.abs(vx) * 0.008 * (ty > restY ? 1 : -1)
                ripple(tx, Math.max(-RIPPLE_MAX, Math.min(RIPPLE_MAX, h)) * stir)
                lastRipple = ix.now
            }
            renderer.render(p, clock, mx, my, hov, ix)
        }
        raf = requestAnimationFrame(frame)
        return () => {
            cancelAnimationFrame(raf)
            ro.disconnect()
            io.disconnect()
            root.removeEventListener("pointermove", onMove)
            root.removeEventListener("pointerleave", onLeave)
            root.removeEventListener("pointerdown", onDown)
            root.removeEventListener("pointerup", onUp)
            renderer.dispose()
        }
    }, [])

    return (
        <div ref={rootRef} style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", background, ...style }}>
            <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />
        </div>
    )
}

const A = DEFAULT_ADVANCED

const __originkitPresetProps = {
  "speed": 20
};

export default function GauzeBlaze(props: Record<string, unknown>) {
  return <__OriginkitBase_GauzeBlaze {...(__originkitPresetProps as Record<string, unknown>)} {...props} />;
}
