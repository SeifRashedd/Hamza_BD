import { useEffect, useId, useRef, useState } from 'react';
import { BIRTHDAY_PERSON } from '../config.js';
import { ApiError, api } from '../lib/api.js';
import { burstFrom } from '../lib/confetti.js';
import { MAX_PHOTOS, PhotoError, blobToBase64, fitPhotosToEnvelope, preparePhoto } from '../lib/photos.js';
import { Reveal } from './Reveal.jsx';

const MESSAGE_MAX = 5000;

const EMPTY_FORM = { sender_name: '', hint: '', password: '', message: '', website: '' };

let photoKey = 0;

/**
 * The small "leave Hamza a message" form at the very end of the page.
 * One submission creates exactly one envelope.
 */
export function FriendForm({ onCreated, notify }) {
  const ids = useId();
  const formRef = useRef(null);
  const submitRef = useRef(null);
  const inFlight = useRef(false);

  const [values, setValues] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [created, setCreated] = useState(null);

  // Photos: [{ key, file, status: 'processing' | 'ready', blob, previewUrl }]
  const [photos, setPhotosState] = useState([]);
  const photosRef = useRef([]);
  const pending = useRef(new Map()); // key → promise while a photo is being resized
  const queue = useRef(Promise.resolve()); // photos are prepared one at a time (easy on phone memory)
  const [photoNotice, setPhotoNotice] = useState('');
  const [dragging, setDragging] = useState(false);

  const setPhotos = (update) => {
    photosRef.current = typeof update === 'function' ? update(photosRef.current) : update;
    setPhotosState(photosRef.current);
  };

  // Free preview memory when the form goes away.
  useEffect(() => () => photosRef.current.forEach((p) => p.previewUrl && URL.revokeObjectURL(p.previewUrl)), []);

  const set = (field) => (event) => {
    setValues((v) => ({ ...v, [field]: event.target.value }));
    if (errors[field]) setErrors(({ [field]: _removed, ...rest }) => rest);
  };

  const clearPhotoErrors = () =>
    setErrors((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith('images'))));

  const addFiles = (fileList) => {
    const files = [...fileList];
    if (files.length === 0) return;

    const room = MAX_PHOTOS - photosRef.current.length;
    const accepted = files.slice(0, Math.max(0, room));
    setPhotoNotice(files.length > room ? `You can add up to ${MAX_PHOTOS} photos.` : '');
    clearPhotoErrors();

    for (const file of accepted) {
      const key = ++photoKey;
      setPhotos((list) => [...list, { key, file, status: 'processing', blob: null, previewUrl: null }]);

      const isStillPicked = () => photosRef.current.some((p) => p.key === key);

      const job = queue.current
        .then(() => (isStillPicked() ? preparePhoto(file) : null)) // skip photos removed while waiting
        .then((prepared) => {
          if (!prepared) return;
          if (!isStillPicked()) {
            URL.revokeObjectURL(prepared.previewUrl); // removed while it was being prepared
            return;
          }
          const { blob, previewUrl } = prepared;
          setPhotos((list) => list.map((p) => (p.key === key ? { ...p, status: 'ready', blob, previewUrl } : p)));
        })
        .catch((error) => {
          setPhotos((list) => list.filter((p) => p.key !== key));
          setPhotoNotice(error instanceof PhotoError ? error.message : 'That photo couldn’t be added. Try another one.');
        })
        .finally(() => pending.current.delete(key));

      queue.current = job;
      pending.current.set(key, job);
    }
  };

  const removePhoto = (key) => {
    const photo = photosRef.current.find((p) => p.key === key);
    if (photo?.previewUrl) URL.revokeObjectURL(photo.previewUrl);
    setPhotos((list) => list.filter((p) => p.key !== key));
    setPhotoNotice('');
    clearPhotoErrors();
  };

  const resetPhotos = () => {
    photosRef.current.forEach((p) => p.previewUrl && URL.revokeObjectURL(p.previewUrl));
    setPhotos([]);
    setPhotoNotice('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (inFlight.current) return; // never create two envelopes from one form
    inFlight.current = true;
    setSubmitting(true);
    setErrors({});
    setCreated(null);

    try {
      // Wait for any photo that's still being resized, make sure they all fit in
      // one envelope (only shrinks again when there are many), then send in order.
      await Promise.allSettled([...pending.current.values()]);
      const ready = photosRef.current.filter((p) => p.status === 'ready');
      const blobs = await fitPhotosToEnvelope(ready);
      const images = await Promise.all(blobs.map(async (blob) => ({ data: await blobToBase64(blob) })));

      const result = await api.submit({
        sender_name: values.sender_name,
        hint: values.hint,
        password: values.password,
        message: values.message,
        images,
        website: values.website,
      });

      onCreated(result.envelope);
      setCreated(result.envelope);
      setValues(EMPTY_FORM);
      resetPhotos();
      setShowPassword(false);
      notify(result.message || 'Your message has been added! 🎉', 'success');
      burstFrom(submitRef.current, { count: 120, angle: 90, spread: 100, speed: 14 });
    } catch (error) {
      if (error instanceof ApiError && error.errors && Object.keys(error.errors).length) {
        setErrors(error.errors);
        requestAnimationFrame(() => formRef.current?.querySelector('[aria-invalid="true"]')?.focus());
      } else {
        notify(error.message, 'error');
      }
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  const seeEnvelope = () => {
    const card = document.querySelector(`[data-envelope-id="${created?.id}"]`);
    card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const fieldProps = (field) => ({
    id: `${ids}-${field}`,
    'aria-invalid': Boolean(errors[field]),
    'aria-describedby': `${ids}-${field}-help ${ids}-${field}-error`,
  });

  const photoErrors = photos
    .map((photo, index) => errors[`images.${index}`] && `Photo ${index + 1}: ${errors[`images.${index}`]}`)
    .filter(Boolean);
  if (errors.images) photoErrors.push(errors.images);
  if (photoNotice) photoErrors.push(photoNotice);

  return (
    <section id="leave-a-message" className="relative scroll-mt-6 px-4 pb-28 pt-6 sm:px-6" aria-labelledby={`${ids}-title`}>
      <Reveal className="friend-card mx-auto max-w-2xl">
        <div className="text-center">
          <p className="friend-card__emoji" aria-hidden="true">
            ✍️
          </p>
          <h2 id={`${ids}-title`} className="friend-card__title">
            Want to leave {BIRTHDAY_PERSON} a message? <span aria-hidden="true">💌</span>
          </h2>
          <p className="friend-card__subtitle">
            Seal it with a password only {BIRTHDAY_PERSON} would know — your message becomes one new envelope above.
          </p>
        </div>

        {created && (
          <div className="form-success" role="status">
            <p>
              <strong>Your message has been added! 🎉</strong>
            </p>
            <button type="button" className="link-btn" onClick={seeEnvelope}>
              See your envelope ↑
            </button>
          </div>
        )}

        <form ref={formRef} className="friend-form" onSubmit={handleSubmit} noValidate>
          {/* Honeypot — hidden from people, irresistible to bots. */}
          <div className="sr-only" aria-hidden="true">
            <label htmlFor={`${ids}-website`}>Website</label>
            <input id={`${ids}-website`} name="website" tabIndex={-1} autoComplete="off" value={values.website} onChange={set('website')} />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Your name" field="sender_name" ids={ids} errors={errors} help={`Shown on your envelope, so ${BIRTHDAY_PERSON} can guess your password.`}>
              <input
                {...fieldProps('sender_name')}
                className="input"
                name="sender_name"
                autoComplete="name"
                maxLength={60}
                placeholder="Ahmed"
                value={values.sender_name}
                onChange={set('sender_name')}
                required
              />
            </Field>

            <Field label="Password" field="password" ids={ids} errors={errors} help="The exact answer — capitals count!">
              <div className="password-field">
                <input
                  {...fieldProps('password')}
                  className="input"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  autoCapitalize="off"
                  spellCheck={false}
                  maxLength={64}
                  placeholder="password"
                  value={values.password}
                  onChange={set('password')}
                  required
                />
                <button
                  type="button"
                  className="password-field__toggle"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                >
                  <span aria-hidden="true">{showPassword ? '🙈' : '👁️'}</span>
                </button>
              </div>
            </Field>
          </div>

          <Field label="Hint" field="hint" ids={ids} errors={errors} help={`Something only ${BIRTHDAY_PERSON} would figure out.`}>
            <input
              {...fieldProps('hint')}
              className="input"
              name="hint"
              maxLength={160}
              placeholder="Our first university project"
              value={values.hint}
              onChange={set('hint')}
              required
            />
          </Field>

          <Field
            label="Birthday message"
            field="message"
            ids={ids}
            errors={errors}
            help={
              <span className="flex justify-between gap-3">
                <span>Leave an empty line between paragraphs.</span>
                <span className={values.message.length > MESSAGE_MAX ? 'text-rose-600' : ''}>
                  {values.message.length}/{MESSAGE_MAX}
                </span>
              </span>
            }
          >
            <textarea
              {...fieldProps('message')}
              className="input textarea"
              name="message"
              rows={5}
              maxLength={MESSAGE_MAX}
              placeholder={`Happy Birthday ${BIRTHDAY_PERSON} ❤️\n\nI hope this year brings you…`}
              value={values.message}
              onChange={set('message')}
              required
            />
          </Field>

          <fieldset className="photos-field">
            <legend className="field-label">
              Photos <span className="field-optional">(optional)</span>
            </legend>
            <p className="field-help" id={`${ids}-photos-help`}>
              Up to {MAX_PHOTOS} photos from your phone or laptop.
            </p>

            {photos.length > 0 && (
              <ul className="photo-picks">
                {photos.map((photo, index) => (
                  <li key={photo.key} className={`photo-pick ${errors[`images.${index}`] ? 'has-error' : ''}`}>
                    {photo.previewUrl && <img src={photo.previewUrl} alt={`Photo ${index + 1}`} />}
                    {photo.status === 'processing' && (
                      <span className="photo-pick__busy">
                        <span className="spinner" aria-hidden="true" />
                        <span className="sr-only">Preparing photo {index + 1}…</span>
                      </span>
                    )}
                    <button
                      type="button"
                      className="photo-pick__remove"
                      onClick={() => removePhoto(photo.key)}
                      aria-label={`Remove photo ${index + 1}`}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {photos.length < MAX_PHOTOS && (
              <label
                className={`photo-drop ${dragging ? 'is-dragging' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  addFiles(e.dataTransfer.files);
                }}
              >
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  aria-describedby={`${ids}-photos-help ${ids}-photos-error`}
                  onChange={(e) => {
                    addFiles(e.target.files);
                    e.target.value = ''; // allow picking the same photo again after removing it
                  }}
                />
                <span className="photo-drop__icon" aria-hidden="true">
                  📸
                </span>
                <span className="photo-drop__title">{photos.length ? 'Add more photos' : 'Add photos'}</span>
                <span className="photo-drop__sub">
                  Choose from your gallery, camera or laptop
                  <span className="photo-drop__drag"> — or drag them here</span>
                </span>
              </label>
            )}

            <div id={`${ids}-photos-error`} role={photoErrors.length ? 'alert' : undefined}>
              {photoErrors.map((message) => (
                <p key={message} className="field-error">
                  {message}
                </p>
              ))}
            </div>
          </fieldset>

          <button ref={submitRef} type="submit" className="btn-primary w-full sm:w-auto sm:self-center" disabled={submitting} aria-busy={submitting}>
            {submitting ? (
              <>
                <span className="spinner" aria-hidden="true" /> {photos.length ? 'Sending your photos…' : 'Sealing your envelope…'}
              </>
            ) : (
              <>
                Send My Envelope <span aria-hidden="true">💌</span>
              </>
            )}
          </button>
        </form>
      </Reveal>
    </section>
  );
}

function Field({ label, field, ids, errors, help, children }) {
  return (
    <div className="field">
      <label htmlFor={`${ids}-${field}`} className="field-label">
        {label}
      </label>
      {children}
      <p id={`${ids}-${field}-help`} className="field-help">
        {help}
      </p>
      <p id={`${ids}-${field}-error`} className="field-error" role={errors[field] ? 'alert' : undefined}>
        {errors[field]}
      </p>
    </div>
  );
}
