import { alertSound, type AlertSoundId } from '../domain/alert-delivery';

/** Minimal Web Audio surface used by the local alert sound player. */
export interface AlertAudioContextLike {
  readonly state: string;
  readonly currentTime: number;
  readonly destination: unknown;
  resume?: () => Promise<void>;
  createOscillator: () => { type: string; frequency: { setValueAtTime: (value: number, time: number) => void }; connect: (target: unknown) => unknown; start: (time: number) => void; stop: (time: number) => void };
  createGain: () => { gain: { setValueAtTime: (value: number, time: number) => void; linearRampToValueAtTime: (value: number, time: number) => void }; connect: (target: unknown) => unknown };
}
/** RepeatSeconds > 0 repeats the tone sequence (Sound duration); absent or 0 plays it once. */
export interface AlertSoundPlayer { play: (id: AlertSoundId, repeatSeconds?: number) => Promise<void>; }
/** Gap between repetitions of a sound,. */
export const ALERT_SOUND_REPEAT_GAP_S = 0.4;
/** Start offsets (seconds) of each repetition: one at 0, then every sequence length plus the gap while it starts inside the duration. */
export function alertSoundRepeatOffsets(id: AlertSoundId, repeatSeconds = 0): number[] {
  const spec = alertSound(id), length = Math.max(...spec.tones.map(item => item.start + item.duration)), period = length + ALERT_SOUND_REPEAT_GAP_S;
  const seconds = Number.isFinite(repeatSeconds) ? Math.min(60, Math.max(0, repeatSeconds)) : 0, offsets = [0];
  for (let at = period; at + length <= seconds + 1e-9; at += period) offsets.push(Math.round(at * 1000) / 1000);
  return offsets;
}

const PEAK_GAIN = 0.18;
/**
 * Chart settings > Alerts > Alert volume (a checkbox and a 0..1 slider,
 * default checked at 0.5). Checked: alert sounds play at the slider level,
 * where the default 0.5 is the gain sounds always had (so the factory setting changes nothing); unchecked: alert sounds are
 * off and a play reports that instead of claiming a sound. The level-to-gain curve is our own choice.
 */
export interface AlertSoundVolume { enabled: boolean; level: number }
export const DEFAULT_ALERT_SOUND_VOLUME: AlertSoundVolume = Object.freeze({ enabled: true, level: 0.5 });
export const ALERT_SOUND_OFF = 'Alert sounds are off (Chart settings, Alerts, Alert volume).';
let currentVolume: AlertSoundVolume = DEFAULT_ALERT_SOUND_VOLUME;
export function setAlertSoundVolume(next: AlertSoundVolume | null | undefined): void {
  const level = typeof next?.level === 'number' && Number.isFinite(next.level) ? Math.min(1, Math.max(0, next.level)) : DEFAULT_ALERT_SOUND_VOLUME.level;
  currentVolume = Object.freeze({ enabled: next?.enabled !== false, level });
}
export function alertSoundVolume(): AlertSoundVolume { return currentVolume; }
/** Peak gain for a volume; 0 means no sound. */
export function alertSoundGain(volume: AlertSoundVolume): number { return volume.enabled ? PEAK_GAIN * 2 * Math.min(1, Math.max(0, volume.level)) : 0; }
/**
 * Plays an original synthesized tone sequence once. Failure is reported to the
 * caller; nothing claims a sound was heard. The context is created lazily on
 * first use and reused.
 */
export function createAlertSoundPlayer(factory: (() => AlertAudioContextLike) | null = defaultAudioFactory(), volume: () => AlertSoundVolume = alertSoundVolume): AlertSoundPlayer {
  let context: AlertAudioContextLike | null = null;
  return {
    async play(id, repeatSeconds = 0) {
      const spec = alertSound(id), peak = alertSoundGain(volume()), offsets = alertSoundRepeatOffsets(id, repeatSeconds);
      if (peak <= 0) throw new Error(ALERT_SOUND_OFF);
      if (!factory) throw new Error('Sound output is unavailable in this environment.');
      try { context ??= factory(); } catch { throw new Error('Sound output could not be opened.'); }
      if (context.state === 'suspended' && context.resume) { try { await context.resume(); } catch { /* Reported below from the observed state. */ } }
      if (context.state !== 'running') throw new Error(`Sound output is ${context.state === 'suspended' ? 'blocked until audio is permitted' : 'not running'}.`);
      for (const offset of offsets) for (const item of spec.tones) {
        const origin = context.currentTime + 0.01 + offset;
        const oscillator = context.createOscillator(), gain = context.createGain(), start = origin + item.start, end = start + item.duration;
        oscillator.type = item.wave; oscillator.frequency.setValueAtTime(item.frequency, start);
        gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(peak, start + Math.min(0.02, item.duration / 4)); gain.gain.linearRampToValueAtTime(0, end);
        oscillator.connect(gain); gain.connect(context.destination); oscillator.start(start); oscillator.stop(end + 0.02);
      }
    },
  };
}
function defaultAudioFactory(): (() => AlertAudioContextLike) | null {
  const scope = globalThis as unknown as { AudioContext?: new () => AlertAudioContextLike; webkitAudioContext?: new () => AlertAudioContextLike };
  const Constructor = scope.AudioContext ?? scope.webkitAudioContext;
  return Constructor ? () => new Constructor() : null;
}
let shared: AlertSoundPlayer | null = null;
/** One lazily created player shared by delivery and dialog preview. */
export function sharedAlertSoundPlayer(): AlertSoundPlayer { return shared ??= createAlertSoundPlayer(); }
