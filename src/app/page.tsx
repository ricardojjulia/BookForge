import {
  Anchor,
  Badge,
  Box,
  Button,
  Container,
  Divider,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import {
  IconBook2,
  IconBrain,
  IconBrandGithub,
  IconChecklist,
  IconCloud,
  IconLock,
  IconPencilStar,
  IconServer,
  IconShieldCheck,
} from "@tabler/icons-react";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const features = [
  {
    icon: IconBook2,
    title: "Structured manuscripts",
    text: "Import books into chapters, scenes, and paragraphs so long manuscripts are revised safely.",
  },
  {
    icon: IconPencilStar,
    title: "Revision studio",
    text: "Humanize, polish dialogue, improve pacing, preserve voice, and strengthen chapter endings.",
  },
  {
    icon: IconBrain,
    title: "BookForge Critic",
    text: "Prebuilt evaluator lenses review structure, prose, continuity, market fit, and revision priorities.",
  },
  {
    icon: IconLock,
    title: "Author control",
    text: "Original text is never overwritten. Revisions are accepted, rejected, or reworked by the author.",
  },
];

const stats = [
  { value: "8", label: "Critic evaluator lenses" },
  { value: "100%", label: "Author-approved edits" },
  { value: "3+", label: "AI providers, or run local" },
];

const plans = [
  { name: "Starter", price: "$15", blurb: "DeepSeek V4 Pro for every task." },
  { name: "Pro", price: "$35", blurb: "Adds Gemini Flash and Claude Haiku." },
  { name: "Studio", price: "$89", blurb: "Claude Opus 5 on Critic and Rewrite passes.", highlight: true },
  { name: "Publisher", price: "$219", blurb: "Team seats and a priority queue." },
];

export default async function Home() {
  let loggedIn = false;
  if (hasSupabaseEnv()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    loggedIn = Boolean(user);
  }
  const importHref = loggedIn ? "/books/new" : "/auth";
  const ctaLabel = loggedIn ? "Import Manuscript" : "Sign In to Get Started";

  return (
    <Box bg="#fbfaf8" mih="100vh">
      <Box
        pos="sticky"
        top={0}
        style={{ zIndex: 10, backdropFilter: "blur(8px)", borderBottom: "1px solid #ece6e9" }}
        bg="rgba(251, 250, 248, 0.85)"
      >
        <Container size="xl">
          <Group justify="space-between" py="md">
            <Group gap="xs">
              <ThemeIcon size="lg" radius="sm" color="grape">
                <IconBook2 size={20} />
              </ThemeIcon>
              <Title order={3}>BookForge AI</Title>
            </Group>
            <Group gap="xl">
              <Anchor href="#plans" c="dimmed" fw={500} visibleFrom="sm">
                Pricing
              </Anchor>
              <Anchor
                href="https://github.com/ricardojjulia/BookForge"
                target="_blank"
                rel="noopener noreferrer"
                c="dimmed"
                fw={500}
                visibleFrom="sm"
              >
                Self-host on GitHub
              </Anchor>
              <Anchor href="/auth" fw={500}>
                Login
              </Anchor>
              <Button component="a" href={importHref} color="grape" radius="md">
                Get Started
              </Button>
            </Group>
          </Group>
        </Container>
      </Box>

      <Box
        pos="relative"
        style={{
          overflow: "hidden",
          background:
            "radial-gradient(60% 55% at 78% 0%, oklch(0.9 0.05 320 / 0.55) 0%, transparent 70%), radial-gradient(45% 40% at 10% 15%, oklch(0.93 0.03 280 / 0.5) 0%, transparent 70%)",
        }}
      >
        <Container size="xl" py={80}>
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing={48} verticalSpacing={48}>
            <Stack gap="lg" justify="center">
              <Badge color="grape" variant="light" w="fit-content">
                Commercial-ready manuscript revision platform
              </Badge>
              <Title fz={{ base: 40, md: 64 }} lh={1.04} maw={760}>
                Publish-ready revision power without losing your voice.
              </Title>
              <Text fz="xl" c="dimmed" maw={640}>
                Structured AI workflows built for serious authors and publishing teams.
                Your book stays secure in your own Supabase project, and AI can run
                locally through LM Studio or scale up with cloud providers.
              </Text>
              <Group mt="md" gap="sm">
                <Button component="a" href={importHref} size="lg" color="grape">
                  {ctaLabel}
                </Button>
                <Button component="a" href="#plans" size="lg" variant="default">
                  See plans
                </Button>
              </Group>
              <Group gap="xl" mt="xs">
                {stats.map((stat) => (
                  <div key={stat.label}>
                    <Text fz={28} fw={800} lh={1}>
                      {stat.value}
                    </Text>
                    <Text size="sm" c="dimmed">
                      {stat.label}
                    </Text>
                  </div>
                ))}
              </Group>
            </Stack>

            <Paper withBorder radius="lg" p="xl" bg="white" shadow="md">
              <Stack gap="lg">
                <Group align="flex-start">
                  <ThemeIcon color="teal" variant="light" size={46} radius="md">
                    <IconServer size={24} />
                  </ThemeIcon>
                  <div>
                    <Title order={3}>Built for structured, author-controlled growth</Title>
                    <Text c="dimmed">
                      Every chapter, scene, and revision is tracked with full history,
                      so teams can collaborate confidently and scale quality across the
                      entire manuscript lifecycle.
                    </Text>
                  </div>
                </Group>

                <Paper p="md" radius="md" bg="#f5f0f7">
                  <Group gap="sm" mb="xs">
                    <IconChecklist size={18} />
                    <Text fw={700}>Brand-safe guardrails</Text>
                  </Group>
                  <Text c="dimmed">
                    Your voice leads every decision. Original text stays protected,
                    revision history stays auditable, and acceptance is always manual.
                  </Text>
                </Paper>

                <Divider />

                <Group gap="lg">
                  <Group gap={6}>
                    <IconServer size={16} color="var(--mantine-color-teal-6)" />
                    <Text size="sm" fw={500}>
                      Self-hosted, free forever
                    </Text>
                  </Group>
                  <Group gap={6}>
                    <IconCloud size={16} color="var(--mantine-color-grape-6)" />
                    <Text size="sm" fw={500}>
                      Or managed &amp; metered
                    </Text>
                  </Group>
                </Group>
              </Stack>
            </Paper>
          </SimpleGrid>
        </Container>
      </Box>

      <Container size="xl" pb={80}>
        <SimpleGrid cols={{ base: 1, md: 4 }}>
          {features.map((feature) => (
            <Paper key={feature.title} withBorder radius="md" p="lg" bg="white" shadow="xs">
              <ThemeIcon color="grape" variant="light" mb="md" radius="md">
                <feature.icon size={20} />
              </ThemeIcon>
              <Text fw={700}>{feature.title}</Text>
              <Text size="sm" c="dimmed" mt={6}>
                {feature.text}
              </Text>
            </Paper>
          ))}
        </SimpleGrid>
      </Container>

      <Box id="plans" bg="#20142a" py={80}>
        <Container size="xl">
          <Stack gap="xs" align="center" ta="center" mb={48}>
            <Badge color="grape" variant="light">
              Simple, metered pricing
            </Badge>
            <Title order={2} c="white">
              Bring your own infrastructure, or let us run it
            </Title>
            <Text c="#c9bfd1" maw={560}>
              Self-host for free with your own Supabase project and API keys, or
              subscribe to the managed platform — billing, model access, and credits
              handled for you.
            </Text>
          </Stack>

          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="lg">
            {plans.map((plan) => (
              <Paper
                key={plan.name}
                radius="lg"
                p="xl"
                pos="relative"
                bg={plan.highlight ? "grape.9" : "#2b1d38"}
                style={{
                  border: plan.highlight ? "1px solid var(--mantine-color-grape-4)" : "1px solid #3d2c4c",
                }}
              >
                {plan.highlight && (
                  <Badge
                    color="grape"
                    variant="filled"
                    pos="absolute"
                    top={-12}
                    left="50%"
                    style={{ transform: "translateX(-50%)" }}
                  >
                    Most popular
                  </Badge>
                )}
                <Stack gap={4}>
                  <Text c="white" fw={700} fz="lg">
                    {plan.name}
                  </Text>
                  <Group gap={4} align="baseline">
                    <Text c="white" fz={32} fw={800}>
                      {plan.price}
                    </Text>
                    <Text c="#c9bfd1" fz="sm">
                      /mo
                    </Text>
                  </Group>
                  <Text c="#c9bfd1" size="sm" mt="xs" mih={40}>
                    {plan.blurb}
                  </Text>
                  <Button
                    component="a"
                    href={importHref}
                    mt="md"
                    variant={plan.highlight ? "white" : "outline"}
                    color={plan.highlight ? "grape" : "gray.4"}
                    fullWidth
                  >
                    {loggedIn ? "Manage plan" : "Get started"}
                  </Button>
                </Stack>
              </Paper>
            ))}
          </SimpleGrid>

          <Group justify="center" mt={40} gap={6}>
            <IconShieldCheck size={16} color="#c9bfd1" />
            <Text size="sm" c="#c9bfd1">
              Prefer to self-host? It&apos;s free, unrestricted, and takes about ten minutes.
            </Text>
            <Anchor
              href="https://github.com/ricardojjulia/BookForge/blob/main/docs/SELF_HOSTING.md"
              target="_blank"
              rel="noopener noreferrer"
              size="sm"
              fw={600}
            >
              Read the guide
            </Anchor>
          </Group>
        </Container>
      </Box>

      <Box style={{ borderTop: "1px solid #ece6e9" }} py="xl">
        <Container size="xl">
          <Group justify="space-between">
            <Group gap="xs">
              <ThemeIcon size="sm" radius="sm" color="grape" variant="light">
                <IconBook2 size={14} />
              </ThemeIcon>
              <Text size="sm" c="dimmed">
                &copy; {new Date().getFullYear()} BookForge AI
              </Text>
            </Group>
            <Group gap="lg">
              <Anchor href="/auth" size="sm" c="dimmed">
                Login
              </Anchor>
              <Anchor href="#plans" size="sm" c="dimmed">
                Pricing
              </Anchor>
              <Anchor
                href="https://github.com/ricardojjulia/BookForge"
                target="_blank"
                rel="noopener noreferrer"
                size="sm"
                c="dimmed"
              >
                <Group gap={4}>
                  <IconBrandGithub size={16} />
                  GitHub
                </Group>
              </Anchor>
            </Group>
          </Group>
        </Container>
      </Box>
    </Box>
  );
}
