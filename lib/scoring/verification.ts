import type { Asset, VerificationMethod } from "../schema/asset";
import type { Reason, SliceResult } from "./types";

export const VERIFICATION_TESTS = [
  {
    id: "independent",
    label: "Independent",
    question: "Is reserve data produced by someone other than the issuer?",
    pass: (m: VerificationMethod) => m.independent,
    failText: "Reserve data is not independent of the issuer.",
  },
  {
    id: "asset-level",
    label: "Asset-level",
    question: "Are holdings reported per asset, not just as a total?",
    pass: (m: VerificationMethod) => m.assetLevel,
    failText: "Reserves are reported in aggregate, not asset by asset.",
  },
  {
    id: "daily",
    label: "Daily",
    question: "Is it updated at least once a day?",
    pass: (m: VerificationMethod) => m.frequency === "realtime" || m.frequency === "daily",
    failText: "Reserves are checked less than daily.",
  },
  {
    id: "verifiable",
    label: "Verifiable",
    question: "Can anyone cryptographically check the data's origin?",
    pass: (m: VerificationMethod) => m.cryptographicallyVerifiable,
    failText: "Reserve data can't be cryptographically verified.",
  },
  {
    id: "onchain",
    label: "Onchain",
    question: "Is the result published onchain?",
    pass: (m: VerificationMethod) => m.onchain,
    failText: "Reserve data isn't published onchain.",
  },
] as const;

export function passCount(m: VerificationMethod): number {
  return VERIFICATION_TESTS.filter((t) => t.pass(m)).length;
}

export function bestMethod(asset: Asset): VerificationMethod | undefined {
  return [...asset.verification.methods].sort((a, b) => passCount(b) - passCount(a))[0];
}

export function scoreVerification(asset: Asset): SliceResult {
  const best = bestMethod(asset);
  const evidence = { tab: "verification" as const, label: "Verification tests" };

  if (!best || asset.verification.methods.every((m) => m.type === "self-reported")) {
    const text = best ? "Reserves are only self-reported by the issuer." : "No reserve verification was found.";
    return {
      slice: "verification",
      color: "red",
      headline: text,
      reasons: [{ id: "verification.none", slice: "verification", color: "red", text, critical: true, evidence }],
    };
  }

  const passed = passCount(best);
  const color = passed === 5 ? "green" : passed >= 3 ? "yellow" : "red";
  const reasons: Reason[] =
    color === "green"
      ? []
      : VERIFICATION_TESTS.filter((t) => !t.pass(best)).map((t) => ({
          id: `verification.${t.id}`,
          slice: "verification",
          color,
          text: t.failText,
          critical: false,
          evidence,
        }));

  return {
    slice: "verification",
    color,
    headline: color === "green" ? "Reserves pass all five transparency tests." : reasons[0].text,
    reasons,
  };
}
