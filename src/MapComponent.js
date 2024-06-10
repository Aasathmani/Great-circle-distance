import React, { useEffect, useRef, useState } from 'react';
import 'ol/ol.css';
import { Map, View } from 'ol';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import { fromLonLat, toLonLat } from 'ol/proj';
import { LineString } from 'ol/geom';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Stroke, Style } from 'ol/style';
import { Draw, Modify, Snap } from 'ol/interaction';

const calculateGreatCirclePath = (latlng1, latlng2, numPoints = 50) => {
  const toRadians = (degrees) => degrees * (Math.PI / 180);
  const toDegrees = (radians) => radians * (180 / Math.PI);

  const lat1 = toRadians(latlng1.lat);
  const lon1 = toRadians(latlng1.lng);
  const lat2 = toRadians(latlng2.lat);
  const lon2 = toRadians(latlng2.lng);

  const d = 2 * Math.asin(
    Math.sqrt(
      Math.sin((lat2 - lat1) / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2
    )
  );

  const waypoints = [];
  for (let i = 0; i <= numPoints; i++) {
    const f = i / numPoints;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);

    const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
    const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);

    const lat = Math.atan2(z, Math.sqrt(x * x + y * y));
    const lon = Math.atan2(y, x);

    waypoints.push({ lat: toDegrees(lat), lng: toDegrees(lon) });
  }

  return waypoints;
};

const calculateRhumbDistance = (latlng1, latlng2) => {
  const R = 6371.0; // Earth's radius in kilometers
  const toRadians = (degrees) => degrees * (Math.PI / 180);

  const φ1 = toRadians(latlng1.lat);
  const φ2 = toRadians(latlng2.lat);
  const Δφ = φ2 - φ1;
  let Δλ = toRadians(latlng2.lng - latlng1.lng);

  // Ensure Δλ is in the range [-π, π]
  if (Math.abs(Δλ) > Math.PI) {
    Δλ = Δλ > 0 ? -(2 * Math.PI - Δλ) : (2 * Math.PI + Δλ);
  }

  const Δψ = Math.log(Math.tan(Math.PI / 4 + φ2 / 2) / Math.tan(Math.PI / 4 + φ1 / 2));
  const q = Math.abs(Δψ) > 10e-12 ? Δφ / Δψ : Math.cos(φ1);

  const distance = Math.sqrt(Δφ * Δφ + q * q * Δλ * Δλ) * R;

  return distance; // Distance in kilometers
};

const calculateGreatCircleDistance = (latlng1, latlng2) => {
  const R = 6371.0; // Earth's radius in kilometers
  const toRadians = (degrees) => degrees * (Math.PI / 180);

  const lat1 = toRadians(latlng1.lat);
  const lon1 = toRadians(latlng1.lng);
  const lat2 = toRadians(latlng2.lat);
  const lon2 = toRadians(latlng2.lng);

  const distance = R * Math.acos(
    Math.cos(lat1) * Math.cos(lat2) * Math.cos(lon1 - lon2) +
    Math.sin(lat1) * Math.sin(lat2)
  );

  return distance; // Distance in kilometers
};

const calculateCurvatureAngle = (latlng1, latlng2, controlPoint) => {
  //const toRadians = (degrees) => degrees * (Math.PI / 180);
  const toDegrees = (radians) => radians * (180 / Math.PI);

  const angle1 = Math.atan2(controlPoint.lat - latlng1.lat, controlPoint.lng - latlng1.lng);
  const angle2 = Math.atan2(latlng2.lat - latlng1.lat, latlng2.lng - latlng1.lng);
  const angleDiff = angle2 - angle1;

  return Math.abs(toDegrees(angleDiff));
};

const MapComponent = () => {
  const mapElement = useRef();
  const [draw, setDraw] = useState(null);
  const [drawSource] = useState(new VectorSource());

  useEffect(() => {
    const initialCenter = fromLonLat([0, 0]);
    const initialZoom = 2;

    const rasterLayer = new TileLayer({
      source: new OSM(),
    });

    const drawLayer = new VectorLayer({
      source: drawSource,
      style: new Style({
        stroke: new Stroke({
          color: 'red',
          width: 2,
        }),
      }),
    });

    const map = new Map({
      target: mapElement.current,
      layers: [rasterLayer, drawLayer],
      view: new View({
        center: initialCenter,
        zoom: initialZoom,
      }),
    });

    const drawInteraction = new Draw({
      source: drawSource,
      type: 'LineString',
    });

    drawInteraction.on('drawend', (event) => {
      const feature = event.feature;
      const geometry = feature.getGeometry();
      const coordinates = geometry.getCoordinates();
      const newCoordinates = [];

      for (let i = 0; i < coordinates.length - 1; i++) {
        const startCoord = toLonLat(coordinates[i]);
        const endCoord = toLonLat(coordinates[i + 1]);

        const start = { lat: startCoord[1], lng: startCoord[0] };
        const end = { lat: endCoord[1], lng: endCoord[0] };

        console.log(`Start Point: ${start.lat}, ${start.lng}`);
        console.log(`End Point: ${end.lat}, ${end.lng}`);

        const distance = calculateGreatCircleDistance(start, end);
        console.log(`Great Circle Distance: ${distance} km`);

        const rhumpLineDistance=calculateRhumbDistance(start,end);
        console.log(`Rhump line distance: ${rhumpLineDistance}`)

        const path = calculateGreatCirclePath(start, end);
        console.log('Great Circle Path Waypoints:', path);

        const controlPointIndex = Math.floor(path.length / 2); // Take a point halfway between start and end
        const controlPoint = path[controlPointIndex];
        const curvatureAngle = calculateCurvatureAngle(start, end, controlPoint);
        console.log(`Curvature Angle: ${curvatureAngle} degrees`);

        path.forEach((point) => {
          newCoordinates.push(fromLonLat([point.lng, point.lat]));
        });
      }

      const curvedLine = new LineString(newCoordinates);
      feature.setGeometry(curvedLine);
    });

    map.addInteraction(drawInteraction);
    setDraw(drawInteraction);

    const modifyInteraction = new Modify({ source: drawSource });
    map.addInteraction(modifyInteraction);

    const snapInteraction = new Snap({ source: drawSource });
    map.addInteraction(snapInteraction);

    return () => {
      map.setTarget(undefined);
    };
  }, [drawSource]);

  const toggleDraw = () => {
    if (draw) {
      draw.setActive(!draw.getActive());
    }
  };

  return (
    <div>
      <div ref={mapElement} style={{ width: '100%', height: '90vh' }} />
      <button onClick={toggleDraw}>Toggle Draw</button>
    </div>
  );
};

export default MapComponent;
