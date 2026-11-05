import { create } from "zustand";
import { persist } from "zustand/middleware";
import { type Agent, type AgentStatus, SEED_AGENTS } from "@/features/agents/agents";

interface AgentsState {
  agents: Agent[];
  add: (agent: Agent) => void;
  setStatus: (id: string, status: AgentStatus) => void;
  rebalance: (id: string) => void;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
}

const patch = (agents: Agent[], id: string, change: Partial<Agent>) =>
  agents.map((a) => (a.id === id ? { ...a, ...change } : a));

// Demo fleet: there is no agent runtime yet, so the list lives in localStorage and starts from the seed.
// skipHydration for the same reason as the other stores; the app shell rehydrates after mount.
export const useAgents = create<AgentsState>()(
  persist(
    (set) => ({
      agents: SEED_AGENTS,
      add: (agent) => set((s) => ({ agents: [agent, ...s.agents] })),
      setStatus: (id, status) =>
        set((s) => ({
          agents: patch(s.agents, id, {
            status,
            statusAge: "0s",
            lastAction: status === "paused" ? "Paused by you" : "Resumed by you",
            lastActionAgo: "just now",
          }),
        })),
      rebalance: (id) =>
        set((s) => ({
          agents: patch(s.agents, id, {
            status: "live",
            position: "in-range",
            statusAge: "0s",
            lastAction: "Rebalanced by you",
            lastActionAgo: "just now",
          }),
        })),
      rename: (id, name) => set((s) => ({ agents: patch(s.agents, id, { name }) })),
      remove: (id) => set((s) => ({ agents: s.agents.filter((a) => a.id !== id) })),
    }),
    { name: "vexis-agents", skipHydration: true },
  ),
);
