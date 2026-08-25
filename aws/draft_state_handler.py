import json
import hmac
import os
from datetime import datetime, timezone
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key


TABLE_NAME = os.environ["TABLE_NAME"]
LEAGUE_TABLE_NAME = os.environ.get("LEAGUE_TABLE_NAME")
ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", "*")
DRAFT_INGEST_TOKEN = os.environ.get("DRAFT_INGEST_TOKEN", "")

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)
league_table = dynamodb.Table(LEAGUE_TABLE_NAME) if LEAGUE_TABLE_NAME else None


def handler(event, _context):
    route_key = event.get("routeKey", "")
    path_params = event.get("pathParameters") or {}
    draft_id = path_params.get("draftId")

    if route_key.startswith("OPTIONS"):
        return respond(204, None)

    if route_key == "GET /drafts/{draftId}" and draft_id:
        result = table.get_item(Key={"pk": f"DRAFT#{draft_id}", "sk": "STATE"})
        return respond(200, result.get("Item", {}).get("state"))

    if route_key == "PUT /drafts/{draftId}/ingest" and draft_id:
        if not DRAFT_INGEST_TOKEN:
            return respond(503, {"message": "Draft ingestion is not configured"})
        supplied_token = request_header(event, "x-draft-token")
        if not supplied_token or not hmac.compare_digest(supplied_token, DRAFT_INGEST_TOKEN):
            return respond(401, {"message": "Invalid draft ingestion token"})

        body = json.loads(event.get("body") or "{}", parse_float=Decimal)
        incoming_draft = body.get("draft")
        if not isinstance(incoming_draft, dict) or not isinstance(incoming_draft.get("drafted"), list):
            return respond(400, {"message": "A draft object with a drafted pick list is required"})

        key = {"pk": f"DRAFT#{draft_id}", "sk": "STATE"}
        existing_item = table.get_item(Key=key).get("Item") or {}
        existing_state = existing_item.get("state") or {}
        existing_draft = existing_state.get("draft") if isinstance(existing_state, dict) else {}
        existing_draft = existing_draft if isinstance(existing_draft, dict) else {}
        source_updated_at = str(body.get("sourceUpdatedAt") or incoming_draft.get("lastSyncedAt") or utc_now())
        existing_source_updated_at = str(existing_item.get("sourceUpdatedAt") or existing_state.get("sourceUpdatedAt") or "")
        if existing_source_updated_at and source_updated_at < existing_source_updated_at:
            return respond(409, {"message": "A newer ESPN draft snapshot is already stored"})

        team_names = incoming_draft.get("teamNames")
        if not isinstance(team_names, list) or not team_names:
            team_names = existing_draft.get("teamNames") or []
        drafted = normalize_ingested_picks(incoming_draft["drafted"], team_names)
        latest_pick = max((pick["pick"] for pick in drafted), default=0)
        merged_draft = {
            **existing_draft,
            **incoming_draft,
            "id": draft_id,
            "drafted": drafted,
            "teamNames": team_names,
            "currentPick": latest_pick + 1,
            "source": "espn",
            "sessionType": "live",
            "lastSyncedAt": source_updated_at,
        }
        state = {
            "draft": merged_draft,
            "managedBy": "espn-draft-bridge",
            "sourceUpdatedAt": source_updated_at,
        }
        now = utc_now()
        table.put_item(
            Item={
                **key,
                "draftId": draft_id,
                "leagueId": merged_draft.get("leagueId", "unknown"),
                "updatedAt": now,
                "sourceUpdatedAt": source_updated_at,
                "managedBy": "espn-draft-bridge",
                "state": state,
            }
        )
        return respond(200, {"draftId": draft_id, "updatedAt": now, "pickCount": len(drafted)})

    if route_key == "GET /leagues":
        if not league_table:
            return respond(500, {"message": "League table is not configured"})
        result = league_table.scan()
        leagues = [normalize_league_item(item) for item in result.get("Items", [])]
        return respond(200, {"leagues": leagues})

    if route_key == "GET /leagues/{leagueId}":
        if not league_table:
            return respond(500, {"message": "League table is not configured"})
        league_id = path_params.get("leagueId")
        result = league_table.get_item(Key={"leagueId": league_id})
        item = result.get("Item")
        return respond(200, normalize_league_item(item) if item else None)

    if route_key == "PUT /leagues/{leagueId}":
        if not league_table:
            return respond(500, {"message": "League table is not configured"})
        league_id = path_params.get("leagueId")
        body = json.loads(event.get("body") or "{}", parse_float=Decimal)
        now = datetime.now(timezone.utc).isoformat()
        league_table.put_item(
            Item={
                "leagueId": league_id,
                "updatedAt": now,
                "profile": body,
            }
        )
        return respond(200, {"leagueId": league_id, "updatedAt": now})

    if route_key == "PUT /drafts/{draftId}" and draft_id:
        existing_item = table.get_item(Key={"pk": f"DRAFT#{draft_id}", "sk": "STATE"}).get("Item") or {}
        if existing_item.get("managedBy") == "espn-draft-bridge":
            return respond(409, {"message": "This draft is managed by the ESPN Draft Bridge"})
        body = json.loads(event.get("body") or "{}", parse_float=Decimal)
        now = utc_now()
        item = {
            "pk": f"DRAFT#{draft_id}",
            "sk": "STATE",
            "draftId": draft_id,
            "leagueId": body.get("league", {}).get("id", "unknown"),
            "updatedAt": now,
            "state": body,
        }
        table.put_item(Item=item)
        return respond(200, {"draftId": draft_id, "updatedAt": now})

    if route_key == "GET /leagues/{leagueId}/drafts":
        league_id = path_params.get("leagueId")
        result = table.query(
            IndexName="league-updated-index",
            KeyConditionExpression=Key("leagueId").eq(league_id),
            ScanIndexForward=False,
            Limit=25,
        )
        return respond(200, result.get("Items", []))

    return respond(404, {"message": "Not found"})


