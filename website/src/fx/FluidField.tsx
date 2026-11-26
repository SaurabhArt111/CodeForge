/* eslint-disable */
// Fluid Field — Originkit

"use client"

import * as React from "react"
import { useEffect, useRef } from "react"

/**
 * FluidField — a soft beam of light dragged through a noise-warped plane.
 *
 * Two noise fields, one feeding the other. The plane is first DISPLACED by a
 * pair of simplex samples taken at `+t` and `-t`, so the space itself churns in
 * two directions at once; only then is the beam evaluated in that warped space.
 * Sampling the beam first and blurring it afterwards gives a smeared streak;
 * warping the domain first is what makes it read as fluid, with the beam folding
 * back on itself.
 *
 * The beam is one noise sample along `st.x + st.y * 1.5`, a diagonal, pushed by
 * time — so it is a travelling wavefront rather than a static gradient — and its
 * colour comes from a THIRD noise field, which is why the sheet drifts between
 * the two colour dials instead of holding one tint.
 *
 * What the port changed, and why:
 *
 *  - The source runs the whole thing through Three.js: a WebGLRenderer, an
 *    OrthographicCamera, a PlaneGeometry and a ShaderMaterial, all to draw one
 *    fullscreen quad. That is a 600KB dependency resolved from a CDN at paste
 *    time for a single `drawArrays`. Raw WebGL here, and the file reads end to
 *    end (rule 10).
 *  - It sized itself from `window.innerWidth/innerHeight` and only resized on a
 *    window event, which a Framer instance never gets. Sized from the injected
 *    width/height every frame.
 *  - `clock.getElapsedTime()` is a wall clock with no rate control and no dt.
 *    Accumulated dt with a Speed dial now.
 *  - The three hard-coded `vec3`s are three dials.
 *
 * Interaction (asked for; the source has none): the cursor SWIRLS the domain. A
 * rotation is applied to the sample position, falling off with distance — the
 * same species of displacement the noise warp already performs — so the beam
 * bends around the pointer as fluid rather than lighting up under it. Framer's
 * editor swallows pointer events, so it is PREVIEW-only; the resting frame is
 * unchanged.
 *
 * Ported from the Structure Flow family ("fluid-field", the Aura UI source).
 */

const MAX_DPR = 2

const VERT_SRC = `
attribute vec2 a_pos;
void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }
`

// Ashima/Gustavson 2D simplex, as the source carries it inline.
const SNOISE = `
vec3 mod289(vec3 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x){ return mod289(((x * 34.0) + 1.0) * x); }

float snoise(vec2 v){
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
`

const FRAG_SRC = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2  uRes;
uniform float uTime, uScale, uWarp, uBeam, uGlowK, uHover;
uniform vec2  uPtr;   // aspect-corrected uv space
uniform vec3  uBg, uBase, uAccent;

