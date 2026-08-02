-- Run this in Supabase Dashboard → SQL Editor, once, in a new project.

-- 1. Table storing recording metadata (the actual video/audio files live in Storage, not here)
create table if not exists public.recordings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  name text not null,
  mode text,
  duration text,
  size text,
  has_video boolean default true,
  resolution text,
  transcript text,
  comments jsonb default '[]'::jsonb,
  deadline_at timestamptz,
  storage_path text not null,
  created_at timestamptz default now()
);

-- 2. Row Level Security: every user can only see/insert/delete their own rows.
-- This is what makes it safe to use the public "anon" key directly in the browser.
alter table public.recordings enable row level security;

create policy "Users can view their own recordings"
  on public.recordings for select
  using (auth.uid() = user_id);

create policy "Users can insert their own recordings"
  on public.recordings for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own recordings"
  on public.recordings for delete
  using (auth.uid() = user_id);

-- 3. Storage bucket for the actual recording files.
-- Go to Storage in the Supabase Dashboard → New bucket → name it "recordings" → Private (not public).
-- Then run the policies below so users can only reach files under their own user-id folder.

insert into storage.buckets (id, name, public)
values ('recordings', 'recordings', false)
on conflict (id) do nothing;

create policy "Users can upload to their own folder"
  on storage.objects for insert
  with check (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can read their own files"
  on storage.objects for select
  using (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete their own files"
  on storage.objects for delete
  using (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
