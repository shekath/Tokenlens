/**
 * The confirmation gate on deleting an account.
 *
 * Separated and pure so the rule can be tested without a browser. It is the
 * only thing standing between a misclick and an irreversible delete, and the
 * cost of getting it subtly wrong - accepting "" because of a stray trim, say -
 * is somebody's account.
 */

/** What the user has to type, and what the label tells them to type. */
export const DELETE_PHRASE = 'delete';

/**
 * Whether what was typed unlocks the button.
 *
 * Surrounding whitespace is forgiven because a phone keyboard adds a trailing
 * space on its own and refusing that teaches nothing. Case is not: reaching for
 * the shift key is a moment's more deliberation, and the label says the word in
 * lower case. Everything else - empty, partial, the word inside a sentence - is
 * refused.
 */
export function deleteConfirmed(typed: string): boolean {
  return typed.trim() === DELETE_PHRASE;
}
