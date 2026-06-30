# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.1] - 2026-06-30

### Changed
- Translated the README to Japanese (code samples and API identifiers remain in
  English). Documentation only — no code changes.

## [1.1.0] - 2026-06-30

### Added
- **Programmatic API `compressBuffer(buffer, options)`** — compress a single image
  `Buffer` without Gulp, for use in any Node script, serverless function, or other
  build tool. Resolves to `{ data, format, originalSize, compressedSize, skipped }`.

### Changed
- Extracted the shared sharp pipeline so the Gulp stream and `compressBuffer` use
  identical encoding (auto-orient, metadata handling, resize, validation). The Gulp
  API is unchanged (backward compatible).

## [1.0.0] - 2026-06-30

### Added
- Initial release: a Gulp plugin for high-quality image compression using
  [sharp](https://sharp.pixelplumbing.com/) (mozjpeg / oxipng / libwebp / libaom).
- Default export plus `jpeg` / `png` / `webp` / `avif` convenience exports.
- **Auto-orientation** from EXIF before encoding, so portrait photos are not left
  sideways when metadata is stripped.
- Options: `quality`, `format`, `maxWidth` / `maxHeight`, `progressive`,
  `stripMetadata`, `keepIccProfile`, `pngEffort`, `avifLossless`, `failOnError`,
  `silent` (numeric options are clamped to valid ranges).
- Animated GIF / WebP frames are preserved (no flattening to the first frame).
- Output-path collision warning when a format conversion would overwrite a file
  at `gulp.dest`.
- Keeps the original file when re-encoding would make it larger (same-format).

[1.1.1]: https://github.com/newbeginnings-jp/gulp-sharp-compress/releases/tag/v1.1.1
[1.1.0]: https://github.com/newbeginnings-jp/gulp-sharp-compress/releases/tag/v1.1.0
[1.0.0]: https://github.com/newbeginnings-jp/gulp-sharp-compress/releases/tag/v1.0.0
