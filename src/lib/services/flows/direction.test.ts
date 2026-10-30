// Direction rail: every module opens with what it does, and every stop ends
// with a way forward (UAT: "no clear direction on what to do").
import { describe, it, expect } from "vitest";
import { withIntro, withWayBack, MENU_BUTTON, EXIT_HINT, MENU_HINT } from "@/lib/services/flows/direction";
import type { FlowOutput } from "@/lib/services/flows/engine";

describe("withIntro", () => {
  it("prefixes the module header and the exit hint to the opening step", () => {
    const out = withIntro("*💰 Give* — tithe or offering.", { type: "text", text: "How much?" });
    expect(out).toEqual({ type: "text", text: `*💰 Give* — tithe or offering.\n${EXIT_HINT}\n\nHow much?` });
  });

  it("keeps the step's shape (buttons/list stay interactive)", () => {
    const out = withIntro("*X* — y.", { type: "buttons", text: "Pick", buttons: [{ id: "a", title: "A" }] });
    expect(out).toMatchObject({ type: "buttons", buttons: [{ id: "a", title: "A" }] });
    expect(out.text.endsWith("Pick")).toBe(true);
  });

  it("no intro → unchanged", () => {
    const o: FlowOutput = { type: "text", text: "Hi" };
    expect(withIntro(undefined, o)).toBe(o);
  });

  it("never pushes an interactive body past WhatsApp's limit", () => {
    const long = "x".repeat(990);
    const o: FlowOutput = { type: "buttons", text: long, buttons: [{ id: "a", title: "A" }] };
    expect(withIntro("*X* — a module.", o)).toBe(o);
  });
});

describe("withWayBack", () => {
  it("text → buttons with 🏠 Main menu", () => {
    const out = withWayBack({ type: "text", text: "Done." });
    expect(out).toMatchObject({ type: "buttons", buttons: [MENU_BUTTON] });
    expect(out.text).toContain("Done.");
    expect(out.text).toContain("What next?");
  });

  it("keeps a flow's own next-step buttons first and adds the menu after them", () => {
    const out = withWayBack({ type: "buttons", text: "Registered.", buttons: [{ id: "menu:checkin", title: "👶 Check in now" }] });
    expect(out.type === "buttons" ? out.buttons.map((b) => b.id) : []).toEqual(["menu:checkin", "main_menu"]);
  });

  it("is idempotent — an output that already offers the menu is unchanged", () => {
    const o: FlowOutput = { type: "buttons", text: "Hi", buttons: [{ id: "x", title: "X" }, MENU_BUTTON] };
    expect(withWayBack(o)).toBe(o);
    const twice = withWayBack(withWayBack({ type: "text", text: "Done." }));
    expect(twice.type === "buttons" ? twice.buttons.filter((b) => b.id === "main_menu").length : 0).toBe(1);
  });

  it("three buttons already → no room, so it says how to get back in text", () => {
    const out = withWayBack({ type: "buttons", text: "Choose", buttons: [{ id: "a", title: "A" }, { id: "b", title: "B" }, { id: "c", title: "C" }] });
    expect(out.type === "buttons" ? out.buttons.length : 0).toBe(3);
    expect(out.text).toContain(MENU_HINT);
  });

  it("lists get a Main menu row; a list that already has a nav row (help_more) is left alone", () => {
    const out = withWayBack({ type: "list", text: "Pick", buttonLabel: "Choose", rows: [{ id: "r1", title: "One" }] });
    expect(out.type === "list" ? out.rows.map((r) => r.id) : []).toEqual(["r1", "main_menu"]);
    const nav: FlowOutput = { type: "list", text: "Menu", buttonLabel: "Open", rows: [{ id: "grp:give", title: "Give" }, { id: "help_more", title: "How it works" }] };
    expect(withWayBack(nav)).toBe(nav);
  });

  it("a full list (10 rows) and a long text fall back to the plain 'type menu' line", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ id: `r${i}`, title: `R${i}` }));
    const full = withWayBack({ type: "list", text: "Pick", buttonLabel: "Choose", rows });
    expect(full.type === "list" ? full.rows.length : 0).toBe(10);
    expect(full.text).toContain(MENU_HINT);
    const long = withWayBack({ type: "text", text: "y".repeat(1500) });
    expect(long).toMatchObject({ type: "text" });
    expect(long.text).toContain(MENU_HINT);
  });

  it("a url button (web onboarding) keeps its link and gains the 'type menu' line", () => {
    const out = withWayBack({ type: "urlButton", text: "Verify your church", url: "https://x.test", buttonLabel: "Verify" });
    expect(out).toMatchObject({ type: "urlButton", url: "https://x.test" });
    expect(out.text).toContain(MENU_HINT);
  });
});
