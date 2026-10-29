import sharp from "sharp";
import { readFileSync } from "node:fs";
const sp = process.argv[2];
const variants = ["a", "b", "c"];
const sizes = [16, 24, 32, 64, 180];
const rowH = 210;
const tiles = [];
let y = 20;
for (const v of variants) {
  const svg = readFileSync(`${sp}/logo-${v}.svg`);
  let x = 30;
  for (const s of sizes) {
    const buf = await sharp(svg, { density: 600 }).resize(s, s).png().toBuffer();
    tiles.push({ input: buf, left: x, top: Math.round(y + (rowH - 30) / 2 - s / 2) });
    x += Math.max(s, 60) + 30;
  }
  y += rowH;
}
await sharp({ create: { width: 700, height: y + 10, channels: 4, background: "#e7e7e7" } })
  .composite(tiles).png().toFile(`${sp}/logo-compare.png`);
console.log("wrote logo-compare.png  (rows: A aurora ribbon, B mountain+reflection, C cut-out gable)");
