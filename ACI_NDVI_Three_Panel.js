/////////////////////////////////////////////////////////////////////////////////////////////////////////
///
/// Modified by T. Mayer 9/14/25 NASA EarthRISE Sewanee Colab
///
/////////////////////////////////////////////////////////////////////////////////////////////////////////


var aci_base_aoi = ee.Geometry.Polygon([
  [
    [-85.63991266083983, 35.23585969322009],
    [-85.62326150727537, 35.23585969322009],
    [-85.62326150727537, 35.24987950738506],
    [-85.63991266083983, 35.24987950738506],
    [-85.63991266083983, 35.23585969322009]
  ]
]);

// Optional: Add to map to visualize
// Map.centerObject(aoi);
Map.addLayer(aci_base_aoi, {color: 'red'}, 'aci_base_aoi',false);


var geometry = aci_base_aoi


var startDate = '2018-01-01'
var endDate = '2021-12-31'

Map.addLayer(aci_base_aoi, {}, "Domain bounds",false)
Map.centerObject(aci_base_aoi, 14)
// var ndviVisDetailed = {
//   min: -1,
//   max: 1,
//   palette: [
//     'FFFFFF', // White (for very low or no vegetation)
//     'CE7E45', // Light brown
//     'DF923D', // Orange-brown
//     'F1B555', // Yellowish-brown
//     'FCD163', // Light yellow
//     '99B718', // Light green
//     '74A901', // Green
//     '66A000', // Darker green
//     '529400', // Even darker green
//     '3E8601', // Darkest green (for high vegetation)
//   ]
// };

var ndviVisDetailed = {
  min: -1,
  max: 1,
  palette: [
    'ffffe5', // Very low NDVI / sparse vegetation
    'f7fcb9',
    'd9f0a3',
    'addd8e',
    '78c679',
    '41ab5d',
    '238443',
    '006837',
    '004529'  // Very high NDVI / dense vegetation
  ]
};



// Create three separate map panels
var leftMap = ui.Map();
var centerMap = ui.Map();
var rightMap = ui.Map();


// // Set initial center and zoom
// var initCenter = ee.Geometry.Point([-85.95, 35.22]);
// leftMap.setCenter(0, 0, 2);
// centerMap.setCenter(0, 0, 2);
// rightMap.setCenter(0, 0, 2);



// Get the centroid as an ee.Geometry.Point
var domainCentroid = geometry.centroid();

// Evaluate coordinates and center the maps
domainCentroid.coordinates().getInfo(function(coords) {
  var lon = coords[0];
  var lat = coords[1];

  leftMap.setCenter(lon, lat, 14);
  centerMap.setCenter(lon, lat, 14);
  rightMap.setCenter(lon, lat, 14);
});

leftMap.setOptions('SATELLITE');
centerMap.setOptions('SATELLITE');
rightMap.setOptions('SATELLITE');

////////////////////////////////////////////////////////////////////////////////////////

var collection = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
  .filterDate(startDate, endDate) // Filter for dates between Jan 1, 2018 and Jan 1, 2023.
  .filterBounds(geometry) // Filter by the defined point.
  .filterMetadata('CLOUD_COVER', 'less_than', 20); // Filter for images with less than 20% cloud cover.

var ls_scale = collection.first().projection().nominalScale();
print('Nominal scale of the ls_scale (meters):', ls_scale); 

function maskL7L8(image) {
  //Bits 3 and 5 are cloud shadow and cloud, respectively.
  var cloudShadowBitMask = (1 << 4);
  var cloudsBitMask = (1 << 3);
  // Get the pixel QA band.
  var qa = image.select('QA_PIXEL');
  // Both flags should be set to zero, indicating clear conditions.
  var mask = qa.bitwiseAnd(cloudShadowBitMask).eq(0)
               .and(qa.bitwiseAnd(cloudsBitMask).eq(0));
  return image.updateMask(mask);
}

collection.map(maskL7L8)

// 3. Create a function to add an NDVI band
var addNDVI = function(image) {
  var ndvi = image.normalizedDifference(['SR_B5', 'SR_B4']).rename('NDVI'); // NIR band is B5, Red band is B4 for Landsat 8.
  return image.addBands(ndvi);
};

// Apply the function to the image collection
var withNDVI = collection.map(addNDVI)

var ls_image = withNDVI.median().clip(geometry)

/////////////
// Create the chart
var chart = ui.Chart.image.series({ // Charting an image time series.
  imageCollection: withNDVI.select('NDVI'), // Select the NDVI band for the chart.
  region: geometry, // Chart data at the defined point.
  reducer: ee.Reducer.mean(), // Calculate the mean NDVI within the region.
  scale: 30 // Scale in meters for the reducer.
});

