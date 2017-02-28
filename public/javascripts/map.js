let map = null;

function loadHeatmap(index) {
  if (map) {
    jQuery.getJSON('/heatmap/' + index, null, function(stationWeights) {
      let topStationWeights = stationWeights.slice(0, 10);
      const smallestWeight = topStationWeights[0].weight;
      const fractionDigits = smallestWeight < 1 ? 4
        : smallestWeight < 10 ? 3
        : smallestWeight < 100 ? 2
        : smallestWeight < 1000 ? 1 : 0;
      let formatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: fractionDigits });
      let tableContent = '<tr><th>Location</th><th>Weight</th></tr>';
      for (let stationWeight of topStationWeights) {
        const formattedWeight = formatter.format(stationWeight.weight);
        tableContent += '<tr><td>' + stationWeight.station + '</td><td>' + formattedWeight + '</td></tr>';
      }
      document.getElementById('list').innerHTML = tableContent;
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
}

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
      map = new google.maps.Map(document.getElementById('map'), {
        zoom: 12,
        center: result.geometry.location
      });
      map.fitBounds(result.geometry.viewport);
      loadHeatmap(0);
    }
  });
}
