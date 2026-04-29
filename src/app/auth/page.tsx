import { Center } from "@mantine/core";
import { AuthForm } from "@/components/auth/auth-form";

export default function AuthPage() {
  return (
    <Center mih="100vh" bg="#fbfaf8" p="md">
      <AuthForm />
    </Center>
  );
}
