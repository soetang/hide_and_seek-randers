"""Build a first-pass static dataset for the web app and printable map.

This intentionally ships a provisional work area while the official 2006 Randers
municipality boundary remains unresolved in this environment.
"""

from __future__ import annotations

import csv
import io
import json
import zipfile
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import requests
from pyproj import Transformer
from shapely.geometry import LineString, MultiLineString, mapping, shape

from hide_and_seek.geometry import (
    RANDERS_CENTER,
)
from hide_and_seek.rules import (
    has_consecutive_eligible_stops,
    is_stop_eligible,
    is_time_in_window,
)


ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw"
DERIVED_DIR = ROOT / "data" / "derived"
PUBLIC_DIR = ROOT / "web" / "public" / "data"
GTFS_URL = "https://www.rejseplanen.info/labs/GTFS.zip"
GTFS_ZIP = RAW_DIR / "gtfs.zip"
SOGNE_GEOJSON = RAW_DIR / "sogne.geojson"
AFSTEMNINGSOMRAADER_GEOJSON = RAW_DIR / "afstemningsomraader.geojson"
KOMMUNER_PREREFORM = RAW_DIR / "kommuner-pre-strukturreform-geojson-wgs84.geojson"
SOGNE_URL = "https://api.dataforsyningen.dk/sogne?format=geojson"
AFSTEMNINGSOMRAADER_URL = (
    "https://api.dataforsyningen.dk/afstemningsomraader?kommunekode=0730&format=geojson"
)
NEARBY_RADIUS_METERS = 500


@dataclass
class Stop:
    stop_id: str
    name: str
    lat: float
    lon: float


WGS84_TO_ETRS89_UTM32 = Transformer.from_crs("EPSG:4326", "EPSG:25832", always_xy=True)


def ensure_dirs() -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    DERIVED_DIR.mkdir(parents=True, exist_ok=True)
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)


def download_if_missing(url: str, destination: Path) -> None:
    """Download a file only when it is not already present."""
    if destination.exists():
        return
    response = requests.get(url, timeout=120)
    response.raise_for_status()
    destination.write_bytes(response.content)


def load_csv_from_zip(archive: zipfile.ZipFile, name: str) -> list[dict[str, str]]:
    """Read a smaller CSV file from a GTFS ZIP archive."""
    with archive.open(name) as handle:
        return list(csv.DictReader(io.TextIOWrapper(handle, encoding="utf-8-sig")))


def iter_csv_from_zip(archive: zipfile.ZipFile, name: str):
    """Yield CSV rows from a GTFS ZIP archive without materializing the full file."""
    with archive.open(name) as handle:
        yield from csv.DictReader(io.TextIOWrapper(handle, encoding="utf-8-sig"))


def load_randers_boundary_feature() -> dict[str, Any]:
    """Load the pre-reform Randers boundary from a local GeoJSON file."""
    collection = json.loads(KOMMUNER_PREREFORM.read_text())
    for feature in collection.get("features", []):
        if feature.get("properties", {}).get("navn") == "Randers Kommune":
            return {
                "type": "Feature",
                "properties": {
                    "name": "Randers Kommune",
                    "note": "Prae-reform kommunegraense fra brugerleveret GeoJSON.",
                },
                "geometry": feature["geometry"],
            }
    raise RuntimeError("Randers Kommune was not found in the pre-reform GeoJSON")


