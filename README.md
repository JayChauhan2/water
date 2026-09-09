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

The lens uses spherical normals, index-of-refraction offsets, RGB dispersion,
Schlick Fresnel reflection, adaptive highlights, and spring-based deformation.
Built with Vite, Three.js, Canvas 2D, and custom GLSL.
