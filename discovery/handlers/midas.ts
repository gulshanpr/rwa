import { getAddress, parseAbi, parseAbiItem, zeroHash, type Address, type Hex } from "viem";
import type { Context } from "../context";
import { deploymentBlock, scanLogs } from "../rpc";
import { addMapped, reportWarnings, roleHash } from "./mapped";

/**
 * Midas mTokens. One shared MidasAccessControl contract holds every product's roles. Upgrades go
 * through a timelock; granting a role does not. The price feed's safe setter caps the move, and
 * setRoundData on the same role skips that cap.
 */

const TOKEN_ABI = parseAbi([
  "function accessControl() view returns (address)",
  "function M_FONE_MINT_OPERATOR_ROLE() view returns (bytes32)",
  "function M_FONE_BURN_OPERATOR_ROLE() view returns (bytes32)",
  "function M_FONE_PAUSE_OPERATOR_ROLE() view returns (bytes32)",
  "function M_FONE_DEPOSIT_VAULT_ADMIN_ROLE() view returns (bytes32)",
  "function M_FONE_REDEMPTION_VAULT_ADMIN_ROLE() view returns (bytes32)",
  "function DEPOSIT_VAULT_ADMIN_ROLE() view returns (bytes32)",
  "function REDEMPTION_VAULT_ADMIN_ROLE() view returns (bytes32)",
  "function BLACKLIST_OPERATOR_ROLE() view returns (bytes32)",
  "function GREENLIST_OPERATOR_ROLE() view returns (bytes32)",
]);
const FEED_ABI = parseAbi(["function feedAdminRole() view returns (bytes32)", "function accessControl() view returns (address)"]);
const HAS_ROLE = parseAbi(["function hasRole(bytes32 role, address account) view returns (bool)"]);
const ROLE_GRANTED = parseAbiItem("event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)");
const ROLE_REVOKED = parseAbiItem("event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender)");

const VAULT_ADMIN_FNS = [
  "setInstantFee",
  "setInstantDailyLimit",
  "setFeeReceiver",
  "setTokensReceiver",
  "setRequestRedeemer",
  "setGreenlistEnable",
  "setMinAmount",
  "setMinMTokenAmountForFirstDeposit",
  "approveRequest",
  "safeApproveRequest",
  "withdrawToken",
];

async function membersOf(ctx: Context, controller: Address, roles: Hex[]): Promise<Map<string, Address[]>> {
  const wanted = new Set(roles.map((r) => r.toLowerCase()));
  const from = await deploymentBlock(ctx.c, controller, ctx.block);
  const logs = [...(await scanLogs(ctx.c, controller, ROLE_GRANTED, from, ctx.block)), ...(await scanLogs(ctx.c, controller, ROLE_REVOKED, from, ctx.block))];
  const pairs = new Map<string, { role: Hex; account: Address }>();
  for (const l of logs) {
    const role = l.args.role as Hex;
    if (!wanted.has(role.toLowerCase())) continue;
    const account = getAddress(l.args.account as string);
    pairs.set(`${role.toLowerCase()}|${account}`, { role, account });
  }
  const out = new Map<string, Address[]>();
  for (const { role, account } of pairs.values()) {
    if (await ctx.read<boolean>(controller, HAS_ROLE, "hasRole", [role, account])) {
      const key = role.toLowerCase();
      out.set(key, [...(out.get(key) ?? []), account].sort());
    }
  }
  return out;
}

const of = (m: Map<string, Address[]>, role: Hex) => m.get(role.toLowerCase()) ?? [];

