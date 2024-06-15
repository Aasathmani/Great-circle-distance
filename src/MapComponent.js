import React, { useEffect, useRef, useState } from "react";
import "ol/ol.css";
import { Map, View } from "ol";
import TileLayer from "ol/layer/Tile";
import OSM from "ol/source/OSM";
import { LineString, Point } from "ol/geom";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import { Stroke, Style, Fill, Circle as CircleStyle } from "ol/style";
import { Draw, Modify, Snap, Select } from "ol/interaction";
import Feature from "ol/Feature";
import { click } from "ol/events/condition";

// Define styles
const pointStyle = new Style({
  image: new CircleStyle({
    radius: 5,
    fill: new Fill({
      color: 'green',
    }),
  }),
});

const greatCircleStyle = new Style({
  stroke: new Stroke({
    color: 'red',
    width: 2,
  }),
});

const rhumbLineStyle = new Style({
  stroke: new Stroke({
    color: 'blue',
    width: 2,
  }),
});

// Function to calculate the Great Circle path
const calculateGreatCirclePath = (latlng1, latlng2, numPoints = 50) => {
  const toRadians = (degrees) => degrees * (Math.PI / 180);
  const toDegrees = (radians) => radians * (180 / Math.PI);

  const lat1 = toRadians(latlng1.lat);
  const lon1 = toRadians(latlng1.lng);
  const lat2 = toRadians(latlng2.lat);
  const lon2 = toRadians(latlng2.lng);

  const d =
    2 *
    Math.asin(
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

    const x =
      A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
    const y =
      A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);

    const lat = Math.atan2(z, Math.sqrt(x * x + y * y));
    const lon = Math.atan2(y, x);

    waypoints.push({ lat: toDegrees(lat), lng: toDegrees(lon) });
  }

  return waypoints;
};

// Function to calculate the Rhumb Line path
const calculateRhumbLinePath = (start, end) => {
  return [start, end];
};

