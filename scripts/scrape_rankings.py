import argparse
import csv
import io
import json
import os
import re
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

import boto3
import requests
from bs4 import BeautifulSoup, Tag


SCORING_URLS = {
    "standard": "https://www.fantasypros.com/nfl/rankings/consensus-cheatsheets.php",
    "halfPpr": "https://www.fantasypros.com/nfl/rankings/half-point-ppr-cheatsheets.php",
    "ppr": "https://www.fantasypros.com/nfl/rankings/ppr-cheatsheets.php",
}

DATASET_KEYS = {
    "rankings": "data/rankings.json",
    "projections": "data/projections.json",
    "depth-charts": "data/depth-charts.json",
    "injuries": "data/injuries.json",
    "rookies": "data/rookies.json",
    "previous-year-results": "data/previous-year-results.json",
    "previous-year-weekly-results": "data/previous-year-weekly-results.json",
    "schedules": "data/schedules.json",
    "combined": "data/fantasy-data.json",
}

PROJECTION_URLS = {
    "QB": "https://www.fantasypros.com/nfl/projections/qb.php?week=draft",
    "RB": "https://www.fantasypros.com/nfl/projections/rb.php?week=draft",
    "WR": "https://www.fantasypros.com/nfl/projections/wr.php?week=draft",
    "TE": "https://www.fantasypros.com/nfl/projections/te.php?week=draft",
    "K": "https://www.fantasypros.com/nfl/projections/k.php?week=draft",
    "DST": "https://www.fantasypros.com/nfl/projections/dst.php?week=draft",
}

CBS_PROJECTION_URLS = {
    "QB": "https://www.cbssports.com/fantasy/football/stats/QB/{year}/season/projections/ppr/",
    "RB": "https://www.cbssports.com/fantasy/football/stats/RB/{year}/season/projections/ppr/",
    "WR": "https://www.cbssports.com/fantasy/football/stats/WR/{year}/season/projections/ppr/",
    "TE": "https://www.cbssports.com/fantasy/football/stats/TE/{year}/season/projections/ppr/",
    "K": "https://www.cbssports.com/fantasy/football/stats/K/{year}/season/projections/ppr/",
    "DST": "https://www.cbssports.com/fantasy/football/stats/DST/{year}/season/projections/ppr/",
}

STAT_URLS = {
    "QB": "https://www.fantasypros.com/nfl/stats/qb.php?year={year}",
    "RB": "https://www.fantasypros.com/nfl/stats/rb.php?year={year}",
    "WR": "https://www.fantasypros.com/nfl/stats/wr.php?year={year}",
    "TE": "https://www.fantasypros.com/nfl/stats/te.php?year={year}",
    "K": "https://www.fantasypros.com/nfl/stats/k.php?year={year}",
    "DST": "https://www.fantasypros.com/nfl/stats/dst.php?year={year}",
}

WEEKLY_STAT_URLS = {
    position: f"{url_template}&range=week&week={{week}}"
    for position, url_template in STAT_URLS.items()
}

STAT_KEYS = {
    "QB": [
        "rank",
        "player",
        "passing_cmp",
        "passing_att",
        "passing_pct",
        "passing_yds",
        "passing_ypa",
        "passing_td",
        "passing_int",
        "sacks",
        "rushing_att",
        "rushing_yds",
        "rushing_td",
        "fumbles_lost",
        "games",
        "fpts",
        "fpts_per_game",
        "rostered",
    ],
    "RB": [
        "rank",
        "player",
        "rushing_att",
        "rushing_yds",
        "rushing_ypa",
        "rushing_long",
        "rushing_20_plus",
        "rushing_td",
        "receiving_tgt",
        "receiving_rec",
        "receiving_yds",
        "receiving_ypr",
        "receiving_td",
        "fumbles_lost",
        "games",
        "fpts",
        "fpts_per_game",
        "rostered",
    ],
    "WR": [
        "rank",
        "player",
        "receiving_tgt",
        "receiving_tgt_share",
        "receiving_rec",
        "receiving_yds",
        "receiving_ypr",
        "receiving_20_plus",
        "receiving_td",
        "rushing_att",
        "rushing_yds",
        "rushing_td",
        "fumbles_lost",
        "games",
        "fpts",
        "fpts_per_game",
        "rostered",
    ],
    "TE": [
        "rank",
        "player",
        "receiving_tgt",
        "receiving_tgt_share",
        "receiving_rec",
        "receiving_yds",
        "receiving_ypr",
        "receiving_20_plus",
        "receiving_td",
        "rushing_att",
        "rushing_yds",
        "rushing_td",
        "fumbles_lost",
        "games",
        "fpts",
        "fpts_per_game",
        "rostered",
    ],
    "K": [
        "rank",
        "player",
        "fg",
        "fga",
        "fg_pct",
        "fg_long",
        "fg_1_19",
        "fg_20_29",
        "fg_30_39",
        "fg_40_49",
        "fg_50_plus",
        "xpt",
        "xpa",
        "games",
        "fpts",
        "fpts_per_game",
        "rostered",
    ],
    "DST": [
        "rank",
        "player",
        "sack",
        "int",
        "fr",
        "ff",
        "td",
        "safety",
        "special_teams_td",
        "games",
        "fpts",
        "fpts_per_game",
        "rostered",
    ],
}

