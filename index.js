// gulp-sharp-compress
// High-quality image compression for Gulp using sharp.
// Uses mozjpeg (JPEG), palette quantization (PNG), libwebp (WebP), libaom (AVIF).
// Drop-in replacement for gulp-imagemin with better performance.

import through2 from 'through2';
import sharp from 'sharp';
import PluginError from 'plugin-error';
import log from 'fancy-log';
import path from 'path';

const PLUGIN_NAME = 'gulp-sharp-compress';

/**
 * @typedef {Object} CompressOptions
 * @property {number} [quality=80] - Compression quality 1-100 (clamped)
 * @property {'original'|'jpeg'|'webp'|'png'|'avif'|'gif'} [format='original'] - Output format
 * @property {number} [maxWidth=0] - Max width in px (0 = no resize)
 * @property {number} [maxHeight=0] - Max height in px (0 = no resize)
 * @property {boolean} [progressive=true] - Progressive JPEG
 * @property {boolean} [stripMetadata=true] - Remove EXIF/GPS/metadata (orientation is baked in first)
 * @property {boolean} [keepIccProfile=false] - Keep the ICC colour profile even when stripping metadata
 * @property {number} [pngEffort=4] - PNG compression effort 1-10
 * @property {boolean} [avifLossless=false] - AVIF lossless mode
 * @property {boolean} [failOnError=false] - Throw a PluginError on unreadable images instead of passing them through
 * @property {boolean} [silent=false] - Suppress log output
 */

const DEFAULTS = {
    quality: 80,
    format: 'original',
    maxWidth: 0,
    maxHeight: 0,
    progressive: true,
    stripMetadata: true,
    keepIccProfile: false,
    pngEffort: 4,
    avifLossless: false,
    failOnError: false,
    silent: false,
};

const FORMAT_MAP = {
    '.jpg': 'jpeg',
    '.jpeg': 'jpeg',
    '.png': 'png',
    '.webp': 'webp',
    '.avif': 'avif',
    '.gif': 'gif', // keep as GIF so animation is preserved (was flattened to PNG before)
    '.tiff': 'jpeg',
    '.tif': 'jpeg',
};

const EXT_MAP = {
    jpeg: '.jpg',
    png: '.png',
    webp: '.webp',
    avif: '.avif',
    gif: '.gif',
};

// Inputs that may carry multiple frames — read with { animated: true } so we
// don't silently drop all but the first frame.
const ANIMATED_EXT = new Set(['.gif', '.webp']);

function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function getOutputFormat(ext, optionFormat) {
    if (optionFormat && optionFormat !== 'original') return optionFormat;
    return FORMAT_MAP[ext.toLowerCase()] || 'jpeg';
}

// Clamp a numeric option into [min, max]; fall back to `def` for non-numbers.
function clampInt(value, min, max, def) {
    const n = Number(value);
    if (!Number.isFinite(n)) return def;
    return Math.min(max, Math.max(min, Math.round(n)));
}

/**
 * Main Gulp plugin function
 * @param {CompressOptions} options
 * @returns {NodeJS.ReadWriteStream}
 */
