import { Container, Stack, Text, Title } from "@mantine/core";
import { getStewardPricingOverview } from "@/lib/subscription/pricing-overview";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdjustmentLogTable, TiersTable } from "./pricing-client";

export const dynamic = "force-dynamic";

export default async function StewardPricingPage() {
  const { tiers, adjustments } = await getStewardPricingOverview(createAdminClient());

  return (
    <Container size="xl">
      <Title mb="xs">Pricing</Title>
      <Text c="dimmed" size="sm" mb="lg">
        Live subscription tiers and the autonomous margin-tuning job&apos;s full decision trail. Credit-cap changes below
        are auto-applied within a bounded step; model-allowlist changes are always proposed only, never auto-applied.
      </Text>

      <Stack gap="xl">
        <TiersTable tiers={tiers} />
        <AdjustmentLogTable adjustments={adjustments} />
      </Stack>
    </Container>
  );
}
