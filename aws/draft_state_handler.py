import json
import os
from datetime import datetime, timezone

import boto3
from boto3.dynamodb.conditions import Key


TABLE_NAME = os.environ["TABLE_NAME"]
ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", "*")

table = boto3.resource("dynamodb").Table(TABLE_NAME)


def handler(event, _context):
    route_key = event.get("routeKey", "")
    path_params = event.get("pathParameters") or {}
    draft_id = path_params.get("draftId")

    if route_key.startswith("OPTIONS"):
        return respond(204, None)

    if route_key == "GET /drafts/{draftId}" and draft_id:
        result = table.get_item(Key={"pk": f"DRAFT#{draft_id}", "sk": "STATE"})
        return respond(200, result.get("Item", {}).get("state"))

    if route_key == "PUT /drafts/{draftId}" and draft_id:
        body = json.loads(event.get("body") or "{}")
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


def respond(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
            "Access-Control-Allow-Headers": "content-type",
            "Access-Control-Allow-Methods": "GET,PUT,OPTIONS",
        },
        "body": "" if body is None else json.dumps(body),
    }
