-- 赵小萱宝宝的今日心情补给站
-- 在 Supabase Dashboard > SQL Editor 中完整执行本文件。

create extension if not exists pgcrypto;

create table if not exists public.daily_records (
  id uuid primary key default gen_random_uuid(),
  record_date date not null,
  mood text not null,
  body_status text not null,
  care_needs text[] not null,
  message text not null default '',
  submitted_at timestamptz not null default now(),
  viewed boolean not null default false,
  viewed_at timestamptz,
  updated_at timestamptz not null default now(),

  constraint daily_records_record_date_key unique (record_date),
  constraint daily_records_mood_check check (
    mood in ('happy', 'normal', 'sad', 'annoyed', 'need_comfort', 'need_space', 'upset_with_zhang')
  ),
  constraint daily_records_body_status_check check (
    body_status in ('good', 'slightly_uncomfortable', 'very_uncomfortable')
  ),
  constraint daily_records_care_needs_count_check check (
    cardinality(care_needs) between 1 and 3
  ),
  constraint daily_records_care_needs_values_check check (
    care_needs <@ array[
      'hug', 'chat', 'listen_only', 'treat', 'hot_drink',
      'stay_together', 'give_space', 'comfort', 'be_proactive', 'just_know'
    ]::text[]
  ),
  constraint daily_records_message_length_check check (char_length(message) <= 100),
  constraint daily_records_viewed_at_check check (
    (viewed = false and viewed_at is null) or viewed = true
  )
);

create index if not exists daily_records_record_date_idx
  on public.daily_records (record_date desc);

create or replace function public.set_daily_records_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_daily_records_updated_at on public.daily_records;
create trigger set_daily_records_updated_at
before update on public.daily_records
for each row execute function public.set_daily_records_updated_at();

alter table public.daily_records enable row level security;

drop policy if exists "mood admins can read records" on public.daily_records;
create policy "mood admins can read records"
on public.daily_records
for select
to authenticated
using (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'mood_admin'
);

-- 管理员只通过这个受控函数修改查看状态，不能从浏览器改写记录内容。
create or replace function public.mark_daily_record_viewed(target_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'mood_admin' then
    raise exception 'not authorized';
  end if;

  update public.daily_records
  set viewed = true,
      viewed_at = now(),
      updated_at = now()
  where id = target_id;

  if not found then
    raise exception 'record not found';
  end if;
end;
$$;

revoke all on table public.daily_records from anon, authenticated;
grant select on table public.daily_records to authenticated;

revoke all on function public.mark_daily_record_viewed(uuid) from public, anon;
grant execute on function public.mark_daily_record_viewed(uuid) to authenticated;

revoke all on function public.set_daily_records_updated_at() from public, anon, authenticated;

comment on table public.daily_records is '每天只保留一条赵小萱宝宝的最新状态记录';
comment on function public.mark_daily_record_viewed(uuid) is '仅 mood_admin 可标记记录为已查看';
