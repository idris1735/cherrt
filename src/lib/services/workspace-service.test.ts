import { getModuleHealth, getWorkspaceSnapshot } from "@/lib/services/workspace-service";

describe("workspace-service", () => {
  it("returns the seeded workspace snapshot for global-hub", () => {
    const snapshot = getWorkspaceSnapshot("global-hub");

    expect(snapshot.workspace.name).toBe("Global Hub");
    expect(snapshot.requests.length).toBeGreaterThan(0);
  });

  it("derives module health across all four product areas", () => {
    const snapshot = getWorkspaceSnapshot("global-hub");
    const health = getModuleHealth(snapshot);

    expect(health).toHaveLength(4);
    expect(health.map((item) => item.key)).toEqual(["toolkit", "church", "store", "events"]);
  });
});
