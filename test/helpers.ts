/**
 * Builders for synthetic workflows, so tests read like the graphs they check.
 * Typed loosely on purpose: these produce raw platform JSON, which is untrusted
 * input by definition — the adapters are what give it a shape.
 */

export type Json = Record<string, any>;

export const node = (name: string, type: string, extra: Json = {}): Json => ({
  id: name,
  name,
  type,
  parameters: {},
  ...extra,
});

export const search = (name: string): Json =>
  node(name, 'n8n-nodes-base.airtable', { parameters: { operation: 'search' } });

export const write = (name: string): Json =>
  node(name, 'n8n-nodes-base.airtable', { parameters: { operation: 'create' } });

export const iff = (name: string): Json => node(name, 'n8n-nodes-base.if');

export const manualTrig = (name = 'Start'): Json =>
  node(name, 'n8n-nodes-base.manualTrigger');

export const hourlyTrig = (name = 'Every hour'): Json =>
  node(name, 'n8n-nodes-base.scheduleTrigger', {
    parameters: { rule: { interval: [{ field: 'hours', hoursInterval: 1 }] } },
  });

/** idx 1 targets an IF node's false output. */
export const link = (from: string, to: string, idx = 0): Json => ({
  [from]: {
    main:
      idx === 0
        ? [[{ node: to, type: 'main', index: 0 }]]
        : [[], [{ node: to, type: 'main', index: 0 }]],
  },
});

export const merge = (...objs: Json[]): Json => {
  const out: Json = {};
  for (const o of objs) {
    for (const [k, v] of Object.entries<any>(o)) {
      if (!out[k]) {
        out[k] = { main: v.main.map((g: any[]) => [...g]) };
        continue;
      }
      v.main.forEach((g: any[], i: number) => {
        out[k].main[i] = [...(out[k].main[i] ?? []), ...g];
      });
    }
  }
  return out;
};

export const wf = (
  name: string,
  nodes: Json[],
  connections: Json = {},
  settings: Json = {},
): Json => ({ name, nodes, connections, settings });
