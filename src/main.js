import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
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
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.transmissionResolutionScale = 0.65;

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 20);
camera.position.z = 5;
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

      vec2 lightPosition = uResolution * 0.5;
      vec2 awayFromLight = uLens - lightPosition;
      float awayLength = length(awayFromLight);
      awayFromLight /= max(awayLength, 0.001);
      vec2 shadowCenter = uLens + awayFromLight * uRadius * 0.12;
      vec2 shadowQ = (frag - shadowCenter) / uRadius;
      float shadowDistance = length(vec2(shadowQ.x, shadowQ.y * 0.92));
      float castShadow = (1.0 - smoothstep(0.92, 1.42, shadowDistance))
        * smoothstep(1.01, 1.10, distanceToLens);
      float shadowShape = 1.0 - smoothstep(1.0, 1.24, distanceToLens);
      float lensMask = 1.0 - smoothstep(0.985, 1.008, distanceToLens);
      float outsideShadow = max(0.0, shadowShape - lensMask);
      float shadowDirection = smoothstep(-0.7, 0.8, q.y - q.x * 0.35);
      color *= 1.0 - castShadow * 0.085;
      color *= 1.0 - outsideShadow * mix(0.10, 0.025, shadowDirection);

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
        float volumeMagnification = mix(0.958, 0.985, opticalBevel);
        vec2 magnifiedUv = centerUv + (vUv - centerUv) * volumeMagnification;
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

        // The sphere's depth controls its optical path through the material.
        float pathLength = domeHeight * 2.0 + 0.08;
        glass *= exp(-vec3(0.020, 0.005, 0.014) * pathLength);

        vec3 viewDirection = vec3(0.0, 0.0, 1.0);
        float cosTheta = clamp(dot(normal, viewDirection), 0.0, 1.0);
        float f0 = pow((1.5 - 1.0) / (1.5 + 1.0), 2.0);
        float fresnel = f0 + (1.0 - f0) * pow(1.0 - cosTheta, 5.0);

        // A single point light sits in front of the exact page center.
        // Its screen-relative direction changes as the lens moves around it.
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

        vec3 reflectedRay = reflect(-viewDirection, normal);
        vec3 environmentLow = vec3(1.0, 0.88, 0.72);
        vec3 environmentHigh = vec3(0.56, 0.76, 1.0);
        vec3 environment = mix(
          environmentLow,
          environmentHigh,
          smoothstep(-0.65, 0.85, reflectedRay.y)
        );
        float environmentSun = pow(max(dot(reflectedRay, lightDirection), 0.0), 96.0);
        environment += vec3(1.0, 0.94, 0.76) * environmentSun * 0.8;

        glass = mix(glass, environment, fresnel * 0.34);
        float bodyLight = dot(normal, lightDirection) * 0.5 + 0.5;
        glass += vec3(0.72, 0.88, 1.0) * bodyLight * domeHeight * 0.018;
        glass -= vec3(0.10, 0.12, 0.16) * (1.0 - bodyLight) * domeHeight * 0.025;
        glass += vec3(1.0, 0.985, 0.94) * specular * 0.68;
        glass += vec3(0.62, 0.78, 1.0) * broadSpecular * 0.055;

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
        vec3 farRim = mix(vec3(0.20, 0.30, 0.42), environment, litSide);
        glass = mix(glass, farRim, rim * fresnel * 0.42);
        color = mix(color, glass, lensMask);
      }

      gl_FragColor = vec4(color, 1.0);
    }
  `,
});

const residueCanvas = document.createElement("canvas");
const residueContext = residueCanvas.getContext("2d");
const residueBuffer = document.createElement("canvas");
const residueBufferContext = residueBuffer.getContext("2d");
const residueTexture = new THREE.CanvasTexture(residueCanvas);
residueTexture.colorSpace = THREE.NoColorSpace;
residueTexture.minFilter = THREE.LinearFilter;
residueTexture.magFilter = THREE.LinearFilter;

const residueUniforms = {
  uArt: { value: artTexture },
  uResidue: { value: residueTexture },
  uTexel: { value: new THREE.Vector2(1 / 512, 1 / 288) },
  uResolution: { value: new THREE.Vector2(innerWidth, innerHeight) },
};

const residueMaterial = new THREE.ShaderMaterial({
  uniforms: residueUniforms,
  toneMapped: false,
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    precision highp float;

    varying vec2 vUv;
    uniform sampler2D uArt;
    uniform sampler2D uResidue;
    uniform vec2 uTexel;
    uniform vec2 uResolution;

    void main() {
      vec3 base = texture2D(uArt, vUv).rgb;
      float height = texture2D(uResidue, vUv).r;

      if (height < 0.003) {
        gl_FragColor = vec4(base, 1.0);
        return;
      }

      float leftHeight = texture2D(uResidue, vUv - vec2(uTexel.x, 0.0)).r;
      float rightHeight = texture2D(uResidue, vUv + vec2(uTexel.x, 0.0)).r;
      float lowerHeight = texture2D(uResidue, vUv - vec2(0.0, uTexel.y)).r;
      float upperHeight = texture2D(uResidue, vUv + vec2(0.0, uTexel.y)).r;
      vec2 gradient = vec2(rightHeight - leftHeight, upperHeight - lowerHeight);
      vec3 normal = normalize(vec3(-gradient * 9.0, 0.34));

      float waterMask = smoothstep(0.006, 0.055, height);
      float edge = smoothstep(0.015, 0.16, length(gradient));
      vec2 refractedUv = clamp(
        vUv + normal.xy * 0.018 * waterMask,
        vec2(0.002),
        vec2(0.998)
      );

      vec2 spectralDirection = normalize(normal.xy + vec2(0.0001));
      vec2 spectralShift = spectralDirection * (2.4 / uResolution) * edge;
      vec3 water = vec3(
        texture2D(uArt, refractedUv - spectralShift).r,
        texture2D(uArt, refractedUv).g,
        texture2D(uArt, refractedUv + spectralShift).b
      );

      vec2 lightDelta = vec2(0.5) - vUv;
      lightDelta.x *= uResolution.x / max(uResolution.y, 1.0);
      vec3 lightDirection = normalize(vec3(lightDelta, 0.72));
      vec3 viewDirection = vec3(0.0, 0.0, 1.0);
      vec3 halfVector = normalize(lightDirection + viewDirection);
      float specular = pow(max(dot(normal, halfVector), 0.0), 72.0);
      float fresnel = 0.02 + 0.98 * pow(1.0 - max(normal.z, 0.0), 5.0);

      water = mix(water, vec3(0.55, 0.90, 1.0), waterMask * 0.07);
      water += vec3(0.78, 0.94, 1.0) * specular * waterMask * 0.42;
      water = mix(water, vec3(0.72, 0.90, 1.0), fresnel * edge * 0.34);

      gl_FragColor = vec4(mix(base, water, waterMask), 1.0);
    }
  `,
});

