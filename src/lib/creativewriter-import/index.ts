import JSZip from "jszip";
import mammoth from "mammoth";
import { z } from "zod";
import { extractTextFromFile } from "@/lib/manuscript/parser";
import {
  bookForgePackageFormatVersion,
  buildBookForgePackage,
  logicalBookForgePackageSchema,
  type BookForgePackageEntry,
  type LogicalBookForgePackage,
} from "@/lib/bookforge-package";

export const creativeWriterImportSourceSchema = z.enum([
  "auto",
  "document",
  "markdown_folder",
  "novelwriter",
  "manuskript",
  "joplin",
  "zettlr",
  "logseq",
  "obsidian",
  "wavemaker",
  "bibisco",
  "quollwriter",
]);
export type CreativeWriterImportSource = z.infer<typeof creativeWriterImportSourceSchema>;

export const creativeWriterImportLimits = {
  maxFiles: 25,
  maxFileBytes: 25 * 1024 * 1024,
  maxArchiveEntries: 250,
  maxEntryCharacters: 500_000,
  maxTotalExtractedCharacters: 2_000_000,
} as const;

export type CreativeWriterImportInput = {
  files: File[];
  title?: string;
  authorName?: string | null;
  source?: CreativeWriterImportSource;
  packageId?: string;
  timestamp?: string;
};

export type CreativeWriterImportResult = {
  package: LogicalBookForgePackage;
  source: CreativeWriterImportSource;
  importedFileCount: number;
  manuscriptEntryCount: number;
  noteEntryCount: number;
  warnings: string[];
};

type ExtractedDocument = {
  path: string;
  title: string;
  text: string;
  kind: "manuscript" | "note" | "research" | "bible";
};

const directTextExtensions = new Set(["txt", "md", "markdown", "mdown", "org", "nwd"]);
const archiveExtensions = new Set(["zip", "msk", "bibisco2"]);

export async function buildCreativeWriterPackageFromImport(input: CreativeWriterImportInput): Promise<CreativeWriterImportResult> {
  if (!input.files.length) {
    throw new Error("Upload at least one file to import.");
  }
  enforceImportLimits(input.files);

  const timestamp = input.timestamp || new Date().toISOString();
  const source = inferImportSource(input.files, creativeWriterImportSourceSchema.parse(input.source || "auto"));
  const warnings: string[] = [];
  const extracted: ExtractedDocument[] = [];

  for (const file of input.files) {
    const extension = getExtension(file.name);
    if (extension === "bookforge.json" || file.name.endsWith(".bookforge.json")) {
      const parsed = logicalBookForgePackageSchema.parse(JSON.parse(await readFileText(file)));
      return {
        package: parsed,
        source,
        importedFileCount: 1,
        manuscriptEntryCount: parsed.entries.filter((entry) => entry.kind === "manuscript").length,
        noteEntryCount: parsed.entries.filter((entry) => entry.kind === "note").length,
        warnings,
      };
    }

    if (extension === "doc") {
      warnings.push("Legacy .doc files require conversion to .docx, .pdf, .txt, or Markdown before SaaS import.");
      continue;
    }

    if (extension === "jex") {
      warnings.push("Joplin .jex archives are not parsed in this web importer yet. Export Joplin notes as Markdown directory for now.");
      continue;
    }

    if (archiveExtensions.has(extension)) {
      pushExtractedDocuments(extracted, await extractFromZipLike(file, warnings), warnings);
      continue;
    }

    if (extension === "wmproj") {
      pushExtractedDocuments(extracted, extractFromWavemakerJson(file.name, await readFileText(file), warnings), warnings);
      continue;
    }

    const text = await extractDirectDocumentText(file, warnings);
    if (text.trim()) {
      pushExtractedDocuments(
        extracted,
        [
          {
            path: file.name,
            title: titleFromPath(file.name),
            text,
            kind: classifyEntryKind(file.name),
          },
        ],
        warnings,
      );
    }
  }

  const manuscriptDocs = extracted.filter((doc) => doc.kind === "manuscript" && doc.text.trim());
  if (!manuscriptDocs.length) {
    throw new Error("No readable manuscript text was found. Use TXT, Markdown, DOCX, PDF, EPUB, KPF/KCB, Wavemaker .wmProj, or a zip/folder export containing readable text files.");
  }

  const title = input.title?.trim() || inferTitle(manuscriptDocs, input.files) || "Untitled Book";
  const { chapters, paragraphs } = buildRowsFromDocuments(manuscriptDocs);
  const additionalEntries = buildAdditionalEntries(extracted.filter((doc) => doc.kind !== "manuscript"));

  const pkg = buildBookForgePackage({
    packageId: input.packageId || `import-${slugify(title)}-${Date.now()}`,
    createdAt: timestamp,
    updatedAt: timestamp,
    mode: "local_only",
    book: {
      title,
      author_name: input.authorName || null,
      status: "draft",
    },
    chapters,
    paragraphs,
    sourceMode: "original",
    additionalEntries: [
      ...additionalEntries,
      {
        path: "metadata/import.json",
        kind: "metadata",
        content: JSON.stringify(
          {
            formatVersion: bookForgePackageFormatVersion,
            source,
            importedAt: timestamp,
            sourceFiles: input.files.map((file) => file.name),
            warnings,
          },
          null,
          2,
        ).concat("\n"),
      },
    ],
  });

  return {
    package: pkg,
    source,
    importedFileCount: input.files.length,
    manuscriptEntryCount: manuscriptDocs.length,
    noteEntryCount: extracted.filter((doc) => doc.kind !== "manuscript").length,
    warnings,
  };
}

