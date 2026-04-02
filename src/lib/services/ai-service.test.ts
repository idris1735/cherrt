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
});
