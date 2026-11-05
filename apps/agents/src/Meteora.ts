import { Config, Context, Effect, flow, Layer, Schedule, Schema } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";
import { MeteoraError } from "./errors.ts";

export type PoolReading = {
  readonly address: string;
  readonly name: string;
  readonly binStep: number;
  readonly tvl: number;
  /** All-time USD volume. The per-minute volume is the delta between two readings. */
  readonly cumulativeVolume: number;
};

const PoolsResponse = Schema.Struct({
  data: Schema.Array(
    Schema.Struct({
      address: Schema.String,
      name: Schema.String,
      tvl: Schema.Number,
      pool_config: Schema.Struct({ bin_step: Schema.Number }),
      cumulative_metrics: Schema.Struct({ volume: Schema.Number }),
    }),
  ),
});

/** Meteora's DLMM data API. */
export class Meteora extends Context.Service<
  Meteora,
  {
    /** One request for all the pools. Keep batches around 100 so the URL stays short. */
    pools(addresses: ReadonlyArray<string>): Effect.Effect<ReadonlyArray<PoolReading>, MeteoraError>;
  }
>()("vexis/agents/Meteora") {
  static readonly layer = Layer.effect(
    Meteora,
    Effect.gen(function* () {
      const baseUrl = yield* Config.URL("METEORA_DATAPI_URL").pipe(
        Config.withDefault(new URL("https://dlmm.datapi.meteora.ag")),
      );
      const client = (yield* HttpClient.HttpClient).pipe(
        HttpClient.mapRequest(flow(HttpClientRequest.prependUrl(baseUrl.origin), HttpClientRequest.acceptJson)),
        HttpClient.filterStatusOk,
        HttpClient.retryTransient({ schedule: Schedule.exponential("500 millis"), times: 3 }),
      );

      const pools = Effect.fn("Meteora.pools")(function* (addresses: ReadonlyArray<string>) {
        if (addresses.length === 0) return [];
        // The documented `[a|b]` form matches nothing for two or more values; commas work.
        const response = yield* client
          .get("/pools", {
            urlParams: { page_size: addresses.length, filter_by: `pool_address=[${addresses.join(",")}]` },
          })
          .pipe(
            Effect.flatMap(HttpClientResponse.schemaBodyJson(PoolsResponse)),
            Effect.mapError((cause) => new MeteoraError({ cause })),
          );
        return response.data.map(
          (p): PoolReading => ({
            address: p.address,
            name: p.name,
            binStep: p.pool_config.bin_step,
            tvl: p.tvl,
            cumulativeVolume: p.cumulative_metrics.volume,
          }),
        );
      });

      return Meteora.of({ pools });
    }),
  ).pipe(Layer.provide(FetchHttpClient.layer));
}