const backdrop = new THREE.Mesh(
  new THREE.PlaneGeometry(2, 2),
  residueMaterial,
);
backdrop.position.z = -1.4;
scene.add(backdrop);

function createLiquidNormalMap() {
  const size = 256;
  const data = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const waveX =
        Math.sin(x * 0.09 + Math.sin(y * 0.035) * 2.2) * 0.32 +
        Math.sin((x + y) * 0.043) * 0.18;
      const waveY =
        Math.cos(y * 0.08 + Math.sin(x * 0.04) * 2.0) * 0.30 +
        Math.cos((x - y) * 0.047) * 0.16;
      const index = (y * size + x) * 4;
      data[index] = 128 + waveX * 70;
      data[index + 1] = 128 + waveY * 70;
      data[index + 2] = 245;
      data[index + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

const liquidNormalMap = createLiquidNormalMap();
const glassMaterial = new THREE.MeshPhysicalMaterial({
  color: 0xdcf6ff,
  transmission: 1,
  opacity: 1,
  roughness: 0,
  metalness: 0,
  ior: 1.46,
  thickness: 0.82,
  dispersion: 0.09,
  clearcoat: 1,
  clearcoatRoughness: 0.015,
  specularIntensity: 1,
  specularColor: 0xf8feff,
  attenuationColor: 0x59cfe9,
  attenuationDistance: 3.2,
  envMapIntensity: 0.34,
  normalMap: liquidNormalMap,
  normalScale: new THREE.Vector2(0.028, 0.028),
});

const deformation = {
  velocity: { value: new THREE.Vector2() },
  acceleration: { value: new THREE.Vector2() },
  speed: { value: 0 },
  wobble: { value: 0 },
  time: { value: 0 },
};

glassMaterial.onBeforeCompile = (shader) => {
  shader.uniforms.uDeformVelocity = deformation.velocity;
  shader.uniforms.uDeformAcceleration = deformation.acceleration;
  shader.uniforms.uDeformSpeed = deformation.speed;
  shader.uniforms.uDeformWobble = deformation.wobble;
  shader.uniforms.uDeformTime = deformation.time;

  const deformationHeader = /* glsl */ `
    uniform vec2 uDeformVelocity;
    uniform vec2 uDeformAcceleration;
    uniform float uDeformSpeed;
    uniform float uDeformWobble;
    uniform float uDeformTime;

    vec3 movementDirection() {
      return normalize(vec3(uDeformVelocity.xy, 0.0001));
    }

    float surfaceWave(vec3 p) {
      vec3 n = normalize(p);
      float longitude = atan(n.y, n.x);
      float latitude = acos(clamp(n.z, -1.0, 1.0));
      float primary = sin(longitude * 3.0 + latitude * 2.0 - uDeformTime * 7.2);
      float secondary = sin(longitude * 5.0 - latitude * 3.0 + uDeformTime * 5.1);
      float directional = dot(n.xy, normalize(uDeformAcceleration + vec2(0.0001)));
      return primary * 0.62 + secondary * 0.28 + directional * 0.30;
    }
  `;

  shader.vertexShader = deformationHeader + shader.vertexShader;
  shader.vertexShader = shader.vertexShader.replace(
    "#include <beginnormal_vertex>",
    /* glsl */ `
      vec3 objectNormal = vec3(normal);
      vec3 moveDirNormal = movementDirection();
      float normalAlongMotion = dot(objectNormal, moveDirNormal);
      objectNormal = normalize(
        objectNormal - moveDirNormal * normalAlongMotion * uDeformSpeed * 0.26
      );
      vec3 waveTangent = normalize(cross(objectNormal, vec3(0.0, 0.0, 1.0)) + vec3(0.0001));
      objectNormal = normalize(
        objectNormal + waveTangent * surfaceWave(position) * uDeformWobble * 0.13
      );
    `,
  );
  shader.vertexShader = shader.vertexShader.replace(
    "#include <begin_vertex>",
    /* glsl */ `
      vec3 transformed = vec3(position);
      vec3 unitPosition = normalize(position);
      vec3 moveDir = movementDirection();

      float alongMotion = dot(transformed, moveDir);
      vec3 acrossMotion = transformed - moveDir * alongMotion;

      // Speed stretches the volume along travel while compressing both
      // perpendicular axes to approximately preserve its volume.
      transformed += moveDir * alongMotion * uDeformSpeed * 0.40;
      transformed -= acrossMotion * uDeformSpeed * 0.125;

      // Acceleration makes the leading and trailing sides respond differently.
      vec3 accelerationDir = normalize(vec3(uDeformAcceleration, 0.0001));
      float accelerationFacing = dot(unitPosition, accelerationDir);
      transformed += accelerationDir
        * (1.0 - accelerationFacing * accelerationFacing)
        * length(uDeformAcceleration) * 0.095;

      // Movement energy excites damped spherical wave modes in the mesh itself.
      transformed += unitPosition * surfaceWave(position) * uDeformWobble * 0.105;
    `,
  );
};
glassMaterial.customProgramCacheKey = () => "directional-liquid-deformation-v1";

const glassOrb = new THREE.Mesh(
  new THREE.SphereGeometry(1, 96, 64),
  glassMaterial,
);
glassOrb.position.z = 0;
scene.add(glassOrb);

const pmrem = new THREE.PMREMGenerator(renderer);
const environment = pmrem.fromScene(new RoomEnvironment(), 0.035).texture;
scene.environment = environment;
pmrem.dispose();

const centerLight = new THREE.PointLight(0xffffff, 30, 20, 1.8);
centerLight.position.set(0, 0, 3.2);
scene.add(centerLight);

const wiperGroup = new THREE.Group();
const rubberMaterial = new THREE.MeshStandardMaterial({
  color: 0x17232a,
  roughness: 0.72,
  metalness: 0.04,
});
const metalMaterial = new THREE.MeshPhysicalMaterial({
  color: 0xd9e2e4,
  roughness: 0.19,
  metalness: 0.88,
  clearcoat: 0.75,
  clearcoatRoughness: 0.12,
  envMapIntensity: 1.15,
});
const gripMaterial = new THREE.MeshPhysicalMaterial({
  color: 0x287fa0,
  roughness: 0.32,
  metalness: 0.08,
  clearcoat: 0.65,
  clearcoatRoughness: 0.18,
});

const wiperRubber = new THREE.Mesh(
  new THREE.BoxGeometry(0.032, 2.36, 0.065, 1, 18, 1),
  rubberMaterial,
);
wiperRubber.position.set(-0.055, 0, -0.015);
wiperGroup.add(wiperRubber);

const wiperRail = new THREE.Mesh(
  new THREE.BoxGeometry(0.075, 2.24, 0.09, 1, 16, 1),
  metalMaterial,
);
wiperRail.position.z = 0.025;
wiperGroup.add(wiperRail);

const wiperConnector = new THREE.Mesh(
  new THREE.CylinderGeometry(0.12, 0.12, 0.16, 32),
  metalMaterial,
);
wiperConnector.rotation.x = Math.PI / 2;
wiperConnector.position.set(0.06, 0.05, 0.13);
wiperGroup.add(wiperConnector);

const wiperHandle = new THREE.Mesh(
  new THREE.CylinderGeometry(0.072, 0.092, 0.78, 32),
  gripMaterial,
);
wiperHandle.rotation.z = -1.03;
wiperHandle.rotation.x = 0.18;
wiperHandle.position.set(0.35, 0.24, 0.19);
wiperGroup.add(wiperHandle);

const handleCap = new THREE.Mesh(
  new THREE.SphereGeometry(0.075, 24, 16),
  gripMaterial,
);
handleCap.position.set(0.68, 0.44, 0.25);
wiperGroup.add(handleCap);

wiperGroup.position.z = 1.1;
wiperGroup.rotation.y = -0.16;
wiperGroup.visible = false;
scene.add(wiperGroup);

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

  // Render interface labels into the same texture as the exhibition so the
  // physical glass sphere refracts every visible element, including corners.
  const pixelRatio = renderer.getPixelRatio();
  const cssWidth = width / pixelRatio;
  const edge = THREE.MathUtils.clamp(cssWidth * 0.02, 16, 32) * pixelRatio;
  const chromeSize =
    THREE.MathUtils.clamp(cssWidth * 0.007, 9.28, 10.88) * pixelRatio;

  c.save();
  c.fillStyle = palette.ink;
  c.font = font(chromeSize, "DM Mono", "", 400);
  c.textBaseline = "top";

  c.textAlign = "right";
  c.fillText("CLEAR", width - edge, edge);
  c.restore();

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

  c.fillStyle = palette.pink;
  c.font = font(unit * 0.042, "Bodoni Moda", "italic", 600);
  c.fillText("stay curious", width * 0.69, height * 0.64);

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

class OneEuroVector {
  constructor(minCutoff, beta, derivativeCutoff) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.derivativeCutoff = derivativeCutoff;
    this.initialized = false;
    this.raw = new THREE.Vector2();
    this.filtered = new THREE.Vector2();
    this.derivative = new THREE.Vector2();
    this.measuredDerivative = new THREE.Vector2();
  }

  smoothing(cutoff, deltaSeconds) {
    const timeConstant = 1 / (Math.PI * 2 * cutoff);
    return 1 / (1 + timeConstant / deltaSeconds);
  }

  filter(value, deltaSeconds) {
    if (!this.initialized) {
      this.raw.copy(value);
      this.filtered.copy(value);
      this.initialized = true;
      return this.filtered;
    }

    this.measuredDerivative
      .subVectors(value, this.raw)
      .multiplyScalar(1 / deltaSeconds);
    this.derivative.lerp(
      this.measuredDerivative,
      this.smoothing(this.derivativeCutoff, deltaSeconds),
    );
    const cutoff = this.minCutoff + this.beta * this.derivative.length();
    this.filtered.lerp(value, this.smoothing(cutoff, deltaSeconds));
    this.raw.copy(value);
    return this.filtered;
  }
}

const INPUT_CAPACITY = 128;
const INPUT_DELAY_MS = 12;
const FIXED_STEP_MS = 1000 / 120;
const inputX = new Float64Array(INPUT_CAPACITY);
const inputY = new Float64Array(INPUT_CAPACITY);
const inputTime = new Float64Array(INPUT_CAPACITY);
let inputWrite = 0;
let inputCount = 0;

function addPointerSample(x, y, time) {
  inputX[inputWrite] = x;
  inputY[inputWrite] = y;
  inputTime[inputWrite] = time;
  inputWrite = (inputWrite + 1) % INPUT_CAPACITY;
  inputCount = Math.min(inputCount + 1, INPUT_CAPACITY);
}

function normalizedEventTime(event) {
  const eventTime = event.timeStamp;
  return Math.abs(eventTime - performance.now()) < 60000
    ? eventTime
    : performance.now();
}

function samplePointerAt(time, output) {
  if (inputCount === 0) return output;

  const oldest = (inputWrite - inputCount + INPUT_CAPACITY) % INPUT_CAPACITY;
  let previousIndex = oldest;

  for (let offset = 1; offset < inputCount; offset++) {
    const currentIndex = (oldest + offset) % INPUT_CAPACITY;
    if (inputTime[currentIndex] >= time) {
      const duration = Math.max(inputTime[currentIndex] - inputTime[previousIndex], 0.001);
      const progress = THREE.MathUtils.clamp(
        (time - inputTime[previousIndex]) / duration,
        0,
        1,
      );
      output.set(
        THREE.MathUtils.lerp(inputX[previousIndex], inputX[currentIndex], progress),
        THREE.MathUtils.lerp(inputY[previousIndex], inputY[currentIndex], progress),
      );
      return output;
    }
    previousIndex = currentIndex;
  }

  output.set(inputX[previousIndex], inputY[previousIndex]);
  return output;
}

const initialTime = performance.now();
const initialPosition = new THREE.Vector2(innerWidth * 0.5, innerHeight * 0.5);
addPointerSample(initialPosition.x, initialPosition.y, initialTime - INPUT_DELAY_MS);

const lens = {
  position: initialPosition.clone(),
  previousPosition: initialPosition.clone(),
  renderPosition: initialPosition.clone(),
  sampledPosition: initialPosition.clone(),
  movement: new THREE.Vector2(),
  measuredVelocity: new THREE.Vector2(),
  motion: new THREE.Vector2(),
  previousMotion: new THREE.Vector2(),
  renderMotion: new THREE.Vector2(),
  rawAcceleration: new THREE.Vector2(),
  acceleration: new THREE.Vector2(),
  previousAcceleration: new THREE.Vector2(),
  renderAcceleration: new THREE.Vector2(),
  velocityFilter: new OneEuroVector(2.2, 0.065, 1.5),
  accelerationFilter: new OneEuroVector(1.7, 0.045, 1.2),
  roll: 0,
  previousRoll: 0,
  wobbleEnergy: 0,
  previousWobbleEnergy: 0,
  radius: 80,
  previousRadius: 80,
  renderRadius: 80,
  radiusVelocity: 0,
  held: false,
  hoveringClear: false,
  pressedUntil: 0,
};

const residue = {
  dwellTime: 0,
  timeSinceDeposit: 0,
  lastFlowTime: initialTime,
  dirty: false,
};
const wiper = {
  active: false,
  startedAt: 0,
  duration: 2400,
  clearedPixel: 0,
};
const depositDirection = new THREE.Vector2();
const depositPerpendicular = new THREE.Vector2();

function stampWater(position, radiusCss, opacity, offsetX = 0, offsetY = 0) {
  const scaleX = residueCanvas.width / innerWidth;
  const scaleY = residueCanvas.height / innerHeight;
  const x = (position.x + offsetX) * scaleX;
  const y = (position.y + offsetY) * scaleY;
  const radius = Math.max(1, radiusCss * (scaleX + scaleY) * 0.5);
  const gradient = residueContext.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, `rgba(255, 255, 255, ${opacity})`);
  gradient.addColorStop(0.56, `rgba(255, 255, 255, ${opacity * 0.82})`);
  gradient.addColorStop(0.82, `rgba(255, 255, 255, ${opacity * 0.38})`);
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  residueContext.fillStyle = gradient;
  residueContext.beginPath();
  residueContext.arc(x, y, radius, 0, Math.PI * 2);
  residueContext.fill();
  residue.dirty = true;
}

