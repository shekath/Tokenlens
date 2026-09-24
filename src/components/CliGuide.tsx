import { useId, useState, type ReactNode } from 'react';
import {
  GUIDE_INTRO,
  GUIDE_PLANS,
  GUIDE_STEPS,
  TROUBLESHOOTING,
  type Snippet,
} from '../lib/cliGuide';
import { MODELS, PRICING_AS_OF, VENDORS } from '../lib/models';
import { FREE_MODEL_IDS } from '../lib/entitlements';

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
            {runs(step.snippets).map((run) =>
              run.length > 1 || run[0]!.group ? (
                <SnippetTabs key={run[0]!.group! + run[0]!.tab} snippets={run} />
              ) : (
                <CodeBlock key={run[0]!.label + run[0]!.code.slice(0, 20)} snippet={run[0]!} />
              ),
            )}
            {step.id === 'models' ? <ModelList /> : null}
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

/** Consecutive snippets sharing a group become one run; the rest stand alone. */
function runs(snippets: Snippet[]): Snippet[][] {
  const out: Snippet[][] = [];
  for (const s of snippets) {
    const last = out[out.length - 1];
    if (s.group && last && last[0]!.group === s.group) last.push(s);
    else out.push([s]);
  }
  return out;
}

/** One tab per tool; each tab shows that tool's snippets in order. */
function SnippetTabs({ snippets }: { snippets: Snippet[] }) {
  const tabs = [...new Set(snippets.map((s) => s.tab ?? s.label))];
  const [active, setActive] = useState(tabs[0]!);
  const base = useId();
  const move = (dir: 1 | -1) => {
    const i = (tabs.indexOf(active) + dir + tabs.length) % tabs.length;
    setActive(tabs[i]!);
    document.getElementById(`${base}-tab-${i}`)?.focus();
  };
  return (
    <div className="snippettabs">
      <div className="snippettabs__list" role="tablist" aria-label="Choose your tool">
        {tabs.map((t, i) => (
          <button
            key={t}
            id={`${base}-tab-${i}`}
            type="button"
            role="tab"
            aria-selected={t === active}
            aria-controls={`${base}-panel`}
            tabIndex={t === active ? 0 : -1}
            className={t === active ? 'snippettabs__tab is-on' : 'snippettabs__tab'}
            onClick={() => setActive(t)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') move(1);
              if (e.key === 'ArrowLeft') move(-1);
            }}
          >
            {t}
          </button>
        ))}
      </div>
      <div id={`${base}-panel`} role="tabpanel" aria-label={active}>
        {snippets
          .filter((s) => (s.tab ?? s.label) === active)
          .map((s) => (
            <CodeBlock key={s.label + s.code.slice(0, 20)} snippet={s} />
          ))}
      </div>
    </div>
  );
}

/** Every model tokenticks prices, straight from the registry the tool uses. */
function ModelList() {
  const free = new Set(FREE_MODEL_IDS);
  const perM = (n: number) => `$${n < 1 ? n.toFixed(2) : n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)}`;
  return (
    <div className="modellist">
      <p className="modellist__head">
        {MODELS.length} models from {VENDORS.length} vendors · rates in USD per million tokens, as
        published on {PRICING_AS_OF}
      </p>
      <div className="tablewrap">
        <table className="data modellist__table">
          <thead>
            <tr>
              <th>Model id</th>
              <th className="modellist__name">Model</th>
              <th>Counts</th>
              <th>Input</th>
              <th>Output</th>
              <th>Free plan</th>
            </tr>
          </thead>
          {VENDORS.map((v) => {
            const rows = MODELS.filter((m) => m.vendor === v);
            if (rows.length === 0) return null;
            return (
              <tbody key={v}>
                <tr className="modellist__vendor">
                  <th colSpan={6} scope="colgroup">
                    {v}
                  </th>
                </tr>
                {rows.map((m) => {
                  const exact = m.tokenizer === 'o200k' || m.tokenizer === 'cl100k';
                  return (
                    <tr key={m.id}>
                      <td>
                        <code className="modellist__id">{m.id}</code>
                      </td>
                      <td className="modellist__name">{m.label}</td>
                      <td>
                        <span className={exact ? 'badge badge--exact' : 'badge badge--est'}>{exact ? 'exact' : 'estimate'}</span>
                      </td>
                      <td>{perM(m.inputPerM)}</td>
                      <td>{perM(m.outputPerM)}</td>
                      <td>{free.has(m.id) ? '✓' : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            );
          })}
        </table>
      </div>
    </div>
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
  const lang = snippet.file?.endsWith('.yml')
    ? 'yaml'
    : snippet.file?.endsWith('.toml')
      ? 'toml'
      : snippet.file
        ? 'json'
        : snippet.kind;

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
      {snippet.note ? <p className="code__note">{snippet.note}</p> : null}
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
  } else if (lang === 'toml') {
    const section = line.match(/^(\s*)(\[[^\]]+\])(.*)$/);
    const pair = line.match(/^(\s*)([\w.-]+)(\s*=)(.*)$/);
    body = section ? (
      <>
        {section[1]}
        <span className="tok-key">{section[2]}</span>
        {section[3]}
      </>
    ) : pair ? (
      <>
        {pair[1]}
        <span className="tok-key">{pair[2]}</span>
        {pair[3]}
        {tint(pair[4]!)}
      </>
    ) : (
      tint(line)
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