def request_header(event, name):
    headers = event.get("headers") or {}
    expected = name.lower()
    for key, value in headers.items():
        if str(key).lower() == expected:
            return str(value)
    return ""


def normalize_ingested_picks(picks, team_names):
    normalized_by_pick = {}
    for raw_pick in picks:
        if not isinstance(raw_pick, dict):
            continue
        try:
            pick_number = int(raw_pick.get("pick"))
            round_number = int(raw_pick.get("round"))
            slot = int(raw_pick.get("slot"))
        except (TypeError, ValueError):
            continue
        player_name = str(raw_pick.get("playerName") or "").strip()
        if pick_number < 1 or round_number < 1 or slot < 1 or not player_name:
            continue
        team_name = str(raw_pick.get("teamName") or "").strip()
        if not team_name and slot <= len(team_names):
            team_name = str(team_names[slot - 1])
        normalized_by_pick[pick_number] = {
            **raw_pick,
            "pick": pick_number,
            "round": round_number,
            "slot": slot,
            "teamName": team_name or f"Team {slot}",
            "playerName": player_name,
            "playerId": str(raw_pick.get("playerId") or slugify(player_name)),
        }
    return sorted(normalized_by_pick.values(), key=lambda pick: pick["pick"])


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def normalize_league_item(item):
    if "profile" in item:
        return item["profile"]

    league_name = item.get("leagueName", item.get("leagueId", "League"))
    league_id = item.get("leagueId", league_name)
    platform = str(item.get("site", "sleeper")).lower()
    ranking_preset = "standard" if platform == "espn" else "halfPpr"
    reception = Decimal("0") if ranking_preset == "standard" else Decimal("0.5")
    teams = Decimal("10") if platform == "espn" else Decimal("12")

    return {
        "id": slugify(league_name),
        "name": league_name,
        "platform": platform,
        "externalLeagueId": league_id,
        "scoringPreset": ranking_preset,
        "rankingPreset": ranking_preset,
        "lineup": {
            "teams": teams,
            "rosterSpots": Decimal("16"),
            "qb": Decimal("1"),
            "rb": Decimal("2"),
            "wr": Decimal("2"),
            "te": Decimal("1"),
            "flex": Decimal("1"),
            "superflex": Decimal("0"),
            "k": Decimal("1"),
            "dst": Decimal("1"),
            "bench": Decimal("6"),
        },
        "scoring": {
            "passingYardsPerPoint": Decimal("25"),
            "passingTd": Decimal("4"),
            "interception": Decimal("-2"),
            "rushingYardsPerPoint": Decimal("10"),
            "receivingYardsPerPoint": Decimal("10"),
            "rushReceiveTd": Decimal("6"),
            "reception": reception,
            "fumbleLost": Decimal("-2"),
            "fieldGoal": Decimal("3"),
            "extraPoint": Decimal("1"),
            "dstSack": Decimal("1"),
            "dstInterception": Decimal("2"),
            "dstFumbleRecovery": Decimal("2"),
            "dstTouchdown": Decimal("6"),
            "dstSafety": Decimal("2"),
        },
    }


def slugify(value):
    return "".join(character.lower() if character.isalnum() else "-" for character in str(value)).strip("-")


def respond(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
            "Access-Control-Allow-Headers": "content-type,x-draft-token",
            "Access-Control-Allow-Methods": "GET,PUT,OPTIONS",
        },
        "body": "" if body is None else json.dumps(body, default=encode_json),
    }


def encode_json(value):
    if isinstance(value, Decimal):
        return int(value) if value % 1 == 0 else float(value)
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")
