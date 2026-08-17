alter table public.creation_projects
  drop constraint creation_projects_status_check;

alter table public.creation_projects
  add constraint creation_projects_status_check
    check (status in ('concept', 'planning', 'approved', 'generating', 'created', 'cancelled', 'failed'));

comment on column public.creation_projects.status is
  'failed = the most recent concept/architecture generation attempt errored out; metadata.lastError holds the reason. Distinct from a never-attempted or cancelled project.';
