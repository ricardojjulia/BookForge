import { createCreativeWriterSyncCursor, type CreativeWriterConflict } from "@/lib/creativewriter-sync";

export type CreativeWriterBookOption = {
  id: string;
  title: string;
  authorName: string | null;
  status: string | null;
  updatedAt: string | null;
};

export type CreativeWriterChapterView = {
  id: string;
  chapterNumber: number;
  title: string | null;
  summary: string | null;
  currentText: string | null;
  updatedAt: string | null;
};

export type CreativeWriterParagraphView = {
  id: string;
  chapterId: string;
  sceneId: string | null;
  sceneNumber: number | null;
  paragraphNumber: number;
  sourceParagraphNumber: number;
  currentText: string | null;
  acceptedText: string | null;
  originalText: string | null;
  updatedAt: string | null;
};

export type CreativeWriterReaderCommentView = {
  id: string;
  paragraphId: string | null;
  annotatorId: string;
  note: string;
  resolved: boolean;
  createdAt: string | null;
};

export type CreativeWriterContributorSuggestionStatus = "proposed" | "accepted" | "rejected" | "withdrawn" | "applied" | "superseded";

export type CreativeWriterContributorSuggestionView = {
  id: string;
  chapterId: string | null;
  paragraphId: string | null;
  proposerId: string;
  reviewerId: string | null;
  status: CreativeWriterContributorSuggestionStatus;
  originalTextSnapshot: string | null;
  suggestedText: string;
  rationale: string | null;
  reviewNote: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  reviewedAt: string | null;
  appliedAt: string | null;
  withdrawnAt: string | null;
};

export type CreativeWriterContributorView = {
  userId: string;
  role: "viewer" | "editor" | "admin";
  displayName: string | null;
  email: string | null;
  joinedAt: string | null;
};

export type CreativeWriterParticipantProfileView = {
  userId: string;
  displayName: string | null;
};

export type CreativeWriterAssignmentStatus = "assigned" | "in_progress" | "completed" | "cancelled";

export type CreativeWriterContributorAssignmentView = {
  id: string;
  chapterId: string | null;
  paragraphId: string | null;
  assigneeId: string;
  assignerId: string | null;
  scope: "book" | "chapter" | "paragraph";
  status: CreativeWriterAssignmentStatus;
  title: string;
  note: string | null;
  dueAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
};

export type CreativeWriterConflictView = CreativeWriterConflict & {
  eventId: string;
};

export type CreativeWriterAuthorNotesView = {
  creativeInstructions: string | null;
  voiceGuidance: string | null;
  worldviewNotes: string | null;
  theologicalAlignment: string | null;
  forbiddenChanges: string | null;
  updatedAt: string | null;
};

export type CreativeWriterReferenceMaterialView = {
  id: string;
  title: string;
  materialType: string | null;
  content: string | null;
  includeInPrompts: boolean;
  createdAt: string | null;
};

export type CreativeWriterNamedContextView = {
  id: string;
  name: string;
  description: string | null;
  detail: string | null;
};

export type CreativeWriterTimelineNoteView = {
  id: string;
  note: string;
  sequenceOrder: number | null;
  detail: string | null;
};

export type CreativeWriterBookBibleView = {
  content: Record<string, unknown> | null;
  updatedAt: string | null;
  characters: CreativeWriterNamedContextView[];
  locations: CreativeWriterNamedContextView[];
  themes: CreativeWriterNamedContextView[];
  motifs: CreativeWriterNamedContextView[];
  timeline: CreativeWriterTimelineNoteView[];
};

export type CreativeWriterSupportContextView = {
  authorNotes: CreativeWriterAuthorNotesView | null;
  references: CreativeWriterReferenceMaterialView[];
  bible: CreativeWriterBookBibleView;
};

export type CreativeWriterWorkspaceData = {
  accountId: string;
  books: CreativeWriterBookOption[];
  selectedBook: CreativeWriterBookOption | null;
  chapters: CreativeWriterChapterView[];
  paragraphs: CreativeWriterParagraphView[];
  readerComments: CreativeWriterReaderCommentView[];
  contributorSuggestions: CreativeWriterContributorSuggestionView[];
  contributors: CreativeWriterContributorView[];
  participantProfiles: CreativeWriterParticipantProfileView[];
  contributorAssignments: CreativeWriterContributorAssignmentView[];
  conflicts: CreativeWriterConflictView[];
  support: CreativeWriterSupportContextView;
  project: {
    localProjectId: string;
    accountId: string;
    bookforgeBookId: string;
    syncCursor: string;
    lastCloudVersion: number;
    linkedAt: string;
  } | null;
};

