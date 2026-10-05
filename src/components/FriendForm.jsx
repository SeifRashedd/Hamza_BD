import { useId, useRef, useState } from 'react';
import { BIRTHDAY_PERSON } from '../config.js';
import { ApiError, api } from '../lib/api.js';
import { burstFrom } from '../lib/confetti.js';
import { Reveal } from './Reveal.jsx';

const MAX_IMAGES = 4;
const MESSAGE_MAX = 5000;

const EMPTY_FORM = { sender_name: '', hint: '', password: '', message: '', image_urls: [''], website: '' };

function looksLikeUrl(value) {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

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

  const set = (field) => (event) => {
    setValues((v) => ({ ...v, [field]: event.target.value }));
    if (errors[field]) setErrors(({ [field]: _removed, ...rest }) => rest);
  };

  const setImage = (index, value) => {
    setValues((v) => ({ ...v, image_urls: v.image_urls.map((u, i) => (i === index ? value : u)) }));
    const key = `image_urls.${index}`;
    if (errors[key]) setErrors(({ [key]: _removed, ...rest }) => rest);
  };

  const addImage = () => setValues((v) => ({ ...v, image_urls: [...v.image_urls, ''] }));
  const removeImage = (index) => {
    setValues((v) => ({ ...v, image_urls: v.image_urls.filter((_, i) => i !== index) }));
    setErrors(({ image_urls: _a, ...rest }) =>
      Object.fromEntries(Object.entries(rest).filter(([key]) => !key.startsWith('image_urls.'))),
    );
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (inFlight.current) return; // never create two envelopes from one form
    inFlight.current = true;
    setSubmitting(true);
    setErrors({});
    setCreated(null);

    // Server error keys refer to the non-empty links only; map them back to the inputs.
    const filledIndexes = values.image_urls.map((url, i) => (url.trim() ? i : -1)).filter((i) => i >= 0);

    try {
      const result = await api.submit({
        sender_name: values.sender_name,
        hint: values.hint,
        password: values.password,
        message: values.message,
        image_urls: filledIndexes.map((i) => values.image_urls[i]),
        website: values.website,
      });

      onCreated(result.envelope);
      setCreated(result.envelope);
      setValues(EMPTY_FORM);
      setShowPassword(false);
      notify(result.message || 'Your message has been added! 🎉', 'success');
      burstFrom(submitRef.current, { count: 120, angle: 90, spread: 100, speed: 14 });
    } catch (error) {
      if (error instanceof ApiError && error.errors && Object.keys(error.errors).length) {
        const mapped = {};
        for (const [key, value] of Object.entries(error.errors)) {
          const match = key.match(/^image_urls\.(\d+)$/);
          mapped[match ? `image_urls.${filledIndexes[Number(match[1])]}` : key] = value;
        }
        setErrors(mapped);
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
            <Field label="Your name" field="sender_name" ids={ids} errors={errors} help="Revealed only after unlocking.">
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
                  placeholder="SmartFit"
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

          <fieldset className="images-fieldset">
            <legend className="field-label">
              Photos <span className="field-optional">(optional)</span>
            </legend>
            <p className="field-help" id={`${ids}-images-help`}>
              Paste image links, e.g. https://example.com/photo.jpg
            </p>

            {values.image_urls.map((url, index) => {
              const key = `image_urls.${index}`;
              const valid = url.trim() && looksLikeUrl(url);
              return (
                <div key={index} className="image-row">
                  <div className="image-row__input">
                    <label htmlFor={`${ids}-${key}`} className="sr-only">
                      Image link {index + 1}
                    </label>
                    <input
                      id={`${ids}-${key}`}
                      className="input"
                      type="url"
                      inputMode="url"
                      autoComplete="off"
                      placeholder="https://example.com/photo.jpg"
                      value={url}
                      maxLength={2048}
                      onChange={(e) => setImage(index, e.target.value)}
                      aria-invalid={Boolean(errors[key])}
                      aria-describedby={`${ids}-images-help ${ids}-${key}-error`}
                    />
                    {valid && <ImagePreview url={url.trim()} />}
                    {values.image_urls.length > 1 && (
                      <button type="button" className="image-row__remove" onClick={() => removeImage(index)} aria-label={`Remove image link ${index + 1}`}>
                        ✕
                      </button>
                    )}
                  </div>
                  <p id={`${ids}-${key}-error`} className="field-error">
                    {errors[key]}
                  </p>
                </div>
              );
            })}

            {errors.image_urls && <p className="field-error">{errors.image_urls}</p>}

            {values.image_urls.length < MAX_IMAGES && (
              <button type="button" className="link-btn mt-1" onClick={addImage}>
                + Add another photo
              </button>
            )}
          </fieldset>

          <button ref={submitRef} type="submit" className="btn-primary w-full sm:w-auto sm:self-center" disabled={submitting} aria-busy={submitting}>
            {submitting ? (
              <>
                <span className="spinner" aria-hidden="true" /> Sealing your envelope…
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

function ImagePreview({ url }) {
  const [failedUrl, setFailedUrl] = useState(null);
  if (failedUrl === url) {
    return (
      <span className="image-row__preview image-row__preview--failed" title="We couldn’t load a preview — double-check the link">
        ⚠️
      </span>
    );
  }
  return <img className="image-row__preview" src={url} alt="" referrerPolicy="no-referrer" onError={() => setFailedUrl(url)} />;
}
