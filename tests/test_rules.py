from hide_and_seek.rules import (
    has_consecutive_eligible_stops,
    is_stop_eligible,
    is_time_in_window,
)


def test_time_window_accepts_game_hours() -> None:
    assert is_time_in_window("09:00:00")
    assert is_time_in_window("17:59:59")
    assert not is_time_in_window("08:59:59")
    assert not is_time_in_window("18:00:00")


def test_stop_eligibility_uses_total_threshold() -> None:
    assert is_stop_eligible(50)
    assert is_stop_eligible(51)
    assert not is_stop_eligible(49)
    assert not is_stop_eligible(30)


def test_route_needs_consecutive_eligible_stops() -> None:
    assert has_consecutive_eligible_stops(["a", "b", "c"], {"b", "c"})
    assert not has_consecutive_eligible_stops(["a", "b", "c"], {"a", "c"})
