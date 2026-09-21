/**
 * Profile field rules.
 *
 * The rule that matters most here is agreement: RLS lets the browser write
 * these columns straight to Postgres, so if the form and the check constraint
 * disagree, one of them is decoration. The last test reads the migration and
 * compares, so drift in either direction fails here rather than in production
 * as a raw constraint-violation message.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  COUNTRY_SHAPE,
  PHONE_SHAPE,
  PUBLIC_ID_SHAPE,
  countryProblem,
  displayNameProblem,
  fullNameProblem,
  greetingName,
  initialsOf,
  phoneProblem,
  tidy,
} from '../src/lib/profileFields.ts';
import { COUNTRY_CODES, countryName } from '../src/lib/countries.ts';

test('blank fields are allowed: the account is identified by its email', () => {
  for (const f of [fullNameProblem, displayNameProblem, phoneProblem, countryProblem]) {
    assert.equal(f(''), null);
    assert.equal(f('   '), null);
  }
});

test('tidy collapses whitespace and returns null rather than an empty string', () => {
  assert.equal(tidy('  Ada   Lovelace '), 'Ada Lovelace');
  assert.equal(tidy('\n\t '), null);
});

test('names are bounded at the same lengths as the columns', () => {
  assert.equal(fullNameProblem('a'.repeat(80)), null);
  assert.ok(fullNameProblem('a'.repeat(81)));
  assert.equal(displayNameProblem('a'.repeat(40)), null);
  assert.ok(displayNameProblem('a'.repeat(41)));
});

test('a phone number is dialable or rejected', () => {
  for (const ok of ['+44 20 7946 0958', '02079460958', '+1 (415) 555-2671', '0123456']) {
    assert.equal(phoneProblem(ok), null, `${ok} should be accepted`);
  }
  for (const bad of ['call me', '+', '12345', 'tel:+441234567', '+44;7946']) {
    assert.ok(phoneProblem(bad), `${bad} should be rejected`);
  }
});

test('a country is an uppercase alpha-2 code', () => {
  assert.equal(countryProblem('GB'), null);
  assert.ok(countryProblem('gb'));
  assert.ok(countryProblem('GBR'));
});

test('the country list resolves to real names, with no duplicates', () => {
  assert.equal(new Set(COUNTRY_CODES).size, COUNTRY_CODES.length);
  assert.ok(COUNTRY_CODES.length > 240);
  for (const code of COUNTRY_CODES) {
    assert.match(code, COUNTRY_SHAPE);
    assert.ok(countryName(code).length > 0);
  }
});

test('the greeting falls back the way a person would', () => {
  assert.equal(greetingName({ displayName: 'Ada', fullName: 'Ada Lovelace', email: 'a@b.co' }), 'Ada');
  assert.equal(greetingName({ displayName: null, fullName: 'Ada Lovelace', email: 'a@b.co' }), 'Ada');
  assert.equal(greetingName({ displayName: '  ', fullName: null, email: 'ada@b.co' }), 'ada');
  assert.equal(greetingName({}), 'Account');
  // Never the uuid, and never empty - both would render as a blank chip.
  assert.ok(greetingName({ displayName: '', fullName: '', email: '' }).length > 0);
});

test('initials come from code points, not UTF-16 halves', () => {
  assert.equal(initialsOf('Ada Lovelace'), 'AL');
  assert.equal(initialsOf('Ada'), 'A');
  assert.equal(initialsOf('ada van der berg'), 'AB');
  // A surrogate pair must not be split into a replacement character.
  const emoji = initialsOf('😀 Person');
  assert.equal([...emoji].length, 2);
  assert.ok(!emoji.includes('�'));
});

test('a public id matches the shape the database will only ever produce', () => {
  assert.match('TT-SCS27-KQ90Z', PUBLIC_ID_SHAPE);
  // Crockford drops I, L, O and U so nothing is misread aloud.
  for (const c of 'ILOU') {
    assert.doesNotMatch(`TT-${c}${c}${c}${c}${c}-12345`, PUBLIC_ID_SHAPE);
  }
  assert.doesNotMatch('TT-ABCDE-1234', PUBLIC_ID_SHAPE);
  assert.doesNotMatch('XX-ABCDE-12345', PUBLIC_ID_SHAPE);
});

test('the form validates exactly what the column accepts', () => {
  const sql = readFileSync(new URL('../supabase/migrations/0003_profile_details.sql', import.meta.url), 'utf8');

  const pull = (name) => {
    const m = sql.match(new RegExp(`constraint ${name}[\\s\\S]*?~ '([^']+)'`));
    assert.ok(m, `${name} is no longer declared with a regex - update this test`);
    return new RegExp(m[1]);
  };

  assert.equal(pull('profiles_phone_shape').source, PHONE_SHAPE.source);
  assert.equal(pull('profiles_country_shape').source, COUNTRY_SHAPE.source);
  assert.equal(pull('profiles_public_id_shape').source, PUBLIC_ID_SHAPE.source);
});