export type CreativeWriterDashboardSupabaseLike = {
  from: (table: string) => unknown;
};

type QueryBuilder = {
  select: (columns: string, options?: unknown) => QueryBuilder;
  eq: (column: string, value: unknown) => QueryBuilder;
  in: (column: string, values: unknown[]) => QueryBuilder;
  order: (column: string, options?: { ascending?: boolean }) => QueryBuilder;
  limit: (count: number) => QueryBuilder;
  maybeSingle?: () => Promise<{ data?: unknown; error?: unknown }>;
  then: (resolve: (value: { data?: unknown; error?: unknown }) => unknown) => unknown;
};

type BookRow = {
  id: string;
  title: string;
  author_name: string | null;
  status: string | null;
  updated_at: string | null;
};

type ChapterRow = {
  id: string;
  chapter_number: number;
  title: string | null;
  summary: string | null;
  current_text: string | null;
  updated_at: string | null;
};

type ParagraphRow = {
  id: string;
  chapter_id: string;
  scene_id: string | null;
  paragraph_number: number;
  current_text: string | null;
  accepted_text: string | null;
  original_text: string | null;
  updated_at: string | null;
};

type SceneRow = {
  id: string;
  chapter_id: string;
  scene_number: number;
};

type ReaderCommentRow = {
  id: string;
  paragraph_id: string | null;
  annotator_id: string;
  note: string;
  resolved: boolean;
  created_at: string | null;
};

type ContributorSuggestionRow = {
  id: string;
  chapter_id: string | null;
  paragraph_id: string | null;
  proposer_id: string;
  reviewer_id: string | null;
  status: CreativeWriterContributorSuggestionStatus;
  original_text_snapshot: string | null;
  suggested_text: string;
  rationale: string | null;
  review_note: string | null;
  created_at: string | null;
  updated_at: string | null;
  reviewed_at: string | null;
  applied_at: string | null;
  withdrawn_at: string | null;
};

type ContributorRow = {
  user_id: string;
  role: "viewer" | "editor" | "admin";
  created_at: string | null;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
};

type ContributorAssignmentRow = {
  id: string;
  chapter_id: string | null;
  paragraph_id: string | null;
  assignee_id: string;
  assigner_id: string | null;
  scope: "book" | "chapter" | "paragraph";
  status: CreativeWriterAssignmentStatus;
  title: string;
  note: string | null;
  due_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  completed_at: string | null;
};

type ConflictEventRow = {
  id: string;
  conflict_id: string | null;
  conflict_payload: Record<string, unknown> | null;
  resolution_status: CreativeWriterConflict["resolutionStatus"] | null;
  created_at: string | null;
};

type AuthorNotesRow = {
  creative_instructions: string | null;
  voice_guidance: string | null;
  worldview_notes: string | null;
  theological_alignment: string | null;
  forbidden_changes: string | null;
  updated_at: string | null;
};

type ReferenceMaterialRow = {
  id: string;
  title: string;
  material_type: string | null;
  content: string | null;
  include_in_prompts: boolean | null;
  created_at: string | null;
};

type BookBibleRow = {
  content: Record<string, unknown> | null;
  updated_at: string | null;
};

type NamedContextRow = {
  id: string;
  name: string;
  description: string | null;
  role?: string | null;
  voice_notes?: string | null;
  arc_notes?: string | null;
  relationship_notes?: string | null;
};

type TimelineNoteRow = {
  id: string;
  note: string | null;
  event?: string | null;
  date_time?: string | null;
  continuity_notes?: string | null;
  sequence_order: number | null;
};

