import { closeDb } from "@/db/client";
import { aaveJob } from "./jobs/aave";
import { aumJob } from "./jobs/aum";
import { edgarJob } from "./jobs/edgar";
import { gleifJob } from "./jobs/gleif";
import { morphoJob } from "./jobs/morpho";
import { oraclesJob } from "./jobs/oracles";
import { supplyJob } from "./jobs/supply";
import { getCursor, log, setCursor } from "./util";
import { watcherJob } from "./watcher";

const USAGE = `Usage:
  bun run worker                 run forever, each job on its schedule
  bun run worker --once          run every job that is due, then exit (cron mode)
  bun run worker --once oracles  run named job(s) now, ignoring the schedule`;

const MIN = 60;
const JOBS: Record<string, { every: number; run: () => Promise<void> }> = {
  watcher: { every: 1 * MIN, run: watcherJob },
  oracles: { every: 15 * MIN, run: oraclesJob },
  supply: { every: 60 * MIN, run: supplyJob },
  morpho: { every: 60 * MIN, run: morphoJob },
  aave: { every: 60 * MIN, run: aaveJob },
  aum: { every: 6 * 60 * MIN, run: aumJob },
  edgar: { every: 24 * 60 * MIN, run: edgarJob },
  gleif: { every: 7 * 24 * 60 * MIN, run: gleifJob },
};

// Small slack so a 15-minute cron doesn't skip a 15-minute job because it fired a few seconds early.
const SLACK_SECONDS = 60;

async function isDue(name: string): Promise<boolean> {
  const last = await getCursor(`job:${name}`);
  return !last || (Date.now() - Date.parse(last)) / 1000 >= JOBS[name]!.every - SLACK_SECONDS;
}

async function runJob(name: string): Promise<boolean> {
  const started = Date.now();
  try {
    await JOBS[name]!.run();
    await setCursor(`job:${name}`, new Date(started).toISOString());
    log(name, `done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    return true;
  } catch (e) {
    log(name, `FAILED: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    return false;
  }
}

const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log(USAGE);
  process.exit(0);
}
const once = args.includes("--once");
const named = args.filter((a) => !a.startsWith("--"));
const unknown = named.filter((n) => !JOBS[n]);
if (unknown.length) {
  console.error(`Unknown job(s): ${unknown.join(", ")}. Jobs: ${Object.keys(JOBS).join(", ")}`);
  process.exit(1);
}

if (once) {
  let failed = 0;
  for (const name of named.length ? named : Object.keys(JOBS)) {
    if (!named.length && !(await isDue(name))) continue;
    if (!(await runJob(name))) failed++;
  }
  await closeDb();
  process.exit(failed ? 1 : 0);
}

log("worker", "started; Ctrl-C to stop");
const running = new Set<string>();
const tick = async () => {
  for (const name of Object.keys(JOBS)) {
    if (running.has(name) || !(await isDue(name))) continue;
    running.add(name);
    void runJob(name).finally(() => running.delete(name));
  }
};
await tick();
setInterval(() => void tick(), 30_000);
