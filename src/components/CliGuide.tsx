import { useState, type ReactNode } from 'react';
import {
  GUIDE_INTRO,
  GUIDE_PLANS,
  GUIDE_STEPS,
  TROUBLESHOOTING,
  type Snippet,
} from '../lib/cliGuide';

/**
 * The developer guide: CLI, CI and MCP, step by step. The body of the Dev
 * tools page, which supplies the heading.
 *
 * Every snippet is its own block with a header saying what it is - a command
 * for a terminal, a file and the path to save it at, or output to expect - and
 * a Copy button. The content, and the tests that hold it to the real tool, are
 * in lib/cliGuide.ts.
 */
export function CliGuide({ onKeys }: { onKeys: (() => void) | null }) {
  return (
    <section className="doc guide" aria-label="Setup guide">
      {GUIDE_INTRO.map((p) => (
        <p key={p} className="doc__body">
          {p}
        </p>
      ))}

      <h3 className="doc__sub">What each plan runs</h3>
      <div className="tablewrap">
        <table className="data guide__plans">
          <thead>
            <tr>
              <th>Feature</th>
              <th>Free</th>
              <th>Pro</th>
              <th>Team</th>
            </tr>
          </thead>
          <tbody>
            {GUIDE_PLANS.map((r) => (
              <tr key={r.feature}>
                <td>{r.feature}</td>
                <td>{r.free}</td>
                <td>{r.pro}</td>
                <td>{r.team}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ol className="guide__steps">
        {GUIDE_STEPS.map((step, i) => (
          <li key={step.id} id={`doc-guide-${step.id}`} className="guide__step">
            <h3 className="guide__title">
              <span className="guide__num" aria-hidden="true">
                {i + 1}
              </span>
              {step.title}
            </h3>
            {step.intro.map((p) => (
              <p key={p} className="doc__body">
                {p}
              </p>
            ))}
            {step.id === 'key' && onKeys ? (
              <p style={{ margin: '0 0 12px' }}>
                <button type="button" className="btn" onClick={onKeys}>
                  Open CLI &amp; MCP keys
                </button>
              </p>
            ) : null}
            {step.snippets.map((s) => (
              <CodeBlock key={s.label + s.code.slice(0, 20)} snippet={s} />
            ))}
            {step.notes && step.notes.length > 0 ? (
              <ul className="guide__notes">
                {step.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ol>

      <h3 className="doc__sub">If something is not working</h3>
      <dl className="guide__trouble">
        {TROUBLESHOOTING.map((t) => (
          <div key={t.message}>
            <dt>
              <code>{t.message}</code>
            </dt>
            <dd>{t.fix}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const KIND_LABEL: Record<Snippet['kind'], string> = {
  command: 'Terminal',
  file: 'File',
  output: 'Output',
};

function CodeBlock({ snippet }: { snippet: Snippet }) {
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null);
  const copy = () => {
    const done = (ok: boolean) => {
      setCopied(ok ? 'yes' : 'no');
      window.setTimeout(() => setCopied(null), 1600);
    };
    if (!navigator.clipboard) {
      done(false);
      return;
    }
    navigator.clipboard.writeText(snippet.code).then(
      () => done(true),
      () => done(false),
    );
  };
  const lang = snippet.file?.endsWith('.yml') ? 'yaml' : snippet.file ? 'json' : snippet.kind;

  return (
    <figure className={`code code--${snippet.kind}`}>
      <figcaption className="code__head">
        <span className="code__kind">{KIND_LABEL[snippet.kind]}</span>
        <span className="code__label">
          {snippet.label}
          {snippet.file ? <code className="code__file">{snippet.file}</code> : null}
        </span>
        {snippet.kind === 'output' ? null : (
          <button type="button" className="code__copy" onClick={copy} aria-label={`Copy: ${snippet.label}`}>
            {copied === 'yes' ? 'Copied' : copied === 'no' ? 'Select and copy' : 'Copy'}
          </button>
        )}
      </figcaption>
      <pre className="code__body" tabIndex={0}>
        <code>{snippet.code.split('\n').map((line, i) => <Line key={i} line={line} lang={lang} />)}</code>
      </pre>
    </figure>
  );
}

/**
 * Light highlighting, built as spans (never innerHTML): comments dimmed,
 * strings and keys tinted, and a "$" prompt on commands that is marked
 * user-select: none so a hand-selected copy does not pick it up.
 */
function Line({ line, lang }: { line: string; lang: string }) {
  const trimmed = line.trimStart();
  let body: ReactNode;
  if (lang !== 'output' && trimmed.startsWith('#')) {
    body = <span className="tok-comment">{line}</span>;
  } else if (lang === 'command') {
    body =
      line === '' ? (
        ''
      ) : (
        <>
          <span className="tok-prompt" aria-hidden="true">
            ${' '}
          </span>
          {words(line)}
        </>
      );
  } else if (lang === 'yaml') {
    const m = line.match(/^(\s*-?\s*)([\w.-]+)(:)(.*)$/);
    const [code, comment] = splitComment(m ? m[4]! : line);
    body = m ? (
      <>
        {m[1]}
        <span className="tok-key">{m[2]}</span>
        {m[3]}
        {tint(code)}
        {comment ? <span className="tok-comment">{comment}</span> : null}
      </>
    ) : (
      <>
        {tint(code)}
        {comment ? <span className="tok-comment">{comment}</span> : null}
      </>
    );
  } else if (lang === 'json') {
    body = tint(line, true);
  } else {
    body = line;
  }
  // Command and output lines are display: block (for the hanging indent), so
  // they supply their own break; file lines are inline and need the newline.
  const block = lang === 'command' || lang === 'output';
  return (
    <span className="code__line">
      {body === '' && block ? '\u00a0' : body}
      {block ? null : '\n'}
    </span>
  );
}

/**
 * A command split into unbreakable words, so a wrap happens only at a space.
 * Left to itself the browser also breaks at hyphens, turning --calls-per-day
 * into "--calls-per-" and "day" - which reads as two arguments.
 */
function words(line: string): ReactNode[] {
  return line.split(/( +)/).map((part, i) =>
    part.trim() === '' ? (
      part
    ) : (
      <span key={i} className="tok-word">
        {tint(part)}
      </span>
    ),
  );
}

/** A YAML trailing " # comment", outside quotes. */
function splitComment(s: string): [string, string] {
  let quote: string | null = null;
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i]!;
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '#' && (i === 0 || s[i - 1] === ' ')) {
      return [s.slice(0, i), s.slice(i)];
    }
  }
  return [s, ''];
}

/** Strings tinted; in JSON a string followed by ":" is a key. */
function tint(s: string, json = false): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) out.push(s.slice(last, m.index));
    const isKey = json && /^\s*:/.test(s.slice(m.index + m[0].length));
    out.push(
      <span key={m.index} className={isKey ? 'tok-key' : 'tok-string'}>
        {m[0]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}
