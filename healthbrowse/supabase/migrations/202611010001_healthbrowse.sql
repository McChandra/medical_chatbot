-- Apply once using Supabase migrations. auth.users is the identity store.
begin;
create schema if not exists hb_private;
revoke all on schema hb_private from public, anon, authenticated;

create table public.hb_topics (
  topic text primary key check (char_length(topic) between 1 and 160),
  curated boolean not null default false
);
create table public.hb_diseases (
  id text primary key, topic text not null references public.hb_topics(topic),
  aliases jsonb not null default '[]', specialties jsonb not null default '[]',
  check(jsonb_typeof(aliases)='array' and jsonb_typeof(specialties)='array')
);
-- All symptom, treatment and medicine observations remain tied to a source.
-- An imported source entry does not certify a clinical claim.
create table public.hb_evidence (
  record_key text primary key, topic text not null references public.hb_topics(topic),
  kind text not null check(kind in ('definition','identification','symptom','treatment','medicine','research','genetics','dataset','education','facility','resource')),
  title text not null, content text, publisher text, source_url text not null,
  source_date date, provenance jsonb not null default '{}',
  review_status text not null default 'unreviewed' check(review_status in ('unreviewed','reviewed','withdrawn')),
  check(source_url ~ '^https?://')
);
create index hb_evidence_topic on public.hb_evidence(topic,kind);
-- Historical pointers only: no licensed drug monograph text is redistributed.
create table public.hb_medicines (
  record text primary key, name text not null, publisher_url text not null,
  archive_url text not null, corpus_version text not null,
  verified_at timestamptz, check(publisher_url ~ '^https?://')
);
create table public.hb_topic_medicines (
  topic text not null references public.hb_topics(topic),
  medicine_record text not null references public.hb_medicines(record),
  evidence_key text not null references public.hb_evidence(record_key),
  reviewed_at timestamptz not null, primary key(topic,medicine_record,evidence_key)
);
create table public.hb_institutions (
  id uuid primary key default gen_random_uuid(), name text not null check(char_length(name) between 1 and 250),
  registry_url text, verified_at timestamptz
);
create table public.hb_memberships (
  institution_id uuid not null references public.hb_institutions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check(role in ('member','researcher','administrator')),
  primary key(institution_id,user_id)
);
create table public.hb_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  save_history boolean not null default false,
  reading_mode text not null default 'General reader' check(reading_mode in ('General reader','Patient','Medical student','Medical professional','Advanced professional')),
  theme text not null default 'system' check(theme in ('system','light','dark'))
);
create table public.hb_saved (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  topic text not null references public.hb_topics(topic),
  kind text not null check(kind in ('bookmark','favourite')),
  title text not null check(char_length(title) between 1 and 300),
  url text not null default '' check(char_length(url)<=2048 and (url='' or url ~ '^https://')),
  created_at timestamptz not null default now(), unique(user_id,topic,kind,url)
);
create table public.hb_history (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  topic text not null references public.hb_topics(topic), kind text not null check(kind in ('search','chat')),
  section smallint not null check(section between 1 and 7), created_at timestamptz not null default now()
);
create index hb_history_user_time on public.hb_history(user_id,created_at desc);
create table public.hb_feedback (
  id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade,
  message text not null check(char_length(message) between 1 and 3000),
  feedback_type text not null check(feedback_type in ('bug','source-correction','feature','usability','general')),
  sentiment text not null check(sentiment in ('positive','negative','mixed','neutral')),
  review_status text not null default 'pending' check(review_status in ('pending','investigating','confirmed','not-substantiated','resolved')),
  created_at timestamptz not null default now()
);
create index hb_feedback_user_time on public.hb_feedback(user_id,created_at desc);
create table hb_private.hb_contact_receipts (
  user_id uuid not null references auth.users(id) on delete cascade, request_id uuid not null,
  payload_digest text not null check(payload_digest ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(), sent_at timestamptz, provider_id text,
  primary key(user_id,request_id)
);
create index hb_contact_user_time on hb_private.hb_contact_receipts(user_id,created_at desc);

do $$
declare t text;
begin
  foreach t in array array['hb_topics','hb_diseases','hb_evidence','hb_medicines','hb_topic_medicines','hb_institutions','hb_memberships','hb_settings','hb_saved','hb_history','hb_feedback'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
end $$;
alter table hb_private.hb_contact_receipts enable row level security;
revoke all on table hb_private.hb_contact_receipts from public, anon, authenticated;
grant select on public.hb_topics,public.hb_diseases,public.hb_evidence,public.hb_medicines,public.hb_topic_medicines to anon,authenticated;
create policy read_medicines on public.hb_medicines for select to anon,authenticated using(true);
create policy read_topic_medicines on public.hb_topic_medicines for select to anon,authenticated
  using(exists(select 1 from public.hb_evidence e where e.record_key=evidence_key and e.topic=hb_topic_medicines.topic and e.review_status='reviewed'));
create policy read_topics on public.hb_topics for select to anon,authenticated using(true);
create policy read_diseases on public.hb_diseases for select to anon,authenticated using(true);
create policy read_evidence on public.hb_evidence for select to anon,authenticated using(review_status<>'withdrawn');
grant select on public.hb_memberships,public.hb_institutions,public.hb_settings,public.hb_saved,public.hb_history to authenticated;
create policy own_memberships on public.hb_memberships for select to authenticated using(user_id=(select auth.uid()));
create policy own_institution on public.hb_institutions for select to authenticated using(exists(select 1 from public.hb_memberships m where m.institution_id=id and m.user_id=(select auth.uid())));
create policy own_settings on public.hb_settings for select to authenticated using(user_id=(select auth.uid()));
create policy own_saved on public.hb_saved for select to authenticated using(user_id=(select auth.uid()));
create policy own_history on public.hb_history for select to authenticated using(user_id=(select auth.uid()));
grant insert(topic,kind,title,url),delete on public.hb_saved to authenticated;
create policy save_own on public.hb_saved for insert to authenticated with check(user_id=(select auth.uid()));
create policy remove_own on public.hb_saved for delete to authenticated using(user_id=(select auth.uid()));
grant delete on public.hb_history to authenticated;
create policy remove_history on public.hb_history for delete to authenticated using(user_id=(select auth.uid()));

-- Explicitly privileged routines never accept a caller-supplied owner ID, except
-- delivery completion which is callable only by the backend's service role.
create function public.hb_update_settings(p_history boolean default null,p_mode text default null,p_theme text default null)
returns setof public.hb_settings language plpgsql security definer set search_path=pg_catalog as $$
declare u uuid:=auth.uid();
begin
  if u is null then raise insufficient_privilege; end if;
  perform pg_advisory_xact_lock(hashtextextended('hb-history-'||u::text,0));
  insert into public.hb_settings(user_id,save_history,reading_mode,theme)
  values(u,coalesce(p_history,false),coalesce(p_mode,'General reader'),coalesce(p_theme,'system'))
  on conflict(user_id) do update set save_history=coalesce(p_history,hb_settings.save_history),
      reading_mode=coalesce(p_mode,hb_settings.reading_mode),theme=coalesce(p_theme,hb_settings.theme);
  if p_history=false then delete from public.hb_history where user_id=u; end if;
  return query select * from public.hb_settings where user_id=u;
end $$;
create function public.hb_record_history(p_topic text,p_kind text,p_section smallint)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare u uuid:=auth.uid();
begin
  if u is null then raise insufficient_privilege; end if;
  perform pg_advisory_xact_lock(hashtextextended('hb-history-'||u::text,0));
  if not exists(select 1 from public.hb_settings where user_id=u and save_history) then return false; end if;
  insert into public.hb_history(user_id,topic,kind,section) values(u,p_topic,p_kind,p_section);
  delete from public.hb_history where id in (select id from public.hb_history where user_id=u order by created_at desc,id desc offset 100);
  return true;
end $$;
create function public.hb_submit_feedback(p_message text,p_type text,p_sentiment text)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare u uuid:=auth.uid(); ident uuid;
begin
  if u is null then raise insufficient_privilege; end if;
  perform pg_advisory_xact_lock(hashtextextended('hb-feedback-'||u::text,0));
  if (select count(*) from public.hb_feedback where user_id=u and created_at>now()-interval '1 hour')>=5
    then raise sqlstate 'P0001' using message='rate_limited'; end if;
  insert into public.hb_feedback(user_id,message,feedback_type,sentiment)
  values(u,p_message,p_type,p_sentiment) returning id into ident;
  return ident;
end $$;
create function public.hb_reserve_contact(p_request uuid,p_digest text)
returns text language plpgsql security definer set search_path=pg_catalog as $$
declare u uuid:=auth.uid(); prior hb_private.hb_contact_receipts%rowtype;
begin
  if u is null then raise insufficient_privilege; end if;
  perform pg_advisory_xact_lock(hashtextextended('hb-contact-'||u::text,0));
  select * into prior from hb_private.hb_contact_receipts where user_id=u and request_id=p_request;
  if found then
    if prior.payload_digest<>p_digest then return 'conflict'; end if;
    if prior.sent_at is not null then return 'sent'; end if;
    -- Provider idempotency expires at 24 h. Leave margin for retries in flight.
    if prior.created_at<now()-interval '23 hours' then return 'expired'; end if;
    return 'pending';
  end if;
  if (select count(*) from hb_private.hb_contact_receipts where user_id=u and created_at>now()-interval '1 hour')>=3 then return 'limited'; end if;
  insert into hb_private.hb_contact_receipts(user_id,request_id,payload_digest) values(u,p_request,p_digest);
  return 'pending';
end $$;
create function public.hb_complete_contact(p_user uuid,p_request uuid,p_digest text,p_provider text)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
begin
  update hb_private.hb_contact_receipts set sent_at=coalesce(sent_at,now()),provider_id=p_provider
  where user_id=p_user and request_id=p_request and payload_digest=p_digest;
  return found;
end $$;
create function public.hb_prune_retention()
returns void language plpgsql security definer set search_path=pg_catalog as $$
begin
  delete from public.hb_history where created_at < now()-interval '30 days';
  delete from public.hb_feedback where created_at < now()-interval '90 days';
  -- Receipts contain only opaque IDs and a digest. Keep an idempotency tombstone:
  -- do not recycle an ambiguous provider request into another email.
end $$;
revoke all on function public.hb_update_settings(boolean,text,text),public.hb_record_history(text,text,smallint),
  public.hb_submit_feedback(text,text,text),public.hb_reserve_contact(uuid,text),
  public.hb_complete_contact(uuid,uuid,text,text),public.hb_prune_retention() from public,anon,authenticated;
grant execute on function public.hb_update_settings(boolean,text,text),public.hb_record_history(text,text,smallint),
  public.hb_submit_feedback(text,text,text),public.hb_reserve_contact(uuid,text) to authenticated;
grant execute on function public.hb_complete_contact(uuid,uuid,text,text),public.hb_prune_retention() to service_role;
commit;
