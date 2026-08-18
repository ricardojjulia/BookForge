"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Button,
  Group,
  JsonInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Textarea,
} from "@mantine/core";
import { createClient } from "@/lib/supabase/client";

type BookBibleRow = {
  content: unknown;
} | null;

type AuthorNotesRow = {
  creative_instructions: string | null;
  voice_guidance: string | null;
  worldview_notes: string | null;
  theological_alignment: string | null;
  forbidden_changes: string | null;
} | null;

type CharacterRow = {
  id: string;
  name: string;
  role: string | null;
  age: string | null;
  description: string | null;
  voice_notes: string | null;
  motivation: string | null;
  do_not_change_notes: string | null;
};

type StyleSampleRow = {
  id: string;
  title: string;
  guidance_notes: string | null;
};

type MatterSectionRow = {
  id: string;
  section_type: string;
  title: string | null;
};

type RevisionInstructionRow = {
  id: string;
  title: string;
  scope: string | null;
};

type BookMetadataRow = {
  title: string;
  author_name: string | null;
  genre: string | null;
  target_audience: string | null;
  point_of_view: string | null;
  tense: string | null;
};

const emptyBible = {
  summary: "",
  genre: "",
  targetAudience: "",
  pointOfView: "",
  tense: "",
  tone: "",
  authorialVoice: "",
  majorThemes: [],
  recurringMotifs: [],
  characters: [],
  relationships: [],
  timeline: [],
  locations: [],
  unresolvedPlotThreads: [],
  styleRules: [],
  forbiddenChanges: [],
  theologicalPhilosophicalAlignment: "",
};

const matterTypes = [
  { value: "title_page", label: "Title page" },
  { value: "copyright_page", label: "Copyright page" },
  { value: "dedication", label: "Dedication" },
  { value: "acknowledgments", label: "Acknowledgments" },
  { value: "foreword", label: "Foreword" },
  { value: "preface", label: "Preface" },
  { value: "introduction", label: "Introduction" },
  { value: "author_bio", label: "Author bio" },
  { value: "appendix", label: "Appendix" },
  { value: "bibliography", label: "Bibliography" },
  { value: "endnotes", label: "Endnotes" },
  { value: "discussion_questions", label: "Discussion questions" },
  { value: "small_group_questions", label: "Small group questions" },
  { value: "glossary", label: "Glossary" },
];

