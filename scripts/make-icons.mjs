import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";
const svg = readFileSync(process.argv[2]);
const outDir = process.argv[3];
const previewDir = process.argv[4];
// Site icons
for (const [name, size] of [["favicon-32.png", 32], ["favicon-16.png", 16], ["apple-touch-icon.png", 180]]) {
  await sharp(svg, { density: 400 }).resize(size, size).png().toFile(outDir + "/" + name);
  console.log("wrote", name, size + "px");
}
// A contact sheet so the mark can be judged at the sizes it will actually be seen at
const sizes = [16, 24, 32, 48, 96, 256];
const tiles = [];
let x = 8;
for (const s of sizes) {
  const buf = await sharp(svg, { density: 500 }).resize(s, s).png().toBuffer();
  tiles.push({ input: buf, left: x, top: Math.round(140 - s / 2) });
  x += s + 24;
}
await sharp({ create: { width: x, height: 280, channels: 4, background: "#e7e7e7" } })
  .composite(tiles).png().toFile(previewDir + "/logo-sizes.png");
console.log("wrote logo-sizes.png");
