import { GUIDE_STEPS } from '../lib/cliGuide';
import { scrollToSection, useSectionLanding } from '../lib/useSectionLanding';
import { Banner } from './Banner';
import { CliGuide } from './CliGuide';

/**
 * Dev tools: the tokenticks CLI, CI checks, the MCP server and licence keys.
 *
 * A page of its own rather than a section of Docs. Docs explains what each
 * feature is for; this is a set of instructions someone follows with a
 * terminal open, and it deserves a place in the navigation they can come back
 * to. "#/devtools?s=ci" lands on a step.
 */
export function DevToolsPage({ onKeys, onBack }: { onKeys: (() => void) | null; onBack: () => void }) {
  useSectionLanding('doc-guide-');

  return (
    <main className="shell page">
      <header className="pagehead pagehead--tall">
        <Banner motif="trim" id="devtools" />
        <div className="pagehead__text">
          <p className="pagehead__eyebrow">Dev tools</p>
          <h1 className="pagehead__title">CLI, CI checks and MCP, set up in ten minutes</h1>
          <p className="pagehead__lede">
            Run the TokenTicks engine where your prompts live: in a terminal, in every pull
            request, and inside Claude Code, Cursor or Claude Desktop. Each step below has the
            exact commands and files to copy.
          </p>
        </div>
      </header>

      <nav className="docnav" aria-label="Steps">
        {GUIDE_STEPS.map((step, i) => (
          <a
            key={step.id}
            className="docnav__link"
            href={`#/devtools?s=${step.id}`}
            onClick={(e) => {
              e.preventDefault();
              scrollToSection(`doc-guide-${step.id}`);
            }}
          >
            {i + 1}. {step.title}
          </a>
        ))}
      </nav>

      <CliGuide onKeys={onKeys} />

      <div className="row" style={{ marginTop: 28 }}>
        <button type="button" className="btn btn--ghost" onClick={onBack}>
          Back to the dashboard
        </button>
      </div>
    </main>
  );
}
