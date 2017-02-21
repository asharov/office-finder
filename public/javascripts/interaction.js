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
});
