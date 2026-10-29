import { getAddress, keccak256, toHex, type Address } from "viem";
import type { Context } from "../context";
import { roleMembers } from "./oz-access-control";

const PROPOSER_ROLE = keccak256(toHex("PROPOSER_ROLE"));
const EXECUTOR_ROLE = keccak256(toHex("EXECUTOR_ROLE"));

/** Proposers and executors of an OpenZeppelin TimelockController, replayed from role logs. */
export async function timelockRoles(
  ctx: Context,
  timelock: Address,
): Promise<{ proposers: Address[]; executors: Address[] }> {
  const members = await roleMembers(ctx, timelock);
  const proposers = (members.get(PROPOSER_ROLE) ?? []).map((a) => getAddress(a));
  const executors = (members.get(EXECUTOR_ROLE) ?? []).map((a) => getAddress(a));
  return { proposers: proposers.length > 0 ? proposers : [timelock], executors };
}
