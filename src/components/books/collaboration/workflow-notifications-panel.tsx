import { Badge, Group, Paper, Stack, Text, Title } from "@mantine/core";

type WorkflowNotification = {
  id: string;
  event_type: string;
  title: string;
  body: string;
  metadata?: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
};

export function WorkflowNotificationsPanel({ notifications }: { notifications: WorkflowNotification[] }) {
  if (!notifications.length) {
    return (
      <Paper withBorder radius="md" p="lg" bg="white" mt="xl">
        <Title order={3}>Workflow notifications</Title>
        <Text c="dimmed" size="sm" mt="xs">
          No collaborator workflow notifications yet.
        </Text>
      </Paper>
    );
  }

  return (
    <Paper withBorder radius="md" p="lg" bg="white" mt="xl">
      <Stack>
        <Group justify="space-between">
          <Title order={3}>Workflow notifications</Title>
          <Badge color="grape" variant="light">
            {notifications.filter((n) => !n.read_at).length} unread
          </Badge>
        </Group>
        <Stack gap="xs">
          {notifications.map((notification) => (
            <Paper key={notification.id} withBorder radius="sm" p="sm" bg={notification.read_at ? "white" : "#fff8f3"}>
              <Group justify="space-between" align="flex-start">
                <div>
                  <Text fw={700}>{notification.title}</Text>
                  <Text size="sm" c="dimmed">
                    {notification.body}
                  </Text>
                </div>
                <Badge color={notification.read_at ? "gray" : "orange"} variant="light">
                  {notification.read_at ? "read" : "new"}
                </Badge>
              </Group>
              <Text size="xs" c="dimmed" mt={6}>
                {new Date(notification.created_at).toLocaleString()}
              </Text>
            </Paper>
          ))}
        </Stack>
      </Stack>
    </Paper>
  );
}
