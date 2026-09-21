-- ==============================================================================
-- Dyna-learn Database Schema (Supabase PostgreSQL)
-- ==============================================================================

-- 1. Profiles & Gamification
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  display_name text,
  avatar_url text,
  streak int default 1,
  last_active_date date default current_date,
  last_synced_at timestamptz default now(),
  created_at timestamptz default now()
);

-- 2. Study Sessions (Workspaces / Mind Maps)
create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  title text not null default 'Untitled Session',
  nodes jsonb not null default '[]'::jsonb,
  edges jsonb not null default '[]'::jsonb,
  chat_history jsonb not null default '[]'::jsonb,
  version int not null default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 3. Spaced Repetition (SRS Flashcards)
create table if not exists public.srs_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  session_id uuid references public.study_sessions(id) on delete set null,
  node_id text,
  label text not null,
  interval_days int default 0,
  ease_factor float default 2.5,
  repetitions int default 0,
  next_review_at timestamptz default now() + interval '12 hours',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes for lightning fast queries
create index if not exists idx_sessions_user on public.study_sessions(user_id, updated_at desc);
create index if not exists idx_srs_user_review on public.srs_cards(user_id, next_review_at);

-- Row-Level Security (RLS) policies
alter table public.profiles enable row level security;
alter table public.study_sessions enable row level security;
alter table public.srs_cards enable row level security;

-- Profiles: users can only view and update their own profile
drop policy if exists "Users can view and update own profile" on public.profiles;
create policy "Users can view and update own profile"
  on public.profiles for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Study Sessions: users can only access their own workspaces
drop policy if exists "Users can manage own sessions" on public.study_sessions;
create policy "Users can manage own sessions"
  on public.study_sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- SRS Cards: users can only access their own cards
drop policy if exists "Users can manage own srs cards" on public.srs_cards;
create policy "Users can manage own srs cards"
  on public.srs_cards for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Trigger: auto-create public.profiles entry whenever a user signs up in auth.users
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