${SNOISE}

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  uv.x *= uRes.x / max(uRes.y, 1.0);

  // Warp the DOMAIN first; sampling the beam and smearing it afterwards is what
  // makes a streak instead of a fluid.
  vec2 st = uv * 0.7 * uScale;
  st += vec2(snoise(st + uTime * 0.05), snoise(st - uTime * 0.05)) * 0.3 * uWarp;

  // The cursor SWIRLS the domain — a rotation applied to the sample position,
  // falling off with distance. It is the same kind of displacement the noise warp
  // already performs, so the beam bends around the pointer as fluid instead of
  // being brightened by it.
  vec2 d = uv - uPtr;
  float swirl = exp(-dot(d, d) / 0.06) * uHover;
  st += vec2(-d.y, d.x) * swirl * 1.2;

  float lo = 0.1;
  float hi = max(lo + 0.02, 0.1 + 0.7 * uBeam);
  float beam = smoothstep(lo, hi, snoise(vec2(st.x + st.y * 1.5 - uTime * 0.15, uTime * 0.02)));

  vec3 glow = mix(uBase, uAccent, snoise(uv * 1.5 + uTime * 0.1) * 0.5 + 0.5);

  gl_FragColor = vec4(uBg + glow * beam * 0.7 * uGlowK, 1.0);
}
`

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
    const sh = gl.createShader(type)
    if (!sh) return null
    gl.shaderSource(sh, src)
    gl.compileShader(sh)
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error("FluidField shader:", gl.getShaderInfoLog(sh))
        gl.deleteShader(sh)
        return null
    }
    return sh
}

function parseColor(input: string | undefined, fb: [number, number, number]): [number, number, number] {
    if (!input) return fb
    const str = String(input).trim()
    if (str.charAt(0) === "#") {
        let hex = str.slice(1)
        if (hex.length === 3 || hex.length === 4) {
            hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]
        }
        if (hex.length >= 6) {
            const r = parseInt(hex.slice(0, 2), 16)
            const g = parseInt(hex.slice(2, 4), 16)
            const b = parseInt(hex.slice(4, 6), 16)
            if (!isNaN(r) && !isNaN(g) && !isNaN(b)) return [r / 255, g / 255, b / 255]
        }
        return fb
    }
    const m = str.match(/[\d.]+/g)
    if (m && m.length >= 3) {
        return [
            Math.min(255, parseFloat(m[0])) / 255,
            Math.min(255, parseFloat(m[1])) / 255,
            Math.min(255, parseFloat(m[2])) / 255,
        ]
    }
    return fb
}

function num(v: unknown, fb: number): number {
    return typeof v === "number" && isFinite(v) ? v : fb
}

function clampN(v: number, lo: number, hi: number): number {
    return v < lo ? lo : v > hi ? hi : v
}

type FlowGroup = { scale?: number; warp?: number; beam?: number; glow?: number }
const FLOW_DEFAULTS: Required<FlowGroup> = { scale: 87, warp: 100, beam: 154, glow: 400 }

interface Props {
    style?: React.CSSProperties
    width?: number
    height?: number
    background?: string
    baseColor?: string
    accentColor?: string
    speed?: number
    hover?: number
    flow?: FlowGroup
}

function __OriginkitBase_FluidField(props: Props) {
    const {
        style,
        background = "#030305",
        baseColor = "#2640D9",
        accentColor = "#6633E6",
        speed = 100,
        hover = 185,
        flow,
        width,
        height,
    } = props

    // A group the designer never opened arrives undefined; spread-merging over a
    // typed literal beats a hand-written ?? chain, where one missed key silently
    // pins a control forever.
    const flow_ = { ...FLOW_DEFAULTS, ...(flow || {}) }

    const canvasRef = useRef<HTMLCanvasElement>(null)
    const ptrRef = useRef({ tx: 0.5, ty: 0.5, x: 0.5, y: 0.5, on: 0, onS: 0 })
    const sizeRef = useRef({ w: 0, h: 0 })
    sizeRef.current = { w: num(width, 0), h: num(height, 0) }

    // Every live input is read from a ref inside the loop. Putting any of them in
    // the effect deps would rebuild the GL context on every colour tweak.
    const vRef = useRef<Record<string, number | string>>({})
    vRef.current = {
        bg: background,
        base: baseColor,
        accent: accentColor,
        speed: clampN(num(speed, 50), 0, 100) / 50,
        hover: clampN(num(hover, 100), 0, 200) / 100,
        scale: clampN(num(flow_.scale, 100), 20, 400) / 100,
        warp: clampN(num(flow_.warp, 100), 0, 400) / 100,
        beam: clampN(num(flow_.beam, 100), 10, 300) / 100,
        glow: clampN(num(flow_.glow, 100), 0, 400) / 100,
    }

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: false })
        if (!gl) {
            console.error("FluidField: WebGL unavailable")
            return
        }

        const vs = compile(gl, gl.VERTEX_SHADER, VERT_SRC)
        const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC)
        if (!vs || !fs) return
        const prog = gl.createProgram()
        if (!prog) return
        gl.attachShader(prog, vs)
        gl.attachShader(prog, fs)
        gl.linkProgram(prog)
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            console.error("FluidField link:", gl.getProgramInfoLog(prog))
            return
        }
        gl.useProgram(prog)

        const buf = gl.createBuffer()
        gl.bindBuffer(gl.ARRAY_BUFFER, buf)
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
        const aPos = gl.getAttribLocation(prog, "a_pos")
        gl.enableVertexAttribArray(aPos)
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

        const locs: Record<string, WebGLUniformLocation | null> = {}
        const u = (name: string) => {
            if (!(name in locs)) locs[name] = gl.getUniformLocation(prog, name)
            return locs[name]
        }

        let raf = 0
        let last = performance.now()
        // CodeForge site: skip frames while scrolled out of view, and calm the motion for prefers-reduced-motion
        let visible = true
        const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting })
        io.observe(canvas)
        const calm = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0.2 : 1
        let clock = 0
        const PTR_RATE = 5.0 // 1/s, how fast the swirl follows

        const render = (now: number) => {
            const dt = Math.min(0.05, (now - last) / 1000)
            last = now
            if (!visible) { raf = requestAnimationFrame(render); return }
            const v = vRef.current
            clock = (clock + dt * (v.speed as number) * calm) % 31416

            const ptr = ptrRef.current
            const k = 1 - Math.exp(-dt * PTR_RATE)
            ptr.x += (ptr.tx - ptr.x) * k
            ptr.y += (ptr.ty - ptr.y) * k
            // Presence, not just position: at rest the pointer's "position" is the
            // centre of the frame, so without this gate the effect would sit in the
            // middle of an untouched component and the resting frame would not be
            // the source's.
            ptr.onS += (ptr.on - ptr.onS) * k

            const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
            const cw = sizeRef.current.w || canvas.clientWidth || 1200
            const ch = sizeRef.current.h || canvas.clientHeight || 800
            const bw = Math.max(1, Math.round(cw * dpr))
            const bh = Math.max(1, Math.round(ch * dpr))
            if (canvas.width !== bw || canvas.height !== bh) {
                canvas.width = bw
                canvas.height = bh
            }
            gl.viewport(0, 0, bw, bh)

            gl.uniform2f(u("uRes"), bw, bh)
            gl.uniform1f(u("uTime"), clock)
            gl.uniform1f(u("uScale"), v.scale as number)
            gl.uniform1f(u("uWarp"), v.warp as number)
            gl.uniform1f(u("uBeam"), v.beam as number)
            gl.uniform1f(u("uGlowK"), v.glow as number)
            gl.uniform1f(u("uHover"), (v.hover as number) * ptr.onS)
            // the shader's uv has x scaled by aspect and y measured from the bottom
            gl.uniform2f(u("uPtr"), ptr.x * (bw / Math.max(bh, 1)), 1 - ptr.y)
            const cg = parseColor(v.bg as string, [0.012, 0.012, 0.02])
            const cb = parseColor(v.base as string, [0.15, 0.25, 0.85])
            const ca = parseColor(v.accent as string, [0.4, 0.2, 0.9])
            gl.uniform3f(u("uBg"), cg[0], cg[1], cg[2])
            gl.uniform3f(u("uBase"), cb[0], cb[1], cb[2])
            gl.uniform3f(u("uAccent"), ca[0], ca[1], ca[2])

            gl.drawArrays(gl.TRIANGLES, 0, 3)
            raf = requestAnimationFrame(render)
        }

        // The rect RATIO is zoom-invariant — offset and size scale together — so
        // this is safe on a zoomed Framer canvas where absolute px are not.
        const track = (e: PointerEvent) => {
            const r = canvas.getBoundingClientRect()
            if (r.width <= 0 || r.height <= 0) return
            ptrRef.current.tx = clampN((e.clientX - r.left) / r.width, 0, 1)
            ptrRef.current.ty = clampN((e.clientY - r.top) / r.height, 0, 1)
            ptrRef.current.on = 1
        }
        const onLeave = () => {
            ptrRef.current.tx = 0.5
            ptrRef.current.ty = 0.5
            ptrRef.current.on = 0
        }
        canvas.addEventListener("pointermove", track)
        canvas.addEventListener("pointerenter", track)
        canvas.addEventListener("pointerleave", onLeave)

        raf = requestAnimationFrame(render)

        // Never loseContext(): getContext returns the same context per canvas, so
        // StrictMode's mount -> cleanup -> mount would reuse a force-lost one.
        return () => {
            cancelAnimationFrame(raf)
            io.disconnect()
            canvas.removeEventListener("pointermove", track)
            canvas.removeEventListener("pointerenter", track)
            canvas.removeEventListener("pointerleave", onLeave)
        }
    }, [])

    return (
        <div
            style={{
                position: "relative",
                overflow: "hidden",
                background,
                width: typeof width === "number" && width > 0 ? width : "100%",
                height: typeof height === "number" && height > 0 ? height : "100%",
                ...style,
            }}
        >
            <canvas
                ref={canvasRef}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }}
            />
        </div>
    )
}

const __originkitPresetProps = {
  "flow": {
    "beam": 154,
    "glow": 400,
    "warp": 100,
    "scale": 160
  }
};

export default function FluidField(props: Record<string, unknown>) {
  return <__OriginkitBase_FluidField {...(__originkitPresetProps as Record<string, unknown>)} {...props} />;
}
