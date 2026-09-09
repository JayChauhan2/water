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
environment reflections, and a page-centered point light. A flowing normal map
rotates with pointer movement, while pressing smoothly expands the geometry and
releasing contracts it. Built with Vite, Three.js, and Canvas 2D.