DEPTH_CHART_URLS = {
    "QB": "https://www.cbssports.com/fantasy/football/depth-chart/QB/",
    "RB": "https://www.cbssports.com/fantasy/football/depth-chart/RB/",
    "WR": "https://www.cbssports.com/fantasy/football/depth-chart/WR/",
    "TE": "https://www.cbssports.com/fantasy/football/depth-chart/TE/",
    "K": "https://www.cbssports.com/fantasy/football/depth-chart/K/",
}

DEPTH_LIMITS = {"QB": 3, "RB": 5, "WR": 6, "TE": 4, "K": 2}

SLEEPER_PLAYERS_URL = "https://api.sleeper.app/v1/players/nfl"
NFL_SCHEDULES_URL = "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv"
CBS_INJURIES_URL = "https://www.cbssports.com/nfl/injuries/"
FOX_WIN_TOTALS_URL = "https://www.foxsports.com/stories/nfl/2026-nfl-win-totals-over-unders-all-32-squads"
PFR_DRAFT_URL = "https://www.pro-football-reference.com/years/{year}/draft.htm"
WIKIPEDIA_DRAFT_URL = "https://en.wikipedia.org/wiki/{year}_NFL_draft"

NFL_TEAM_NAMES = {
    "ARI": "Arizona Cardinals",
    "ATL": "Atlanta Falcons",
    "BAL": "Baltimore Ravens",
    "BUF": "Buffalo Bills",
    "CAR": "Carolina Panthers",
    "CHI": "Chicago Bears",
    "CIN": "Cincinnati Bengals",
    "CLE": "Cleveland Browns",
    "DAL": "Dallas Cowboys",
    "DEN": "Denver Broncos",
    "DET": "Detroit Lions",
    "GB": "Green Bay Packers",
    "HOU": "Houston Texans",
    "IND": "Indianapolis Colts",
    "JAX": "Jacksonville Jaguars",
    "KC": "Kansas City Chiefs",
    "LV": "Las Vegas Raiders",
    "LAC": "Los Angeles Chargers",
    "LAR": "Los Angeles Rams",
    "MIA": "Miami Dolphins",
    "MIN": "Minnesota Vikings",
    "NE": "New England Patriots",
    "NO": "New Orleans Saints",
    "NYG": "New York Giants",
    "NYJ": "New York Jets",
    "PHI": "Philadelphia Eagles",
    "PIT": "Pittsburgh Steelers",
    "SF": "San Francisco 49ers",
    "SEA": "Seattle Seahawks",
    "TB": "Tampa Bay Buccaneers",
    "TEN": "Tennessee Titans",
    "WAS": "Washington Commanders",
}

INDOOR_STADIUMS = {
    "allegiant stadium",
    "at&t stadium",
    "caesars superdome",
    "ford field",
    "lucas oil stadium",
    "mercedes-benz stadium",
    "mercedes-benz superdome",
    "nrg stadium",
    "reliant stadium",
    "sofi stadium",
    "state farm stadium",
    "u.s. bank stadium",
}

PROJECTION_KEYS = {
    "QB": [
        "passing_att",
        "passing_cmp",
        "passing_yds",
        "passing_tds",
        "passing_ints",
        "rushing_att",
        "rushing_yds",
        "rushing_tds",
        "fumbles_lost",
        "fpts",
    ],
    "RB": [
        "rushing_att",
        "rushing_yds",
        "rushing_tds",
        "receiving_rec",
        "receiving_yds",
        "receiving_tds",
        "fumbles_lost",
        "fpts",
    ],
    "WR": [
        "receiving_rec",
        "receiving_yds",
        "receiving_tds",
        "rushing_att",
        "rushing_yds",
        "rushing_tds",
        "fumbles_lost",
        "fpts",
    ],
    "TE": [
        "receiving_rec",
        "receiving_yds",
        "receiving_tds",
        "fumbles_lost",
        "fpts",
    ],
    "K": [
        "fg",
        "fga",
        "xpt",
        "fpts",
    ],
    "DST": [
        "sack",
        "int",
        "fr",
        "ff",
        "td",
        "safety",
        "pa",
        "yds_agn",
        "fpts",
    ],
}

HEADERS = {
    "User-Agent": "fantasy-draft-wizard/0.1 (+https://github.com/corypahl/fantasy-draft)",
    "Accept": "text/html,application/xhtml+xml",
}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--dataset",
        choices=[*DATASET_KEYS.keys(), "all"],
        default=os.environ.get("SCRAPE_DATASET", "combined"),
        help="Logical data pull to scrape. Use 'all' to generate every split file locally.",
    )
    parser.add_argument("--bucket", default=os.environ.get("RANKINGS_BUCKET"))
    parser.add_argument("--key", default=os.environ.get("RANKINGS_KEY"))
    parser.add_argument("--output")
    parser.add_argument("--season", type=int, default=int(os.environ.get("NFL_SEASON", datetime.now(timezone.utc).year)))
    args = parser.parse_args()

    datasets = [dataset for dataset in DATASET_KEYS if dataset != "combined"] if args.dataset == "all" else [args.dataset]
    for dataset in datasets:
        output = args.output or f"dist-data/{dataset}.json"
        key = args.key or DATASET_KEYS[dataset]
        payload = build_dataset_payload(dataset, args.season)
        write_payload(payload, output)
        if args.bucket:
            upload_payload(output, args.bucket, key)


