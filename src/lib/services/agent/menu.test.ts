// Role-aware menu: the tappable menu must honestly reflect what each role is
// allowed to do — same permission machinery as execution.
import { describe, it, expect } from "vitest";
import { menuForRole, menuPromptFor } from "@/lib/services/agent/menu";

const ids = (role: string, pages = 5) =>
  Array.from({ length: pages }, (_, i) => i + 1).flatMap((p) => menuForRole(role, p).map((r) => r.id));

describe("menuForRole", () => {
  it("member menu: self-service only — no finance or leadership rows on any page", () => {
    const all = ids("member");
    expect(all).toContain("menu:give");
    expect(all).toContain("menu:prayer");
    expect(all).toContain("menu:checkin");
    expect(all).toContain("menu:register_child");
    expect(all).toContain("menu:join_dept");
    expect(all).toContain("menu:first_timer");
    expect(all).not.toContain("menu:giving_month");
    expect(all).not.toContain("menu:record_giving");
    expect(all).not.toContain("menu:members");
    expect(all).not.toContain("menu:announce");
    expect(all).not.toContain("menu:prayer_list");
  });

  it("finance sees giving rows a member cannot", () => {
    const all = ids("finance");
    expect(all).toContain("menu:giving_month");
    expect(all).toContain("menu:record_giving");
  });

  it("pastor sees leadership rows a member cannot", () => {
    const all = ids("pastor");
    expect(all).toContain("menu:announce");
    expect(all).toContain("menu:members");
    expect(all).toContain("menu:prayer_list");
  });

  it("creator sees the finance row right on page 1", () => {
    expect(menuForRole("creator", 1).map((r) => r.id)).toContain("menu:giving_month");
  });

  it("it_technical never sees data-reading rows, but can still report issues", () => {
    const all = ids("it_technical");
    expect(all).not.toContain("menu:members");
    expect(all).not.toContain("menu:giving_month");
    expect(all).not.toContain("menu:prayer_list");
    expect(all).not.toContain("menu:first_timers_list");
    expect(all).toContain("menu:issue");
    expect(all).toContain("menu:give");
  });

  it("every page is capped at 10 rows (WhatsApp list limit) with a nav row last", () => {
    for (const role of ["member", "finance", "pastor", "creator", "it_technical"]) {
      const page1 = menuForRole(role, 1);
      expect(page1.length).toBeLessThanOrEqual(10);
      const navId = page1[page1.length - 1].id;
      expect(navId === "help_more" || navId.startsWith("menu_more")).toBe(true);
      const page2 = menuForRole(role, 2);
      expect(page2.length).toBeLessThanOrEqual(10);
    }
  });

  it("creator page 1 ends with 'More actions' and page 2 exists", () => {
    const p1 = menuForRole("creator", 1);
    expect(p1[p1.length - 1].id).toMatch(/^menu_more/); // carries the next page
    expect(menuForRole("creator", 2).some((r) => r.id.startsWith("menu:"))).toBe(true);
  });
});

describe("menuPromptFor", () => {
  it("resolves the prompt for a known row", () => {
    expect(menuPromptFor("give")).toContain("give");
    expect(menuPromptFor("first_timer")).toContain("first-timer");
  });
  it("returns null for nav rows and unknown ids", () => {
    expect(menuPromptFor("menu_more")).toBeNull();
    expect(menuPromptFor("nope")).toBeNull();
  });
});
