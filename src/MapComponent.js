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
import { Draw, Modify, Snap, Select } from 'ol/interaction';
import { click } from 'ol/events/condition';

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

const calculateRhumbLinePath = (start, end) => {
  return [start, end];
};

const MapComponent = () => {
  const mapElement = useRef();
  const [draw, setDraw] = useState(null);
  const [drawSource] = useState(new VectorSource());
  const [selectedFeature, setSelectedFeature] = useState(null);
  const [currentType, setCurrentType] = useState(null);
  const contextMenuRef = useRef();

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

        const path = calculateGreatCirclePath(start, end);

        path.forEach((point) => {
          newCoordinates.push(fromLonLat([point.lng, point.lat]));
        });
      }

      const curvedLine = new LineString(newCoordinates);
      feature.setGeometry(curvedLine);
      feature.set('type', 'greatCircle');

      drawInteraction.setActive(false);  // Disable draw interaction after drawing a segment
    });

    map.addInteraction(drawInteraction);
    setDraw(drawInteraction);

    const modifyInteraction = new Modify({ source: drawSource });
    map.addInteraction(modifyInteraction);

    const snapInteraction = new Snap({ source: drawSource });
    map.addInteraction(snapInteraction);

    const selectInteraction = new Select({
      condition: click,
    });

    selectInteraction.on('select', (event) => {
      const feature = event.selected[0];
      if (feature) {
        setSelectedFeature(feature);
        setCurrentType(feature.get('type'));
      } else {
        setSelectedFeature(null);
        setCurrentType(null);
      }
    });

    map.addInteraction(selectInteraction);

    mapElement.current.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      const contextMenu = contextMenuRef.current;
      if (contextMenu) {
        contextMenu.style.left = `${event.clientX}px`;
        contextMenu.style.top = `${event.clientY}px`;
        contextMenu.style.display = 'block';
      }
    });

    window.addEventListener('click', (event) => {
      const contextMenu = contextMenuRef.current;
      if (contextMenu && event.button !== 2) {
        contextMenu.style.display = 'none';
      }
    });

    return () => {
      map.setTarget(undefined);
    };
  }, [drawSource]);

  const convertLine = (type) => {
    if (!selectedFeature) return;

    const geometry = selectedFeature.getGeometry();
    const coordinates = geometry.getCoordinates();
    let newCoordinates = [];

    if (type === 'greatCircle') {
      for (let i = 0; i < coordinates.length - 1; i++) {
        const startCoord = toLonLat(coordinates[i]);
        const endCoord = toLonLat(coordinates[i + 1]);

        const start = { lat: startCoord[1], lng: startCoord[0] };
        const end = { lat: endCoord[1], lng: endCoord[0] };

        const path = calculateGreatCirclePath(start, end);
        path.forEach((point) => {
          newCoordinates.push(fromLonLat([point.lng, point.lat]));
        });
      }
      selectedFeature.set('type', 'greatCircle');
    } else if (type === 'rhumbLine') {
      const startCoord = toLonLat(coordinates[0]);
      const endCoord = toLonLat(coordinates[coordinates.length - 1]);

      const start = { lat: startCoord[1], lng: startCoord[0] };
      const end = { lat: endCoord[1], lng: endCoord[0] };

      const path = calculateRhumbLinePath(start, end);
      path.forEach((point) => {
        newCoordinates.push(fromLonLat([point.lng, point.lat]));
      });
      selectedFeature.set('type', 'rhumbLine');
      console.log('aasath');
    }

    const newLine = new LineString(newCoordinates);
    selectedFeature.setGeometry(newLine);
  };

  const toggleDraw = () => {
    if (draw) {
      draw.setActive(!draw.getActive());
    }
  };

  return (
    <div>
      <div ref={mapElement} style={{ width: '100%', height: '90vh' }} />
      <div
        ref={contextMenuRef}
        className="context-menu"
        style={{
          position: 'absolute',
          display: 'none',
          background: 'white',
          border: '1px solid black',
          zIndex: 1000,
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (currentType === 'rhumbLine') {
            convertLine('greatCircle');
          } else {
            convertLine('rhumbLine');
          }
          const contextMenu = contextMenuRef.current;
          if (contextMenu) {
            contextMenu.style.display = 'none';
          }
        }}
      >
        {currentType === 'rhumbLine' ? (
          <div>Convert to Great Circle</div>
        ) : (
          <div>Convert to Rhumb Line</div>
        )}
      </div>
      <button onClick={toggleDraw}>Toggle Draw</button>
    </div>
  );
};

export default MapComponent;
