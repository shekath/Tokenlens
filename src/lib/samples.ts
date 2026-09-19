/** Example prompts, chosen to show how differently token counts behave by content. */

export interface Sample {
  id: string;
  label: string;
  hint: string;
  text: string;
}

export const SAMPLES: Sample[] = [
  {
    id: 'chat',
    label: 'Short request',
    hint: 'Plain English — about 4 characters per token',
    text: `Summarise the attached quarterly report in five bullet points for a non-technical audience. Lead with the revenue number, flag anything that changed direction versus last quarter, and keep each bullet under 25 words.`,
  },
  {
    id: 'system',
    label: 'System prompt',
    hint: 'The part you resend on every call — the case for prompt caching',
    text: `You are a support agent for Northwind Logistics. You answer questions about shipments, delivery windows, customs paperwork and billing.

Rules:
1. Always confirm the tracking number before giving shipment details. If the customer has not provided one, ask for it first and do nothing else.
2. Never quote a delivery date that is not present in the tool output. If the tool returns no estimate, say the estimate is unavailable and offer to open a trace.
3. Currency amounts are always in the customer's billing currency. Do not convert.
4. For customs questions, state the requirement and cite the document code (e.g. CN22, CN23, EX-1). Do not interpret regulations beyond what the knowledge base says.
5. If the customer asks for a refund, collect the shipment number and the reason, then hand off to a human with a one-paragraph summary. Do not promise an outcome.
6. Escalate immediately if the customer mentions a legal claim, a chargeback, or hazardous goods.

Tone: direct and warm. Short sentences. No filler openers such as "Great question". Do not apologise more than once per conversation.

Output format: plain prose. Use a short bulleted list only when you are enumerating three or more concrete items. Never use headings.`,
  },
  {
    id: 'code',
    label: 'Code',
    hint: 'Indentation and punctuation push the token count up',
    text: `export async function retry<T>(
  fn: () => Promise<T>,
  { attempts = 4, baseMs = 250 }: { attempts?: number; baseMs?: number } = {},
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i === attempts - 1) break;
      const jitter = Math.random() * baseMs;
      await new Promise((r) => setTimeout(r, baseMs * 2 ** i + jitter));
    }
  }
  throw lastError;
}`,
  },
  {
    id: 'multilingual',
    label: 'Non-Latin script',
    hint: 'The same meaning can cost two to three times as many tokens',
    text: `以下の文章を英語に翻訳してください。専門用語はそのまま残し、数値の単位は変換しないでください。

अनुवाद करते समय मूल वाक्य-संरचना बनाए रखें।

Переведите, сохраняя нумерацию пунктов.`,
  },
];
