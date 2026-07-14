import json
import os
import re
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional

import boto3
import requests


LEAGUES = [
    {
        "id": "fanduel",
        "name": "FanDuel",
        "platform": "sleeper",
        "externalLeagueId": "1257088161859772416",
    },
    {
        "id": "jackson",
        "name": "Jackson",
        "platform": "sleeper",
        "externalLeagueId": "1257138560092348416",
    },
    {
        "id": "gvsu",
        "name": "GVSU",
        "platform": "espn",
        "externalLeagueId": "509557",
        "externalTeamId": os.environ.get("ESPN_TEAM_ID", ""),
    },
]

SLEEPER_API = "https://api.sleeper.app/v1"
ESPN_API = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl"


def main() -> None:
    table_name = os.environ.get("LEAGUE_TABLE_NAME", "fantasy-leagues")
    season = int(os.environ.get("NFL_SEASON", datetime.now(timezone.utc).year))
    table = boto3.resource("dynamodb").Table(table_name)

    synced = []
    for league in LEAGUES:
        profile = fetch_profile(league, season)
        table.put_item(
            Item={
                "leagueId": profile["id"],
                "updatedAt": datetime.now(timezone.utc).isoformat(),
                "providerSeason": str(profile.get("providerSeason", season)),
                "providerDraftId": profile.get("providerDraftId", ""),
                "profile": decimalize(profile),
            }
        )
        synced.append({"id": profile["id"], "name": profile["name"], "platform": profile["platform"]})

    print(json.dumps({"synced": synced}, indent=2))


def fetch_profile(config: Dict[str, Any], season: int) -> Dict[str, Any]:
    if config["platform"] == "sleeper":
        return fetch_sleeper_profile(config)
    if config["platform"] == "espn":
        return fetch_espn_profile(config, season)
    raise ValueError(f"Unsupported platform: {config['platform']}")


def fetch_sleeper_profile(config: Dict[str, Any]) -> Dict[str, Any]:
    league = get_json(f"{SLEEPER_API}/league/{config['externalLeagueId']}")
    scoring_settings = league.get("scoring_settings", {})
    lineup = sleeper_lineup(league)
    scoring = sleeper_scoring(scoring_settings)
    preset = scoring_preset(scoring["reception"])

    return {
        "id": config["id"],
        "name": config["name"],
        "platform": "sleeper",
        "externalLeagueId": config["externalLeagueId"],
        "scoringPreset": preset,
        "rankingPreset": ranking_preset(preset),
        "lineup": lineup,
        "scoring": scoring,
        "providerName": league.get("name"),
        "providerSeason": league.get("season"),
        "providerDraftId": league.get("draft_id"),
    }


def fetch_espn_profile(config: Dict[str, Any], season: int) -> Dict[str, Any]:
    swid = os.environ.get("ESPN_SWID")
    espn_s2 = os.environ.get("ESPN_S2")
    if not swid or not espn_s2:
        raise RuntimeError("ESPN_SWID and ESPN_S2 are required to sync ESPN league settings")

    url = f"{ESPN_API}/seasons/{season}/segments/0/leagues/{config['externalLeagueId']}"
    league = get_json(
        url,
        params={"view": ["mSettings", "mTeam"]},
        cookies={"SWID": swid, "espn_s2": espn_s2},
    )
    settings = league.get("settings", {})
    scoring_settings = settings.get("scoringSettings", {})
    roster_settings = settings.get("rosterSettings", {})
    scoring = espn_scoring(scoring_settings)
    preset = scoring_preset(scoring["reception"])
    team_count = settings.get("size") or len(league.get("teams", [])) or 10

    return {
        "id": config["id"],
        "name": config["name"],
        "platform": "espn",
        "externalLeagueId": config["externalLeagueId"],
        "externalTeamId": config.get("externalTeamId", ""),
        "scoringPreset": preset,
        "rankingPreset": ranking_preset(preset),
        "lineup": espn_lineup(roster_settings, team_count),
        "scoring": scoring,
        "providerName": settings.get("name") or league.get("name"),
        "providerSeason": season,
    }


def sleeper_lineup(league: Dict[str, Any]) -> Dict[str, int]:
    positions = league.get("roster_positions", [])
    lineup = {
        "teams": int(league.get("total_rosters") or league.get("settings", {}).get("num_teams") or 12),
        "rosterSpots": len(positions),
        "qb": count_positions(positions, "QB"),
        "rb": count_positions(positions, "RB"),
        "wr": count_positions(positions, "WR"),
        "te": count_positions(positions, "TE"),
        "flex": count_positions(positions, "FLEX", "WRRB_FLEX", "REC_FLEX"),
        "superflex": count_positions(positions, "SUPER_FLEX", "OP"),
        "k": count_positions(positions, "K"),
        "dst": count_positions(positions, "DEF", "DST"),
        "bench": count_positions(positions, "BN"),
    }
    return lineup


