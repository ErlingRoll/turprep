create extension if not exists btree_gist;

alter table public.housing_stays
  add constraint housing_stays_planned_date_overlap_excl
  exclude using gist (
    trip_id with =,
    daterange(check_in, check_out, '[)') with &&
  )
  where (
    is_backup = false
    and check_in is not null
    and check_out is not null
  );
