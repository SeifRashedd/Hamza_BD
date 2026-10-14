// Shrinks photos in the browser before upload: phone photos are often 3–12 MB,
// but a whole envelope must stay under Vercel's 4.5 MB request limit.
// Re-encoding to JPEG also strips EXIF data such as the GPS location.

export const MAX_PHOTOS = 8;

// All photos of one envelope together (raw bytes; base64 adds a third on the way).
const ENVELOPE_PHOTO_BUDGET = 3_000_000;
// Each photo is shrunk once, when picked, so that even 8 photos always fit together.
// That is still full 1920px at roughly 80–88% JPEG quality: no visible loss on a phone.
const PICK_TARGET_BYTES = Math.floor(ENVELOPE_PHOTO_BUDGET / MAX_PHOTOS);
const MAX_SIDE = 1920;
const MAX_INPUT_BYTES = 40 * 1024 * 1024;

// Try lowering quality a little before lowering the resolution.
const SIZE_STEPS = [1, 0.85, 0.72, 0.6, 0.5];
const QUALITY_STEPS = [0.88, 0.82, 0.76, 0.7];

export class PhotoError extends Error {}

function loadImage(url) {
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  // <img> honours the photo's EXIF orientation, so portraits stay upright.
  return img.decode().then(() => img);
}

function toJpeg(canvas, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

/** Re-encodes an image file/blob as a JPEG of at most `targetBytes`, keeping as much quality as possible. */
async function compress(source, targetBytes, name = source.name) {
  if (source.size > MAX_INPUT_BYTES) throw new PhotoError(`“${name}” is too big (max 40 MB).`);
  if (source.type && !source.type.startsWith('image/')) throw new PhotoError(`“${name}” isn’t a photo.`);

  const sourceUrl = URL.createObjectURL(source);
  try {
    let img;
    try {
      img = await loadImage(sourceUrl);
    } catch {
      throw new PhotoError(`“${name}” can’t be opened here. Try a JPG or PNG photo.`);
    }

    const longest = Math.max(img.naturalWidth, img.naturalHeight);
    let smallest = null;
    let lastScale = null;

    for (const sizeStep of SIZE_STEPS) {
      const scale = Math.min(1, (MAX_SIDE * sizeStep) / longest);
      if (scale === lastScale) continue; // small photo: this size was already tried
      lastScale = scale;

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));

      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.fillStyle = '#ffffff'; // transparent PNGs get a white background instead of black
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      for (const quality of QUALITY_STEPS) {
        const blob = await toJpeg(canvas, quality);
        if (!blob) throw new PhotoError(`“${name}” couldn’t be prepared. Try another photo.`);
        if (blob.size <= targetBytes) return blob;
        if (!smallest || blob.size < smallest.size) smallest = blob;
      }
    }

    return smallest;
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

/** For a freshly picked file: a high-quality JPEG plus a preview URL. */
export async function preparePhoto(file) {
  const blob = await compress(file, PICK_TARGET_BYTES);
  return { blob, previewUrl: URL.createObjectURL(blob) };
}

/**
 * Safety net before sending: every photo is already within its share of the
 * envelope, so this normally returns the blobs untouched. Only if a photo
 * couldn't get under its target is it re-encoded smaller.
 * `photos` is `[{ file, blob }]`; returns the blobs to send, in order.
 */
export async function fitPhotosToEnvelope(photos) {
  const total = photos.reduce((sum, p) => sum + p.blob.size, 0);
  if (total <= ENVELOPE_PHOTO_BUDGET) return photos.map((p) => p.blob);

  const perPhoto = Math.floor(ENVELOPE_PHOTO_BUDGET / photos.length);
  const fitted = [];
  for (const p of photos) {
    // One at a time keeps memory low on phones.
    fitted.push(p.blob.size <= perPhoto ? p.blob : await compress(p.blob, perPhoto, p.file?.name));
  }
  return fitted;
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
