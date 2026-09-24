/**
 * Opening a section of the account dialog from elsewhere in the app.
 *
 * The dialog's state lives in ProfileMenu, which is only mounted for a
 * signed-in user. Rather than lift that state through App for one button on
 * the Docs page, a page asks for a section with a window event and the menu,
 * if it is mounted, answers. Nothing happens when nobody is signed in, which
 * is why callers check for a user first and offer sign-in instead.
 */

export type AccountSection = 'details' | 'password' | 'subscription' | 'keys' | 'support' | 'delete';

export const ACCOUNT_EVENT = 'tokenticks:account';

export function openAccountSection(section: AccountSection): void {
  window.dispatchEvent(new CustomEvent<AccountSection>(ACCOUNT_EVENT, { detail: section }));
}
