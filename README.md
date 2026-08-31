# Fantasy Draft Wizard

A React draft assistant for live fantasy football drafts. The app reads public rankings/projections from S3, tracks league-specific draft state locally, and can sync that state through an AWS HTTP API backed by DynamoDB.

## Draft workflow

- Create, duplicate, edit, or import Sleeper/managed ESPN league profiles.
- Validate scoring anomalies before they affect projections or recommendations.
- Connect any league profile to a Sleeper mock draft ID, update picks on demand or every 15 seconds, and reset back to the full player pool between mocks.
- Keep the existing Sleeper and managed ESPN live-draft sync available as a separate Board action.
- Bridge ESPN draft-room picks into the GVSU Board with a private Chrome extension, including parser diagnostics, manual rescans, and optional authenticated cloud publishing.
- Forecast upcoming selections with a rolling simulation that combines ADP, roster needs, tier scarcity, position runs, and observed owner tendencies; predicted players appear as dashed picks directly on the live board.
- Compare the top three roster-aware recommendations at every position from the Draft Board.
- Copy a ready-to-paste ChatGPT draft context containing league rules, scoring, roster health, recent picks, positional-run alerts, and the top available QBs, RBs, WRs, and TEs.
- Monitor personalized positional-run alerts and live roster health, including starter and flex coverage, projected starting PPG, bye conflicts, and prioritized remaining needs.
- Switch between position columns and an expanded all-player table while retaining position filters, drafted-player controls, and live available/total counts for each tier-color band.
- Compare league-adjusted positional strength of schedule, Weeks 1-4 defense SOS, and kicker dome rate from current and prior-season schedule data.
- Use VOR-based, roster-aware recommendations with Balanced, Upside, Safe Floor, and Zero-RB strategies, plus a persistent watchlist and player detail drawers across every research view.
- Read ID-matched, AI-generated 2026 redraft outlooks in each player detail drawer from the separately published S3 outlook dataset.
- Use a mobile-first draft-day command center with compact research cards and deep-linked tabs.

## Architecture

- React + Vite app hosted by GitHub Pages.
- The separate [`corypahl/fantasy-data`](https://github.com/corypahl/fantasy-data) repository collects and publishes the `data/*.json` feeds consumed by this app.
- A dedicated publish workflow validates and uploads `data/player-outlooks-2026.json` to S3 whenever the checked-in outlook dataset changes.
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

The app is set up for two draft companion profiles:

- `Jackson`: Sleeper league `1389737302812553216`; its active slow draft is `1389737302812553217`
- `GVSU`: ESPN league `509557`

Each profile has its own platform, league/team IDs, lineup rules, scoring rules, and ranking set. The shared data feed supplies one common projection dataset, and the browser recalculates projected fantasy points per selected league. Ranking context can still differ by league through the selected `standard`, `halfPpr`, or `ppr` ranking set.

Provider collection and league snapshots now live in [`corypahl/fantasy-data`](https://github.com/corypahl/fantasy-data). This app remains a read-only consumer of the public data feed while its draft-state API continues to use DynamoDB.

Opening the Jackson Draft Board connects to the active Sleeper slow draft automatically and enables 15-second auto-sync after the first successful refresh.

## Mock drafts

Select the league profile whose rules you want to use, open the Board tab, and enter the ID from the Sleeper mock draft. `Start mock` loads the current picks, `Update mock` refreshes them on demand, and auto-sync checks Sleeper every 15 seconds. The selected profile continues to control scoring, rankings, roster needs, and recommendations even when the profile is an ESPN league. Use `Reset` to disconnect the session, clear every pick, and restore the base player pool before starting another mock.

## Deploy AWS

Install the AWS SAM CLI, then deploy:

```bash
sam deploy \
  --template-file aws/template.yml \
  --stack-name fantasy-draft \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
    RankingsBucketName=your-unique-rankings-bucket \
    AllowedOrigin=https://corypahl.github.io \
    DraftIngestToken=your-private-random-token
```

Record the stack outputs:

- `RankingsUrl`
- `DraftApiUrl`
- `GitHubActionsRoleArn`

## Configure GitHub

Repository secrets:

- `AWS_GITHUB_ACTIONS_ROLE_ARN`: stack output `GitHubActionsRoleArn`.
- `RANKINGS_BUCKET`: the S3 bucket name.

Repository variables:

- `AWS_REGION`: AWS region, for example `us-east-1`.
- `VITE_RANKINGS_URL`: stack output `RankingsUrl`.
- `VITE_DRAFT_API_URL`: stack output `DraftApiUrl`.

Enable GitHub Pages with source set to GitHub Actions.

## ESPN Draft Bridge

The private Manifest V3 extension in `espn-draft-bridge/` watches the ESPN draft room and sends complete draft snapshots to open Draft Wizard tabs. It reads ESPN's structured draft payload through the already signed-in draft page, with a markup parser as a fallback. It does not request cookie access or read ESPN credentials.

Install it locally:

1. Pull the latest repository version.
2. Open `chrome://extensions` in Chrome and enable **Developer mode**.
3. Select **Load unpacked** and choose the repository's `espn-draft-bridge` folder.
4. Open the ESPN draft room and reload it once after installation.
5. Open the extension and confirm `gvsu-draft` and `gvsu`. The bridge detects the owner order, team count, and round count from the active ESPN room; the saved team/round settings and optional owner names are used only as fallbacks.
6. Enable **Live bridge**, then select **Save & scan**.
7. Open the GVSU Draft Board. Its ESPN Draft Bridge banner turns green when snapshots arrive.

The popup remains useful during the draft:

- **Rescan** rebuilds the entire pick history instead of relying on a possibly missed incremental event.
- If Chrome or the laptop restarts, the bridge merges new scans with its saved history instead of discarding earlier rounds. If the popup reports **Partial draft history**, open ESPN's **Pick History** tab once and click **Rescan** to backfill the missing selections.
- **Copy diagnostics** copies locally captured selector samples and parsed picks for quick parser adjustments if ESPN changes its markup.
- The status card shows detected candidates, parsed picks, the last scan, and publishing errors.

By default, the bridge works locally between Chrome tabs and stores its latest snapshot in extension storage. The Draft Wizard tab can be opened after the ESPN draft starts and will immediately request the latest stored snapshot.

Optional cloud publishing keeps other devices current. Deploy the SAM stack with a private `DraftIngestToken`, enable **Publish through AWS** in the extension, and enter the same token there. Never commit that token. The authenticated route is `PUT /drafts/{draftId}/ingest`; it rejects older snapshots, and normal site writes cannot overwrite an extension-managed draft.

## Data refresh

Scheduled scraping has moved to [`corypahl/fantasy-data`](https://github.com/corypahl/fantasy-data). That repository targets public FantasyPros, Sleeper, CBS Sports, nflverse, and Wikipedia data and publishes the split `data/*.json` files this app loads.

The combined legacy shape remains:

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

- Calibrate ESPN selector adapters against the live draft-room diagnostics before the real draft begins.
- Evolve scraper source adapters in `corypahl/fantasy-data` as providers and schemas change.
