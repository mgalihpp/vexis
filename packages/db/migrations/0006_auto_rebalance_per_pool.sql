ALTER TABLE "agents" DROP CONSTRAINT "agents_user_kind_unique";--> statement-breakpoint
ALTER TABLE "agent_rebalances" ADD COLUMN "action" text DEFAULT 'rebalance' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_rebalances" ADD COLUMN "fee_sol" double precision;--> statement-breakpoint
ALTER TABLE "rebalance_wallets" ADD COLUMN "rpc_url" text;--> statement-breakpoint
CREATE UNIQUE INDEX "agents_user_volume_watch_unique" ON "agents" USING btree ("user_id","kind") WHERE "agents"."kind" = 'volume-watch';--> statement-breakpoint
ALTER TABLE "agent_rebalances" ADD CONSTRAINT "agent_rebalances_action_check" CHECK (action in ('rebalance', 'claim'));--> statement-breakpoint
-- Hand-written: an auto-rebalance agent now has exactly one pool. Each extra pool of an existing agent moves to a new
-- agent with the same switches and config, taking its rebalance history along; the oldest pool stays put.
DO $$
DECLARE
  p record;
  new_id uuid;
BEGIN
  FOR p IN
    SELECT ap.id, ap.agent_id, ap.pool_address, a.user_id, a.enabled, a.paused, a.paused_reason, a.config
    FROM "agent_pools" ap
    JOIN "agents" a ON a.id = ap.agent_id
    WHERE a.kind = 'auto-rebalance'
      AND ap.id <> (
        SELECT first.id FROM "agent_pools" first
        WHERE first.agent_id = ap.agent_id
        ORDER BY first.created_at, first.id
        LIMIT 1
      )
  LOOP
    INSERT INTO "agents" ("user_id", "kind", "enabled", "paused", "paused_reason", "config")
    VALUES (p.user_id, 'auto-rebalance', p.enabled, p.paused, p.paused_reason, p.config)
    RETURNING id INTO new_id;
    UPDATE "agent_pools" SET "agent_id" = new_id WHERE id = p.id;
    UPDATE "agent_rebalances" SET "agent_id" = new_id
    WHERE "agent_id" = p.agent_id AND "pool_address" = p.pool_address;
  END LOOP;
END $$;