/* Researched starting points, checked 2026-10-16 against the linked managing agency.
 * checkedAt records editorial source review, not a live trail inspection.
 * Distance is omitted where the reviewed official source did not establish it.
 * Hours, closures, grooming and lake ice must be checked with the property.
 * Photographs are illustrative regional scenes, never current observations.
 */
const FIELD_GUIDE = {
  horicon: {
    stop: 'Education & Visitor Center · Bachhuber Flowage',
    walk: 'Choose a route from the visitor-center trail map', effort: 'Marsh paths and boardwalk',
    practical: 'Start at the southern state wildlife area for the boardwalk, viewing room and picnic shelter. Building hours differ from outdoor access. The northern federal refuge has separate visitor areas and rules.',
    source: 'https://dnr.wisconsin.gov/topic/Lands/WildlifeAreas/horicon/recreation',
    sources: ['https://dnr.wisconsin.gov/topic/Lands/WildlifeAreas/horicon/birding.html'],
    fees: 'Check the visitor center for exhibit admission; outdoor trail fees not established here.'
  },
  kettle: {
    stop: 'Parnell Tower Trail · County Highway U', walk: '3.5-mile loop', effort: 'Steps and rolling glacial terrain',
    practical: 'Walk through hardwood forest to a 60-foot observation tower. The Parnell parking lot closes in winter; use an officially open winter trailhead instead. Hikers must stay off snow-covered designated ski trails.',
    source: 'https://dnr.wisconsin.gov/topic/parks/kmn/recreation/hiking', fees: 'Wisconsin vehicle admission pass required.'
  },
  devils: {
    stop: 'Tumbled Rocks Trail · west lakeshore', walk: '1 mile one way', effort: 'DNR rating: easiest',
    practical: 'Follow the base of the West Bluff through the lakeside boulder field for lake-level scenery. The easier trail rating does not establish stroller access or safe winter footing.',
    source: 'https://dnr.wisconsin.gov/topic/parks/devilslake/recreation/hiking', fees: 'Wisconsin vehicle admission pass required.'
  },
  peninsula: {
    stop: 'Eagle Trail · Eagle Terrace, Panorama or Tower', walk: '2-mile loop', effort: 'DNR rating: more difficult',
    practical: 'Explore limestone cliffs, forest terraces and Eagle Harbor. Expect steep rocky sections; the full loop is a different outing from simply visiting the tower.',
    source: 'https://dnr.wisconsin.gov/topic/parks/peninsula/recreation/hiking', fees: 'Wisconsin vehicle admission pass required.'
  },
  rib: {
    stop: 'Gray Trail · observation tower', walk: 'Choose a route using the park trail map', effort: 'Short walk options; tower stairs',
    practical: 'The Gray Trail links major features including the 60-foot tower. Its northern section closes during the downhill ski season. For gentler terrain, review the Green Trail rather than the steep south Red Trail.',
    source: 'https://dnr.wisconsin.gov/topic/parks/ribmt/recreation/hiking', fees: 'Wisconsin vehicle admission pass required.'
  },
  copper: {
    stop: 'Doughboys Nature Trail · concession area', walk: '1.7-mile loop; 0.5-mile universal trail option', effort: 'Rock stairs on the full loop',
    practical: 'View Copper Falls, Brownstone Falls and Tyler Forks cascades. Part of the loop closes in winter. Pets are prohibited on Doughboys; Red Granite Falls Trail is the pet-friendly waterfall alternative.',
    source: 'https://dnr.wisconsin.gov/topic/parks/copperfalls/recreation/hiking', fees: 'Wisconsin vehicle admission pass required.'
  },
  apostle: {
    stop: 'Meyers Beach · Lakeshore Trail to the Crevasse', walk: '3.6 miles round trip to the Crevasse', effort: 'Rugged ravines, roots and narrow bridges',
    practical: 'The first 0.7 mile has boardwalk, steps and bridges; the remainder to the first cave views is more demanding. Stay back from cliff edges. Winter trail use does not establish ice-cave access.',
    source: 'https://www.nps.gov/apis/planyourvisit/hiking.htm',
    sources: ['https://www.nps.gov/apis/planyourvisit/fees.htm'],
    fees: 'Meyers Beach parking: $5 per day for vehicles under 20 feet; $8 for longer vehicles, including trailers.'
  },
  pattison: {
    stop: 'Big Manitou Falls overlooks · main picnic area', walk: '0.5-mile overlook trail', effort: 'Short trails to river overlooks',
    practical: 'Use the pedestrian tunnel under Highway 35 to reach views from both sides of the river. The separate River Trail descends steeply; it is not the same as the overlook route.',
    source: 'https://dnr.wisconsin.gov/topic/parks/pattison/recreation/hiking', fees: 'Wisconsin vehicle admission pass required.'
  },
  gooseberry: {
    stop: 'Fifth Falls Trail · visitor center', walk: '2-mile loop', effort: 'River and woodland hiking',
    practical: 'Head upstream beyond the busier main waterfalls to Fifth Falls. For a shorter visit, use the official self-guided waterfall walk near the visitor center. Check the park map for route and winter restrictions.',
    source: 'https://www.dnr.state.mn.us/state-parks/itineraries/north-shore-waterfall-itinerary.html',
    sources: ['https://files.dnr.state.mn.us/maps/state_parks/spk00172_summer.pdf'], fees: 'Minnesota vehicle permit rules apply; check the park for designated wayside parking exceptions.'
  },
  tettegouche: {
    stop: 'Shovel Point · visitor center trailhead', walk: 'Choose your turnaround using the official trail map', effort: 'Cliffside trail and stairs',
    practical: 'Follow the shoreline route from the visitor center for elevated Lake Superior views. Keep to established paths and overlooks; visitor-center opening hours are separate from trail access.',
    source: 'https://www.dnr.state.mn.us/state-parks/park.html?id=spk00269', fees: 'Minnesota vehicle permit rules apply; check wayside parking exceptions.'
  },
  itasca: {
    stop: 'Mississippi River headwaters · historic marker', walk: 'Short headwaters-area paths; use the park map', effort: 'Choose a dry-land route',
    practical: 'See where Lake Itasca becomes the Mississippi and follow the riverside boardwalk. Wading is optional, not part of the walking route. Do not treat open water in winter as proof of safe footing or lake ice.',
    source: 'https://www.dnr.state.mn.us/state-parks/itasca/headwaters.html', fees: 'Minnesota vehicle permit required.'
  },
  voyageurs: {
    stop: 'Rainy Lake Visitor Center · Recreation Trail', walk: '1.7 miles one way', effort: 'Paved multi-use trail',
    practical: 'A land-access option linking the visitor center to Highway 11 through woods and rock outcrops. Verify visitor-center hours and night access separately. No boat trip is needed for this trail.',
    source: 'https://www.nps.gov/voya/learn/news/voyageurs-national-park-announces-the-opening-of-the-rainy-lake-recreation-trail.htm', fees: 'Check NPS for current permits and activity fees.',
    image: 'assets/photos/aurora-lake.webp', imageAlt: 'Northern lights over Kabetogama Lake elsewhere in Voyageurs National Park; illustrative, not current'
  },
  splitrock: {
    stop: 'Little Two Harbors Trail · Lake Superior shore', walk: '0.75 mile one way', effort: 'Shoreline trail; review the map for stairs',
    practical: 'Explore the shoreline below the lighthouse and the remains of the former fishing settlement. The lighthouse historic site is managed separately by the Minnesota Historical Society.',
    source: 'https://files.dnr.state.mn.us/maps/state_parks/spk00266_summer.pdf',
    sources: ['https://www.dnr.state.mn.us/state-parks/split-rock-lighthouse/things-to-do.html'], fees: 'State park vehicle permit and lighthouse historic-site admission are separate.'
  },
  porkies: {
    stop: 'Lake of the Clouds overlook', walk: 'Start with the signed overlook route', effort: 'Choose the overlook before committing to longer trails',
    practical: 'Use the official park map to distinguish the overlook from the longer Escarpment and backcountry routes. Check seasonal road access before driving to the overlook. The visitor center has seasonal opening dates.',
    source: 'https://www.michigan.gov/recsearch/parks/porkies',
    sources: ['https://www.michigan.gov/dnr/places/v-centers/porkies'], fees: 'Michigan Recreation Passport required for vehicle entry.'
  },
  pictured: {
    stop: 'Miners Falls Trail · Miners Falls parking area', walk: '1.2 miles round trip', effort: 'Fairly level approach; stairs to lower platform',
    practical: 'Walk through northern forest to the falls overlooks. Munising Falls has a posted trail washout closure; check NPS alerts before choosing that alternative. Seasonal roads can limit winter access to Miners Falls.',
    source: 'https://www.nps.gov/piro/planyourvisit/hikes.htm',
    sources: ['https://www.nps.gov/places/munising-falls.htm'], fees: 'National lakeshore entrance pass required; consult NPS for current rates.',
    image: 'assets/photos/miners-castle.webp', imageAlt: 'Miners Castle on the Pictured Rocks shoreline; a separate stop from Miners Falls'
  },
  tahquamenon: {
    stop: 'Upper Falls · paved viewing-area trail', walk: '0.25 mile to viewing areas', effort: 'Paved approach; optional gorge stairs',
    practical: 'The Upper Falls viewpoint is a shorter outing than hiking between Upper and Lower Falls. A separate 900-foot boardwalk reaches the brink platform; the downstream gorge route includes 181 steps.',
    source: 'https://www.michigan.gov/dnr/places/v-centers/tahquamenon', fees: 'Michigan Recreation Passport required for vehicle entry.'
  },
  sleepingbear: {
    stop: 'Pyramid Point Trail · bluff overlook', walk: '1.2 miles round trip to overlook; 2.7-mile full loop', effort: 'Hilly forest and bluff terrain',
    practical: 'The overlook spur is about 0.6 mile from the trailhead. Remain at the designated viewing area rather than descending the steep dune to Lake Michigan. Check seasonal road and trail conditions.',
    source: 'https://www.nps.gov/places/000/pyramid-point-trail.htm', fees: 'National lakeshore entrance pass required; consult NPS for current rates.',
    image: 'assets/photos/sleeping-bear.webp', imageAlt: 'Glen Lakes overlook in Sleeping Bear Dunes; illustrative regional scenery'
  },
  ludington: {
    stop: 'Big Sable Point Lighthouse · Lighthouse Path', walk: '3.6 miles round trip', effort: 'Sand-and-gravel path',
    practical: 'Reach the lighthouse on foot or by bike along the 1.8-mile one-way path. Visiting the surrounding shoreline and climbing the tower are separate activities; tower hours and admission are seasonal.',
    source: 'https://www.michigan.gov/recsearch/parks/ludington', fees: 'Michigan Recreation Passport required; lighthouse tower admission is separate.'
  }
};
for (const guide of Object.values(FIELD_GUIDE)) {
  guide.checkedAt = '2026-10-16';
  guide.hours = 'Confirm current property hours, notices and seasonal access before departure.';
}
const GUIDE_SCENES = {
  explore: {src:'assets/photos/pictured-rocks.webp',caption:'Pictured Rocks · Lake Superior, Michigan',credit:'NPS · public domain',source:'https://www.nps.gov/piro/index.htm'},
  fall: {src:'assets/photos/autumn-shore.webp',caption:'Autumn at Miners Beach & Elliot Falls · Michigan',credit:'NPS · public domain',source:'https://www.nps.gov/piro/index.htm'},
  aurora: {src:'assets/photos/aurora-lake.webp',caption:'Northern lights over Kabetogama Lake · Minnesota',credit:'NPS / Dimse · public domain',source:'https://www.nps.gov/voya/learn/nature/northern-lights.htm'},
  winter: {src:'assets/photos/winter-forest.webp',caption:'Snowshoes in Voyageurs National Park · Minnesota',credit:'NPS · public domain',source:'https://www.nps.gov/voya/planyourvisit/winter-activities.htm'},
  weather: {src:'assets/photos/sleeping-bear.webp',caption:'Glen Lakes overlook · Sleeping Bear Dunes, Michigan',credit:'NPS · public domain',source:'https://www.nps.gov/slbe/index.htm'},
  photos: {src:'assets/photos/miners-castle.webp',caption:'Miners Castle · Pictured Rocks, Michigan',credit:'NPS · public domain',source:'https://www.nps.gov/piro/index.htm'},
  saved: {src:'assets/photos/pictured-rocks.webp',caption:'Pictured Rocks · Lake Superior, Michigan',credit:'NPS · public domain',source:'https://www.nps.gov/piro/index.htm'}
};
if (typeof module !== 'undefined') module.exports = {FIELD_GUIDE, GUIDE_SCENES};
