# Soft Focus

An experimental digital design exhibition built around a physically inspired
WebGL liquid-glass cursor. Move the lens through a field of pop-art typography
to refract, magnify, and split the colors beneath it.

## Run locally

```bash
npm install
npm run dev
```

Create a production build with `npm run build`.

## Customize

- Exhibition copy and interface: `index.html`
- Interface typography and responsive layout: `src/styles.css`
- Canvas artwork, spring motion, and glass shader: `src/main.js`

The bubble is a tessellated 3D sphere rendered with physically based
transmission, thickness, IOR, spectral dispersion, clearcoat, attenuation,
clear-water blue absorption, environment reflections, and a page-centered
point light. A flowing normal map
rotates with pointer movement. Pointer speed, direction, and acceleration
deform the sphere's vertices and optical normals, exciting damped surface-wave
modes after movement stops. Pressing smoothly expands the geometry and
releasing contracts it.

Pointer input is buffered from coalesced browser samples, reconstructed with a
small interpolation window, and converted to velocity and acceleration through
One Euro filters. Bubble physics runs at a fixed 120 Hz and is interpolated for
rendering, while the transmissive buffer uses an optimized resolution scale.

The orb continuously deposits water into a persistent height map. Fast motion
leaves sparse droplets; slower movement leaves a denser trail; dwelling builds
an irregular refractive pool. The residue has surface-normal refraction,
spectral edges, center-relative lighting, surface-tension diffusion, gravity
drift, and slow evaporation.

Built with Vite, Three.js, and Canvas 2D.