def build_transit_dataset(
    boundary_feature: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    """Create route, stop, and summary datasets from GTFS."""
    boundary_shape = shape(boundary_feature["geometry"])
    route_view_shape = boundary_shape

    with zipfile.ZipFile(GTFS_ZIP) as archive:
        stops_rows = load_csv_from_zip(archive, "stops.txt")
        routes_rows = load_csv_from_zip(archive, "routes.txt")
        trips_rows = load_csv_from_zip(archive, "trips.txt")
        calendar_rows = load_csv_from_zip(archive, "calendar.txt")
        bus_route_ids = {
            row["route_id"]
            for row in routes_rows
            if row.get("route_type") in {"3", "700"}
        }
        saturday_service_ids = {
            row["service_id"] for row in calendar_rows if row.get("saturday") == "1"
        }
    relevant_trips = {
        row["trip_id"]: row
        for row in trips_rows
        if row.get("route_id") in bus_route_ids
        and row.get("service_id") in saturday_service_ids
    }
    all_route_shape_ids: dict[str, set[str]] = defaultdict(set)
    for trip in relevant_trips.values():
        if trip.get("shape_id"):
            all_route_shape_ids[trip["route_id"]].add(trip["shape_id"])

    stops = {
        row["stop_id"]: Stop(
            stop_id=row["stop_id"],
            name=row.get("stop_name", row["stop_id"]),
            lat=float(row["stop_lat"]),
            lon=float(row["stop_lon"]),
        )
        for row in stops_rows
        if row.get("location_type", "0") in {"", "0"}
    }
    area_stop_ids = {
        stop_id
        for stop_id, stop in stops.items()
        if boundary_shape.contains(
            shape({"type": "Point", "coordinates": [stop.lon, stop.lat]})
        )
    }

    stop_event_counts: Counter[str] = Counter()
    trip_area_sequences: dict[str, list[tuple[int, str]]] = defaultdict(list)

    with zipfile.ZipFile(GTFS_ZIP) as archive:
        for row in iter_csv_from_zip(archive, "stop_times.txt"):
            trip_id = row.get("trip_id")
            if trip_id not in relevant_trips:
                continue
            stop_id = row.get("stop_id")
            if stop_id not in area_stop_ids:
                continue
            if is_time_in_window(
                row.get("departure_time") or row.get("arrival_time") or ""
            ):
                stop_event_counts[stop_id] += 1
            trip_area_sequences[trip_id].append(
                (int(row.get("stop_sequence") or 0), stop_id)
            )

    area_stop_list = sorted(stop_event_counts)
    projected_stops = {
        stop_id: WGS84_TO_ETRS89_UTM32.transform(stops[stop_id].lon, stops[stop_id].lat)
        for stop_id in area_stop_list
    }
    nearby_event_counts: dict[str, int] = {}
    for stop_id in area_stop_list:
        x1, y1 = projected_stops[stop_id]
        nearby_total = 0
        for other_stop_id in area_stop_list:
            x2, y2 = projected_stops[other_stop_id]
            if (x1 - x2) ** 2 + (y1 - y2) ** 2 <= NEARBY_RADIUS_METERS**2:
                nearby_total += stop_event_counts[other_stop_id]
        nearby_event_counts[stop_id] = nearby_total

    eligible_stop_ids = {
        stop_id
        for stop_id, count in nearby_event_counts.items()
        if is_stop_eligible(count)
    }
    route_has_eligible_sequence: dict[str, bool] = defaultdict(bool)
    route_shape_ids: dict[str, set[str]] = defaultdict(set)

    for trip_id, sequence_rows in trip_area_sequences.items():
        trip = relevant_trips[trip_id]
        ordered_stop_ids = [stop_id for _, stop_id in sorted(sequence_rows)]
        route_id = trip["route_id"]
        if has_consecutive_eligible_stops(ordered_stop_ids, eligible_stop_ids):
            route_has_eligible_sequence[route_id] = True
            if trip.get("shape_id"):
                route_shape_ids[route_id].add(trip["shape_id"])

    included_route_ids = {
        route_id for route_id, ok in route_has_eligible_sequence.items() if ok
    }
    route_by_id = {row["route_id"]: row for row in routes_rows}
    selected_shape_ids = {
        shape_id
        for route_id in included_route_ids
        for shape_id in all_route_shape_ids[route_id]
    }

    shape_points: dict[str, list[tuple[int, float, float]]] = defaultdict(list)
    with zipfile.ZipFile(GTFS_ZIP) as archive:
        for row in iter_csv_from_zip(archive, "shapes.txt"):
            shape_id = row.get("shape_id")
            if not shape_id or shape_id not in selected_shape_ids:
                continue
            shape_points[shape_id].append(
                (
                    int(row.get("shape_pt_sequence") or 0),
                    float(row["shape_pt_lon"]),
                    float(row["shape_pt_lat"]),
                )
            )

    route_features = []
    for route_id in sorted(included_route_ids):
        route = route_by_id[route_id]
        route_geometries = []
        for shape_id in sorted(all_route_shape_ids[route_id]):
            if shape_id not in shape_points:
                continue
            coords = [(lon, lat) for _, lon, lat in sorted(shape_points[shape_id])]
            clipped_geometry = LineString(coords).intersection(route_view_shape)
            if clipped_geometry.is_empty:
                continue
            route_geometries.append(clipped_geometry)

        if not route_geometries:
            continue

        line_parts = []
        for route_geometry in route_geometries:
            if route_geometry.geom_type == "LineString":
                line_parts.append(list(route_geometry.coords))
            elif route_geometry.geom_type == "MultiLineString":
                line_parts.extend(list(part.coords) for part in route_geometry.geoms)

        if not line_parts:
            continue

        geometry = mapping(
            route_geometries[0] if len(line_parts) == 1 else MultiLineString(line_parts)
        )
        route_features.append(
            {
                "type": "Feature",
                "properties": {
                    "route_id": route_id,
                    "label": route.get("route_short_name")
                    or route.get("route_long_name")
                    or route_id,
                    "name": route.get("route_long_name")
                    or route.get("route_short_name")
                    or route_id,
                    "agency_id": route.get("agency_id"),
                },
                "geometry": geometry,
            }
        )

    major_stop_ids = {
        stop_id
        for stop_id, _ in sorted(
            nearby_event_counts.items(), key=lambda item: item[1], reverse=True
        )[:15]
        if stop_id in eligible_stop_ids
    }

    stop_features = []
    for stop_id in sorted(eligible_stop_ids):
        stop = stops[stop_id]
        stop_features.append(
            {
                "type": "Feature",
                "properties": {
                    "stop_id": stop_id,
                    "name": stop.name,
                    "events": stop_event_counts[stop_id],
                    "nearby_events": nearby_event_counts[stop_id],
                    "major": stop_id in major_stop_ids,
                },
                "geometry": {"type": "Point", "coordinates": [stop.lon, stop.lat]},
            }
        )

    metadata = {
        "center": {"lon": RANDERS_CENTER[0], "lat": RANDERS_CENTER[1]},
        "boundary_status": "official-pre-reform",
        "boundary_note": "Kortet bruger den brugerleverede pre-reform Randers kommunegraense.",
        "eligible_stop_count": len(stop_features),
        "included_route_count": len(route_features),
        "play_window": "09:00-18:00 normal lordag",
        "eligibility_rule": "Stop er eligible hvis stop inden for 500 meter tilsammen har mindst 18 bushaendelser i spilvinduet.",
        "nearby_radius_meters": NEARBY_RADIUS_METERS,
    }

    return (
        {"type": "FeatureCollection", "features": route_features},
        {"type": "FeatureCollection", "features": stop_features},
        metadata,
    )


def build_sogne_dataset(boundary_feature: dict[str, Any]) -> dict[str, Any]:
    """Filter public sogne GeoJSON down to the nearby area."""
    download_if_missing(SOGNE_URL, SOGNE_GEOJSON)
    all_sogne = json.loads(SOGNE_GEOJSON.read_text())
    boundary_shape = shape(boundary_feature["geometry"])
    filtered = []
    for feature in all_sogne.get("features", []):
        if shape(feature["geometry"]).intersects(boundary_shape):
            filtered.append(feature)
    return {"type": "FeatureCollection", "features": filtered}


def build_afstemningsomraader_dataset(
    boundary_feature: dict[str, Any],
) -> dict[str, Any]:
    """Filter afstemningsområder to only Randers-relevant polygons."""
    download_if_missing(AFSTEMNINGSOMRAADER_URL, AFSTEMNINGSOMRAADER_GEOJSON)
    all_areas = json.loads(AFSTEMNINGSOMRAADER_GEOJSON.read_text())
    boundary_shape = shape(boundary_feature["geometry"])
    filtered = []
    for feature in all_areas.get("features", []):
        if shape(feature["geometry"]).intersects(boundary_shape):
            filtered.append(feature)
    return {"type": "FeatureCollection", "features": filtered}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    """Write JSON with stable formatting."""
    path.write_text(json.dumps(payload, ensure_ascii=True, indent=2) + "\n")


def main() -> None:
    """Build all first-pass derived data files."""
    ensure_dirs()
    download_if_missing(GTFS_URL, GTFS_ZIP)
    boundary_feature = load_randers_boundary_feature()
    routes, stops, metadata = build_transit_dataset(boundary_feature)
    sogne = build_sogne_dataset(boundary_feature)
    afstemningsomraader = build_afstemningsomraader_dataset(boundary_feature)
    boundary = {
        "type": "FeatureCollection",
        "features": [boundary_feature],
    }

    write_json(DERIVED_DIR / "routes.geojson", routes)
    write_json(DERIVED_DIR / "eligible-stops.geojson", stops)
    write_json(DERIVED_DIR / "sogne.geojson", sogne)
    write_json(DERIVED_DIR / "afstemningsomraader.geojson", afstemningsomraader)
    write_json(DERIVED_DIR / "boundary.geojson", boundary)
    write_json(DERIVED_DIR / "metadata.json", metadata)

    write_json(PUBLIC_DIR / "routes.geojson", routes)
    write_json(PUBLIC_DIR / "eligible-stops.geojson", stops)
    write_json(PUBLIC_DIR / "sogne.geojson", sogne)
    write_json(PUBLIC_DIR / "afstemningsomraader.geojson", afstemningsomraader)
    write_json(PUBLIC_DIR / "boundary.geojson", boundary)
    write_json(PUBLIC_DIR / "metadata.json", metadata)


if __name__ == "__main__":
    main()