// Set chart options and display
chart.setOptions({ // Customize chart appearance.
  title: 'LS NDVI over time across the split creek watershed',
  vAxis: {title: 'NDVI'}, // Y-axis label.
  hAxis: {title: 'Date', format: 'YYYY-MM-dd'}, // X-axis label and format.
  lineWidth: 2, // Line width.
  pointSize: 3 // Point size.
});

//////////////////////////////////////////////////////////////////////////////////////////////////

var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
                  .filterDate(startDate, endDate)
                  // Pre-filter to get less cloudy granules.
                  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE',20)).filterBounds(geometry);
                  // .map(maskS2clouds);

var s2_scale = s2.first().select('B4').projection().nominalScale();
print('Nominal scale of the s2_scale (meters):', s2_scale); 

function maskS2clouds(image) {
  var qa = image.select('QA60');

  // Bits 10 and 11 are clouds and cirrus, respectively.
  var cloudBitMask = 1 << 10;
  var cirrusBitMask = 1 << 11;

  // Both flags should be set to zero, indicating clear conditions.
  var mask = qa.bitwiseAnd(cloudBitMask).eq(0)
      .and(qa.bitwiseAnd(cirrusBitMask).eq(0));

  return image.updateMask(mask).divide(10000).copyProperties(image, image.propertyNames());
}

var s2 = s2.map(maskS2clouds);


var addNDVI = function(image) {
  var ndvi = image.normalizedDifference(['B8', 'B4']).rename('NDVI');
  return image.addBands(ndvi);
};

// Apply the NDVI function to the image collection.
var s2withNDVI = s2.map(addNDVI);

var s2_image = s2withNDVI.median().clip(geometry)

////////

var chart_s2 = ui.Chart.image.series({
  imageCollection: s2withNDVI.select('NDVI'), // Select the 'NDVI' band for charting.
  region: geometry, // Use your defined region of interest.
  reducer: ee.Reducer.mean(), // Calculate the mean NDVI within the ROI for each image.
  scale: 10 // Sentinel-2's resolution is 10 meters, so we use that as the scale.
});


chart_s2.setOptions({
  title: 'Sentinel-2 NDVI over time across the split creek watershed',
  vAxis: {title: 'NDVI'},
  hAxis: {title: 'Date', format: 'YYYY-MM-dd'},
  lineWidth: 1,
  pointSize: 3,
  colors: ['e37d05']
});


/////////////////////////////////////////////////////////////////////////////////////////////////

var naip = ee.ImageCollection('USDA/NAIP/DOQQ').filterDate(startDate, endDate).filterBounds(geometry);
var naip_scale = naip.first().projection().nominalScale();
print('Nominal scale of the naip_scale (meters):', naip_scale); 

// 3. Create a function to add an NDVI band
var addNDVI = function(image) {
  var ndvi = image.normalizedDifference(['N', 'R']).rename('NDVI'); // NIR band is B5, Red band is B4 for Landsat 8.
  return image.addBands(ndvi).copyProperties(image, image.propertyNames());
};

// Apply the function to the image collection
var NAIPwithNDVI = naip.map(addNDVI); // Apply the addNDVI function to every image in the collection.


var NAIP_image = NAIPwithNDVI.median().clip(geometry)
////

var naipchart = ui.Chart.image.series({ // Charting an image time series.
  imageCollection: NAIPwithNDVI.select('NDVI'), // Select the NDVI band for the chart.
  region: geometry, // Chart data at the defined point.
  reducer: ee.Reducer.mean(), // Calculate the mean NDVI within the region.
  scale:1 // Scale in meters for the reducer.
});



naipchart.setOptions({ // Customize chart appearance.
  title: 'NAIP NDVI over time across the split creek watershed',
  vAxis: {title: 'NDVI'}, // Y-axis label.
  hAxis: {title: 'Date', format: 'YYYY-MM-dd'}, // X-axis label and format.
  lineWidth: 2, // Line width.
  pointSize: 3 // Point size.
});
///////////////////////////////////////////////////////////////////////////////////////////////
print("Temporal range of analysis:", startDate,  endDate)
print("Note NDVI is a median composite bounded by start and end dates adjust as needed")
print("Note the spatial resolution and temporal resolution trade offs displayed in the NDVI trend graphs")
print("Color ramps applied with a gamma 100% stretch [range -1 to 1]")
/////////////////////////////////////////////////////////////////////////////////////////////////


