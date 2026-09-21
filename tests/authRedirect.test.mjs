/**
 * What the app says after an auth redirect.
 *
 * The bug behind these: a Google sign-in created the account, Supabase sent the
 * one-time code to the Site URL because the app's own URL was not allow-listed,
 * and the app - having no session and no error - rendered a normal signed-out
 * page. Silence is the failure mode worth testing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REDIRECT_PARAMS, redirectProblem } from '../src/lib/authRedirect.ts';

const q = (search) => new URLSearchParams(search);

test('a plain page load reports nothing', () => {
  assert.equal(redirectProblem(q(''), null), null);
  assert.equal(redirectProblem(q('?tab=analyse'), null), null);
});

test('a completed exchange reports nothing', () => {
  assert.equal(redirectProblem(q('?code=abc'), { access_token: 'x' }), null);
});

test('a code that produced no session is reported', () => {
  const msg = redirectProblem(q('?code=abc'), null);
  assert.ok(msg);
  assert.match(msg, /redirect/i);
  assert.match(msg, /URL Configuration/);
});

test("the provider's own error wins over the generic explanation", () => {
  const msg = redirectProblem(q('?error=access_denied&error_description=User+denied+access'), null);
  assert.equal(msg, 'User denied access');
});

test('a bare error code is still shown', () => {
  assert.equal(redirectProblem(q('?error=server_error'), null), 'server_error');
});

test('an error is reported even when a session exists', () => {
  // Signing in again after a failure must not hide the failure.
  assert.equal(redirectProblem(q('?error=otp_expired'), { access_token: 'x' }), 'otp_expired');
});

test('every parameter the reader looks for is also stripped afterwards', () => {
  for (const key of ['code', 'error', 'error_description']) {
    assert.ok(REDIRECT_PARAMS.includes(key), `${key} would be left in the address bar`);
  }
});
