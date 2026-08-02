alter table public.books
  add column if not exists world_bible_processed boolean not null default false,
  add column if not exists world_bible_status text not null default 'not_started'
    check (world_bible_status in ('not_started', 'processing', 'completed', 'failed')),
  add column if not exists world_bible_processed_at timestamptz,
  add column if not exists world_bible_source_hash text;

alter table public.characters
  add column if not exists source text not null default 'manual'
    check (source in ('manual', 'ai_discovered')),
  add column if not exists discovery_key text,
  add column if not exists discovery_job_id uuid references public.revision_jobs(id) on delete set null,
  add column if not exists discovered_at timestamptz;

alter table public.locations
  add column if not exists source text not null default 'manual'
    check (source in ('manual', 'ai_discovered')),
  add column if not exists discovery_key text,
  add column if not exists discovery_job_id uuid references public.revision_jobs(id) on delete set null,
  add column if not exists discovered_at timestamptz;

alter table public.themes
  add column if not exists source text not null default 'manual'
    check (source in ('manual', 'ai_discovered')),
  add column if not exists discovery_key text,
  add column if not exists discovery_job_id uuid references public.revision_jobs(id) on delete set null,
  add column if not exists discovered_at timestamptz;

alter table public.motifs
  add column if not exists source text not null default 'manual'
    check (source in ('manual', 'ai_discovered')),
  add column if not exists discovery_key text,
  add column if not exists discovery_job_id uuid references public.revision_jobs(id) on delete set null,
  add column if not exists discovered_at timestamptz;

alter table public.timeline_notes
  add column if not exists source text not null default 'manual'
    check (source in ('manual', 'ai_discovered')),
  add column if not exists discovery_key text,
  add column if not exists discovery_job_id uuid references public.revision_jobs(id) on delete set null,
  add column if not exists discovered_at timestamptz;

create unique index if not exists characters_ai_discovery_key_idx
  on public.characters (book_id, discovery_key)
  where source = 'ai_discovered' and discovery_key is not null;

create unique index if not exists locations_ai_discovery_key_idx
  on public.locations (book_id, discovery_key)
  where source = 'ai_discovered' and discovery_key is not null;

create unique index if not exists themes_ai_discovery_key_idx
  on public.themes (book_id, discovery_key)
  where source = 'ai_discovered' and discovery_key is not null;

create unique index if not exists motifs_ai_discovery_key_idx
  on public.motifs (book_id, discovery_key)
  where source = 'ai_discovered' and discovery_key is not null;

create unique index if not exists timeline_notes_ai_discovery_key_idx
  on public.timeline_notes (book_id, discovery_key)
  where source = 'ai_discovered' and discovery_key is not null;

create index if not exists characters_discovery_job_idx on public.characters (discovery_job_id);
create index if not exists locations_discovery_job_idx on public.locations (discovery_job_id);
create index if not exists themes_discovery_job_idx on public.themes (discovery_job_id);
create index if not exists motifs_discovery_job_idx on public.motifs (discovery_job_id);
create index if not exists timeline_notes_discovery_job_idx on public.timeline_notes (discovery_job_id);
