# Image Rendering

## Problem

How do we currently render images in the applications and in our automation-generated files (PDFs, HTML docs, etc.)? Are we handling this in an efficient way? Should we be storing multiple versions of the same image (low res, high res), using low res images in list views, and high res images in detail views? Are we caching images on the client side or are we fetching them from the server every time? Are we handling image resizing and caching in a way that is efficient and scalable?

## Current State

### 1. Exodus Platform (packages/web + packages/api)

The platform itself has **minimal image handling**:

- **User profile images** are stored as nullable URL strings on the `User` model in Prisma (`image String?`). These originate from Google OAuth and are served directly from Google's CDN.
- The `Avatar` component (`packages/web/src/components/ui/avatar.tsx`) wraps Radix UI's `AvatarPrimitive` and renders `<img>` tags at fixed sizes (32px in navbar, 36px in testimonials, 64px in profile settings). Falls back to initials via `initials()` utility.
- **No image upload endpoint** exists in `packages/api`. No multipart handling, no storage backend integration.
- **No caching strategy**: no service worker, no Cache-Control headers, no local storage caching. Relies entirely on browser HTTP cache defaults.
- **No lazy loading**, no `srcset`, no responsive variants, no WebP/AVIF.

### 2. Generated Apps (packages/app-generator)

The generated full-stack apps have a more complete image pipeline:

#### Upload & Storage

- **Upload endpoint** (`POST /api/upload`): Generated in `ApiGenerator.ts` when any table has `Image` or `File` columns. Accepts `multipart/form-data`, assigns a `crypto.randomUUID()` filename, and stores via a pluggable `StorageProvider`.
- **Storage providers** (generated in `lib/storage.ts`):
  - `LocalProvider` — writes to `./uploads/`, serves via Fastify static at `/uploads/`.
  - `GCSProvider` — uploads to Google Cloud Storage bucket, returns `https://storage.googleapis.com/{bucket}/{key}` URL.
  - `S3Provider` — uploads to AWS S3 bucket, returns `https://{bucket}.s3.{region}.amazonaws.com/{key}` URL.
  - Selected via `STORAGE_PROVIDER` env var.

#### Thumbnail Generation

- **Single thumbnail variant**: When an uploaded file has an `image/*` MIME type, the upload endpoint generates one `200x200` cover-cropped thumbnail using `sharp` and stores it alongside the original as `{uuid}_thumb{ext}`.
- The upload response returns `{ url, thumbnailUrl? }`.
- **Only one size** is generated — there is no multi-resolution pipeline (e.g., small/medium/large).

#### Frontend Rendering

- **Table/list views** (`CellRenderer`, line ~4371): For `Image` columns, the generated code constructs a thumbnail URL by appending `_thumb` before the file extension and renders it at `h-8 w-8`. Falls back to the original URL via `onError`.
- **Gallery/deck views** (line ~5150): Use the `imageKey` config to display images. Size classes vary by `imageSize` config: `h-32` (Small), `h-48` (Medium/default), `h-64` (Large). These render the **full-size original**, not thumbnails.
- **Detail/form views** (line ~4592): For `Image` type fields, a preview of the current image is shown and a file input allows re-upload. The preview uses the full-size URL.
- **Ref columns with images**: When a reference column has an image label column, both `_label` and `_image` are fetched via SQL join and displayed as a 20px (`h-5 w-5`) circular avatar next to the label text.

#### No Client-Side Image Caching

- Generated frontends do not implement service workers, IndexedDB image caching, or any custom cache strategy.
- Local storage provider relies on Fastify's static file serving with default headers (no explicit `Cache-Control`, `ETag`, or `Last-Modified`).
- Cloud providers (GCS, S3) benefit from their built-in CDN/caching behaviors but no explicit cache headers are set during upload (e.g., `Cache-Control: public, max-age=...`).

### 3. Automation / Document Generation

#### PDF Generation

