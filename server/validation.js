export const LIMITS = {
  senderName: { min: 2, max: 60 },
  hint: { min: 3, max: 160 },
  password: { min: 1, max: 64 },
  message: { min: 5, max: 5000 },
  images: { max: 4, urlMax: 2048 },
};

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

export function isSafeImageUrl(value) {
  if (typeof value !== 'string' || value.length > LIMITS.images.urlMax) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password && Boolean(url.hostname);
  } catch {
    return false;
  }
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

  let imageUrls = [];
  const rawImages = input.image_urls ?? [];

  if (!Array.isArray(rawImages)) {
    errors.image_urls = 'Images must be a list of links.';
  } else {
    const candidates = rawImages
      .map((url) => (typeof url === 'string' ? url.trim() : url))
      .filter((url) => url !== '' && url !== null && url !== undefined);

    if (candidates.length > LIMITS.images.max) {
      errors.image_urls = `You can add up to ${LIMITS.images.max} images.`;
    }

    candidates.forEach((url, index) => {
      if (!isSafeImageUrl(url)) {
        errors[`image_urls.${index}`] = 'That doesn’t look like a valid image link (it should start with https://).';
      }
    });

    imageUrls = [...new Set(candidates)];
  }

  return {
    isSpam,
    errors,
    data: { senderName, hint, password, message, imageUrls },
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
