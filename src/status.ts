/**
 * status.ts — idea status type and state-machine transition rules.
 *
 * Pure module. No I/O, no Mongo. Imported by ideas-state.ts.
 */

export type Status =
  | "extracted"
  | "queued"
  | "building"
  | "built"
  | "parked"
  | "rejected"
  | "needs_human";

export const ALL_STATUSES: readonly Status[] = [
  "extracted",
  "queued",
  "building",
  "built",
  "parked",
  "rejected",
  "needs_human",
];

export const ALLOWED_TRANSITIONS: Record<Status, readonly Status[]> = {
  extracted:   ["queued", "rejected", "needs_human"],
  queued:      ["building", "extracted", "rejected", "parked"],
  building:    ["built", "parked", "needs_human", "queued"],
  built:       [],
  parked:      ["queued", "rejected"],
  rejected:    [],
  needs_human: ["queued", "rejected"],
};

export class IllegalTransitionError extends Error {
  constructor(
    public readonly from: Status,
    public readonly to: Status,
    public readonly allowed: readonly Status[],
  ) {
    super(`Illegal transition: ${from} → ${to}. Allowed from "${from}": [${allowed.join(", ")}]`);
    this.name = "IllegalTransitionError";
  }
}

export function isValidStatus(s: string): s is Status {
  return (ALL_STATUSES as readonly string[]).includes(s);
}

export function isValidTransition(from: Status, to: Status): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertValidTransition(from: Status, to: Status): void {
  if (!isValidTransition(from, to)) {
    throw new IllegalTransitionError(from, to, ALLOWED_TRANSITIONS[from]);
  }
}
