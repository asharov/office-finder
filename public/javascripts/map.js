function initMap() {
  var berlin = { lat: 52.508704, lng: 13.391898 };
  var map = new google.maps.Map(document.getElementById('map'), {
    zoom: 13,
    center: berlin
  });
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
