// A tiny Web Audio "music box" that plays Happy Birthday on a loop.
// Used whenever no MUSIC_URL is configured (or the configured one fails),
// so the site always has music without shipping an audio file.

const BPM = 104;
const BEAT = 60 / BPM;
const LOOKAHEAD = 1.2; // seconds of notes scheduled ahead (survives background-tab timer throttling)
const TICK_MS = 200;

// [midi note, beats] — key of C, 3/4 time, starting on the pickup.
// prettier-ignore
const MELODY = [
  [67, 0.75], [67, 0.25],
  [69, 1], [67, 1], [72, 1],
  [71, 2], [67, 0.75], [67, 0.25],
  [69, 1], [67, 1], [74, 1],
  [72, 2], [67, 0.75], [67, 0.25],
  [79, 1], [76, 1], [72, 1],
  [71, 1], [69, 1], [77, 0.75], [77, 0.25],
  [76, 1], [72, 1], [74, 1],
  [72, 3],
  [null, 2], // breath before the next round
];

// Waltz accompaniment: [start beat, bass note, chord notes]
// prettier-ignore
const CHORDS = [
  [1, 48, [52, 55]],  // C
  [4, 43, [50, 53]],  // G7
  [7, 43, [50, 53]],  // G7
  [10, 48, [52, 55]], // C
  [13, 48, [52, 55]], // C
  [16, 41, [48, 53]], // F
  [19, 43, [50, 53]], // G7
  [22, 48, [52, 55]], // C
];

const LOOP_BEATS = MELODY.reduce((sum, [, beats]) => sum + beats, 0);

const freq = (midi) => 440 * 2 ** ((midi - 69) / 12);

function buildTimeline() {
  const events = [];
  let beat = 0;
  for (const [note, beats] of MELODY) {
    if (note !== null) events.push({ beat, note: note + 12, kind: 'melody' });
    beat += beats;
  }
  for (const [start, bass, chord] of CHORDS) {
    events.push({ beat: start, note: bass + 12, kind: 'bass' });
    for (const offset of [1, 2]) {
      for (const note of chord) events.push({ beat: start + offset, note: note + 12, kind: 'chord' });
    }
  }
  return events.sort((a, b) => a.beat - b.beat);
}

const TIMELINE = buildTimeline();

export class BirthdaySong {
  constructor({ volume = 0.5 } = {}) {
    this.volume = volume;
    this.ctx = null;
    this.timer = null;
    this.loopStart = 0;
    this.index = 0;
    this.muted = false;
  }

  get paused() {
    return !this.ctx || this.ctx.state !== 'running' || this.timer === null;
  }

  ensureContext() {
    if (this.ctx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) throw Object.assign(new Error('Web Audio not supported'), { name: 'NotSupportedError' });

    const ctx = new AudioContext();
    const master = ctx.createGain();
    master.gain.value = 0;

    // A soft echo makes the music box sound like it's in a room.
    const delay = ctx.createDelay();
    delay.delayTime.value = BEAT * 0.75;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.22;
    const wet = ctx.createGain();
    wet.gain.value = 0.25;

    master.connect(ctx.destination);
    master.connect(delay);
    delay.connect(feedback).connect(delay);
    delay.connect(wet).connect(ctx.destination);

    this.ctx = ctx;
    this.master = master;
    this.loopStart = ctx.currentTime + 0.15;
  }

  /** Must be called from a user gesture the first time; rejects with NotAllowedError if blocked. */
  async play() {
    this.ensureContext();
    const resumed = this.ctx.resume(); // called synchronously so it counts as part of the gesture
    await Promise.race([resumed, new Promise((r) => setTimeout(r, 300))]);

    if (this.ctx.state !== 'running') {
      throw Object.assign(new Error('Autoplay blocked'), { name: 'NotAllowedError' });
    }

    if (this.timer === null) {
      if (this.loopStart < this.ctx.currentTime) this.realign();
      this.schedule();
      this.timer = setInterval(() => this.schedule(), TICK_MS);
    }
    this.fadeTo(this.muted ? 0 : this.volume, 1.2);
  }

  pause() {
    if (!this.ctx) return;
    clearInterval(this.timer);
    this.timer = null;
    this.ctx.suspend();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.ctx) this.fadeTo(muted ? 0 : this.volume, 0.15);
  }

  destroy() {
    clearInterval(this.timer);
    this.timer = null;
    this.ctx?.close();
    this.ctx = null;
  }

  // ── internals ─────────────────────────────────────────────────────────

  fadeTo(value, seconds) {
    const gain = this.master.gain;
    const now = this.ctx.currentTime;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(value, now + seconds);
  }

  /** Jump the playhead to "now" (e.g. after a long pause) so we don't burst through missed notes. */
  realign() {
    this.loopStart = this.ctx.currentTime + 0.1;
    this.index = 0;
  }

  schedule() {
    const horizon = this.ctx.currentTime + LOOKAHEAD;

    while (true) {
      const event = TIMELINE[this.index];
      const time = this.loopStart + event.beat * BEAT;
      if (time > horizon) break;

      if (time >= this.ctx.currentTime - 0.05) this.pluck(event, time);

      this.index += 1;
      if (this.index >= TIMELINE.length) {
        this.index = 0;
        this.loopStart += LOOP_BEATS * BEAT;
      }
    }
  }

  pluck({ note, kind }, time) {
    const ctx = this.ctx;
    const level = kind === 'melody' ? 0.32 : kind === 'bass' ? 0.2 : 0.07;
    const decay = kind === 'melody' ? 1.6 : kind === 'bass' ? 1.4 : 0.6;

    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.exponentialRampToValueAtTime(level, time + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + decay);
    envelope.connect(this.master);

    // Music-box timbre: fundamental + a bright, quickly fading overtone.
    const partials = kind === 'melody' ? [[1, 1], [2, 0.35], [3.98, 0.12]] : [[1, 1], [2, 0.2]];
    for (const [ratio, amount] of partials) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq(note) * ratio;
      const gain = ctx.createGain();
      gain.gain.value = amount;
      osc.connect(gain).connect(envelope);
      osc.start(time);
      osc.stop(time + decay + 0.05);
    }
  }
}