const MapComponent = () => {
  const mapElement = useRef();
  const [draw, setDraw] = useState(null);
  const [drawSource] = useState(new VectorSource());
  const [selectedFeature, setSelectedFeature] = useState(null);
  const [currentType, setCurrentType] = useState(null);
  const [selectedPoint, setSelectedPoint] = useState(null);
  const contextMenuRef = useRef();
  const mapRef = useRef(null);
  const pointsArray = useRef([]);
  const globalCoordinates = useRef([]);

  useEffect(() => {
    const initialCenter = [0, 0];
    const initialZoom = 2;

    const rasterLayer = new TileLayer({
      source: new OSM(),
    });

    const drawLayer = new VectorLayer({
      source: drawSource,
      style: new Style({
        stroke: new Stroke({
          color: "red",
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
        projection: "EPSG:4326",
      }),
    });
    mapRef.current = map;

    const drawInteraction = new Draw({
      source: drawSource,
      type: "LineString",
    });

    drawInteraction.on("drawend", (event) => {
      const feature = event.feature;
      const geometry = feature.getGeometry();
      const coordinates = geometry.getCoordinates();
      console.log(coordinates);

      globalCoordinates.current = coordinates; // Store globally

      const newCoordinates = [];

      for (let i = 0; i < coordinates.length - 1; i++) {
        const startCoord = coordinates[i];
        const endCoord = coordinates[i + 1];

        const start = { lat: startCoord[1], lng: startCoord[0] };
        const end = { lat: endCoord[1], lng: endCoord[0] };

        const path = calculateGreatCirclePath(start, end);

        path.forEach((point) => {
          newCoordinates.push([point.lng, point.lat]);
        });
      }

      const curvedLine = new LineString(newCoordinates);
      feature.setGeometry(curvedLine);
      feature.set("type", "greatCircle");

      coordinates.forEach((coord) => {
        const point = new Point(coord);
        const pointFeature = new Feature(point);
        pointFeature.setStyle(pointStyle);
        drawSource.addFeature(pointFeature);
        pointsArray.current.push(pointFeature); // Store point in points array
      });

      drawInteraction.setActive(false); // Disable draw interaction after drawing a segment
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

    selectInteraction.on("select", (event) => {
      const feature = event.selected[0];
      if (feature) {
        setSelectedFeature(feature);
        setCurrentType(feature.get("type"));

        // Log start and end waypoints
        const coordinates = feature.getGeometry().getCoordinates();
        if (coordinates.length >= 2) {
          const startCoord = coordinates[0];
          const endCoord = coordinates[coordinates.length - 1];
          console.log("Start:", { lat: startCoord[1], lng: startCoord[0] });
          console.log("End:", { lat: endCoord[1], lng: endCoord[0] });
        } else {
          console.log("Insufficient coordinates for feature:", feature);
        }

        console.log("Selected feature:", feature);
      } else {
        setSelectedFeature(null);
        setCurrentType(null);
      }
    });

    map.addInteraction(selectInteraction);

    mapElement.current.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      const map = mapRef.current;
      if (!map) return;

      const pixel = map.getEventPixel(event);
      const feature = map.forEachFeatureAtPixel(pixel, (feature) => feature);

      if (feature && feature.getGeometry().getType() === 'Point') {
        setSelectedPoint(feature);
        const contextMenu = contextMenuRef.current;
        if (contextMenu) {
          contextMenu.style.left = `${event.clientX}px`;
          contextMenu.style.top = `${event.clientY}px`;
          contextMenu.style.display = "block";
        }
      } else {
        setSelectedPoint(null);
      }
    });

    window.addEventListener("click", (event) => {
      const contextMenu = contextMenuRef.current;
      if (contextMenu && event.button !== 2) {
        contextMenu.style.display = "none";
      }
    });

    return () => {
      map.setTarget(undefined);
    };
  }, [drawSource]);

  const handlePointClick = (type) => {
    if (!selectedPoint) return;

    const pointCoordinates = selectedPoint.getGeometry().getCoordinates();
    const pointIndex = globalCoordinates.current.findIndex(
      (coord) => coord[0] === pointCoordinates[0] && coord[1] === pointCoordinates[1]
    );

    if (pointIndex <= 0) {
      console.log("Point not found in global coordinates or is the first point");
      return;
    }

    const previousCoord = globalCoordinates.current[pointIndex - 1];
    console.log("Current waypoint:", { lat: pointCoordinates[1], lng: pointCoordinates[0] });
    console.log("Previous waypoint:", { lat: previousCoord[1], lng: previousCoord[0] });

    const start = { lat: previousCoord[1], lng: previousCoord[0] };
    const end = { lat: pointCoordinates[1], lng: pointCoordinates[0] };
    console.log(start, end);

    // Remove existing feature
    if (selectedFeature) {
      drawSource.removeFeature(selectedFeature);
      setSelectedFeature(null);
    }

    let newCoordinates = [];

    if (type === "rhumb") {
      console.log("Rhumb line conversion");
      const rhumbPath = calculateRhumbLinePath(start, end);
      newCoordinates = rhumbPath.map(point => [point.lng, point.lat]);
    } else if (type === "greatCircle") {
      console.log("Great circle conversion");
      const greatCirclePath = calculateGreatCirclePath(start, end);
      newCoordinates = greatCirclePath.map(point => [point.lng, point.lat]);
    }

    if (newCoordinates.length > 0) {
      const newFeature = new Feature({
        geometry: new LineString(newCoordinates),
        type: type === "rhumb" ? "rhumbLine" : "greatCircle"
      });

      newFeature.setStyle(type === "rhumb" ? rhumbLineStyle : greatCircleStyle);

      drawSource.addFeature(newFeature);
      setSelectedFeature(newFeature);
      setCurrentType(type === "rhumb" ? "rhumbLine" : "greatCircle");
    }
  };

  return (
    <div>
      <div ref={mapElement} style={{ width: "100%", height: "500px" }}></div>
      <div
        ref={contextMenuRef}
        style={{
          position: "absolute",
          display: "none",
          backgroundColor: "white",
          boxShadow: "0 2px 10px rgba(0, 0, 0, 0.5)",
          zIndex: 1000,
        }}
      >
        <button onClick={() => handlePointClick("greatCircle")}>Great Circle</button>
        <button onClick={() => handlePointClick("rhumb")}>Rhumb Line</button>
      </div>
    </div>
  );
};

export default MapComponent;
