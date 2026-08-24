"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Paper, PasswordInput, Stack, Text, TextInput, Title } from "@mantine/core";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import { createClient } from "@/lib/supabase/client";

// Unset in self-hosted/local deployments by design (see .env.example) --
// nothing here should require a third-party account to run this repo
// yourself. Only set once CAPTCHA is also enabled on the Supabase project's
// own Auth settings, which is what actually enforces the token.
const HCAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY;

function isEnterKey(event: KeyboardEvent<HTMLInputElement>) {
  return event.key === "Enter";
}

export function AuthForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captchaRef = useRef<HCaptcha>(null);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const captchaOptions = captchaToken ? { options: { captchaToken } } : {};
      const result =
        mode === "signin"
          ? await supabase.auth.signInWithPassword({ email, password, ...captchaOptions })
          : await supabase.auth.signUp({ email, password, ...captchaOptions });

      if (result.error) throw result.error;
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      // hCaptcha tokens are single-use -- every attempt (success or failure)
      // needs a fresh one before the next submit.
      captchaRef.current?.resetCaptcha();
      setCaptchaToken(null);
      setLoading(false);
    }
  }

  const captchaSatisfied = !HCAPTCHA_SITE_KEY || Boolean(captchaToken);

  return (
    <Paper withBorder radius="md" p="xl" maw={460} w="100%">
      <Stack>
        <Title order={2} ta="center">{mode === "signin" ? "Welcome to BookForge AI" : "Create account"}</Title>
        <Text c="dimmed" ta="center">
          Your manuscript stays private, and AI revision can run entirely on your own machine.
        </Text>
        {error && <Alert color="red">{error}</Alert>}
        <TextInput label="Email" value={email} onChange={(event) => setEmail(event.currentTarget.value)} />
        <PasswordInput
          label="Password"
          value={password}
          onChange={(event) => setPassword(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (isEnterKey(event) && captchaSatisfied) {
              event.preventDefault();
              void submit();
            }
          }}
        />
        {HCAPTCHA_SITE_KEY && (
          <HCaptcha ref={captchaRef} sitekey={HCAPTCHA_SITE_KEY} onVerify={setCaptchaToken} onExpire={() => setCaptchaToken(null)} />
        )}
        <Button color="grape" loading={loading} disabled={!captchaSatisfied} onClick={() => { void submit(); }}>
          {mode === "signin" ? "Login" : "Sign up"}
        </Button>
        <Button variant="subtle" color="dark" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
          {mode === "signin" ? "Need an account?" : "Already have an account?"}
        </Button>
      </Stack>
    </Paper>
  );
}