- `packages/app-generator/src/document/pdfGenerator.ts` — Uses Puppeteer to render HTML to PDF. Any `<img src="...">` in the HTML is fetched by the headless browser and embedded. Uses `printBackground: true` for CSS backgrounds.
- `packages/automation-engine/src/remotePdfGenerator.ts` — Sends HTML to a remote PDF generation service or falls back to local Puppeteer. Returns base64-encoded PDF or a presigned download URL.
- **No image pre-processing** for PDFs — images are embedded at whatever resolution the source URL provides.

#### Email

- `packages/automation-engine/src/emailService.ts` — Supports `EmailAttachment` objects (filename + Buffer/string + contentType). Inline images in HTML bodies via `<img src="...">` pointing to external URLs or data URIs.
- No image optimization or resizing for email context.

#### Template Rendering

- `packages/app-generator/src/template/templateRenderer.ts` — Mustache-style engine with `{{{raw}}}` for unescaped HTML (used for inline images). No image-specific processing.

### 4. Automation Engine File Storage

- `packages/automation-engine/src/fileStorage.ts` — `LocalFileStorage` for storing generated files (PDFs, JSON, etc.) with `.meta.json` sidecar files.
- `packages/automation-engine/src/fileStorageEndpoint.ts` — CRUD endpoints for stored files. `GET /:appId/:fileId` streams the file with the correct `Content-Type`.
- **Not used for user-uploaded images** — this is separate from the generated app's upload pipeline.

## Findings & Gaps

