"use client";

import { AreaChart, BarChart, DonutChart } from "@mantine/charts";
import { Text } from "@mantine/core";

const CURRENCY_FORMATTER = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

function EmptyState({ message }: { message: string }) {
  return (
    <Text size="sm" c="dimmed" ta="center" py="xl">
      {message}
    </Text>
  );
}

export function CostTrendChart({ data }: { data: Array<{ date: string; cost: number }> }) {
  if (!data.some((row) => row.cost > 0)) return <EmptyState message="No spend recorded yet." />;
  return (
    <AreaChart
      h={220}
      data={data}
      dataKey="date"
      series={[{ name: "cost", color: "grape.6" }]}
      curveType="monotone"
      valueFormatter={(value) => CURRENCY_FORMATTER.format(value)}
      withGradient
      gridAxis="y"
      tickLine="y"
    />
  );
}

export function CostByModelChart({ data }: { data: Array<{ model: string; cost: number; color: string }> }) {
  if (!data.length) return <EmptyState message="No cloud model spend yet." />;
  return (
    <DonutChart
      data={data.map((row) => ({ name: row.model, value: Math.max(row.cost, 0.0001), color: row.color }))}
      valueFormatter={(value) => CURRENCY_FORMATTER.format(value)}
      size={180}
      thickness={26}
      withLabelsLine
      withLabels
      paddingAngle={2}
    />
  );
}

export function ModelSuccessChart({ data }: { data: Array<{ model: string; "success rate": number }> }) {
  if (!data.length) return <EmptyState message="No model calls recorded yet." />;
  return (
    <BarChart
      h={Math.max(160, data.length * 46)}
      data={data}
      dataKey="model"
      orientation="vertical"
      series={[{ name: "success rate", color: "teal.6" }]}
      valueFormatter={(value) => `${value}%`}
      yAxisProps={{ width: 150 }}
      gridAxis="x"
      barProps={{ radius: 6 }}
    />
  );
}

export function TimeOnBookChart({ data }: { data: Array<{ book: string; hours: number }> }) {
  if (!data.length) return <EmptyState message="No completed AI jobs yet." />;
  return (
    <BarChart
      h={Math.max(160, data.length * 46)}
      data={data}
      dataKey="book"
      orientation="vertical"
      series={[{ name: "hours", color: "indigo.6" }]}
      valueFormatter={(value) => `${value.toFixed(1)}h`}
      yAxisProps={{ width: 150 }}
      gridAxis="x"
      barProps={{ radius: 6 }}
    />
  );
}

export function ResultsChart({ data }: { data: Array<{ book: string; baseline: number | null; latest: number | null }> }) {
  const withData = data.filter((row) => row.baseline !== null || row.latest !== null);
  if (!withData.length) return <EmptyState message="Run BookForge Critic to see quality scores here." />;
  return (
    <BarChart
      h={Math.max(160, withData.length * 56)}
      data={withData}
      dataKey="book"
      orientation="vertical"
      series={[
        { name: "baseline", color: "gray.5" },
        { name: "latest", color: "grape.6" },
      ]}
      yAxisProps={{ width: 150 }}
      gridAxis="x"
      barProps={{ radius: 6 }}
    />
  );
}
