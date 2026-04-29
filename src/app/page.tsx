import {
  Anchor,
  Badge,
  Box,
  Button,
  Container,
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
  IconChecklist,
  IconLock,
  IconPencilStar,
  IconServer,
} from "@tabler/icons-react";

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

export default function Home() {
  return (
    <Box bg="#fbfaf8" mih="100vh">
      <Container size="xl" py="xl">
        <Group justify="space-between" mb={80}>
          <Group gap="xs">
            <ThemeIcon size="lg" radius="sm" color="grape">
              <IconBook2 size={20} />
            </ThemeIcon>
            <Title order={3}>BookForge AI</Title>
          </Group>
          <Group>
            <Anchor href="/auth">
              Login
            </Anchor>
            <Button component="a" href="/dashboard" color="grape">
              Open Studio
            </Button>
          </Group>
        </Group>

        <SimpleGrid cols={{ base: 1, md: 2 }} spacing={48} verticalSpacing={48}>
          <Stack gap="lg" justify="center">
            <Badge color="grape" variant="light" w="fit-content">
              Local AI revision studio
            </Badge>
            <Title fz={{ base: 44, md: 68 }} lh={1.02} maw={760}>
              Revise a full manuscript without losing the book.
            </Title>
            <Text fz="xl" c="dimmed" maw={700}>
              Your manuscript is stored securely in your Supabase project. AI
              revision runs locally through LM Studio.
            </Text>
            <Group mt="md">
              <Button component="a" href="/books/new" size="lg" color="grape">
                Import Manuscript
              </Button>
              <Button component="a" href="/settings" size="lg" variant="outline" color="dark">
                Configure LM Studio
              </Button>
            </Group>
          </Stack>

          <Paper withBorder radius="md" p="xl" bg="white">
            <Stack gap="lg">
              <Group align="flex-start">
                <ThemeIcon color="teal" variant="light" size={46}>
                  <IconServer size={24} />
                </ThemeIcon>
                <div>
                  <Title order={3}>Built for private, structured revision</Title>
                  <Text c="dimmed">
                    Supabase stores the book structure and history. LM Studio handles
                    analysis and revision through an OpenAI-compatible local endpoint.
                  </Text>
                </div>
              </Group>
              <Paper p="md" radius="sm" bg="#f5f0f7">
                <Group gap="sm" mb="xs">
                  <IconChecklist size={18} />
                  <Text fw={700}>Guardrails</Text>
                </Group>
                <Text c="dimmed">
                  No whole-book rewrite prompts, no silent character renames, no
                  original text overwrites, and no public AI API calls unless a future
                  setting explicitly enables them.
                </Text>
              </Paper>
            </Stack>
          </Paper>
        </SimpleGrid>

        <SimpleGrid cols={{ base: 1, md: 4 }} mt={70}>
          {features.map((feature) => (
            <Paper key={feature.title} withBorder radius="md" p="lg" bg="white">
              <ThemeIcon color="grape" variant="light" mb="md">
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
    </Box>
  );
}