def build_dataset_payload(dataset: str, season: int) -> Dict:
    generated_at = datetime.now(timezone.utc).isoformat()
    if dataset == "rankings":
        return {
            "generatedAt": generated_at,
            "season": season,
            "source": "FantasyPros rankings",
            "scoring": {scoring: fetch_rankings(url) for scoring, url in SCORING_URLS.items()},
        }
    if dataset == "projections":
        return {
            "generatedAt": generated_at,
            "season": season,
            "source": "FantasyPros projections with CBS Sports fallback",
            "projections": fetch_projections(season),
        }
    if dataset == "depth-charts":
        return {
            "generatedAt": generated_at,
            "season": season,
            "source": "Sleeper depth charts with CBS Sports fallback, FOX Sports win totals",
            "depthCharts": fetch_depth_charts(fetch_sleeper_players()),
            "teamWinTotals": fetch_projected_win_totals(),
        }
    if dataset == "injuries":
        return {
            "generatedAt": generated_at,
            "season": season,
            "source": "Sleeper detailed injuries with CBS Sports fallback",
            "injuries": fetch_injuries(fetch_sleeper_players()),
        }
    if dataset == "rookies":
        return {
            "generatedAt": generated_at,
            "season": season,
            "source": "Wikipedia rookie draft results",
            "rookies": fetch_rookies(season),
        }
    if dataset == "previous-year-results":
        return {
            "generatedAt": generated_at,
            "season": season,
            "source": "FantasyPros previous-year results",
            "previousSeason": season - 1,
            "previousYearResults": fetch_previous_year_results(season - 1),
        }
    if dataset == "previous-year-weekly-results":
        return {
            "generatedAt": generated_at,
            "season": season,
            "source": "FantasyPros previous-year weekly results",
            "previousSeason": season - 1,
            "previousYearWeeklyResults": fetch_previous_year_weekly_results(season - 1),
        }
    if dataset == "schedules":
        return {
            "generatedAt": generated_at,
            "season": season,
            "source": "nflverse schedule data",
            "schedules": fetch_schedule_data(season),
        }
    if dataset == "combined":
        return build_combined_payload(season)
    raise ValueError(f"Unsupported dataset: {dataset}")


def build_combined_payload(season: int) -> Dict:
    projections = fetch_projections(season)
    sleeper_players = fetch_sleeper_players()
    depth_charts = fetch_depth_charts(sleeper_players)
    injuries = fetch_injuries(sleeper_players)
    rookies = fetch_rookies(season)
    previous_year_results = fetch_previous_year_results(season - 1)
    previous_year_weekly_results = fetch_previous_year_weekly_results(season - 1)
    schedules = fetch_schedule_data(season)
    enrichments = build_player_enrichments(depth_charts, injuries, rookies, previous_year_results, sleeper_players)
    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "season": season,
        "source": "FantasyPros rankings/projections/stats, Sleeper injuries/depth charts/player metadata, Wikipedia rookie draft results",
        "metadata": {
            "previousSeason": season - 1,
            "sources": {
                "rankings": "FantasyPros",
                "projections": "FantasyPros with CBS Sports fallback",
                "previousYearResults": "FantasyPros",
                "previousYearWeeklyResults": "FantasyPros",
                "schedules": "nflverse",
                "depthCharts": "Sleeper with CBS Sports fallback",
                "teamWinTotals": "FOX Sports / DraftKings",
                "injuries": "Sleeper with CBS Sports fallback",
                "rookies": "Wikipedia",
            },
        },
        "scoring": {
            scoring: enrich_players(fetch_rankings(url), projections, enrichments)
            for scoring, url in SCORING_URLS.items()
        },
        "depthCharts": depth_charts,
        "teamWinTotals": fetch_projected_win_totals(),
        "injuries": injuries,
        "rookies": rookies,
        "previousYearResults": previous_year_results,
        "previousYearWeeklyResults": previous_year_weekly_results,
        "schedules": schedules,
    }


def write_payload(payload: Dict, output: str) -> None:
    os.makedirs(os.path.dirname(output), exist_ok=True)
    with open(output, "w", encoding="utf-8") as output_file:
        json.dump(payload, output_file, indent=2)


def upload_payload(output: str, bucket: str, key: str) -> None:
    boto3.client("s3").upload_file(
        output,
        bucket,
        key,
        ExtraArgs={
            "CacheControl": "public, max-age=300",
            "ContentType": "application/json",
        },
    )


