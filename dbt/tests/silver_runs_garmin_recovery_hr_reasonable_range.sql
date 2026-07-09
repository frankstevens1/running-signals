select *
from {{ ref('silver_runs') }}
where garmin_recovery_hr is not null
    and (
        garmin_recovery_hr <= 0
        or garmin_recovery_hr > 240
    )
