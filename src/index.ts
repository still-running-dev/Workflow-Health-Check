/**
 * stillrunning.dev — Workflow Health Check
 *
 * Public entry point. Everything here runs in the browser: no network calls, no
 * storage, nothing leaves the page. The only thing the server ever learns is
 * three counters (pastes, results shown, emails), sent separately.
 *
 * Check order is deliberately inverted from the original spec. Zero-write and
 * credential expiry lead because they are the two nobody else does; error
 * handling is last because six free tools already ship it.
 *
 * The exports below are the entire public API as of 2.0.0 — see CHANGELOG.md
 * for what this release removed. Anything not exported here is an
 * implementation detail that can change without a major version.
 */

import type { AnalysisResult, Finding, Workflow } from './core/model.js';
import { SEVERITY_ORDER } from './core/model.js';
import { checkZeroWrite } from './core/checks/zero-write.js';
import { checkCadence, checkCredentialExpiry, checkErrorHandling } from './core/checks/others.js';
import { checkProtections } from './core/checks/protections.js';
import { isN8nWorkflow, parseN8n } from './adapters/n8n.js';
import { isMakeBlueprint, parseMake } from './adapters/make.js';

/** The shape `analyze()` returns, stamped as `AnalysisResult.schemaVersion`. */
export const SCHEMA_VERSION = 1;

class UnknownFormatError extends Error {
  constructor() {
    super(
      'That does not look like an n8n workflow or a Make blueprint. Export from n8n with "Download" or from Make with "Export Blueprint", then paste the whole file.',
    );
    this.name = 'UnknownFormatError';
  }
}

function parseWorkflow(input: string | object): Workflow {
  const raw = typeof input === 'string' ? JSON.parse(input) : input;
  if (isN8nWorkflow(raw)) return parseN8n(raw);
  if (isMakeBlueprint(raw)) return parseMake(raw);
  throw new UnknownFormatError();
}

/** Order matters: this is what the user reads top to bottom. */
const CHECKS: Array<(wf: Workflow) => Finding[]> = [
  checkZeroWrite,
  checkCredentialExpiry,
  checkCadence,
  checkErrorHandling,
];

export function analyze(input: string | object): AnalysisResult {
  const wf = parseWorkflow(input);
  const findings = CHECKS.flatMap((c) => c(wf)).sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );

  return {
    platform: wf.platform,
    workflowName: wf.name,
    nodeCount: wf.nodes.filter((n) => n.role !== 'note' && !n.disabled).length,
    findings,
    protections: checkProtections(wf),
    parseNotes: wf.parseNotes,
    schemaVersion: SCHEMA_VERSION,
    stats: {
      writeNodes: wf.nodes.filter((n) => n.role === 'write' && !n.disabled).length,
      oauthCredentials: wf.nodes
        .flatMap((n) => n.credentials)
        .filter((c) => c.authKind === 'oauth2').length,
      triggers: wf.triggerIds.length,
      staticKeyCredentials: wf.nodes
        .flatMap((n) => n.credentials)
        .filter((c) => c.authKind === 'api-key' || c.authKind === 'basic').length,
    },
  };
}

export type { Finding, Platform, Severity } from './core/model.js';
