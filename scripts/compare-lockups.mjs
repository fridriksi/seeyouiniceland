import sharp from "sharp";
import { readFileSync } from "node:fs";
const sp = process.argv[2];
const tiles = [];
// Header lockup at real nav size, then large
const l1 = readFileSync(`${sp}/lockup-1.svg`);
tiles.push({ input: await sharp(l1, { density: 600 }).resize({ height: 100 }).png().toBuffer(), left: 30, top: 20 });
tiles.push({ input: await sharp(l1, { density: 600 }).resize({ height: 44 }).png().toBuffer(), left: 30, top: 140 });
// Display lockup large, then at a size it would realistically be used
const l2 = readFileSync(`${sp}/lockup-2.svg`);
tiles.push({ input: await sharp(l2, { density: 600 }).resize({ height: 150 }).png().toBuffer(), left: 30, top: 220 });
tiles.push({ input: await sharp(l2, { density: 600 }).resize({ height: 70 }).png().toBuffer(), left: 30, top: 390 });
await sharp({ create: { width: 700, height: 480, channels: 4, background: "#e7e7e7" } })
  .composite(tiles).png().toFile(`${sp}/lockup-compare.png`);
console.log("ok");