function depositWater(deltaSeconds) {
  if (wiper.active) return;
  const speed = lens.motion.length();
  residue.timeSinceDeposit += deltaSeconds;

  if (speed < 0.065) {
    residue.dwellTime = Math.min(residue.dwellTime + deltaSeconds, 4);
  } else {
    residue.dwellTime = Math.max(0, residue.dwellTime - deltaSeconds * 2.4);
  }

  const interval = speed > 0.42 ? 0.095 : speed > 0.14 ? 0.042 : 1 / 60;
  if (residue.timeSinceDeposit < interval) return;
  residue.timeSinceDeposit %= interval;

  if (speed > 0.42) {
    depositDirection
      .set(lens.motion.x, -lens.motion.y)
      .normalize();
    depositPerpendicular.set(-depositDirection.y, depositDirection.x);
    const behind = 7 + Math.random() * 15;
    const side = (Math.random() - 0.5) * 13;
    stampWater(
      lens.position,
      2.4 + Math.random() * 3.4,
      0.42,
      -depositDirection.x * behind + depositPerpendicular.x * side,
      -depositDirection.y * behind + depositPerpendicular.y * side,
    );
    return;
  }

  if (speed > 0.14) {
    const side = (Math.random() - 0.5) * 7;
    stampWater(lens.position, 4 + Math.random() * 4, 0.24, side, -side * 0.45);
    return;
  }

  const poolRadius = 8 + Math.min(residue.dwellTime * 16, 55);
  const drift = Math.min(residue.dwellTime * 4.2, 16);
  stampWater(
    lens.position,
    poolRadius,
    0.035 + Math.min(residue.dwellTime * 0.005, 0.02),
    (Math.random() - 0.5) * drift,
    (Math.random() - 0.5) * drift,
  );
}

