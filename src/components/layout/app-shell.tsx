"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Anchor, AppShell as MantineAppShell, Button, Group, Menu, Text, UnstyledButton } from "@mantine/core";
import { IconChevronDown, IconLogout, IconShieldCog } from "@tabler/icons-react";
import { isManagedSaasDeployment } from "@/lib/deployment/mode";
import { createClient } from "@/lib/supabase/client";
import { GlobalJobIndicator } from "@/components/layout/global-job-indicator";

const ALL_NAV_LINKS = [
  { href: "/dashboard", label: "My Book Room" },
  { href: "/books/new", label: "Import" },
  { href: "/creativewriter", label: "CreativeWriter" },
  { href: "/series", label: "Series" },
  { href: "/analytics", label: "Analytics" },
  { href: "/settings", label: "Settings" },
  { href: "/account", label: "Account" },
];

// No per-user entitlement system exists yet, so managed-SaaS deployments hide
// CreativeWriter from nav entirely rather than showing a link every account
// can click into. See src/lib/creativewriter-ui/access.ts for the route gate.
const NAV_LINKS = isManagedSaasDeployment()
  ? ALL_NAV_LINKS.filter((link) => link.href !== "/creativewriter")
  : ALL_NAV_LINKS;

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [email, setEmail] = useState<string | null>(null);
  const [isSteward, setIsSteward] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    async function syncUser(userId: string | null, userEmail: string | null) {
      setEmail(userEmail);
      if (!userId) {
        setIsSteward(false);
        return;
      }
      const { data: profile } = await supabase.from("profiles").select("platform_role").eq("id", userId).maybeSingle();
      setIsSteward(profile?.platform_role === "steward");
    }

    supabase.auth.getUser().then(({ data }) => syncUser(data.user?.id ?? null, data.user?.email ?? null));
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      void syncUser(session?.user?.id ?? null, session?.user?.email ?? null);
    });
    return () => subscription.subscription.unsubscribe();
  }, []);

  async function signOut() {
    setSigningOut(true);
    try {
      await createClient().auth.signOut();
      router.push("/auth");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <MantineAppShell header={{ height: 64 }} padding="md">
      <MantineAppShell.Header
        px={40}
        style={{ borderBottom: "1px solid oklch(0.92 0.003 90)" }}
      >
        <Group h="100%" justify="space-between" wrap="nowrap">
          <Group gap={10} wrap="nowrap">
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                overflow: "hidden",
                flexShrink: 0,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- tiny static nav-bar mark, not worth next/image's overhead */}
              <img
                src="/bookforge-mark.png"
                alt="BookForge AI"
                width={30}
                height={30}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </div>
            <Text style={{ fontWeight: 700, fontSize: 16, color: "oklch(0.2 0.005 90)" }}>BookForge AI</Text>
          </Group>
          <Group gap={20} wrap="nowrap">
            {NAV_LINKS.map((link) => {
              const active = pathname === link.href || pathname?.startsWith(`${link.href}/`);
              return (
                <Anchor
                  key={link.href}
                  component={Link}
                  href={link.href}
                  underline="never"
                  style={{
                    fontWeight: active ? 600 : 500,
                    fontSize: 14,
                    color: active ? "oklch(0.5 0.16 275)" : "oklch(0.45 0.005 90)",
                  }}
                >
                  {link.label}
                </Anchor>
              );
            })}
            {email ? (
              <Group gap="xs" wrap="nowrap">
                <GlobalJobIndicator />
                <Menu shadow="md" width={200} position="bottom-end">
                  <Menu.Target>
                    <UnstyledButton
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        border: "1px solid oklch(0.9 0.003 90)",
                        borderRadius: 8,
                        padding: "7px 10px",
                      }}
                    >
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: "oklch(0.65 0.16 145)",
                          flexShrink: 0,
                        }}
                      />
                      <Text
                        style={{
                          fontSize: 13,
                          color: "oklch(0.4 0.005 90)",
                          maxWidth: 220,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {email}
                      </Text>
                      <IconChevronDown size={14} color="var(--mantine-color-dimmed)" />
                    </UnstyledButton>
                  </Menu.Target>
                  <Menu.Dropdown>
                    {isSteward && (
                      <Menu.Item component={Link} href="/steward" leftSection={<IconShieldCog size={16} />}>
                        Steward console
                      </Menu.Item>
                    )}
                    <Menu.Item leftSection={<IconLogout size={16} />} onClick={() => void signOut()} disabled={signingOut}>
                      Sign out
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </Group>
            ) : (
              <Button component={Link} href="/auth" variant="light" color="grape" size="xs">
                Sign In
              </Button>
            )}
          </Group>
        </Group>
      </MantineAppShell.Header>
      <MantineAppShell.Main bg="#fbfaf8">{children}</MantineAppShell.Main>
    </MantineAppShell>
  );
}
