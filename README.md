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

Branding uses a local vector motif and the dark, purple, and electric-blue palette of the original StormVector identity. This repository alone hosts the implementation.
