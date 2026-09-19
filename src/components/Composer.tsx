import { useRef } from 'react';
import { SAMPLES } from '../lib/samples';
import { num } from '../lib/format';

/** The prompt input, plus the live character/word readout that belongs with it. */
export function Composer({
  text,
  onChange,
  chars,
  words,
  lines,
  bytes,
}: {
  text: string;
  onChange: (v: string) => void;
  chars: number;
  words: number;
  lines: number;
  bytes: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  return (
    <div className="composer">
      <div className="composer__head">
        <span className="composer__title">Your prompt</span>
        {/* One scrollable row rather than a wrapping block: on a phone these
            otherwise stack three deep and push the input off the first screen. */}
        <div className="composer__samples">
          {SAMPLES.map((s) => (
            <button
              key={s.id}
              type="button"
              className="btn btn--ghost"
              title={s.hint}
              onClick={() => {
                onChange(s.text);
                ref.current?.focus();
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn"
          disabled={text.length === 0}
          onClick={() => {
            onChange('');
            ref.current?.focus();
          }}
        >
          Clear
        </button>
      </div>

      <label className="sr-only" htmlFor="prompt">
        Prompt text to analyse
      </label>
      <textarea
        id="prompt"
        ref={ref}
        value={text}
        spellCheck={false}
        placeholder="Type or paste a prompt — a question, a system prompt, a document, a diff. Nothing leaves your browser."
        onChange={(e) => onChange(e.target.value)}
      />

      <div className="composer__foot">
        <dl>
          <dt>Characters</dt>
          <dd>{num(chars)}</dd>
        </dl>
        <dl>
          <dt>Words</dt>
          <dd>{num(words)}</dd>
        </dl>
        <dl>
          <dt>Lines</dt>
          <dd>{num(lines)}</dd>
        </dl>
        <dl>
          <dt>UTF-8 bytes</dt>
          <dd>{num(bytes)}</dd>
        </dl>
        <span className="muted" style={{ marginLeft: 'auto' }}>
          Counted locally — no network request
        </span>
      </div>
    </div>
  );
}
