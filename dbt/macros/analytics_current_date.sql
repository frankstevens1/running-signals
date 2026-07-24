{% macro analytics_current_date() -%}
cast(
    from_utc_timestamp(
        current_timestamp(),
        '{{ var("analytics_time_zone", "Europe/Amsterdam") }}'
    )
    as date
)
{%- endmacro %}
