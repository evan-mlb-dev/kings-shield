// Usage:  node src/app/data/fetch-shiny-sprites.mjs

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '../../../public/images/pokemon/shiny');
const BASE =
  'https://raw.githubusercontent.com/JwowSquared/Radical-Red-Pokedex/master/graphics/species/front%20shiny/';
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function transparentBackground(png) {
  if (!png.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('Not a PNG');
  const colorType = png[25];
  if (colorType !== 3) return png;
  const parts = [png.subarray(0, 8)];
  let offset = 8;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const end = offset + 12 + length;
    if (type !== 'tRNS') parts.push(png.subarray(offset, end));
    if (type === 'PLTE') parts.push(chunk('tRNS', Buffer.from([0])));
    offset = end;
  }
  return Buffer.concat(parts);
}

const species = JSON.parse(await readFile(join(here, 'species.json'), 'utf8'));
const ids = Object.keys(species);
await mkdir(outDir, { recursive: true });

let saved = 0;
const missing = [];
for (let i = 0; i < ids.length; i += 16) {
  await Promise.all(
    ids.slice(i, i + 16).map(async (id) => {
      const response = await fetch(`${BASE}${id}.png`);
      if (!response.ok) {
        missing.push(id);
        return;
      }
      const png = transparentBackground(Buffer.from(await response.arrayBuffer()));
      await writeFile(join(outDir, `${id}.png`), png);
      saved++;
    }),
  );
}
console.log(
  `${saved} shiny sprites saved, ${missing.length} missing (${missing.slice(0, 10).join(', ')})`,
);
