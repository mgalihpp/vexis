import { type FilterPool, filterPool } from "@vexis/db/screen";
import { Config, Context, Effect, flow, Layer, Option, Schedule, Schema } from "effect";
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

/** A screener pool: its reading plus what the screener filter reads of it. */
export type ScreenerReading = PoolReading & FilterPool;

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

const ScreenerToken = Schema.Struct({
  address: Schema.String,
  is_verified: Schema.optional(Schema.NullOr(Schema.Boolean)),
  freeze_authority_disabled: Schema.optional(Schema.NullOr(Schema.Boolean)),
  market_cap: Schema.optional(Schema.NullOr(Schema.Number)),
});
const ScreenerResponse = Schema.Struct({
  data: Schema.Array(
    Schema.Struct({
      address: Schema.String,
      name: Schema.String,
      tvl: Schema.Number,
      volume: Schema.Struct({ "24h": Schema.Number }),
      is_blacklisted: Schema.Boolean,
      pool_config: Schema.Struct({ bin_step: Schema.Number }),
      cumulative_metrics: Schema.Struct({ volume: Schema.Number }),
      token_x: ScreenerToken,
      token_y: ScreenerToken,
    }),
  ),
});

const DiscoveryToken = Schema.Struct({
  address: Schema.String,
  organic_score: Schema.optional(Schema.NullOr(Schema.Number)),
});
const decodeDiscoveryRow = Schema.decodeUnknownOption(
  Schema.Struct({ token_x: DiscoveryToken, token_y: DiscoveryToken }),
);
const DiscoveryResponse = Schema.Struct({ data: Schema.Array(Schema.Unknown) });
const DISCOVERY_URL = "https://pool-discovery-api.datapi.meteora.ag/pools";

// The web screener's request (`loadScreener`, `FLOOR`), so the runner judges the pools the screener lists.
const SCREENER_PAGE = 1000;
const SCREENER_FILTER = "tvl>=1000 && volume_24h>=1000";
const DISCOVERY_FILTER = "pool_type=dlmm && tvl>=1000 && volume>=1000";

/** Meteora's DLMM data API. */
export class Meteora extends Context.Service<
  Meteora,
  {
    /** One request for all the pools. Keep batches around 100 so the URL stays short. */
    pools(addresses: ReadonlyArray<string>): Effect.Effect<ReadonlyArray<PoolReading>, MeteoraError>;
    /**
     * Every pool above the screener floor in one datapi request, plus one discovery API request (its own host and
     * budget) for organic scores. A failed discovery request leaves organic unknown instead of failing.
     */
    screener(): Effect.Effect<ReadonlyArray<ScreenerReading>, MeteoraError>;
  }
>()("vexis/agents/Meteora") {
  static readonly layer = Layer.effect(
    Meteora,
    Effect.gen(function* () {
      const baseUrl = yield* Config.URL("METEORA_DATAPI_URL").pipe(
        Config.withDefault(new URL("https://dlmm.datapi.meteora.ag")),
      );
      const http = (yield* HttpClient.HttpClient).pipe(
        HttpClient.mapRequest(HttpClientRequest.acceptJson),
        HttpClient.filterStatusOk,
        HttpClient.retryTransient({ schedule: Schedule.exponential("500 millis"), times: 3 }),
      );
      const client = http.pipe(HttpClient.mapRequest(flow(HttpClientRequest.prependUrl(baseUrl.origin))));

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

      const organicScores = http
        .get(DISCOVERY_URL, {
          urlParams: { page_size: SCREENER_PAGE, timeframe: "24h", filter_by: DISCOVERY_FILTER },
        })
        .pipe(
          Effect.flatMap(HttpClientResponse.schemaBodyJson(DiscoveryResponse)),
          Effect.map((body) => {
            const scores = new Map<string, number>();
            for (const row of body.data.flatMap((raw) => Option.toArray(decodeDiscoveryRow(raw)))) {
              for (const t of [row.token_x, row.token_y]) {
                if (t.organic_score != null) scores.set(t.address, t.organic_score);
              }
            }
            return scores;
          }),
          Effect.catchCause((cause) =>
            Effect.logWarning("discovery API failed; organic scores are unknown this minute", cause).pipe(
              Effect.as(new Map<string, number>()),
            ),
          ),
        );

      const screener = Effect.fn("Meteora.screener")(function* () {
        const [response, organic] = yield* Effect.all(
          [
            client
              .get("/pools", {
                urlParams: { page_size: SCREENER_PAGE, sort_by: "tvl:desc", filter_by: SCREENER_FILTER },
              })
              .pipe(
                Effect.flatMap(HttpClientResponse.schemaBodyJson(ScreenerResponse)),
                Effect.mapError((cause) => new MeteoraError({ cause })),
              ),
            organicScores,
          ],
          { concurrency: 2 },
        );
        const token = (t: typeof ScreenerToken.Type) => ({
          mint: t.address,
          verified: t.is_verified ?? false,
          freezable: t.freeze_authority_disabled === false,
          marketCap: t.market_cap || null,
          organic: organic.get(t.address) ?? null,
        });
        return response.data.map(
          (p): ScreenerReading => ({
            address: p.address,
            name: p.name,
            cumulativeVolume: p.cumulative_metrics.volume,
            ...filterPool({
              tvl: p.tvl,
              volume24h: p.volume["24h"],
              binStep: p.pool_config.bin_step,
              blacklisted: p.is_blacklisted,
              tokenX: token(p.token_x),
              tokenY: token(p.token_y),
            }),
          }),
        );
      });

      return Meteora.of({ pools, screener });
    }),
  ).pipe(Layer.provide(FetchHttpClient.layer));
}
