import { datapiBackgroundFetch } from "@vexis/db/datapi-budget";
import { filterPool } from "@vexis/db/screen";
import { Clock, Config, Context, Effect, flow, Layer, Option, Ref, Schedule, Schema } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";
import { MeteoraError } from "../errors.ts";
import { type OfficePool, type ScreenerSnapshot, solUsdOf } from "../pools.ts";

const Token = Schema.Struct({
  address: Schema.String,
  is_verified: Schema.optional(Schema.NullOr(Schema.Boolean)),
  freeze_authority_disabled: Schema.optional(Schema.NullOr(Schema.Boolean)),
  market_cap: Schema.optional(Schema.NullOr(Schema.Number)),
  price: Schema.optional(Schema.NullOr(Schema.Number)),
});
const PoolsResponse = Schema.Struct({
  data: Schema.Array(
    Schema.Struct({
      address: Schema.String,
      name: Schema.String,
      tvl: Schema.Number,
      volume: Schema.Struct({ "24h": Schema.Number }),
      fee_tvl_ratio: Schema.optional(
        Schema.NullOr(Schema.Struct({ "24h": Schema.optional(Schema.NullOr(Schema.Number)) })),
      ),
      is_blacklisted: Schema.Boolean,
      pool_config: Schema.Struct({ bin_step: Schema.Number }),
      token_x: Token,
      token_y: Token,
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

// The web screener's floor (`loadScreener`), so the office sees the pools the screener lists.
const PAGE = 1000;
const FILTER = "tvl>=1000 && volume_24h>=1000";
const DISCOVERY_FILTER = "pool_type=dlmm && tvl>=1000 && volume>=1000";

export type ScreenerList = Omit<ScreenerSnapshot, "fetchedAt">;

/**
 * Meteora's DLMM data API: the screener list in one datapi request, plus one discovery API request (its own host and
 * budget) for organic scores. A failed discovery request leaves organic unknown, so an organic bound fails.
 */
export class Meteora extends Context.Service<Meteora, { screener(): Effect.Effect<ScreenerList, MeteoraError> }>()(
  "vexis/office/Meteora",
) {
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

      const organicScores = http
        .get(DISCOVERY_URL, { urlParams: { page_size: PAGE, timeframe: "24h", filter_by: DISCOVERY_FILTER } })
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
            Effect.logWarning("discovery API failed; organic scores are unknown this window", cause).pipe(
              Effect.as(new Map<string, number>()),
            ),
          ),
        );

      const screener = Effect.fn("Meteora.screener")(function* () {
        const [response, organic] = yield* Effect.all(
          [
            client.get("/pools", { urlParams: { page_size: PAGE, sort_by: "tvl:desc", filter_by: FILTER } }).pipe(
              Effect.flatMap(HttpClientResponse.schemaBodyJson(PoolsResponse)),
              Effect.mapError((cause) => new MeteoraError({ cause })),
            ),
            organicScores,
          ],
          { concurrency: 2 },
        );
        const token = (t: typeof Token.Type) => ({
          mint: t.address,
          verified: t.is_verified ?? false,
          freezable: t.freeze_authority_disabled === false,
          marketCap: t.market_cap || null,
          organic: organic.get(t.address) ?? null,
        });
        const pools = response.data.map(
          (p): OfficePool => ({
            address: p.address,
            name: p.name,
            feeTvl24h: p.fee_tvl_ratio?.["24h"] ?? null,
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
        const solUsd = solUsdOf(
          response.data.map((p) => ({
            tvl: p.tvl,
            tokens: [p.token_x, p.token_y].map((t) => ({ mint: t.address, price: t.price ?? null })),
          })),
        );
        return { pools, solUsd };
      });

      return Meteora.of({ screener });
    }),
  ).pipe(
    Layer.provide(
      FetchHttpClient.layer.pipe(
        Layer.provide(
          Layer.sync(FetchHttpClient.Fetch, () =>
            datapiBackgroundFetch(new URL(process.env.METEORA_DATAPI_URL ?? "https://dlmm.datapi.meteora.ag").origin),
          ),
        ),
      ),
    ),
  );
}

/** How long one screener list serves every office's Scout and Risk Manager. */
export const SCREENER_WINDOW_MS = 15 * 60_000;

/**
 * The screener list shared by every office. `refresh` asks Meteora at most once per window, counting a failed
 * attempt, so an outage costs one request per window too; a failure keeps the previous list.
 */
export class Screener extends Context.Service<
  Screener,
  {
    refresh(): Effect.Effect<void>;
    current(): Effect.Effect<ScreenerSnapshot | null>;
  }
>()("vexis/office/Screener") {
  static readonly layer = Layer.effect(
    Screener,
    Effect.gen(function* () {
      const meteora = yield* Meteora;
      const state = yield* Ref.make<{ attemptedAt: number | null; snapshot: ScreenerSnapshot | null }>({
        attemptedAt: null,
        snapshot: null,
      });

      const refresh = Effect.fn("Screener.refresh")(function* () {
        const now = yield* Clock.currentTimeMillis;
        // Claimed in one step, so offices running side by side never both ask.
        const due = yield* Ref.modify(state, (s) =>
          s.attemptedAt !== null && now - s.attemptedAt < SCREENER_WINDOW_MS
            ? ([false, s] as const)
            : ([true, { ...s, attemptedAt: now }] as const),
        );
        if (!due) return;
        yield* meteora.screener().pipe(
          Effect.flatMap((list) => Ref.update(state, (s) => ({ ...s, snapshot: { ...list, fetchedAt: now } }))),
          Effect.catchCause((cause) => Effect.logWarning("screener list failed; keeping the previous one", cause)),
        );
      });

      return Screener.of({ refresh, current: () => Ref.get(state).pipe(Effect.map((s) => s.snapshot)) });
    }),
  );
}