function enforceImportLimits(files: File[]) {
  if (files.length > creativeWriterImportLimits.maxFiles) {
    throw new Error(`CreativeWriter import accepts up to ${creativeWriterImportLimits.maxFiles} files per request.`);
  }

  const oversized = files.find((file) => file.size > creativeWriterImportLimits.maxFileBytes);
  if (oversized) {
    throw new Error(`CreativeWriter import file ${oversized.name} exceeds the ${Math.floor(creativeWriterImportLimits.maxFileBytes / 1024 / 1024)} MB per-file limit.`);
  }
}

function pushExtractedDocuments(target: ExtractedDocument[], docs: ExtractedDocument[], warnings: string[]) {
  for (const doc of docs) {
    const currentCharacters = target.reduce((sum, item) => sum + item.text.length, 0);
    if (currentCharacters >= creativeWriterImportLimits.maxTotalExtractedCharacters) {
      warnings.push(`Import text was capped at ${creativeWriterImportLimits.maxTotalExtractedCharacters.toLocaleString("en-US")} characters.`);
      return;
    }

    const remainingCharacters = creativeWriterImportLimits.maxTotalExtractedCharacters - currentCharacters;
    const maxDocCharacters = Math.min(creativeWriterImportLimits.maxEntryCharacters, remainingCharacters);
    const text = doc.text.length > maxDocCharacters ? doc.text.slice(0, maxDocCharacters) : doc.text;
    if (text.length < doc.text.length) {
      warnings.push(`${doc.path} was truncated to keep the import within service limits.`);
    }
    target.push({ ...doc, text });
  }
}

function inferImportSource(files: File[], requested: CreativeWriterImportSource): CreativeWriterImportSource {
  if (requested !== "auto") return requested;
  const names = files.map((file) => file.name.toLowerCase());
  if (names.some((name) => name.endsWith(".wmproj"))) return "wavemaker";
  if (names.some((name) => name.endsWith(".msk"))) return "manuskript";
  if (names.some((name) => name.endsWith(".bibisco2"))) return "bibisco";
  if (names.some((name) => name.endsWith(".nwx") || name.endsWith(".nwd"))) return "novelwriter";
  if (names.some((name) => name.includes("logseq") || name.includes("/pages/"))) return "logseq";
  if (names.every((name) => /\.(md|markdown|txt|org|zip)$/.test(name))) return "markdown_folder";
  return "document";
}

async function extractDirectDocumentText(file: File, warnings: string[]): Promise<string> {
  const extension = getExtension(file.name);
  if (directTextExtensions.has(extension)) return readFileText(file);
  if (extension === "pdf" || extension === "docx" || extension === "epub" || extension === "kpf" || extension === "kcb") {
    return extractTextFromFile(file);
  }
  if (extension === "rtf") {
    warnings.push("RTF import is best-effort and strips common control words.");
    return stripRtf(await readFileText(file));
  }
  warnings.push(`Skipped unsupported file: ${file.name}`);
  return "";
}

async function readFileText(file: File): Promise<string> {
  return Buffer.from(await file.arrayBuffer()).toString("utf8");
}