function flowAndEvaporateResidue(now) {
  const elapsed = (now - residue.lastFlowTime) / 1000;
  if (elapsed < 1 / 15) return;
  residue.lastFlowTime = now;

  residueBufferContext.clearRect(0, 0, residueBuffer.width, residueBuffer.height);
  residueBufferContext.save();
  residueBufferContext.filter = "blur(0.35px)";
  residueBufferContext.drawImage(
    residueCanvas,
    0,
    Math.min(elapsed * 1.2, 0.25),
  );
  residueBufferContext.restore();

  residueContext.clearRect(0, 0, residueCanvas.width, residueCanvas.height);
  residueContext.drawImage(residueBuffer, 0, 0);
  residueContext.fillStyle = `rgba(0, 0, 0, ${Math.min(elapsed * 0.018, 0.01)})`;
  residueContext.fillRect(0, 0, residueCanvas.width, residueCanvas.height);
  residue.dirty = true;
}

function startWipe() {
  if (wiper.active) return;
  wiper.active = true;
  wiper.startedAt = performance.now();
  wiper.clearedPixel = 0;
  wiperGroup.visible = true;
}

function updateWiper(now) {
  if (!wiper.active) return;

  const progress = THREE.MathUtils.clamp(
    (now - wiper.startedAt) / wiper.duration,
    0,
    1,
  );
  const eased = progress * progress * (3 - 2 * progress);
  const aspect = innerWidth / innerHeight;
  const startX = -aspect - 0.26;
  const endX = aspect + 0.82;
  wiperGroup.position.x = THREE.MathUtils.lerp(startX, endX, eased);
  wiperGroup.position.y = Math.sin(progress * Math.PI) * 0.025;
  wiperGroup.rotation.y = -0.16 + Math.sin(progress * Math.PI) * 0.10;
  wiperGroup.rotation.z = Math.sin(progress * Math.PI * 2) * 0.012;

  const bladeProgress = THREE.MathUtils.clamp(
    (wiperGroup.position.x + aspect) / (aspect * 2),
    0,
    1,
  );
  const clearUntil = Math.floor(bladeProgress * residueCanvas.width);
  if (clearUntil > wiper.clearedPixel) {
    residueContext.fillStyle = "#000";
    residueContext.fillRect(
      Math.max(0, wiper.clearedPixel - 2),
      0,
      clearUntil - wiper.clearedPixel + 4,
      residueCanvas.height,
    );
    wiper.clearedPixel = clearUntil;
    residue.dirty = true;
  }

  if (progress >= 1) {
    residueContext.fillStyle = "#000";
    residueContext.fillRect(0, 0, residueCanvas.width, residueCanvas.height);
    residueBufferContext.fillStyle = "#000";
    residueBufferContext.fillRect(0, 0, residueBuffer.width, residueBuffer.height);
    residue.dirty = true;
    residue.dwellTime = 0;
    residue.timeSinceDeposit = 0;
    wiper.active = false;
    wiperGroup.visible = false;
  }
}

