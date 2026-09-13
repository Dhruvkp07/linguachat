-- LinguaChat schema
-- Safe to re-run: uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS everywhere,
-- so this also works as a migration on top of an older version of this schema.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text,
  avatar_url text,
  language text not null default 'en',
  created_at timestamptz not null default now()
);

-- Username: unique handle used for search, similar to Instagram/Messenger.
alter table profiles add column if not exists username text;
create unique index if not exists profiles_username_lower_idx on profiles (lower(username));
do $$ begin
  alter table profiles add constraint profiles_username_format
    check (username is null or username ~ '^[a-zA-Z0-9_]{3,20}$');
exception when duplicate_object then null;
end $$;

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists conversation_members (
  conversation_id uuid not null references conversations (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  primary key (conversation_id, user_id)
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations (id) on delete cascade,
  sender_id uuid not null references profiles (id),
  original_text text,
  original_language text,
  translated_text text,
  target_language text,
  created_at timestamptz not null default now()
);

-- Media sharing: photos and videos, with optional caption in original_text/translated_text.
alter table messages add column if not exists message_type text not null default 'text';
do $$ begin
  alter table messages add constraint messages_type_check
    check (message_type in ('text', 'image', 'video'));
exception when duplicate_object then null;
end $$;
alter table messages add column if not exists media_url text;
alter table messages add column if not exists media_mime_type text;

create index if not exists messages_conversation_created_idx on messages (conversation_id, created_at);
create index if not exists conversation_members_user_idx on conversation_members (user_id);

-- Keep conversations.updated_at current so the sidebar sorts by latest activity.
create or replace function touch_conversation_updated_at()
returns trigger language plpgsql as $$
begin
  update conversations set updated_at = now() where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists messages_touch_conversation on messages;
create trigger messages_touch_conversation
  after insert on messages
  for each row execute function touch_conversation_updated_at();

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

do $$ begin
  alter publication supabase_realtime add table messages;
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table profiles enable row level security;
alter table conversations enable row level security;
alter table conversation_members enable row level security;
alter table messages enable row level security;

-- Profiles: any signed-in user can look people up (needed for username/email
-- search), but can only edit their own row.
drop policy if exists "profiles_select_authenticated" on profiles;
create policy "profiles_select_authenticated" on profiles
  for select using (auth.role() = 'authenticated');

drop policy if exists "profiles_insert_self" on profiles;
create policy "profiles_insert_self" on profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_self" on profiles;
create policy "profiles_update_self" on profiles
  for update using (auth.uid() = id);

-- Conversations: visible/insertable only to members.
drop policy if exists "conversations_select_member" on conversations;
create policy "conversations_select_member" on conversations
  for select using (
    exists (
      select 1 from conversation_members m
      where m.conversation_id = conversations.id and m.user_id = auth.uid()
    )
  );

drop policy if exists "conversations_insert_creator" on conversations;
create policy "conversations_insert_creator" on conversations
  for insert with check (created_by = auth.uid());

-- Conversation members: a user can see membership rows for conversations
-- they belong to, and can add members (self or a friend) when creating a chat.
drop policy if exists "conversation_members_select_own" on conversation_members;
create policy "conversation_members_select_own" on conversation_members
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from conversation_members me
      where me.conversation_id = conversation_members.conversation_id
        and me.user_id = auth.uid()
    )
  );

drop policy if exists "conversation_members_insert" on conversation_members;
create policy "conversation_members_insert" on conversation_members
  for insert with check (
    exists (
      select 1 from conversations c
      where c.id = conversation_members.conversation_id
        and c.created_by = auth.uid()
    )
  );

-- Messages: only conversation members can read or send.
drop policy if exists "messages_select_member" on messages;
create policy "messages_select_member" on messages
  for select using (
    exists (
      select 1 from conversation_members m
      where m.conversation_id = messages.conversation_id and m.user_id = auth.uid()
    )
  );

drop policy if exists "messages_insert_member" on messages;
create policy "messages_insert_member" on messages
  for insert with check (
    sender_id = auth.uid()
    and exists (
      select 1 from conversation_members m
      where m.conversation_id = messages.conversation_id and m.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Storage: chat-media bucket for shared photos/videos
-- ---------------------------------------------------------------------------
-- Run once. If the bucket already exists this is a no-op.
insert into storage.buckets (id, name, public)
values ('chat-media', 'chat-media', true)
on conflict (id) do nothing;

-- Files are stored under `${conversation_id}/...`. Only members of that
-- conversation may upload; the bucket is public for read so translated
-- chat partners (and anyone with the unguessable URL) can view the file.
drop policy if exists "chat_media_insert_member" on storage.objects;
create policy "chat_media_insert_member" on storage.objects
  for insert with check (
    bucket_id = 'chat-media'
    and exists (
      select 1 from conversation_members m
      where m.user_id = auth.uid()
        and m.conversation_id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists "chat_media_select_public" on storage.objects;
create policy "chat_media_select_public" on storage.objects
  for select using (bucket_id = 'chat-media');

-- ---------------------------------------------------------------------------
-- v2 additions: reply-to, read receipts, audio, profile photos, deletion
-- ---------------------------------------------------------------------------

-- Reply-to support
alter table messages add column if not exists reply_to_id uuid references messages (id) on delete set null;

-- Read receipts
alter table messages add column if not exists read_at timestamptz;

-- Allow audio as a message type (drop + recreate constraint to include 'audio')
alter table messages drop constraint if exists messages_type_check;
alter table messages add constraint messages_type_check
  check (message_type in ('text', 'image', 'video', 'audio'));

-- Profile photo (separate from Google avatar_url)
alter table profiles add column if not exists profile_photo_url text;

-- Allow senders to delete their own messages
drop policy if exists "messages_delete_sender" on messages;
create policy "messages_delete_sender" on messages
  for delete using (
    sender_id = auth.uid()
    and exists (
      select 1 from conversation_members m
      where m.conversation_id = messages.conversation_id and m.user_id = auth.uid()
    )
  );

-- Allow recipients to mark messages as read (update read_at only)
drop policy if exists "messages_update_read" on messages;
create policy "messages_update_read" on messages
  for update using (
    exists (
      select 1 from conversation_members m
      where m.conversation_id = messages.conversation_id and m.user_id = auth.uid()
    )
  );

-- Profile photos storage bucket
insert into storage.buckets (id, name, public)
values ('profile-photos', 'profile-photos', true)
on conflict (id) do nothing;

drop policy if exists "profile_photos_insert_self" on storage.objects;
create policy "profile_photos_insert_self" on storage.objects
  for insert with check (
    bucket_id = 'profile-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "profile_photos_select_public" on storage.objects;
create policy "profile_photos_select_public" on storage.objects
  for select using (bucket_id = 'profile-photos');
