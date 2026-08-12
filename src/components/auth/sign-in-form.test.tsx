import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Part A acceptance test (review-critical). The old sign-in form read
// lastWorkspaceSlug + onboarding-draft from localStorage and redirected to
// /w/${slug}/modules/toolkit (now deleted → 404). This test seeds those exact
// stale values and asserts sign-in STILL lands on /admin. If the legacy
// routing ever comes back, this fails.
const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn() }),
}));

const { signInMock } = vi.hoisted(() => ({ signInMock: vi.fn() }));
vi.mock("@/lib/services/supabase", () => ({
  getSupabaseBrowserClient: () => ({
    auth: { signInWithPassword: signInMock },
  }),
}));

import { SignInForm } from "@/components/auth/sign-in-form";

beforeEach(() => {
  pushMock.mockReset();
  signInMock.mockReset();
  signInMock.mockResolvedValue({ error: null, data: { user: { email: "admin@chertt.com" } } });
  // Seed the exact stale legacy state that used to break sign-in
  window.localStorage.clear();
  window.localStorage.setItem("chertt-last-workspace-slug", "grace-chapel");
  window.localStorage.setItem(
    "chertt-onboarding-draft",
    JSON.stringify({ selectedModule: "toolkit", fields: { email: "admin@chertt.com" } }),
  );
});

describe("SignInForm — admin sign-in (no legacy routing)", () => {
  it("lands on /admin even with a stale lastWorkspaceSlug in localStorage", async () => {
    render(<SignInForm />);

    fireEvent.change(screen.getByPlaceholderText("admin@church.org"), {
      target: { value: "admin@chertt.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("••••••••"), {
      target: { value: "password1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    // Wait for the async submit to complete
    await vi.waitFor(() => expect(pushMock).toHaveBeenCalled());

    // The ONLY acceptable redirect target is /admin — never /w/* or /auth/setup
    expect(pushMock).toHaveBeenCalledWith("/admin");
    expect(pushMock).not.toHaveBeenCalledWith(expect.stringContaining("/w/"));
    expect(pushMock).not.toHaveBeenCalledWith(expect.stringContaining("/auth/setup"));
  });

  it("shows a mapped error when credentials are wrong", async () => {
    signInMock.mockResolvedValue({ error: { message: "Invalid login credentials" } });

    render(<SignInForm />);
    fireEvent.change(screen.getByPlaceholderText("admin@church.org"), {
      target: { value: "admin@chertt.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("••••••••"), {
      target: { value: "wrongpass1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await vi.waitFor(() => expect(screen.getByText("Incorrect email or password.")).toBeInTheDocument());
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("does not call auth when the email is invalid", async () => {
    render(<SignInForm />);
    fireEvent.change(screen.getByPlaceholderText("admin@church.org"), {
      target: { value: "not-an-email" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    // Native type="email" validation (or our handler) blocks submission —
    // the real assertion is that auth is never called.
    expect(signInMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });
});