let simulationTime = initialTime - INPUT_DELAY_MS;
let lastRenderTime = initialTime;

let restingRadius = 80;
let expandedRadius = 130;

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.getDrawingBufferSize(uniforms.uResolution.value);
  const aspect = innerWidth / innerHeight;
  camera.left = -aspect;
  camera.right = aspect;
  camera.top = 1;
  camera.bottom = -1;
  camera.updateProjectionMatrix();
  backdrop.scale.set(aspect, 1, 1);
  artCanvas.width = uniforms.uResolution.value.x;
  artCanvas.height = uniforms.uResolution.value.y;
  const residueWidth = matchMedia("(pointer: coarse)").matches ? 320 : 512;
  const residueHeight = Math.max(1, Math.round(residueWidth / aspect));
  residueCanvas.width = residueWidth;
  residueCanvas.height = residueHeight;
  residueBuffer.width = residueWidth;
  residueBuffer.height = residueHeight;
  residueContext.fillStyle = "#000";
  residueContext.fillRect(0, 0, residueWidth, residueHeight);
  residueUniforms.uTexel.value.set(1 / residueWidth, 1 / residueHeight);
  residueUniforms.uResolution.value.set(innerWidth, innerHeight);
  residueTexture.needsUpdate = true;
  restingRadius = THREE.MathUtils.clamp(Math.min(innerWidth, innerHeight) * 0.085, 58, 92);
  expandedRadius = THREE.MathUtils.clamp(Math.min(innerWidth, innerHeight) * 0.145, 88, 150);
  if (!Number.isFinite(lens.radius)) lens.radius = restingRadius;
  drawArt();
}

