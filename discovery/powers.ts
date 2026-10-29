import type { Address } from "viem";
import type { Permission, Power } from "@/lib/schema/discovered";
import type { Context } from "./context";
import type { PrivilegedFunction } from "./sources";

const RULES: [RegExp, Power][] = [
  [/^(upgradeTo|upgradeToAndCall|setImplementation|setTarget)$/, "upgrade"],
  [
    /^(setDSService|grantRole|revokeRole|renounceRole|setRoles?|addRole|removeRole|setServiceOwner|transferOwnership|renounceOwnership|acceptOwnership|setOwner|setAdmin|changeAdmin)$/,
    "admin",
  ],
  [/^(mint|issue|bulkIssuance)/i, "mint"],
  [/^(seize|omnibusSeize|forceTransfer|forcedTransfer|clawback|reallocate)/i, "force-transfer"],
  [/^(burn|omnibusBurn|bulkBurn|burnFrom|destroy|redeemFrom)/i, "burn-from"],
  [/^(set|update)(Price|Nav|Rate|ExchangeRate|Oracle)/, "set-price"],
  [/^(pause|unpause)$/, "pause"],
  [/(freeze|unfreeze|blacklist|blocklist|^ban|LockFor|LockRecord|^lockTokens|^unlockTokens)/i, "freeze"],
  [
    /(allowlist|whitelist|compliance|Investor|Country|Attribute|Wallet|Limit|Cap$|Feature|^setAll$|Percentage|Period|Holdings|Flowback|Accredited|Securities|BackDating|FullTransfer|MinUSTokens|MinEUTokens)/,
    "set-compliance",
  ],
];

export function powerForFunction(name: string): Power {
  return RULES.find(([re]) => re.test(name))?.[1] ?? "unclassified";
}

/**
 * Turns privileged functions into permissions, one row per (power, modifier, holder).
 * `holdersFor` returns undefined for modifiers that only let other contracts call (onlyToken etc.).
 */
export function mapFunctions(
  ctx: Context,
  contractName: string,
  fns: PrivilegedFunction[],
  holdersFor: (modifier: string) => { holders: Address[]; label: string } | undefined,
  ignore: string[] = [],
): Permission[] {
  const groups = new Map<string, { power: Power; modifier: string; fns: string[] }>();
  for (const fn of fns) {
    if (ignore.includes(fn.name)) continue;
    for (const modifier of fn.modifiers) {
      if (!holdersFor(modifier)) continue;
      const power = powerForFunction(fn.name);
      const key = `${power}|${modifier}`;
      const g = groups.get(key) ?? { power, modifier, fns: [] };
      g.fns.push(fn.name);
      groups.set(key, g);
    }
  }
  const permissions: Permission[] = [];
  for (const g of groups.values()) {
    const who = holdersFor(g.modifier)!;
    const names = g.fns.length > 3 ? `${g.fns.slice(0, 3).join(", ")} +${g.fns.length - 3} more` : g.fns.join(", ");
    ctx.grant(
      permissions,
      g.power,
      who.holders,
      `${contractName}.${names} · ${g.modifier}${who.label ? ` (${who.label})` : ""}`,
    );
  }
  return permissions;
}
