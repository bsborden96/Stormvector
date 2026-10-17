/* Location-first discovery. No time budgets or itinerary workflow. */
const Nearby=(()=>{
  const $=id=>document.getElementById(id);
  function init(){}
  function observe(){}
  function route(next){$('nearbyPanel').hidden=['photos','saved','weather'].includes(next);sync();}
  function sync(){
    const panel=$('nearbyPlaces');if(!panel)return;
    $('nearbyTitle').textContent=`Near ${origin.name}`;
    $('nearbyStatus').textContent=`${regionNames[$('regionFilter').value]||'Wisconsin · Minnesota · Michigan · UP'} · closest places first`;
    const places=Nature.filterPlaces(DESTINATIONS,filters()).sort((a,b)=>a.distance-b.distance).slice(0,6);panel.replaceChildren();
    for(const p of places){
      const card=el('article',null,'nearby-card'),f=forecastCache.peek(forecastKey(p)),day=f?.days.find(d=>d.date===selectedDate());
      card.append(el('p',`${regionNames[p.region]} · ${Math.round(p.distance)} mi away`,'eyebrow'),el('h3',p.name),el('p',p.summary));
      if(day)card.append(el('p',`${Nature.weather(day.code)[0]} · ${fmt(day.high,'°F')} · ${fmt(day.rainChance,'%')} rain`,'nearby-weather'));
      card.append(button('See this place ↗',()=>{selectDestination(p);openSheet();},'text-button'));panel.append(card);
    }
    if(!places.length)panel.append(el('p','No places match. Try another region or widen the filters.','empty-state'));
  }
  return {init,observe,route,sync};
})();
