import { Alert, Badge, Button, Container, Group, Paper, Stack, Table, Text, Title } from "@mantine/core";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { DataFreshnessBanner } from "@/components/layout/data-freshness-banner";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type CourseRow = {
  id: string;
  title: string;
  status: string;
  description: string | null;
  source_book_id: string;
  updated_at: string;
};

type ModuleRow = {
  id: string;
  title: string;
  module_order: number;
};

type LessonRow = {
  id: string;
  module_id: string | null;
  title: string;
  lesson_type: string;
  lesson_order: number;
};

type AssetRow = {
  id: string;
  asset_type: string;
  title: string;
  created_at: string;
};

function isMissingTableError(message: string | undefined, table: string) {
  if (!message) return false;
  return message.includes(`relation \"public.${table}\" does not exist`) || message.includes(`relation \"${table}\" does not exist`);
}

export default async function CourseDetailPage({ params }: { params: Promise<{ courseId: string }> }) {
  if (!hasSupabaseEnv()) {
    return (
      <AppShell>
        <Container>
          <Alert color="yellow">Configure Supabase before opening course details.</Alert>
        </Container>
      </AppShell>
    );
  }

  const { courseId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <AppShell>
        <Container size="lg">
          <Alert color="grape" title="Login required">
            Sign in to view course details.
          </Alert>
        </Container>
      </AppShell>
    );
  }

  const [courseResponse, modulesResponse, lessonsResponse, assetsResponse] = await Promise.all([
    supabase
      .from("courses")
      .select("id,title,status,description,source_book_id,updated_at")
      .eq("id", courseId)
      .maybeSingle(),
    supabase.from("course_modules").select("id,title,module_order").eq("course_id", courseId).order("module_order"),
    supabase
      .from("course_lessons")
      .select("id,module_id,title,lesson_type,lesson_order")
      .eq("course_id", courseId)
      .order("lesson_order"),
    supabase.from("course_assets").select("id,asset_type,title,created_at").eq("course_id", courseId).order("created_at", { ascending: false }),
  ]);

  const missingCoursesTable = isMissingTableError(courseResponse.error?.message, "courses");

  if (missingCoursesTable) {
    return (
      <AppShell>
        <Container size="lg">
          <Alert color="yellow" title="Course tables are not deployed yet">
            Run the latest Supabase migrations to enable course details.
          </Alert>
        </Container>
      </AppShell>
    );
  }

  if (courseResponse.error || !courseResponse.data) {
    return (
      <AppShell>
        <Container size="lg">
          <Alert color="red">Course not found or you do not have access.</Alert>
        </Container>
      </AppShell>
    );
  }

  const course = courseResponse.data as CourseRow;
  const modules = (modulesResponse.data || []) as ModuleRow[];
  const lessons = (lessonsResponse.data || []) as LessonRow[];
  const assets = (assetsResponse.data || []) as AssetRow[];

  const lessonsByModule = new Map<string, LessonRow[]>();
  for (const lesson of lessons) {
    const key = lesson.module_id || "unassigned";
    const current = lessonsByModule.get(key) || [];
    current.push(lesson);
    lessonsByModule.set(key, current);
  }

  const { data: sourceBook } = await supabase.from("books").select("id,title").eq("id", course.source_book_id).maybeSingle();

  return (
    <AppShell>
      <Container size="xl">
        <DataFreshnessBanner
          routeKey={`course:${courseId}:detail`}
          fetchedAt={new Date().toISOString()}
          label="Course details"
          staleAfterHours={6}
          forceAfterHours={12}
        />
        <Group justify="space-between" mb="xl" align="flex-start">
          <div>
            <Group gap="sm" mb={4}>
              <Title>{course.title}</Title>
              <Badge color="blue" variant="light">
                {course.status}
              </Badge>
            </Group>
            <Text c="dimmed">Source manuscript: {sourceBook?.title || "Book"}</Text>
            {course.description && (
              <Text mt="xs">{course.description}</Text>
            )}
          </div>
          <Group>
            <Button component={Link} href={`/books/${course.source_book_id}/publishing-lab`} variant="light" color="orange">
              Publishing Lab
            </Button>
            <Button component={Link} href="/courses" variant="light" color="dark">
              Back to Courses
            </Button>
          </Group>
        </Group>

        <Group mb="md" gap="xs">
          <Badge color="grape" variant="outline">
            {modules.length} modules
          </Badge>
          <Badge color="teal" variant="outline">
            {lessons.length} lessons
          </Badge>
          <Badge color="orange" variant="outline">
            {assets.length} assets
          </Badge>
          <Text size="xs" c="dimmed">
            Updated {new Date(course.updated_at).toLocaleString()}
          </Text>
        </Group>

        <Stack gap="md" mb="xl">
          {modules.map((module) => {
            const moduleLessons = lessonsByModule.get(module.id) || [];
            return (
              <Paper key={module.id} withBorder radius="md" p="lg" bg="white">
                <Group justify="space-between" mb="xs">
                  <Title order={3}>{module.module_order}. {module.title}</Title>
                  <Badge color="teal" variant="light">{moduleLessons.length} lesson(s)</Badge>
                </Group>
                {moduleLessons.length ? (
                  <Stack gap={6}>
                    {moduleLessons
                      .slice()
                      .sort((a, b) => a.lesson_order - b.lesson_order)
                      .map((lesson) => (
                        <Text key={lesson.id} size="sm">
                          {lesson.lesson_order}. {lesson.title} <Text span c="dimmed">({lesson.lesson_type})</Text>
                        </Text>
                      ))}
                  </Stack>
                ) : (
                  <Text size="sm" c="dimmed">No lessons for this module yet.</Text>
                )}
              </Paper>
            );
          })}

          {!modules.length && (
            <Paper withBorder radius="md" p="lg" bg="white">
              <Text c="dimmed">No modules generated yet. Run Publish to Course Assets from Publishing Lab.</Text>
            </Paper>
          )}
        </Stack>

        <Paper withBorder radius="md" p="lg" bg="white">
          <Title order={3} mb="sm">Published Assets</Title>
          {assets.length ? (
            <Table highlightOnHover withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Type</Table.Th>
                  <Table.Th>Title</Table.Th>
                  <Table.Th>Created</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {assets.slice(0, 40).map((asset) => (
                  <Table.Tr key={asset.id}>
                    <Table.Td>{asset.asset_type}</Table.Td>
                    <Table.Td>{asset.title}</Table.Td>
                    <Table.Td>{new Date(asset.created_at).toLocaleString()}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          ) : (
            <Text c="dimmed">No assets published yet.</Text>
          )}
        </Paper>
      </Container>
    </AppShell>
  );
}
