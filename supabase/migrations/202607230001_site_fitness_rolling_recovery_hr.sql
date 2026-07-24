do $$
begin
    perform 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'site_fitness'
      and column_name = 'rolling_4_run_recovery_hr';
    if not found then
        alter table public.site_fitness
            add column rolling_4_run_recovery_hr double precision;
    end if;

    if to_regclass('public.site_fitness_core') is not null then
        perform 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'site_fitness_core'
          and column_name = 'rolling_4_run_recovery_hr';
        if not found then
            alter table public.site_fitness_core
                add column rolling_4_run_recovery_hr double precision;
        end if;
    end if;
end $$;
