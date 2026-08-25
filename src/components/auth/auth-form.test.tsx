import { MantineProvider } from "@mantine/core";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthForm } from "./auth-form";

const push = vi.fn();
const refresh = vi.fn();
const signInWithPassword = vi.fn();
const signUp = vi.fn();
const verifyOtp = vi.fn();
const resend = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      signInWithPassword,
      signUp,
      verifyOtp,
      resend,
    },
  }),
}));

describe("AuthForm", () => {
  beforeEach(() => {
    push.mockReset();
    refresh.mockReset();
    signInWithPassword.mockReset();
    signUp.mockReset();
    verifyOtp.mockReset();
    resend.mockReset();
    signInWithPassword.mockResolvedValue({ error: null, data: { user: { id: "1" } } });
  });

  afterEach(() => {
    cleanup();
  });

  it("submits the sign-in form when the user presses Enter in the password field", async () => {
    const user = userEvent.setup();

    render(
      <MantineProvider>
        <AuthForm />
      </MantineProvider>,
    );

    await user.type(screen.getByLabelText("Email"), "demo@example.com");
    await user.type(screen.getByLabelText("Password"), "super-secret{enter}");

    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "demo@example.com",
      password: "super-secret",
    });
    expect(push).toHaveBeenCalledWith("/dashboard");
    expect(refresh).toHaveBeenCalled();
  });

  it("drops into the code-verification step when signup requires email confirmation", async () => {
    const user = userEvent.setup();
    signUp.mockResolvedValue({ error: null, data: { user: { id: "1" }, session: null } });
    verifyOtp.mockResolvedValue({ error: null, data: { session: { access_token: "t" } } });

    render(
      <MantineProvider>
        <AuthForm />
      </MantineProvider>,
    );

    await user.click(screen.getByText("Need an account?"));
    await user.type(screen.getByLabelText("Email"), "new@example.com");
    await user.type(screen.getByLabelText("Password"), "super-secret");
    await user.click(screen.getByText("Sign up"));

    expect(await screen.findByLabelText("6-digit code")).toBeInTheDocument();

    await user.type(screen.getByLabelText("6-digit code"), "123456");
    await user.click(screen.getByText("Verify"));

    expect(verifyOtp).toHaveBeenCalledWith({ email: "new@example.com", token: "123456", type: "signup" });
    expect(push).toHaveBeenCalledWith("/dashboard");
  });

  it("routes an unconfirmed sign-in straight to the code step instead of a dead-end error", async () => {
    const user = userEvent.setup();
    signInWithPassword.mockResolvedValue({ error: { message: "Email not confirmed", code: "email_not_confirmed" } });

    render(
      <MantineProvider>
        <AuthForm />
      </MantineProvider>,
    );

    await user.type(screen.getByLabelText("Email"), "unconfirmed@example.com");
    await user.type(screen.getByLabelText("Password"), "super-secret{enter}");

    expect(await screen.findByLabelText("6-digit code")).toBeInTheDocument();
  });

  it("lets the user resend a code from the verification step", async () => {
    const user = userEvent.setup();
    signInWithPassword.mockResolvedValue({ error: { message: "Email not confirmed", code: "email_not_confirmed" } });
    resend.mockResolvedValue({ error: null });

    render(
      <MantineProvider>
        <AuthForm />
      </MantineProvider>,
    );

    await user.type(screen.getByLabelText("Email"), "unconfirmed@example.com");
    await user.type(screen.getByLabelText("Password"), "super-secret{enter}");
    await screen.findByLabelText("6-digit code");

    await user.click(screen.getByText("Resend code"));

    expect(resend).toHaveBeenCalledWith({ type: "signup", email: "unconfirmed@example.com" });
  });
});
