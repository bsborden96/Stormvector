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

## Seasonal pages and community photos

Each tab now has a distinct layout and visual identity. Aurora uses a dark green night-sky view with three-night cards combining destination cloud windows and overlapping NOAA Kp intervals. Fall uses warm foliage colors, observation summaries, county reports and nearby color progress. Winter uses an icy landscape and seven-day snow bars, air temperatures and apparent lows. Local Weather shows a complete seven-day strip and full-width local details. Tabs redraw the selected destination immediately. Every displayed destination loads its forecast automatically with bounded concurrency and a 30-minute cache; failures are marked rather than substituted.

The Community Photos tab is a shared gallery with map groups, event and date filters, and a public submission form. Choose a curated destination, place or drag a map pin, or explicitly use your current location. Required fields are location name, event type (snow, aurora, nature, fall colors), camera/phone, date and time taken, time zone, image and permission to publish. The service records capture and submission timestamps separately. Nearby selected coordinates form map groups; tapping a group filters the gallery to those photos. Display name, title and caption are optional.

Uploads are hosted in R2 through the service documented under `community-service/`. They are shared between visitors, rather than saved only on the contributor's device. The frontend resizes to at most 2200 px and recompresses to JPEG, removing embedded EXIF/GPS data. Only the selected location and entered metadata are published. A private removal receipt stays in the submitting browser. Public contributions appear immediately; this release has no moderation dashboard. Gallery and upload errors stay visible. The website stays at its existing GitHub Pages URL.

`npm test` now also covers tab switching, dark-hour/Kp interval overlap, missing forecast coverage, photo map grouping, Central/Eastern timestamp conversion and invalid daylight-saving times, and upload/list/media/removal behavior in the service. Publication additionally includes an HTTP check against the live photo service. Browser visual QA is not available in the managed environment used for this update.
