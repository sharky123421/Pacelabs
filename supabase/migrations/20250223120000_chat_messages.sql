-- Coach chat: persist conversation history per user
-- Run in Supabase SQL Editor or: supabase db push

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  tokens_used integer,
  created_at timestamptz not null default now()
);

create index chat_messages_user_id_created_at_idx on public.chat_messages (user_id, created_at desc);

comment on table public.chat_messages is 'AI coach chat history; keep last 50 in context, archive older';

alter table public.chat_messages enable row level security;

create policy "Users can view own chat_messages"
  on public.chat_messages for select
  using (auth.uid() = user_id);

create policy "Users can insert own chat_messages"
  on public.chat_messages for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own chat_messages"
  on public.chat_messages for delete
  using (auth.uid() = user_id);
