// Reads the exact brand colours out of the supplied artwork, so the site's tokens match the
// logo rather than being eyeballed from a screenshot.
import sharp from 'sharp';

const file = process.argv[2];
const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height, channels } = info;

const counts = new Map();
for (let i = 0; i < data.length; i += channels) {
  if (data[i + 3] < 200) continue;
  // Bucket to 8 levels per channel so antialiasing does not drown the real colours
  const key = [data[i], data[i + 1], data[i + 2]].map((v) => v >> 3 << 3).join(',');
  counts.set(key, (counts.get(key) || 0) + 1);
}
const total = [...counts.values()].reduce((a, b) => a + b, 0);
const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);

console.log(`${file.split(/[\\/]/).pop()}  ${width}x${height}`);
for (const [key, n] of top) {
  const [r, g, b] = key.split(',').map(Number);
  const hex = '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
  console.log(`  ${hex}  rgb(${r}, ${g}, ${b})  ${((n / total) * 100).toFixed(1)}%`);
}