export function BookInputsManager({
  bookId,
  book,
  bible,
  authorNotes,
  characters,
  styleSamples,
  matterSections,
  revisionInstructions,
}: {
  bookId: string;
  book: BookMetadataRow;
  bible: BookBibleRow;
  authorNotes: AuthorNotesRow;
  characters: CharacterRow[];
  styleSamples: StyleSampleRow[];
  matterSections: MatterSectionRow[];
  revisionInstructions: RevisionInstructionRow[];
}) {
  const sections = [
    { key: "metadata", label: "Metadata", desc: "Title, genre, audience, POV" },
    { key: "chapter", label: "Add Chapter", desc: "Upload or paste chapter text" },
    { key: "bible", label: "Manuscript Blueprint", desc: "Structure and outline" },
    { key: "notes", label: "Author Notes", desc: "Private context for revision" },
    { key: "characters", label: "Characters", desc: "Profiles and relationships" },
    { key: "instructions", label: "Revision Instructions", desc: "Guidance for rewrite passes" },
    { key: "style", label: "Style Sample", desc: "Reference prose for tone/voice" },
    { key: "matter", label: "Front / Back Matter", desc: "Title page, dedication, colophon" },
  ] as const;
  type SectionKey = (typeof sections)[number]["key"];
  const [activeKey, setActiveKey] = useState<SectionKey>("chapter");

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: "oklch(0.2 0.005 90)" }}>Book Inputs</div>
        <p style={{ margin: "4px 0 0", fontSize: 14, color: "oklch(0.5 0.005 90)" }}>
          Store manuscript text separately from guidance, style references, profiles, and front/back matter.
        </p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 20, alignItems: "start" }}>
        <div
          style={{
            background: "#fff",
            border: "1px solid oklch(0.92 0.003 90)",
            borderRadius: 12,
            padding: 10,
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          {sections.map((section) => {
            const isActive = activeKey === section.key;
            return (
              <button
                key={section.key}
                type="button"
                onClick={() => setActiveKey(section.key)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: 2,
                  textAlign: "left",
                  background: isActive ? "oklch(0.95 0.03 275)" : "transparent",
                  border: "none",
                  borderRadius: 8,
                  padding: "11px 14px",
                  cursor: "pointer",
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 600, color: isActive ? "oklch(0.4 0.13 275)" : "oklch(0.25 0.005 90)" }}>
                  {section.label}
                </span>
                <span style={{ fontSize: 12, color: isActive ? "oklch(0.5 0.1 275)" : "oklch(0.55 0.005 90)", lineHeight: 1.4 }}>
                  {section.desc}
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ background: "#fff", border: "1px solid oklch(0.92 0.003 90)", borderRadius: 12, padding: "26px 28px" }}>
          {activeKey === "metadata" && <BookMetadataForm bookId={bookId} book={book} />}
          {activeKey === "chapter" && <ManualChapterForm bookId={bookId} />}
          {activeKey === "bible" && <BookBibleForm bookId={bookId} bible={bible} />}
          {activeKey === "notes" && <AuthorNotesForm bookId={bookId} authorNotes={authorNotes} />}
          {activeKey === "characters" && <CharacterProfileForm bookId={bookId} characters={characters} />}
          {activeKey === "instructions" && (
            <RevisionInstructionsForm bookId={bookId} revisionInstructions={revisionInstructions} />
          )}
          {activeKey === "style" && <StyleSampleForm bookId={bookId} styleSamples={styleSamples} />}
          {activeKey === "matter" && <MatterSectionForm bookId={bookId} matterSections={matterSections} />}
        </div>
      </div>
    </div>
  );
}

function BookMetadataForm({ bookId, book }: { bookId: string; book: BookMetadataRow }) {
  const router = useRouter();
  const [metadata, setMetadata] = useState({
    title: book.title || "",
    author_name: book.author_name || "",
    genre: book.genre || "",
    target_audience: book.target_audience || "",
    point_of_view: book.point_of_view || "",
    tense: book.tense || "",
  });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function save() {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const supabase = createClient();
      const { error: saveError } = await supabase
        .from("books")
        .update({
          ...metadata,
          updated_at: new Date().toISOString(),
        })
        .eq("id", bookId);
      if (saveError) throw saveError;
      setMessage("Book metadata saved.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save book metadata.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Stack>
      <InputNotice text="These fields appear in dashboards and exports. Author name is the formal byline used in publishable files." />
      {message && <Alert color="green">{message}</Alert>}
      {error && <Alert color="red">{error}</Alert>}
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <TextInput
          label="Title"
          value={metadata.title}
          onChange={(event) => setMetadata({ ...metadata, title: event.currentTarget.value })}
        />
        <TextInput
          label="Author name"
          value={metadata.author_name}
          onChange={(event) => setMetadata({ ...metadata, author_name: event.currentTarget.value })}
        />
        <TextInput
          label="Genre"
          value={metadata.genre}
          onChange={(event) => setMetadata({ ...metadata, genre: event.currentTarget.value })}
        />
        <TextInput
          label="Target audience"
          value={metadata.target_audience}
          onChange={(event) => setMetadata({ ...metadata, target_audience: event.currentTarget.value })}
        />
        <TextInput
          label="Point of view"
          value={metadata.point_of_view}
          onChange={(event) => setMetadata({ ...metadata, point_of_view: event.currentTarget.value })}
        />
        <TextInput
          label="Tense"
          value={metadata.tense}
          onChange={(event) => setMetadata({ ...metadata, tense: event.currentTarget.value })}
        />
      </SimpleGrid>
      <Group justify="flex-end" pt="md" style={{ borderTop: "1px solid oklch(0.94 0.003 90)" }}>
        <Button color="grape" loading={loading} onClick={save}>
          Save Metadata
        </Button>
      </Group>
    </Stack>
  );
}

function RevisionInstructionsForm({
  bookId,
  revisionInstructions,
}: {
  bookId: string;
  revisionInstructions: RevisionInstructionRow[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [scope, setScope] = useState("general");
  const [instructions, setInstructions] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function save() {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: saveError } = await supabase.from("revision_instructions").insert({
        book_id: bookId,
        title,
        scope,
        instructions,
      });
      if (saveError) throw saveError;
      setTitle("");
      setScope("general");
      setInstructions("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save revision instructions.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Stack>
      <InputNotice text="Save reusable task-specific instructions, such as preserving emotional meaning, reducing repetition, or adding biblical support without over-preaching." />
      {error && <Alert color="red">{error}</Alert>}
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <TextInput label="Instruction title" value={title} onChange={(event) => setTitle(event.currentTarget.value)} />
        <Select
          label="Scope"
          data={[
            "general",
            "book",
            "chapter",
            "scene",
            "paragraph",
            "passage",
          ]}
          value={scope}
          onChange={(value) => setScope(value || "general")}
        />
      </SimpleGrid>
      <Textarea
        label="Instructions"
        minRows={6}
        value={instructions}
        onChange={(event) => setInstructions(event.currentTarget.value)}
      />
      <Group justify="space-between" pt="md" style={{ borderTop: "1px solid oklch(0.94 0.003 90)" }}>
        <Text c="dimmed">{revisionInstructions.length} revision instruction sets saved.</Text>
        <Button color="grape" loading={loading} onClick={save}>
          Add Instructions
        </Button>
      </Group>
      <SavedList
        items={revisionInstructions.map(
          (item) => `${item.title}${item.scope ? ` - ${item.scope}` : ""}`,
        )}
      />
    </Stack>
  );
}

function ManualChapterForm({ bookId }: { bookId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/books/${bookId}/chapters/manual`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, text }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to add chapter.");
      setTitle("");
      setText("");
      setMessage(`Chapter ${result.chapterNumber} added.`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add chapter.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Stack>
      <InputNotice
        text="Use this for pasted single chapters or manually created chapters. The chapter is parsed into scenes and paragraphs and original text is preserved."
      />
      {message && <Alert color="green">{message}</Alert>}
      {error && <Alert color="red">{error}</Alert>}
      <TextInput label="Chapter title" value={title} onChange={(event) => setTitle(event.currentTarget.value)} />
      <Textarea label="Chapter text" minRows={10} value={text} onChange={(event) => setText(event.currentTarget.value)} />
      <Group justify="flex-end" pt="md" style={{ borderTop: "1px solid oklch(0.94 0.003 90)" }}>
        <Button color="grape" loading={loading} onClick={submit}>
          Add Chapter
        </Button>
      </Group>
    </Stack>
  );
}

function BookBibleForm({ bookId, bible }: { bookId: string; bible: BookBibleRow }) {
  const router = useRouter();
  const [value, setValue] = useState(JSON.stringify(bible?.content || emptyBible, null, 2));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function save() {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const parsed = JSON.parse(value);
      const supabase = createClient();
      const { error: saveError } = await supabase
        .from("book_bibles")
        .upsert(
          {
            book_id: bookId,
            content: parsed,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "book_id" },
        );
      if (saveError) throw saveError;
      setMessage("Manuscript Blueprint saved.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Manuscript Blueprint must be valid JSON.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Stack>
      <InputNotice text="Generate this with AI or create it manually. It becomes context for revision prompts." />
      {message && <Alert color="green">{message}</Alert>}
      {error && <Alert color="red">{error}</Alert>}
      <JsonInput label="Editable Manuscript Blueprint JSON" value={value} onChange={setValue} autosize minRows={18} validationError="Invalid JSON" />
      <Group justify="flex-end" pt="md" style={{ borderTop: "1px solid oklch(0.94 0.003 90)" }}>
        <Button color="grape" loading={loading} onClick={save}>
          Save Manuscript Blueprint
        </Button>
      </Group>
    </Stack>
  );
}

function AuthorNotesForm({ bookId, authorNotes }: { bookId: string; authorNotes: AuthorNotesRow }) {
  const router = useRouter();
  const [notes, setNotes] = useState({
    creative_instructions: authorNotes?.creative_instructions || "",
    voice_guidance: authorNotes?.voice_guidance || "",
    worldview_notes: authorNotes?.worldview_notes || "",
    theological_alignment: authorNotes?.theological_alignment || "",
    forbidden_changes: authorNotes?.forbidden_changes || "",
  });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function save() {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const supabase = createClient();
      const { error: saveError } = await supabase.from("author_notes").upsert({
        book_id: bookId,
        ...notes,
        updated_at: new Date().toISOString(),
      });
      if (saveError) throw saveError;
      setMessage("Author notes saved.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save author notes.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Stack>
      <InputNotice text="Use author notes for creative preferences, contemporary view, forbidden changes, and voice guidance." />
      {message && <Alert color="green">{message}</Alert>}
      {error && <Alert color="red">{error}</Alert>}
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Textarea label="Creative instructions" minRows={5} value={notes.creative_instructions} onChange={(event) => setNotes({ ...notes, creative_instructions: event.currentTarget.value })} />
        <Textarea label="Voice guidance" minRows={5} value={notes.voice_guidance} onChange={(event) => setNotes({ ...notes, voice_guidance: event.currentTarget.value })} />
        <Textarea label="Contemporary View notes" minRows={5} value={notes.worldview_notes} onChange={(event) => setNotes({ ...notes, worldview_notes: event.currentTarget.value })} />
        <Textarea label="Contemporary View alignment" minRows={5} value={notes.theological_alignment} onChange={(event) => setNotes({ ...notes, theological_alignment: event.currentTarget.value })} />
      </SimpleGrid>
      <Textarea label="Forbidden changes" minRows={4} value={notes.forbidden_changes} onChange={(event) => setNotes({ ...notes, forbidden_changes: event.currentTarget.value })} />
      <Group justify="flex-end" pt="md" style={{ borderTop: "1px solid oklch(0.94 0.003 90)" }}>
        <Button color="grape" loading={loading} onClick={save}>
          Save Author Notes
        </Button>
      </Group>
    </Stack>
  );
}

function CharacterProfileForm({ bookId, characters }: { bookId: string; characters: CharacterRow[] }) {
  const router = useRouter();
  const [profile, setProfile] = useState({
    name: "",
    role: "",
    age: "",
    description: "",
    voice_notes: "",
    personality: "",
    motivation: "",
    wound_flaw: "",
    arc_notes: "",
    relationship_notes: "",
    important_secrets: "",
    do_not_change_notes: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function save() {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: saveError } = await supabase.from("characters").insert({ book_id: bookId, ...profile });
      if (saveError) throw saveError;
      setProfile({
        name: "",
        role: "",
        age: "",
        description: "",
        voice_notes: "",
        personality: "",
        motivation: "",
        wound_flaw: "",
        arc_notes: "",
        relationship_notes: "",
        important_secrets: "",
        do_not_change_notes: "",
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save character.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Stack>
      <InputNotice text="Character profiles guide voice, motivation, relationships, secrets, arcs, and do-not-change constraints." />
      {error && <Alert color="red">{error}</Alert>}
      <SimpleGrid cols={{ base: 1, md: 3 }}>
        <TextInput label="Name" value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.currentTarget.value })} />
        <TextInput label="Role" value={profile.role} onChange={(event) => setProfile({ ...profile, role: event.currentTarget.value })} />
        <TextInput label="Age" value={profile.age} onChange={(event) => setProfile({ ...profile, age: event.currentTarget.value })} />
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Textarea label="Description" minRows={4} value={profile.description} onChange={(event) => setProfile({ ...profile, description: event.currentTarget.value })} />
        <Textarea label="Voice notes" minRows={4} value={profile.voice_notes} onChange={(event) => setProfile({ ...profile, voice_notes: event.currentTarget.value })} />
        <Textarea label="Personality" minRows={4} value={profile.personality} onChange={(event) => setProfile({ ...profile, personality: event.currentTarget.value })} />
        <Textarea label="Motivation" minRows={4} value={profile.motivation} onChange={(event) => setProfile({ ...profile, motivation: event.currentTarget.value })} />
        <Textarea label="Wound / flaw" minRows={4} value={profile.wound_flaw} onChange={(event) => setProfile({ ...profile, wound_flaw: event.currentTarget.value })} />
        <Textarea label="Do-not-change notes" minRows={4} value={profile.do_not_change_notes} onChange={(event) => setProfile({ ...profile, do_not_change_notes: event.currentTarget.value })} />
      </SimpleGrid>
      <Group justify="space-between" pt="md" style={{ borderTop: "1px solid oklch(0.94 0.003 90)" }}>
        <Text c="dimmed">{characters.length} character profiles saved.</Text>
        <Button color="grape" loading={loading} onClick={save}>
          Add Character
        </Button>
      </Group>
      <SavedList items={characters.map((character) => `${character.name}${character.role ? ` - ${character.role}` : ""}`)} />
    </Stack>
  );
}

function StyleSampleForm({ bookId, styleSamples }: { bookId: string; styleSamples: StyleSampleRow[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [sampleText, setSampleText] = useState("");
  const [guidanceNotes, setGuidanceNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function save() {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: saveError } = await supabase.from("style_samples").insert({
        book_id: bookId,
        title,
        sample_text: sampleText,
        guidance_notes: guidanceNotes,
      });
      if (saveError) throw saveError;
      setTitle("");
      setSampleText("");
      setGuidanceNotes("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save style sample.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Stack>
      <InputNotice text="Style samples are only voice and tone guidance. Prompts must not copy them directly." />
      {error && <Alert color="red">{error}</Alert>}
      <TextInput label="Sample title" value={title} onChange={(event) => setTitle(event.currentTarget.value)} />
      <Textarea label="Writing sample" minRows={8} value={sampleText} onChange={(event) => setSampleText(event.currentTarget.value)} />
      <Textarea label="Guidance notes" minRows={3} value={guidanceNotes} onChange={(event) => setGuidanceNotes(event.currentTarget.value)} />
      <Group justify="space-between" pt="md" style={{ borderTop: "1px solid oklch(0.94 0.003 90)" }}>
        <Text c="dimmed">{styleSamples.length} style samples saved.</Text>
        <Button color="grape" loading={loading} onClick={save}>
          Add Style Sample
        </Button>
      </Group>
      <SavedList items={styleSamples.map((sample) => sample.title)} />
    </Stack>
  );
}

function MatterSectionForm({ bookId, matterSections }: { bookId: string; matterSections: MatterSectionRow[] }) {
  const router = useRouter();
  const [sectionType, setSectionType] = useState("title_page");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const savedLabels = useMemo(
    () =>
      matterSections.map((section) => {
        const label = matterTypes.find((item) => item.value === section.section_type)?.label || section.section_type;
        return `${label}${section.title ? ` - ${section.title}` : ""}`;
      }),
    [matterSections],
  );

  async function save() {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: saveError } = await supabase.from("book_matter_sections").insert({
        book_id: bookId,
        section_type: sectionType,
        title,
        content,
        sort_order: matterSections.length + 1,
      });
      if (saveError) throw saveError;
      setTitle("");
      setContent("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save section.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Stack>
      <InputNotice text="Front and back matter are stored separately from the manuscript and can be included during final export." />
      {error && <Alert color="red">{error}</Alert>}
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Select label="Section type" data={matterTypes} value={sectionType} onChange={(value) => setSectionType(value || "title_page")} />
        <TextInput label="Section title" value={title} onChange={(event) => setTitle(event.currentTarget.value)} />
      </SimpleGrid>
      <Textarea label="Content" minRows={8} value={content} onChange={(event) => setContent(event.currentTarget.value)} />
      <Group justify="space-between" pt="md" style={{ borderTop: "1px solid oklch(0.94 0.003 90)" }}>
        <Text c="dimmed">{matterSections.length} front/back matter sections saved.</Text>
        <Button color="grape" loading={loading} onClick={save}>
          Add Section
        </Button>
      </Group>
      <SavedList items={savedLabels} />
    </Stack>
  );
}

function InputNotice({ text }: { text: string }) {
  return (
    <div
      style={{
        background: "oklch(0.96 0.02 275)",
        border: "1px solid oklch(0.88 0.05 275)",
        borderRadius: 10,
        padding: "14px 18px",
        fontSize: 13,
        color: "oklch(0.4 0.1 275)",
        lineHeight: 1.5,
      }}
    >
      {text}
    </div>
  );
}

function SavedList({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <Paper withBorder radius="sm" p="md" bg="#fbfaf8">
      <Text fw={700} mb="xs">
        Saved
      </Text>
      <Stack gap={4}>
        {items.map((item) => (
          <Text key={item} size="sm">
            {item}
          </Text>
        ))}
      </Stack>
    </Paper>
  );
}
