"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Button,
  Group,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  TextInput,
  Textarea,
  Title,
} from "@mantine/core";
import { Dropzone } from "@mantine/dropzone";
import { IconFileText, IconUpload } from "@tabler/icons-react";
import { fetchJson } from "@/lib/http/fetch-json";
import { DIALOG_DENSITY_LABELS, DIALOG_DENSITY_LEVELS, type DialogDensity } from "@/lib/dialogue-density";

const genreOptions = [
  "Fiction",
  "Literary Fiction",
  "Historical Fiction",
  "Romance",
  "Thriller",
  "Mystery",
  "Fantasy",
  "Science Fiction",
  "Horror",
  "Young Adult",
  "Middle Grade",
  "Memoir",
  "Biography",
  "Self-Help",
  "Christian Living",
  "Devotional",
  "Pastoral",
  "Apologetics",
  "Theology",
  "Philosophy",
  "Business",
  "Leadership",
  "Education",
  "Poetry",
  "Essay Collection",
  "Other / Hybrid",
];

const targetAudienceOptions = [
  "General Adult",
  "Literary Readers",
  "Commercial Fiction Readers",
  "Young Adult",
  "Middle Grade",
  "Children",
  "Parents",
  "Grieving Parents",
  "Couples",
  "Faith-Based Readers",
  "Church Leaders",
  "Pastors",
  "Small Groups",
  "Professionals",
  "Academics",
  "New Believers",
  "Non-Denominational Christian Readers",
  "Spanish-Language Readers",
  "Bilingual Readers",
  "Other / Custom",
];

export function ImportManuscriptForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [genre, setGenre] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [pointOfView, setPointOfView] = useState("");
  const [tense, setTense] = useState("");
  const [dialogDensity, setDialogDensity] = useState<DialogDensity>("normal");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    setError(null);
    const formData = new FormData();
    if (file) formData.append("file", file);
    formData.append("text", text);
    formData.append("title", title || file?.name.replace(/\.[^.]+$/, "") || "Untitled Book");
    formData.append("authorName", authorName);
    formData.append("genre", genre);
    formData.append("targetAudience", targetAudience);
    formData.append("pointOfView", pointOfView);
    formData.append("tense", tense);
    formData.append("dialogDensity", dialogDensity);

    try {
      const result = await fetchJson<{ bookId: string }>(
        "/api/manuscript/import",
        { method: "POST", body: formData },
        "Manuscript import",
      );
      router.push(`/books/${result.bookId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Paper withBorder radius="md" p="xl" bg="white">
      <Stack>
        <Title order={2}>Import Book</Title>
        <Text c="dimmed">
          Create the primary manuscript record from DOCX, EPUB, Kindle package, Markdown, TXT, or pasted text. Manual
          chapters, Manuscript Blueprint, author notes, style samples, and front/back matter are added after the book exists.
        </Text>
        {error && <Alert color="red">{error}</Alert>}

        <Alert color="grape" variant="light">
          KPF and KCB imports use best-effort text extraction from readable Kindle package contents. If extraction fails,
          export from Kindle Create as EPUB, DOCX, Markdown, or TXT.
        </Alert>

        <SimpleGrid cols={{ base: 1, md: 2 }}>
          <TextInput label="Title" value={title} onChange={(event) => setTitle(event.currentTarget.value)} />
          <TextInput label="Author name" value={authorName} onChange={(event) => setAuthorName(event.currentTarget.value)} />
          <Select
            label="Genre"
            placeholder="Select genre"
            data={genreOptions}
            value={genre}
            onChange={(value) => setGenre(value || "")}
            searchable
            clearable
          />
          <Select
            label="Target audience"
            placeholder="Select target audience"
            data={targetAudienceOptions}
            value={targetAudience}
            onChange={(value) => setTargetAudience(value || "")}
            searchable
            clearable
          />
          <Select
            label="Point of view"
            data={["First person", "Second person", "Third person limited", "Third person omniscient", "Mixed"]}
            value={pointOfView}
            onChange={(value) => setPointOfView(value || "")}
          />
          <Select
            label="Tense"
            data={["Past", "Present", "Future", "Mixed"]}
            value={tense}
            onChange={(value) => setTense(value || "")}
          />
          <Select
            label="Dialogue density"
            data={DIALOG_DENSITY_LEVELS.map((level) => ({ label: DIALOG_DENSITY_LABELS[level], value: level }))}
            value={dialogDensity}
            onChange={(value) => setDialogDensity((value as DialogDensity) || "normal")}
          />
        </SimpleGrid>

        <Tabs defaultValue="upload">
          <Tabs.List>
            <Tabs.Tab value="upload">Upload Manuscript</Tabs.Tab>
            <Tabs.Tab value="paste">Paste Manuscript</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="upload" pt="md">
            <Dropzone
              accept={{
                "text/plain": [".txt"],
                "text/markdown": [".md"],
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
                "application/epub+zip": [".epub"],
                "application/pdf": [".pdf"],
                "application/octet-stream": [".kpf", ".kcb"],
              }}
              maxFiles={1}
              onDrop={(files) => setFile(files[0] || null)}
            >
              <Group justify="center" gap="md" mih={120}>
                <IconUpload size={28} />
                <div>
                  <Text fw={700}>{file ? file.name : "Drop manuscript file here"}</Text>
                  <Text size="sm" c="dimmed">
                    Supported formats: DOCX, EPUB, PDF, KPF, KCB, Markdown, TXT
                  </Text>
                </div>
              </Group>
            </Dropzone>
          </Tabs.Panel>
          <Tabs.Panel value="paste" pt="md">
            <Textarea
              leftSection={<IconFileText size={16} />}
              label="Paste full manuscript"
              description="For a single chapter, create the book first and use Add Chapter on the book dashboard."
              minRows={12}
              value={text}
              onChange={(event) => setText(event.currentTarget.value)}
            />
          </Tabs.Panel>
        </Tabs>

        <Group justify="flex-end">
          <Button color="grape" loading={loading} onClick={submit}>
            Store and Parse Manuscript
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}
