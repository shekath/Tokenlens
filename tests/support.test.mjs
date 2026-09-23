/**
 * The support mailto.
 *
 * What is tested here is whether a ticket arrives answerable. The account id,
 * the plan and the build are the three things that turn "it doesn't work" into
 * something diagnosable, and the person raising it does not know any of them.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  browserContext,
  contextBlock,
  supportMailto,
  supportSubject,
} from '../src/lib/support.ts';

const TEAM = {
  accountId: 'TT-7K3QX9',
  tier: 'team',
  status: 'active',
  email: 'buyer@example.com',
  build: 'e820af1',
  agent: 'Mozilla/5.0 (Macintosh) Chrome/141',
  viewport: '1440×900',
};
const SIGNED_OUT = {
  accountId: null,
  tier: null,
  status: null,
  email: null,
  build: 'e820af1',
  agent: 'Mozilla/5.0 (iPhone) Safari/18',
  viewport: '390×844',
};

// ------------------------------------------------------------- the subject --

test('the plan is a filterable tag, and the account id is greppable', () => {
  const s = supportSubject(TEAM, 'Batch upload fails');
  // Leading and bracketed so a Gmail rule or a Zoho view can sort the queue on
  // it with no integration at all. That is what "priority support" means here.
  assert.ok(s.startsWith('[TokenTicks][team] '), s);
  assert.ok(s.includes('Batch upload fails'), s);
  assert.ok(s.endsWith('(TT-7K3QX9)'), s);
});

test('a free user gets the same route, tagged free', () => {
  // Not gated: support being reachable is not a paid feature.
  const s = supportSubject({ ...TEAM, tier: 'free' }, 'Question about caching');
  assert.ok(s.startsWith('[TokenTicks][free] '), s);
});

test('signed out still produces a usable subject', () => {
  const s = supportSubject(SIGNED_OUT, 'Cannot sign in');
  assert.ok(s.startsWith('[TokenTicks][free] '), s);
  // No account id to quote, and no empty parentheses pretending otherwise.
  assert.ok(!s.includes('()'), s);
});

test('an empty topic still names the mail something', () => {
  assert.ok(supportSubject(TEAM, '   ').includes('Support request'));
});

// ------------------------------------------------------- the context block --

test('the block carries what support would otherwise have to ask for', () => {
  const body = contextBlock(TEAM);
  for (const expected of ['TT-7K3QX9', 'team', 'buyer@example.com', 'e820af1', '1440×900']) {
    assert.ok(body.includes(expected), `${expected} missing from:\n${body}`);
  }
  // Visible to the sender before they press send - nothing is gathered here
  // that they could not read off their own account page.
  assert.match(body, /sent from TokenTicks/);
});

test('a lapsed plan says so rather than reading as active', () => {
  assert.match(contextBlock({ ...TEAM, status: 'past_due' }), /team · past_due/);
});

test('signed out says signed out instead of printing null', () => {
  const body = contextBlock(SIGNED_OUT);
  assert.match(body, /\(signed out\)/);
  assert.ok(!body.includes('null'), body);
});

// -------------------------------------------------------------- the mailto --

test('the mailto encodes for a mail client, not a query string', () => {
  const url = supportMailto(TEAM, 'Batch upload fails', 'support@example.com');
  assert.ok(url.startsWith('mailto:support@example.com?'), url);
  // URLSearchParams writes '+' for a space; mail clients show that literally
  // in the subject line, so it has to be percent-encoded instead.
  const query = url.slice(url.indexOf('?') + 1);
  assert.ok(!query.includes('+'), `a raw + would render literally: ${query}`);

  const parsed = new URLSearchParams(query);
  assert.equal(parsed.get('subject'), supportSubject(TEAM, 'Batch upload fails'));
  assert.equal(parsed.get('body'), contextBlock(TEAM));
});

test('no configured address yields null, not a broken compose window', () => {
  // A mailto with an empty recipient opens an empty draft, which looks like
  // the app working. The caller hides the control on null instead.
  for (const to of ['', '   ', undefined]) {
    assert.equal(supportMailto(TEAM, 'Anything', to), null);
  }
});

// ------------------------------------------------------------ the browser ---

test('browser context reads the window it is given', () => {
  const fake = { navigator: { userAgent: 'TestAgent/1' }, innerWidth: 375, innerHeight: 667 };
  assert.deepEqual(browserContext(fake), { agent: 'TestAgent/1', viewport: '375×667' });
});

test('a window that will not say makes do rather than throwing', () => {
  assert.deepEqual(browserContext({ innerWidth: 0, innerHeight: 0 }), {
    agent: 'unknown',
    viewport: '0×0',
  });
});
