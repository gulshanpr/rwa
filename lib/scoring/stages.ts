import type { PowerRow } from "./control";
import type { AssetScore, SliceId } from "./types";
import type { Asset } from "../schema/asset";
import { disclosureChecks } from "./disclosure";

export type Stage = 0 | 1 | 2;

export const STAGE_NAMES: Record<Stage, string> = {
  0: "Trust us",
  1: "Verify us",
  2: "Prove it",
};

export interface Requirement {
  id: string;
  stage: 1 | 2;
  text: string;
  met: boolean;
  /** What the issuer could do to meet it. */
  fix: string;
}

export interface StageResult {
  stage: Stage;
  /** False when there is no discovery snapshot, so the stage can't be assessed. */
  assessed: boolean;
  requirements: Requirement[];
  /** Unmet requirements for the next stage, empty at Stage 2. */
  next: Requirement[];
}

const notRed = (score: Pick<AssetScore, "slices">, slice: SliceId) => score.slices[slice].color !== "red" && score.slices[slice].color !== "grey";
const green = (score: Pick<AssetScore, "slices">, slice: SliceId) => score.slices[slice].color === "green";

/**
 * Stages, after L2BEAT: a checklist an issuer can work through. Stage 1 means nothing critical rests on a
 * single key and the basics are public. Stage 2 means every scored slice is green. The legal slice will
 * join Stage 2 once it is assessed.
 */
export function stageOf(asset: Asset, score: Pick<AssetScore, "slices">, powers: PowerRow[], hasDiscovery: boolean): StageResult {
  const singleKey = powers.some(
    (r) => r.criticality === "critical" && r.color === "red" && (r.holder.holderClass === "eoa" || r.holder.holderClass === "unknown"),
  );
  const publicDisclosures = disclosureChecks(asset).filter((c) => c.status === "public").length;
  const { redemption } = asset.exit;

  const requirements: Requirement[] = [
    {
      id: "s1-no-single-key",
      stage: 1,
      text: "No single key can upgrade, mint, reprice, move the backing assets, seize tokens or grant roles without a limit.",
      met: hasDiscovery && !singleKey,
      fix: "Move every critical power to a strong multisig or a timelock, or cap it onchain.",
    },
    {
      id: "s1-nav",
      stage: 1,
      text: "The NAV slice is not red: a price exists onchain, it is fresh, and no single key writes it without a limit.",
      met: notRed(score, "pricing"),
      fix: "Publish the NAV onchain on schedule, written by a multisig or oracle network.",
    },
    {
      id: "s1-reserves",
      stage: 1,
      text: "The Reserves slice is not red: someone independent checks the reserves and passes at least 3 of 5 tests.",
      met: notRed(score, "verification"),
      fix: "Have an independent firm check reserves at least weekly and publish the report.",
    },
    {
      id: "s1-redemption",
      stage: 1,
      text: "Redemption is documented with a public settlement time.",
      met: redemption.available.value && redemption.settlement.status === "public",
      fix: "Publish how and how fast holders can redeem.",
    },
    {
      id: "s1-disclosure",
      stage: 1,
      text: "At least 4 of the 7 key disclosures are public.",
      met: publicDisclosures >= 4,
      fix: "Name the custodian, administrator and auditor, and publish the offering document.",
    },
    {
      id: "s2-control",
      stage: 2,
      text: "Control is green: critical powers sit with strong multisigs behind timelocks.",
      met: green(score, "control"),
      fix: "Put every critical power behind a timelock held by a strong multisig.",
    },
    {
      id: "s2-exit-window",
      stage: 2,
      text: "Exit window is green: holders can redeem and still have 7 days before any upgrade or role change takes effect.",
      met: green(score, "exit-window"),
      fix: "Make the upgrade timelock at least 7 days longer than redemption takes.",
    },
    {
      id: "s2-nav",
      stage: 2,
      text: "NAV is green: an independent oracle publishes administrator or custodian data at least daily.",
      met: green(score, "pricing"),
      fix: "Have an oracle network publish the administrator's NAV daily, with history onchain.",
    },
    {
      id: "s2-reserves",
      stage: 2,
      text: "Reserves are green: all five tests pass, including our own onchain reconciliation.",
      met: green(score, "verification"),
      fix: "Publish an independent, line-by-line reserve report weekly, with a total that matches onchain supply.",
    },
    {
      id: "s2-redemption",
      stage: 2,
      text: "Redemption is green: T+1 or faster for all eligible holders, plus a funded instant exit.",
      met: green(score, "exit"),
      fix: "Settle redemptions at T+1 and fund an onchain redemption facility.",
    },
    {
      id: "s2-disclosure",
      stage: 2,
      text: "Disclosure is green: the offering document and audited financials are public.",
      met: green(score, "disclosure"),
      fix: "Publish the offering memorandum and audited financial statements.",
    },
  ];

  const s1 = requirements.filter((r) => r.stage === 1);
  const s2 = requirements.filter((r) => r.stage === 2);
  const stage: Stage = s1.every((r) => r.met) ? (s2.every((r) => r.met) ? 2 : 1) : 0;
  const next = stage === 0 ? s1.filter((r) => !r.met) : stage === 1 ? s2.filter((r) => !r.met) : [];
  return { stage, assessed: hasDiscovery, requirements, next };
}
