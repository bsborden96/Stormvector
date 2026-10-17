/* Shared location handling for the guide and photo pin. Never substitutes a city/IP fix. */
const Locator = (()=>{
  function request(success,failure,status=()=>{},geo=typeof navigator!=='undefined'?navigator.geolocation:null) {
    if(typeof isSecureContext!=='undefined'&&!isSecureContext){failure('Location needs a secure connection. Open StormVector using its https:// address.');return;}
    if(!geo){failure('Location is unavailable here. Open this page in Safari or Chrome, or enter a city.');return;}
    let finished=false;
    const done=pos=>{
      if(finished)return;
      if(!Number.isFinite(pos?.coords?.latitude)||!Number.isFinite(pos?.coords?.longitude)){fail({code:2});return;}
      finished=true;success(pos);
    };
    const fail=error=>{
      if(finished)return;finished=true;
      failure(error.code===1?'Location permission is blocked. On iPhone, allow location for this website in Safari and enable Location Services. On Android, allow location for Chrome. Then try again, or enter a city.':error.code===3?'Location timed out. Open this page directly in Safari or Chrome and try again, or enter a city.':'Your device could not get a location. Open this page in Safari or Chrome, check Location Services, and try again or enter a city.');
    };
    const fallback=error=>{
      if(finished)return;if(error.code===1){fail(error);return;}
      status('Precise GPS is taking too long. Trying the device’s standard location…');
      try{geo.getCurrentPosition(done,fail,{enableHighAccuracy:false,timeout:12000,maximumAge:60000});}catch{fail({code:2});}
    };
    try{geo.getCurrentPosition(done,fallback,{enableHighAccuracy:true,timeout:10000,maximumAge:0});}catch{fail({code:2});}
  }
  return {request};
})();
if(typeof module!=='undefined')module.exports=Locator;
