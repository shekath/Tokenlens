/**
 * The confirmation gate on account deletion.
 *
 * This is the last thing between a misclick and an irreversible delete, so the
 * cases that must NOT unlock it matter more than the one that must.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DELETE_PHRASE, deleteConfirmed } from '../src/lib/deleteAccount.ts';

test('only the exact word unlocks deletion', () => {
  assert.equal(deleteConfirmed('delete'), true);
  // A phone keyboard adds a trailing space by itself; refusing that teaches
  // the user nothing about what is wrong.
  assert.equal(deleteConfirmed('  delete  '), true);
});

test('anything else does not', () => {
  for (const typed of [
    '',
    ' ',
    'delet',
    'deleted',
    'delete account',
    'please delete',
    'DELETE',
    'Delete',
    'remove',
    'yes',
  ]) {
    assert.equal(
      deleteConfirmed(typed),
      false,
      `${JSON.stringify(typed)} must not unlock an irreversible delete`,
    );
  }
});

test('the phrase the label shows is the phrase that is checked', () => {
  // The two drifting apart would mean an input nobody can satisfy, or worse,
  // one that unlocks on a word the warning never asked for.
  assert.equal(deleteConfirmed(DELETE_PHRASE), true);
});
