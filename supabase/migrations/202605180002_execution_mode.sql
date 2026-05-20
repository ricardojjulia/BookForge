alter table public.user_settings
  add column if not exists execution_mode text not null default 'auto'
    check (execution_mode in ('auto', 'local', 'cloud'));

comment on column public.user_settings.execution_mode is
  'auto = route by task type; local = always LM Studio; cloud = always cloud provider';
