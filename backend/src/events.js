import { randomUUID } from 'node:crypto';

export function appendEvent(proposal, type, payload, causeEventId = null) {
  const sequence = proposal.events.length + 1;
  const event = {
    schemaVersion: 1,
    eventId: randomUUID(),
    scenarioId: proposal.scenarioId,
    fixtureId: proposal.fixtureId ?? null,
    demoScene: proposal.demoScene ?? null,
    sequence,
    type,
    occurredAt: new Date().toISOString(),
    source: 'api',
    safe: proposal.transaction.safe,
    proposalId: proposal.proposalId,
    safeTxHash: proposal.safeTxHash ?? null,
    transactionHash: null,
    causeEventId,
    payload,
  };
  proposal.events.push(event);
  for (const listener of proposal.listeners) listener(event);
  return event;
}

export function subscribe(proposal, listener) {
  proposal.listeners.add(listener);
  return () => proposal.listeners.delete(listener);
}