// Add layers to respective maps
leftMap.addLayer(ls_image.select('NDVI'), ndviVisDetailed, 'NDVI ls annual median composite cloud filtered');  //imageVisParam  //ndviVisDetailed
// leftMap.addLayer(styledFc.style({styleProperty: 'style'}), {}, 'Species colored features');
centerMap.addLayer(s2_image.select('NDVI'), ndviVisDetailed, 'NDVI S2 annual median composite cloud filtered');
// centerMap.addLayer(styledFc.style({styleProperty: 'style'}), {}, 'Species colored features');
rightMap.addLayer(NAIP_image.select('NDVI'), ndviVisDetailed, 'NDVI NAIP ls annual median composite cloud filtered');
// rightMap.addLayer(styledFc.style({styleProperty: 'style'}), {}, 'Species colored features');

// Link map controls (optional sync)
var linker = ui.Map.Linker([leftMap, centerMap, rightMap]);

// Create a three-panel horizontal layout
// var panel = ui.Panel([
//   ui.Panel([leftMap], null, {stretch: 'both'}),
//   ui.Panel([centerMap], null, {stretch: 'both'}),
//   ui.Panel([rightMap], null, {stretch: 'both'})
// ], ui.Panel.Layout.Flow('horizontal'), {stretch: 'both'});


// Create vertical panels: each with a map and corresponding chart
var leftPanel = ui.Panel([
  ui.Label('Landsat 8 NDVI', {fontWeight: 'bold'}),
  leftMap,
  chart
], ui.Panel.Layout.Flow('vertical'), {stretch: 'both'});

var centerPanel = ui.Panel([
  ui.Label('Sentinel-2 NDVI', {fontWeight: 'bold'}),
  centerMap,
  chart_s2
], ui.Panel.Layout.Flow('vertical'), {stretch: 'both'});

var rightPanel = ui.Panel([
  ui.Label('NAIP NDVI', {fontWeight: 'bold'}),
  rightMap,
  naipchart
], ui.Panel.Layout.Flow('vertical'), {stretch: 'both'});

// Combine into the main horizontal panel
var panel = ui.Panel([
  leftPanel,
  centerPanel,
  rightPanel
], ui.Panel.Layout.Flow('horizontal'), {stretch: 'both'});
///////////////////////////////////////////////////////////////////////////


print('Charting of NDVI across all EO, bounded by time, per species')
///Chart per NDVI per speices

// Assuming your NDVI images are defined like this:
var sources = {
  LS: ls_image,
  S2: s2_image,
  NAIP: NAIP_image
};


///////////////////////////////////////////////////////////////////////////

// Set the UI root
ui.root.clear();
ui.root.add(panel);

////////////////////////////////////////////////////////////////////////////

// Container for both NDVI and Species legends
var legendContainer = ui.Panel({
  layout: ui.Panel.Layout.Flow('vertical'),
  style: {
    position: 'bottom-right',
    padding: '0px',
    margin: '0px',
    backgroundColor: 'rgba(255, 255, 255, 0)', // transparent to show individual panel backgrounds
  }
});

// NDVI Legend Panel
var ndviLegend = ui.Panel({
  style: {
    padding: '8px 15px',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    border: '1px solid black',
    maxHeight: '250px',
    width: '140px'
  }
});

// NDVI Legend title
var legendTitle = ui.Label({
  value: 'NDVI Legend',
  style: {fontWeight: 'bold', margin: '0 0 4px 0', fontSize: '12px'}
});
ndviLegend.add(legendTitle);

// Palette and corresponding labels
var palette = ndviVisDetailed.palette;
var names = ['No Veg', 'Very Low', 'Low', 'Mod-Low', 'Mod', 'Mod-High', 'High', 'V. High', 'Dense', 'Max Veg'];

for (var i = 0; i < palette.length; i++) {
  var colorBox = ui.Label({
    style: {
      backgroundColor: '#' + palette[i],
      padding: '8px',
      margin: '0 4px 0 0'
    }
  });

  var description = ui.Label({
    value: names[i],
    style: {margin: '0 0 4px 0', fontSize: '11px'}
  });

  var legendItem = ui.Panel({
    widgets: [colorBox, description],
    layout: ui.Panel.Layout.Flow('horizontal')
  });

  ndviLegend.add(legendItem);
}

// Add NDVI legend to container
legendContainer.add(ndviLegend);


// Add combined legend container to the root
ui.root.add(legendContainer);
////////////////////////////////////


