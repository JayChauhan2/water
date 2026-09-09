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

The stable circular lens uses spherical normals, bevel-localized spectral
dispersion, Schlick Fresnel reflection, wavelength-selective absorption,
flowing caustics, continuously moving surface normals, and a point light fixed
to the center of the viewport. Pointer movement rolls the internal optical
surface, while pressing smoothly expands the lens and releasing contracts it.
Volumetric path length, environment reflection, body shading, and a
light-relative cast shadow give the orb its depth. Built with Vite, Three.js,
Canvas 2D, and custom GLSL.