export async function getCreativeWriterWorkspaceData(input: {
  supabase: CreativeWriterDashboardSupabaseLike;
  accountId: string;
  selectedBookId?: string | null;
}): Promise<CreativeWriterWorkspaceData> {
  const { data: bookRows, error: booksError } = await resolveList<BookRow>(
    table(input.supabase, "books")
      .select("id,title,author_name,status,updated_at")
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(40),
  );
  if (booksError) throw booksError;

  const books = (bookRows || []).map(toBookOption);
  const selectedBook = books.find((book) => book.id === input.selectedBookId) || books[0] || null;
  if (!selectedBook) {
    return {
      accountId: input.accountId,
      books,
      selectedBook: null,
      chapters: [],
      paragraphs: [],
      readerComments: [],
      contributorSuggestions: [],
      contributors: [],
      participantProfiles: [],
      contributorAssignments: [],
      conflicts: [],
      support: emptySupportContext(),
      project: null,
    };
  }

  const [
    { data: chapterRows, error: chaptersError },
    { data: sceneRows, error: scenesError },
    { data: paragraphRows, error: paragraphsError },
    { data: readerCommentRows, error: readerCommentsError },
    { data: suggestionRows, error: suggestionsError },
    { data: contributorRows, error: contributorsError },
    { data: assignmentRows, error: assignmentsError },
    { data: conflictRows, error: conflictsError },
    { data: authorNotesRow, error: authorNotesError },
    { data: referenceRows, error: referencesError },
    { data: bookBibleRow, error: bookBibleError },
    { data: characterRows, error: charactersError },
    { data: locationRows, error: locationsError },
    { data: themeRows, error: themesError },
    { data: motifRows, error: motifsError },
    { data: timelineRows, error: timelineError },
  ] = await Promise.all([
      resolveList<ChapterRow>(
        table(input.supabase, "chapters")
          .select("id,chapter_number,title,summary,current_text,updated_at")
          .eq("book_id", selectedBook.id)
          .order("chapter_number"),
      ),
      resolveList<SceneRow>(
        table(input.supabase, "scenes")
          .select("id,chapter_id,scene_number")
          .eq("book_id", selectedBook.id)
          .order("scene_number"),
      ),
      resolveList<ParagraphRow>(
        table(input.supabase, "paragraphs")
          .select("id,chapter_id,scene_id,paragraph_number,current_text,accepted_text,original_text,updated_at")
          .eq("book_id", selectedBook.id)
          .order("paragraph_number"),
      ),
      resolveList<ReaderCommentRow>(
        table(input.supabase, "reader_annotations")
          .select("id,paragraph_id,annotator_id,note,resolved,created_at")
          .eq("book_id", selectedBook.id)
          .order("created_at", { ascending: false }),
      ),
      resolveList<ContributorSuggestionRow>(
        table(input.supabase, "creativewriter_contributor_suggestions")
          .select("id,chapter_id,paragraph_id,proposer_id,reviewer_id,status,original_text_snapshot,suggested_text,rationale,review_note,created_at,updated_at,reviewed_at,applied_at,withdrawn_at")
          .eq("book_id", selectedBook.id)
          .order("created_at", { ascending: false }),
      ),
      resolveList<ContributorRow>(
        table(input.supabase, "book_collaborators")
          .select("user_id,role,created_at")
          .eq("book_id", selectedBook.id)
          .order("created_at"),
      ),
      resolveList<ContributorAssignmentRow>(
        table(input.supabase, "creativewriter_contributor_assignments")
          .select("id,chapter_id,paragraph_id,assignee_id,assigner_id,scope,status,title,note,due_at,created_at,updated_at,completed_at")
          .eq("book_id", selectedBook.id)
          .order("created_at", { ascending: false }),
      ),
      resolveList<ConflictEventRow>(
        table(input.supabase, "creativewriter_sync_events")
          .select("id,conflict_id,conflict_payload,resolution_status,created_at")
          .eq("book_id", selectedBook.id)
          .eq("account_id", input.accountId)
          .eq("status", "conflict")
          .eq("resolution_status", "unresolved")
          .order("created_at", { ascending: false })
          .limit(20),
      ),
      resolveMaybe<AuthorNotesRow>(
        table(input.supabase, "author_notes")
          .select("creative_instructions,voice_guidance,worldview_notes,theological_alignment,forbidden_changes,updated_at")
          .eq("book_id", selectedBook.id),
      ),
      resolveList<ReferenceMaterialRow>(
        table(input.supabase, "reference_materials")
          .select("id,title,material_type,content,include_in_prompts,created_at")
          .eq("book_id", selectedBook.id)
          .order("created_at", { ascending: false })
          .limit(12),
      ),
      resolveMaybe<BookBibleRow>(
        table(input.supabase, "book_bibles")
          .select("content,updated_at")
          .eq("book_id", selectedBook.id),
      ),
      resolveList<NamedContextRow>(
        table(input.supabase, "characters")
          .select("*")
          .eq("book_id", selectedBook.id)
          .order("created_at"),
      ),
      resolveList<NamedContextRow>(
        table(input.supabase, "locations")
          .select("*")
          .eq("book_id", selectedBook.id)
          .order("created_at"),
      ),
      resolveList<NamedContextRow>(
        table(input.supabase, "themes")
          .select("*")
          .eq("book_id", selectedBook.id)
          .order("created_at"),
      ),
      resolveList<NamedContextRow>(
        table(input.supabase, "motifs")
          .select("*")
          .eq("book_id", selectedBook.id)
          .order("created_at"),
      ),
      resolveList<TimelineNoteRow>(
        table(input.supabase, "timeline_notes")
          .select("*")
          .eq("book_id", selectedBook.id)
          .order("sequence_order", { ascending: true }),
      ),
    ]);
  if (chaptersError) throw chaptersError;
  if (scenesError) throw scenesError;
  if (paragraphsError) throw paragraphsError;
  if (readerCommentsError) throw readerCommentsError;
  if (suggestionsError && !isMissingOptionalCreativeWriterTable(suggestionsError, "creativewriter_contributor_suggestions")) throw suggestionsError;
  if (contributorsError) throw contributorsError;
  if (assignmentsError && !isMissingOptionalCreativeWriterTable(assignmentsError, "creativewriter_contributor_assignments")) throw assignmentsError;
  if (conflictsError && !isMissingCreativeWriterLedger(conflictsError)) throw conflictsError;
  const supportErrors = [authorNotesError, referencesError, bookBibleError, charactersError, locationsError, themesError, motifsError, timelineError].filter(Boolean);
  const blockingSupportError = supportErrors.find((error) => !isMissingCreativeWriterLedger(error));
  if (blockingSupportError) throw blockingSupportError;

  const participantProfileRows = await loadVisibleParticipantProfiles(input.supabase, {
    accountId: input.accountId,
    contributors: contributorRows || [],
    readerComments: readerCommentRows || [],
    suggestions: suggestionRows || [],
    assignments: assignmentRows || [],
  });
  const participantProfiles = participantProfileRows.map(toParticipantProfileView);
  const participantProfileById = new Map(participantProfiles.map((profile) => [profile.userId, profile]));

  const cloudVersion = Math.max(
    versionFromDate(selectedBook.updatedAt),
    ...(chapterRows || []).map((chapter) => versionFromDate(chapter.updated_at)),
    ...(paragraphRows || []).map((paragraph) => versionFromDate(paragraph.updated_at)),
  );

  return {
    accountId: input.accountId,
    books,
    selectedBook,
    chapters: (chapterRows || []).map(toChapterView),
    paragraphs: toParagraphViews(paragraphRows || [], sceneRows || [], chapterRows || []),
    readerComments: (readerCommentRows || []).map(toReaderCommentView),
    contributorSuggestions: suggestionsError ? [] : (suggestionRows || []).map(toContributorSuggestionView),
    contributors: (contributorRows || []).map((row) => toContributorView(row, participantProfileById)),
    participantProfiles,
    contributorAssignments: assignmentsError ? [] : (assignmentRows || []).map(toContributorAssignmentView),
    conflicts: conflictsError ? [] : (conflictRows || []).flatMap(toConflictView),
    support: {
      authorNotes: authorNotesError ? null : toAuthorNotesView(authorNotesRow),
      references: referencesError ? [] : (referenceRows || []).map(toReferenceMaterialView),
      bible: {
        content: bookBibleError ? null : bookBibleRow?.content || null,
        updatedAt: bookBibleError ? null : bookBibleRow?.updated_at || null,
        characters: charactersError ? [] : (characterRows || []).map(toNamedContextView),
        locations: locationsError ? [] : (locationRows || []).map(toNamedContextView),
        themes: themesError ? [] : (themeRows || []).map(toNamedContextView),
        motifs: motifsError ? [] : (motifRows || []).map(toNamedContextView),
        timeline: timelineError ? [] : (timelineRows || []).map(toTimelineNoteView),
      },
    },
    project: {
      localProjectId: `web-${selectedBook.id}`,
      accountId: input.accountId,
      bookforgeBookId: selectedBook.id,
      syncCursor: createCreativeWriterSyncCursor({ bookId: selectedBook.id, cloudVersion }),
      lastCloudVersion: cloudVersion,
      linkedAt: selectedBook.updatedAt || new Date(0).toISOString(),
    },
  };
}

