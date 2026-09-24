import type { PolicyText } from './types.ts';

/** The governing text. Every translation follows it section for section. */
export const en: PolicyText = {
  locale: 'en-GB',
  label: 'English',
  dir: 'ltr',
  ui: {
    eyebrow: 'Legal',
    title: 'Privacy Policy',
    lede: 'What TokenTicks collects, why, who helps us process it, how long we keep it, and the rights you have wherever you live.',
    effective: 'Effective {{effective}}',
    language: 'Language',
    onThisPage: 'On this page',
    translationNote: 'This policy is published in several languages. If a translation differs from the English text, the English text governs.',
    grievanceFallback: 'the TokenTicks Grievance Officer',
    addressFallback: 'available on request by email',
    emailFallback: 'the Contact support form in your account',
    back: 'Back to the dashboard',
  },
  sections: [
    {
      id: 'summary',
      title: 'Summary',
      blocks: [
        'TokenTicks counts the tokens in AI prompts and estimates what they cost across models. The prompts you paste are processed in your own browser and are never sent to us.',
        'We collect only what an account needs: your email address, any profile details you choose to add, your plan and billing status, and what you choose to save. We use no advertising or analytics trackers, and we do not sell or share personal data.',
        'This policy explains what we collect, why, who helps us process it, how long we keep it, and your rights under the laws of India, the European Union and United Kingdom, the United States and other countries.',
      ],
    },
    {
      id: 'who',
      title: 'Who we are',
      blocks: [
        'TokenTicks ("we", "us") is operated by {{operator}} from India. Under India\'s Digital Personal Data Protection Act, 2023 we are the Data Fiduciary, and under the EU and UK General Data Protection Regulation the controller, of the personal data described in this policy.',
        'For any question or request about your data, write to {{email}}. For complaints, see "Grievance officer and contact" at the end of this policy.',
      ],
    },
    {
      id: 'collect',
      title: 'Information we collect',
      blocks: [
        {
          list: [
            'Account: your email address and password. Passwords are stored by our authentication provider as a salted hash that nobody, including us, can read. If you sign in with Google, we receive your name, email address and Google account identifier.',
            'Profile details you choose to add: full name, display name, phone number and country.',
            'Account reference: a TT-XXXXX-XXXXX identifier we generate so support can find your account without asking for personal details.',
            'Plan and billing: your plan, subscription status and renewal date, Lemon Squeezy customer and subscription identifiers, the last invoiced amount and currency, and your card brand and last four digits. Full card numbers are handled only by Lemon Squeezy and never reach us.',
            'Saved estimates: project title, model, token counts, cost figures and assumptions, and - only if you keep it - a preview of up to 280 characters of the prompt. Share links you choose to create.',
            'Support requests: the subject and message you send, with the technical context shown to you before sending (app version, browser and screen size).',
            'Command-line and MCP keys: the label you give each key, a SHA-256 hash of the key (never the key itself), its first characters, and when it was last used.',
            'Technical data: our hosting and database providers record IP addresses and request logs to operate and secure the service.',
          ],
        },
      ],
    },
    {
      id: 'notcollect',
      title: 'What we do not collect',
      blocks: [
        {
          list: [
            'The text of your prompts, apart from the optional 280-character preview on an estimate you save. Counting and pricing happen in your browser; the tokenticks command-line tool and MCP server run on your own machine.',
            'Datasets you load into Batch and usage exports you load into Reconcile. They are read in your browser and never uploaded.',
            'Analytics, advertising or cross-site tracking data. The app loads no third-party trackers.',
          ],
        },
      ],
    },
    {
      id: 'use',
      title: 'How we use information, and our legal bases',
      blocks: [
        {
          list: [
            'To provide the service: create and secure your account, save your estimates and share links, and apply your plan.',
            'To take payment and manage subscriptions, through Lemon Squeezy.',
            'To answer support requests.',
            'To check licence keys used by the command-line tool and MCP server.',
            'To keep the service secure and prevent fraud and abuse.',
            'To send service messages, such as sign-in links and replies to your requests. We send marketing email only if you have agreed to it.',
          ],
        },
        'Under India\'s Digital Personal Data Protection Act, 2023, we process personal data on the basis of the consent you give when you create an account, and for the legitimate uses the Act permits, such as data you provide voluntarily for a purpose and compliance with law. Under the GDPR, our legal bases are performance of our contract with you, our legitimate interests in securing and improving the service, your consent where we ask for it, and legal obligations such as tax records.',
        'We do not make decisions about you by automated means that have legal or similarly significant effects, and we do not profile you.',
      ],
    },
    {
      id: 'providers',
      title: 'Service providers we use',
      blocks: [
        'These providers process personal data on our behalf, only on our instructions and under their data-processing terms. Lemon Squeezy is the merchant of record for payments and processes payment data as an independent controller under its own privacy policy.',
        {
          table: {
            head: ['Provider', 'What for', 'Where'],
            rows: [
              ['Supabase', 'Database, sign-in and server functions', 'South Korea (Seoul)'],
              ['Lemon Squeezy', 'Payments, tax, invoices and subscriptions (merchant of record)', 'United States'],
              ['Resend', 'Delivering support-request notifications', 'United States'],
              ['Zoho Desk', 'Handling support conversations', 'Zoho data centre for our account'],
              ['Google', 'Sign in with Google, only if you use it', 'Global'],
              ['GitHub and npm', 'Hosting this website; distributing the command-line tool', 'United States'],
            ],
          },
        },
      ],
    },
    {
      id: 'transfers',
      title: 'International transfers',
      blocks: [
        'Your account data is stored in South Korea, and some providers are in the United States. Personal data may therefore be processed outside the country where you live.',
        'For India, such transfers are permitted under Section 16 of the Digital Personal Data Protection Act, 2023, except to countries the Government of India restricts. For the European Economic Area and the United Kingdom, South Korea is recognised as providing adequate protection, and transfers to the United States rely on the EU-US Data Privacy Framework where the provider is certified, or on Standard Contractual Clauses and the UK Addendum.',
      ],
    },
    {
      id: 'retention',
      title: 'How long we keep data',
      blocks: [
        {
          list: [
            'Account, profile, saved estimates, share links, keys and support requests stored with us: until you delete your account.',
            'Billing: Lemon Squeezy keeps invoices and tax records for as long as the law requires. Our own copy of billing events is deleted with your account.',
            'Support conversations in our help desk: as long as needed to resolve the request and meet legal obligations, then deleted.',
            'Backups and logs: they expire automatically on our providers\' schedules.',
          ],
        },
        'You can delete your account at any time from your profile menu (Delete account). This removes your account and the data listed above straight away and cancels any active subscription.',
      ],
    },
    {
      id: 'security',
      title: 'How we protect data',
      blocks: [
        'All traffic is encrypted in transit. The database enforces row-level security, so each account can reach only its own records. Licence keys are stored only as hashes, and payment cards never touch our systems.',
        'If a personal data breach affects you, we will tell you and notify the authorities the law requires, including the Data Protection Board of India and, where applicable, EU and UK supervisory authorities.',
      ],
    },
    {
      id: 'terms',
      title: 'Using TokenTicks: accounts, plans and availability',
      blocks: [
        {
          list: [
            'Acceptance. By creating an account - with email and password, a magic link or Google - you accept this policy and these terms. If you do not agree, please do not create an account; the token counter works without one.',
            'Conduct and suspension. We may suspend or close an account used for misconduct, including fraud, abuse of the service or its payment system, attempts to break its security, sharing licence keys beyond their intended use, or unlawful activity. Where appropriate we will tell you why and let you respond. Suspension does not remove your data-protection rights.',
            'Pricing and plans. Prices, plans and the features they include may change, subject to conditions such as changes in our costs, taxes or AI vendors\' prices. We will give reasonable notice before a price change applies to your next renewal, and you may cancel before it does.',
            'Refunds. Plan payments are non-refundable, including for partial billing periods, except where the law of your country requires a refund. If you cancel, your plan continues until the end of the period you have already paid for. Payments are processed by Lemon Squeezy as merchant of record.',
            'Availability. We aim to keep TokenTicks available, but it may be temporarily limited or halted by events beyond our reasonable control, such as natural disasters, pandemics, war, civil unrest, government action, sanctions, internet or power outages, or failures of the providers we rely on. We are not liable for delays or interruptions caused by such events, and we will restore the service as soon as reasonably possible.',
            'Estimates. Token counts and costs are planning estimates. Check each vendor\'s own prices before committing a budget.',
            'Governing law. These terms are governed by the laws of India. This does not remove any protection you have under the mandatory consumer or data-protection laws of the country where you live.',
          ],
        },
      ],
    },
    {
      id: 'rights-india',
      title: 'Your rights in India',
      blocks: [
        'Under the Digital Personal Data Protection Act, 2023 and its Rules, you have the right to:',
        {
          list: [
            'obtain a summary of the personal data we process about you and of our processing, and the identities of those we share it with;',
            'have your personal data corrected, completed, updated or erased;',
            'withdraw your consent at any time, as easily as you gave it, by deleting your account or writing to us;',
            'have your grievances addressed by our Grievance Officer within the time the Rules prescribe;',
            'nominate another person to exercise your rights if you die or become unable to do so.',
          ],
        },
        'If you are not satisfied with our response, you may complain to the Data Protection Board of India. We also follow the Information Technology Act, 2000 and its rules on reasonable security practices. As the Act requires, please give accurate information and do not file false or frivolous complaints.',
      ],
    },
    {
      id: 'rights-eu',
      title: 'Your rights in the European Economic Area and the United Kingdom',
      blocks: [
        'Under the GDPR and the UK GDPR you have the right to access your personal data, to have it corrected, to have it erased, to restrict or object to its processing, to receive it in a portable format, and to withdraw consent at any time. You also have the right not to be subject to decisions based solely on automated processing.',
        'We answer requests within one month. You may complain to the data protection authority where you live or work - in the UK, the Information Commissioner\'s Office.',
      ],
    },
    {
      id: 'rights-us',
      title: 'Your rights in the United States',
      blocks: [
        'If you live in California (under the CCPA as amended by the CPRA) or in another US state with a consumer privacy law, such as Virginia, Colorado, Connecticut, Utah or Texas, you have the right to know what personal information we collect and how we use it, to access it, to correct it and to delete it, and not to be discriminated against for using these rights.',
        'In the last 12 months we have collected identifiers (such as name and email), commercial information (plan and billing status) and limited internet activity (request logs). We do not sell or share personal information for cross-context behavioural advertising, and we do not use sensitive personal information to infer characteristics about you. There is therefore nothing to opt out of; we honour Global Privacy Control signals regardless. An authorised agent may make a request on your behalf.',
      ],
    },
    {
      id: 'rights-other',
      title: 'Your rights elsewhere',
      blocks: [
        {
          list: [
            'Brazil (LGPD): the rights in Article 18, including confirmation, access, correction, anonymisation, portability and deletion; you may complain to the ANPD.',
            'Canada (PIPEDA and provincial laws): access and correction; you may complain to the Office of the Privacy Commissioner of Canada.',
            'Australia (Privacy Act 1988): access and correction under the Australian Privacy Principles; you may complain to the OAIC.',
            'Singapore (PDPA), Japan (APPI), South Korea (PIPA) and others: the access, correction and deletion rights your local law gives you.',
          ],
        },
        'Wherever you live, you can ask us to access, correct or delete your data at {{email}}, and we will respond in line with your local law.',
      ],
    },
    {
      id: 'storage',
      title: 'Cookies and local storage',
      blocks: [
        'We do not use advertising or analytics cookies. The app keeps a few items in your browser\'s local storage so it works as you left it: your prompt draft, your chosen model and comparison, your cost assumptions, your colour theme, the language of this page, and, when you are signed in, your sign-in session.',
        'These items stay on your device and are strictly necessary for the features you use, so no consent banner is needed. You can clear them at any time in your browser settings.',
      ],
    },
    {
      id: 'children',
      title: 'Children',
      blocks: [
        'TokenTicks is not intended for anyone under 18. We do not knowingly process the personal data of children; Indian law requires verifiable parental consent for anyone under 18. If you believe a child has created an account, contact us and we will delete it.',
      ],
    },
    {
      id: 'changes',
      title: 'Changes to this policy',
      blocks: [
        'When we change this policy we update the effective date at the top. If a change is material, we will tell you by email or in the app before it takes effect. Earlier versions are available on request.',
      ],
    },
    {
      id: 'contact',
      title: 'Grievance officer and contact',
      blocks: [
        'Grievance Officer and privacy contact: {{grievance}}, {{email}}.',
        'Postal address: {{address}}.',
        'We acknowledge requests promptly and respond within one month, or sooner where your local law requires. If you are not satisfied, you may complain to the Data Protection Board of India or to the data protection authority where you live.',
      ],
    },
  ],
};
