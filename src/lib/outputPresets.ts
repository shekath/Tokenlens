/**
 * Typical answer lengths by kind of task, for the "Expected output" input.
 *
 * The answer is usually most of the bill (output tokens cost 4-8x input on
 * most models), and it is the number people guess worst. These are rough,
 * typical lengths to start from, not measurements of anyone's workload - the
 * slider stays the source of truth and the presets only set it.
 */

export interface OutputPreset {
  id: string;
  label: string;
  /** Output tokens per call. A multiple of the slider's step (50) or small enough to type. */
  tokens: number;
  /** One line on what the task looks like, shown as the chip's title. */
  hint: string;
}

export const OUTPUT_PRESETS: readonly OutputPreset[] = [
  { id: 'classify', label: 'Label or yes/no', tokens: 10, hint: 'A category, a score or a yes/no answer' },
  { id: 'extract', label: 'Extraction', tokens: 150, hint: 'A few fields pulled out as JSON' },
  { id: 'chat', label: 'Chat reply', tokens: 300, hint: 'A support or assistant reply of a short paragraph or two' },
  { id: 'summary', label: 'Summary', tokens: 400, hint: 'A summary of a document or thread, around 300 words' },
  { id: 'email', label: 'Email draft', tokens: 600, hint: 'A drafted email or message, around 450 words' },
  { id: 'code', label: 'Code change', tokens: 1_200, hint: 'A function or a small change with a short explanation' },
  { id: 'report', label: 'Long report', tokens: 2_500, hint: 'An article or report, around 1,900 words' },
];

/** The preset whose length matches exactly, so its chip can show as selected. */
export function activePreset(tokens: number): OutputPreset | undefined {
  return OUTPUT_PRESETS.find((p) => p.tokens === tokens);
}
