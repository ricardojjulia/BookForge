import { Stack } from "@mantine/core";
import Image from "next/image";
import { AuthForm } from "@/components/auth/auth-form";

export default function AuthPage() {
  return (
    <Stack align="center" justify="center" mih="100vh" bg="#fbfaf8" p="md" gap="xl">
      <Image src="/bookforge-icon.png" alt="BookForge AI" width={96} height={96} style={{ borderRadius: 20 }} priority />
      <AuthForm />
    </Stack>
  );
}
