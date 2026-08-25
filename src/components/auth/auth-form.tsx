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

// Outlook/Hotmail's "Safe Links" scanner auto-visits every URL in an
// incoming email server-side to check for phishing -- which silently burns
// a one-time confirmation link before the real user ever clicks it.
// Confirmed live: a signup on a hotmail.com address got "Email link is
// invalid or has expired" on the very first genuine click. A 6-digit code
// typed in by hand has nothing for a link-scanner to consume, so it's
// immune to this class of failure entirely.
function authErrorCode(error: unknown): string | undefined {
  if (error && typeof error === "object" && "code" in error) {
    return (error as { code?: unknown }).code as string | undefined;
  }
  return undefined;
}

export function AuthForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [mode, setMode] = useState<"signin" | "signup" | "verify">("signin");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captchaRef = useRef<HCaptcha>(null);

  function resetCaptcha() {
    captchaRef.current?.resetCaptcha();
    setCaptchaToken(null);
  }

  async function submit() {
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const supabase = createClient();
      const captchaOptions = captchaToken ? { options: { captchaToken } } : {};
      const result =
        mode === "signin"
          ? await supabase.auth.signInWithPassword({ email, password, ...captchaOptions })
          : await supabase.auth.signUp({ email, password, ...captchaOptions });

      if (result.error) {
        if (mode === "signin" && authErrorCode(result.error) === "email_not_confirmed") {
          setMode("verify");
          setInfo("Enter the 6-digit code we emailed you to finish confirming this account.");
          return;
        }
        throw result.error;
      }

      if (mode === "signup" && !result.data.session) {
        setMode("verify");
        setInfo(`We sent a 6-digit code to ${email}. Enter it below to finish creating your account.`);
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      // hCaptcha tokens are single-use -- every attempt (success or failure)
      // needs a fresh one before the next submit.
      resetCaptcha();
      setLoading(false);
    }
  }

  async function submitCode() {
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const supabase = createClient();
      const result = await supabase.auth.verifyOtp({ email, token: code, type: "signup" });
      if (result.error) throw result.error;
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code didn't work.");
    } finally {
      setLoading(false);
    }
  }

  async function resendCode() {
    setResending(true);
    setError(null);
    setInfo(null);
    try {
      const supabase = createClient();
      const result = await supabase.auth.resend({ type: "signup", email });
      if (result.error) throw result.error;
      setInfo(`Sent a new code to ${email}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't resend the code.");
    } finally {
      setResending(false);
    }
  }

  const captchaSatisfied = !HCAPTCHA_SITE_KEY || Boolean(captchaToken);

  if (mode === "verify") {
    return (
      <Paper withBorder radius="md" p="xl" maw={460} w="100%">
        <Stack>
          <Title order={2} ta="center">Confirm your email</Title>
          <Text c="dimmed" ta="center">
            Your manuscript stays private, and AI revision can run entirely on your own machine.
          </Text>
          {error && <Alert color="red">{error}</Alert>}
          {info && <Alert color="blue">{info}</Alert>}
          <TextInput
            label="6-digit code"
            value={code}
            onChange={(event) => setCode(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (isEnterKey(event)) {
                event.preventDefault();
                void submitCode();
              }
            }}
          />
          <Button color="grape" loading={loading} onClick={() => { void submitCode(); }}>
            Verify
          </Button>
          <Button variant="subtle" color="dark" loading={resending} onClick={() => { void resendCode(); }}>
            Resend code
          </Button>
          <Button
            variant="subtle"
            color="dark"
            onClick={() => {
              setMode("signin");
              setError(null);
              setInfo(null);
              setCode("");
            }}
          >
            Back to login
          </Button>
        </Stack>
      </Paper>
    );
  }

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
