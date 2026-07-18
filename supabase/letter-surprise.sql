-- 已经初始化过数据库时，只需在 Supabase SQL Editor 中执行本文件。

create table if not exists public.private_letters (
  letter_id text primary key,
  title text not null,
  salutation text not null,
  paragraphs jsonb not null,
  signature text not null,
  letter_date text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint private_letters_paragraphs_check check (
    jsonb_typeof(paragraphs) = 'array'
    and jsonb_array_length(paragraphs) between 1 and 20
  )
);

create table if not exists public.private_letter_reads (
  letter_id text primary key,
  opened_at timestamptz not null default now()
);

alter table public.private_letters enable row level security;
alter table public.private_letter_reads enable row level security;
revoke all on table public.private_letters from anon, authenticated;
revoke all on table public.private_letter_reads from anon, authenticated;

comment on table public.private_letters is '专属信件正文，仅允许 Edge Function 访问';
comment on table public.private_letter_reads is '专属信件首次拆阅状态，仅允许 Edge Function 访问';