export function isMissingCreativeWriterLedger(error: unknown): boolean {
  return isMissingOptionalCreativeWriterTable(error, "creativewriter_sync_events");
}

function isMissingOptionalCreativeWriterTable(error: unknown, tableName: string): boolean {
  if (!error || typeof error !== "object") return false;
  const maybeError = error as { code?: unknown; message?: unknown };
  return maybeError.code === "PGRST205" && typeof maybeError.message === "string" && maybeError.message.includes(tableName);
}

export function versionFromDate(value: string | null | undefined): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? Math.floor(time / 1000) : 0;
}

function toBookOption(row: BookRow): CreativeWriterBookOption {
  return {
    id: row.id,
    title: row.title,
    authorName: row.author_name,
    status: row.status,
    updatedAt: row.updated_at,
  };
}

function toChapterView(row: ChapterRow): CreativeWriterChapterView {
  return {
    id: row.id,
    chapterNumber: row.chapter_number,
    title: row.title,
    summary: row.summary,
    currentText: row.current_text,
    updatedAt: row.updated_at,
  };
}

function toParagraphViews(rows: ParagraphRow[], scenes: SceneRow[], chapters: ChapterRow[]): CreativeWriterParagraphView[] {
  const chapterOrder = new Map(chapters.map((chapter) => [chapter.id, chapter.chapter_number]));
  const sceneById = new Map(scenes.map((scene) => [scene.id, scene]));
  const nextParagraphNumberByChapter = new Map<string, number>();

  return rows
    .slice()
    .sort((a, b) => {
      const chapterCompare = (chapterOrder.get(a.chapter_id) ?? Number.MAX_SAFE_INTEGER) - (chapterOrder.get(b.chapter_id) ?? Number.MAX_SAFE_INTEGER);
      if (chapterCompare !== 0) return chapterCompare;
      const sceneCompare = (sceneById.get(a.scene_id || "")?.scene_number ?? Number.MAX_SAFE_INTEGER) - (sceneById.get(b.scene_id || "")?.scene_number ?? Number.MAX_SAFE_INTEGER);
      if (sceneCompare !== 0) return sceneCompare;
      const paragraphCompare = a.paragraph_number - b.paragraph_number;
      if (paragraphCompare !== 0) return paragraphCompare;
      return a.id.localeCompare(b.id);
    })
    .map((row) => {
      const paragraphNumber = (nextParagraphNumberByChapter.get(row.chapter_id) || 0) + 1;
      nextParagraphNumberByChapter.set(row.chapter_id, paragraphNumber);
      const scene = sceneById.get(row.scene_id || "");
      return {
        id: row.id,
        chapterId: row.chapter_id,
        sceneId: row.scene_id,
        sceneNumber: scene?.scene_number ?? null,
        paragraphNumber,
        sourceParagraphNumber: row.paragraph_number,
        currentText: row.current_text,
        acceptedText: row.accepted_text,
        originalText: row.original_text,
        updatedAt: row.updated_at,
      };
    });
}

