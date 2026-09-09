import * as THREE from "three";
import "./styles.css";

const canvas = document.querySelector("#lake");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const clock = new THREE.Clock();
const rippleSlots = Array.from({ length: 12 }, () => new THREE.Vector3(-10, -10, -100));

const uniforms = {
  uTime: { value: 0 },
  uResolution: { value: new THREE.Vector2() },
  uPointer: { value: new THREE.Vector2(0.72, 0.45) },
  uRipples: { value: rippleSlots },
  uStill: { value: reducedMotion ? 1 : 0 },
};

const vertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  varying vec2 vUv;
  uniform float uTime;
  uniform float uStill;
  uniform vec2 uResolution;
  uniform vec2 uPointer;
  uniform vec3 uRipples[12];

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

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    mat2 rotation = mat2(0.80, 0.60, -0.60, 0.80);
    for (int i = 0; i < 5; i++) {
      value += amplitude * noise(p);
      p = rotation * p * 2.03 + 7.1;
      amplitude *= 0.5;
    }
    return value;
  }

  float rippleHeight(vec2 uv) {
    float height = 0.0;
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    for (int i = 0; i < 12; i++) {
      float age = uTime - uRipples[i].z;
      vec2 delta = uv - uRipples[i].xy;
      delta.x *= aspect;
      float distanceFromDrop = length(delta);
      float envelope = exp(-distanceFromDrop * 5.5) * exp(-age * 1.35);
      float ring = sin(distanceFromDrop * 68.0 - age * 8.5);
      float outwardMask = smoothstep(age * 0.62 + 0.10, age * 0.62, distanceFromDrop);
      height += ring * envelope * outwardMask * step(0.0, age) * step(age, 4.5);
    }
    return height;
  }

  float waterHeight(vec2 uv, float time) {
    vec2 p = uv;
    p.x *= uResolution.x / max(uResolution.y, 1.0);
    float broad = sin(p.x * 7.0 + p.y * 4.0 + time * 0.24) * 0.28;
    broad += sin(p.x * 13.0 - p.y * 6.0 - time * 0.19) * 0.16;
    float detail = fbm(p * 4.0 + vec2(time * 0.035, -time * 0.025));
    return broad * 0.08 + detail * 0.13 + rippleHeight(uv) * 0.16;
  }

  void main() {
    vec2 uv = vUv;
    float time = mix(uTime, 12.0, uStill);
    vec2 pixel = vec2(1.5) / uResolution;
    float height = waterHeight(uv, time);
    float heightX = waterHeight(uv + vec2(pixel.x, 0.0), time);
    float heightY = waterHeight(uv + vec2(0.0, pixel.y), time);
    vec2 slope = vec2(heightX - height, heightY - height) * 35.0;
    vec2 reflectedUv = uv + slope * 0.018;

    vec3 deepWater = vec3(0.18, 0.35, 0.34);
    vec3 jadeWater = vec3(0.40, 0.57, 0.53);
    vec3 sky = vec3(0.63, 0.72, 0.68);
    vec3 cloud = vec3(0.84, 0.84, 0.76);

    float depthNoise = fbm(uv * vec2(2.3, 3.8) + vec2(0.0, time * 0.008));
    vec3 color = mix(deepWater, jadeWater, smoothstep(0.12, 0.95, uv.y + depthNoise * 0.18));

    float cloudShape = fbm(reflectedUv * vec2(2.0, 3.4) + vec2(-0.6, time * 0.004));
    cloudShape += fbm(reflectedUv * vec2(5.0, 7.0) - vec2(time * 0.003, 0.0)) * 0.25;
    float clouds = smoothstep(0.60, 0.90, cloudShape + reflectedUv.y * 0.18);
    color = mix(color, sky, 0.24 + uv.y * 0.12);
    color = mix(color, cloud, clouds * 0.34);

    float normalLight = clamp(0.55 + slope.x * -0.9 + slope.y * 0.55, 0.0, 1.0);
    color += vec3(0.22, 0.25, 0.20) * pow(normalLight, 6.0) * 0.45;

    float glintNoise = noise(uv * uResolution * 0.32 + time * 0.8);
    float glint = pow(max(0.0, 1.0 - length(slope - vec2(-0.03, 0.02)) * 3.2), 18.0);
    glint *= smoothstep(0.79, 1.0, glintNoise);
    color += vec3(1.0, 0.94, 0.70) * glint * 0.65;

    float pointerDistance = distance(uv, uPointer);
    color += vec3(0.04, 0.08, 0.07) * exp(-pointerDistance * 9.0) * 0.2;

    float vignette = smoothstep(0.85, 0.2, distance(uv, vec2(0.52, 0.48)));
    color *= 0.86 + vignette * 0.18;
    color += (hash(gl_FragCoord.xy + time) - 0.5) / 255.0;

    gl_FragColor = vec4(color, 1.0);
  }
