# Storm Vector

A lightweight local weather briefing. Open `index.html` through a local HTTP server (for example `python3 -m http.server 8000`) or deploy the static files on an HTTPS host. Geolocation requires HTTPS or localhost.

## My Area

- Searches for a U.S. location when you press **Set Location**, or uses GPS. Your chosen location is saved in this browser.
- Displays NWS active alerts, the nearest available NWS station observation, and the official SPC Day 1 categorical outlook at your point.
- Checks alerts every five minutes while the page stays open. It compares alert IDs with the previous visit on this browser and shows new alerts. This is not a push notification service; keep Wireless Emergency Alerts and NOAA Weather Radio available for urgent warnings.
- Shows a feed as unavailable when a request fails. It never substitutes a CAPE based estimate for an official SPC category.

## Data and limitations

- [NWS API](https://www.weather.gov/documentation/services-web-api) for alerts and nearest station observations.
- [NOAA SPC Day 1 categorical layer](https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/SPC_wx_outlks/MapServer/1) for location specific outlook polygons. The label and retrieval time are shown, with a link to the [full official SPC outlook](https://www.spc.noaa.gov/products/outlook/). The map and hazard specific probabilities are best read on SPC's site.
- [Open-Meteo](https://open-meteo.com/en/docs) for model based CAPE and wind parameters in Storm Chaser Mode. The 10 m to 180 m wind speed difference is only a rough diagnostic and **not** deep layer or low level shear.
- [OpenStreetMap Nominatim](https://operations.osmfoundation.org/policies/nominatim/) for user submitted U.S. location search and GPS reverse lookup. There is no autocomplete or search request while typing. This public service has usage limits; move geocoding to an appropriate provider or cached proxy before significant traffic.
- Spoken broadcast uses the browser's speech synthesis. It does not generate an AI forecast, cannot speak after the page closes, and must not replace official warning channels.

`npm test` checks JavaScript syntax, official outlook parsing, alert refresh behavior, and element IDs. The app has no build step.

## Forecast, Fall Colors, and Winter

The seasonal dashboard extends this repository's existing local briefing without adding a build step, videos, or a YouTube dependency.

- **Forecast**: seven-day Open-Meteo guidance, selectable daily details, rain chances, temperatures, and gusts; the current NWS forecast period is fetched independently. Refresh explicitly with **Refresh forecast**. Retrieval time and the forecast location's timezone are displayed. Planning labels are simple StormVector heuristics, not official risk categories or an all-clear.
- **Fall Colors**: Wisconsin destination shortcuts, date-based seasonal context, local outdoor weather windows, and a link to Travel Wisconsin's current county color reports. Current foliage percentages are not scraped, invented, or inferred from the model forecast. Seasonal dates do not predict peak color.
- **Winter**: model snow amounts for the first three calendar forecast days (including hours already passed today), minimum air and apparent temperatures, a daily guidance table, and NWS winter/cold alerts at the selected location. Missing amounts stay unavailable. Snow units are validated and converted from the returned unit; snowfall is not snow depth. Ice accumulation and actual road conditions are not inferred from daily model fields. Official WSSI and Wisconsin 511 links provide additional context.
- **SPC Outlook**: selectable Day 1–3 national map images linked to SPC's official products. Switching the national map does not change the separately labeled local Day 1 category.
- **Location**: defaults to Waupun, WI when there is no saved location; GPS is requested only through **Use GPS**. Every page follows the selected location. Older model/NWS requests cannot overwrite a newer selection. Switching locations clears warning deduplication state; polling has location-version and overlap guards.

The seasonal layout uses copper autumn colors and a blue winter accent. It retains the existing alert, conditions, chaser, and spoken-briefing features. External feeds require network access and may be unavailable; their failures are labeled instead of replaced with sample weather.

`npm test` checks both scripts' syntax, official SPC parsing, alert-refresh behavior, location changes, stale seasonal responses, unit conversion, incomplete forecasts, winter/ice classification, safe text rendering, and navigation/element references. Tests use fixtures; a live API smoke check is a separate verification.
