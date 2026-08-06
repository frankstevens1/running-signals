export type AerobicDecouplingLevel = "low" | "moderate" | "high";

export function aerobicDecouplingLevel(value: number): AerobicDecouplingLevel {
  if (value <= 0.05) return "low";
  if (value <= 0.1) return "moderate";
  return "high";
}

export function aerobicDecouplingLabel(value: number): string {
  switch (aerobicDecouplingLevel(value)) {
    case "low": return "Low decoupling";
    case "moderate": return "Moderate decoupling";
    case "high": return "High decoupling";
  }
}

export function aerobicDecouplingCallout(value: number): string {
  if (value < -0.01) return "Second-half efficiency higher";
  if (value <= 0.01) return "Stable across both halves";
  if (value <= 0.05) return "Small second-half drop";
  if (value <= 0.1) return "Moderate second-half drop";
  return "Large second-half drop";
}

export function aerobicDecouplingUnavailableReason(reason: string | null): string {
  switch (reason) {
    case "missing_moving_telemetry": return "The run did not contain enough moving telemetry.";
    case "missing_timer_telemetry": return "The run did not contain timer-aligned telemetry.";
    case "insufficient_moving_duration": return "Less than 20 minutes of moving time.";
    case "invalid_timer_events": return "FIT timer events could not be reconciled with the session timer.";
    case "incomplete_timer_telemetry": return "Record telemetry did not cover the FIT timer-running windows.";
    case "insufficient_timer_running_duration": return "Less than 20 minutes of timer-running time.";
    case "insufficient_moving_distance": return "Less than 5 km of moving distance.";
    case "insufficient_timer_running_distance": return "Less than 5 km of timer-running distance.";
    case "insufficient_valid_segments": return "Fewer than 8 valid 250 m segments.";
    case "insufficient_hr_coverage": return "Heart-rate coverage was below the required threshold.";
    case "excessive_hr_gap": return "A timer-running heart-rate gap exceeded 30 seconds.";
    case "missing_half_heart_rate": return "One half of the run lacked usable heart-rate data.";
    case "invalid_half_speed": return "One half of the run lacked usable moving-speed data.";
    default: return "No eligible aerobic-decoupling reading is available.";
  }
}
