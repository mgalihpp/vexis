import { describe, expect, test } from "bun:test";
import { createProgram, DEFAULT_BIN_PER_POSITION } from "@meteora-ag/dlmm";
import type { Connection } from "@solana/web3.js";
import { positionRentSol } from "../open-cost.ts";

describe("positionRentSol", () => {
  test("asks the chain for the rent of the program's own PositionV2 size, in SOL", async () => {
    const asked: number[] = [];
    const connection = {
      getMinimumBalanceForRentExemption: async (size: number) => {
        asked.push(size);
        return size * 1000;
      },
    } as unknown as Connection;
    const sol = await positionRentSol(connection);
    const size = createProgram(connection).account.positionV2.size;
    expect(DEFAULT_BIN_PER_POSITION.toNumber()).toBe(70);
    expect(asked).toEqual([size]);
    expect(sol).toBe((size * 1000) / 1_000_000_000);
  });
});
