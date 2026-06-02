"use client";

import { useState } from "react";
import { Tabs } from "@mantine/core";
import { EntityList } from "@/components/books/world/entity-list";

type Chapter = { id: string; chapter_number: number; title: string | null };

type Props = {
  bookId: string;
  initialCharacters: Record<string, unknown>[];
  initialLocations: Record<string, unknown>[];
  initialThemes: Record<string, unknown>[];
  initialMotifs: Record<string, unknown>[];
  initialTimeline: Record<string, unknown>[];
  chapters: Chapter[];
};

export function WorldBibleEditor({ bookId, initialCharacters, initialLocations, initialThemes, initialMotifs, initialTimeline, chapters }: Props) {
  const [tab, setTab] = useState<string | null>("characters");

  return (
    <Tabs value={tab} onChange={setTab}>
      <Tabs.List mb="xl">
        <Tabs.Tab value="characters">Characters ({initialCharacters.length})</Tabs.Tab>
        <Tabs.Tab value="locations">Locations ({initialLocations.length})</Tabs.Tab>
        <Tabs.Tab value="themes">Themes ({initialThemes.length})</Tabs.Tab>
        <Tabs.Tab value="motifs">Motifs ({initialMotifs.length})</Tabs.Tab>
        <Tabs.Tab value="timeline">Timeline ({initialTimeline.length})</Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="characters">
        <EntityList
          bookId={bookId}
          entityType="characters"
          initial={initialCharacters}
          fields={[
            { key: "name", label: "Name", required: true },
            { key: "role", label: "Role / Function" },
            { key: "description", label: "Description", multiline: true },
            { key: "arc_notes", label: "Arc notes", multiline: true },
            { key: "voice_notes", label: "Voice / speech style", multiline: true },
            { key: "relationship_notes", label: "Relationships", multiline: true },
          ]}
          displayName={(item) => String(item.name || "Unnamed")}
          displaySub={(item) => String(item.role || "")}
        />
      </Tabs.Panel>

      <Tabs.Panel value="locations">
        <EntityList
          bookId={bookId}
          entityType="locations"
          initial={initialLocations}
          fields={[
            { key: "name", label: "Name", required: true },
            { key: "description", label: "Description", multiline: true },
          ]}
          displayName={(item) => String(item.name || "Unnamed")}
        />
      </Tabs.Panel>

      <Tabs.Panel value="themes">
        <EntityList
          bookId={bookId}
          entityType="themes"
          initial={initialThemes}
          fields={[
            { key: "name", label: "Theme", required: true },
            { key: "description", label: "Notes", multiline: true },
          ]}
          displayName={(item) => String(item.name || "Unnamed")}
        />
      </Tabs.Panel>

      <Tabs.Panel value="motifs">
        <EntityList
          bookId={bookId}
          entityType="motifs"
          initial={initialMotifs}
          fields={[
            { key: "name", label: "Motif", required: true },
            { key: "description", label: "Description", multiline: true },
          ]}
          displayName={(item) => String(item.name || "Unnamed")}
        />
      </Tabs.Panel>

      <Tabs.Panel value="timeline">
        <EntityList
          bookId={bookId}
          entityType="timeline"
          initial={initialTimeline}
          fields={[
            { key: "note", label: "Event / note", required: true, multiline: true },
            { key: "sequence_order", label: "Order (number)", type: "number" },
          ]}
          displayName={(item) => String(item.note || "").slice(0, 80)}
          chapters={chapters}
        />
      </Tabs.Panel>
    </Tabs>
  );
}
