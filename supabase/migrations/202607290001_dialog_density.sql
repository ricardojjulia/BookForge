-- Author-selected dialogue density target, captured at book creation/import
-- and enforced downstream by generation/rewrite prompts and the dialogue_density critic.

alter table public.books
  add column if not exists dialog_density text not null default 'normal'
    check (dialog_density in ('low', 'normal', 'above_normal', 'high'));

alter table public.creation_projects
  add column if not exists dialog_density text
    check (dialog_density in ('low', 'normal', 'above_normal', 'high'));