addEventListener("resize", resize);
resize();

function queuePointer(event) {
  const samples = event.getCoalescedEvents?.() ?? [];
  const events = samples.length > 0 ? samples : [event];
  for (const sample of events) {
    addPointerSample(
      sample.clientX,
      sample.clientY,
      normalizedEventTime(sample),
    );
  }
}

addEventListener("pointermove", queuePointer, { passive: true });
addEventListener(
  "pointerdown",
  (event) => {
    queuePointer(event);
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

function updatePhysics(stepTime) {
  const deltaSeconds = FIXED_STEP_MS / 1000;
  lens.previousPosition.copy(lens.position);
  lens.previousMotion.copy(lens.motion);
  lens.previousAcceleration.copy(lens.acceleration);
  lens.previousRadius = lens.radius;
  lens.previousRoll = lens.roll;
  lens.previousWobbleEnergy = lens.wobbleEnergy;

  samplePointerAt(stepTime, lens.sampledPosition);
  lens.movement.subVectors(lens.sampledPosition, lens.position);
  lens.position.copy(lens.sampledPosition);

  lens.measuredVelocity
    .set(lens.movement.x, -lens.movement.y)
    .multiplyScalar(1 / deltaSeconds / 1800)
    .clampLength(0, 1);
  lens.motion.copy(lens.velocityFilter.filter(lens.measuredVelocity, deltaSeconds));

  lens.rawAcceleration
    .subVectors(lens.motion, lens.previousMotion)
    .multiplyScalar(1 / deltaSeconds / 12)
    .clampLength(0, 1);
  lens.acceleration.copy(
    lens.accelerationFilter.filter(lens.rawAcceleration, deltaSeconds),
  );

  if (lens.movement.lengthSq() > 0.0001) {
    lens.roll +=
      (lens.movement.x - lens.movement.y) / Math.max(expandedRadius, 1) * 0.85;
    lens.wobbleEnergy = Math.min(
      1,
      lens.wobbleEnergy +
        lens.movement.length() / 360 +
        lens.acceleration.length() * 0.012,
    );
    glassOrb.rotation.y += lens.movement.x / Math.max(lens.radius, 1);
    glassOrb.rotation.x += lens.movement.y / Math.max(lens.radius, 1);
  }
  lens.wobbleEnergy *= Math.exp(-deltaSeconds * 1.15);
  depositWater(deltaSeconds);

  const expanded =
    lens.held || lens.hoveringClear || stepTime < lens.pressedUntil;
  const radiusTarget = expanded ? expandedRadius : restingRadius;
  const angularFrequency = 13;
  const dampingRatio = 0.82;
  const radiusAcceleration =
    angularFrequency * angularFrequency * (radiusTarget - lens.radius) -
    2 * dampingRatio * angularFrequency * lens.radiusVelocity;
  lens.radiusVelocity += radiusAcceleration * deltaSeconds;
  lens.radius += lens.radiusVelocity * deltaSeconds;
}

function render() {
  const now = performance.now();
  const frameSeconds = Math.min((now - lastRenderTime) / 1000, 0.05);
  lastRenderTime = now;
  flowAndEvaporateResidue(now);
  updateWiper(now);
  const targetSimulationTime = now - INPUT_DELAY_MS;
  let updates = 0;

  while (
    simulationTime + FIXED_STEP_MS <= targetSimulationTime &&
    updates < 12
  ) {
    simulationTime += FIXED_STEP_MS;
    updatePhysics(simulationTime);
    updates++;
  }

  if (targetSimulationTime - simulationTime > FIXED_STEP_MS * 12) {
    simulationTime = targetSimulationTime - FIXED_STEP_MS;
  }

  const interpolation = THREE.MathUtils.clamp(
    (targetSimulationTime - simulationTime) / FIXED_STEP_MS,
    0,
    1,
  );
  lens.renderPosition.lerpVectors(
    lens.previousPosition,
    lens.position,
    interpolation,
  );
  lens.renderMotion.lerpVectors(lens.previousMotion, lens.motion, interpolation);
  lens.renderAcceleration.lerpVectors(
    lens.previousAcceleration,
    lens.acceleration,
    interpolation,
  );
  lens.renderRadius = THREE.MathUtils.lerp(
    lens.previousRadius,
    lens.radius,
    interpolation,
  );
  const renderRoll = THREE.MathUtils.lerp(
    lens.previousRoll,
    lens.roll,
    interpolation,
  );
  const renderWobble = THREE.MathUtils.lerp(
    lens.previousWobbleEnergy,
    lens.wobbleEnergy,
    interpolation,
  );

  const aspect = innerWidth / innerHeight;
  glassOrb.position.x = (lens.renderPosition.x / innerWidth * 2 - 1) * aspect;
  glassOrb.position.y = 1 - lens.renderPosition.y / innerHeight * 2;
  const worldRadius = lens.renderRadius / innerHeight * 2;
  glassOrb.scale.setScalar(worldRadius);
  liquidNormalMap.offset.x += 0.0108 * frameSeconds;
  liquidNormalMap.offset.y -= 0.0066 * frameSeconds;
  deformation.velocity.value.copy(lens.renderMotion);
  deformation.acceleration.value.copy(lens.renderAcceleration);
  deformation.speed.value = THREE.MathUtils.clamp(lens.renderMotion.length(), 0, 1);
  deformation.wobble.value = renderWobble;
  deformation.time.value = now * 0.001;
  uniforms.uRoll.value = renderRoll;
  if (residue.dirty) {
    residueTexture.needsUpdate = true;
    residue.dirty = false;
  }

  renderer.render(scene, camera);
  requestAnimationFrame(render);
}

render();
document.documentElement.classList.add("is-ready");

const clearButton = document.querySelector(".clear-button");
clearButton.addEventListener("pointerenter", () => {
  lens.hoveringClear = true;
});
clearButton.addEventListener("pointerleave", () => {
  lens.hoveringClear = false;
});
clearButton.addEventListener("focus", () => {
  lens.hoveringClear = true;
});
clearButton.addEventListener("blur", () => {
  lens.hoveringClear = false;
});
clearButton.addEventListener("click", startWipe);
