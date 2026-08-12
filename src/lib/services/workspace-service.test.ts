import { getModuleHealth, getWorkspaceSnapshot } from "@/lib/services/workspace-service";

describe("workspace-service", () => {
  it("returns an empty workspace snapshot (demo data removed)", () => {
    const snapshot = getWorkspaceSnapshot("any-workspace");
    expect(snapshot.workspace).toBeDefined();
    expect(snapshot.requests).toEqual([]);
  });

  it("derives empty module health across all four product areas", () => {
    const snapshot = getWorkspaceSnapshot("any-workspace");
    const health = getModuleHealth(snapshot);
    expect(health).toHaveLength(4);
    expect(health.map((item) => item.key)).toEqual(["toolkit", "church", "store", "events"]);
  });
});
