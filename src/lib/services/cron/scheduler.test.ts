import { describe, it, expect, beforeEach, vi } from "vitest";

const { store } = vi.hoisted(() => ({
  store: {
    rows: [] as Array<Record<string, unknown>>,
    updates: [] as Array<Record<string, unknown>>,
    single: null as Record<string, unknown> | null,
  },
}));
vi.mock("@/lib/services/supabase-server", () => ({
  getSupabaseServerClient: () => ({
    from() {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        limit: () => chain,
        maybeSingle: () => Promise.resolve({ data: store.single, error: null }),
        update: (row: Record<string, unknown>) => ({
          eq: (_col: string, val: string) => {
            store.updates.push({ id: val, ...row });
            return Promise.resolve({ error: null });
          },
        }),
        then: (resolve: (v: { data: unknown[]; error: null }) => void) => resolve({ data: store.rows, error: null }),
      };
      return chain;
    },
  }),
}));
vi.mock("@/lib/services/whatsapp", () => ({ sendTextMessage: vi.fn().mockResolvedValue(undefined) }));

import { sendTextMessage } from "@/lib/services/whatsapp";
import { deliverDiscipleshipDay, sendBirthdayGreetings, runScheduledJobs } from "@/lib/services/cron/scheduler";
import { DISCIPLESHIP_PLAN } from "@/lib/services/cron/discipleship-plan";

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

beforeEach(() => {
  store.rows = [];
  store.updates = [];
  store.single = null;
  vi.clearAllMocks();
});

describe("sendBirthdayGreetings", () => {
  it("greets today's celebrants who have a reachable phone", async () => {
    store.rows = [{ id: "p1", full_name: "Ada Obi" }]; // people with a birthday today
    store.single = { phone_number: "2348010000001" }; // their active phone contact
    const res = await sendBirthdayGreetings();
    expect(sendTextMessage).toHaveBeenCalledWith("2348010000001", expect.stringContaining("Happy Birthday, Ada"));
    expect(res).toMatchObject({ job: "birthday-greetings", processed: 1, sent: 1 });
  });

  it("skips a celebrant with no phone on file", async () => {
    store.rows = [{ id: "p2", full_name: "John" }];
    store.single = null; // no contact
    const res = await sendBirthdayGreetings();
    expect(sendTextMessage).not.toHaveBeenCalled();
    expect(res.sent).toBe(0);
  });
});

describe("deliverDiscipleshipDay", () => {
  it("sends the correct day's lesson to an enrolee with a phone", async () => {
    store.rows = [{ id: "j1", details: { phone: "2348010000001" }, created_at: daysAgo(0) }];
    const res = await deliverDiscipleshipDay();
    expect(sendTextMessage).toHaveBeenCalledWith("2348010000001", expect.stringContaining("Day 1"));
    expect(res).toMatchObject({ job: "discipleship-daily", processed: 1, sent: 1 });
  });

  it("sends day 3 content on the third day", async () => {
    store.rows = [{ id: "j2", details: { phone: "x" }, created_at: daysAgo(2) }];
    await deliverDiscipleshipDay();
    expect(sendTextMessage).toHaveBeenCalledWith("x", expect.stringContaining("Day 3"));
  });

  it("marks the journey complete once the plan is finished, and sends nothing", async () => {
    store.rows = [{ id: "j3", details: { phone: "x" }, created_at: daysAgo(DISCIPLESHIP_PLAN.length + 1) }];
    await deliverDiscipleshipDay();
    expect(store.updates).toContainEqual(expect.objectContaining({ id: "j3", status: "completed" }));
    expect(sendTextMessage).not.toHaveBeenCalled();
  });

  it("skips enrolees with no stored phone", async () => {
    store.rows = [{ id: "j4", details: {}, created_at: daysAgo(0) }];
    const res = await deliverDiscipleshipDay();
    expect(sendTextMessage).not.toHaveBeenCalled();
    expect(res.sent).toBe(0);
    expect(res.processed).toBe(1);
  });
});

describe("runScheduledJobs", () => {
  it("runs the registered jobs and returns their results", async () => {
    store.rows = [];
    const results = await runScheduledJobs();
    expect(results.map((r) => r.job)).toContain("discipleship-daily");
  });
});

describe("DISCIPLESHIP_PLAN", () => {
  it("has content", () => {
    expect(DISCIPLESHIP_PLAN.length).toBeGreaterThan(0);
    expect(DISCIPLESHIP_PLAN[0]).toHaveProperty("verse");
  });
});
