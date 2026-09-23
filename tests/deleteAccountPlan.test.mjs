/**
 * Deleting an account, including the branch nobody can reach by clicking.
 *
 * Every real run destroys its own subject, so a manual test happens once per
 * account and can never be repeated. The branch that matters most - Lemon
 * Squeezy refusing a cancellation - needs it to fail on cue, which no amount
 * of clicking can arrange. These run it on demand.
 *
 * The guarantee under test is one sentence: if a cancellation fails, the
 * account is not touched. Getting that wrong means a deleted account whose
 * card is still charged every month, with the subscription ids gone.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BILLING_STATUSES,
  runDeletion,
  subscriptionsToCancel,
} from '../supabase/functions/delete-account/plan.ts';

/** Records what was called, in order, so ordering can be asserted. */
function spy({ failCancelOn = null, failDelete = false } = {}) {
  const calls = [];
  return {
    calls,
    effects: {
      async cancel(id) {
        calls.push(`cancel:${id}`);
        if (failCancelOn === id) throw new Error('This store has not been activated.');
      },
      async clearLedger() {
        calls.push('clearLedger');
      },
      async deleteUser() {
        calls.push('deleteUser');
        if (failDelete) throw new Error('user not found');
      },
    },
  };
}

const sub = (id, status) => ({ lemon_subscription_id: id, status });

// ------------------------------------------------- which ones get cancelled --

test('only subscriptions that would be charged again are cancelled', () => {
  const rows = [
    sub('1', 'active'),
    sub('2', 'trialing'),
    sub('3', 'past_due'),
    // Already set not to renew. Asking Lemon Squeezy again is an error, which
    // would turn a working delete into a failed one.
    sub('4', 'cancelled'),
    sub('5', 'inactive'),
  ];
  assert.deepEqual(subscriptionsToCancel(rows), ['1', '2', '3']);
  assert.deepEqual(BILLING_STATUSES, ['active', 'trialing', 'past_due']);
});

test('an account with nothing to cancel still deletes', async () => {
  const s = spy();
  const out = await runDeletion([], s.effects);
  assert.deepEqual(out, { ok: true, cancelled: [] });
  assert.deepEqual(s.calls, ['clearLedger', 'deleteUser']);
});

// ------------------------------------------------------- the ordering rule --

test('every cancellation happens before the account is deleted', async () => {
  const s = spy();
  const out = await runDeletion([sub('100', 'active'), sub('200', 'past_due')], s.effects);
  assert.equal(out.ok, true);
  assert.deepEqual(out.cancelled, ['100', '200']);
  // The order is the guarantee, not an implementation detail: deleteUser last.
  assert.deepEqual(s.calls, ['cancel:100', 'cancel:200', 'clearLedger', 'deleteUser']);
});

// --------------------------------------------------------- the failure path --

test('a failed cancellation leaves the account alone', async () => {
  const s = spy({ failCancelOn: '100' });
  const out = await runDeletion([sub('100', 'active')], s.effects);

  assert.equal(out.ok, false);
  assert.equal(out.stage, 'cancel');
  // THE assertion. Deleting here would leave Lemon Squeezy charging a card
  // for an account that no longer exists, with the id gone.
  assert.ok(!s.calls.includes('deleteUser'), 'the account must not be deleted');
  assert.ok(!s.calls.includes('clearLedger'), 'nothing of theirs should be removed');
  assert.match(out.message, /nothing was deleted/);
  assert.match(out.message, /keep being charged/);
  // The reason Lemon Squeezy gave reaches the user rather than being swallowed.
  assert.match(out.message, /This store has not been activated/);
});

test('it stops at the first failure rather than carrying on', async () => {
  const s = spy({ failCancelOn: '200' });
  const out = await runDeletion(
    [sub('100', 'active'), sub('200', 'active'), sub('300', 'active')],
    s.effects,
  );

  assert.equal(out.ok, false);
  // 100 was cancelled before 200 refused. That is reported, because it
  // happened and the user needs to know one of them is now off.
  assert.deepEqual(out.cancelled, ['100']);
  // 300 is never attempted, and the account survives.
  assert.deepEqual(s.calls, ['cancel:100', 'cancel:200']);
});

// --------------------------------------------- the account survives the rest --

test('a ledger that will not clear does not strand the user', async () => {
  // An event log with no account behind it is untidy, not dangerous.
  const s = spy();
  s.effects.clearLedger = async () => {
    s.calls.push('clearLedger');
    throw new Error('permission denied');
  };
  const out = await runDeletion([sub('100', 'active')], s.effects);
  assert.equal(out.ok, true);
  assert.deepEqual(s.calls, ['cancel:100', 'clearLedger', 'deleteUser']);
});

test('a delete that fails after a cancellation says so', async () => {
  const s = spy({ failDelete: true });
  const out = await runDeletion([sub('100', 'active')], s.effects);

  assert.equal(out.ok, false);
  assert.equal(out.stage, 'delete');
  assert.deepEqual(out.cancelled, ['100']);
  // The user is not being billed any more, and being told only "could not
  // delete" would hide the one reassuring fact in the situation.
  assert.match(out.message, /not being charged/);
});

test('a delete that fails with nothing cancelled says nothing changed', async () => {
  const s = spy({ failDelete: true });
  const out = await runDeletion([], s.effects);
  assert.equal(out.ok, false);
  assert.match(out.message, /Nothing was changed/);
  assert.doesNotMatch(out.message, /not being charged/);
});
