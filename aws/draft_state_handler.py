import json
import os
from datetime import datetime, timezone
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key


TABLE_NAME = os.environ["TABLE_NAME"]
LEAGUE_TABLE_NAME = os.environ.get("LEAGUE_TABLE_NAME")
ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", "*")

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
        body = json.loads(event.get("body") or "{}", parse_float=Decimal)
        now = datetime.now(timezone.utc).isoformat()
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
            "Access-Control-Allow-Headers": "content-type",
            "Access-Control-Allow-Methods": "GET,PUT,OPTIONS",
        },
        "body": "" if body is None else json.dumps(body, default=encode_json),
    }


def encode_json(value):
    if isinstance(value, Decimal):
        return int(value) if value % 1 == 0 else float(value)
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")
