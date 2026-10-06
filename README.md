# Brightspeed Cancellation Intelligence (Daily)

An executive analytics portal that moves from **"something is wrong"** to **where**, **why**, **could we have seen it coming?** and **what to do**.
Every number is read from an Excel workbook; there are no copies of the data in the code.

Live site: https://pssl-copilot.github.io/Insights---Portal---Daily/

Day-wise edition: pick any single day or date range in September 2026 from the calendar at the top; every page, insight and the story are recomputed for those days and compared with August at the same number of days. October predictions are as of September 30.

## Run it

```
npm install
npm run dev        # http://localhost:3000
npm run build      # static site in ./out
npm run test:data  # parses the workbook and prints a summary plus validation issues
```

## Hosting

The portal is a static site on GitHub Pages. `.github/workflows/deploy.yml` builds it on every push to `main` (or on demand from the Actions tab) and publishes it. The workbook is read at build time, so replacing the file and pushing is all that is needed to refresh the numbers.

## Data source

`/data/Brightspeed_Cancellation_Data_Daily_Oct_2026.xlsx` (set `BRIGHTSPEED_DATA_FILE` to use a workbook elsewhere).

| Sheet | Shape | Columns (the header row is detected below any title block) |
|---|---|---|
| Dashboard KPI | 3 blocks | KPI cards (KPI Card, September Value, August / Prior, Change, Card Group, Executive meaning), the state hotspot block, and the channel snapshot |
| Monthly Overview | month | Sales, installs, cancellations, rates, Pre / On / Post ODD %, classification %, Watchtower %, On Time Install % |
| State Monthly | state × month | Volumes, Pre / On / Post ODD, Customer Miss / Company Miss / Faux, Watchtower % and On Time Install % |
| Channel Monthly | channel × month | The same measures by sales channel |
| September State Drill / Channel Drill | one month | State or channel comparison for the latest month |
| September State x Channel | state × channel | Cross view for the latest month |
| ODD Timing, Cancel Classification | month | Portfolio timing and classification |
| Customer Miss Reasons | state × month × reason | Count, share, month over month change, flag, insight |
| Watchtower Signals | state + portfolio | Watchtower state before cancellation |
| Example Customer Journey, Executive Questions, Data Dictionary | reference | Narrative content |

Validation runs on every build: missing sheets or columns are errors; cross sheet mismatches are warnings. Both appear on the Settings page.

## Pages

Command Center, Cancellations (timing, Customer Miss, classification, each with a focus state and channel insight), State Wise Plan, Channel Wise Plan, Insights, Sales to Install Journey, Watchtower and Actions. Actions can be initiated: the portal drafts the email to the task owner from the data, the user reviews it and sends it through their mail client, and the status is tracked in the browser. Owner mailboxes are set in `OWNER_EMAILS` in `lib/data/narratives.ts`.

Light and dark themes follow the system setting and can be switched from the top bar.

## Insights Genie

`lib/ai/queryEngine.ts` answers questions entirely in the browser with no external API. It parses the metric (sales, installs, cancellations, cancel rate, Pre / On / Post ODD, Customer Miss, Watchtower signals, reasons), the month or months ("July", "last month", "since June"), the state and the channel, then looks the exact values up in the model. It handles single values, comparisons, rankings, trends, breakdowns and insights; "why" and "what next" questions are answered by the narrative layer, which is also computed from the data.

## Architecture

```
lib/data/
  types.ts            normalized model (fractions for %, YYYY-MM month keys, null = not in workbook)
  tableParser.ts      header detecting sheet parser
  excelLoader.ts      reads the workbook at build time
  transformations.ts  per sheet column specs → DataModel, cross validation
  metrics.ts          KPI registry, snapshots by month and scope (portfolio, state or channel), deltas, rankings
  narratives.ts       executive summary, diagnosis, focus insights, insights, actions and owner emails
lib/ai/queryEngine.ts the Insights Genie
components/           layout · kpi · charts · insights · drilldown · ai · ui
```

Colours follow business direction: growth in sales or installs is green, growth in any cancellation measure is red. Exception flags compare the month's movement with that series' own historical monthly variation.
