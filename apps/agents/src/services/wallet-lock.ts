import { Context, type Effect, Layer, Semaphore } from "effect";

/**
 * One permit per wallet, shared by auto-rebalance and the office's Executor: a user's agent wallet can back both, and
 * two transactions in flight on one wallet race for the same balance and token accounts.
 */
export class WalletLock extends Context.Service<
  WalletLock,
  { withWallet<A, E, R>(owner: string, effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> }
>()("vexis/agents/WalletLock") {
  static readonly layer = Layer.sync(WalletLock, () => {
    const locks = new Map<string, Semaphore.Semaphore>();
    const lockOf = (owner: string) => {
      const found = locks.get(owner);
      if (found) return found;
      const made = Semaphore.makeUnsafe(1);
      locks.set(owner, made);
      return made;
    };
    return WalletLock.of({ withWallet: (owner, effect) => lockOf(owner).withPermits(1)(effect) });
  });
}
