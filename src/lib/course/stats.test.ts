import { describe, expect, it } from "vitest";
import { buildCourseAggregates } from "@/lib/course/stats";

describe("buildCourseAggregates", () => {
  it("counts modules, lessons, and assets by course", () => {
    const aggregates = buildCourseAggregates({
      courseIds: ["c1", "c2"],
      modules: [{ course_id: "c1" }, { course_id: "c1" }, { course_id: "c2" }],
      lessons: [{ course_id: "c1" }, { course_id: "c2" }, { course_id: "c2" }],
      assets: [{ course_id: "c2" }],
    });

    expect(aggregates.c1).toEqual({ moduleCount: 2, lessonCount: 1, assetCount: 0 });
    expect(aggregates.c2).toEqual({ moduleCount: 1, lessonCount: 2, assetCount: 1 });
  });

  it("ignores rows for unknown or null course ids", () => {
    const aggregates = buildCourseAggregates({
      courseIds: ["c1"],
      modules: [{ course_id: "c2" }, { course_id: null }],
      lessons: [{ course_id: null }],
      assets: [{ course_id: "c3" }],
    });

    expect(aggregates.c1).toEqual({ moduleCount: 0, lessonCount: 0, assetCount: 0 });
  });
});
