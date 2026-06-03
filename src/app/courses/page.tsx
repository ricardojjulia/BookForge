import { Alert, Badge, Button, Container, Group, Paper, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { DataFreshnessBanner } from "@/components/layout/data-freshness-banner";
import { buildCourseAggregates } from "@/lib/course/stats";
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

function isMissingTableError(message: string | undefined, table: string) {
  if (!message) return false;
  return message.includes(`relation \"public.${table}\" does not exist`) || message.includes(`relation \"${table}\" does not exist`);
}

export default async function CoursesPage() {
  if (!hasSupabaseEnv()) {
    return (
      <AppShell>
        <Container>
          <Alert color="yellow">Configure Supabase before opening courses.</Alert>
        </Container>
      </AppShell>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <AppShell>
        <Container size="lg">
          <Alert color="grape" title="Login required">
            Sign in to view your generated courses.
          </Alert>
        </Container>
      </AppShell>
    );
  }

  const { data: courses, error: coursesError } = await supabase
    .from("courses")
    .select("id,title,status,description,source_book_id,updated_at")
    .order("updated_at", { ascending: false })
    .limit(60);

  const missingCoursesTable = isMissingTableError(coursesError?.message, "courses");
  if (coursesError && !missingCoursesTable) {
    return (
      <AppShell>
        <Container size="lg">
          <Alert color="red">Unable to load courses right now.</Alert>
        </Container>
      </AppShell>
    );
  }

  const courseRows = (courses || []) as CourseRow[];
  const courseIds = courseRows.map((row) => row.id);

  const [modulesResponse, lessonsResponse, assetsResponse, booksResponse] = courseIds.length
    ? await Promise.all([
        supabase.from("course_modules").select("course_id").in("course_id", courseIds),
        supabase.from("course_lessons").select("course_id").in("course_id", courseIds),
        supabase.from("course_assets").select("course_id").in("course_id", courseIds),
        supabase.from("books").select("id,title").in(
          "id",
          courseRows.map((row) => row.source_book_id),
        ),
      ])
    : [null, null, null, null];

  const aggregateMap = buildCourseAggregates({
    courseIds,
    modules: ((modulesResponse?.data || []) as Array<{ course_id: string | null }>),
    lessons: ((lessonsResponse?.data || []) as Array<{ course_id: string | null }>),
    assets: ((assetsResponse?.data || []) as Array<{ course_id: string | null }>),
  });

  const bookTitleById = Object.fromEntries(((booksResponse?.data || []) as Array<{ id: string; title: string }>).map((book) => [book.id, book.title]));

  return (
    <AppShell>
      <Container size="xl">
        <DataFreshnessBanner routeKey="courses:index" fetchedAt={new Date().toISOString()} label="Course catalog" staleAfterHours={12} forceAfterHours={24} />
        <Group justify="space-between" mb="xl" align="flex-start">
          <div>
            <Title>Courses</Title>
            <Text c="dimmed">Review generated courses published from finished manuscripts.</Text>
          </div>
          <Button component={Link} href="/dashboard" color="dark" variant="light">
            Back to Dashboard
          </Button>
        </Group>

        {missingCoursesTable && (
          <Alert color="yellow" mb="md" title="Course tables are not deployed yet">
            Run the latest Supabase migrations to enable course views.
          </Alert>
        )}

        <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }}>
          {courseRows.map((course) => {
            const stats = aggregateMap[course.id] || { moduleCount: 0, lessonCount: 0, assetCount: 0 };
            return (
              <Paper key={course.id} withBorder radius="md" p="lg" bg="white">
                <Stack gap="xs">
                  <Group justify="space-between">
                    <Badge color="blue" variant="light">
                      {course.status}
                    </Badge>
                    <Text size="xs" c="dimmed">
                      Updated {new Date(course.updated_at).toLocaleDateString()}
                    </Text>
                  </Group>
                  <Title order={3}>{course.title}</Title>
                  <Text size="sm" c="dimmed">
                    Source: {bookTitleById[course.source_book_id] || "Book"}
                  </Text>
                  {course.description && (
                    <Text size="sm" lineClamp={3}>
                      {course.description}
                    </Text>
                  )}
                  <Group gap="xs">
                    <Badge color="grape" variant="outline">
                      {stats.moduleCount} modules
                    </Badge>
                    <Badge color="teal" variant="outline">
                      {stats.lessonCount} lessons
                    </Badge>
                    <Badge color="orange" variant="outline">
                      {stats.assetCount} assets
                    </Badge>
                  </Group>
                  <Button component={Link} href={`/courses/${course.id}`} variant="light" color="grape">
                    Open Course
                  </Button>
                </Stack>
              </Paper>
            );
          })}
        </SimpleGrid>

        {!missingCoursesTable && !courseRows.length && (
          <Paper withBorder radius="md" p="xl" mt="md">
            <Title order={3}>No courses yet</Title>
            <Text c="dimmed" mb="md">
              Open a finished book in Publishing Lab and use Publish to Course Assets.
            </Text>
            <Button component={Link} href="/dashboard" color="grape">
              Go to Dashboard
            </Button>
          </Paper>
        )}
      </Container>
    </AppShell>
  );
}