`;

const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader });
const water = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
scene.add(water);

let rippleIndex = 0;
let lastRippleAt = 0;
let lastRipplePosition = new THREE.Vector2(-1, -1);
const pointer = new THREE.Vector2(0.72, 0.45);

function addRipple(x, y, force = false) {
  const now = performance.now();
  const next = new THREE.Vector2(x, y);
  const moved = next.distanceTo(lastRipplePosition);
  if (!force && (now - lastRippleAt < 75 || moved < 0.018)) return;

  rippleSlots[rippleIndex].set(x, y, uniforms.uTime.value);
  rippleIndex = (rippleIndex + 1) % rippleSlots.length;
  lastRippleAt = now;
  lastRipplePosition.copy(next);
}

function updatePointer(event, force = false) {
  pointer.set(event.clientX / innerWidth, 1 - event.clientY / innerHeight);
  uniforms.uPointer.value.copy(pointer);
  addRipple(pointer.x, pointer.y, force);
}

addEventListener("pointermove", updatePointer, { passive: true });
addEventListener("pointerdown", (event) => updatePointer(event, true), { passive: true });

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.getDrawingBufferSize(uniforms.uResolution.value);
}

addEventListener("resize", resize);
resize();

function render() {
  uniforms.uTime.value = clock.getElapsedTime();
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}
render();

const projectData = {
  atlas: {
    number: "Project 01",
    title: "Atlas Fieldnotes",
    role: "Digital identity · WebGL · 2026",
    description:
      "A living field guide for slow travel, pairing regional stories with an exploratory, map-led interface.",
  },
  morrow: {
    number: "Project 02",
    title: "Morrow House",
    role: "Art direction · Commerce · 2025",
    description:
      "A tactile digital home for an independent furniture studio, shaped around material, process, and provenance.",
  },
  north: {
    number: "Project 03",
    title: "North / 44",
    role: "Experience design · Film · 2025",
    description:
      "An interactive documentary tracing winter, memory, and daily life across four northern communities.",
  },
};

const panel = document.querySelector(".project-panel");
const panelClose = panel.querySelector(".panel-close");
const panelNumber = panel.querySelector(".panel-number");
const panelTitle = panel.querySelector("h2");
const panelRole = panel.querySelector(".panel-role");
const panelDescription = panel.querySelector(".panel-description");

function openProject(projectKey) {
  const project = projectData[projectKey];
  panelNumber.textContent = project.number;
  panelTitle.textContent = project.title;
  panelRole.textContent = project.role;
  panelDescription.textContent = project.description;
  panel.classList.add("is-open");
  panel.setAttribute("aria-hidden", "false");
  panelClose.focus();
}

function closeProject() {
  panel.classList.remove("is-open");
  panel.setAttribute("aria-hidden", "true");
}

document.querySelectorAll(".project-marker").forEach((marker) => {
  marker.addEventListener("click", () => openProject(marker.dataset.project));
});
panelClose.addEventListener("click", closeProject);
addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeProject();
});

let audioContext;
let waterNoise;
const soundToggle = document.querySelector(".sound-toggle");

function startWaterSound() {
  audioContext = new AudioContext();
  const length = audioContext.sampleRate * 3;
  const buffer = audioContext.createBuffer(1, length, audioContext.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;

  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    last = last * 0.985 + white * 0.015;
    data[i] = last * 2.2;
  }

  waterNoise = audioContext.createBufferSource();
  const filter = audioContext.createBiquadFilter();
  const gain = audioContext.createGain();
  waterNoise.buffer = buffer;
  waterNoise.loop = true;
  filter.type = "lowpass";
  filter.frequency.value = 720;
  gain.gain.value = 0.08;
  waterNoise.connect(filter).connect(gain).connect(audioContext.destination);
  waterNoise.start();
}

soundToggle.addEventListener("click", () => {
  const active = soundToggle.getAttribute("aria-pressed") === "true";
  if (!audioContext) startWaterSound();

  soundToggle.setAttribute("aria-pressed", String(!active));
  soundToggle.lastChild.textContent = active ? " Sound off" : " Sound on";
  if (audioContext) {
    active ? audioContext.suspend() : audioContext.resume();
  }
});