export default function gulpSharpCompress(options = {}) {
    const opts = { ...DEFAULTS, ...options };

    // Validate / clamp numeric inputs so a bad option can't crash sharp or pass silently.
    opts.quality = clampInt(opts.quality, 1, 100, DEFAULTS.quality);
    opts.pngEffort = clampInt(opts.pngEffort, 1, 10, DEFAULTS.pngEffort);
    opts.maxWidth = Math.max(0, clampInt(opts.maxWidth, 0, Number.MAX_SAFE_INTEGER, 0));
    opts.maxHeight = Math.max(0, clampInt(opts.maxHeight, 0, Number.MAX_SAFE_INTEGER, 0));

    let totalOriginal = 0;
    let totalCompressed = 0;
    let fileCount = 0;
    // Track emitted output paths so a format conversion that makes two sources
    // collide (logo.png + logo.jpg -> logo.webp) warns instead of silently
    // overwriting one of them at gulp.dest.
    const seenOutPaths = new Set();

    return through2.obj(
        function (file, enc, cb) {
            // Skip null/empty
            if (file.isNull()) return cb(null, file);

            // No stream support
            if (file.isStream()) {
                return cb(new PluginError(PLUGIN_NAME, 'Streaming not supported'));
            }

            const ext = path.extname(file.path).toLowerCase();

            // Skip unsupported formats
            if (!FORMAT_MAP[ext]) return cb(null, file);

            const originalSize = file.contents.length;
            const format = getOutputFormat(ext, opts.format);
            const readAnimated = ANIMATED_EXT.has(ext);

            let pipeline = sharp(file.contents, readAnimated ? { animated: true } : undefined);

            // Auto-orient still images from EXIF BEFORE resize/encode. Without this,
            // stripping metadata below removes the orientation tag while pixels stay
            // unrotated — making portrait photos display sideways. (Skip for animated
            // inputs, where multi-frame rotation isn't supported.)
            if (!readAnimated) {
                pipeline = pipeline.rotate();
            }

            // Resize if specified
            if (opts.maxWidth > 0 || opts.maxHeight > 0) {
                pipeline = pipeline.resize({
                    width: opts.maxWidth || undefined,
                    height: opts.maxHeight || undefined,
                    fit: 'inside',
                    withoutEnlargement: true,
                });
            }

            // Metadata: sharp strips by default. Keep all of it, or keep just the
            // ICC colour profile (so wide-gamut images don't shift colour).
            if (!opts.stripMetadata) {
                pipeline = pipeline.keepMetadata();
            } else if (opts.keepIccProfile) {
                pipeline = pipeline.keepIccProfile();
            }

            // Apply format-specific encoding
            switch (format) {
                case 'jpeg':
                    pipeline = pipeline.jpeg({
                        quality: opts.quality,
                        progressive: opts.progressive,
                        mozjpeg: true, // Use mozjpeg encoder (same as TinyPNG)
                    });
                    break;

                case 'png':
                    pipeline = pipeline.png({
                        quality: opts.quality,
                        effort: opts.pngEffort,
                        palette: true, // Palette-based quantization (pngquant-like)
                    });
                    break;

                case 'webp':
                    pipeline = pipeline.webp({
                        quality: opts.quality,
                        effort: 4,
                    });
                    break;

                case 'avif':
                    pipeline = pipeline.avif({
                        quality: opts.quality,
                        effort: 4,
                        lossless: opts.avifLossless,
                    });
                    break;

                case 'gif':
                    // sharp's GIF encoder takes `colours` (2-256), not `quality`.
                    // Map quality 1-100 onto the palette size so the option still has an effect.
                    pipeline = pipeline.gif({
                        colours: clampInt(2 + (opts.quality / 100) * 254, 2, 256, 256),
                    });
                    break;
            }

            pipeline.toBuffer()
                .then((outputBuffer) => {
                    const compressedSize = outputBuffer.length;

                    // If compressed is larger, keep original (unless format changed)
                    if (compressedSize >= originalSize && opts.format === 'original') {
                        if (!opts.silent) {
                            log(
                                `${PLUGIN_NAME}:`,
                                `${file.relative}`,
                                `— skipped (already optimal)`
                            );
                        }
                        return cb(null, file);
                    }

                    const reduction = Math.round((1 - compressedSize / originalSize) * 100);
                    totalOriginal += originalSize;
                    totalCompressed += compressedSize;
                    fileCount++;

                    if (!opts.silent) {
                        log(
                            `${PLUGIN_NAME}:`,
                            `${file.relative}`,
                            `${formatSize(originalSize)} → ${formatSize(compressedSize)}`,
                            `(-${reduction}%)`,
                            `[${format}]`
                        );
                    }

                    file.contents = outputBuffer;

                    // Update extension if format changed
                    if (opts.format !== 'original' && EXT_MAP[format]) {
                        file.path = file.path.replace(/\.[^.]+$/, EXT_MAP[format]);
                    }

                    // Warn on output-path collisions (silent overwrite at gulp.dest)
                    if (seenOutPaths.has(file.path)) {
                        if (!opts.silent) {
                            log(
                                `${PLUGIN_NAME}:`,
                                `⚠ ${path.basename(file.path)} collides with an earlier output and will overwrite it`
                            );
                        }
                    } else {
                        seenOutPaths.add(file.path);
                    }

                    cb(null, file);
                })
                .catch((err) => {
                    // Unreadable/corrupt input. Either fail the build or skip it.
                    if (opts.failOnError) {
                        return cb(new PluginError(PLUGIN_NAME, `${file.relative}: ${err.message}`));
                    }
                    if (!opts.silent) {
                        log(`${PLUGIN_NAME}: ${file.relative} — skipped (${err.message})`);
                    }
                    cb(null, file);
                });
        },
        function (cb) {
            // Flush: show summary
            if (fileCount > 0 && !opts.silent) {
                const totalReduction = Math.round((1 - totalCompressed / totalOriginal) * 100);
                log(
                    `${PLUGIN_NAME}: ✓ ${fileCount} files`,
                    `${formatSize(totalOriginal)} → ${formatSize(totalCompressed)}`,
                    `(-${totalReduction}% total)`
                );
            }
            cb();
        }
    );
}

/**
 * Convenience: JPEG-only compression (mozjpeg)
 */
export function jpeg(options = {}) {
    return gulpSharpCompress({ ...options, format: 'jpeg' });
}

/**
 * Convenience: PNG-only compression (palette quantization)
 */
export function png(options = {}) {
    return gulpSharpCompress({ ...options, format: 'png' });
}

/**
 * Convenience: WebP conversion
 */
export function webp(options = {}) {
    return gulpSharpCompress({ ...options, format: 'webp' });
}

/**
 * Convenience: AVIF conversion
 */
export function avif(options = {}) {
    return gulpSharpCompress({ ...options, format: 'avif' });
}