async function extractFromZipLike(file: File, warnings: string[]): Promise<ExtractedDocument[]> {
  try {
    const zip = await JSZip.loadAsync(Buffer.from(await file.arrayBuffer()));
    const docs: ExtractedDocument[] = [];
    const entries = Object.values(zip.files)
      .filter((entry) => !entry.dir)
      .filter((entry) => isSafeArchivePath(entry.name))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    if (entries.length > creativeWriterImportLimits.maxArchiveEntries) {
      warnings.push(`${file.name} contains more than ${creativeWriterImportLimits.maxArchiveEntries} readable archive entries; remaining entries were skipped.`);
    }

    for (const entry of entries.slice(0, creativeWriterImportLimits.maxArchiveEntries)) {
      const extension = getExtension(entry.name);
      let text = "";
      if (directTextExtensions.has(extension)) {
        text = await entry.async("text");
      } else if (extension === "html" || extension === "htm" || extension === "xml") {
        text = stripMarkup(await entry.async("text"));
      } else if (extension === "docx") {
        text = await extractDocxText(Buffer.from(await entry.async("arraybuffer")));
      } else if (extension === "wmproj" || extension === "json") {
        docs.push(...extractFromWavemakerJson(entry.name, await entry.async("text"), warnings));
        continue;
      }

      if (text.trim() && isLikelyAuthorText(text)) {
        docs.push({
          path: entry.name,
          title: titleFromPath(entry.name),
          text,
          kind: classifyEntryKind(entry.name),
        });
      }
    }

    if (!docs.length) warnings.push(`No readable text entries were found inside ${file.name}.`);
    return docs;
  } catch (error) {
    warnings.push(`${file.name} could not be opened as a zip-compatible archive.`);
    if (error instanceof Error && error.message) warnings.push(error.message);
    return [];
  }
}

function extractFromWavemakerJson(path: string, raw: string, warnings: string[]): ExtractedDocument[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    const strings = collectTextFields(parsed);
    return strings.map((text, index) => ({
      path: `${path}#section-${index + 1}`,
      title: `${titleFromPath(path)} ${index + 1}`,
      text,
      kind: "manuscript",
    }));
  } catch {
    warnings.push(`${path} is not valid JSON and could not be parsed as a Wavemaker-style project.`);
    return [];
  }
}

function collectTextFields(value: unknown, results: string[] = [], key = ""): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.split(/\s+/).length >= 20 && /body|chapter|content|draft|manuscript|scene|text|writing/i.test(key)) {
      results.push(trimmed);
    }
    return results;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectTextFields(item, results, `${key}[${index}]`));
    return results;
  }
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([childKey, childValue]) => collectTextFields(childValue, results, childKey));
  }
  return results;
}

function buildRowsFromDocuments(docs: ExtractedDocument[]) {
  const chapters = docs.map((doc, index) => ({
    id: `import-chapter-${index + 1}`,
    chapter_number: index + 1,
    title: doc.title || `Chapter ${index + 1}`,
  }));

  const paragraphs = docs.flatMap((doc, chapterIndex) =>
    splitParagraphs(doc.text).map((paragraph, paragraphIndex) => ({
      id: `import-paragraph-${chapterIndex + 1}-${paragraphIndex + 1}`,
      chapter_id: `import-chapter-${chapterIndex + 1}`,
      paragraph_number: paragraphIndex + 1,
      original_text: paragraph,
    })),
  );

  return { chapters, paragraphs };
}

function buildAdditionalEntries(docs: ExtractedDocument[]): BookForgePackageEntry[] {
  return docs.map((doc, index) => ({
    path: `${doc.kind}/${String(index + 1).padStart(3, "0")}-${slugify(doc.title || doc.kind)}.md`,
    kind: doc.kind,
    content: doc.text.trim().concat("\n"),
    metadata: { sourcePath: doc.path },
  }));
}

function splitParagraphs(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function classifyEntryKind(path: string): ExtractedDocument["kind"] {
  const normalized = path.toLowerCase();
  if (/\/?(notes?|inbox|pages)\//.test(normalized)) return "note";
  if (/\/?(research|sources?|references?|citations?)\//.test(normalized)) return "research";
  if (/\/?(bible|characters?|world|timeline|settings?)\//.test(normalized)) return "bible";
  return "manuscript";
}

function inferTitle(docs: ExtractedDocument[], files: File[]) {
  if (docs.length === 1) return docs[0].title;
  const firstNamedFile = files.find((file) => !archiveExtensions.has(getExtension(file.name)));
  return firstNamedFile ? titleFromPath(firstNamedFile.name) : titleFromPath(files[0]?.name || "");
}

function titleFromPath(path: string): string {
  const file = path.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "") || "Untitled";
  return file
    .replace(/^\d+[-_.\s]*/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getExtension(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".bookforge.json")) return "bookforge.json";
  return lower.split(".").pop() || "";
}

async function extractDocxText(buffer: Buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

function stripMarkup(raw: string): string {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripRtf(raw: string): string {
  return raw
    .replace(/\\'[0-9a-f]{2}/gi, "")
    .replace(/\\[a-z]+\d* ?/gi, "")
    .replace(/[{}]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isLikelyAuthorText(text: string): boolean {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length >= 8;
}

function isSafeArchivePath(path: string): boolean {
  return Boolean(path && !path.startsWith("/") && !path.includes("\\") && !path.split("/").includes(".."));
}

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "untitled";
}
