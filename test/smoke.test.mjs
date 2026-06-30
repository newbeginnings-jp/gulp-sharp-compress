// Smoke tests for gulp-sharp-compress.
// Generates a fixture image in-memory with sharp (no external fixtures),
// pipes it through the plugin's streams, and asserts correct behavior.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import compress, { webp, avif, jpeg, png } from '../index.js';

// A 256x256 RGB gradient compresses well and decodes in every codec.
async function makeFixturePng() {
  const w = 256, h = 256;
  const raw = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      raw[i] = x;            // R ramp
      raw[i + 1] = y;        // G ramp
      raw[i + 2] = (x + y) >> 1; // B
    }
  }
  return sharp(raw, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
}

function makeVinyl(buf, p) {
  return {
    path: p,
    relative: p.split('/').pop(),
    contents: buf,
    isNull() { return this.contents == null; },
    isStream() { return false; },
  };
}

function run(stream, input, srcPath) {
  return new Promise((resolve, reject) => {
    let out = null;
    stream.on('data', (f) => { out = f; });
    stream.on('error', reject);
    stream.on('end', () => out ? resolve(out) : reject(new Error('no output')));
    stream.write(makeVinyl(Buffer.from(input), srcPath));
    stream.end();
  });
}

test('compresses PNG in original format and returns a non-empty buffer', async () => {
  const input = await makeFixturePng();
  const out = await run(compress({ quality: 80, silent: true }), input, '/x/grad.png');
  assert.ok(out.contents.length > 0, 'output buffer should be non-empty');
  assert.equal(out.path.endsWith('.png'), true, 'extension stays .png');
});

test('converts to WebP with a valid WebP signature and .webp extension', async () => {
  const input = await makeFixturePng();
  const out = await run(webp({ quality: 80, silent: true }), input, '/x/grad.png');
  assert.equal(out.path.endsWith('.webp'), true, 'extension switches to .webp');
  // RIFF....WEBP container signature
  assert.equal(out.contents.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(out.contents.subarray(8, 12).toString('ascii'), 'WEBP');
});

test('converts to AVIF with .avif extension and non-empty output', async () => {
  const input = await makeFixturePng();
  const out = await run(avif({ quality: 60, silent: true }), input, '/x/grad.png');
  assert.equal(out.path.endsWith('.avif'), true, 'extension switches to .avif');
  assert.ok(out.contents.length > 0);
});

test('jpeg convenience export emits .jpg', async () => {
  const input = await makeFixturePng();
  const out = await run(jpeg({ quality: 80, silent: true }), input, '/x/grad.png');
  assert.equal(out.path.endsWith('.jpg'), true);
});

test('png convenience export keeps .png and stays non-empty', async () => {
  const input = await makeFixturePng();
  const out = await run(png({ quality: 80, silent: true }), input, '/x/grad.png');
  assert.equal(out.path.endsWith('.png'), true);
  assert.ok(out.contents.length > 0);
});

test('passes through unsupported extensions untouched', async () => {
  const input = Buffer.from('not an image');
  const out = await run(compress({ silent: true }), input, '/x/notes.txt');
  assert.deepEqual(out.contents, input, 'non-image content is left as-is');
  assert.equal(out.path.endsWith('.txt'), true);
});
