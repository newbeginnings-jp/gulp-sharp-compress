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
| `quality` | number | `80` | Compression quality (1-100, clamped) |
| `format` | string | `'original'` | Output format: `'original'`, `'jpeg'`, `'png'`, `'webp'`, `'avif'`, `'gif'` |
| `maxWidth` | number | `0` | Max width in px (0 = no resize) |
| `maxHeight` | number | `0` | Max height in px (0 = no resize) |
| `progressive` | boolean | `true` | Progressive JPEG |
| `stripMetadata` | boolean | `true` | Remove EXIF/GPS metadata (orientation is auto-applied first, see below) |
| `keepIccProfile` | boolean | `false` | Keep the ICC colour profile even when stripping metadata |
| `pngEffort` | number | `4` | PNG compression effort (1-10) |
| `avifLossless` | boolean | `false` | AVIF lossless mode |
| `failOnError` | boolean | `false` | Emit a `PluginError` on unreadable images instead of passing them through |
| `silent` | boolean | `false` | Suppress log output |

## Behavior & notes

- **Orientation is preserved.** Images are auto-rotated from their EXIF orientation before encoding, so portrait photos stay upright even though `stripMetadata` (default `true`) removes the orientation tag.
- **Colour profiles.** Stripping metadata also drops the ICC profile. For wide-gamut/colour-critical images, set `keepIccProfile: true`.
- **Animated GIF / WebP.** Multi-frame inputs are read with all frames intact (no flattening to the first frame). Converting an animated source to a still format (e.g. PNG) will still flatten it. Because `.webp` may be animated, static WebP files skip EXIF auto-rotation — convert to JPEG first if you need a static WebP auto-oriented. For GIF output, `quality` (1-100) is mapped to the GIF palette size (`colours`, 2-256).
- **Format conversion can collide.** Converting `logo.png` and `logo.jpg` in the same folder to WebP both produce `logo.webp`; the second overwrites the first at `gulp.dest`. The plugin logs a `⚠ … collides …` warning when this happens — keep distinct basenames or output to separate folders.
- **`failOnError` and Gulp error handling.** With `failOnError: true` the plugin emits a `PluginError`. As with any Gulp plugin, errors do not stop the build unless you handle them — add `.on('error', …)` or use `gulp-plumber`. With the default `failOnError: false`, unreadable files are logged and passed through untouched so one bad asset never breaks the build.

## Codecs

| Format | Codec | Equivalent |
|--------|-------|------------|
| JPEG | mozjpeg | TinyPNG, Squoosh |
| PNG | palette quantization | pngquant |
| WebP | libwebp | cwebp |
| AVIF | libaom | avifenc |

## License

MIT
