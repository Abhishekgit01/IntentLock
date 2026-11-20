import type { PolicyDecision } from "./types";

export interface CatalogFixture {
  id: string;
  decision: PolicyDecision;
  kind: "allowed" | "policy" | "unsupported" | "timelock";
}

export const FIXTURES: CatalogFixture[] = [
  { id: "B01", decision: "ATTEST", kind: "allowed" },
  { id: "B03", decision: "ATTEST", kind: "allowed" },
  { id: "B04", decision: "ATTEST", kind: "allowed" },
  { id: "B06", decision: "ATTEST", kind: "allowed" },
  { id: "A01", decision: "REFUSE_POLICY", kind: "policy" },
  { id: "A02", decision: "REFUSE_POLICY", kind: "policy" },
  { id: "A03", decision: "ATTEST", kind: "allowed" },
  { id: "A04", decision: "ATTEST", kind: "allowed" },
  { id: "A05", decision: "ATTEST", kind: "allowed" },
  { id: "A06", decision: "ATTEST", kind: "allowed" },
  { id: "A07", decision: "ATTEST", kind: "allowed" },
  { id: "A08", decision: "ATTEST", kind: "allowed" },
  { id: "A09", decision: "ATTEST", kind: "allowed" },
  { id: "A13", decision: "ATTEST", kind: "allowed" },
  { id: "A15", decision: "ATTEST", kind: "allowed" },
  { id: "A16", decision: "ATTEST", kind: "allowed" },
  { id: "A19", decision: "ATTEST", kind: "allowed" },
  { id: "A20", decision: "ATTEST", kind: "allowed" },
  { id: "D01", decision: "REFUSE_UNSUPPORTED", kind: "unsupported" },
  { id: "D02", decision: "REFUSE_UNSUPPORTED", kind: "unsupported" },
  { id: "D03", decision: "REFUSE_UNSUPPORTED", kind: "unsupported" },
  { id: "D04", decision: "REFUSE_UNSUPPORTED", kind: "unsupported" },
  { id: "D05", decision: "ATTEST", kind: "allowed" },
  { id: "D06", decision: "ATTEST", kind: "allowed" },
  { id: "P01", decision: "REFUSE_POLICY", kind: "policy" },
  { id: "P02", decision: "REFUSE_POLICY", kind: "policy" },
  { id: "P03", decision: "REFUSE_POLICY", kind: "policy" },
  { id: "P04", decision: "REFUSE_POLICY", kind: "policy" },
  { id: "P05", decision: "REFUSE_UNSUPPORTED", kind: "unsupported" },
  { id: "H01", decision: "REFUSE_POLICY", kind: "policy" },
  { id: "H02", decision: "REFUSE_POLICY", kind: "policy" },
  { id: "H03", decision: "REFUSE_POLICY", kind: "policy" },
  { id: "H04", decision: "REFUSE_POLICY", kind: "policy" },
  { id: "H05", decision: "REFUSE_POLICY", kind: "policy" },
  { id: "H06", decision: "ATTEST_WITH_TIMELOCK", kind: "timelock" },
  { id: "H08", decision: "REFUSE_POLICY", kind: "policy" },
  { id: "F01", decision: "ATTEST", kind: "allowed" },
  { id: "H09", decision: "ATTEST_WITH_TIMELOCK", kind: "timelock" },
  { id: "H10", decision: "ATTEST_WITH_TIMELOCK", kind: "timelock" },
  { id: "H11", decision: "ATTEST", kind: "allowed" },
];

export const FIXTURE_COUNT = 40;

if (FIXTURES.length !== FIXTURE_COUNT) {
  throw new Error(`Expected ${FIXTURE_COUNT} fixture entries, found ${FIXTURES.length}`);
}
