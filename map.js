// Import Mapbox and D3
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';

console.log("Mapbox GL JS Loaded:", mapboxgl);

// Set your Mapbox access token
mapboxgl.accessToken = 'pk.eyJ1IjoiaHZ1b25nIiwiYSI6ImNtN2szcjJ1eDAzZGEyanEyanEzd3FzamoifQ.ny2PnjgJgsn1wFS19tPquw';

// Initialize the map
const map = new mapboxgl.Map({
  container: 'map', 
  style: 'mapbox://styles/mapbox/streets-v12', 
  center: [-71.09415, 42.36027], 
  zoom: 12,
  minZoom: 5,
  maxZoom: 18
});

// Ensure an SVG layer exists inside the map container
const svg = d3.select('#map').select('svg');
if (svg.empty()) {
  svg = d3.select('#map').append('svg')
    .style('position', 'absolute')
    .style('top', 0)
    .style('left', 0)
    .style('width', '100%')
    .style('height', '100%')
    .style('pointer-events', 'none'); 
}

// 📍 **Helper Function: Convert Lon/Lat to Pixel Coordinates**
function getCoords(station) {
  const point = new mapboxgl.LngLat(+station.lon, +station.lat);
  const { x, y } = map.project(point);
  return { cx: x, cy: y };
}

// 📌 **Helper Function: Convert Date to Minutes Since Midnight**
function minutesSinceMidnight(date) {
  return date.getHours() * 60 + date.getMinutes();
}

// 📊 **Helper Function: Compute Station Traffic**
function computeStationTraffic(stations, trips) {
  const departures = d3.rollup(trips, v => v.length, d => d.start_station_id);
  const arrivals = d3.rollup(trips, v => v.length, d => d.end_station_id);

  return stations.map((station) => {
    let id = station.short_name;
    station.arrivals = arrivals.get(id) ?? 0;
    station.departures = departures.get(id) ?? 0;
    station.totalTraffic = station.arrivals + station.departures;
    return station;
  });
}

// 🔍 **Helper Function: Filter Trips by Time**
function filterTripsByTime(trips, timeFilter) {
  return timeFilter === -1 ? trips : trips.filter(trip => {
    const startedMinutes = minutesSinceMidnight(trip.started_at);
    const endedMinutes = minutesSinceMidnight(trip.ended_at);
    return (
      Math.abs(startedMinutes - timeFilter) <= 60 ||
      Math.abs(endedMinutes - timeFilter) <= 60
    );
  });
}

// 📌 **Format Time for Display**
function formatTime(minutes) {
  const date = new Date(0, 0, 0, 0, minutes);
  return date.toLocaleString('en-US', { timeStyle: 'short' });
}

// Load the data and create the map visualization
map.on('load', async () => { 
  console.log("Map loaded, adding bike lanes...");
  // 🎨 **Traffic Flow Scale (Departure Ratio)**
  let stationFlow = d3.scaleQuantize()
    .domain([0, 1]) 
    .range([0, 0.5, 1]);  // 0 = more arrivals, 0.5 = balanced, 1 = more departures

  // 🚲 **Boston & Cambridge Bike Lanes**
  map.addSource('boston_bike_lanes', {
    type: 'geojson',
    data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson'
  });

  map.addSource('cambridge_bike_lanes', {
    type: 'geojson',
    data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson'
  });

  // 🎨 **Style for Bike Lanes**
  const bikeLaneStyle = {
    'line-color': '#32D400',
    'line-width': 3,
    'line-opacity': 0.7
  };

  map.addLayer({
    id: 'boston-bike-lanes',
    type: 'line',
    source: 'boston_bike_lanes',
    paint: bikeLaneStyle
  });

  map.addLayer({
    id: 'cambridge-bike-lanes',
    type: 'line',
    source: 'cambridge_bike_lanes',
    paint: bikeLaneStyle
  });

  console.log("✅ Boston & Cambridge bike lanes added!");

  // 🚲 **Load Station Data**
  const stationUrl = 'https://dsc106.com/labs/lab07/data/bluebikes-stations.json';
  const jsonData = await d3.json(stationUrl);
  let stations = jsonData.data.stations;

  // 📥 **Load and Parse Traffic Data**
  let trips = await d3.csv('https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv', trip => {
    trip.started_at = new Date(trip.started_at);
    trip.ended_at = new Date(trip.ended_at);
    return trip;
  });

  console.log("✅ Loaded traffic data:", trips.length, "trips");

  // Compute station traffic for all trips
  stations = computeStationTraffic(stations, trips);

  // 🎯 **Create a Scale for Circle Size**
  const radiusScale = d3.scaleSqrt()
    .domain([0, d3.max(stations, d => d.totalTraffic)])
    .range([0, 25]);

  // 🎯 **Create Circles**
  const circles = svg.selectAll('circle')
  .data(stations, d => d.short_name)
  .enter()
  .append('circle')
  .attr('r', d => radiusScale(d.totalTraffic))
  .attr('fill', 'steelblue')
  .attr('stroke', 'white')
  .attr('stroke-width', 1)
  .attr('opacity', 0.6)
  .style("--departure-ratio", d => 
    d.totalTraffic > 0 ? stationFlow(d.departures / d.totalTraffic) : 0.5 // Default to balanced if no traffic
  )
  
  .style('pointer-events', 'auto');


  function updatePositions() {
    circles.attr('cx', d => getCoords(d).cx)
           .attr('cy', d => getCoords(d).cy);
  }

  updatePositions();
  map.on('move', updatePositions);
  map.on('zoom', updatePositions);
  map.on('resize', updatePositions);
  map.on('moveend', updatePositions);

  // 💬 **Add Tooltips**
  circles.each(function(d) {
    d3.select(this).append('title')
      .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
  });

  // 📌 **Time Filtering Elements**
  const timeSlider = document.querySelector('#time-slider');
  const selectedTime = document.querySelector('#selected-time');
  const anyTimeLabel = document.querySelector('#any-time');

  function updateTimeDisplay() {
    let timeFilter = Number(timeSlider.value);
    selectedTime.textContent = timeFilter === -1 ? '' : formatTime(timeFilter);
    anyTimeLabel.style.display = timeFilter === -1 ? 'block' : 'none';
    updateScatterPlot(timeFilter);
  }

  function updateScatterPlot(timeFilter) {
    const filteredTrips = filterTripsByTime(trips, timeFilter);
    const filteredStations = computeStationTraffic(stations, filteredTrips);
    
    timeFilter === -1 ? radiusScale.range([0, 25]) : radiusScale.range([3, 50]);
  
    circles.data(filteredStations, d => d.short_name)
    .join('circle')
    .transition().duration(500)
    .attr('r', d => radiusScale(d.totalTraffic))
    .style("--departure-ratio", d => 
      d.totalTraffic > 0 ? stationFlow(d.departures / d.totalTraffic) : 0.5
    );  // Default to 0.5 (balanced) when traffic is zero

  }
  

  timeSlider.addEventListener('input', updateTimeDisplay);
  updateTimeDisplay();
});
