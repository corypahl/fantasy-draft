# Fantasy Draft Wizard

A React draft assistant for live fantasy football drafts. The app reads public rankings/projections from S3, tracks league-specific draft state locally, and can sync that state through an AWS HTTP API backed by DynamoDB.

## Draft workflow

- Create, duplicate, edit, or import Sleeper/managed ESPN league profiles.
- Validate scoring anomalies before they affect projections or recommendations.
- Sync platform draft state and enable 15-second auto-sync while picks remain controlled by the league platform.
- Forecast every owner's next two selections with a rolling simulation that combines ADP, roster needs, tier scarcity, position runs, and observed owner tendencies; predicted players also appear as dashed picks directly on the live board.
- Monitor personalized positional-run alerts and live roster health, including starter and flex coverage, projected starting PPG, bye conflicts, and prioritized remaining needs.
- Draft from a QB/RB/WR/TE player view while a persistent quarterback tracker shows how many QBs have been drafted and how many remain in every tier.
- Compare league-adjusted positional strength of schedule, Weeks 1-4 defense SOS, and kicker dome rate from current and prior-season schedule data.
- Use VOR-based, roster-aware recommendations with Balanced, Upside, Safe Floor, and Zero-RB strategies, plus a persistent watchlist and player detail drawers across every research view.
- Use a mobile-first draft-day command center with compact research cards and deep-linked tabs.

## Architecture

- React + Vite app hosted by GitHub Pages.
- Daily GitHub Action scrapes rankings/projections and uploads `data/fantasy-data.json` to S3.
- S3 serves the generated JSON with CORS enabled for the browser app.
- DynamoDB stores league profiles and draft state per league/draft.
- API Gateway + Lambda exposes `GET`/`PUT /drafts/{draftId}` for browser-safe state sync.

This repo also uses patterns from earlier projects:

- `corypahl/draft-ui`: Sleeper draft-state shape, snake draft slot logic, recommendation concepts.
- `corypahl/fantasy-ui`: cached fantasy data service ideas and league-specific configuration.
- `corypahl/fantasy-core`: Python source-client/scraper direction.

## Local development

```bash
npm install
npm run dev
```

Optional environment variables:

```bash
VITE_RANKINGS_URL=https://your-bucket.s3.us-east-1.amazonaws.com/data/fantasy-data.json
VITE_DRAFT_API_URL=https://your-api.execute-api.us-east-1.amazonaws.com
```

Without those variables, the app uses `public/data/fantasy-data.json` and saves draft state to `localStorage`.

## League profiles

The app is set up for three draft companion profiles:

- `FanDuel`: Sleeper league `1257088161859772416`
- `Jackson`: Sleeper league `1257138560092348416`
- `GVSU`: ESPN league `509557`

Each profile has its own platform, league/team IDs, lineup rules, scoring rules, and ranking set. The scraper pulls one common projection dataset, and the browser recalculates projected fantasy points per selected league. Ranking context can still differ by league through the selected `standard`, `halfPpr`, or `ppr` ranking set.

League settings are synced into the `fantasy-leagues` DynamoDB table by `scripts/sync_leagues.py`. Sleeper settings come from public league endpoints. ESPN settings use repository secrets for the private ESPN cookies.

## Deploy AWS

Install the AWS SAM CLI, then deploy:

```bash
sam deploy \
  --template-file aws/template.yml \
  --stack-name fantasy-draft \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
    RankingsBucketName=your-unique-rankings-bucket \
    AllowedOrigin=https://corypahl.github.io
```

Record the stack outputs:

- `RankingsUrl`
- `DraftApiUrl`
- `GitHubActionsRoleArn`

## Configure GitHub

Repository secrets:

- `AWS_GITHUB_ACTIONS_ROLE_ARN`: stack output `GitHubActionsRoleArn`.
- `RANKINGS_BUCKET`: the S3 bucket name.
- `ESPN_SWID`: ESPN `SWID` cookie for the GVSU league.
- `ESPN_S2`: ESPN `espn_s2` cookie for the GVSU league.

Repository variables:

- `AWS_REGION`: AWS region, for example `us-east-1`.
- `RANKINGS_KEY`: usually `data/fantasy-data.json`.
- `NFL_SEASON`: for example `2026`.
- `LEAGUE_TABLE_NAME`: usually `fantasy-leagues`.
- `ESPN_TEAM_ID`: optional team ID for the ESPN league.
- `VITE_RANKINGS_URL`: stack output `RankingsUrl`.
- `VITE_DRAFT_API_URL`: stack output `DraftApiUrl`.

Enable GitHub Pages with source set to GitHub Actions.

## Data refresh

The scheduled workflow runs daily at `10:17 UTC` and can also be started manually from the Actions tab. It refreshes draft data in S3, then syncs league settings into DynamoDB.

The scraper currently targets public FantasyPros, Sleeper, CBS Sports, nflverse, and Wikipedia data when available. It normalizes them into:

```json
{
  "generatedAt": "2026-07-14T00:00:00Z",
  "season": 2026,
  "source": "FantasyPros rankings/projections/stats, Sleeper injuries/depth charts/player metadata, nflverse schedules, and rookie draft results",
  "scoring": {
    "standard": [],
    "halfPpr": [],
    "ppr": []
  },
  "depthCharts": {},
  "injuries": [],
  "rookies": [],
  "previousYearResults": {
    "QB": [],
    "RB": [],
    "WR": [],
    "TE": []
  },
  "schedules": {
    "currentSeason": 2026,
    "previousSeason": 2025,
    "current": {},
    "previous": {}
  }
}
```

Player rows are enriched when matching data is available:

- `depthChart`: Sleeper team depth order and role, with CBS fallback.
- `injury`: Sleeper injury status, body part, recovery notes, practice participation and update time, with CBS fallback.
- `rookie`: rookie draft details from Pro Football Reference when available, with Sleeper rookie metadata fallback.
- `previousYear`: prior-season FantasyPros stats and fantasy points.
- `sleeper`: Sleeper player ID and metadata.
- Schedule metrics: positional SOS uses prior-season fantasy points allowed under the selected league scoring; defenses add a Weeks 1-4 SOS rank, and kickers add fixed/retractable-roof game counts.

## Next integration points

- Publish ESPN draft picks through the existing managed draft endpoint during live drafts.
- Move scraper source adapters toward the `fantasy-core` package layout as more sources are added.
