{% macro ensure_route_city_names_country_iso3() %}
    {% set catalog = env_var('DATABRICKS_CATALOG') %}
    {% set schema = env_var('DATABRICKS_GOLD_SCHEMA') %}
    {% set table = '`' ~ catalog ~ '`.`' ~ schema ~ '`.`route_city_names`' %}

    {% if execute %}
        {% do run_query(
            'create table if not exists ' ~ table ~
            ' (route_id string not null, city_name string, country_name string, country_code string, country_iso3 string, route_start_latitude_deg double, route_start_longitude_deg double) using delta'
        ) %}
        {% set existing_column = run_query(
            'select 1 from `' ~ catalog ~ '`.information_schema.columns' ~
            " where table_schema = '" ~ schema ~ "'" ~
            " and table_name = 'route_city_names'" ~
            " and column_name = 'country_iso3' limit 1"
        ) %}
        {% if existing_column.rows | length == 0 %}
            {% do run_query('alter table ' ~ table ~ ' add column country_iso3 string') %}
        {% endif %}
    {% endif %}

    {{ return('select 1') }}
{% endmacro %}
