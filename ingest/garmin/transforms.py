import pandas as pd


def select_fields(df: pd.DataFrame, fields: list[str]) -> pd.DataFrame:
    columns = [column for column in fields if column in df.columns]
    return df[columns].copy()


def semicircles_to_degrees(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series, errors="coerce") * (180.0 / 2**31)


def add_degree_coordinates(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    coordinate_columns = [
        "start_position_lat",
        "start_position_long",
        "end_position_lat",
        "end_position_long",
        "position_lat",
        "position_long",
    ]

    for column in coordinate_columns:
        if column in df.columns:
            df[f"{column}_deg"] = semicircles_to_degrees(df[column])

    return df


def filter_relevant_events(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df

    if "event" not in df.columns and "event_type" not in df.columns:
        return df.iloc[0:0].copy()

    event = df["event"] if "event" in df.columns else pd.Series([None] * len(df))
    event_type = df["event_type"] if "event_type" in df.columns else pd.Series([None] * len(df))

    mask = (
        event.eq("recovery_hr")
        | (event.eq("timer") & event_type.isin(["start", "stop_all"]))
    )

    return df[mask].copy()