function toReaderCommentView(row: ReaderCommentRow): CreativeWriterReaderCommentView {
  return {
    id: row.id,
    paragraphId: row.paragraph_id,
    annotatorId: row.annotator_id,
    note: row.note,
    resolved: row.resolved,
    createdAt: row.created_at,
  };
}

function toContributorSuggestionView(row: ContributorSuggestionRow): CreativeWriterContributorSuggestionView {
  return {
    id: row.id,
    chapterId: row.chapter_id,
    paragraphId: row.paragraph_id,
    proposerId: row.proposer_id,
    reviewerId: row.reviewer_id,
    status: row.status,
    originalTextSnapshot: row.original_text_snapshot,
    suggestedText: row.suggested_text,
    rationale: row.rationale,
    reviewNote: row.review_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reviewedAt: row.reviewed_at,
    appliedAt: row.applied_at,
    withdrawnAt: row.withdrawn_at,
  };
}

async function loadVisibleParticipantProfiles(
  supabase: CreativeWriterDashboardSupabaseLike,
  input: {
    accountId: string;
    contributors: ContributorRow[];
    readerComments: ReaderCommentRow[];
    suggestions: ContributorSuggestionRow[];
    assignments: ContributorAssignmentRow[];
  },
): Promise<ProfileRow[]> {
  const ids = new Set<string>([input.accountId]);
  input.contributors.forEach((contributor) => ids.add(contributor.user_id));
  input.readerComments.forEach((comment) => ids.add(comment.annotator_id));
  input.suggestions.forEach((suggestion) => {
    ids.add(suggestion.proposer_id);
    if (suggestion.reviewer_id) ids.add(suggestion.reviewer_id);
  });
  input.assignments.forEach((assignment) => {
    ids.add(assignment.assignee_id);
    if (assignment.assigner_id) ids.add(assignment.assigner_id);
  });
  const userIds = Array.from(ids).filter(Boolean);
  if (!userIds.length) return [];
  const { data, error } = await resolveList<ProfileRow>(
    table(supabase, "profiles")
      .select("id,display_name")
      .in("id", userIds),
  );
  if (error) return [];
  return data || [];
}

