-- Migration: Add indexes for all unindexed foreign keys in public schema

-- 1. abridgement_plans
create index if not exists abridgement_plans_created_by_idx on public.abridgement_plans (created_by);

-- 2. abridgement_suggestions
create index if not exists abridgement_suggestions_chapter_id_idx on public.abridgement_suggestions (chapter_id);
create index if not exists abridgement_suggestions_paragraph_id_idx on public.abridgement_suggestions (paragraph_id);
create index if not exists abridgement_suggestions_plan_id_idx on public.abridgement_suggestions (plan_id);
create index if not exists abridgement_suggestions_scene_id_idx on public.abridgement_suggestions (scene_id);
create index if not exists abridgement_suggestions_target_chapter_id_idx on public.abridgement_suggestions (target_chapter_id);

-- 3. auto_review_jobs
create index if not exists auto_review_jobs_export_id_idx on public.auto_review_jobs (export_id);

-- 4. book_collaborators
create index if not exists book_collaborators_user_id_idx on public.book_collaborators (user_id);

-- 5. book_matter_sections
create index if not exists book_matter_sections_book_id_idx on public.book_matter_sections (book_id);

-- 6. books
create index if not exists books_finished_export_id_idx on public.books (finished_export_id);
create index if not exists books_owner_id_idx on public.books (owner_id);
create index if not exists books_project_id_idx on public.books (project_id);

-- 7. chapter_snapshots
create index if not exists chapter_snapshots_book_id_idx on public.chapter_snapshots (book_id);

-- 8. characters
create index if not exists characters_book_id_idx on public.characters (book_id);

-- 9. collaboration_notifications
create index if not exists collaboration_notifications_actor_user_id_idx on public.collaboration_notifications (actor_user_id);

-- 10. collaborator_invites
create index if not exists collaborator_invites_book_id_idx on public.collaborator_invites (book_id);
create index if not exists collaborator_invites_invited_by_idx on public.collaborator_invites (invited_by);

-- 11. continuity_issues
create index if not exists continuity_issues_book_id_idx on public.continuity_issues (book_id);
create index if not exists continuity_issues_chapter_id_idx on public.continuity_issues (chapter_id);
create index if not exists continuity_issues_scene_id_idx on public.continuity_issues (scene_id);

-- 12. creation_projects
create index if not exists creation_projects_created_book_id_idx on public.creation_projects (created_book_id);

-- 13. guidance_tasks
create index if not exists guidance_tasks_book_id_idx on public.guidance_tasks (book_id);

-- 14. locations
create index if not exists locations_book_id_idx on public.locations (book_id);

-- 15. locked_passages
create index if not exists locked_passages_book_id_idx on public.locked_passages (book_id);
create index if not exists locked_passages_chapter_id_idx on public.locked_passages (chapter_id);
create index if not exists locked_passages_paragraph_id_idx on public.locked_passages (paragraph_id);
create index if not exists locked_passages_scene_id_idx on public.locked_passages (scene_id);

-- 16. motifs
create index if not exists motifs_book_id_idx on public.motifs (book_id);

-- 17. paragraphs
create index if not exists paragraphs_chapter_id_idx on public.paragraphs (chapter_id);
create index if not exists paragraphs_scene_id_idx on public.paragraphs (scene_id);

-- 18. projects
create index if not exists projects_owner_id_idx on public.projects (owner_id);

-- 19. reader_annotations
create index if not exists reader_annotations_annotator_id_idx on public.reader_annotations (annotator_id);
create index if not exists reader_annotations_paragraph_id_idx on public.reader_annotations (paragraph_id);

-- 20. reference_materials
create index if not exists reference_materials_book_id_idx on public.reference_materials (book_id);

-- 21. revision_instructions
create index if not exists revision_instructions_book_id_idx on public.revision_instructions (book_id);

-- 22. revision_jobs
create index if not exists revision_jobs_chapter_id_idx on public.revision_jobs (chapter_id);
create index if not exists revision_jobs_created_by_idx on public.revision_jobs (created_by);
create index if not exists revision_jobs_paragraph_id_idx on public.revision_jobs (paragraph_id);
create index if not exists revision_jobs_scene_id_idx on public.revision_jobs (scene_id);

-- 23. revision_recipes
create index if not exists revision_recipes_owner_id_idx on public.revision_recipes (owner_id);

-- 24. revision_versions
create index if not exists revision_versions_chapter_id_idx on public.revision_versions (chapter_id);
create index if not exists revision_versions_paragraph_id_idx on public.revision_versions (paragraph_id);
create index if not exists revision_versions_review_assigned_by_idx on public.revision_versions (review_assigned_by);
create index if not exists revision_versions_reviewer_id_idx on public.revision_versions (reviewer_id);
create index if not exists revision_versions_revision_job_id_idx on public.revision_versions (revision_job_id);
create index if not exists revision_versions_scene_id_idx on public.revision_versions (scene_id);

-- 25. rewrite_campaigns
create index if not exists rewrite_campaigns_created_by_idx on public.rewrite_campaigns (created_by);
create index if not exists rewrite_campaigns_last_revision_job_id_idx on public.rewrite_campaigns (last_revision_job_id);

-- 26. rewrite_workflows
create index if not exists rewrite_workflows_campaign_id_idx on public.rewrite_workflows (campaign_id);
create index if not exists rewrite_workflows_last_drift_report_id_idx on public.rewrite_workflows (last_drift_report_id);
create index if not exists rewrite_workflows_owner_id_idx on public.rewrite_workflows (owner_id);
create index if not exists rewrite_workflows_review_assigned_by_idx on public.rewrite_workflows (review_assigned_by);
create index if not exists rewrite_workflows_reviewer_id_idx on public.rewrite_workflows (reviewer_id);
create index if not exists rewrite_workflows_sample_revision_job_idx on public.rewrite_workflows (sample_revision_job_id);

-- 27. scenes
create index if not exists scenes_chapter_id_idx on public.scenes (chapter_id);

-- 28. series
create index if not exists series_owner_id_idx on public.series (owner_id);

-- 29. style_samples
create index if not exists style_samples_book_id_idx on public.style_samples (book_id);

-- 30. themes
create index if not exists themes_book_id_idx on public.themes (book_id);

-- 31. timeline_notes
create index if not exists timeline_notes_book_id_idx on public.timeline_notes (book_id);
create index if not exists timeline_notes_chapter_id_idx on public.timeline_notes (chapter_id);
create index if not exists timeline_notes_scene_id_idx on public.timeline_notes (scene_id);

-- 32. user_settings
create index if not exists user_settings_default_revision_recipe_id_idx on public.user_settings (default_revision_recipe_id);
