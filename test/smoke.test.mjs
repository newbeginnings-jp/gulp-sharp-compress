// Smoke tests for gulp-sharp-compress.
// Generates fixture images in-memory with sharp (no external fixtures),
// pipes them through the plugin's streams, and asserts correct behavior.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import compress, { webp, avif, jpeg, png, compressBuffer } from '../index.js';

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

// A 200x100 landscape JPEG tagged orientation=6 (meant to display rotated 90°).
async function makeOrientedJpeg() {
  return sharp({ create: { width: 200, height: 100, channels: 3, background: { r: 200, g: 60, b: 60 } } })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();
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

test('auto-orients from EXIF so stripped portrait photos are not left sideways', async () => {
  const input = await makeOrientedJpeg(); // 200x100, orientation=6
  const out = await run(compress({ quality: 80, silent: true }), input, '/x/portrait.jpg');
  const meta = await sharp(out.contents).metadata();
  // .rotate() bakes the 90° rotation into the pixels -> dimensions swap to 100x200.
  assert.equal(meta.width, 100, 'width becomes the short side after auto-orient');
  assert.equal(meta.height, 200, 'height becomes the long side after auto-orient');
  // And the orientation tag is no longer relied upon (normalized / stripped).
  assert.ok(meta.orientation === undefined || meta.orientation === 1, 'orientation normalized');
});

test('keepMetadata + EXIF orientation does NOT double-rotate', async () => {
  const input = await makeOrientedJpeg(); // 200x100, orientation=6
  const out = await run(
    compress({ quality: 80, silent: true, stripMetadata: false }),
    input, '/x/portrait.jpg'
  );
  const meta = await sharp(out.contents).metadata();
  // Pixels are baked-rotated to 100x200; the orientation tag must be normalized
  // even though metadata is kept, or EXIF-aware viewers would rotate again.
  assert.equal(meta.width, 100, 'short side after orient');
  assert.equal(meta.height, 200, 'long side after orient');
  assert.ok(
    meta.orientation === undefined || meta.orientation === 1,
    'orientation must be normalized even when keepMetadata is active'
  );
});

test('failOnError: true surfaces a PluginError instead of silently passing through', async () => {
  const corrupt = Buffer.from('\x89PNG not really a png');
  await assert.rejects(
    () => run(compress({ silent: true, failOnError: true }), corrupt, '/x/broken.png'),
    /broken\.png/,
    'stream should error and name the offending file'
  );
});

test('failOnError defaults to false: corrupt input passes through unchanged', async () => {
  const corrupt = Buffer.from('\x89PNG not really a png');
  const out = await run(compress({ silent: true }), corrupt, '/x/broken.png');
  assert.deepEqual(out.contents, corrupt, 'corrupt input is passed through untouched');
});

test('out-of-range quality is clamped, not crashed', async () => {
  const input = await makeFixturePng();
  const out = await run(jpeg({ quality: 999, silent: true }), input, '/x/grad.png'); // clamped to 100
  assert.ok(out.contents.length > 0, 'still produces a valid JPEG');
  assert.equal(out.contents[0], 0xff, 'JPEG SOI byte 1');
  assert.equal(out.contents[1], 0xd8, 'JPEG SOI byte 2');
});

// --- Programmatic API: compressBuffer (usable outside Gulp) ---

test('compressBuffer compresses a PNG buffer and returns metadata', async () => {
  const input = await makeFixturePng();
  const res = await compressBuffer(input, { quality: 80 });
  assert.ok(Buffer.isBuffer(res.data), 'returns a Buffer in .data');
  assert.equal(res.format, 'png', 'keeps original format');
  assert.equal(res.originalSize, input.length);
  assert.equal(res.compressedSize, res.data.length);
});

test('compressBuffer converts to WebP when format is set', async () => {
  const input = await makeFixturePng();
  const res = await compressBuffer(input, { format: 'webp', quality: 80 });
  assert.equal(res.format, 'webp');
  assert.equal(res.data.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(res.data.subarray(8, 12).toString('ascii'), 'WEBP');
});

test('compressBuffer auto-orients from EXIF', async () => {
  const input = await makeOrientedJpeg(); // 200x100, orientation=6
  const res = await compressBuffer(input, { quality: 80 });
  const meta = await sharp(res.data).metadata();
  assert.equal(meta.width, 100, 'short side after auto-orient');
  assert.equal(meta.height, 200, 'long side after auto-orient');
});

test('compressBuffer rejects non-Buffer input', async () => {
  await assert.rejects(() => compressBuffer('not a buffer'), /Buffer/);
});

test('compressBuffer rejects an unsupported input format', async () => {
  await assert.rejects(() => compressBuffer(Buffer.from('plain text, not an image')));
});
