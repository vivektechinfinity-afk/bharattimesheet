# Static assets

## logo.png

The Bharat Enterprises "EB" monogram. Loaded by `src/components/Logo.jsx`, which falls
back to an inline SVG recreation if the file is missing — so the app never shows a
broken image.

**Current file is 68×68, which is too small.** The logo renders at up to 64 CSS px, and
on a 2× retina display that needs **128 physical pixels** — so it is being upscaled and
looks soft.

**Replace it with a 256×256 (or larger) square transparent PNG.** No code change needed;
just overwrite `logo.png`. The same file is also used as the browser-tab favicon, which
wants at least 180×180 for the Apple touch icon.

| Where | CSS size | Needs at 2× |
|---|---|---|
| Login page | 64 px | 128 px |
| Sidebar | 42 px | 84 px |
| Navbar | 32 px | 64 px |
| Favicon / touch icon | — | 180 px |
