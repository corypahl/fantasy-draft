import argparse
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

PROJECTION_URLS = {
    "QB": "https://www.fantasypros.com/nfl/projections/qb.php?week=draft",
    "RB": "https://www.fantasypros.com/nfl/projections/rb.php?week=draft",
    "WR": "https://www.fantasypros.com/nfl/projections/wr.php?week=draft",
    "TE": "https://www.fantasypros.com/nfl/projections/te.php?week=draft",
    "K": "https://www.fantasypros.com/nfl/projections/k.php?week=draft",
    "DST": "https://www.fantasypros.com/nfl/projections/dst.php?week=draft",
}

STAT_URLS = {
    "QB": "https://www.fantasypros.com/nfl/stats/qb.php?year={year}",
    "RB": "https://www.fantasypros.com/nfl/stats/rb.php?year={year}",
    "WR": "https://www.fantasypros.com/nfl/stats/wr.php?year={year}",
    "TE": "https://www.fantasypros.com/nfl/stats/te.php?year={year}",
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
        "fumbles_lost",
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
}

DEPTH_LIMITS = {"QB": 1, "RB": 2, "WR": 3, "TE": 1}

SLEEPER_PLAYERS_URL = "https://api.sleeper.app/v1/players/nfl"
CBS_INJURIES_URL = "https://www.cbssports.com/nfl/injuries/"
PFR_DRAFT_URL = "https://www.pro-football-reference.com/years/{year}/draft.htm"
WIKIPEDIA_DRAFT_URL = "https://en.wikipedia.org/wiki/{year}_NFL_draft"

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
    parser.add_argument("--bucket", default=os.environ.get("RANKINGS_BUCKET"))
    parser.add_argument("--key", default=os.environ.get("RANKINGS_KEY", "data/fantasy-data.json"))
    parser.add_argument("--output", default="dist-data/fantasy-data.json")
    parser.add_argument("--season", type=int, default=int(os.environ.get("NFL_SEASON", datetime.now(timezone.utc).year)))
    args = parser.parse_args()

    projections = fetch_projections()
    sleeper_players = fetch_sleeper_players()
    depth_charts = fetch_depth_charts(sleeper_players)
    injuries = fetch_injuries(sleeper_players)
    rookies = fetch_rookies(args.season, sleeper_players)
    previous_year_results = fetch_previous_year_results(args.season - 1)
    enrichments = build_player_enrichments(depth_charts, injuries, rookies, previous_year_results, sleeper_players)
    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "season": args.season,
        "source": "FantasyPros rankings/projections/stats, CBS injuries/depth charts, Sleeper player metadata, Pro Football Reference draft results when available",
        "metadata": {
            "previousSeason": args.season - 1,
            "sources": {
                "rankings": "FantasyPros",
                "projections": "FantasyPros",
                "previousYearResults": "FantasyPros",
                "depthCharts": "CBS Sports with Sleeper fallback",
                "injuries": "CBS Sports with Sleeper fallback",
                "rookies": "Pro Football Reference with Sleeper fallback",
            },
        },
        "scoring": {
            scoring: enrich_players(fetch_rankings(url), projections, enrichments)
            for scoring, url in SCORING_URLS.items()
        },
        "depthCharts": depth_charts,
        "injuries": injuries,
        "rookies": rookies,
        "previousYearResults": previous_year_results,
    }

    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as output_file:
        json.dump(payload, output_file, indent=2)

    if args.bucket:
        boto3.client("s3").upload_file(
            args.output,
            args.bucket,
            args.key,
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


def fetch_projections() -> Dict[str, Dict]:
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
            projections[slugify(player["name"])] = {
                "points": points,
                "projections": projection,
            }
    return projections


def fetch_sleeper_players() -> Dict[str, Dict]:
    try:
        response = requests.get(SLEEPER_PLAYERS_URL, headers=HEADERS, timeout=45)
        response.raise_for_status()
        return response.json()
    except requests.RequestException:
        return {}


def fetch_depth_charts(sleeper_players: Dict[str, Dict]) -> Dict[str, Dict[str, List[Dict]]]:
    charts: Dict[str, Dict[str, List[Dict]]] = {}
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

    if charts:
        return charts

    for player in sleeper_players.values():
        position = player.get("position")
        team = normalize_team(player.get("team") or "")
        order = player.get("depth_chart_order")
        if position not in DEPTH_LIMITS or not team or not order:
            continue
        if int(order) > DEPTH_LIMITS[position]:
            continue
        charts.setdefault(team, {}).setdefault(position, []).append(
            {
                "name": player.get("full_name"),
                "team": team,
                "position": position,
                "order": int(order),
                "source": "Sleeper",
            }
        )

    for positions in charts.values():
        for values in positions.values():
            values.sort(key=lambda item: item["order"])
    return charts


def fetch_injuries(sleeper_players: Dict[str, Dict]) -> List[Dict]:
    injuries = []
    seen = set()
    try:
        soup = fetch_soup(CBS_INJURIES_URL)
        for table in soup.select("table.TableBase-table"):
            for row in table.select("tr"):
                name_tag = row.select_one("span.CellPlayerName--long")
                cells = row.select("td.TableBase-bodyTd")
                if not name_tag or len(cells) < 5:
                    continue
                position = cells[1].get_text(strip=True)
                if position not in {"QB", "RB", "WR", "TE", "K"}:
                    continue
                name = clean_player_name(name_tag.get_text(strip=True))
                key = slugify(name)
                seen.add(key)
                injuries.append(
                    {
                        "name": name,
                        "position": position,
                        "updated": cells[2].get_text(strip=True),
                        "injury": cells[3].get_text(strip=True),
                        "status": cells[4].get_text(strip=True),
                        "source": "CBS Sports",
                    }
                )
    except requests.RequestException:
        pass

    for player in sleeper_players.values():
        status = player.get("injury_status")
        name = player.get("full_name")
        position = player.get("position")
        if not status or not name or position not in {"QB", "RB", "WR", "TE", "K"} or slugify(name) in seen:
            continue
        injuries.append(
            {
                "name": name,
                "team": normalize_team(player.get("team") or ""),
                "position": position,
                "updated": player.get("injury_start_date") or "",
                "injury": player.get("injury_body_part") or player.get("injury_notes") or "",
                "status": status,
                "source": "Sleeper",
            }
        )
    return injuries


def fetch_rookies(season: int, sleeper_players: Dict[str, Dict]) -> List[Dict]:
    rookies = []
    seen = set()
    draft_year = season
    draft_results = fetch_pfr_rookies(draft_year) or fetch_wikipedia_rookies(draft_year)
    if not draft_results:
        draft_year = season - 1
        draft_results = fetch_pfr_rookies(draft_year) or fetch_wikipedia_rookies(draft_year)

    for rookie in draft_results:
        key = slugify(rookie["name"])
        if key in seen:
            continue
        seen.add(key)
        rookies.append(rookie)

    for player in sleeper_players.values():
        metadata = player.get("metadata") or {}
        name = player.get("full_name")
        position = player.get("position")
        rookie_year = str(metadata.get("rookie_year") or "")
        if not name or position not in {"QB", "RB", "WR", "TE"}:
            continue
        if slugify(name) in seen:
            continue
        if player.get("years_exp") != 0 and rookie_year != str(draft_year):
            continue
        if name.lower() == "player invalid":
            continue
        rookies.append(
            {
                "name": name,
                "position": position,
                "team": normalize_team(player.get("team") or ""),
                "college": player.get("college") or "",
                "rookieYear": parse_int(rookie_year) or draft_year,
                "source": "Sleeper",
            }
        )
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
    clean_name = clean_player_name(name)
    clean_team = normalize_team(team or "")
    return (slugify(clean_name), slugify(f"{clean_name}-{clean_team}") if clean_team else slugify(clean_name))


def enrich_players(players: List[Dict], projections: Dict[str, Dict], enrichments: Dict[str, Dict]) -> List[Dict]:
    for player in players:
        projection = projections.get(slugify(player["name"]))
        if projection:
            player["points"] = projection.get("points")
            player["projections"] = projection.get("projections", {})
        enrichment = enrichments.get(slugify(f"{player['name']}-{player['team']}")) or enrichments.get(slugify(player["name"]))
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
    team_match = re.search(r"\b([A-Z]{2,3})\b", cleaned)
    if team_match:
        team = normalize_team(team_match.group(1))

    name = cleaned
    if pos_rank:
        name = name.replace(pos_rank.group(0), "")
    if team:
        name = re.sub(rf"\b{team}\b", "", name)
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
    return "JAX" if team == "JAC" else team


def nfl_team_to_abbr(team: str) -> str:
    mapping = {
        "ARIZONA CARDINALS": "ARI",
        "ATLANTA FALCONS": "ATL",
        "BALTIMORE RAVENS": "BAL",
        "BUFFALO BILLS": "BUF",
        "CAROLINA PANTHERS": "CAR",
        "CHICAGO BEARS": "CHI",
        "CINCINNATI BENGALS": "CIN",
        "CLEVELAND BROWNS": "CLE",
        "DALLAS COWBOYS": "DAL",
        "DENVER BRONCOS": "DEN",
        "DETROIT LIONS": "DET",
        "GREEN BAY PACKERS": "GB",
        "HOUSTON TEXANS": "HOU",
        "INDIANAPOLIS COLTS": "IND",
        "JACKSONVILLE JAGUARS": "JAX",
        "KANSAS CITY CHIEFS": "KC",
        "LAS VEGAS RAIDERS": "LV",
        "LOS ANGELES CHARGERS": "LAC",
        "LOS ANGELES RAMS": "LAR",
        "MIAMI DOLPHINS": "MIA",
        "MINNESOTA VIKINGS": "MIN",
        "NEW ENGLAND PATRIOTS": "NE",
        "NEW ORLEANS SAINTS": "NO",
        "NEW YORK GIANTS": "NYG",
        "NEW YORK JETS": "NYJ",
        "PHILADELPHIA EAGLES": "PHI",
        "PITTSBURGH STEELERS": "PIT",
        "SAN FRANCISCO 49ERS": "SF",
        "SEATTLE SEAHAWKS": "SEA",
        "TAMPA BAY BUCCANEERS": "TB",
        "TENNESSEE TITANS": "TEN",
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
