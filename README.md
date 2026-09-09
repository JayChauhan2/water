# Stillwater

An immersive portfolio concept built around an interactive WebGL alpine lake.
Move across the water to create ripples, drag the landscape, change the time
of day, or open the information view.

## Run locally

```bash
npm install
npm run dev
```

Create a production build with `npm run build`.

## Customize

- Portfolio copy and contact details: `index.html`
- Typography, layout, and colors: `src/styles.css`
- Water shader, time controls, and ripple behavior: `src/main.js`
- Original landscape artwork: `public/alpine-lake.webp`

Built with Vite and Three.js. Ambient lake audio is generated in the browser.
