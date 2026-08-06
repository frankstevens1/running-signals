from __future__ import annotations

import pandas as pd

from ingest.garmin.transforms import filter_relevant_events


def test_filter_relevant_events_retains_complete_timer_event_sequence() -> None:
    events = pd.DataFrame(
        [
            {"event": "timer", "event_type": "start"},
            {"event": "timer", "event_type": "stop"},
            {"event": "timer", "event_type": "stop_all"},
            {"event": "recovery_hr", "event_type": "marker"},
            {"event": "lap", "event_type": "marker"},
        ]
    )

    retained = filter_relevant_events(events)

    assert retained[["event", "event_type"]].to_dict("records") == [
        {"event": "timer", "event_type": "start"},
        {"event": "timer", "event_type": "stop"},
        {"event": "timer", "event_type": "stop_all"},
        {"event": "recovery_hr", "event_type": "marker"},
    ]
