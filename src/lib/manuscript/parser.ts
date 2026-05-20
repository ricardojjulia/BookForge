import mammoth from "mammoth";
import JSZip from "jszip";
import type { ParsedChapter, ParsedManuscript, ParsedParagraph, ParsedScene } from "@/lib/types";

const chapterPattern =
  /^(#{1,2}\s*)?((chapter|cap[ií]tulo)\s+([0-9]+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|diecis[eé]is|diecisiete|dieciocho|diecinueve|veinte|primero|primera|segundo|segunda|tercero|tercera)(\s*[:.-]\s*.*)?|prologue|pr[oó]logo|epilogue|ep[ií]logo|introduction|introducci[oó]n|afterword|[0-9]+\.\s+.+|[0-9]+\s*:\s+.+)$/imu;

const inlineChapterHeadingPattern =
  /(^|[.!?…]\s+)((chapter|cap[ií]tulo)\s+(?:[0-9]+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|diecis[eé]is|diecisiete|dieciocho|diecinueve|veinte|primero|primera|segundo|segunda|tercero|tercera)(?:\s*[:.-])?)/gimu;

const sceneBreakPattern = /^\s{0,3}(\*\s*\*\s*\*|#{3,}|-{3,}|_{3,})\s*$/m;

export async function extractTextFromFile(file: File): Promise<string> {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension === "txt" || extension === "md") {
    return file.text();
  }

  if (extension === "docx") {
    const buffer = Buffer.from(await file.arrayBuffer());
    return extractTextFromDocxBuffer(buffer);
  }

  if (extension === "epub") {
    return extractTextFromEpub(Buffer.from(await file.arrayBuffer()));
  }

  if (extension === "kpf" || extension === "kcb") {
    return extractTextFromKindlePackage(Buffer.from(await file.arrayBuffer()), extension.toUpperCase());
  }

  throw new Error("Unsupported file type. Upload .txt, .md, .docx, .epub, .kpf, or .kcb.");
}

export function parseManuscript(originalText: string, title = "Untitled Book"): ParsedManuscript {
  const normalized = normalizeChapterHeadingBreaks(originalText.replace(/\r\n/g, "\n")).trim();
  const chapters = splitChapters(normalized);

  return {
    title,
    originalText: normalized,
    chapters: chapters.length
      ? chapters
      : [
          {
            chapterNumber: 1,
            title: "Chapter 1",
            text: normalized,
            scenes: splitScenes(normalized),
          },
        ],
  };
}

export function parseChapterScenes(text: string): ParsedScene[] {
  return splitScenes(text);
}

function splitChapters(text: string): ParsedChapter[] {
  const lines = normalizeChapterHeadingBreaks(text).split("\n");
  const starts: Array<{ index: number; title: string }> = [];

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (isChapterStartLine(trimmed, lines, index)) {
      starts.push({ index, title: trimmed.replace(/^#{1,2}\s*/, "") });
    }
  });

  if (!starts.length) return [];

  const chapters = starts.map((start, index) => {
    const next = starts[index + 1]?.index ?? lines.length;
    const chapterLines = lines.slice(start.index, next);
    const chapterText = chapterLines.join("\n").trim();
    return {
      chapterNumber: index + 1,
      title: normalizeDetectedChapterTitle(start.title, index),
      text: chapterText,
      scenes: splitScenes(chapterText),
    };
  });

  return removeLikelyTocChapters(chapters);
}

function isChapterStartLine(line: string, lines: string[], index: number) {
  if (!line || line.length > 110) return false;
  if (chapterPattern.test(line)) return true;

  const words = line.split(/\s+/).filter(Boolean).length;
  if (/^t[ií]tulo$/i.test(line)) {
    return followingBodyWordCount(lines, index) >= 35;
  }
  if (words < 2 || words > 14) return false;
  if (/[.!?…]$/.test(line)) return false;
  if (/^por$/i.test(line)) return false;
  if (/^(p[aá]ginas preliminares|material complementario)$/i.test(line)) return true;
  if (/^conclusi[oó]n\s*:/i.test(line)) return true;
  if (!line.includes(":")) return false;

  if (followingBodyWordCount(lines, index) < 35) return false;

  const previousBody = lines
    .slice(Math.max(0, index - 4), index)
    .join(" ")
    .trim();
  const previousWords = previousBody.split(/\s+/).filter(Boolean).length;
  return index <= 5 || previousWords >= 35;
}

function followingBodyWordCount(lines: string[], index: number) {
  return lines
    .slice(index + 1, index + 5)
    .join(" ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function normalizeDetectedChapterTitle(title: string, index: number) {
  if (/^t[ií]tulo$/i.test(title.trim())) {
    return index <= 1 ? "Introducción" : `Capítulo ${index + 1}`;
  }
  return title || `Chapter ${index + 1}`;
}

function normalizeChapterHeadingBreaks(text: string) {
  return text
    .replace(inlineChapterHeadingPattern, (_match, prefix: string, heading: string) => {
      const sentenceEnd = prefix.trim();
      return `${sentenceEnd ? `${sentenceEnd}\n\n` : ""}${heading.trim()}`;
    })
    .replace(/([^\n])\s+((chapter|cap[ií]tulo)\s+[0-9ivxlcdm]+\s*[:.-])/gimu, "$1\n\n$2")
    .replace(
      /^((chapter|cap[ií]tulo)\s+(?:[0-9]+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|diecis[eé]is|diecisiete|dieciocho|diecinueve|veinte|primero|primera|segundo|segunda|tercero|tercera)\s*[:.-]?)(\s+\S.{80,})$/gimu,
      "$1\n\n$3",
    )
    .replace(/\n{3,}/g, "\n\n");
}

function splitScenes(text: string): ParsedScene[] {
  const chunks: string[] = [];
  let current: string[] = [];

  for (const line of text.split("\n")) {
    if (sceneBreakPattern.test(line)) {
      if (current.join("\n").trim()) chunks.push(current.join("\n").trim());
      current = [];
    } else {
      current.push(line);
    }
  }

  if (current.join("\n").trim()) chunks.push(current.join("\n").trim());

  const sceneTexts = chunks.length ? chunks : [text.trim()];
  return sceneTexts.map((sceneText, index) => ({
    sceneNumber: index + 1,
    text: sceneText,
    paragraphs: splitParagraphs(sceneText),
  }));
}

function splitParagraphs(text: string): ParsedParagraph[] {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph, index) => ({
      paragraphNumber: index + 1,
      text: paragraph,
    }));
}

async function extractTextFromEpub(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const files = (await getEpubSpineFiles(zip)) || getReadableZipFiles(zip);

  const text = await extractReadableTextFromZipFiles(files);
  if (!text) {
    throw new Error("No readable manuscript text was found in the EPUB.");
  }
  return text;
}

async function extractTextFromKindlePackage(buffer: Buffer, label: string): Promise<string> {
  try {
    const zip = await JSZip.loadAsync(buffer);
    const docxText = await extractTextFromEmbeddedDocx(zip);
    if (docxText) return docxText;

    const files = getReadableZipFiles(zip);

    const text = await extractReadableTextFromZipFiles(files, { addChapterHeadings: true });
    if (text) return text;
  } catch {
    // Some Kindle Create package variants are not standard zip archives.
  }

  assertNotKindleCreateProjectDescriptor(buffer, label);

  const looseText = extractReadableTextFromLooseKindleBuffer(buffer);
  if (looseText) return looseText;

  throw new Error(
    `${label} import could not extract readable text from this file. If this Kindle package does not contain readable HTML/XML text, export it from Kindle Create as EPUB, DOCX, Markdown, or TXT and import that file.`,
  );
}

function assertNotKindleCreateProjectDescriptor(buffer: Buffer, label: string) {
  const raw = buffer.toString("utf8").trim();
  if (!raw.startsWith("{")) return;

  try {
    const parsed = JSON.parse(raw) as {
      metadata?: { tool_name?: unknown; book_path?: unknown };
      tool_data?: { cache_path?: unknown };
    };
    const isKindleCreateProject =
      parsed.metadata?.tool_name === "KC" &&
      typeof parsed.metadata.book_path === "string" &&
      typeof parsed.tool_data?.cache_path === "string";

    if (isKindleCreateProject) {
      throw new Error(
        `${label} is a Kindle Create project descriptor, not a self-contained manuscript package. Import the project's KPF, EPUB, DOCX, Markdown, or TXT file instead. For this project, the readable source is usually the sibling book_1.docx file or the exported KPF/EPUB folder.`,
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("Kindle Create project descriptor")) {
      throw error;
    }
  }
}

async function extractTextFromDocxBuffer(buffer: Buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

async function extractTextFromEmbeddedDocx(zip: JSZip) {
  const docxFiles = Object.values(zip.files)
    .filter((entry) => !entry.dir)
    .filter((entry) => /\.docx$/i.test(entry.name))
    .sort((a, b) => scoreEmbeddedDocxPath(a.name) - scoreEmbeddedDocxPath(b.name) || a.name.localeCompare(b.name));

  for (const file of docxFiles) {
    const buffer = Buffer.from(await file.async("arraybuffer"));
    const text = normalizeExtractedText(await extractTextFromDocxBuffer(buffer));
    if (text && isReadableManuscriptSection(text)) return text;
  }

  return "";
}

async function extractReadableTextFromZipFiles(
  files: JSZip.JSZipObject[],
  options: { addChapterHeadings?: boolean } = {},
) {
  const chunks: string[] = [];
  let chapterNumber = 1;

  for (const file of files) {
    const raw = await file.async("text");
    const cleaned = cleanMarkupText(raw);
    if (cleaned && isReadableManuscriptSection(cleaned)) {
      if (options.addChapterHeadings && !startsWithChapterHeading(cleaned)) {
        const title = getDocumentTitle(raw, file.name);
        chunks.push(`Chapter ${chapterNumber}: ${title}\n\n${cleaned}`);
      } else {
        chunks.push(cleaned);
      }
      chapterNumber += 1;
    }
  }

  return normalizeExtractedText(chunks.join("\n\n"));
}

function removeLikelyTocChapters(chapters: ParsedChapter[]) {
  const hasSubstantialVersion = new Set(
    chapters
      .filter((chapter) => meaningfulBodyWordCount(chapter.text, chapter.title) >= 80)
      .map((chapter) => normalizeChapterIdentity(chapter.title)),
  );

  const filtered = chapters.filter((chapter) => {
    const bodyWords = meaningfulBodyWordCount(chapter.text, chapter.title);
    const identity = normalizeChapterIdentity(chapter.title);
    return bodyWords >= 12 || !hasSubstantialVersion.has(identity);
  });

  return filtered.map((chapter, index) => ({
    ...chapter,
    chapterNumber: index + 1,
    scenes: splitScenes(chapter.text),
  }));
}

function meaningfulBodyWordCount(text: string, title: string) {
  return text
    .replace(title, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function normalizeChapterIdentity(title: string) {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelyNavigationText(text: string) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const headingLikeLines = lines.filter((line) => line.length <= 90 && chapterPattern.test(line)).length;
  const shortLines = lines.filter((line) => line.length <= 90).length;
  const words = text.split(/\s+/).filter(Boolean).length;
  const startsAsContents = /^conteni[dc]o\b|^contents\b|^table of contents\b/i.test(lines[0] || "");

  return (
    (startsAsContents && words < 1000) ||
    (headingLikeLines >= 3 &&
      shortLines / Math.max(lines.length, 1) > 0.72 &&
      words < 1000)
  );
}

function isReadableManuscriptSection(text: string) {
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words < 20) return false;
  if (isLikelyNavigationText(text)) return false;
  return true;
}

function extractReadableTextFromLooseKindleBuffer(buffer: Buffer) {
  const candidates = [
    extractReadableRuns(buffer.toString("utf8")),
    extractReadableRuns(buffer.toString("utf16le")),
  ];

  const cleanedCandidates = candidates
    .map((candidate) => normalizeExtractedText(cleanMarkupText(candidate)))
    .filter((candidate) => candidate.length >= 500 && isReadableManuscriptSection(candidate))
    .sort((a, b) => b.length - a.length);

  return cleanedCandidates[0] || "";
}

function extractReadableRuns(text: string) {
  const normalized = text
    .replace(/\u0000/g, "\n")
    .replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f\ufffd]+/g, "\n")
    .replace(/[^\S\r\n]+/g, " ");

  const runs = normalized
    .split(/\n{2,}/)
    .map((run) => run.trim())
    .filter((run) => run.length >= 120)
    .filter((run) => /[A-Za-zÀ-ž]{3,}/.test(run))
    .filter((run) => !isLikelyPackageMetadata(run));

  return runs.join("\n\n");
}

function isLikelyPackageMetadata(text: string) {
  const lower = text.toLowerCase();
  const words = text.split(/\s+/).filter(Boolean).length;
  const metadataHits = [
    "kindlecreate",
    "content.opf",
    "mimetype",
    "container.xml",
    "manifest",
    "stylesheet",
    "font-family",
    "application/",
    "image/",
  ].filter((marker) => lower.includes(marker)).length;

  return metadataHits >= 2 && words < 120;
}

async function getEpubSpineFiles(zip: JSZip) {
  const container = zip.file("META-INF/container.xml");
  if (!container) return null;

  const containerXml = await container.async("text");
  const opfPath = containerXml.match(/full-path=["']([^"']+)["']/i)?.[1];
  if (!opfPath) return null;

  const opfFile = zip.file(opfPath);
  if (!opfFile) return null;

  const opfXml = await opfFile.async("text");
  const basePath = opfPath.includes("/") ? `${opfPath.split("/").slice(0, -1).join("/")}/` : "";
  const manifest = new Map<string, string>();

  for (const item of opfXml.matchAll(/<item\b[^>]*>/gi)) {
    const tag = item[0];
    const id = tag.match(/\bid=["']([^"']+)["']/i)?.[1];
    const href = tag.match(/\bhref=["']([^"']+)["']/i)?.[1];
    if (id && href) {
      manifest.set(id, normalizeZipPath(`${basePath}${href}`));
    }
  }

  const spinePaths = Array.from(opfXml.matchAll(/<itemref\b[^>]*\bidref=["']([^"']+)["'][^>]*>/gi))
    .map((match) => manifest.get(match[1]))
    .filter((path): path is string => Boolean(path))
    .filter((path) => !isNonContentPath(path));

  const files = spinePaths
    .map((path) => zip.file(path))
    .filter((file): file is JSZip.JSZipObject => Boolean(file))
    .filter((file) => /\.(xhtml|html|htm|xml|txt)$/i.test(file.name));

  return files.length ? files : null;
}

function getReadableZipFiles(zip: JSZip) {
  return Object.values(zip.files)
    .filter((entry) => !entry.dir)
    .filter((entry) => /\.(xhtml|html|htm|xml|txt|md)$/i.test(entry.name))
    .filter((entry) => !/^(META-INF|__MACOSX)\//i.test(entry.name))
    .filter((entry) => !isNonContentPath(entry.name))
    .sort((a, b) => scoreEpubPath(a.name) - scoreEpubPath(b.name) || a.name.localeCompare(b.name));
}

function scoreEpubPath(path: string) {
  if (/nav|toc|cover|titlepage|copyright|metadata/i.test(path)) return 100;
  if (/chapter|chap|text|content|body/i.test(path)) return 0;
  return 10;
}

function scoreEmbeddedDocxPath(path: string) {
  if (/book|manuscript|content|body/i.test(path)) return 0;
  return 10;
}

function isNonContentPath(path: string) {
  return /(^|\/)(nav|toc|cover|titlepage|copyright|metadata|stylesheet|style|page-list|landmarks)\.(xhtml|html|htm|xml|css)$/i.test(
    path,
  );
}

function normalizeZipPath(path: string) {
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

function startsWithChapterHeading(text: string) {
  return text
    .split("\n")
    .slice(0, 6)
    .some((line) => chapterPattern.test(line.trim()));
}

function getDocumentTitle(raw: string, path: string) {
  const heading =
    raw.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i)?.[1] ||
    raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ||
    "";
  const cleanedHeading = normalizeExtractedText(cleanMarkupText(heading));
  if (cleanedHeading && cleanedHeading.length <= 90) return cleanedHeading;

  const basename = path.split("/").pop()?.replace(/\.(xhtml|html|htm|xml|txt|md)$/i, "") || "Untitled";
  return basename
    .replace(/[_-]+/g, " ")
    .replace(/\b(chapter|chap)\s*0*([0-9]+)/i, "Chapter $2")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanMarkupText(raw: string) {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<\/(p|div|section|article|chapter|h[1-6]|li|blockquote)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([a-f0-9]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function normalizeExtractedText(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
