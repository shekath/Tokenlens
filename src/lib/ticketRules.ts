/**
 * What makes a support request sendable.
 *
 * Pure, and in its own module with no runtime imports, so the node suite can
 * load it. tickets.ts imports ./supabase, which node cannot resolve without a
 * file extension - the third time that has caught me in this codebase, after
 * checkoutTarget and the support mailto. Rules that need testing do not live
 * beside a client.
 *
 * The limits mirror the CHECK constraints in migration 0010. The database is
 * the authority; a form that accepts more than Postgres will has thrown away
 * somebody's message.
 */

export const SUBJECT_MIN = 3;
export const SUBJECT_MAX = 200;
export const MESSAGE_MIN = 10;
export const MESSAGE_MAX = 5000;
/** Matches the "Own tickets, five a day" policy. */
export const DAILY_LIMIT = 5;

/**
 * What is wrong with a draft, in the words the sender needs, or null when it
 * is sendable. Trimmed lengths, because the database checks btrim() and a
 * message of spaces is not a message.
 */
export function ticketProblem(subject: string, message: string): string | null {
  const s = subject.trim();
  const m = message.trim();
  if (s.length < SUBJECT_MIN) return 'Give the request a subject — a few words is enough.';
  if (s.length > SUBJECT_MAX) return `The subject is limited to ${SUBJECT_MAX} characters.`;
  if (m.length < MESSAGE_MIN) return 'Tell us what happened, in a sentence or two.';
  if (m.length > MESSAGE_MAX) {
    return `The message is limited to ${MESSAGE_MAX.toLocaleString()} characters. ` +
      `Attach the detail in a reply if you need more room.`;
  }
  return null;
}

/** The rate limit, phrased as a person would ask about it. */
export function rateLimitMessage(): string {
  return `That is ${DAILY_LIMIT} requests in a day, which is our limit. ` +
    `Reply to one of the emails instead — it reaches the same place.`;
}

