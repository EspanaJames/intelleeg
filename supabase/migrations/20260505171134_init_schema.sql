create extension if not exists "uuid-ossp";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  full_name text not null,
  gmail text unique not null,
  created_at timestamptz default now()
);

create table if not exists public.eeg_excel_files (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  file_name text,
  file_path text,
  file_url text,
  uploaded_at timestamptz default now()
);

alter table public.profiles enable row level security;
alter table public.eeg_excel_files enable row level security;

create policy "Users can view own profile"
on public.profiles
for select
using (auth.uid() = id);

create policy "Users can update own profile"
on public.profiles
for update
using (auth.uid() = id);

create policy "Users can view own excel files"
on public.eeg_excel_files
for select
using (auth.uid() = user_id);

create policy "Users can insert own excel files"
on public.eeg_excel_files
for insert
with check (auth.uid() = user_id);

create policy "Users can delete own excel files"
on public.eeg_excel_files
for delete
using (auth.uid() = user_id);