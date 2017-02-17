function initMap() {
  let geocoderComponents = {
    country: countryCode
  };
  let geocoderRequest = {
    address: city,
    componentRestrictions: geocoderComponents
  };
  let geocoder = new google.maps.Geocoder();
  geocoder.geocode(geocoderRequest, function(results, status) {
    if (status === google.maps.GeocoderStatus.OK) {
      let result = results[0];
      console.log(JSON.stringify(result));
      let map = new google.maps.Map(document.getElementById('map'), {
        zoom: 12,
        center: result.geometry.location
      });
      map.fitBounds(result.geometry.viewport);
      jQuery.getJSON('/heatmap', null, function(stationWeights) {
        let data = stationWeights.map(function(stationWeight) {
          return {
            location: new google.maps.LatLng(stationWeight.latitude, stationWeight.longitude),
            weight: 1 / stationWeight.weight
          };
        });
        const maxWeight = data.
          map(function(sw) { return sw.weight; }).
          reduce(function(a, b) { return Math.max(a, b); }, 0);
        data = data.map(function(sw) {
          return {
            location: sw.location,
            weight: sw.weight * 10 / maxWeight
          };
        });
        let heatmap = new google.maps.visualization.HeatmapLayer({
          data: data,
          radius: 50
        });
        heatmap.setMap(map);
      });
    }
  });
}
