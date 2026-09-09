import * as THREE from "three";
import "./styles.css";

await document.fonts.ready;

const canvas = document.querySelector("#gallery");
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: "high-performance",
});

renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0xffffff, 1);

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const artCanvas = document.createElement("canvas");
const artContext = artCanvas.getContext("2d");
const artTexture = new THREE.CanvasTexture(artCanvas);
artTexture.colorSpace = THREE.SRGBColorSpace;
artTexture.minFilter = THREE.LinearFilter;
artTexture.magFilter = THREE.LinearFilter;

const uniforms = {
  uArt: { value: artTexture },
  uResolution: { value: new THREE.Vector2() },
  uLens: { value: new THREE.Vector2() },
  uRadius: { value: 130 },
  uTime: { value: 0 },
  uRoll: { value: 0 },
  uMotion: { value: new THREE.Vector2() },
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
    uniform sampler2D uArt;
    uniform vec2 uResolution;
    uniform vec2 uLens;
    uniform float uRadius;
    uniform float uTime;
    uniform float uRoll;
    uniform vec2 uMotion;

    vec2 refractedUv(vec2 uv, vec3 normal, float ior, float bevel) {
      vec3 incident = vec3(0.0, 0.0, -1.0);
      vec3 ray = refract(incident, normal, 1.0 / ior);
      vec2 offset = ray.xy * (uRadius / uResolution) * 0.16 * bevel;
      return clamp(uv + offset, 0.002, 0.998);
    }

    void main() {
      vec2 frag = gl_FragCoord.xy;
      vec2 deltaPx = frag - uLens;
      vec2 q = deltaPx / uRadius;
      float distanceToLens = length(q);

      vec3 background = texture2D(uArt, vUv).rgb;
      vec3 color = background;

      float shadowShape = 1.0 - smoothstep(1.0, 1.30, distanceToLens);
      float lensMask = 1.0 - smoothstep(0.985, 1.008, distanceToLens);
      float outsideShadow = max(0.0, shadowShape - lensMask);
      float shadowDirection = smoothstep(-0.7, 0.8, q.y - q.x * 0.35);
      color *= 1.0 - outsideShadow * mix(0.075, 0.018, shadowDirection);

      if (distanceToLens < 1.02) {
        float safeDistance = min(distanceToLens, 0.999);
        float domeHeight = sqrt(max(0.0, 1.0 - safeDistance * safeDistance));
        float angle = atan(q.y, q.x);
        vec2 radial = normalize(q + vec2(0.0001));
        vec2 tangent = vec2(-radial.y, radial.x);
        float liquidFlow = sin(angle * 3.0 + uRoll * 1.3 - uTime * 0.72)
          + sin(angle * 5.0 - uRoll * 0.8 + uTime * 0.43) * 0.45;
        float surfaceFlow = liquidFlow * smoothstep(0.52, 0.96, distanceToLens);
        vec2 flowingNormal = q
          + tangent * surfaceFlow * 0.018
          + uMotion * smoothstep(0.58, 0.97, distanceToLens) * 0.026;
        vec3 normal = normalize(vec3(flowingNormal, domeHeight));
        float opticalBevel = smoothstep(0.42, 0.96, distanceToLens);

        vec2 centerUv = uLens / uResolution;
        vec2 magnifiedUv = centerUv + (vUv - centerUv) * 0.975;
        vec2 baseRefraction = refractedUv(magnifiedUv, normal, 1.5, opticalBevel);

        // Wavelength-dependent bending becomes visible only through the bevel.
        // Blue bends more than red, producing real spectral fringes at contrast edges.
        vec2 spectralShift = radial * (5.5 / uResolution) * opticalBevel;
        vec2 uvRed = clamp(baseRefraction - spectralShift, 0.002, 0.998);
        vec2 uvGreen = baseRefraction;
        vec2 uvBlue = clamp(baseRefraction + spectralShift, 0.002, 0.998);
        vec3 glass = vec3(
          texture2D(uArt, uvRed).r,
          texture2D(uArt, uvGreen).g,
          texture2D(uArt, uvBlue).b
        );

        // Mild wavelength-selective absorption gives thick glass its green body tint.
        float pathLength = mix(1.25, 0.18, opticalBevel);
        glass *= exp(-vec3(0.012, 0.003, 0.009) * pathLength);

        vec3 viewDirection = vec3(0.0, 0.0, 1.0);
        float cosTheta = clamp(dot(normal, viewDirection), 0.0, 1.0);
        float f0 = pow((1.5 - 1.0) / (1.5 + 1.0), 2.0);
        float fresnel = f0 + (1.0 - f0) * pow(1.0 - cosTheta, 5.0);

        // A single point light sits in front of the exact page center.
        // Its screen-relative direction changes as the lens moves around it.
        vec2 lightPosition = uResolution * 0.5;
        float lightHeight = min(uResolution.x, uResolution.y) * 0.72;
        vec3 lightDirection = normalize(vec3(lightPosition - frag, lightHeight));
        vec3 halfVector = normalize(lightDirection + viewDirection);
        float specular = pow(max(dot(normal, halfVector), 0.0), 82.0);
        float broadSpecular = pow(max(dot(normal, halfVector), 0.0), 12.0);

        float luma = dot(glass, vec3(0.299, 0.587, 0.114));
        vec3 adaptiveReflection = mix(
          vec3(1.0),
          vec3(0.10, 0.13, 0.18),
          smoothstep(0.42, 0.78, luma)
        );

        glass = mix(glass, adaptiveReflection, fresnel * 0.13);
        glass += vec3(1.0, 0.985, 0.94) * specular * 0.68;
        glass += vec3(0.62, 0.78, 1.0) * broadSpecular * 0.035;

        float innerCaustic = smoothstep(0.70, 0.94, distanceToLens)
          * (1.0 - smoothstep(0.94, 1.0, distanceToLens));
        vec2 planarLight = lightPosition - uLens;
        float planarDistance = length(planarLight);
        vec2 lightAcrossGlass = planarLight / max(planarDistance, 0.001);
        float directionalLight = smoothstep(-0.65, 0.9, dot(normal.xy, lightAcrossGlass));
        float litSide = mix(
          0.5,
          directionalLight,
          smoothstep(0.0, uRadius * 0.8, planarDistance)
        );
        float flowingCaustic = 0.72 + 0.28 * sin(angle * 4.0 - uTime * 0.62);
        glass += vec3(0.82, 0.94, 1.0)
          * innerCaustic * litSide * flowingCaustic * 0.15;
        glass += vec3(1.0, 0.78, 0.48)
          * innerCaustic * (1.0 - litSide) * (1.0 - flowingCaustic) * 0.055;
        glass -= vec3(0.08, 0.04, 0.12) * innerCaustic * (1.0 - litSide) * 0.05;

        float motionAmount = clamp(length(uMotion), 0.0, 1.0);
        float motionAngle = atan(uMotion.y, uMotion.x);
        float rollingGlint = pow(
          max(0.0, cos(angle - motionAngle - uRoll) * 0.5 + 0.5),
          12.0
        );
        glass += vec3(0.72, 0.88, 1.0)
          * rollingGlint * innerCaustic * motionAmount * 0.12;

        float rim = smoothstep(0.88, 1.0, distanceToLens);
        glass = mix(glass, adaptiveReflection, rim * fresnel * 0.18);
        color = mix(color, glass, lensMask);
      }

      gl_FragColor = vec4(color, 1.0);
    }
  `,
});

scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

const palette = {
  ink: "#111111",
  red: "#ff3b30",
  blue: "#2457ff",
  yellow: "#ffd51b",
  green: "#0a8f55",
  pink: "#ed4fa8",
  paper: "#ffffff",
  quiet: "#deded8",
};

function font(size, family = "Manrope", style = "", weight = 500) {
  return `${style} ${weight} ${Math.round(size)}px "${family}"`;
}

function drawRotatedText(text, x, y, angle, style) {
  artContext.save();
  artContext.translate(x, y);
  artContext.rotate(angle);
  artContext.font = style.font;
  artContext.fillStyle = style.color;
  artContext.textAlign = style.align ?? "left";
  artContext.textBaseline = style.baseline ?? "alphabetic";
  artContext.fillText(text, 0, 0);
  artContext.restore();
}

function drawArt() {
  const width = artCanvas.width;
  const height = artCanvas.height;
  const unit = Math.min(width, height);
  const c = artContext;

  c.fillStyle = palette.paper;
  c.fillRect(0, 0, width, height);

  c.fillStyle = palette.yellow;
  c.beginPath();
  c.arc(width * 0.83, height * 0.22, unit * 0.108, 0, Math.PI * 2);
  c.fill();

  c.fillStyle = palette.blue;
  c.fillRect(width * 0.67, height * 0.69, width * 0.24, height * 0.035);

  c.strokeStyle = palette.red;
  c.lineWidth = unit * 0.009;
  c.beginPath();
  c.arc(width * 0.09, height * 0.78, unit * 0.055, 0, Math.PI * 2);
  c.stroke();

  c.fillStyle = palette.ink;
  c.font = font(unit * 0.205, "Manrope", "", 500);
  c.textBaseline = "alphabetic";
  c.fillText("FORM", width * 0.035, height * 0.265);

  c.fillStyle = palette.red;
  c.font = font(unit * 0.205, "Bodoni Moda", "italic", 600);
  c.fillText("follows", width * 0.29, height * 0.505);

  c.fillStyle = palette.blue;
  c.font = font(unit * 0.188, "Bodoni Moda", "italic", 600);
  c.fillText("FEELING.", width * 0.035, height * 0.745);

  drawRotatedText("THE MUSEUM OF POSSIBLE THINGS", width * 0.955, height * 0.62, -Math.PI / 2, {
    font: font(unit * 0.032, "DM Mono", "", 400),
    color: palette.green,
  });

  drawRotatedText("DESIGN IS A SOCIAL ACT", width * 0.205, height * 0.93, -Math.PI / 2, {
    font: font(unit * 0.018, "DM Mono", "", 400),
    color: palette.pink,
  });

  c.fillStyle = palette.green;
  c.font = font(unit * 0.058, "Bodoni Moda", "italic", 400);
  c.fillText("Look closer.", width * 0.62, height * 0.855);

  c.fillStyle = palette.ink;
  c.font = font(unit * 0.018, "DM Mono", "", 400);
  c.fillText("OBJECTS / IDEAS / ACCIDENTS", width * 0.69, height * 0.325);
  c.fillText("OPEN DAILY", width * 0.04, height * 0.91);
  c.fillText("10:00—∞", width * 0.04, height * 0.94);

  c.fillStyle = palette.pink;
  c.font = font(unit * 0.042, "Bodoni Moda", "italic", 600);
  c.fillText("stay curious", width * 0.69, height * 0.64);

  c.fillStyle = palette.red;
  c.font = font(unit * 0.026, "DM Mono", "", 400);
  c.fillText("NO. 07", width * 0.88, height * 0.94);

  c.save();
  c.translate(width * 0.53, height * 0.88);
  c.rotate(-0.08);
  c.fillStyle = palette.yellow;
  c.fillRect(-unit * 0.13, -unit * 0.036, unit * 0.26, unit * 0.072);
  c.fillStyle = palette.ink;
  c.font = font(unit * 0.025, "DM Mono", "", 400);
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText("MOVE SLOWLY", 0, 0);
  c.restore();

  artTexture.needsUpdate = true;
}

const lens = {
  position: new THREE.Vector2(innerWidth * 0.5, innerHeight * 0.5),
  previous: new THREE.Vector2(innerWidth * 0.5, innerHeight * 0.5),
  motion: new THREE.Vector2(),
  roll: 0,
  radius: 80,
  radiusVelocity: 0,
  held: false,
  pressedUntil: 0,
};

let restingRadius = 80;
let expandedRadius = 130;

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.getDrawingBufferSize(uniforms.uResolution.value);
  artCanvas.width = uniforms.uResolution.value.x;
  artCanvas.height = uniforms.uResolution.value.y;
  restingRadius = THREE.MathUtils.clamp(Math.min(innerWidth, innerHeight) * 0.085, 58, 92);
  expandedRadius = THREE.MathUtils.clamp(Math.min(innerWidth, innerHeight) * 0.145, 88, 150);
  if (!Number.isFinite(lens.radius)) lens.radius = restingRadius;
  drawArt();
}

addEventListener("resize", resize);
resize();

function moveLens(event) {
  lens.previous.copy(lens.position);
  lens.position.set(event.clientX, event.clientY);
  const movement = lens.position.clone().sub(lens.previous);
  if (movement.lengthSq() > 0) {
    lens.roll += (movement.x - movement.y) / Math.max(expandedRadius, 1) * 0.85;
    lens.motion.set(movement.x, -movement.y).multiplyScalar(0.055).clampLength(0, 1);
  }
}

addEventListener("pointermove", moveLens, { passive: true });
addEventListener(
  "pointerdown",
  (event) => {
    moveLens(event);
    lens.held = true;
    lens.pressedUntil = performance.now() + 320;
  },
  { passive: true },
);
addEventListener(
  "pointerup",
  () => {
    lens.held = false;
  },
  { passive: true },
);
addEventListener(
  "pointercancel",
  () => {
    lens.held = false;
  },
  { passive: true },
);

function render() {
  const expanded = lens.held || performance.now() < lens.pressedUntil;
  const radiusTarget = expanded ? expandedRadius : restingRadius;
  const radiusForce = (radiusTarget - lens.radius) * 0.12;
  lens.radiusVelocity = (lens.radiusVelocity + radiusForce) * 0.72;
  lens.radius += lens.radiusVelocity;
  lens.motion.multiplyScalar(0.91);

  const pixelRatio = renderer.getPixelRatio();
  uniforms.uLens.value.set(
    lens.position.x * pixelRatio,
    (innerHeight - lens.position.y) * pixelRatio,
  );
  uniforms.uRadius.value = lens.radius * pixelRatio;
  uniforms.uTime.value = performance.now() * 0.001;
  uniforms.uRoll.value = lens.roll;
  uniforms.uMotion.value.copy(lens.motion);

  renderer.render(scene, camera);
  requestAnimationFrame(render);
}

render();
document.documentElement.classList.add("is-ready");

const aboutPanel = document.querySelector(".about-panel");
const aboutOpen = document.querySelector(".about-button");
const aboutClose = document.querySelector(".about-close");

function setAbout(open) {
  aboutPanel.classList.toggle("is-open", open);
  aboutPanel.setAttribute("aria-hidden", String(!open));
  open ? aboutClose.focus() : aboutOpen.focus();
}

aboutOpen.addEventListener("click", () => setAbout(true));
aboutClose.addEventListener("click", () => setAbout(false));
addEventListener("keydown", (event) => {
  if (event.key === "Escape") setAbout(false);
});
