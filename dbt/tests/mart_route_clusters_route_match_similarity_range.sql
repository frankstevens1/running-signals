select *
from {{ ref('mart_route_clusters') }}
where route_match_similarity < 0
    or route_match_similarity > 1
