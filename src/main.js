import * as THREE from "three";
import "./styles.css";

const canvas = document.querySelector("#lake");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
});

renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const clock = new THREE.Clock();
const rippleSlots = Array.from({ length: 20 }, () => new THREE.Vector3(-10, -10, -100));
const lakeTexture = await new THREE.TextureLoader().loadAsync("/alpine-lake.webp");
lakeTexture.colorSpace = THREE.SRGBColorSpace;
lakeTexture.minFilter = THREE.LinearFilter;
lakeTexture.magFilter = THREE.LinearFilter;

const uniforms = {
  uTime: { value: 0 },
  uResolution: { value: new THREE.Vector2() },
  uTexture: { value: lakeTexture },
  uPointer: { value: new THREE.Vector2(0.5, 0.25) },
  uSceneOffset: { value: new THREE.Vector2() },
  uRipples: { value: rippleSlots },
  uMood: { value: 2 },
  uStill: { value: reducedMotion ? 1 : 0 },
};

const material = new THREE.ShaderMaterial({
  uniforms,
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    precision highp float;

    varying vec2 vUv;
    uniform sampler2D uTexture;
    uniform float uTime;
    uniform float uMood;
    uniform float uStill;
    uniform vec2 uResolution;
    uniform vec2 uPointer;
    uniform vec2 uSceneOffset;
    uniform vec3 uRipples[20];

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + 1.0), f.x),
        f.y
      );
    }

    vec2 coverUv(vec2 uv) {
      float screenAspect = uResolution.x / max(uResolution.y, 1.0);
      float imageAspect = 1.7777778;
      vec2 scale = vec2(
        min(screenAspect / imageAspect, 1.0),
        min(imageAspect / screenAspect, 1.0)
      );
      return (uv - 0.5) * scale + 0.5;
    }

    float rippleField(vec2 uv) {
      float field = 0.0;
      float aspect = uResolution.x / max(uResolution.y, 1.0);

      for (int i = 0; i < 20; i++) {
        float age = uTime - uRipples[i].z;
        vec2 delta = uv - uRipples[i].xy;
        delta.x *= aspect;
        float d = length(delta);
        float radius = age * 0.105;
        float ring = sin((d - radius) * 145.0);
        float band = exp(-abs(d - radius) * 19.0);
        float wake = exp(-d * 4.6);
        float life = exp(-age * 0.58) * step(0.0, age) * step(age, 7.0);
        field += ring * band * wake * life;
      }
      return field;
    }

    float waterHeight(vec2 uv, float time) {
      float aspect = uResolution.x / max(uResolution.y, 1.0);
      vec2 p = vec2(uv.x * aspect, uv.y);
      float broad = sin(p.x * 42.0 + p.y * 21.0 + time * 0.65) * 0.018;
      broad += sin(p.x * 71.0 - p.y * 34.0 - time * 0.42) * 0.01;
      broad += (noise(p * 35.0 + vec2(time * 0.07, 0.0)) - 0.5) * 0.025;
      return broad + rippleField(uv) * 0.12;
    }

    vec3 gradeTime(vec3 color, float mood, vec2 uv) {
      vec3 night = color * vec3(0.18, 0.28, 0.44) + vec3(0.005, 0.012, 0.035);
      vec3 dawn = color * vec3(0.72, 0.58, 0.54) + vec3(0.12, 0.055, 0.025);
      vec3 day = color;
      vec3 dusk = color * vec3(0.60, 0.43, 0.48) + vec3(0.12, 0.045, 0.04);

      vec3 result = night;
      if (mood > 0.5) result = dawn;
      if (mood > 1.5) result = day;
      if (mood > 2.5) result = dusk;

      float horizonGlow = exp(-abs(uv.y - 0.46) * 11.0);
      if (mood > 0.5 && mood < 1.5) result += vec3(0.20, 0.09, 0.035) * horizonGlow;
      if (mood > 2.5) result += vec3(0.18, 0.055, 0.025) * horizonGlow;
      return result;
    }

    void main() {
      vec2 uv = vUv;
      float time = mix(uTime, 8.0, uStill);
      float waterMask = 1.0 - smoothstep(0.43, 0.51, uv.y);
      vec2 pixel = vec2(1.35) / uResolution;
      float center = waterHeight(uv, time);
      float right = waterHeight(uv + vec2(pixel.x, 0.0), time);
      float above = waterHeight(uv + vec2(0.0, pixel.y), time);
      vec2 normal = vec2(right - center, above - center) * 18.0;

      vec2 parallax = uSceneOffset * mix(0.006, 0.015, uv.y);
      vec2 sampleUv = coverUv(uv + parallax);
      sampleUv += normal * 0.038 * waterMask;

      vec3 color = texture2D(uTexture, sampleUv).rgb;

      float crest = max(0.0, -normal.x * 0.6 + normal.y * 0.8);
      float trough = max(0.0, normal.x * 0.45 - normal.y * 0.55);
      color += vec3(0.66, 0.80, 0.86) * pow(crest, 1.6) * waterMask * 0.75;
      color -= vec3(0.05, 0.11, 0.14) * trough * waterMask * 0.7;

      float sparkle = pow(max(0.0, crest), 8.0);
      sparkle *= step(0.89, hash(floor(gl_FragCoord.xy * 0.45) + floor(time * 8.0)));
      color += vec3(1.0, 0.93, 0.75) * sparkle * waterMask;

      color = gradeTime(color, uMood, uv);
      float vignette = smoothstep(0.95, 0.25, distance(uv, vec2(0.5)));
      color *= 0.78 + vignette * 0.24;
      color += (hash(gl_FragCoord.xy + time) - 0.5) / 255.0;

      gl_FragColor = vec4(color, 1.0);
    }
  `,
});

scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
document.documentElement.classList.add("is-loaded");

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.getDrawingBufferSize(uniforms.uResolution.value);
}

addEventListener("resize", resize);
resize();

function render() {
  uniforms.uTime.value = clock.getElapsedTime();
  uniforms.uSceneOffset.value.lerp(sceneTarget, 0.035);
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}

const pointer = new THREE.Vector2(0.5, 0.25);
const sceneTarget = new THREE.Vector2();
let rippleIndex = 0;
let lastRippleAt = 0;
let lastRipplePosition = new THREE.Vector2(-1, -1);
let dragging = false;
let dragStart = new THREE.Vector2();
let sceneStart = new THREE.Vector2();

render();

function addRipple(x, y, force = false) {
  if (y > 0.54) return;
  const now = performance.now();
  const next = new THREE.Vector2(x, y);
  if (!force && (now - lastRippleAt < 60 || next.distanceTo(lastRipplePosition) < 0.012)) return;

  rippleSlots[rippleIndex].set(x, y, uniforms.uTime.value);
  rippleIndex = (rippleIndex + 1) % rippleSlots.length;
  lastRippleAt = now;
  lastRipplePosition.copy(next);
}

function setPointer(event) {
  pointer.set(event.clientX / innerWidth, 1 - event.clientY / innerHeight);
  uniforms.uPointer.value.copy(pointer);
}

addEventListener("pointerdown", (event) => {
  setPointer(event);
  dragging = true;
  dragStart.set(event.clientX, event.clientY);
  sceneStart.copy(sceneTarget);
  addRipple(pointer.x, pointer.y, true);
  document.documentElement.classList.add("has-interacted");
});

addEventListener("pointermove", (event) => {
  setPointer(event);
  addRipple(pointer.x, pointer.y);
  if (!dragging) return;

  sceneTarget.x = THREE.MathUtils.clamp(
    sceneStart.x + (event.clientX - dragStart.x) / innerWidth,
    -0.7,
    0.7,
  );
  sceneTarget.y = THREE.MathUtils.clamp(
    sceneStart.y - (event.clientY - dragStart.y) / innerHeight,
    -0.35,
    0.35,
  );
});

addEventListener("pointerup", () => {
  dragging = false;
});

addEventListener("pointercancel", () => {
  dragging = false;
});

const clockTime = document.querySelector(".clock-time");
const timeValue = document.querySelector(".time-value");
const formatTime = () =>
  new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Los_Angeles",
  })
    .format(new Date())
    .toLowerCase()
    .replace(" ", "");

function updateClock() {
  const value = formatTime();
  clockTime.textContent = value;
  if (document.querySelector(".time-label").textContent === "Now") timeValue.textContent = value;
}

updateClock();
setInterval(updateClock, 30000);

const timeButton = document.querySelector(".time-button");
const timeOptions = document.querySelector(".time-options");
const timeNames = ["11:30 p.m.", "6:18 a.m.", "1:24 p.m.", "7:42 p.m."];

timeButton.addEventListener("click", () => {
  const open = !timeOptions.classList.contains("is-open");
  timeOptions.classList.toggle("is-open", open);
  timeOptions.setAttribute("aria-hidden", String(!open));
  timeButton.setAttribute("aria-expanded", String(open));
});

timeOptions.querySelectorAll("button").forEach((button) => {
  button.addEventListener("click", () => {
    const mood = Number(button.dataset.time);
    uniforms.uMood.value = mood;
    document.querySelector(".time-label").textContent = button.textContent;
    timeValue.textContent = timeNames[mood];
    timeOptions.classList.remove("is-open");
    timeOptions.setAttribute("aria-hidden", "true");
    timeButton.setAttribute("aria-expanded", "false");
  });
});

const infoPanel = document.querySelector(".info-panel");
const infoOpen = document.querySelector(".info-open");
const infoClose = document.querySelector(".info-close");

function setInfo(open) {
  infoPanel.classList.toggle("is-open", open);
  infoPanel.setAttribute("aria-hidden", String(!open));
  if (open) infoClose.focus();
  else infoOpen.focus();
}

infoOpen.addEventListener("click", () => setInfo(true));
infoClose.addEventListener("click", () => setInfo(false));
addEventListener("keydown", (event) => {
  if (event.key === "Escape") setInfo(false);
});

let audioContext;
let waterNoise;
const soundToggle = document.querySelector(".sound-toggle");

function createLakeSound() {
  audioContext = new AudioContext();
  const length = audioContext.sampleRate * 4;
  const buffer = audioContext.createBuffer(1, length, audioContext.sampleRate);
  const data = buffer.getChannelData(0);
  let low = 0;

  for (let i = 0; i < length; i++) {
    low = low * 0.992 + (Math.random() * 2 - 1) * 0.008;
    data[i] = low * 2.8;
  }

  waterNoise = audioContext.createBufferSource();
  const filter = audioContext.createBiquadFilter();
  const gain = audioContext.createGain();
  waterNoise.buffer = buffer;
  waterNoise.loop = true;
  filter.type = "lowpass";
  filter.frequency.value = 620;
  gain.gain.value = 0.1;
  waterNoise.connect(filter).connect(gain).connect(audioContext.destination);
  waterNoise.start();
}

soundToggle.addEventListener("click", () => {
  const active = soundToggle.getAttribute("aria-pressed") === "true";
  if (!audioContext) createLakeSound();
  soundToggle.setAttribute("aria-pressed", String(!active));
  document.querySelector(".sound-label").textContent = active ? "Play music" : "Pause music";
  if (audioContext) active ? audioContext.suspend() : audioContext.resume();
});