def fetch_rankings(url: str) -> List[Dict]:
    html = fetch_html(url)
    embedded = extract_ecr_data(html)
    if embedded:
        return [
            {
                "id": slugify(f"{player['player_name']}-{player.get('player_team_id', 'FA')}-{normalize_position(player['player_position_id'])}"),
                "name": player["player_name"],
                "team": normalize_team(player.get("player_team_id") or "FA"),
                "position": normalize_position(player["player_position_id"]),
                "rank": int(player["rank_ecr"]),
                "posRank": player.get("pos_rank"),
                "bye": parse_int(player.get("player_bye_week")),
                "tier": parse_int(player.get("tier")) or max(1, ((int(player["rank_ecr"]) - 1) // 12) + 1),
                "adp": parse_float(player.get("rank_ave")),
            }
            for player in embedded.get("players", [])
            if player.get("player_name") and player.get("rank_ecr") and player.get("player_position_id")
        ]

    soup = BeautifulSoup(html, "html.parser")
    table = soup.select_one("table")
    if not table:
        raise RuntimeError(f"No rankings table found at {url}")

    players = []
    for row in table.select("tbody tr"):
        text_cells = [cell.get_text(" ", strip=True) for cell in row.select("td")]
        if len(text_cells) < 2:
            continue

        rank = parse_int(text_cells[0])
        player_cell = text_cells[1]
        if not rank or not player_cell:
            continue

        player = parse_player_cell(player_cell)
        if not player:
            continue

        players.append(
            {
                "id": slugify(f"{player['name']}-{player['team']}-{player['position']}"),
                "name": player["name"],
                "team": player["team"],
                "position": player["position"],
                "rank": rank,
                "posRank": player.get("posRank"),
                "bye": parse_int(find_cell(text_cells, "bye")),
                "tier": max(1, ((rank - 1) // 12) + 1),
                "adp": parse_float(find_cell(text_cells, "adp")),
            }
        )
    return players


def fetch_projections(season: int) -> Dict[str, Dict]:
    projections = {}
    for position, url in PROJECTION_URLS.items():
        soup = fetch_soup(url)
        table = soup.select_one("table")
        if not table:
            continue
        for row in table.select("tbody tr"):
            cells = [cell.get_text(" ", strip=True) for cell in row.select("td")]
            if not cells:
                continue
            player = parse_player_cell(cells[0], fallback_position=position)
            if not player:
                continue
            projection = {}
            keys = PROJECTION_KEYS.get(position, [])
            for index, value in enumerate(cells[1:], start=1):
                key = keys[index - 1] if index - 1 < len(keys) else f"stat_{index}"
                projection[key] = parse_float(value)
            points = projection.get("fpts") or projection.get("fantasy-points")
            projection_detail = {
                "points": points,
                "projections": projection,
            }
            projections[player_key(player["name"])] = projection_detail
            projections[player_key(player["name"], player["team"])] = projection_detail
    projections.update({key: value for key, value in fetch_cbs_projections(season).items() if key not in projections})
    return projections


def fetch_cbs_projections(season: int) -> Dict[str, Dict]:
    projections = {}
    for position, url_template in CBS_PROJECTION_URLS.items():
        try:
            url = url_template.format(year=season)
            soup = fetch_soup(url)
        except requests.RequestException:
            continue
        for row in soup.select("tbody tr"):
            player = parse_cbs_player_cell(row, position)
            if not player:
                continue
            projection = parse_cbs_projection_row(row, position)
            points = projection.get("fpts")
            projection_detail = {
                "points": points,
                "projections": projection,
            }
            projections[player_key(player["name"])] = projection_detail
            projections[player_key(player["name"], player["team"])] = projection_detail
    return projections


def parse_cbs_player_cell(row: Tag, position: str) -> Optional[Dict]:
    player_cell = row.select_one("td")
    if not player_cell:
        return None
    long_name = player_cell.select_one(".CellPlayerName--long a")
    name = clean_player_name(long_name.get_text(strip=True) if long_name else player_cell.get_text(" ", strip=True))
    team_node = player_cell.select_one(".CellPlayerName--long .CellPlayerName-team")
    team = normalize_team(team_node.get_text(strip=True) if team_node else "")
    if position == "DST":
        name = f"{name} DST"
        team = nfl_team_to_abbr(name.replace(" DST", ""))
    if not name:
        return None
    return {"name": name, "team": team or "FA", "position": position}


def parse_cbs_projection_row(row: Tag, position: str) -> Dict[str, Optional[float]]:
    values = [parse_float(cell.get_text(" ", strip=True)) for cell in row.select("td")[1:]]
    if position == "QB":
        return pick_projection_values(
            values,
            {
                "games": 0,
                "passing_att": 1,
                "passing_cmp": 2,
                "passing_yds": 3,
                "passing_tds": 5,
                "passing_ints": 6,
                "rushing_att": 8,
                "rushing_yds": 9,
                "rushing_tds": 11,
                "fumbles_lost": 12,
                "fpts": 13,
                "fppg": 14,
            },
        )
    if position == "RB":
        return pick_projection_values(
            values,
            {
                "games": 0,
                "rushing_att": 1,
                "rushing_yds": 2,
                "rushing_tds": 4,
                "receiving_tgt": 5,
                "receiving_rec": 6,
                "receiving_yds": 7,
                "receiving_tds": 10,
                "fumbles_lost": 11,
                "fpts": 12,
                "fppg": 13,
            },
        )
    if position == "WR":
        return pick_projection_values(
            values,
            {
                "games": 0,
                "receiving_tgt": 1,
                "receiving_rec": 2,
                "receiving_yds": 3,
                "receiving_tds": 6,
                "rushing_att": 7,
                "rushing_yds": 8,
                "rushing_tds": 10,
                "fumbles_lost": 11,
                "fpts": 12,
                "fppg": 13,
            },
        )
    if position == "TE":
        return pick_projection_values(
            values,
            {
                "games": 0,
                "receiving_tgt": 1,
                "receiving_rec": 2,
                "receiving_yds": 3,
                "receiving_tds": 6,
                "fumbles_lost": 7,
                "fpts": 8,
                "fppg": 9,
            },
        )
    if position == "K":
        return pick_projection_values(values, {"games": 0, "fg": 1, "fga": 2, "xpt": 15, "fpts": 17, "fppg": 18})
    return pick_projection_values(
        values,
        {
            "int": 0,
            "safety": 1,
            "sack": 2,
            "fr": 4,
            "ff": 5,
            "td": 6,
            "pa": 7,
            "yds_agn": 12,
            "fpts": 14,
            "fppg": 15,
        },
    )


def pick_projection_values(values: List[Optional[float]], keys: Dict[str, int]) -> Dict[str, Optional[float]]:
    return {key: values[index] for key, index in keys.items() if index < len(values)}


def fetch_sleeper_players() -> Dict[str, Dict]:
    try:
        response = requests.get(SLEEPER_PLAYERS_URL, headers=HEADERS, timeout=45)
        response.raise_for_status()
        return response.json()
    except requests.RequestException:
        return {}


def fetch_depth_charts(sleeper_players: Dict[str, Dict]) -> Dict[str, Dict[str, List[Dict]]]:
    charts: Dict[str, Dict[str, List[Dict]]] = {}
    for player in sleeper_players.values():
        position = player.get("position")
        team = normalize_team(player.get("team") or "")
        order = parse_int(player.get("depth_chart_order"))
        name = player.get("full_name")
        if position not in DEPTH_LIMITS or not team or not order or not name:
            continue
        if order > DEPTH_LIMITS[position] or player.get("active") is False:
            continue
        charts.setdefault(team, {}).setdefault(position, []).append(
            {
                "name": clean_player_name(name),
                "team": team,
                "position": position,
                "role": player.get("depth_chart_position") or position,
                "order": order,
                "source": "Sleeper",
            }
        )

    for positions in charts.values():
        for values in positions.values():
            values.sort(key=lambda item: (item["order"], item.get("role") or "", item["name"]))
    if charts:
        return charts

    for position, url in DEPTH_CHART_URLS.items():
        try:
            soup = fetch_soup(url)
        except requests.RequestException:
            continue
        for table in soup.select("table.TableBase-table"):
            for row in table.select("tr.TableBase-bodyTr"):
                team_link = row.select_one("span.TeamName a")
                if not team_link:
                    continue
                team = normalize_team(team_link.get_text(strip=True))
                players = [clean_player_name(node.get_text(strip=True)) for node in row.select("span.CellPlayerName--long a")]
                selected = [name for name in players if name][: DEPTH_LIMITS.get(position, len(players))]
                if not selected:
                    continue
                charts.setdefault(team, {}).setdefault(position, [])
                charts[team][position] = [
                    {
                        "name": name,
                        "team": team,
                        "position": position,
                        "order": index + 1,
                        "source": "CBS Sports",
                    }
                    for index, name in enumerate(selected)
                ]

    for positions in charts.values():
        for values in positions.values():
            values.sort(key=lambda item: (item["order"], item["name"]))
    return charts


def fetch_injuries(sleeper_players: Optional[Dict[str, Dict]] = None) -> List[Dict]:
    players = sleeper_players if sleeper_players is not None else fetch_sleeper_players()
    injuries = []
    for player in players.values():
        position = player.get("position")
        name = player.get("full_name")
        status = player.get("injury_status")
        body_part = player.get("injury_body_part")
        notes = player.get("injury_notes")
        practice = player.get("practice_description") or player.get("practice_participation")
        if position not in {"QB", "RB", "WR", "TE", "K"} or not name:
            continue
        if not any((status, body_part, notes, practice)):
            continue
        updated = format_sleeper_timestamp(player.get("news_updated"))
        injuries.append(
            {
                "name": clean_player_name(name),
                "team": normalize_team(player.get("team") or ""),
                "position": position,
                "updated": updated,
                "injury": body_part or "Undisclosed",
                "status": status or "Injury reported",
                "detail": notes or "",
                "practice": practice or "",
                "started": player.get("injury_start_date") or "",
                "rosterStatus": player.get("status") or "",
                "source": "Sleeper",
            }
        )
    if injuries:
        return sorted(injuries, key=lambda item: item.get("updated") or "", reverse=True)

    return fetch_cbs_injuries()


def fetch_cbs_injuries() -> List[Dict]:
    injuries = []
    try:
        soup = fetch_soup(CBS_INJURIES_URL)
        for table in soup.select("table.TableBase-table"):
            table_base = table.find_parent("div", class_="TableBase")
            team_title = table_base.select_one(".TableBase-title") if isinstance(table_base, Tag) else None
            team = nfl_team_to_abbr(team_title.get_text(" ", strip=True) if team_title else "")
            for row in table.select("tr"):
                name_tag = row.select_one("span.CellPlayerName--long")
                cells = row.select("td.TableBase-bodyTd")
                if not name_tag or len(cells) < 5:
                    continue
                position = cells[1].get_text(strip=True)
                if position not in {"QB", "RB", "WR", "TE", "K"}:
                    continue
                name = clean_player_name(name_tag.get_text(strip=True))
                injuries.append(
                    {
                        "name": name,
                        "team": team,
                        "position": position,
                        "updated": cells[2].get_text(strip=True),
                        "injury": cells[3].get_text(strip=True),
                        "status": cells[4].get_text(strip=True),
                        "source": "CBS Sports",
                    }
                )
    except requests.RequestException:
        pass
    return injuries


def format_sleeper_timestamp(value) -> str:
    timestamp = parse_float(value)
    if not timestamp:
        return ""
    if timestamp > 100_000_000_000:
        timestamp /= 1000
    try:
        return datetime.fromtimestamp(timestamp, tz=timezone.utc).isoformat()
    except (OverflowError, OSError, ValueError):
        return ""


def fetch_projected_win_totals() -> Dict[str, Dict]:
    try:
        soup = fetch_soup(FOX_WIN_TOTALS_URL)
    except requests.RequestException:
        return {}

    text = soup.get_text("\n", strip=True)
    totals = {}
    for team, full_name in NFL_TEAM_NAMES.items():
        over_match = re.search(rf"{re.escape(full_name)}\s+Over\s+(\d+(?:\.\d+)?):\s+([+-]\d+)", text)
        section = text[over_match.start() : over_match.start() + 300] if over_match else ""
        under_match = re.search(r"Under\s+(\d+(?:\.\d+)?):\s+([+-]\d+)", section)
        if not over_match:
            continue
        totals[team] = {
            "wins": parse_float(over_match.group(1)),
            "overOdds": over_match.group(2),
            "underOdds": under_match.group(2) if under_match else "",
            "source": "FOX Sports / DraftKings",
        }
    return totals


def fetch_rookies(season: int) -> List[Dict]:
    rookies = []
    seen = set()
    draft_year = season
    draft_results = fetch_wikipedia_rookies(draft_year)
    if not draft_results:
        draft_year = season - 1
        draft_results = fetch_wikipedia_rookies(draft_year)

    for rookie in draft_results:
        key = slugify(rookie["name"])
        if key in seen:
            continue
        seen.add(key)
        rookies.append(rookie)

    return sorted(rookies, key=lambda item: (item.get("draftRound") or 99, item.get("draftPick") or 9999, item["name"]))[:300]


def fetch_pfr_rookies(year: int) -> List[Dict]:
    rookies = []
    try:
        soup = fetch_soup(PFR_DRAFT_URL.format(year=year))
    except requests.RequestException:
        return rookies
    table = soup.find("table", id="drafts")
    if not table:
        return rookies
    for row in table.select("tbody tr"):
        name = get_stat_cell(row, "player")
        position = get_stat_cell(row, "pos")
        if not name or position not in {"QB", "RB", "WR", "TE"}:
            continue
        rookies.append(
            {
                "name": clean_player_name(name),
                "position": position,
                "team": normalize_team(get_stat_cell(row, "team")),
                "college": get_stat_cell(row, "college_id"),
                "draftRound": parse_int(get_stat_cell(row, "draft_round")),
                "draftPick": parse_int(get_stat_cell(row, "draft_pick")),
                "rookieYear": year,
                "source": "Pro Football Reference",
            }
        )
    return rookies


def fetch_wikipedia_rookies(year: int) -> List[Dict]:
    rookies = []
    try:
        soup = fetch_soup(WIKIPEDIA_DRAFT_URL.format(year=year))
    except requests.RequestException:
        return rookies
    for table in soup.select("table.wikitable"):
        headers = [header.get_text(" ", strip=True).lower() for header in table.select("tr th")]
        if "rnd." not in headers or "pick" not in headers or "player" not in headers:
            continue
        for row in table.select("tr"):
            cells = [cell.get_text(" ", strip=True) for cell in row.select("td, th")]
            if len(cells) < 7:
                continue
            offset = 1 if not parse_int(cells[0]) and len(cells) >= 8 else 0
            draft_round = parse_int(cells[offset])
            draft_pick = parse_int(cells[offset + 1])
            team = cells[offset + 2]
            name = clean_player_name(cells[offset + 3])
            position = cells[offset + 4].upper()
            college = cells[offset + 5]
            if not name or position not in {"QB", "RB", "WR", "TE"}:
                continue
            rookies.append(
                {
                    "name": name,
                    "position": position,
                    "team": nfl_team_to_abbr(team),
                    "college": college,
                    "draftRound": draft_round,
                    "draftPick": draft_pick,
                    "rookieYear": year,
                    "source": "Wikipedia",
                }
            )
        if rookies:
            return rookies
    return rookies


def fetch_previous_year_results(previous_year: int) -> Dict[str, List[Dict]]:
    results = {}
    for position, url_template in STAT_URLS.items():
        url = url_template.format(year=previous_year)
        try:
            soup = fetch_soup(url)
        except requests.RequestException:
            results[position] = []
            continue
        table = soup.select_one("table")
        rows = []
        keys = STAT_KEYS[position]
        if table:
            for row in table.select("tbody tr"):
                cells = [cell.get_text(" ", strip=True) for cell in row.select("td, th")]
                if len(cells) < 3:
                    continue
                item = parse_stat_row(position, keys, cells)
                if item:
                    rows.append(item)
        results[position] = rows
    return results


def fetch_previous_year_weekly_results(previous_year: int) -> Dict[str, List[Dict]]:
    results = {}
    for position, url_template in WEEKLY_STAT_URLS.items():
        rows = []
        keys = STAT_KEYS[position]
        for week in range(1, 19):
            url = url_template.format(year=previous_year, week=week)
            try:
                soup = fetch_soup(url)
            except requests.RequestException:
                continue
            table = soup.select_one("table")
            if not table:
                continue
            for row in table.select("tbody tr"):
                cells = [cell.get_text(" ", strip=True) for cell in row.select("td, th")]
                if len(cells) < 3:
                    continue
                item = parse_stat_row(position, keys, cells)
                if not item:
                    continue
                item["week"] = week
                rows.append(item)
        results[position] = rows
    return results


def fetch_schedule_data(season: int) -> Dict:
    response = requests.get(NFL_SCHEDULES_URL, headers=HEADERS, timeout=30)
    response.raise_for_status()
    schedules = {
        "currentSeason": season,
        "previousSeason": season - 1,
        "current": {team: [] for team in NFL_TEAM_NAMES},
        "previous": {team: [] for team in NFL_TEAM_NAMES},
    }
    for row in csv.DictReader(io.StringIO(response.text)):
        row_season = parse_int(row.get("season"))
        if row_season not in {season, season - 1} or row.get("game_type") != "REG":
            continue
        week = parse_int(row.get("week"))
        away_team = normalize_team(row.get("away_team") or "")
        home_team = normalize_team(row.get("home_team") or "")
        if not week or away_team not in NFL_TEAM_NAMES or home_team not in NFL_TEAM_NAMES:
            continue
        stadium = (row.get("stadium") or "").strip()
        indoor = stadium.lower() in INDOOR_STADIUMS
        schedule_key = "current" if row_season == season else "previous"
        common = {
            "week": week,
            "stadium": stadium,
            "roof": (row.get("roof") or "").strip().lower(),
            "indoor": indoor,
        }
        schedules[schedule_key][away_team].append({**common, "opponent": home_team, "home": False})
        schedules[schedule_key][home_team].append({**common, "opponent": away_team, "home": True})

    for schedule_key in ("current", "previous"):
        for games in schedules[schedule_key].values():
            games.sort(key=lambda game: game["week"])
    return schedules


def parse_stat_row(position: str, keys: List[str], cells: List[str]) -> Optional[Dict]:
    values = {key: cells[index] if index < len(cells) else "" for index, key in enumerate(keys)}
    player = parse_player_cell(values.get("player", ""), fallback_position=position)
    if not player:
        return None
    item = {
        "id": slugify(f"{player['name']}-{player['team']}-{position}"),
        "name": player["name"],
        "team": player["team"],
        "position": position,
    }
    for key, value in values.items():
        if key in {"player"}:
            continue
        if key == "rank":
            item[key] = parse_int(value)
        elif key == "rostered":
            item[key] = parse_float(value)
        else:
            item[key] = parse_float(value)
    return item


def build_player_enrichments(
    depth_charts: Dict[str, Dict[str, List[Dict]]],
    injuries: List[Dict],
    rookies: List[Dict],
    previous_year_results: Dict[str, List[Dict]],
    sleeper_players: Dict[str, Dict],
) -> Dict[str, Dict]:
    enrichments: Dict[str, Dict] = {}

    for team, positions in depth_charts.items():
        for values in positions.values():
            for entry in values:
                merge_enrichment(enrichments, entry["name"], team, {"depthChart": entry})

    for injury in injuries:
        merge_enrichment(enrichments, injury["name"], injury.get("team", ""), {"injury": injury})

    for rookie in rookies:
        merge_enrichment(enrichments, rookie["name"], rookie.get("team", ""), {"rookie": rookie})

    for rows in previous_year_results.values():
        for result in rows:
            merge_enrichment(enrichments, result["name"], result.get("team", ""), {"previousYear": result})

    for player in sleeper_players.values():
        name = player.get("full_name")
        position = player.get("position")
        if not name or position not in {"QB", "RB", "WR", "TE", "K"}:
            continue
        merge_enrichment(
            enrichments,
            name,
            normalize_team(player.get("team") or ""),
            {
                "sleeper": {
                    "playerId": player.get("player_id"),
                    "status": player.get("status"),
                    "age": player.get("age"),
                    "yearsExp": player.get("years_exp"),
                    "college": player.get("college"),
                }
            },
        )

    return enrichments


def merge_enrichment(enrichments: Dict[str, Dict], name: str, team: str, patch: Dict) -> None:
    for key in enrichment_keys(name, team):
        enrichments.setdefault(key, {}).update(patch)


def enrichment_keys(name: str, team: str) -> Tuple[str, str]:
    clean_team = normalize_team(team or "")
    return (player_key(name), player_key(name, clean_team) if clean_team else player_key(name))


def enrich_players(players: List[Dict], projections: Dict[str, Dict], enrichments: Dict[str, Dict]) -> List[Dict]:
    for player in players:
        projection = projections.get(player_key(player["name"], player.get("team", ""))) or projections.get(player_key(player["name"]))
        if projection:
            player["points"] = projection.get("points")
            player["projections"] = projection.get("projections", {})
        enrichment = enrichments.get(player_key(player["name"], player["team"])) or enrichments.get(player_key(player["name"]))
        if enrichment:
            player.update(enrichment)
    return players


def fetch_soup(url: str) -> BeautifulSoup:
    return BeautifulSoup(fetch_html(url), "html.parser")


def fetch_html(url: str) -> str:
    response = requests.get(url, headers=HEADERS, timeout=30)
    response.raise_for_status()
    return response.text


def get_stat_cell(row: Tag, stat: str) -> str:
    cell = row.find(["td", "th"], {"data-stat": stat})
    return cell.get_text(" ", strip=True) if cell else ""


def extract_ecr_data(html: str) -> Optional[Dict]:
    match = re.search(r"ecrData\s*=\s*(\{.*?\});", html, re.S)
    if not match:
        return None
    return json.loads(match.group(1))


def parse_player_cell(value: str, fallback_position: Optional[str] = None) -> Optional[Dict]:
    cleaned = re.sub(r"\s+", " ", value).strip()
    pos_rank = re.search(r"\b(QB|RB|WR|TE|K|DST|DEF)\d+\b", cleaned)
    position = normalize_position(pos_rank.group(0)[:3].rstrip("0123456789")) if pos_rank else fallback_position
    team = None
    team_match = None
    team_matches = re.findall(r"\b([A-Z]{2,3})\b", cleaned)
    if team_matches:
        team_match = team_matches[-1]
        team = normalize_team(team_match)

    name = cleaned
    if pos_rank:
        name = name.replace(pos_rank.group(0), "")
    if team_match:
        name = re.sub(rf"\b{team_match}\b", "", name)
    name = clean_player_name(name)

    if not name or not position:
        return None
    return {
        "name": name,
        "team": team or "FA",
        "position": normalize_position(position),
        "posRank": pos_rank.group(0).replace("DEF", "DST") if pos_rank else None,
    }


def find_cell(cells: List[str], wanted: str) -> Optional[str]:
    for cell in cells:
        if wanted.lower() in cell.lower():
            return cell
    return None


def normalize_position(position: str) -> str:
    return "DST" if position == "DEF" else position


def normalize_team(team: str) -> str:
    team = team.upper()
    aliases = {
        "JAC": "JAX",
        "LA": "LAR",
        "WSH": "WAS",
        "TXSO": "WAS",
    }
    return aliases.get(team, team)


def nfl_team_to_abbr(team: str) -> str:
    mapping = {
        "ARIZONA": "ARI",
        "ARIZONA CARDINALS": "ARI",
        "ATLANTA": "ATL",
        "ATLANTA FALCONS": "ATL",
        "BALTIMORE": "BAL",
        "BALTIMORE RAVENS": "BAL",
        "BUFFALO": "BUF",
        "BUFFALO BILLS": "BUF",
        "CAROLINA": "CAR",
        "CAROLINA PANTHERS": "CAR",
        "CHICAGO": "CHI",
        "CHICAGO BEARS": "CHI",
        "CINCINNATI": "CIN",
        "CINCINNATI BENGALS": "CIN",
        "CLEVELAND": "CLE",
        "CLEVELAND BROWNS": "CLE",
        "DALLAS": "DAL",
        "DALLAS COWBOYS": "DAL",
        "DENVER": "DEN",
        "DENVER BRONCOS": "DEN",
        "DETROIT": "DET",
        "DETROIT LIONS": "DET",
        "GREEN BAY": "GB",
        "GREEN BAY PACKERS": "GB",
        "HOUSTON": "HOU",
        "HOUSTON TEXANS": "HOU",
        "INDIANAPOLIS": "IND",
        "INDIANAPOLIS COLTS": "IND",
        "JACKSONVILLE": "JAX",
        "JACKSONVILLE JAGUARS": "JAX",
        "KANSAS CITY": "KC",
        "KANSAS CITY CHIEFS": "KC",
        "LAS VEGAS": "LV",
        "LAS VEGAS RAIDERS": "LV",
        "L.A. CHARGERS": "LAC",
        "LOS ANGELES CHARGERS": "LAC",
        "L.A. RAMS": "LAR",
        "LOS ANGELES RAMS": "LAR",
        "MIAMI": "MIA",
        "MIAMI DOLPHINS": "MIA",
        "MINNESOTA": "MIN",
        "MINNESOTA VIKINGS": "MIN",
        "NEW ENGLAND": "NE",
        "NEW ENGLAND PATRIOTS": "NE",
        "NEW ORLEANS": "NO",
        "NEW ORLEANS SAINTS": "NO",
        "N.Y. GIANTS": "NYG",
        "NEW YORK GIANTS": "NYG",
        "N.Y. JETS": "NYJ",
        "NEW YORK JETS": "NYJ",
        "PHILADELPHIA": "PHI",
        "PHILADELPHIA EAGLES": "PHI",
        "PITTSBURGH": "PIT",
        "PITTSBURGH STEELERS": "PIT",
        "SAN FRANCISCO": "SF",
        "SAN FRANCISCO 49ERS": "SF",
        "SEATTLE": "SEA",
        "SEATTLE SEAHAWKS": "SEA",
        "TAMPA BAY": "TB",
        "TAMPA BAY BUCCANEERS": "TB",
        "TENNESSEE": "TEN",
        "TENNESSEE TITANS": "TEN",
        "WASHINGTON": "WAS",
        "WASHINGTON COMMANDERS": "WAS",
    }
    cleaned = re.sub(r"\[[^\]]+\]", "", team).upper().strip()
    return mapping.get(cleaned, normalize_team(cleaned))


def clean_player_name(value: str) -> str:
    value = re.sub(r"\([^)]*\)", "", value)
    value = re.sub(r"\[[^\]]+\]", "", value)
    value = value.replace("†", "").replace("*", "")
    value = re.sub(r"\b(QB|RB|WR|TE|K|DST|DEF)\d*\b", "", value)
    value = re.sub(r"\s+", " ", value).strip(" -")
    suffixes = {"JR", "JR.", "SR", "SR.", "II", "III", "IV", "V"}
    parts = value.split()
    while parts and parts[-1].upper().strip(".") in {suffix.strip(".") for suffix in suffixes}:
        parts.pop()
    return " ".join(parts)


def player_key(name: str, team: str = "") -> str:
    clean_name = clean_player_name(name)
    clean_team = normalize_team(team) if team else ""
    return slugify(f"{clean_name}-{clean_team}") if clean_team else slugify(clean_name)


def parse_int(value: Optional[str]) -> Optional[int]:
    if not value:
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    match = re.search(r"\d+", value.replace(",", ""))
    return int(match.group(0)) if match else None


def parse_float(value: Optional[str]) -> Optional[float]:
    if not value:
        return None
    if isinstance(value, int) or isinstance(value, float):
        return float(value)
    match = re.search(r"-?\d+(?:\.\d+)?", value.replace(",", ""))
    return float(match.group(0)) if match else None


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


if __name__ == "__main__":
    main()
