-- v7: push notifications (devices + triggers that call the "notify" edge function)
create extension if not exists pg_net with schema extensions;
create table if not exists public.push_subs(endpoint text primary key, sub jsonb not null, email text not null, roles text[] not null default '{}', cid text, updated_at timestamptz default now());
alter table public.push_subs enable row level security;
revoke all on public.push_subs from anon, authenticated;
create or replace function public.save_push_sub(s jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare m record; e text := lower(auth.jwt() ->> 'email');
begin
  select * into m from public.members where email = e;
  if m is null or s ->> 'endpoint' is null then raise exception 'not allowed'; end if;
  delete from public.push_subs where endpoint = s ->> 'endpoint';
  insert into public.push_subs(endpoint, sub, email, roles, cid) values (s ->> 'endpoint', s, e, m.roles, m.cid);
end $$;
create or replace function public.drop_push_sub(ep text) returns void
language sql security definer set search_path = public as $$ delete from public.push_subs where endpoint = ep $$;
revoke all on function public.save_push_sub(jsonb) from public; grant execute on function public.save_push_sub(jsonb) to authenticated;
revoke all on function public.drop_push_sub(text) from public; grant execute on function public.drop_push_sub(text) to anon, authenticated;
create or replace function public.push_hook() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if TG_TABLE_NAME = 'kv' and NEW.key <> 'paxReq' then return NEW; end if;
  perform net.http_post(
    url := 'https://uvjcsfvrcxjxdcbnkvyo.supabase.co/functions/v1/notify',
    body := jsonb_build_object('table', TG_TABLE_NAME, 'type', TG_OP, 'old', case when TG_OP = 'UPDATE' then to_jsonb(OLD) end, 'new', to_jsonb(NEW)),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-hook-secret', '__HOOK__'));
  return NEW;
exception when others then return NEW;
end $$;
drop trigger if exists push_rides on public.rides;
create trigger push_rides after insert or update on public.rides for each row execute function public.push_hook();
drop trigger if exists push_kv on public.kv;
create trigger push_kv after insert or update on public.kv for each row execute function public.push_hook();
drop trigger if exists push_pw on public.pw_help;
create trigger push_pw after insert on public.pw_help for each row execute function public.push_hook();
