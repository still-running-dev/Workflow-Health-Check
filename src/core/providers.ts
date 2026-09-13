/**
 * Provider expiry table.
 *
 * This is a DATA ASSET, not a switch statement. It is the seed of the paid
 * product: the free tool reads it to say "this could expire", the paid product
 * reads the same table plus a live connection to say "this expires Tuesday".
 *
 * Rules for editing this file:
 *  1. Every `window` and every `condition` needs a `sources` URL. No folklore.
 *  2. If we cannot know the condition from a pasted JSON, say so in `certainty:
 *     'conditional'` and give `howToCheck`. Never predict what we cannot see.
 *  3. Adding a provider must never require touching a check.
 */

import type { AuthKind } from './model.js';

export interface ExpiryRule {
  /** The situation in which this window applies, in plain words. */
  condition: string;
  /** 'certain'     - true for every connection of this type.
   *  'conditional' - depends on something not visible in the export. */
  certainty: 'certain' | 'conditional';
  /** e.g. '7 days', '60 days', 'never'. */
  window: string;
  detail: string;
  /** How the reader confirms it themselves, in under a minute. */
  howToCheck?: string;
}

export interface Provider {
  id: string;
  displayName: string;
  /** Substring matchers against the raw credential type, lower-cased. */
  match: {
    n8n: string[];
    make: string[];
  };
  defaultAuthKind: AuthKind;
  /** Can the platform silently refresh this without a human? */
  autoRefreshable: boolean;
  rules: ExpiryRule[];
  sources: string[];
  /** Complaint Mine Log row numbers backing this entry. Evidence, not vibes. */
  complaintLogRows?: number[];
}