def espn_lineup(roster_settings: Dict[str, Any], team_count: int) -> Dict[str, int]:
    slots = roster_settings.get("lineupSlotCounts", {})
    lineup = {
        "teams": int(team_count),
        "rosterSpots": sum_int_values(slots) or 16,
        "qb": int(slots.get("0", slots.get(0, 1)) or 0),
        "rb": int(slots.get("2", slots.get(2, 2)) or 0),
        "wr": int(slots.get("4", slots.get(4, 2)) or 0),
        "te": int(slots.get("6", slots.get(6, 1)) or 0),
        "flex": int(slots.get("23", slots.get(23, 1)) or 0),
        "superflex": int(slots.get("7", slots.get(7, 0)) or 0),
        "k": int(slots.get("17", slots.get(17, 1)) or 0),
        "dst": int(slots.get("16", slots.get(16, 1)) or 0),
        "bench": int(slots.get("20", slots.get(20, 7)) or 0),
    }
    return lineup


def sleeper_scoring(settings: Dict[str, Any]) -> Dict[str, float]:
    return {
        "passingYardsPerPoint": yards_per_point(settings.get("pass_yd"), 25),
        "passingTd": float(settings.get("pass_td", 4)),
        "interception": float(settings.get("pass_int", -2)),
        "rushingYardsPerPoint": yards_per_point(settings.get("rush_yd"), 10),
        "receivingYardsPerPoint": yards_per_point(settings.get("rec_yd"), 10),
        "rushReceiveTd": float(max(settings.get("rush_td", 6), settings.get("rec_td", 6))),
        "reception": float(settings.get("rec", 0)),
        "fumbleLost": float(settings.get("fum_lost", -2)),
        "fieldGoal": float(settings.get("fgm_30_39", settings.get("fgm", 3))),
        "extraPoint": float(settings.get("xpm", 1)),
        "dstSack": float(settings.get("sack", 1)),
        "dstInterception": float(settings.get("int", 2)),
        "dstFumbleRecovery": float(settings.get("fum_rec", settings.get("def_st_fum_rec", 2))),
        "dstTouchdown": float(settings.get("def_td", settings.get("def_st_td", 6))),
        "dstSafety": float(settings.get("safe", 2)),
    }


def espn_scoring(scoring_settings: Dict[str, Any]) -> Dict[str, float]:
    items = scoring_settings.get("scoringItems", [])
    points = {normalize_espn_stat(item.get("statId")): float(item.get("points", 0)) for item in items}
    return {
        "passingYardsPerPoint": yards_per_point(points.get("passingYards"), 25),
        "passingTd": points.get("passingTd", 4),
        "interception": points.get("interception", -2),
        "rushingYardsPerPoint": yards_per_point(points.get("rushingYards"), 10),
        "receivingYardsPerPoint": yards_per_point(points.get("receivingYards"), 10),
        "rushReceiveTd": max(points.get("rushingTd", 6), points.get("receivingTd", 6)),
        "reception": points.get("reception", 0),
        "fumbleLost": points.get("fumbleLost", -2),
        "fieldGoal": points.get("fieldGoalMade", 3),
        "extraPoint": points.get("extraPointMade", 1),
        "dstSack": points.get("dstSack", 1),
        "dstInterception": points.get("dstInterception", 2),
        "dstFumbleRecovery": points.get("dstFumbleRecovery", 2),
        "dstTouchdown": points.get("dstTouchdown", 6),
        "dstSafety": points.get("dstSafety", 2),
    }


def normalize_espn_stat(stat_id: Any) -> str:
    stat_map = {
        3: "passingYards",
        4: "passingTd",
        19: "interception",
        24: "rushingYards",
        25: "rushingTd",
        42: "receivingYards",
        43: "receivingTd",
        53: "reception",
        72: "fumbleLost",
        74: "fieldGoalMade",
        80: "extraPointMade",
        89: "dstSack",
        90: "dstInterception",
        91: "dstFumbleRecovery",
        93: "dstTouchdown",
        95: "dstSafety",
    }
    return stat_map.get(int(stat_id), f"stat_{stat_id}") if stat_id is not None else "unknown"


def get_json(url: str, **kwargs: Any) -> Dict[str, Any]:
    response = requests.get(url, timeout=30, **kwargs)
    response.raise_for_status()
    return response.json()


def count_positions(positions: List[str], *wanted: str) -> int:
    wanted_set = {position.upper() for position in wanted}
    return sum(1 for position in positions if str(position).upper() in wanted_set)


def sum_int_values(value: Dict[Any, Any]) -> int:
    return sum(int(item or 0) for item in value.values())


def yards_per_point(multiplier: Optional[float], default: int) -> float:
    value = float(multiplier or 0)
    return round(1 / value, 2) if value else float(default)


def scoring_preset(reception: float) -> str:
    if reception == 0:
        return "standard"
    if reception == 0.5:
        return "halfPpr"
    if reception == 1:
        return "ppr"
    return "custom"


def ranking_preset(preset: str) -> str:
    return preset if preset in {"standard", "halfPpr", "ppr"} else "halfPpr"


def decimalize(value: Any) -> Any:
    return json.loads(json.dumps(value), parse_float=Decimal)


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


if __name__ == "__main__":
    main()
