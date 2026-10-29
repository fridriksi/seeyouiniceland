import sharp from "sharp";
import { readFileSync } from "node:fs";
const [pub, out] = process.argv.slice(2);
const tiles = [];
// Header lockup on the page ground, at the height the nav renders it
const head = await sharp(readFileSync(pub + "/logo-wordmark.png")).resize({ height: 46 }).png().toBuffer();
const headMeta = await sharp(head).metadata();
tiles.push({ input: await sharp({ create: { width: headMeta.width + 40, height: 86, channels: 4, background: "#e7e7e7" } })
  .composite([{ input: head, left: 20, top: 20 }]).png().toBuffer(), left: 20, top: 20 });
// Footer lockup on the slate ground, at its real width
const foot = await sharp(readFileSync(pub + "/logo-wordmark-light.png")).resize({ width: 300 }).png().toBuffer();
const footMeta = await sharp(foot).metadata();
tiles.push({ input: await sharp({ create: { width: 340, height: footMeta.height + 40, channels: 4, background: "#4b6681" } })
  .composite([{ input: foot, left: 20, top: 20 }]).png().toBuffer(), left: 20, top: 130 });
await sharp({ create: { width: 620, height: 320, channels: 4, background: "#ffffff" } })
  .composite(tiles).png().toFile(out);
console.log("top = header at 46px on page grey, bottom = footer at 300px on slate");