export const PROVIDERS: Provider[] = [
  {
    id: 'google',
    displayName: 'Google',
    match: {
      n8n: [
        'googlesheetsoauth2',
        'googledriveoauth2',
        'gmailoauth2',
        'googlecalendaroauth2',
        'googledocsoauth2',
        'googleoauth2',
        'gsuiteadminoauth2',
        'googlebigqueryoauth2',
        'googleanalyticsoauth2',
      ],
      make: ['account:google', 'google'],
    },
    defaultAuthKind: 'oauth2',
    autoRefreshable: true,
    rules: [
      {
        condition:
          'The Google Cloud project behind this connection has its OAuth consent screen set to "Testing" with an External user type',
        certainty: 'conditional',
        window: '7 days',
        detail:
          'Google issues a refresh token that expires 7 days after consent. When it dies the platform gets invalid_grant, the trigger stops firing, and nothing throws a run-level error because there is no run.',
        howToCheck:
          'Google Cloud Console -> APIs & Services -> OAuth consent screen. If Publishing status says "Testing", this connection dies every 7 days. If it says "In production", it does not.',
      },
      {
        condition: 'The consent screen is published to production and verified',
        certainty: 'conditional',
        window: 'indefinite, with five exceptions',
        detail:
          'Effectively permanent unless: the token goes unused for six months, the user revokes access, the user changes their password while Gmail scopes are granted, the per-user token cap is exceeded, or the app loses verification for sensitive scopes.',
        howToCheck:
          'The six-month rule matters here: a workflow that stops running also stops refreshing, so a quiet workflow eventually becomes a dead credential.',
      },
    ],
    sources: [
      'https://developers.google.com/identity/protocols/oauth2',
      'https://support.google.com/cloud/answer/15549945',
    ],
    complaintLogRows: [9, 11, 12, 40, 41],
  },
  {
    id: 'microsoft',
    displayName: 'Microsoft',
    match: {
      n8n: [
        'microsoftoauth2',
        'microsoftoutlookoauth2',
        'microsoftexceloauth2',
        'microsoftonedriveoauth2',
        'microsoftsharepointoauth2',
        'microsoftteamsoauth2',
        'microsoftgraphsecurityoauth2',
        'azure',
      ],
      make: ['account:microsoft', 'microsoft', 'office365'],
    },
    defaultAuthKind: 'oauth2',
    autoRefreshable: true,
    rules: [
      {
        condition: 'Normal case — the workflow runs at least every 90 days',
        certainty: 'certain',
        window: 'effectively indefinite',
        detail:
          'Microsoft refresh tokens default to a 90-day inactivity limit and replace themselves every time they are used. A workflow that runs daily keeps resetting the clock, so this is lower risk than Google.',
      },
      {
        condition: 'The workflow stops running for 90 days',
        certainty: 'certain',
        window: '90 days of inactivity',
        detail:
          'The refresh token expires from disuse. Note the trap: a workflow that already went quiet for another reason quietly becomes unrecoverable too, so a short outage turns into a manual re-auth.',
      },
      {
        condition: 'The tenant applies a Conditional Access sign-in frequency policy',
        certainty: 'conditional',
        window: 'whatever the policy says',
        detail:
          'Since January 2021 refresh lifetimes are no longer configurable through token lifetime policies, but Conditional Access sign-in frequency still forces re-authentication on a schedule the client cannot see.',
        howToCheck:
          'Ask the tenant admin whether a sign-in frequency policy applies to this app. It is not visible from the automation side.',
      },
    ],
    sources: [
      'https://learn.microsoft.com/en-us/entra/identity-platform/refresh-tokens',
      'https://learn.microsoft.com/en-us/entra/identity-platform/configurable-token-lifetimes',
    ],
    complaintLogRows: [14],
  },
  {
    id: 'meta-whatsapp',
    displayName: 'WhatsApp / Meta',
    match: {
      n8n: ['whatsapp', 'facebookgraph', 'facebookapp'],
      make: ['account:whatsapp', 'account:facebook', 'whatsapp', 'facebook'],
    },
    defaultAuthKind: 'api-key',
    // The decisive fact: this is a bearer token pasted by hand. Nothing refreshes it.
    autoRefreshable: false,
    rules: [
      {
        condition: 'The token was copied from the Meta app dashboard for testing',
        certainty: 'conditional',
        window: 'under 24 hours',
        detail:
          'Temporary access tokens expire in less than a day. Anyone who set this up while testing and never went back has a workflow that died the next morning.',
        howToCheck:
          'If the token came from the "Temporary access token" box on the app dashboard, it is already gone. Only a System User token survives.',
      },
      {
        condition: 'A System User token was generated with a 60-day expiry',
        certainty: 'conditional',
        window: '60 days',
        detail:
          'Meta lets you pick the expiry when generating a System User token. 60 days is the common choice and there is no warning before it lapses.',
        howToCheck:
          'Meta Business Settings -> Users -> System Users -> your user -> the token list shows the expiry you chose.',
      },
      {
        condition: 'A System User token was generated with no expiry',
        certainty: 'conditional',
        window: 'never',
        detail: 'Permanent until someone revokes it manually.',
      },
    ],
    sources: [
      'https://developers.facebook.com/blog/post/2022/12/05/auth-tokens/',
      'https://community.n8n.io/t/whatsapp-token-expires/182022',
    ],
    complaintLogRows: [13],
  },
];

/** Credential types that never expire on a clock — they get revoked instead. */
export const STATIC_KEY_HINTS = [
  'apikey',
  'api',
  'token',
  'httpheaderauth',
  'httpbasicauth',
  'httpqueryauth',
  'smtp',
  'postgres',
  'mysql',
  'redis',
  'mongodb',
];

export function resolveProvider(rawType: string, platform: 'n8n' | 'make'): Provider | null {
  const needle = rawType.toLowerCase();
  for (const p of PROVIDERS) {
    for (const m of p.match[platform]) {
      if (needle.includes(m)) return p;
    }
  }
  return null;
}

/** Best-effort auth kind when no provider matches. */
export function guessAuthKind(rawType: string): AuthKind {
  const t = rawType.toLowerCase();
  if (t.includes('oauth2') || t.includes('oauth')) return 'oauth2';
  if (t.includes('basicauth')) return 'basic';
  if (t.includes('serviceaccount') || t === 'googleapi') return 'service-account';
  if (STATIC_KEY_HINTS.some((h) => t.includes(h))) return 'api-key';
  return 'unknown';
}
