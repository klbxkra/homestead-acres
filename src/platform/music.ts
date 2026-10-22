/**
 * The background tune, as data: a gentle country loop in G major (PLAN.md
 * section 10, "SFX and music"). Pure, so tests can check it stays in key; the
 * audio engine turns these notes into sound.
 */

export interface MusicNote {
  /** Start, in beats from the start of the bar. */
  beat: number;
  /** Length in beats. */
  length: number;
  /** MIDI note number (60 = middle C). */
  midi: number;
  voice: 'bass' | 'pluck' | 'pad';
  /** 0..1 */
  velocity: number;
}

export const MUSIC_BPM = 88;
export const BEATS_PER_BAR = 4;

/** G major pentatonic-ish chord progression: G, D, Em, C (I-V-vi-IV), then G, C, D, G. */
const CHORDS: readonly (readonly number[])[] = [
  [55, 59, 62], // G
  [50, 54, 57], // D
  [52, 55, 59], // Em
  [48, 52, 55], // C
  [55, 59, 62], // G
  [48, 52, 55], // C
  [50, 54, 57], // D
  [55, 59, 62], // G
];

/** Arpeggio shapes (indexes into the chord, +3 = an octave up), varied every few bars so the loop doesn't drone. */
const PATTERNS: readonly (readonly number[])[] = [
  [0, 1, 2, 4, 2, 1, 2, 4],
  [0, 2, 1, 2, 3, 2, 1, 2],
  [0, 1, 2, 1, 4, 3, 2, 1],
];

/** The notes of bar `bar` (bars repeat every 24 bars). */
export function musicBar(bar: number): MusicNote[] {
  const i = ((bar % CHORDS.length) + CHORDS.length) % CHORDS.length;
  const chord = CHORDS[i]!;
  const pattern = PATTERNS[Math.floor(bar / CHORDS.length) % PATTERNS.length]!;
  const notes: MusicNote[] = [];
  // Root on beat 1 and the fifth on beat 3, an octave down.
  notes.push({ beat: 0, length: 1.8, midi: chord[0]! - 12, voice: 'bass', velocity: 0.9 });
  notes.push({ beat: 2, length: 1.8, midi: chord[2]! - 12, voice: 'bass', velocity: 0.7 });
  // A soft pad on the whole chord.
  for (const midi of chord) notes.push({ beat: 0, length: BEATS_PER_BAR, midi, voice: 'pad', velocity: 0.35 });
  // Eighth-note plucks; every fourth bar rests on the last two.
  pattern.forEach((step, n) => {
    if (i % 4 === 3 && n >= 6) return;
    const midi = chord[step % 3]! + 12 * (1 + Math.floor(step / 3));
    notes.push({ beat: n / 2, length: 0.45, midi, voice: 'pluck', velocity: n % 2 === 0 ? 0.8 : 0.55 });
  });
  return notes;
}

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
