// src/MapComponent.js

import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Polyline, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import L from 'leaflet';
import 'leaflet-draw';
import 'leaflet-curve';

const PolylineComponent = ({ polyline, rhumbDistance, greatCircleDistance, waypoints, curvatureAngle }) => {
  return (
    polyline && (
      <>
        <Polyline positions={polyline} color="blue">
          <Popup>
            <div>
              <div>Rhumb Line Distance: {rhumbDistance.toFixed(2)} km</div>
              <div>Great Circle Distance: {greatCircleDistance.toFixed(2)} km</div>
              <div>Curvature Angle: {curvatureAngle.toFixed(2)}°</div>
              <div>
                Waypoints:
                <ul>
                  {waypoints.map((point, index) => (
                    <li key={index}>
                      {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Popup>
        </Polyline>
      </>
    )
  );
};



const calculateGreatCircleDistance = (latlng1, latlng2) => {
  const R = 6371.0; // Earth's radius in kilometers
  const toRadians = (degrees) => degrees * (Math.PI / 180);

  const lat1 = toRadians(latlng1.lat);
  const lon1 = toRadians(latlng1.lng);
  const lat2 = toRadians(latlng2.lat);
  const lon2 = toRadians(latlng2.lng);

  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in kilometers
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


const calculateCurvatureAngle = (latlng1, latlng2, controlPoint) => {
  const toRadians = (degrees) => degrees * (Math.PI / 180);
  const toDegrees = (radians) => radians * (180 / Math.PI);

  const angle1 = Math.atan2(controlPoint[0] - latlng1.lat, controlPoint[1] - latlng1.lng);
  const angle2 = Math.atan2(latlng2.lat - latlng1.lat, latlng2.lng - latlng1.lng);
  const angleDiff = angle2 - angle1;

  return Math.abs(toDegrees(angleDiff));
};

const generateCurvePath = (latlng1, latlng2) => {
  const controlPoint = [
    (latlng1.lat + latlng2.lat) / 2 + 10,
    (latlng1.lng + latlng2.lng) / 2,
  ];
  const curvePath = [
    'M',
    [latlng1.lat, latlng1.lng],
    'Q',
    controlPoint,
    [latlng2.lat, latlng2.lng],
  ];

  // Generate waypoints along the curve
  const waypoints = [];
  const numPoints = 100; // Number of points along the curve
  for (let t = 0; t <= 1; t += 1 / numPoints) {
    const lat =
      (1 - t) * (1 - t) * latlng1.lat +
      2 * (1 - t) * t * controlPoint[0] +
      t * t * latlng2.lat;
    const lng =
      (1 - t) * (1 - t) * latlng1.lng +
      2 * (1 - t) * t * controlPoint[1] +
      t * t * latlng2.lng;
    waypoints.push({ lat, lng });
  }

  const curvatureAngle = calculateCurvatureAngle(latlng1, latlng2, controlPoint);

  return { curvePath, waypoints, curvatureAngle };
};

const DrawControl = ({ setPolyline, setRhumbDistance, setGreatCircleDistance, setCurve }) => {
  const map = useMap();
  const drawnItems = useRef(new L.FeatureGroup()).current;

  useEffect(() => {
    const drawControl = new L.Control.Draw({
      edit: {
        featureGroup: drawnItems,
      },
      draw: {
        polyline: true,
        polygon: false,
        rectangle: false,
        circle: false,
        marker: false,
        circlemarker: false,
      },
    });

    map.addControl(drawControl);

    map.on(L.Draw.Event.CREATED, (event) => {
      const { layerType, layer } = event;
      if (layerType === 'polyline') {
        const latlngs = layer.getLatLngs();
        setPolyline(latlngs);
        if (latlngs.length >= 2) {
          const initialWaypoint = latlngs[0];
          const endingWaypoint = latlngs[latlngs.length - 1];
          const rhumbDistance = calculateRhumbDistance(latlngs[0], latlngs[1]);
          const greatCircleDistance = calculateGreatCircleDistance(latlngs[0], latlngs[1]);
          //const greatCircleDistance = calculateGreatCircleDistance({lat:34.0833,lun:134.5831333}, {lat:49.3031,lon:122.7963889});
          setRhumbDistance(rhumbDistance);
          setRhumbDistance(rhumbDistance);
          setGreatCircleDistance(greatCircleDistance);

          const { curvePath, waypoints, curvatureAngle } = generateCurvePath(latlngs[0], latlngs[1]);
          setCurve({ curvePath, waypoints, curvatureAngle });

          // Log waypoints and distances
          console.log("Initial Waypoint:", initialWaypoint);
          console.log("Ending Waypoint:", endingWaypoint);
          console.log("Waypoints:", waypoints);
          console.log("Rhumb Line Distance:", rhumbDistance.toFixed(2), "km");
          console.log("Great Circle Distance:", greatCircleDistance.toFixed(2), "km");
          console.log("Curvature Angle:", curvatureAngle.toFixed(2), "°");
        }
        drawnItems.addLayer(layer);
      }
    });

    map.addLayer(drawnItems);

    return () => {
      map.off(L.Draw.Event.CREATED);
      map.removeLayer(drawnItems);
      map.removeControl(drawControl);
    };
  }, [map, drawnItems, setPolyline, setRhumbDistance, setGreatCircleDistance, setCurve]);

  return null;
};

const CurveComponent = ({ curve }) => {
  const map = useMap();

  useEffect(() => {
    if (curve) {
      const curveLayer = L.curve(curve.curvePath, { color: 'red' }).addTo(map);

      return () => {
        map.removeLayer(curveLayer);
      };
    }
  }, [map, curve]);

  return null;
};

const MapComponent = () => {
  const position = [51.505, -0.09];
  const [polyline, setPolyline] = useState(null);
  const [rhumbDistance, setRhumbDistance] = useState(null);
  const [greatCircleDistance, setGreatCircleDistance] = useState(null);
  const [curve, setCurve] = useState(null);

  return (
    <MapContainer
      center={position}
      zoom={13}
      style={{ height: '100vh', width: '100%' }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      <DrawControl
        setPolyline={setPolyline}
        setRhumbDistance={setRhumbDistance}
        setGreatCircleDistance={setGreatCircleDistance}
        setCurve={setCurve}
      />
      <PolylineComponent
        polyline={polyline}
        rhumbDistance={rhumbDistance}
        greatCircleDistance={greatCircleDistance}
        waypoints={curve ? curve.waypoints : []}
        curvatureAngle={curve ? curve.curvatureAngle : 0}
      />
      {curve && <CurveComponent curve={curve} />}
    </MapContainer>
  );
};

export default MapComponent;
