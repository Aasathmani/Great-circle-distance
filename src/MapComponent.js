import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Polyline, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import L from 'leaflet';
import 'leaflet-draw';

const PolylineComponent = ({ segments }) => {
  return (
    <>
      {segments.map((segment, index) => (
        <Polyline key={index} positions={segment.waypoints.map(wp => [wp.lat, wp.lng])} color="blue">
          <Popup>
            <div>
              <div>Rhumb Line Distance: {segment.rhumbDistance.toFixed(2)} km</div>
              <div>Great Circle Distance: {segment.greatCircleDistance.toFixed(2)} km</div>
              <div>Curvature Angle: {segment.curvatureAngle.toFixed(2)}°</div>
              <div>
                Waypoints:
                <ul>
                  {segment.waypoints.map((point, idx) => (
                    <li key={idx}>
                      {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Popup>
        </Polyline>
      ))}
    </>
  );
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

  const angle1 = Math.atan2(controlPoint.lat - latlng1.lat, controlPoint.lng - latlng1.lng);
  const angle2 = Math.atan2(latlng2.lat - latlng1.lat, latlng2.lng - latlng1.lng);
  const angleDiff = angle2 - angle1;

  return Math.abs(toDegrees(angleDiff));
};

const calculateGreatCirclePath = (latlng1, latlng2, numPoints = 100) => {
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

  // Adjust waypoints for wrap-around if necessary
  for (let i = 1; i < waypoints.length; i++) {
    if (Math.abs(waypoints[i].lng - waypoints[i - 1].lng) > 180) {
      if (waypoints[i].lng > waypoints[i - 1].lng) {
        waypoints[i].lng -= 360;
      } else {
        waypoints[i].lng += 360;
      }
    }
  }

  return waypoints;
};

const DrawControl = ({ setSegments }) => {
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
        let latlngs = layer.getLatLngs();
        const segments = [];

        for (let i = 0; i < latlngs.length - 1; i++) {
          const initialWaypoint = latlngs[i];
          const endingWaypoint = latlngs[i + 1];
          const rhumbDistance = calculateRhumbDistance(initialWaypoint, endingWaypoint);
          const greatCircleDistance = calculateGreatCircleDistance(initialWaypoint, endingWaypoint);

          const waypoints = calculateGreatCirclePath(initialWaypoint, endingWaypoint);
          const curvatureAngle = calculateCurvatureAngle(initialWaypoint, endingWaypoint, waypoints[Math.floor(waypoints.length / 2)]);

          segments.push({
            rhumbDistance,
            greatCircleDistance,
            curvatureAngle,
            waypoints
          });

          // Log waypoints and distances for each segment
          console.log(`Segment ${i + 1}:`);
          console.log("Initial Waypoint:", initialWaypoint);
          console.log("Ending Waypoint:", endingWaypoint);
          console.log("Waypoints:", waypoints);
          console.log("Rhumb Line Distance:", rhumbDistance.toFixed(2), "km");
          console.log("Great Circle Distance:", greatCircleDistance.toFixed(2), "km");
          console.log("Curvature Angle:", curvatureAngle.toFixed(2), "°");
        }

        setSegments(segments);
        drawnItems.addLayer(layer);
      }
    });

    map.addLayer(drawnItems);

    return () => {
      map.off(L.Draw.Event.CREATED);
      map.removeLayer(drawnItems);
      map.removeControl(drawControl);
    };
  }, [map, drawnItems, setSegments]);

  return null;
};

const MapComponent = () => {
  const position = [51.505, -0.09];
  const [segments, setSegments] = useState([]);

  return (
    <MapContainer
      center={position}
      zoom={2}
      style={{ height: '100vh', width: '100%' }}
      worldCopyJump={true}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      <DrawControl setSegments={setSegments} />
      <PolylineComponent segments={segments} />
    </MapContainer>
  );
};

export default MapComponent;
