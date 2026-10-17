import type { Reason } from "./types";

// What an issuer could change to clear each finding, keyed by reason id. The longest matching prefix wins,
// so "control.no-delay.upgrade" can say something more specific than "control.no-delay".
const FIXES: Record<string, string> = {
  "control.eoa": "Move this power from a single key to a multisig that needs at least 3 signers and at least half of them, ideally behind a timelock.",
  "control.weak-safe": "Raise the multisig to at least 3 required signers and at least half of all owners, or put it behind a timelock.",
  "control.bounded": "The onchain limit helps. Holding the power in a strong multisig as well would clear this.",
  "control.no-delay": "Put this power behind a timelock, or add onchain limits such as caps and rate limits.",
  "control.no-delay.upgrade": "Put upgrades behind a timelock of at least 7 days.",
  "control.no-delay.admin": "Put role changes behind a timelock of at least 7 days.",
  "control.short-delay": "Lengthen the upgrade timelock to at least 7 days.",
  "control.weak-safe-timelock": "Have the timelock's proposer be a multisig that needs at least 3 signers and at least half of them.",
  "control.safe-modules": "Remove Safe modules, or publish what each one can do and who controls it.",
  "control.bridge": "Publish the bridge's configuration (who verifies messages, mint rate limits) and hold its admin in a strong multisig.",
  "control.unverified": "Verify the contract's source code on the block explorer.",

  "exit-window": "Put upgrades and role changes behind a timelock at least 7 days longer than redemption takes.",
  "exit-window.unknown-exit": "Publish the redemption settlement time, so holders can tell whether they can leave before a change.",

  "pricing.none": "Publish the NAV onchain.",
  "pricing.eoa": "Have the NAV written by a strong multisig or an oracle network, and cap how far one update can move it.",
  "pricing.eoa-bounded": "Have the NAV written by a strong multisig or an oracle network as well as keeping the cap.",
  "pricing.issuer-writer": "Have an independent oracle network publish the NAV instead of the issuer's own multisig.",
  "pricing.single-provider": "Source the NAV from the fund administrator or custodian, not the issuer.",
  "pricing.issuer-origin": "Source the NAV from the fund administrator or custodian, not the issuer.",
  "pricing.cadence": "Update the onchain NAV at least daily.",
  "pricing.history": "Keep every NAV update onchain (round history), not only the latest value.",
  "pricing.stale": "Restore the scheduled NAV updates.",
  "pricing.late": "Restore the scheduled NAV updates.",
  "pricing.defi-fixed": "Lending markets should read a NAV feed instead of assuming a fixed $1.",
  "pricing.valuer-unknown": "Name who values the loans.",
  "pricing.valuer-manager": "Appoint an independent valuation agent to check the manager's marks.",
  "pricing.impairment-policy": "Publish the policy for writing down loans that stop paying.",

  "verification.none": "Have an independent firm check the reserves, and publish the report.",
  "verification.independent": "Have an auditor, administrator, custodian or attestation firm check the reserves.",
  "verification.asset-level": "Publish holdings line by line (loan by loan for credit).",
  "verification.weekly": "Publish the reserve report at least weekly.",
  "verification.public": "Make the reserve report itself public, not only the fact that one exists.",
  "verification.reconciles": "Publish the total assets backing the token, with a date, so anyone can match it to onchain supply on every chain.",
  "verification.portfolio.loan-level": "Publish loan-by-loan data: borrower or sector, size, rate, maturity and status.",
  "verification.portfolio.concentration": "Publish the share of the book lent to the largest borrower.",
  "verification.portfolio.collateral": "Publish what secures the loans and how much collateral backs them.",
  "verification.portfolio.loss-history": "Publish the history of defaults, impairments and recoveries.",

  "exit.no-redemption": "Offer and document a way to redeem with the issuer.",
  "exit.settlement-unknown": "Publish how long redemptions take to settle.",
  "exit.slow": "Shorten redemption settlement to T+5 or faster.",
  "exit.t5": "Shorten redemption settlement to T+1.",
  "exit.discretion": "Publish the limits on when and for how long redemptions can be suspended.",
  "exit.gates-unknown": "Publish the terms for suspending or gating redemptions.",
  "exit.approval": "Let any eligible holder redeem without case-by-case approval.",
  "exit.no-instant": "Fund an onchain redemption facility, or DEX liquidity of at least 2% of supply.",
  "exit.instant-unmeasured": "Expose the facility's available liquidity onchain so its capacity can be measured.",

  "disclosure.legal-entity": "Publish the issuing entity's legal name and jurisdiction.",
  "disclosure.regulator": "Say who regulates or registered the vehicle, or that no one does.",
  "disclosure.custodian": "Name the custodian of the underlying assets.",
  "disclosure.fund-administrator": "Name the fund administrator.",
  "disclosure.auditor": "Name the financial-statement auditor.",
  "disclosure.offering-document": "Publish the offering memorandum, or a redacted version of it.",
  "disclosure.audited-financials": "Publish the audited financial statements.",
};

export function fixFor(id: string): string | undefined {
  const parts = id.split(".");
  for (let n = parts.length; n > 0; n--) {
    const fix = FIXES[parts.slice(0, n).join(".")];
    if (fix) return fix;
  }
  return undefined;
}

export function withFix(reason: Reason): Reason {
  return reason.fix ? reason : { ...reason, fix: fixFor(reason.id) };
}
