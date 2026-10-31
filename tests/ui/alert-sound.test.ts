import { expect, it } from 'vitest';
import { createAlertSoundPlayer, type AlertAudioContextLike } from '../../src/ui/alert-sound';
import { alertSound } from '../../src/domain/alert-delivery';

// Controlled Web Audio model. It records scheduled synthesized tones; no audio
// device output, autoplay policy or packaged app behavior is claimed.
function fakeContext(initial: string, resumeTo: string | null = 'running') {
  const log: Array<{ type: string; frequency: number; start: number; stop: number; peak: number }> = [];
  const context: AlertAudioContextLike & { resumes: number } = {
    state: initial, currentTime: 2, destination: 'SYNTHETIC destination', resumes: 0,
    resume: async () => { context.resumes++; if (resumeTo) (context as { state: string }).state = resumeTo; },
    createOscillator: () => { const entry = { type: '', frequency: 0, start: 0, stop: 0, peak: 0 }; log.push(entry); return { set type(value: string) { entry.type = value; }, get type() { return entry.type; }, frequency: { setValueAtTime: (value: number) => { entry.frequency = value; } }, connect: target => target, start: time => { entry.start = time; }, stop: time => { entry.stop = time; } }; },
    createGain: () => { const entry = log.at(-1)!; return { gain: { setValueAtTime: () => undefined, linearRampToValueAtTime: (value: number) => { entry.peak = Math.max(entry.peak, value); } }, connect: target => target }; },
  };
  return { context, log };
}

it('schedules the selected original tone sequence once on a running context', async () => {
  const { context, log } = fakeContext('running');
  let created = 0;
  const player = createAlertSoundPlayer(() => { created++; return context; });
  await player.play('lv-chime');
  const spec = alertSound('lv-chime');
  expect(log.map(entry => [entry.type, entry.frequency, Number(entry.start.toFixed(3))])).toEqual(spec.tones.map(tone => [tone.wave, tone.frequency, Number((2.01 + tone.start).toFixed(3))]));
  expect(log.every(entry => entry.stop > entry.start && entry.peak > 0 && entry.peak <= 0.2)).toBe(true);
  await player.play('lv-pulse');
  expect(created).toBe(1); expect(log).toHaveLength(spec.tones.length + alertSound('lv-pulse').tones.length);
});

it('resumes a suspended context and reports blocked or unavailable output instead of claiming playback', async () => {
  const resumable = fakeContext('suspended', 'running');
  await createAlertSoundPlayer(() => resumable.context).play('lv-bell');
  expect(resumable.context.resumes).toBe(1); expect(resumable.log).toHaveLength(2);
  const blocked = fakeContext('suspended', null);
  await expect(createAlertSoundPlayer(() => blocked.context).play('lv-bell')).rejects.toThrow('Sound output is blocked until audio is permitted.');
  expect(blocked.log).toHaveLength(0);
  const closed = fakeContext('closed');
  await expect(createAlertSoundPlayer(() => closed.context).play('lv-bell')).rejects.toThrow('Sound output is not running.');
  await expect(createAlertSoundPlayer(null).play('lv-bell')).rejects.toThrow('Sound output is unavailable in this environment.');
  await expect(createAlertSoundPlayer(() => { throw new Error('SYNTHETIC device'); }).play('lv-bell')).rejects.toThrow('Sound output could not be opened.');
  await expect(createAlertSoundPlayer(() => resumable.context).play('siren' as never)).rejects.toThrow('Unknown local alert sound.');
});
