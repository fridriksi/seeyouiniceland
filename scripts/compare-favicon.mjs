import sharp from "sharp";
import { readFileSync } from "node:fs";
const [svgPath, rasterPath, out] = process.argv.slice(2);
const svg = readFileSync(svgPath);
const sizes = [16, 24, 32, 64, 128];
const tiles = [];
let y = 24;
for (const [label, src, isSvg] of [["vector", svg, true], ["their PNG", readFileSync(rasterPath), false]]) {
  let x = 40;
  for (const s of sizes) {
    const buf = isSvg
      ? await sharp(src, { density: 700 }).resize(s, s).png().toBuffer()
      : await sharp(src).resize(s, s, { fit: "contain", background: "#ffffff" }).png().toBuffer();
    tiles.push({ input: buf, left: x, top: Math.round(y + 70 - s / 2) });
    x += Math.max(s, 70) + 26;
  }
  y += 170;
}
await sharp({ create: { width: 620, height: y + 10, channels: 4, background: "#e7e7e7" } })
  .composite(tiles).png().toFile(out);
console.log("top row = my vector, bottom row = your PNG scaled down");
