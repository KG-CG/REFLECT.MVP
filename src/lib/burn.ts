/**
 * Dev-supply burn plan: BASE_BURN at BASE_MCAP, then STEP_BURN for every STEP_MCAP of market cap above it,
 * until the whole dev supply is burned. DEV_SUPPLY (tokens) is read from env; default 87M = the dev wallet holding.
 */
export const BASE_MCAP = 10_000, BASE_BURN = 10_000_000, STEP_BURN = 1_000_000, STEP_MCAP = 50_000;

export type Milestone = { n: number; mcap: number; burn: number; cumulative: number; remaining: number };
export type BurnPlan = { devSupply: number; milestones: Milestone[]; finalMcap: number };

export function burnPlan(devSupply = Number(process.env.DEV_SUPPLY) || 87_000_000): BurnPlan {
  const milestones: Milestone[] = [];
  let done = 0;
  for (let n = 0; done < devSupply; n++) {
    const burn = Math.min(n === 0 ? BASE_BURN : STEP_BURN, devSupply - done);
    done += burn;
    milestones.push({ n: n + 1, mcap: BASE_MCAP + n * STEP_MCAP, burn, cumulative: done, remaining: devSupply - done });
  }
  return { devSupply, milestones, finalMcap: milestones[milestones.length - 1].mcap };
}