| Area | Current State | Gap |
|------|--------------|-----|
| **Thumbnail generation** | Single 200x200 thumbnail on upload | No medium-res variant; gallery views use full-size originals |
| **List vs. detail sizing** | Table cells use `_thumb` (200x200); galleries/details use originals | Gallery views load full-resolution images unnecessarily |
| **Cache headers** | None set explicitly | Cloud uploads should set `Cache-Control: public, max-age=31536000, immutable` (filenames are UUID-based, so they're cache-safe) |
| **Local provider caching** | Fastify static defaults (no ETag/max-age) | Should configure `maxAge` and `immutable` on the static plugin |
| **Client-side caching** | Browser default only | No service worker or cache-first strategy |
| **Lazy loading** | Not implemented | Images below the fold load eagerly, slowing initial paint |
| **Format optimization** | Original format preserved | No WebP/AVIF conversion |
| **PDF image resolution** | Full-resolution from source URL | Large images inflate PDF file size; no downsampling for print |
| **Email images** | External URLs or raw data URIs | No CID-attached inline images; external URLs may break in some clients |
| **Platform (web) images** | OAuth URLs only, no upload | Irrelevant until the platform itself hosts user-uploaded images |

## Solution

### Phase 1: Quick Wins (Generated Apps)

1. **Set cache headers on cloud uploads.** When uploading to S3/GCS, add `Cache-Control: public, max-age=31536000, immutable` metadata. Filenames are already UUID-based so they are immutable by design.

2. **Configure Fastify static caching for local provider.** Add `maxAge: '1y'` and `immutable: true` to the static file serving options for the `/uploads/` route.

3. **Add `loading="lazy"` to generated `<img>` tags.** In `CellRenderer` and gallery view templates, add the native browser `loading="lazy"` attribute. Zero-cost improvement for below-the-fold images.

4. **Generate a medium-resolution variant.** In the upload endpoint, alongside the 200x200 thumb, generate a ~800px-wide "medium" variant for gallery views. Return `{ url, thumbnailUrl, mediumUrl }`. Gallery views should use `mediumUrl` instead of the full original.

### Phase 2: Optimization

5. **WebP conversion.** Use `sharp` to convert uploaded images to WebP in addition to (or instead of) the original format. WebP typically yields 25-35% smaller files. Generate all variants (thumb, medium, original) in WebP. Keep the original format as fallback.

6. **Responsive `srcset` in gallery/detail views.** Generate `<img srcset="...">` with thumb (200w), medium (800w), and original sizes. Let the browser pick the right one based on viewport.

7. **PDF image optimization.** Before rendering HTML-to-PDF, optionally pre-process `<img>` tags to cap resolution at a print-suitable DPI (e.g., 150 DPI at target print size). This prevents multi-MB source images from inflating PDFs.

8. **Email image inlining.** For email templates, convert external image URLs to CID-attached inline images using nodemailer's `cid` attachment feature. This improves rendering reliability across email clients.

### Phase 3: Infrastructure (If Scale Demands)

9. **CDN / image proxy.** Place a CDN (CloudFront, Cloud CDN) in front of storage. Alternatively, use an image transformation proxy (e.g., imgproxy, Cloudinary, or CloudFront + Lambda@Edge) to generate variants on-the-fly rather than at upload time.

10. **On-demand resizing.** Replace the upload-time thumbnail pipeline with a URL-based transformation layer: `/images/{uuid}?w=200&h=200&fit=cover`. This eliminates the need to pre-generate variants and supports arbitrary sizes.

11. **Client-side service worker caching.** For apps with heavy image usage, generate a service worker with a cache-first strategy for `/uploads/*` and cloud storage URLs. Use workbox or a lightweight custom implementation.

## Implementation

### Upload Endpoint Changes (Phase 1, items 1-4)

File: `packages/app-generator/src/generators/api-generator/ApiGenerator.ts`

**Cache headers on S3 upload** — Add `CacheControl` to `PutObjectCommand`:
```typescript
await client.send(new PutObjectCommand({
  Bucket: process.env.STORAGE_BUCKET,
  Key: objectName,
  Body: buffer,
  ContentType: contentType,
  CacheControl: 'public, max-age=31536000, immutable',
}));
```

**Cache headers on GCS upload** — Add metadata to `file.save()`:
```typescript
await file.save(buffer, {
  contentType,
  metadata: { cacheControl: 'public, max-age=31536000' },
});
```

**Fastify static caching** — Update the static file registration in `generateServerFile()`:
```typescript
fastify.register(require('@fastify/static'), {
  root: uploadDir,
  prefix: '/uploads/',
  maxAge: '365d',
  immutable: true,
});
```

**Medium variant** — Add to the upload handler alongside the existing thumb generation:
```typescript
// After thumbnail generation
if (file.mimetype.startsWith('image/')) {
  try {
    const sharp = (await import('sharp')).default;
    // Existing thumb
    const thumbBuffer = await sharp(buffer).resize(200, 200, { fit: 'cover' }).toBuffer();
    const thumbName = `${baseName}_thumb${ext}`;
    thumbnailUrl = await provider.upload(thumbBuffer, thumbName, file.mimetype);
    // New medium variant
    const mediumBuffer = await sharp(buffer).resize(800, null, { withoutEnlargement: true }).toBuffer();
    const mediumName = `${baseName}_medium${ext}`;
    mediumUrl = await provider.upload(mediumBuffer, mediumName, file.mimetype);
  } catch { /* fallback to original */ }
}
return { url, thumbnailUrl, mediumUrl };
```

**Lazy loading** — Add `loading="lazy"` to generated `<img>` tags in `CellRenderer` and gallery templates.

### Frontend Changes (Phase 1, item 3-4)

File: `packages/app-generator/src/generators/ui-generator/UiGenerator.ts`

- `CellRenderer` Image case (~line 4380): Add `loading="lazy"` attribute.
- Gallery view (~line 5293): Use `mediumUrl` field (with `_medium` suffix convention) instead of the full URL. Add `loading="lazy"`.
- Upload API type: Update return type to `{ url: string; thumbnailUrl?: string; mediumUrl?: string }`.

### Key Files

| File | What to Change |
|------|---------------|
| `packages/app-generator/src/generators/api-generator/ApiGenerator.ts` | Upload handler (thumb + medium), storage providers (cache headers), static serving config |
| `packages/app-generator/src/generators/ui-generator/UiGenerator.ts` | `CellRenderer` Image case, gallery views, upload API type, lazy loading |
| `packages/app-generator/src/document/pdfGenerator.ts` | (Phase 2) Image pre-processing before PDF render |
| `packages/automation-engine/src/emailService.ts` | (Phase 2) CID-attached inline images |