function toContributorView(row: ContributorRow, participantProfileById: Map<string, CreativeWriterParticipantProfileView>): CreativeWriterContributorView {
  const profile = participantProfileById.get(row.user_id);
  return {
    userId: row.user_id,
    role: row.role,
    displayName: profile?.displayName || null,
    email: null,
    joinedAt: row.created_at,
  };
}

function toParticipantProfileView(row: ProfileRow): CreativeWriterParticipantProfileView {
  return {
    userId: row.id,
    displayName: row.display_name,
  };
}

function toContributorAssignmentView(row: ContributorAssignmentRow): CreativeWriterContributorAssignmentView {
  return {
    id: row.id,
    chapterId: row.chapter_id,
    paragraphId: row.paragraph_id,
    assigneeId: row.assignee_id,
    assignerId: row.assigner_id,
    scope: row.scope,
    status: row.status,
    title: row.title,
    note: row.note,
    dueAt: row.due_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

function toConflictView(row: ConflictEventRow): CreativeWriterConflictView[] {
  if (!row.conflict_id || !row.conflict_payload) return [];
  return [
    {
      ...(row.conflict_payload as CreativeWriterConflict),
      id: row.conflict_id,
      eventId: row.id,
      resolutionStatus: row.resolution_status || "unresolved",
      createdAt: row.created_at || String(row.conflict_payload.createdAt || new Date(0).toISOString()),
    },
  ];
}

function toAuthorNotesView(row: AuthorNotesRow | null | undefined): CreativeWriterAuthorNotesView | null {
  if (!row) return null;
  return {
    creativeInstructions: row.creative_instructions,
    voiceGuidance: row.voice_guidance,
    worldviewNotes: row.worldview_notes,
    theologicalAlignment: row.theological_alignment,
    forbiddenChanges: row.forbidden_changes,
    updatedAt: row.updated_at,
  };
}

function toReferenceMaterialView(row: ReferenceMaterialRow): CreativeWriterReferenceMaterialView {
  return {
    id: row.id,
    title: row.title,
    materialType: row.material_type,
    content: row.content,
    includeInPrompts: Boolean(row.include_in_prompts),
    createdAt: row.created_at,
  };
}

function toNamedContextView(row: NamedContextRow): CreativeWriterNamedContextView {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    detail: [row.role, row.voice_notes, row.arc_notes, row.relationship_notes].filter(Boolean).join(" | ") || null,
  };
}

function toTimelineNoteView(row: TimelineNoteRow): CreativeWriterTimelineNoteView {
  return {
    id: row.id,
    note: row.event || row.note || "",
    sequenceOrder: row.sequence_order,
    detail: [row.date_time, row.continuity_notes, row.event && row.note ? row.note : null].filter(Boolean).join(" | ") || null,
  };
}

function emptySupportContext(): CreativeWriterSupportContextView {
  return {
    authorNotes: null,
    references: [],
    bible: {
      content: null,
      updatedAt: null,
      characters: [],
      locations: [],
      themes: [],
      motifs: [],
      timeline: [],
    },
  };
}

function table(supabase: CreativeWriterDashboardSupabaseLike, name: string): QueryBuilder {
  return supabase.from(name) as QueryBuilder;
}

async function resolveList<T>(builder: QueryBuilder): Promise<{ data: T[] | null; error: unknown }> {
  const result = await (builder as unknown as Promise<{ data?: T[] | null; error?: unknown }>);
  return { data: result?.data ?? [], error: result?.error ?? null };
}

async function resolveMaybe<T>(builder: QueryBuilder): Promise<{ data: T | null; error: unknown }> {
  if (builder.maybeSingle) {
    const result = await builder.maybeSingle();
    return { data: (result?.data as T | null | undefined) ?? null, error: result?.error ?? null };
  }
  const result = await (builder as unknown as Promise<{ data?: T[] | null; error?: unknown }>);
  const rows = result?.data || [];
  return { data: rows[0] ?? null, error: result?.error ?? null };
}
