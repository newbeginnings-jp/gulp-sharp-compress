# gulp-sharp-compress

[sharp](https://sharp.pixelplumbing.com/) を使った高品質な画像圧縮の Gulp プラグインです。`gulp-imagemin` のドロップイン代替として、より高速に動作します。

TinyPNG と同系統のコーデック（JPEG は mozjpeg、PNG はパレット量子化による減色）に加え、WebP / AVIF への変換にも対応します。

## インストール

```bash
npm install gulp-sharp-compress
```

## 使い方

```js
import gulp from 'gulp';
import compress, { webp, avif } from 'gulp-sharp-compress';

// デフォルト: 元のフォーマットのまま圧縮
gulp.src('src/images/**/*.{jpg,png}', { encoding: false })
    .pipe(compress({ quality: 80 }))
    .pipe(gulp.dest('dist/images'));

// WebP に変換
gulp.src('src/images/**/*.{jpg,png}', { encoding: false })
    .pipe(webp({ quality: 80 }))
    .pipe(gulp.dest('dist/images'));

// AVIF に変換
gulp.src('src/images/**/*.{jpg,png}', { encoding: false })
    .pipe(avif({ quality: 60 }))
    .pipe(gulp.dest('dist/images'));
```

**重要:** Gulp 5 ではバイナリファイルに `{ encoding: false }` が必要です。

## プログラマティック API（Gulp なしで使う）

Gulp は必須ではありません。`compressBuffer` は画像の `Buffer` を1枚圧縮する関数で、任意の Node スクリプト・サーバーレス関数・他のビルドツールで動作します。オプションは Gulp 版と同じです。

```js
import { readFile, writeFile } from 'node:fs/promises';
import { compressBuffer } from 'gulp-sharp-compress';

const input = await readFile('photo.png');

// 同じフォーマットのまま圧縮
const { data, originalSize, compressedSize } = await compressBuffer(input, { quality: 80 });
await writeFile('photo.min.png', data);

// AVIF に変換
const avif = await compressBuffer(input, { format: 'avif', quality: 60 });
await writeFile('photo.avif', avif.data);
```

`compressBuffer(input, options)` は `{ data, format, originalSize, compressedSize, skipped }` を返します。`skipped` は、同じフォーマットでの再エンコードでファイルがかえって大きくなる場合に `true` になります（そのとき `data` は元の Buffer です）。向きの自動補正・メタデータ処理・リサイズ・バリデーションは、すべて Gulp パイプラインとまったく同じ挙動です。

## オプション

| オプション | 型 | デフォルト | 説明 |
|--------|------|---------|-------------|
| `quality` | number | `80` | 圧縮品質（1〜100、範囲外はクランプ） |
| `format` | string | `'original'` | 出力フォーマット: `'original'`, `'jpeg'`, `'png'`, `'webp'`, `'avif'`, `'gif'` |
| `maxWidth` | number | `0` | 最大幅（px、`0` でリサイズなし） |
| `maxHeight` | number | `0` | 最大高さ（px、`0` でリサイズなし） |
| `progressive` | boolean | `true` | プログレッシブ JPEG |
| `stripMetadata` | boolean | `true` | EXIF/GPS などのメタデータを除去（先に向きを画素へ焼き込みます。下記参照） |
| `keepIccProfile` | boolean | `false` | メタデータ除去時も ICC カラープロファイルは残す |
| `pngEffort` | number | `4` | PNG 圧縮の処理強度（1〜10） |
| `avifLossless` | boolean | `false` | AVIF ロスレスモード |
| `failOnError` | boolean | `false` | 読み込めない画像をそのまま通さず `PluginError` を発生させる |
| `silent` | boolean | `false` | ログ出力を抑制 |

## 挙動と注意点

- **向きは保持されます。** エンコード前に EXIF の向き情報を画素へ自動適用するため、`stripMetadata`（デフォルト `true`）で向きタグが消えても、縦向きの写真が横倒しになりません。
- **カラープロファイル。** メタデータを除去すると ICC プロファイルも失われます。広色域・色が重要な画像では `keepIccProfile: true` を指定してください。
- **アニメーション GIF / WebP。** 複数フレームの入力は全フレームを保持します（先頭1枚に潰しません）。アニメーション素材を静止画フォーマット（例: PNG）へ変換した場合は1枚に統合されます。`.webp` はアニメーションの可能性があるため、静止 WebP は EXIF の自動回転をスキップします（自動補正したい場合は一度 JPEG に変換してください）。GIF 出力では `quality`（1〜100）が GIF のパレット色数（`colours`、2〜256）にマッピングされます。
- **フォーマット変換時の名前衝突。** 同じフォルダの `logo.png` と `logo.jpg` をどちらも WebP に変換すると、両方が `logo.webp` になり、`gulp.dest` で後者が前者を上書きします。この場合プラグインは `⚠ … collides …` の警告を出します。ベース名を分けるか、出力先フォルダを分けてください。
- **`failOnError` と Gulp のエラー処理。** `failOnError: true` のときはプラグインが `PluginError` を発生させます。Gulp プラグイン一般の挙動として、エラーをハンドリングしない限りビルドは止まりません（`.on('error', …)` を付けるか `gulp-plumber` を使ってください）。デフォルトの `failOnError: false` では、読み込めないファイルはログを出してそのまま素通しするため、1枚の不良ファイルでビルド全体が壊れることはありません。

## コーデック

| フォーマット | コーデック | 相当するもの |
|--------|-------|------------|
| JPEG | mozjpeg | TinyPNG / Squoosh |
| PNG | パレット量子化（減色） | pngquant |
| WebP | libwebp | cwebp |
| AVIF | libaom | avifenc |

## ライセンス

MIT
