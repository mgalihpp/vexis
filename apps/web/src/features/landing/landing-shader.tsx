import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const VERTEX = "attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }";

// One shader, three looks: 0 aurora bands, 1 light streaks, 2 aurora under a globe grid.
// Output is light on black, composited with mix-blend-mode: screen, so black is see-through.
const FRAGMENT = `
precision highp float;
uniform vec2 res;
uniform float t;
uniform int mode;

// Brand lime, a deeper moss lime and the profit green; nothing outside the Vexis palette.
const vec3 LIME = vec3(0.73, 0.96, 0.28);
const vec3 MOSS = vec3(0.37, 0.6, 0.12);
const vec3 GREEN = vec3(0.16, 0.78, 0.5);

float hash(float n) { return fract(sin(n) * 43758.5453); }
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), f.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v / 0.875;
}

vec3 aurora(vec2 uv, float aspect) {
  float x = uv.x * aspect;
  vec3 col = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    vec3 c = i == 0 ? MOSS : i == 1 ? GREEN : i == 2 ? LIME : MOSS;
    float center = 0.18 + fi * 0.17 + 0.07 * sin(x * 1.3 + t * 0.15 + fi * 2.1) + 0.12 * (fbm(vec2(x * 0.6 - t * 0.04, fi * 4.0)) - 0.5);
    float d = (uv.y - center) / (0.06 + 0.03 * fi);
    float band = exp(-d * d);
    // Stretched noise gives the bands their horizontal, brushed texture.
    float grain = fbm(vec2(x * 0.9 - t * (0.05 + fi * 0.02), uv.y * 5.0 + fi * 7.0));
    col += c * band * (0.3 + 0.8 * grain) * (i == 2 ? 0.6 : 0.85);
  }
  return col;
}

vec3 streaks(vec2 uv) {
  vec3 col = vec3(0.0);
  for (int i = 0; i < 9; i++) {
    float fi = float(i);
    float y = 0.2 + 0.6 * hash(fi * 3.17);
    float speed = 0.03 + 0.05 * hash(fi * 7.1);
    float cx = fract(hash(fi * 1.9) + t * speed) * 1.8 - 0.4;
    float len = 0.12 + 0.3 * hash(fi * 5.3);
    float thick = (1.2 + 2.6 * hash(fi * 9.7)) / res.y;
    float dy = (uv.y - y) / thick;
    float dx = (uv.x - cx) / len;
    float core = exp(-dy * dy) * exp(-dx * dx);
    float trail = exp(-dy * dy * 0.08) * exp(-dx * dx * 0.15) * 0.08;
    float pick = hash(fi * 11.3);
    vec3 c = pick < 0.5 ? mix(GREEN, LIME, smoothstep(-1.0, 1.0, dx)) : pick < 0.85 ? LIME : MOSS;
    col += c * (core + trail) * (0.5 + 0.8 * hash(fi * 2.3));
    col += vec3(1.0) * pow(core, 6.0) * 0.6;
  }
  return col;
}

float globe(vec2 uv, float aspect) {
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y + 0.75);
  float r = length(p);
  float lines = 0.0;
  for (int i = 1; i < 6; i++) {
    float d = (r - 0.35 * float(i)) * res.y * 0.9;
    lines += exp(-d * d);
  }
  float R = 1.9;
  float h = sqrt(max(R * R - p.y * p.y, 0.0));
  for (int i = -4; i < 5; i++) {
    float lx = h * sin(float(i) * 0.33 + t * 0.02);
    float d = (p.x - lx) * res.y * 0.9;
    lines += exp(-d * d);
  }
  return lines * step(r, R);
}

void main() {
  vec2 uv = gl_FragCoord.xy / res;
  float aspect = res.x / res.y;
  vec3 col = mode == 1 ? streaks(uv) : aurora(uv, aspect);
  if (mode == 2) col += LIME * globe(uv, aspect) * 0.18;
  gl_FragColor = vec4(col, 1.0);
}
`;

const MODES = { aurora: 0, streaks: 1, globe: 2 } as const;

export function Shader({ mode, className }: { mode: keyof typeof MODES; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    const gl = el?.getContext("webgl", { antialias: false, premultipliedAlpha: false });
    if (!el || !gl) return;

    const shader = (type: number, source: string) => {
      const s = gl.createShader(type);
      if (!s) return null;
      gl.shaderSource(s, source);
      gl.compileShader(s);
      return s;
    };
    const vs = shader(gl.VERTEX_SHADER, VERTEX);
    const fs = shader(gl.FRAGMENT_SHADER, FRAGMENT);
    const program = gl.createProgram();
    if (!vs || !fs || !program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    // biome-ignore lint/correctness/useHookAtTopLevel: WebGL's useProgram, not a React hook
    gl.useProgram(program);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "p");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const res = gl.getUniformLocation(program, "res");
    const time = gl.getUniformLocation(program, "t");
    gl.uniform1i(gl.getUniformLocation(program, "mode"), MODES[mode]);

    // The soft looks hide a lower resolution; streaks need full pixels to stay thin.
    const scale = mode === "streaks" ? Math.min(window.devicePixelRatio, 1.5) : 0.35;
    const resize = () => {
      el.width = Math.max(1, Math.round(el.clientWidth * scale));
      el.height = Math.max(1, Math.round(el.clientHeight * scale));
      gl.viewport(0, 0, el.width, el.height);
      gl.uniform2f(res, el.width, el.height);
    };
    const draw = (ms: number) => {
      gl.uniform1f(time, 20 + ms / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let visible = false;
    const loop = (ms: number) => {
      draw(ms);
      frame = requestAnimationFrame(loop);
    };
    const update = () => {
      cancelAnimationFrame(frame);
      if (still) draw(0);
      else if (visible && !document.hidden) frame = requestAnimationFrame(loop);
    };

    const ro = new ResizeObserver(() => {
      resize();
      update();
    });
    ro.observe(el);
    const io = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false;
      update();
    });
    io.observe(el);
    document.addEventListener("visibilitychange", update);

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, [mode]);

  return <canvas ref={canvas} className={cn("vx-shader", className)} />;
}
