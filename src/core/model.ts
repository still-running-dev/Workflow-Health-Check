/**
 * Platform-neutral workflow model.
 *
 * Every adapter (n8n, Make, and whatever comes next) produces this shape and
 * nothing else. Every check consumes this shape and nothing else. No check may
 * import an adapter, and no check may branch on `platform` except to word a
 * message. That rule is the whole architecture constraint: adding platform
 * three is one new file in adapters/, zero changes in core/checks/.
 */

export type Platform = 'n8n' | 'make';

export type NodeRole =
  | 'trigger'
  | 'write'
  | 'read'
  | 'gate'
  | 'transform'
  | 'loop'
  | 'alert'
  | 'error-handler'
  | 'note'
  | 'other';

export type WriteKind =
  | 'append'
  | 'create'
  | 'update'
  | 'upsert'
  | 'delete'
  | 'send'
  | 'unknown';

export type AuthKind = 'oauth2' | 'api-key' | 'basic' | 'service-account' | 'unknown';

export interface CredentialRef {
  /** Raw platform identifier, e.g. 'googleSheetsOAuth2Api' or 'account:google'. */
  rawType: string;
  /** Provider id resolved against the provider table, e.g. 'google'. null = unknown. */
  providerId: string | null;
  authKind: AuthKind;
  /** The user's own label for the connection, if the export carries one. */
  label?: string;
}

/**
 * Why a node might hand nothing to the step after it. This is the heart of the
 * zero-write check: `null` means the node always emits something.
 */
export interface ZeroEmit {
  /** Plain-language cause, shown to the user verbatim. */
  cause: string;
  /**
   * 'structural'  - the shape guarantees it can emit zero (a filter, a search)
   * 'possible'    - depends on code we cannot read (a Code node, an expression)
   */
  certainty: 'structural' | 'possible';
}

export interface WorkflowNode {
  id: string;
  label: string;
  /** Raw platform type string, kept for messages and for debugging. */
  platformType: string;
  role: NodeRole;
  writeKind?: WriteKind;
  /** What the write lands in, when we can name it: 'Google Sheets', 'Airtable'. */
  writeTarget?: string;
  zeroEmit: ZeroEmit | null;
  credentials: CredentialRef[];
  errorHandling: {
    /** An error branch or error route leaves this node. */
    hasErrorBranch: boolean;
    retries: boolean;
    continueOnFail: boolean;
    /** n8n: forces an empty item downstream instead of stopping. */
    alwaysOutputData: boolean;
  };
  disabled: boolean;
}

export interface WorkflowEdge {
  from: string;
  to: string;
  /** 'main' | 'error' | a branch label such as 'false' or a Make route filter name. */
  channel: string;
  /**
   * A condition sitting on this edge that can stop everything downstream.
   * Make puts filters on the link; n8n puts them in nodes. Both normalise here.
   */
  gate: { label: string; cause: string } | null;
}

export interface Cadence {
  kind: 'schedule' | 'event' | 'manual' | 'unknown';
  /** Human text: 'every 15 minutes', 'on webhook call'. */
  description: string;
  /** Seconds between expected runs, when the export states it. */
  intervalSeconds: number | null;
  /**
   * True when the export tells us how often this SHOULD run. If false, nobody
   * can tell the difference between idle and dead.
   */
  expectedIntervalKnown: boolean;
}

export interface WorkflowErrorPolicy {
  /** A workflow-level handler: n8n settings.errorWorkflow, or an Error Trigger. */
  workflowLevelHandler: boolean;
  /** Make: metadata.scenario.dlq — are failed runs even stored? null = unknown. */
  storesFailedRuns: boolean | null;
  maxErrors: number | null;
  notes: string[];
}

export interface Workflow {
  platform: Platform;
  name: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  triggerIds: string[];
  cadence: Cadence;
  errorPolicy: WorkflowErrorPolicy;
  /** Adapter-level caveats, e.g. 'this export carries no connection data'. */
  parseNotes: string[];
}

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface Finding {
  checkId: 'zero-write' | 'credential-expiry' | 'no-cadence' | 'error-handling';
  severity: Severity;
  /** The node this is about. Findings always name a node — no vague advice. */
  nodeId: string | null;
  nodeLabel: string | null;
  title: string;
  /** What happens if this goes quiet. The spec's requirement, not decoration. */
  ifItGoesQuiet: string;
  detail: string;
  /** Only for things we cannot know from static JSON. Keeps us honest. */
  howToCheck?: string;
  sources?: string[];
}

export interface Protection {
  kind:
    | 'guarded-write'
    | 'error-handler'
    | 'known-cadence'
    | 'stores-failed-runs'
    | 'alert-branch'
    | 'retries';
  nodeId: string | null;
  nodeLabel: string | null;
  title: string;
  detail: string;
}

export interface AnalysisResult {
  platform: Platform;
  workflowName: string;
  nodeCount: number;
  findings: Finding[];
  /** What is holding it together. Shown when little or nothing is wrong. */
  protections: Protection[];
  parseNotes: string[];
  /**
   * Stamps every result with the shape it was produced under — see
   * `SCHEMA_VERSION` in `../index.ts`. A consumer that persists this output
   * (stillrunning-api does) can tell a stored result apart from what the
   * engine would produce today instead of silently reinterpreting it.
   */
  schemaVersion: number;
  /** Counters only. These three numbers are the Phase E scoreboard. */
  stats: {
    writeNodes: number;
    oauthCredentials: number;
    triggers: number;
    /** Credentials that do not expire on a clock. A zero here is information. */
    staticKeyCredentials: number;
  };
}

export const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};
