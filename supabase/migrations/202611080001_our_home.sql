-- Additive upgrade: existing mood records and private letters stay in place.
begin;
create table public.home_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  profile text not null unique check (profile in ('xiaoxuan', 'zhang'))
);
insert into public.home_members(user_id, profile)
select id, 'zhang' from auth.users where raw_app_meta_data->>'role' = 'mood_admin'
order by created_at limit 1;
alter table public.home_members enable row level security;
revoke all on public.home_members from anon, authenticated;
grant select on public.home_members to authenticated;
create policy own_membership on public.home_members for select to authenticated using (user_id = auth.uid());

create function public.is_home_member() returns boolean language sql stable security definer
set search_path = '' as $$ select exists(select 1 from public.home_members where user_id = auth.uid()); $$;
revoke all on function public.is_home_member() from public, anon;
grant execute on function public.is_home_member() to authenticated;

create table public.home_date (
  id boolean primary key default true check(id),
  date date,
  time time,
  place text not null default '' check(char_length(place) <= 200),
  note text not null default '' check(char_length(note) <= 1000),
  version integer not null default 1,
  updated_at timestamptz not null default now()
);
insert into public.home_date(id) values(true);
create table public.home_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check(kind in ('food','place')),
  name text not null check(char_length(trim(name)) between 1 and 100),
  address text not null default '' check(char_length(address) <= 300),
  note text not null default '' check(char_length(note) <= 1000),
  image_path text,
  done boolean not null default false,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(image_path is null or image_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$')
);
create table public.home_photos (
  id uuid primary key default gen_random_uuid(),
  path text not null unique check(path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'),
  title text not null default '' check(char_length(title) <= 100),
  created_at timestamptz not null default now()
);
create table public.home_frame (
  id boolean primary key default true check(id),
  photo_id uuid references public.home_photos(id) on delete set null,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);
insert into public.home_frame(id) values(true);

create function public.home_bump_version() returns trigger language plpgsql set search_path = '' as $$
begin new.version := old.version + 1; new.updated_at := now(); return new; end; $$;
create trigger home_date_version before update on public.home_date for each row execute function public.home_bump_version();
create trigger home_items_version before update on public.home_items for each row execute function public.home_bump_version();
create trigger home_frame_version before update on public.home_frame for each row execute function public.home_bump_version();

alter table public.home_date enable row level security;
alter table public.home_items enable row level security;
alter table public.home_photos enable row level security;
alter table public.home_frame enable row level security;
revoke all on public.home_date, public.home_items, public.home_photos, public.home_frame from anon, authenticated;
grant select, update on public.home_date to authenticated;
grant select, insert, update, delete on public.home_items to authenticated;
grant select on public.home_photos to authenticated;
grant select, update on public.home_frame to authenticated;
create policy home_date_members on public.home_date for all to authenticated using(public.is_home_member()) with check(public.is_home_member());
create policy home_items_members on public.home_items for all to authenticated using(public.is_home_member()) with check(public.is_home_member());
create policy home_photos_members on public.home_photos for select to authenticated using(public.is_home_member());
create policy home_frame_members on public.home_frame for all to authenticated using(public.is_home_member()) with check(public.is_home_member());
create index home_items_recent on public.home_items(kind, created_at desc);

create function public.register_home_photo(photo_path text, photo_title text default '') returns public.home_photos
language plpgsql security definer set search_path = '' as $$
declare result public.home_photos; begin
  if not public.is_home_member() then raise exception 'not authorized'; end if;
  perform pg_advisory_xact_lock(810082);
  if split_part(photo_path, '/', 1) <> auth.uid()::text or not exists(
    select 1 from storage.objects where bucket_id = 'home-photos' and name = photo_path
  ) then raise exception 'photo not uploaded'; end if;
  insert into public.home_photos(path,title) values(photo_path,photo_title) returning * into result;
  if (select count(*) from public.home_photos) = 1 then
    update public.home_frame set photo_id = result.id where id;
  end if;
  return result;
end; $$;
create function public.remove_home_photo(target_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare removed_path text; was_frame boolean; begin
  if not public.is_home_member() then raise exception 'not authorized'; end if;
  perform pg_advisory_xact_lock(810082);
  select photo_id = target_id into was_frame from public.home_frame where id for update;
  delete from public.home_photos where id = target_id returning path into removed_path;
  if was_frame then
    update public.home_frame set photo_id = (select id from public.home_photos order by created_at desc, id limit 1) where id;
  end if;
  return removed_path;
end; $$;
revoke all on function public.register_home_photo(text,text), public.remove_home_photo(uuid) from public, anon;
grant execute on function public.register_home_photo(text,text), public.remove_home_photo(uuid) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('home-photos','home-photos',false,8388608,array['image/jpeg']);
create policy home_photo_read on storage.objects for select to authenticated using(bucket_id = 'home-photos' and public.is_home_member());
create policy home_photo_upload on storage.objects for insert to authenticated with check(
  bucket_id = 'home-photos' and public.is_home_member() and (storage.foldername(name))[1] = auth.uid()::text
);
create policy home_photo_remove on storage.objects for delete to authenticated using(bucket_id = 'home-photos' and public.is_home_member()
  and not exists(select 1 from public.home_photos where path = storage.objects.name)
  and not exists(select 1 from public.home_items where image_path = storage.objects.name));

-- Both members can read the original diary, without duplicating it.
drop policy if exists "mood admins can read records" on public.daily_records;
create policy home_diary_read on public.daily_records for select to authenticated using(public.is_home_member());
create or replace function public.mark_daily_record_viewed(target_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.home_members where user_id = auth.uid() and profile = 'zhang') then
    raise exception 'not authorized';
  end if;
  update public.daily_records set viewed = true, viewed_at = now(), updated_at = now() where id = target_id;
  if not found then raise exception 'record not found'; end if;
end; $$;
grant all on public.home_members, public.home_date, public.home_items, public.home_photos, public.home_frame to service_role;
revoke all on function public.home_bump_version() from public, anon, authenticated;
commit;
