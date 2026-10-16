-- מי פנוי? · מבנה המאגר וההרשאות (להריץ פעם אחת ב-Supabase: SQL Editor ← New query ← Run)

create table if not exists public.members (
  email text primary key,
  name  text,
  roles text[] not null default '{}',
  cid   text
);
create table if not exists public.kv (
  key text primary key,
  v jsonb,
  updated_at timestamptz not null default now()
);
create table if not exists public.rides (
  id text primary key,
  data jsonb not null,
  cids text[] not null default '{}',
  updated_at timestamptz not null default now()
);
create table if not exists public.people (
  id text primary key,
  cid text,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- who is the signed-in user (by email in the login token)
create or replace function public.my_roles() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce((select roles from public.members where email = lower(auth.jwt() ->> 'email')), '{}'::text[])
$$;
create or replace function public.my_cid() returns text
language sql stable security definer set search_path = public as $$
  select cid from public.members where email = lower(auth.jwt() ->> 'email')
$$;
create or replace function public.is_member() returns boolean
language sql stable as $$ select cardinality(public.my_roles()) > 0 $$;
create or replace function public.has_role(r text) returns boolean
language sql stable as $$ select r = any(public.my_roles()) $$;
create or replace function public.is_staff() returns boolean
language sql stable as $$ select public.my_roles() && array['admin','disp','princess','ceo'] $$;

alter table public.members enable row level security;
alter table public.kv      enable row level security;
alter table public.rides   enable row level security;
alter table public.people  enable row level security;

-- members: everyone sees their own row; only the manager manages the list
drop policy if exists m_sel on public.members;
create policy m_sel on public.members for select to authenticated using (email = lower(auth.jwt() ->> 'email') or public.has_role('admin'));
drop policy if exists m_all on public.members;
create policy m_all on public.members for all to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));

-- kv (settings, calendar, requests): every member reads; protected keys only by the manager (and the dispatcher for cities/prices)
drop policy if exists kv_sel on public.kv;
create policy kv_sel on public.kv for select to authenticated using (public.is_member());
drop policy if exists kv_ins on public.kv;
create policy kv_ins on public.kv for insert to authenticated with check (
  public.has_role('admin')
  or (key in ('destinations','north','prices','mins','lines','dismissed') and public.has_role('disp'))
  or (key = 'nightDeleg' and public.has_role('ceo'))
  or (key not in ('clients','dayOverride','freeDays','restricted','blocked','ownWins','genFlights','destinations','north','prices','mins','nightDeleg') and public.is_member())
);
drop policy if exists kv_upd on public.kv;
create policy kv_upd on public.kv for update to authenticated using (public.is_member()) with check (
  public.has_role('admin')
  or (key in ('destinations','north','prices','mins','lines','dismissed') and public.has_role('disp'))
  or (key = 'nightDeleg' and public.has_role('ceo'))
  or (key not in ('clients','dayOverride','freeDays','restricted','blocked','ownWins','genFlights','destinations','north','prices','mins','nightDeleg') and public.is_member())
);
drop policy if exists kv_del on public.kv;
create policy kv_del on public.kv for delete to authenticated using (public.has_role('admin'));

-- rides: every member reads (needed for shared taxis); writing only rides of your own ops, staff writes all
drop policy if exists r_sel on public.rides;
create policy r_sel on public.rides for select to authenticated using (public.is_member());
drop policy if exists r_ins on public.rides;
create policy r_ins on public.rides for insert to authenticated with check (public.is_staff() or cids && array[public.my_cid()]);
drop policy if exists r_upd on public.rides;
create policy r_upd on public.rides for update to authenticated using (public.is_staff() or cids && array[public.my_cid()]) with check (public.is_staff() or cids && array[public.my_cid()]);
drop policy if exists r_del on public.rides;
create policy r_del on public.rides for delete to authenticated using (public.has_role('admin'));

-- passengers: every member reads; only the manager and the dispatcher change them
drop policy if exists p_sel on public.people;
create policy p_sel on public.people for select to authenticated using (public.is_member());
drop policy if exists p_wr on public.people;
create policy p_wr on public.people for all to authenticated using (public.has_role('admin') or public.has_role('disp')) with check (public.has_role('admin') or public.has_role('disp'));

-- live updates
do $$ begin
  begin alter publication supabase_realtime add table public.kv; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.rides; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.people; exception when duplicate_object then null; end;
end $$;

-- the first manager
insert into public.members(email, name, roles) values ('noampatishi@gmail.com', 'המנהלת', array['admin','ceo'])
on conflict (email) do update set roles = excluded.roles;

-- גרסה 2: כניסה עם סיסמה לכל תפקיד
alter table public.members add column if not exists pw text;
create or replace function public.login_options() returns table(id text, name text)
language sql stable security definer set search_path = public as $$
  select c->>'id', c->>'name' from public.kv, jsonb_array_elements(v) c where key = 'clients'
$$;
grant execute on function public.login_options() to anon, authenticated;

-- גרסה 3: הסרת נוסע ע"י המבצעים בלי אישור
create or replace function public.remove_person(pid text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.people set data = data || '{"removed": true}'::jsonb, updated_at = now()
  where id = pid and (cid = public.my_cid() or public.is_staff());
  if not found then raise exception 'not allowed'; end if;
end $$;
revoke execute on function public.remove_person(text) from anon;
grant execute on function public.remove_person(text) to authenticated;
-- v4: princess = manager without CEO (and without role passwords)
create or replace function public.is_mgr() returns boolean
language sql stable as $$ select public.my_roles() && array['admin','princess'] $$;
drop policy if exists kv_ins on public.kv;
create policy kv_ins on public.kv for insert to authenticated with check (
  public.has_role('admin')
  or (public.has_role('princess') and key <> 'nightDeleg')
  or (key in ('destinations','north','prices','mins','lines','dismissed') and public.has_role('disp'))
  or (key = 'nightDeleg' and public.has_role('ceo'))
  or (key not in ('clients','dayOverride','freeDays','restricted','blocked','ownWins','genFlights','destinations','north','prices','mins','nightDeleg') and public.is_member())
);
drop policy if exists kv_upd on public.kv;
create policy kv_upd on public.kv for update to authenticated using (public.is_member()) with check (
  public.has_role('admin')
  or (public.has_role('princess') and key <> 'nightDeleg')
  or (key in ('destinations','north','prices','mins','lines','dismissed') and public.has_role('disp'))
  or (key = 'nightDeleg' and public.has_role('ceo'))
  or (key not in ('clients','dayOverride','freeDays','restricted','blocked','ownWins','genFlights','destinations','north','prices','mins','nightDeleg') and public.is_member())
);
drop policy if exists kv_del on public.kv;
create policy kv_del on public.kv for delete to authenticated using (public.is_mgr());
drop policy if exists r_del on public.rides;
create policy r_del on public.rides for delete to authenticated using (public.is_mgr());
drop policy if exists p_wr on public.people;
create policy p_wr on public.people for all to authenticated using (public.is_mgr() or public.has_role('disp')) with check (public.is_mgr() or public.has_role('disp'));
-- v5: short calendar links for passengers
create table if not exists public.links(k text primary key, data jsonb not null, created_at timestamptz default now());
alter table public.links enable row level security;
drop policy if exists l_wr on public.links;
create policy l_wr on public.links for all to authenticated using (public.is_member()) with check (public.is_member());
create or replace function public.get_link(k text) returns jsonb
language sql stable security definer set search_path = public as $$ select data from public.links where links.k = get_link.k $$;
revoke all on public.links from anon;
grant execute on function public.get_link(text) to anon, authenticated;
