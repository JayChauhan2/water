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

    vec3 refractedSample(vec2 uv, vec3 normal, float ior, float bevel) {
      vec3 incident = vec3(0.0, 0.0, -1.0);
      vec3 ray = refract(incident, normal, 1.0 / ior);
      vec2 offset = ray.xy * (uRadius / uResolution) * 0.16 * bevel;
      return texture2D(uArt, clamp(uv + offset, 0.002, 0.998)).rgb;
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
        vec3 normal = normalize(vec3(q.x, q.y, domeHeight));
        float opticalBevel = smoothstep(0.42, 0.96, distanceToLens);

        vec2 centerUv = uLens / uResolution;
        vec2 magnifiedUv = centerUv + (vUv - centerUv) * 0.975;

        vec3 glass;
        glass.r = refractedSample(magnifiedUv, normal, 1.495, opticalBevel).r;
        glass.g = refractedSample(magnifiedUv, normal, 1.500, opticalBevel).g;
        glass.b = refractedSample(magnifiedUv, normal, 1.507, opticalBevel).b;

        vec3 viewDirection = vec3(0.0, 0.0, 1.0);
        float cosTheta = clamp(dot(normal, viewDirection), 0.0, 1.0);
        float f0 = pow((1.5 - 1.0) / (1.5 + 1.0), 2.0);
        float fresnel = f0 + (1.0 - f0) * pow(1.0 - cosTheta, 5.0);

        vec3 lightDirection = normalize(vec3(-0.58, 0.72, 1.0));
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
        float litSide = smoothstep(-0.65, 0.9, dot(normal.xy, normalize(vec2(-0.6, 0.8))));
        glass += vec3(0.90, 0.96, 1.0) * innerCaustic * litSide * 0.12;
        glass -= vec3(0.08, 0.04, 0.12) * innerCaustic * (1.0 - litSide) * 0.05;

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
};

let baseRadius = 130;

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.getDrawingBufferSize(uniforms.uResolution.value);
  artCanvas.width = uniforms.uResolution.value.x;
  artCanvas.height = uniforms.uResolution.value.y;
  baseRadius = THREE.MathUtils.clamp(Math.min(innerWidth, innerHeight) * 0.145, 88, 150);
  drawArt();
}

addEventListener("resize", resize);
resize();

function moveLens(event) {
  lens.position.set(event.clientX, event.clientY);
}

addEventListener("pointermove", moveLens, { passive: true });
addEventListener("pointerdown", moveLens, { passive: true });

function render() {
  const pixelRatio = renderer.getPixelRatio();
  uniforms.uLens.value.set(
    lens.position.x * pixelRatio,
    (innerHeight - lens.position.y) * pixelRatio,
  );
  uniforms.uRadius.value = baseRadius * pixelRatio;

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
