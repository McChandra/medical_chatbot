-- Run only against a throwaway migrated/seeded Supabase database using its owner.
-- No identity, receipt or history is retained. Any assertion aborts the test.
begin;
insert into auth.users(id) values
('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$ begin
 if public.hb_record_history('Leukemia','search',1::smallint) then raise exception 'History captured without consent';end if;
end $$;
select * from public.hb_update_settings(true,null,'dark');
select public.hb_record_history('Leukemia','chat',3::smallint);
insert into public.hb_saved(topic,title,kind) values('Leukemia','Leukemia','bookmark');
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $$ begin
 if exists(select from public.hb_history) or exists(select from public.hb_saved) or exists(select from public.hb_settings)
 then raise exception 'Cross-account records visible';end if;
 if has_function_privilege('authenticated','public.hb_complete_contact(uuid,uuid,text,text)','execute')
 then raise exception 'Authenticated client can forge delivery receipts';end if;
 if has_table_privilege('authenticated','public.hb_feedback','update')
 then raise exception 'Authenticated client can adjudicate feedback';end if;
end $$;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select * from public.hb_update_settings(false,null,null);
do $$ begin
 if exists(select from public.hb_history) then raise exception 'History remained after opt-out';end if;
 if not exists(select from public.hb_saved) then raise exception 'Owner bookmark missing';end if;
end $$;
rollback;
