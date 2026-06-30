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
 * @property {number} [quality=80] - Compression quality 1-100
 * @property {'original'|'jpeg'|'webp'|'png'|'avif'} [format='original'] - Output format
 * @property {number} [maxWidth=0] - Max width in px (0 = no resize)
 * @property {number} [maxHeight=0] - Max height in px (0 = no resize)
 * @property {boolean} [progressive=true] - Progressive JPEG
 * @property {boolean} [stripMetadata=true] - Remove EXIF/metadata
 * @property {number} [pngEffort=4] - PNG compression effort 1-10
 * @property {boolean} [avifLossless=false] - AVIF lossless mode
 * @property {boolean} [silent=false] - Suppress log output
 */

const DEFAULTS = {
    quality: 80,
    format: 'original',
    maxWidth: 0,
    maxHeight: 0,
    progressive: true,
    stripMetadata: true,
    pngEffort: 4,
    avifLossless: false,
    silent: false,
};

const FORMAT_MAP = {
    '.jpg': 'jpeg',
    '.jpeg': 'jpeg',
    '.png': 'png',
    '.webp': 'webp',
    '.avif': 'avif',
    '.gif': 'png', // GIF → PNG
    '.tiff': 'jpeg',
    '.tif': 'jpeg',
};

const EXT_MAP = {
    jpeg: '.jpg',
    png: '.png',
    webp: '.webp',
    avif: '.avif',
};

function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function getOutputFormat(ext, optionFormat) {
    if (optionFormat && optionFormat !== 'original') return optionFormat;
    return FORMAT_MAP[ext.toLowerCase()] || 'jpeg';
}

/**
 * Main Gulp plugin function
 * @param {CompressOptions} options
 * @returns {NodeJS.ReadWriteStream}
 */
export default function gulpSharpCompress(options = {}) {
    const opts = { ...DEFAULTS, ...options };
    let totalOriginal = 0;
    let totalCompressed = 0;
    let fileCount = 0;

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

            let pipeline = sharp(file.contents);

            // Resize if specified
            if (opts.maxWidth > 0 || opts.maxHeight > 0) {
                pipeline = pipeline.resize({
                    width: opts.maxWidth || undefined,
                    height: opts.maxHeight || undefined,
                    fit: 'inside',
                    withoutEnlargement: true,
                });
            }

            // Strip metadata (sharp strips by default; withMetadata(true) to keep)
            if (!opts.stripMetadata) {
                pipeline = pipeline.withMetadata();
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

                    cb(null, file);
                })
                .catch((err) => {
                    // Skip unsupported/corrupt files instead of crashing
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
