/**
 * What is holding this workflow together.
 *
 * Most pastes produce nothing critical. A blank result panel teaches the reader
 * that the tool found nothing useful, which is both untrue and the fastest way
 * to lose them. So we say what protects it, from the same analysis — never
 * invented, never padded. If none of these are true, we show nothing rather
 * than reach for filler.
 */

import type { Protection, Workflow } from '../model.js';
import { computeDominators, findAlertNodes, isGuarded } from './zero-write.js';

export function checkProtections(wf: Workflow): Protection[] {
  const out: Protection[] = [];
  const byId = new Map(wf.nodes.map((n) => [n.id, n]));

  if (wf.cadence.expectedIntervalKnown) {
    out.push({
      kind: 'known-cadence',
      nodeId: null,
      nodeLabel: null,
      title: `Runs ${wf.cadence.description}`,
      detail:
        'There is a stated rhythm here, so a missed run is measurable. Most of the workflows we see have no declared cadence at all, which is why nobody can tell idle from dead.',
    });
  }

  if (wf.errorPolicy.workflowLevelHandler) {
    out.push({
      kind: 'error-handler',
      nodeId: null,
      nodeLabel: null,
      title: 'A workflow-level error handler is set',
      detail:
        wf.platform === 'n8n'
          ? 'Anything that throws reaches your error workflow rather than sitting in the execution list waiting to be noticed.'
          : 'The scenario has an error route, so a failure goes somewhere instead of just stopping.',
    });
  }

  if (wf.errorPolicy.storesFailedRuns === true) {
    out.push({
      kind: 'stores-failed-runs',
      nodeId: null,
      nodeLabel: null,
      title: 'Incomplete executions are switched on',
      detail:
        'Make keeps failed runs so you can look at them and resume them. This is off by default, so somebody turned it on deliberately.',
    });
  }

  const alertIds = findAlertNodes(wf);
  const dom = computeDominators(wf);
  const writes = wf.nodes.filter(
    (n) => n.role === 'write' && !n.disabled && !alertIds.has(n.id),
  );

  for (const w of writes) {
    const dominators = dom.get(w.id) ?? new Set<string>();
    const gates = [...dominators]
      .filter((d) => d !== w.id)
      .map((d) => byId.get(d))
      .filter((n): n is NonNullable<typeof n> => !!n && !!n.zeroEmit);

    if (gates.length === 0) continue;
    if (!gates.every((g) => isGuarded(wf, g.id))) continue;

    out.push({
      kind: 'guarded-write',
      nodeId: w.id,
      nodeLabel: w.label,
      title: `"${w.label}" is covered if it gets nothing`,
      detail: `Every step that could starve it — ${gates
        .slice(0, 2)
        .map((g) => `"${g.label}"`)
        .join(', ')} — has somewhere else to send the empty case. The quiet run does not vanish.`,
    });
  }

  if (alertIds.size > 0) {
    const names = [...alertIds]
      .map((id) => byId.get(id)?.label)
      .filter(Boolean)
      .slice(0, 2);
    if (names.length) {
      out.push({
        kind: 'alert-branch',
        nodeId: null,
        nodeLabel: null,
        title: `Somebody gets told: ${names.map((n) => `"${n}"`).join(', ')}`,
        detail:
          'There is a message on a branch that only runs when something goes the wrong way. That is the difference between a quiet failure and a known one.',
      });
    }
  }

  const retried = wf.nodes.filter((n) => n.errorHandling.retries && !n.disabled);
  if (retried.length > 0) {
    out.push({
      kind: 'retries',
      nodeId: retried[0].id,
      nodeLabel: retried[0].label,
      title: `${retried.length} step${retried.length === 1 ? '' : 's'} retry before giving up`,
      detail: 'A blip on someone else\'s API does not end the run.',
    });
  }

  return out;
}
