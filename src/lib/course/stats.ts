type ScopedRow = { course_id: string | null };

export type CourseAggregate = {
  moduleCount: number;
  lessonCount: number;
  assetCount: number;
};

export function buildCourseAggregates(input: {
  courseIds: string[];
  modules: ScopedRow[];
  lessons: ScopedRow[];
  assets: ScopedRow[];
}): Record<string, CourseAggregate> {
  const base = Object.fromEntries(
    input.courseIds.map((id) => [
      id,
      {
        moduleCount: 0,
        lessonCount: 0,
        assetCount: 0,
      },
    ]),
  ) as Record<string, CourseAggregate>;

  for (const row of input.modules) {
    if (!row.course_id || !base[row.course_id]) continue;
    base[row.course_id].moduleCount += 1;
  }
  for (const row of input.lessons) {
    if (!row.course_id || !base[row.course_id]) continue;
    base[row.course_id].lessonCount += 1;
  }
  for (const row of input.assets) {
    if (!row.course_id || !base[row.course_id]) continue;
    base[row.course_id].assetCount += 1;
  }

  return base;
}
