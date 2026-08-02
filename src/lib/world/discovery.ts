type UnknownRecord = Record<string, unknown>;

export type WorldEntityType = "characters" | "locations" | "themes" | "motifs" | "timeline";

export type WorldDiscoveryChapter = {
  id: string;
  chapter_number: number;
};

export type ExistingWorldEntities = Record<WorldEntityType, UnknownRecord[]>;

export type WorldDiscoveryPlan = {
  inserts: Record<WorldEntityType, UnknownRecord[]>;
  skipped: Record<WorldEntityType, number>;
  rejected: Record<WorldEntityType, number>;
};

const ENTITY_TYPES: WorldEntityType[] = ["characters", "locations", "themes", "motifs", "timeline"];

export function buildWorldDiscoveryPlan(
  blueprint: unknown,
  chapters: WorldDiscoveryChapter[],
  existing: ExistingWorldEntities,
): WorldDiscoveryPlan {
  const content = asRecord(blueprint);
  const chapterIds = new Map(chapters.map((chapter) => [chapter.chapter_number, chapter.id]));
  const inserts = emptyCounts<UnknownRecord[]>(() => []);
  const skipped = emptyCounts(() => 0);
  const rejected = emptyCounts(() => 0);

  const candidates: Record<WorldEntityType, UnknownRecord[]> = {
    characters: parseNamedEntities(content.characters, normalizeCharacter),
    locations: parseNamedEntities(content.locations, normalizeLocation),
    themes: parseNamedEntities(content.majorThemes ?? content.themes, normalizeNamedDescription),
    motifs: parseNamedEntities(content.recurringMotifs ?? content.motifs, normalizeNamedDescription),
    timeline: parseTimeline(content.timeline, chapterIds),
  };

  for (const entityType of ENTITY_TYPES) {
    const existingKeys = new Set(existing[entityType].flatMap((item) => existingEntityKeys(entityType, item)));
    const plannedKeys = new Set<string>();
    const sourceValues = asArray(sourceValue(content, entityType));
    rejected[entityType] = Math.max(0, sourceValues.length - candidates[entityType].length);

    for (const candidate of candidates[entityType]) {
      const candidateKeys = existingEntityKeys(entityType, candidate);
      if (candidateKeys.some((key) => existingKeys.has(key) || plannedKeys.has(key))) {
        skipped[entityType] += 1;
        continue;
      }
      candidateKeys.forEach((key) => plannedKeys.add(key));
      inserts[entityType].push(candidate);
    }
  }

  return { inserts, skipped, rejected };
}

function sourceValue(content: UnknownRecord, entityType: WorldEntityType) {
  if (entityType === "themes") return content.majorThemes ?? content.themes;
  if (entityType === "motifs") return content.recurringMotifs ?? content.motifs;
  return content[entityType];
}

function parseNamedEntities(
  value: unknown,
  normalize: (value: unknown) => UnknownRecord | null,
) {
  return asArray(value).map(normalize).filter((item): item is UnknownRecord => Boolean(item));
}

function normalizeCharacter(value: unknown) {
  const base = normalizeNamedDescription(value);
  if (!base) return null;
  const item = asRecord(value);
  return compact({
    ...base,
    role: stringValue(item.role),
    voice_notes: stringValue(item.voice_notes ?? item.voiceNotes),
    arc_notes: stringValue(item.arc_notes ?? item.arcNotes),
    relationship_notes: stringValue(item.relationship_notes ?? item.relationshipNotes),
  });
}

function normalizeLocation(value: unknown) {
  return normalizeNamedDescription(value);
}

function normalizeNamedDescription(value: unknown) {
  const item = asRecord(value);
  const name = typeof value === "string" ? value.trim() : stringValue(item.name ?? item.title);
  if (!name) return null;
  return compact({
    name,
    description: stringValue(item.description ?? item.summary ?? item.notes),
    discovery_key: normalizeKey(name),
  });
}

function parseTimeline(value: unknown, chapterIds: Map<number, string>) {
  return asArray(value)
    .map((entry, index) => {
      const item = asRecord(entry);
      const note = typeof entry === "string"
        ? entry.trim()
        : stringValue(item.note ?? item.event ?? item.description ?? item.summary);
      if (!note) return null;
      const chapterNumber = numberValue(item.chapter_number ?? item.chapterNumber ?? item.chapter);
      const sequenceOrder = numberValue(item.sequence_order ?? item.sequenceOrder) ?? index + 1;
      return compact({
        note,
        sequence_order: sequenceOrder,
        chapter_id: chapterNumber == null ? undefined : chapterIds.get(chapterNumber),
        discovery_key: normalizeKey(`${chapterNumber ?? "none"}:${note}`),
      });
    })
    .filter((item): item is UnknownRecord => Boolean(item));
}

function existingEntityKeys(entityType: WorldEntityType, item: UnknownRecord) {
  const keys = typeof item.discovery_key === "string" && item.discovery_key.trim() ? [item.discovery_key] : [];
  if (entityType === "timeline") {
    const note = stringValue(item.note);
    if (note) keys.push(normalizeKey(`note:${note}`));
    return keys;
  }
  const name = stringValue(item.name);
  if (name) keys.push(normalizeKey(name));
  return keys;
}

function normalizeKey(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Math.trunc(Number(value));
  return null;
}

function compact(value: UnknownRecord) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== "" && item !== undefined && item !== null));
}

function emptyCounts<T>(factory: () => T): Record<WorldEntityType, T> {
  return Object.fromEntries(ENTITY_TYPES.map((entityType) => [entityType, factory()])) as Record<WorldEntityType, T>;
}
