// Rasterize the official Claude mark from the checked-in SVG. No network access.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { Resvg } from '@resvg/resvg-js';

const source = await readFile(new URL('../assets/claude-mark.svg', import.meta.url), 'utf8');
const output = new URL('../extension/icons/', import.meta.url);
await mkdir(output, { recursive: true });

for (const size of [16, 32, 48, 128]) {
  const renderer = new Resvg(source, {
    fitTo: { mode: 'width', value: size },
    font: { loadSystemFonts: false },
  });
  const png = renderer.render();
  if (png.width !== size || png.height !== size) {
    throw new Error(`Expected a ${size} × ${size} icon`);
  }
  await writeFile(new URL(`${size}.png`, output), png.asPng());
}
console.log('Generated Claude icons: 16, 32, 48 and 128px.');
