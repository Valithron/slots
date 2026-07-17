# Artwork Guide

## Recommended export format

- Square aspect ratio
- 512 x 512 px minimum
- 1024 x 1024 px preferred
- Transparent PNG
- Keep heads and important details inside the center 80 percent
- Use consistent head scale and framing across all seven portraits
- Avoid important details in the outer 8 percent, which may visually approach the reel frame

## Suggested accent colors

- Sterling: `#D3D8E8`
- Cydney: `#86A66A`
- Ryan: `#A276FF`
- Gabi: `#89D2FF`
- Cooper: `#E0AA3E`
- Kenly: `#65E6CC`
- Ashley: `#FF7FBA`
- Tree of Life: silver, white, and restrained gold

## Replacement workflow

1. Finish each portrait as a separate square image.
2. Export each one as a transparent PNG.
3. Put the files in `assets/symbols/`.
4. Change the eight image paths inside `CONFIG.symbols` in `index.html` from `.svg` to `.png`.
5. Reload the page.

The reel strips are constructed by JavaScript, so you do not need to assemble the 24-stop strips manually unless you later switch to a sprite-sheet engine.
