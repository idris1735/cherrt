import { runCherttCommand } from "@/lib/services/ai-service";

describe("runCherttCommand", () => {
  it("creates a document for general drafting prompts", async () => {
    const result = await runCherttCommand("Draft a partnership letter for our sponsor.");

    expect(result.generatedDocument).toBeDefined();
    expect(result.generatedDocument?.type).toBe("letter");
    expect(result.artifact?.kind).toBe("document");
  });

  it("creates an approval workflow for expense prompts", async () => {
    const result = await runCherttCommand("Raise an expense request for diesel tonight.");

    expect(result.generatedRequest).toBeDefined();
    expect(result.generatedRequest?.status).toBe("pending");
    expect(result.generatedRequest?.approvalSteps).toHaveLength(2);
  });

  it("creates a payment link for invoice prompts", async () => {
    const result = await runCherttCommand("Generate a payment link for this invoice.");

    expect(result.generatedPaymentLink).toBeDefined();
    expect(result.generatedDocument?.type).toBe("invoice");
    expect(result.artifact?.kind).toBe("payment-link");
  });

  it("creates an appointment for scheduling prompts", async () => {
    const result = await runCherttCommand("Create an appointment for vendor sign-off tomorrow.");

    expect(result.generatedAppointment).toBeDefined();
    expect(result.artifact?.kind).toBe("appointment");
  });

  it("creates a simple form for form prompts", async () => {
    const result = await runCherttCommand("Create a form for office maintenance requests.");

    expect(result.generatedForm).toBeDefined();
    expect(result.artifact?.kind).toBe("form");
  });

  it("creates inventory records for stock prompts", async () => {
    const result = await runCherttCommand("Add a new inventory stock item for printer paper.");

    expect(result.generatedInventoryItem).toBeDefined();
    expect(result.artifact?.kind).toBe("inventory");
  });

  it("creates issue reports for facility prompts", async () => {
    const result = await runCherttCommand("Log an issue for the broken AC in the front office.");

    expect(result.generatedIssueReport).toBeDefined();
    expect(result.artifact?.kind).toBe("issue");
  });

  it("creates expense entries for petty cash logs", async () => {
    const result = await runCherttCommand("Log expense for petty cash fuel purchase.");

    expect(result.generatedExpenseEntry).toBeDefined();
    expect(result.artifact?.kind).toBe("expense-log");
  });

  it("creates polls for feedback prompts", async () => {
    const result = await runCherttCommand("Create a poll for weekly staff feedback.");

    expect(result.generatedPoll).toBeDefined();
    expect(result.artifact?.kind).toBe("poll");
  });

  it("creates directory profiles for staff add prompts", async () => {
    const result = await runCherttCommand("Add staff profile to directory for new operations intern.");

    expect(result.generatedPerson).toBeDefined();
    expect(result.artifact?.kind).toBe("directory");
  });

  it("routes church intents to church module workflows", async () => {
    const result = await runCherttCommand("Create a prayer request for healing this week.");

    expect(result.generatedRequest).toBeDefined();
    expect(result.generatedRequest?.module).toBe("church");
  });

  it("routes store intents to store module workflows", async () => {
    const result = await runCherttCommand("Capture a new store order for three branded polos.");

    expect(result.generatedRequest).toBeDefined();
    expect(result.generatedRequest?.module).toBe("store");
  });

  it("routes events intents to event module workflows", async () => {
    const result = await runCherttCommand("Set up RSVP reminders for this weekend gala.");

    expect(result.generatedRequest).toBeDefined();
    expect(result.generatedRequest?.module).toBe("events");
  });
});
