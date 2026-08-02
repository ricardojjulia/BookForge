"use client";

import { Table } from "@mantine/core";

export type ProvenanceRunRecord = {
  workflow: "auto_review" | "revision";
  source: "explicit_snapshot" | "branch_active" | "active_snapshot" | "unknown";
};

export function WorkflowCoverageTable({ provenanceRuns }: { provenanceRuns: ProvenanceRunRecord[] }) {
  return (
    <Table withTableBorder withColumnBorders striped fz="sm">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Workflow</Table.Th>
          <Table.Th>Total</Table.Th>
          <Table.Th>Explicit</Table.Th>
          <Table.Th>Branch</Table.Th>
          <Table.Th>Fallback</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {(["auto_review", "revision"] as const).map((workflow) => {
          const rows = provenanceRuns.filter((run) => run.workflow === workflow);
          const explicit = rows.filter((run) => run.source === "explicit_snapshot").length;
          const branch = rows.filter((run) => run.source === "branch_active").length;
          const fallback = rows.filter((run) => run.source === "active_snapshot").length;
          return (
            <Table.Tr key={workflow}>
              <Table.Td>{workflow === "auto_review" ? "Auto-review" : "Revision"}</Table.Td>
              <Table.Td>{rows.length}</Table.Td>
              <Table.Td>{explicit}</Table.Td>
              <Table.Td>{branch}</Table.Td>
              <Table.Td>{fallback}</Table.Td>
            </Table.Tr>
          );
        })}
      </Table.Tbody>
    </Table>
  );
}
