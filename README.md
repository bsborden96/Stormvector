# StormVector · Nature & the North

A map-first nature guide for Wisconsin, Minnesota, Michigan's Upper Peninsula, and the Lower Peninsula. Explore 18 curated destinations by experience, region, date, distance from your starting area, or name. Each place opens its forecast, daylight, official NWS alerts, and access notes inside the page. Save places locally in your browser, and compare conditions without a video, YouTube channel, or weather bot.

## Seasonal information

- **Fall colors:** The embedded [Travel Wisconsin report](https://www.travelwisconsin.com/fall-color-report) shows individual observations, reporter dates, reported percentages, and forecast peak weeks. The map plots Wisconsin reports and flags older data. Only reports in the same county are associated with a Wisconsin destination. Current Minnesota and Michigan foliage feeds are not connected; no current foliage percentages are estimated for those states.
- **Northern lights:** The [NOAA SWPC OVATION grid](https://www.swpc.noaa.gov/products/aurora-30-minute-forecast), northern hemisphere image when available, and three-hour Kp forecast appear alongside destination-specific nighttime cloud forecasts. The grid value measures model overhead activity, not the probability of seeing aurora. It is short-term guidance; a date selection several days away cannot carry a current OVATION forecast into that day.
- **Winter:** [Open-Meteo](https://open-meteo.com/en/docs) daily snow forecast, high and low temperatures, wind gusts, and cold-weather guidance are displayed in place. Snowfall is not snow depth, frozen waterfall status, safe lake ice, groomed trails, or park access.
- **Local weather:** Set a city or explicitly use GPS, then see the same local forecast and [NWS](https://www.weather.gov/documentation/services-web-api) active alerts without leaving the guide. City searches use OpenStreetMap Nominatim only on submission. Its public service has usage limits; provide your own geocoder or cached proxy if traffic increases.

The starting area defaults to Waupun, Wisconsin. Dates cover the next seven days. Distances and map markers are approximate straight-line planning cues. External weather feeds may fail; the interface marks unavailable data. Saved places and starting area stay in the current browser.

## Run and update

The site is buildless static HTML, CSS, and JavaScript. Serve this directory over HTTP (`python3 -m http.server 8000`), or host it with GitHub Pages. GPS requires HTTPS or localhost. `npm test` runs the focused checks.

`python3 scripts/update_reports.py` refreshes the Wisconsin report from the public Travel Wisconsin HTML. It rejects reports with fewer than 50 valid observations and leaves the prior snapshot intact on failure. A daily GitHub Action runs during September–November and commits `data/fall-reports.json` when it changes. The page fetches the latest snapshot from this Stormvector repository and falls back to its packaged snapshot if GitHub is unavailable. Reporter update times and the retrieval time are kept separately. When the fall reporting season ends, the interface marks reports as older; it never presents them as current.

Branding retains the StormVector vector logo and dark electric-blue identity with seasonal accents. This repository alone hosts the implementation.

## Pages, phone layouts and field guides

Explore opens a three-place shortlist and regional map. Fall colors orders places by recent observed color, puts the map ahead of the collapsed full report table, and keeps color percentages distinct from peak timing and leaf retention. Northern Lights combines hourly clouds with calculated full darkness, moon position/illumination, and interval-specific NOAA Kp; a sustained cloud window requires at least two consecutive hourly samples with at most 25% cloud during astronomical darkness. This describes sky conditions, not aurora visibility. The NOAA native grid is rendered locally as a labeled regional graphic rather than depending on a separate image endpoint.

Winter distinguishes new snowfall from current **modeled** snow depth. Local Weather includes current model conditions, hourly guidance, one seven-day overview, daylight and NWS alerts. Missing fields stay unavailable. Promising outdoor windows use two or more consecutive daylight samples with 35–85°F temperatures, precipitation probability at most 25%, gusts below 25 mph, and no thunder/freezing-precipitation/snow weather code. These transparent thresholds do not establish safe trail conditions.

All 18 destinations have a researched named starting point, terrain, admission notes, and source review date in `src/field-guide.js`. These are editorial guides, not live access inspections. Six local NPS WebP photographs replace the synthetic scenery; exact provenance and public-domain attribution are in `assets/credits.json`. They illustrate named regional places and never imply current conditions.

At phone widths, navigation becomes an expandable menu, destination results support Map/List/Both, and selected places open a dismissible nonmodal bottom panel. Inputs use readable 16px text; controls target at least 44px touch areas, forecasts scroll horizontally, and layouts account for safe areas and reduced motion. Desktop keeps map and details side by side. Saved places and origin remain local to this browser.

An explicit **Estimate the drive** action queries the public OSRM routing service and draws an approximate road route inside the map. Estimates are cached for the session, omit live traffic/weather delays, may include ferries, and end at the representative park map point rather than a verified trailhead. This public service has no availability guarantee; failures stay visible. For higher traffic, provision a supported routing provider. Distances shown before requesting a route remain straight-line miles.

## Community photos

Community Photos remains a shared gallery with map groups, event and date filters, and a public submission form. Choose a curated destination, place or drag a map pin, or explicitly use your current location. Required fields are location name, event type (snow, aurora, nature, fall colors), camera/phone, capture date/time, time zone, image and permission to publish. Coordinates are represented by the selected map pin, and the capture preview uses readable local time. Optional title, display name and caption are collapsed. The service records capture and submission timestamps separately.

Uploads are hosted in R2 through the service under `community-service/`. The frontend resizes to at most 2200 px and recompresses to JPEG, removing embedded EXIF/GPS data. Only the selected location and entered metadata are published. A private removal receipt stays in the submitting browser. Public contributions appear immediately; there is no moderation dashboard. Gallery and upload errors stay visible. The website stays at its existing GitHub Pages URL.

## Validation and limits

`npm test` runs syntax checks, seasonal data/forecast tests, cache invalidation, contiguous sky/outdoor window tests, sun/moon and Kp overlap, route navigation, report parsing (including the source's Delafield county correction), photo grouping, timestamp conversion, and community service upload/list/media/removal behavior. A separate DOM-only smoke check exercised all seven pages, mobile menu and map/list/panel events, and photo field rendering. It does not verify layout. Physical iPhone/Android Safari/Chrome testing and browser visual QA were unavailable in the managed environment; responsive CSS and DOM behaviors were checked without claiming device certification. Live forecast/routing endpoints can be unavailable independently of the page.
