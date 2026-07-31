"use client";

import { useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Paper, PasswordInput, Stack, Text, TextInput, Title } from "@mantine/core";
import { createClient } from "@/lib/supabase/client";

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

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const result =
        mode === "signin"
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({ email, password });

      if (result.error) throw result.error;
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Paper withBorder radius="md" p="xl" maw={460} w="100%">
      <Stack>
        <Title order={2}>{mode === "signin" ? "Login" : "Create account"}</Title>
        <Text c="dimmed">
          Your manuscript is stored in Supabase. AI revision runs locally through LM Studio.
        </Text>
        {error && <Alert color="red">{error}</Alert>}
        <TextInput label="Email" value={email} onChange={(event) => setEmail(event.currentTarget.value)} />
        <PasswordInput
          label="Password"
          value={password}
          onChange={(event) => setPassword(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (isEnterKey(event)) {
              event.preventDefault();
              void submit();
            }
          }}
        />
        <Button color="grape" loading={loading} onClick={() => { void submit(); }}>
          {mode === "signin" ? "Login" : "Sign up"}
        </Button>
        <Button variant="subtle" color="dark" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
          {mode === "signin" ? "Need an account?" : "Already have an account?"}
        </Button>
      </Stack>
    </Paper>
  );
}
