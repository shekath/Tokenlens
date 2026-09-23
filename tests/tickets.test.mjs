/**
 * Validating a support request before it is sent.
 *
 * The limits mirror the CHECK constraints in migration 0010. That duplication
 * is the point: the database is the authority, and a form that accepts 6,000
 * characters only for Postgres to reject them has thrown away somebody's
 * message. These tests are what keeps the two in step.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DAILY_LIMIT,
  MESSAGE_MAX,
  MESSAGE_MIN,
  SUBJECT_MAX,
  SUBJECT_MIN,
  rateLimitMessage,
  ticketProblem,
} from '../src/lib/ticketRules.ts';

const ok = (s, m) => assert.equal(ticketProblem(s, m), null, `expected ${JSON.stringify([s, m])} to pass`);
const bad = (s, m) => assert.ok(ticketProblem(s, m), `expected ${JSON.stringify([s, m])} to be refused`);

test('a normal request goes through', () => {
  ok('Batch upload fails', 'I uploaded a CSV with 400 rows and the tab stayed empty.');
});

test('the limits match migration 0010', () => {
  // If these ever diverge, the form and the database disagree about what is
  // sendable and the loser is whoever typed the message.
  assert.deepEqual(
    { SUBJECT_MIN, SUBJECT_MAX, MESSAGE_MIN, MESSAGE_MAX, DAILY_LIMIT },
    { SUBJECT_MIN: 3, SUBJECT_MAX: 200, MESSAGE_MIN: 10, MESSAGE_MAX: 5000, DAILY_LIMIT: 5 },
  );
});

test('boundaries are accepted, not just the comfortable middle', () => {
  ok('a'.repeat(SUBJECT_MIN), 'b'.repeat(MESSAGE_MIN));
  ok('a'.repeat(SUBJECT_MAX), 'b'.repeat(MESSAGE_MAX));
});

test('one character past either limit is refused here, not by Postgres', () => {
  bad('a'.repeat(SUBJECT_MAX + 1), 'b'.repeat(MESSAGE_MIN));
  bad('a'.repeat(SUBJECT_MIN), 'b'.repeat(MESSAGE_MAX + 1));
});

test('whitespace is not content', () => {
  // The column checks btrim(), so a subject of spaces would be rejected by the
  // database after the form said it was fine.
  bad('   ', 'A real message that is long enough to count.');
  bad('A real subject', '          ');
  bad('', '');
});

test('every refusal says what to do about it', () => {
  for (const [s, m] of [
    ['', 'long enough message here'],
    ['ok subject', 'short'],
    ['a'.repeat(SUBJECT_MAX + 1), 'long enough message here'],
    ['ok subject', 'x'.repeat(MESSAGE_MAX + 1)],
  ]) {
    const problem = ticketProblem(s, m);
    assert.ok(problem && problem.length > 20, `unhelpful: ${problem}`);
    assert.match(problem, /[.!]$/, `not a sentence: ${problem}`);
  }
});

test('the rate limit explains the way round it', () => {
  const msg = rateLimitMessage();
  assert.ok(msg.includes(String(DAILY_LIMIT)), msg);
  // A dead end would be worse than the limit: replying to an existing email
  // reaches the same inbox and is not capped.
  assert.match(msg, /reply/i);
});
