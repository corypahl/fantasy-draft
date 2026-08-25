import importlib.util
import json
import os
import pathlib
import unittest


os.environ.setdefault("AWS_ACCESS_KEY_ID", "testing")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "testing")
os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-1")
os.environ.setdefault("AWS_EC2_METADATA_DISABLED", "true")
os.environ.setdefault("TABLE_NAME", "draft-state-test")
os.environ.setdefault("DRAFT_INGEST_TOKEN", "test-ingest-token")

MODULE_PATH = pathlib.Path(__file__).with_name("draft_state_handler.py")
SPEC = importlib.util.spec_from_file_location("draft_state_handler_under_test", MODULE_PATH)
handler_module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(handler_module)


class FakeTable:
    def __init__(self):
        self.items = {}

    def get_item(self, Key):
        item = self.items.get((Key["pk"], Key["sk"]))
        return {"Item": item} if item else {}

    def put_item(self, Item):
        self.items[(Item["pk"], Item["sk"])] = Item
        return {}


def ingest_event(token="test-ingest-token", source_updated_at="2026-08-25T12:00:00+00:00"):
    return {
        "routeKey": "PUT /drafts/{draftId}/ingest",
        "pathParameters": {"draftId": "gvsu-draft"},
        "headers": {"X-Draft-Token": token},
        "body": json.dumps(
            {
                "sourceUpdatedAt": source_updated_at,
                "draft": {
                    "leagueId": "gvsu",
                    "teamNames": ["Cory", "Team Two"],
                    "drafted": [
                        {
                            "pick": 1,
                            "round": 1,
                            "slot": 1,
                            "playerName": "Jahmyr Gibbs",
                            "position": "RB",
                            "team": "DET",
                        },
                        {
                            "pick": 3,
                            "round": 2,
                            "slot": 2,
                            "playerName": "Ja'Marr Chase",
                            "position": "WR",
                            "team": "CIN",
                        },
                    ],
                },
            }
        ),
    }


class DraftIngestHandlerTests(unittest.TestCase):
    def setUp(self):
        self.table = FakeTable()
        handler_module.table = self.table
        handler_module.DRAFT_INGEST_TOKEN = "test-ingest-token"

    def test_rejects_invalid_ingest_token(self):
        response = handler_module.handler(ingest_event(token="wrong"), None)

        self.assertEqual(response["statusCode"], 401)
        self.assertEqual(self.table.items, {})

    def test_stores_normalized_espn_snapshot(self):
        response = handler_module.handler(ingest_event(), None)
        stored = self.table.items[("DRAFT#gvsu-draft", "STATE")]
        draft = stored["state"]["draft"]

        self.assertEqual(response["statusCode"], 200)
        self.assertEqual(draft["source"], "espn")
        self.assertEqual(draft["currentPick"], 4)
        self.assertEqual(draft["drafted"][0]["playerId"], "jahmyr-gibbs")
        self.assertEqual(stored["managedBy"], "espn-draft-bridge")

    def test_rejects_older_snapshot(self):
        handler_module.handler(ingest_event(source_updated_at="2026-08-25T12:00:00+00:00"), None)
        response = handler_module.handler(ingest_event(source_updated_at="2026-08-25T11:59:59+00:00"), None)

        self.assertEqual(response["statusCode"], 409)

    def test_rejects_regular_put_after_bridge_takes_ownership(self):
        handler_module.handler(ingest_event(), None)
        response = handler_module.handler(
            {
                "routeKey": "PUT /drafts/{draftId}",
                "pathParameters": {"draftId": "gvsu-draft"},
                "body": json.dumps({"league": {"id": "gvsu"}}),
            },
            None,
        )

        self.assertEqual(response["statusCode"], 409)


if __name__ == "__main__":
    unittest.main()
