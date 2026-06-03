import { describe, expect, it } from "vitest";
import { buildCourseAssetDrafts, buildCourseLessonDrafts } from "@/lib/course/publish";

describe("course publish helpers", () => {
  it("buildCourseLessonDrafts maps chapter summaries to chapter_summary lessons", () => {
    const lessons = buildCourseLessonDrafts(
      [
        { id: "c1", chapter_number: 1, title: "Start", summary: "Summary 1" },
        { id: "c2", chapter_number: 2, title: "Middle", summary: "" },
      ],
      new Map([
        ["c1", "m1"],
        ["c2", "m2"],
      ]),
    );

    expect(lessons).toHaveLength(1);
    expect(lessons[0].module_id).toBe("m1");
    expect(lessons[0].lesson_type).toBe("chapter_summary");
    expect(String(lessons[0].title)).toContain("Start");
  });

  it("buildCourseAssetDrafts includes export, matter, and chapter summary assets", () => {
    const assets = buildCourseAssetDrafts({
      courseId: "course-1",
      chapters: [
        { id: "c1", chapter_number: 1, title: "Start", summary: "Summary 1" },
      ],
      matterSections: [
        { id: "m1", section_type: "preface", title: "Preface", content: "Matter content", sort_order: 1 },
      ],
      exports: [
        {
          id: "e1",
          format: "pdf",
          storage_path: "exports/book.pdf",
          metadata: { sourceMode: "accepted" },
          created_at: "2026-06-02T00:00:00.000Z",
        },
      ],
    });

    expect(assets.some((asset) => asset.asset_type === "book_export")).toBe(true);
    expect(assets.some((asset) => asset.asset_type === "matter_section")).toBe(true);
    expect(assets.some((asset) => asset.asset_type === "chapter_summary")).toBe(true);
    expect(assets.every((asset) => asset.course_id === "course-1")).toBe(true);
  });
});
