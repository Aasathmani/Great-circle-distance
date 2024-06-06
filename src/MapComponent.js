import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, useMap,Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import L from 'leaflet';
import 'leaflet-draw'; 
import './App.css'; // Make sure you have the custom styles

const PolylineComponent = ({ segments, handleSegmentClick, handleContextMenu }) => {
  return (
    <>
      {segments.map((segment, segmentIndex) => (
        <React.Fragment key={segmentIndex}>
          <Polyline
            positions={segment.waypoints.length ? segment.waypoints.map(wp => [wp.lat, wp.lng]) : segment.latlngs.map(latlng => [latlng.lat, latlng.lng])}
            color={segment.waypoints.length ? "blue" : "red"}
            eventHandlers={{
              click: () => handleSegmentClick(segmentIndex),
              contextmenu: (e) => handleContextMenu(e, segmentIndex)
            }}
          >
             <Tooltip>
              <span>
                Rhumb Line Distance: {segment.rhumbDistance.toFixed(2)} km ({(segment.rhumbDistance / 1.852).toFixed(2)} nm)<br />
                Great Circle Distance: {segment.greatCircleDistance.toFixed(2)} km ({(segment.greatCircleDistance / 1.852).toFixed(2)} nm)<br />
                Curvature Angle: {segment.curvatureAngle.toFixed(2)}°
              </span>
            </Tooltip>
            {segment.latlngs.length > 0 && (
              <>
                <Marker
                  position={[segment.latlngs[0].lat, segment.latlngs[0].lng]}
                  icon={L.divIcon({ className: 'white-marker' })}
                />
                <Marker
                  position={[segment.latlngs[segment.latlngs.length - 1].lat, segment.latlngs[segment.latlngs.length - 1].lng]}
                  icon={L.divIcon({ className: 'white-marker' })}
                />
              </>
            )}
          </Polyline>
        </React.Fragment>
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

  const d1 = toRadians(latlng1.lat);
  const d2 = toRadians(latlng2.lat);
  const a1 = d2 - d1;
  let a2 = toRadians(latlng2.lng - latlng1.lng);

  // Ensure a2 is in the range [-π, π]
  if (Math.abs(a2) > Math.PI) {
    a2 = a2 > 0 ? -(2 * Math.PI - a2) : (2 * Math.PI + a2);
  }

  const a3 = Math.log(Math.tan(Math.PI / 4 + d2 / 2) / Math.tan(Math.PI / 4 + d1 / 2));
  const q = Math.abs(a3) > 10e-12 ? a1 / a3 : Math.cos(d1);

  const distance = Math.sqrt(a1 * a1 + q * q * a2 * a2) * R;

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
        const latlngs = layer.getLatLngs();
        const segments = latlngs.map((latlng, index) => {
          if (!latlngs[index + 1]) return null; // Skip the last incomplete segment
          const initialWaypoint = latlng;
          const endingWaypoint = latlngs[index + 1];
          const rhumbDistance = calculateRhumbDistance(initialWaypoint, endingWaypoint);
          const greatCircleDistance = calculateGreatCircleDistance(initialWaypoint, endingWaypoint);
          const waypoints = calculateGreatCirclePath(initialWaypoint, endingWaypoint);

          return {
            latlngs: [initialWaypoint, endingWaypoint],
            waypoints,
            rhumbDistance,
            greatCircleDistance,
            curvatureAngle: waypoints.length ? calculateCurvatureAngle(initialWaypoint, endingWaypoint, waypoints[Math.floor(waypoints.length / 2)]) : 0,
          };
        }).filter(Boolean); // Remove null values

        setSegments((prevSegments) => [...prevSegments, ...segments]);
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
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, segmentIndex: null });

  const handleSegmentClick = (index, action) => {
    setSegments((prevSegments) => {
      const newSegments = [...prevSegments];
      const segment = newSegments[index];

      if (action === 'greatcircle' && !segment.waypoints.length) {
        const [initialWaypoint, endingWaypoint] = segment.latlngs;
        segment.rhumbDistance = calculateRhumbDistance(initialWaypoint, endingWaypoint);
        segment.greatCircleDistance = calculateGreatCircleDistance(initialWaypoint, endingWaypoint);
        segment.waypoints = calculateGreatCirclePath(initialWaypoint, endingWaypoint);
        segment.curvatureAngle = calculateCurvatureAngle(initialWaypoint, endingWaypoint, segment.waypoints[Math.floor(segment.waypoints.length / 2)]);

        console.log(`Segment ${index + 1}:`);
        console.log("Initial Waypoint:", initialWaypoint);
        console.log("Ending Waypoint:", endingWaypoint);
        console.log("Waypoints:", segment.waypoints);
        console.log("Rhumb Line Distance:", segment.rhumbDistance.toFixed(2), "km");
        console.log("Great Circle Distance:", segment.greatCircleDistance.toFixed(2), "km");
        console.log("Curvature Angle:", segment.curvatureAngle.toFixed(2), "°");
      } else if (action === 'rhumb' && segment.waypoints.length) {
        segment.waypoints = [];
        segment.curvatureAngle = 0;
      }

      return newSegments;
    });
  };

  const handleContextMenu = (e, index) => {
    L.DomEvent.preventDefault(e); // Prevent the default context menu
    setContextMenu({
      visible: true,
      x: e.containerPoint.x,
      y: e.containerPoint.y,
      segmentIndex: index
    });
  };

  const handleContextMenuAction = (action) => {
    if (contextMenu.segmentIndex !== null) {
      handleSegmentClick(contextMenu.segmentIndex, action);
      setContextMenu({ ...contextMenu, visible: false });
    }
  };

  return (
    <div>
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
        <PolylineComponent segments={segments} handleSegmentClick={handleSegmentClick} handleContextMenu={handleContextMenu} />
      </MapContainer>

      {contextMenu.visible && (
        <div className="context-menu" style={{ top: contextMenu.y, left: contextMenu.x }}>
          {segments[contextMenu.segmentIndex].waypoints.length ? (
            <div onClick={() => handleContextMenuAction('rhumb')}>Convert to Rhumb Line</div>
          ) : (
            <div onClick={() => handleContextMenuAction('greatcircle')}>Convert to Great Circle Path</div>
          )}
        </div>
      )}
    </div>
  );
};

export default MapComponent;
