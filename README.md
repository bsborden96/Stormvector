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
