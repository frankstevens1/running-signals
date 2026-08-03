do $$
begin
    if not exists (select 1 from pg_roles where rolname = 'sqlearn_reader') then
        create role sqlearn_reader nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
    end if;
end;
$$;

create schema if not exists sqlearn authorization postgres;

create or replace view sqlearn.site_runs with (security_barrier = true) as select * from public.site_runs;
create or replace view sqlearn.site_days with (security_barrier = true) as select * from public.site_days;
create or replace view sqlearn.site_weeks with (security_barrier = true) as select * from public.site_weeks;
create or replace view sqlearn.site_routes with (security_barrier = true) as select * from public.site_routes;
create or replace view sqlearn.site_fitness with (security_barrier = true) as select * from public.site_fitness;
create or replace view sqlearn.site_route_segments with (security_barrier = true) as select * from public.site_route_segments;

revoke all on schema sqlearn from public;
revoke all on all tables in schema public from sqlearn_reader;
revoke all on all sequences in schema public from sqlearn_reader;
revoke all on all functions in schema public from sqlearn_reader;
revoke all on all tables in schema sqlearn from public;

grant connect on database postgres to sqlearn_reader;
grant usage on schema sqlearn to sqlearn_reader;
grant select on all tables in schema sqlearn to sqlearn_reader;

alter role sqlearn_reader set default_transaction_read_only = on;
alter role sqlearn_reader set statement_timeout = '3000ms';
alter role sqlearn_reader set idle_in_transaction_session_timeout = '5000ms';
alter role sqlearn_reader set search_path = sqlearn, pg_catalog;
