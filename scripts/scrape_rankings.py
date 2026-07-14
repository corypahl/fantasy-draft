import argparse
import json
import os
import re
from datetime import datetime, timezone
from typing import Dict, List, Optional

import boto3
import requests
from bs4 import BeautifulSoup


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
    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "season": args.season,
        "source": "FantasyPros consensus rankings and projections",
        "scoring": {
            scoring: enrich_with_projections(fetch_rankings(url), projections)
            for scoring, url in SCORING_URLS.items()
        },
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


def enrich_with_projections(players: List[Dict], projections: Dict[str, Dict]) -> List[Dict]:
    for player in players:
      projection = projections.get(slugify(player["name"]))
      if projection:
          player["points"] = projection.get("points")
          player["projections"] = projection.get("projections", {})
    return players


def fetch_soup(url: str) -> BeautifulSoup:
    return BeautifulSoup(fetch_html(url), "html.parser")


def fetch_html(url: str) -> str:
    response = requests.get(url, headers=HEADERS, timeout=30)
    response.raise_for_status()
    return response.text


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
    name = re.sub(r"\s+", " ", name).strip(" -")

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
    return "JAX" if team == "JAC" else team


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
