jQuery(function() {
  let mapToggle = jQuery('#heatmapToggle');
  let listToggle = jQuery('#weightlistToggle');
  mapToggle.click(function() {
    jQuery('#list').hide();
    jQuery('#map').show();
  });
  listToggle.click(function() {
    jQuery('#map').hide();
    jQuery('#list').show();
  });

  function onItemSelected(index) {
    loadHeatmap(index);
  }

  jQuery('.heatmapstyle').each(function(index, radio) {
    jQuery(radio).on('click', onItemSelected.bind(null, index));
  })
});
