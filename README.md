# Fantasy Draft Wizard

A React draft assistant for live fantasy football drafts. The app reads public rankings/projections from S3, tracks league-specific draft state locally, and can sync that state through an AWS HTTP API backed by DynamoDB.

## Architecture

- React + Vite app hosted by GitHub Pages.
- Daily GitHub Action scrapes rankings/projections and uploads `data/fantasy-data.json` to S3.
- S3 serves the generated JSON with CORS enabled for the browser app.
- DynamoDB stores draft state per league/draft.
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

- `Sleeper League 1`
- `Sleeper League 2`
- `ESPN League`

Each profile has its own platform, league/team IDs, lineup rules, scoring rules, and ranking set. The scraper pulls one common projection dataset, and the browser recalculates projected fantasy points per selected league. Ranking context can still differ by league through the selected `standard`, `halfPpr`, or `ppr` ranking set.

For now, edit the defaults in `src/main.tsx` or use the League tab in the app. Real Sleeper/ESPN IDs will be wired into the external draft-status sync next.

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

Repository variables:

- `AWS_REGION`: AWS region, for example `us-east-1`.
- `RANKINGS_KEY`: usually `data/fantasy-data.json`.
- `NFL_SEASON`: for example `2026`.
- `VITE_RANKINGS_URL`: stack output `RankingsUrl`.
- `VITE_DRAFT_API_URL`: stack output `DraftApiUrl`.

Enable GitHub Pages with source set to GitHub Actions.

## Data refresh

The scheduled workflow runs daily at `10:17 UTC` and can also be started manually from the Actions tab.

The scraper currently targets public FantasyPros ranking/projection pages and normalizes them into:

```json
{
  "generatedAt": "2026-07-14T00:00:00Z",
  "season": 2026,
  "source": "FantasyPros consensus rankings and projections",
  "scoring": {
    "standard": [],
    "halfPpr": [],
    "ppr": []
  }
}
```

## Next integration points

- Add Sleeper draft import using the service shape already proven in `draft-ui`.
- Add league presets for FanDuel, Jackson, and GVSU using the mapping pattern from `draft-ui`.
- Move scraper source adapters toward the `fantasy-core` package layout as more sources are added.