export async function midas(ctx: Context, token: Address) {
  const warn: string[] = [];
  const controller = getAddress(await ctx.readOrThrow<Address>(token, TOKEN_ABI, "accessControl"));
  const readRole = async (fn: string) => (await ctx.read<Hex>(token, TOKEN_ABI, fn)) ?? roleHash(fn);
  const [mintRole, burnRole, pauseRole, depositAdminGeneric, redeemAdminGeneric, blacklistOps, greenlistOps] = await Promise.all([
    readRole("M_FONE_MINT_OPERATOR_ROLE"),
    readRole("M_FONE_BURN_OPERATOR_ROLE"),
    readRole("M_FONE_PAUSE_OPERATOR_ROLE"),
    readRole("DEPOSIT_VAULT_ADMIN_ROLE"),
    readRole("REDEMPTION_VAULT_ADMIN_ROLE"),
    readRole("BLACKLIST_OPERATOR_ROLE"),
    readRole("GREENLIST_OPERATOR_ROLE"),
  ]);
  // Product-specific vault-admin roles are declared on the price feed, not the token.
  const refEarly = ctx.asset.pricing.reference;
  const feedEarly = refEarly.type === "oracle" && refEarly.address && refEarly.chain === ctx.chain ? getAddress(refEarly.address) : undefined;
  const readFeedRole = async (fn: string) => (feedEarly ? await ctx.read<Hex>(feedEarly, TOKEN_ABI, fn) : undefined) ?? roleHash(fn);
  const [depositAdmin, redeemAdmin] = await Promise.all([readFeedRole("M_FONE_DEPOSIT_VAULT_ADMIN_ROLE"), readFeedRole("M_FONE_REDEMPTION_VAULT_ADMIN_ROLE")]);

  const ref = ctx.asset.pricing.reference;
  const feed = ref.type === "oracle" && ref.address && ref.chain === ctx.chain ? getAddress(ref.address) : undefined;
  const feedRole = feed ? await ctx.read<Hex>(feed, FEED_ABI, "feedAdminRole") : undefined;

  const roles = [zeroHash, mintRole, burnRole, pauseRole, depositAdmin, redeemAdmin, depositAdminGeneric, redeemAdminGeneric, blacklistOps, greenlistOps];
  if (feedRole) roles.push(feedRole);
  const members = await membersOf(ctx, controller, roles);

  const minters = of(members, mintRole);
  const burners = of(members, burnRole);
  const pausers = of(members, pauseRole);
  const admins = of(members, zeroHash);
  const feedAdmins = feedRole ? of(members, feedRole) : [];
  const vaultAdmins = [...new Set([...of(members, depositAdmin), ...of(members, redeemAdmin), ...of(members, depositAdminGeneric), ...of(members, redeemAdminGeneric)])].sort();
  const freezers = of(members, blacklistOps);
  const greenlisters = of(members, greenlistOps);

  await addMapped(
    ctx,
    token,
    {
      role: "token",
      rulesOnly: true,
      rules: [
        { power: "mint", fns: ["mint"], holders: minters, via: "M_FONE_MINT_OPERATOR_ROLE on the shared controller" },
        { power: "burn-from", fns: ["burn"], holders: burners, via: "M_FONE_BURN_OPERATOR_ROLE. burn(from, amount) destroys any holder's tokens" },
        { power: "pause", fns: ["pause", "unpause"], holders: pausers, via: "M_FONE_PAUSE_OPERATOR_ROLE" },
        { power: "admin", fns: ["grantRole", "revokeRole"], holders: admins, via: "DEFAULT_ADMIN_ROLE. granting a role is not timelocked" },
      ],
    },
    warn,
  );

  await addMapped(
    ctx,
    controller,
    {
      name: "MidasAccessControl",
      role: "service",
      rulesOnly: true,
      rules: [{ power: "admin", fns: ["grantRole", "revokeRole", "grantRoleMult", "revokeRoleMult"], holders: admins, via: "DEFAULT_ADMIN_ROLE on the shared controller" }],
    },
    warn,
  );

  if (feed)
    await addMapped(
      ctx,
      feed,
      {
        role: "oracle",
        rulesOnly: true,
        rules: [
          {
            power: "set-price",
            fns: ["setRoundData", "setRoundDataSafe"],
            holders: feedAdmins,
            via: "feed admin role. setRoundDataSafe caps the move at maxAnswerDeviation; setRoundData does not",
          },
        ],
      },
      warn,
    );

  const candidates = [...new Set([...minters, ...burners])];
  for (const address of candidates) {
    if (!(await ctx.hasCode(address))) continue;
    await addMapped(
      ctx,
      address,
      {
        role: "service",
        rulesOnly: true,
        rules: [
          { power: "pause", fns: ["pauseFn", "unpauseFn", "pause", "unpause"], holders: vaultAdmins, via: "deposit or redemption vault admin role" },
          { power: "admin", fns: VAULT_ADMIN_FNS, holders: vaultAdmins, via: "deposit or redemption vault admin role" },
          { power: "allocate", fns: ["withdrawToken"], holders: vaultAdmins, via: "vault admin can pull tokens out of the vault" },
        ],
      },
      warn,
    );
  }

  if (freezers.length)
    ctx.grant(
      ctx.contracts[getAddress(token)]?.permissions ?? [],
      "freeze",
      freezers,
      "BLACKLIST_OPERATOR_ROLE on the shared controller. One blacklisted address cannot send or receive",
    );
  // grant() above pushes holders into the queue, but only if we passed the token's permission array.
  if (greenlisters.length)
    ctx.grant(
      ctx.contracts[getAddress(token)]?.permissions ?? [],
      "set-compliance",
      greenlisters,
      "GREENLIST_OPERATOR_ROLE. Deposit and redemption vaults reject addresses that are not greenlisted",
    );

  // Role hashes are keccak256 of the name, so a missed constant still matches if the feed uses the documented name.
  if (feed && feedAdmins.length === 0) warn.push(`No holder of feed admin role ${feedRole ?? roleHash("M_FONE_CUSTOM_AGGREGATOR_FEED_ADMIN_ROLE")} confirmed on the controller.`);
  reportWarnings("midas", warn);
  return {
    controller,
    minters,
    burners,
    pausers,
    admins,
    feedAdmins,
    vaultAdmins,
    freezerCount: freezers.length,
    greenlistOperatorCount: greenlisters.length,
    warnings: warn,
  };
}
