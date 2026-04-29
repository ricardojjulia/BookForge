import { randomUUID } from "crypto";
import JSZip from "jszip";
import {
  humanizeSectionType,
  selectExportParagraphText,
  type BuildMarkdownInput,
  type MatterSectionForExport,
  type ParagraphForExport,
} from "@/lib/export/markdown";

type EpubSection = {
  id: string;
  href: string;
  title: string;
  body: string;
};

const frontMatterTypes = new Set(["title_page", "copyright_page", "dedication", "foreword", "preface", "introduction"]);

const backMatterTypes = new Set([
  "acknowledgments",
  "author_bio",
  "appendix",
  "bibliography",
  "endnotes",
  "discussion_questions",
  "small_group_questions",
  "glossary",
]);

export type EpubMetadata = {
  language?: string;
  publisher?: string;
  copyright?: string;
  description?: string;
};

export async function buildFinalManuscriptEpub(input: BuildMarkdownInput, metadata: EpubMetadata = {}) {
  const bookId = `urn:uuid:${randomUUID()}`;
  const sections = buildEpubSections(input);
  const zip = new JSZip();

  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="EPUB/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
  );

  zip.file("EPUB/styles.css", buildCss());
  zip.file("EPUB/nav.xhtml", buildNav(input, sections));
  zip.file("EPUB/content.opf", buildPackage(input, sections, bookId, metadata));
  sections.forEach((section) => {
    zip.file(`EPUB/${section.href}`, buildXhtmlDocument(section.title, section.body));
  });

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

function buildEpubSections(input: BuildMarkdownInput) {
  const sections: EpubSection[] = [];
  const sortedMatter = (input.matterSections || []).slice().sort((a, b) => {
    const sort = (a.sort_order ?? 0) - (b.sort_order ?? 0);
    if (sort !== 0) return sort;
    return a.section_type.localeCompare(b.section_type);
  });

  if (input.includeFrontMatter) {
    appendMatterSections(sections, sortedMatter.filter((section) => frontMatterTypes.has(section.section_type)), "front");
  }

  const paragraphsByChapter = input.paragraphs.reduce<Record<string, ParagraphForExport[]>>((groups, paragraph) => {
    groups[paragraph.chapter_id] ||= [];
    groups[paragraph.chapter_id].push(paragraph);
    return groups;
  }, {});

  input.chapters.forEach((chapter) => {
    const chapterParagraphs = (paragraphsByChapter[chapter.id] || [])
      .slice()
      .sort((a, b) => a.paragraph_number - b.paragraph_number);
    if (!chapterParagraphs.length) return;

    const title = chapter.title?.trim() || `Chapter ${chapter.chapter_number}`;
    const body: string[] = [`<h1>${escapeXml(title)}</h1>`];
    let previousSceneId: string | null = null;

    chapterParagraphs.forEach((paragraph, index) => {
      if (index > 0 && paragraph.scene_id && previousSceneId && paragraph.scene_id !== previousSceneId) {
        body.push(`<p class="scene-break">***</p>`);
      }
      body.push(...textToParagraphs(selectExportParagraphText(paragraph, input)));
      previousSceneId = paragraph.scene_id;
    });

    sections.push({
      id: `chapter-${chapter.chapter_number}`,
      href: `chapter-${chapter.chapter_number}.xhtml`,
      title,
      body: body.join("\n"),
    });
  });

  if (input.includeBackMatter) {
    appendMatterSections(sections, sortedMatter.filter((section) => backMatterTypes.has(section.section_type)), "back");
  }

  return sections;
}

function appendMatterSections(sections: EpubSection[], matterSections: MatterSectionForExport[], prefix: string) {
  matterSections.forEach((section, index) => {
    const title = section.title?.trim() || humanizeSectionType(section.section_type);
    sections.push({
      id: `${prefix}-${index + 1}`,
      href: `${prefix}-${index + 1}.xhtml`,
      title,
      body: [`<h1>${escapeXml(title)}</h1>`, ...textToParagraphs(section.content)].join("\n"),
    });
  });
}

function buildPackage(input: BuildMarkdownInput, sections: EpubSection[], bookId: string, metadata: EpubMetadata) {
  const manifestItems = sections
    .map((section) => `<item id="${section.id}" href="${section.href}" media-type="application/xhtml+xml"/>`)
    .join("\n    ");
  const spineItems = sections.map((section) => `<itemref idref="${section.id}"/>`).join("\n    ");
  const author = input.book.author_name ? `<dc:creator>${escapeXml(input.book.author_name)}</dc:creator>` : "";
  const publisher = metadata.publisher ? `<dc:publisher>${escapeXml(metadata.publisher)}</dc:publisher>` : "";
  const rights = metadata.copyright ? `<dc:rights>${escapeXml(metadata.copyright)}</dc:rights>` : "";
  const description = metadata.description ? `<dc:description>${escapeXml(metadata.description)}</dc:description>` : "";
  const language = metadata.language?.trim() || "en";

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookforge-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookforge-id">${bookId}</dc:identifier>
    <dc:title>${escapeXml(input.book.title || "Untitled Book")}</dc:title>
    ${author}
    ${publisher}
    ${rights}
    ${description}
    <dc:language>${escapeXml(language)}</dc:language>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d{3}Z$/, "Z")}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="styles" href="styles.css" media-type="text/css"/>
    ${manifestItems}
  </manifest>
  <spine>
    ${spineItems}
  </spine>
</package>`;
}

function buildNav(input: BuildMarkdownInput, sections: EpubSection[]) {
  const navItems = sections
    .map((section) => `<li><a href="${section.href}">${escapeXml(section.title)}</a></li>`)
    .join("\n        ");

  return buildXhtmlDocument(
    "Table of Contents",
    `<h1>${escapeXml(input.book.title || "Table of Contents")}</h1>
    <nav epub:type="toc" id="toc">
      <h2>Contents</h2>
      <ol>
        ${navItems}
      </ol>
    </nav>`,
  );
}

function buildXhtmlDocument(title: string, body: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en">
  <head>
    <title>${escapeXml(title)}</title>
    <link rel="stylesheet" type="text/css" href="styles.css"/>
  </head>
  <body>
    ${body}
  </body>
</html>`;
}

function textToParagraphs(text: string) {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeXml(paragraph).replace(/\n/g, "<br/>")}</p>`);
}

function buildCss() {
  return `body {
  font-family: serif;
  line-height: 1.45;
  margin: 5%;
}

h1 {
  margin-top: 1.5em;
  margin-bottom: 1em;
  text-align: center;
}

p {
  margin: 0 0 1em 0;
}

.scene-break {
  text-align: center;
  margin: 1.5em 0;
}`;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
