# gulp-sharp-compress

High-quality image compression for Gulp using [sharp](https://sharp.pixelplumbing.com/). Drop-in replacement for `gulp-imagemin` with better performance.

Uses the same codecs as TinyPNG (mozjpeg for JPEG, palette quantization for PNG) plus WebP and AVIF support.

## Install

```bash
npm install gulp-sharp-compress
```

## Usage

```js
import gulp from 'gulp';
import compress, { webp, avif } from 'gulp-sharp-compress';

// Default: compress in original format
gulp.src('src/images/**/*.{jpg,png}', { encoding: false })
    .pipe(compress({ quality: 80 }))
    .pipe(gulp.dest('dist/images'));

// Convert to WebP
gulp.src('src/images/**/*.{jpg,png}', { encoding: false })
    .pipe(webp({ quality: 80 }))
    .pipe(gulp.dest('dist/images'));

// Convert to AVIF
gulp.src('src/images/**/*.{jpg,png}', { encoding: false })
    .pipe(avif({ quality: 60 }))
    .pipe(gulp.dest('dist/images'));
```

**Important:** Gulp 5 requires `{ encoding: false }` for binary files.

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `quality` | number | `80` | Compression quality (1-100) |
| `format` | string | `'original'` | Output format: `'original'`, `'jpeg'`, `'png'`, `'webp'`, `'avif'` |
| `maxWidth` | number | `0` | Max width in px (0 = no resize) |
| `maxHeight` | number | `0` | Max height in px (0 = no resize) |
| `progressive` | boolean | `true` | Progressive JPEG |
| `stripMetadata` | boolean | `true` | Remove EXIF/GPS metadata |
| `pngEffort` | number | `4` | PNG compression effort (1-10) |
| `avifLossless` | boolean | `false` | AVIF lossless mode |
| `silent` | boolean | `false` | Suppress log output |

## Codecs

| Format | Codec | Equivalent |
|--------|-------|------------|
| JPEG | mozjpeg | TinyPNG, Squoosh |
| PNG | palette quantization | pngquant |
| WebP | libwebp | cwebp |
| AVIF | libaom | avifenc |

## License

MIT
