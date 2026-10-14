export const LIMITS = {
  senderName: { min: 2, max: 60 },
  hint: { min: 3, max: 160 },
  password: { min: 1, max: 64 },
  message: { min: 5, max: 5000 },
  // Photos are resized in the browser to well under this before upload.
  images: { max: 8, maxBytes: 1024 * 1024 },
};

// Identify photos by their actual bytes, never by what the client claims.
const IMAGE_SIGNATURES = [
  { type: 'image/jpeg', matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: 'image/png', matches: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { type: 'image/webp', matches: (b) => b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP' },
];

export function detectImageType(bytes) {
  if (bytes.length < 12) return null;
  return IMAGE_SIGNATURES.find((signature) => signature.matches(bytes))?.type ?? null;
}

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

/**
 * Normalises free text: unifies line endings, strips invisible control
 * characters (keeping newlines and tabs), collapses runs of blank lines and trims.
 */
export function cleanText(value, { multiline = false } = {}) {
  if (typeof value !== 'string') return value;

  let text = value.normalize('NFC').replace(/\r\n?/g, '\n');
  text = text.replace(/[^\P{Cc}\n\t]/gu, '');

  if (multiline) {
    text = text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  } else {
    text = text.replace(/\s+/g, ' ');
  }

  return text.trim();
}

function checkLength(errors, field, label, value, { min, max }) {
  if (typeof value !== 'string' || value.length === 0) {
    errors[field] = `Please add ${label}.`;
  } else if ([...value].length < min) {
    errors[field] = `${capitalise(label)} needs at least ${min} character${min === 1 ? '' : 's'}.`;
  } else if ([...value].length > max) {
    errors[field] = `${capitalise(label)} can be at most ${max} characters.`;
  }
}

function capitalise(text) {
  return text.replace(/^(a |an |the )/, '').replace(/^./, (c) => c.toUpperCase());
}

/**
 * Uploaded photos: `[{ data: '<base64>' }]`. Returns `[{ mimeType, bytes }]`
 * and records errors as `images` / `images.<index>`.
 */
function validateImages(raw, errors) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    errors.images = 'Photos must be sent as a list.';
    return [];
  }
  if (raw.length > LIMITS.images.max) {
    errors.images = `You can add up to ${LIMITS.images.max} photos.`;
    return [];
  }

  const images = [];
  raw.forEach((item, index) => {
    const data = item && typeof item === 'object' ? item.data : undefined;

    if (typeof data !== 'string' || data.length === 0 || data.length % 4 !== 0 || !BASE64.test(data)) {
      errors[`images.${index}`] = 'This photo couldn’t be read. Try another one.';
      return;
    }
    if ((data.length / 4) * 3 > LIMITS.images.maxBytes + 2) {
      errors[`images.${index}`] = 'This photo is too big. Try another one.';
      return;
    }

    const bytes = Buffer.from(data, 'base64');
    const mimeType = detectImageType(bytes);
    if (!mimeType) {
      errors[`images.${index}`] = 'Only JPG, PNG or WebP photos can be added.';
      return;
    }
    images.push({ mimeType, bytes });
  });

  return images;
}

/**
 * Validates a friend's envelope submission.
 * Returns `{ data, errors, isSpam }` — `errors` is keyed by field name.
 */
export function validateSubmission(body) {
  const input = body && typeof body === 'object' ? body : {};
  const errors = {};

  // Honeypot: real people never see or fill this field.
  const isSpam = typeof input.website === 'string' && input.website.trim() !== '';

  const senderName = cleanText(input.sender_name);
  const hint = cleanText(input.hint);
  const password = typeof input.password === 'string' ? input.password.normalize('NFC').trim() : input.password;
  const message = cleanText(input.message, { multiline: true });

  checkLength(errors, 'sender_name', 'your name', senderName, LIMITS.senderName);
  checkLength(errors, 'hint', 'a hint', hint, LIMITS.hint);
  checkLength(errors, 'password', 'a password', password, LIMITS.password);
  checkLength(errors, 'message', 'a birthday message', message, LIMITS.message);

  if (!errors.password && /[\n\t]/.test(password)) {
    errors.password = 'The password should be a single line.';
  }

  // Photos must be uploaded; image links (`image_urls`) are no longer accepted.
  const images = validateImages(input.images, errors);

  return {
    isSpam,
    errors,
    data: { senderName, hint, password, message, images },
  };
}

export function validateUnlock(body) {
  const password = body && typeof body === 'object' ? body.password : undefined;

  if (typeof password !== 'string' || password.trim() === '') {
    return { errors: { password: 'Type a password first 👀' } };
  }
  if (password.length > 200) {
    return { errors: { password: 'That password is way too long 😅' } };
  }

  return { password: password.normalize('NFC').trim() };
}
