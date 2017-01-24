function initMap() {
  var berlin = { lat: 52.508704, lng: 13.391898 };
  var map = new google.maps.Map(document.getElementById('map'), {
    zoom: 13,
    center: berlin
  });
  var heatmap = new google.maps.visualization.HeatmapLayer({
    data: [
      { location: new google.maps.LatLng(52.512, 13.402), weight: 2 },
      { location: new google.maps.LatLng(52.506, 13.383), weight: 1 },
      { location: new google.maps.LatLng(52.5, 13.4), weight: 0.5 },
      { location: new google.maps.LatLng(52.508, 13.39), weight: 4 },
      { location: new google.maps.LatLng(52.516, 13.41), weight: 1 }
    ],
    radius: 50
  });
  heatmap.setMap(map);
}
