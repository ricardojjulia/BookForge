import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthForm } from "./auth-form";

const push = vi.fn();
const refresh = vi.fn();
const signInWithPassword = vi.fn();
const signUp = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      signInWithPassword,
      signUp,
    },
  }),
}));

describe("AuthForm", () => {
  beforeEach(() => {
    push.mockReset();
    refresh.mockReset();
    signInWithPassword.mockReset();
    signUp.mockReset();
    signInWithPassword.mockResolvedValue({ error: null, data: { user: { id: "1" } } });
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
});
