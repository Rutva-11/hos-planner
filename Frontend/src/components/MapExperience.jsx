import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useTheme } from '../context/ThemeContext';

// Helper component to fit map bounds dynamically when stops change, or reset to center when empty
function MapBoundsController({ stops }) {
  const map = useMap();
  
  useEffect(() => {
    if (stops && stops.length > 0) {
      const bounds = stops.map(stop => [stop.lat, stop.lng]);
      // Small delay to let Leaflet render container properly
      const timer = setTimeout(() => {
        map.fitBounds(bounds, { padding: [60, 60], maxZoom: 12, animate: true, duration: 1.5 });
      }, 100);
      return () => clearTimeout(timer);
    } else {
      // Smoothly reset view to middle of US when no route is loaded
      const timer = setTimeout(() => {
        map.setView([37.8, -96], 4, { animate: true, duration: 1.5 });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [stops, map]);

  return null;
}

// Icon cache to prevent memory leaks by recreating Leaflet divIcon instances
const iconCache = {};
const getPremiumIcon = (type) => {
  if (iconCache[type]) return iconCache[type];

  let color = '#ab894d'; // Gold
  let glowColor = 'rgba(171, 137, 77, 0.4)';
  
  if (type === 'Destination') {
    color = '#10b981'; // Emerald Green
    glowColor = 'rgba(16, 185, 129, 0.4)';
  } else if (type === 'Pickup') {
    color = '#3b82f6'; // Blue
    glowColor = 'rgba(59, 130, 246, 0.4)';
  } else if (type === 'Rest Stop' || type === 'Fuel & Rest' || type === 'Overnight Reset') {
    color = '#d97706'; // Amber
    glowColor = 'rgba(217, 119, 6, 0.4)';
  }

  iconCache[type] = L.divIcon({
    html: `
      <div class="relative flex items-center justify-center w-6 h-6 animate-fade-in">
        <!-- Glow Ring -->
        <span class="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style="background-color: ${glowColor};"></span>
        <!-- Inner Core -->
        <span class="relative inline-flex rounded-full h-3.5 w-3.5 border-2 border-white dark:border-luxury-charcoal-900 shadow-md" style="background-color: ${color};"></span>
      </div>
    `,
    className: 'custom-leaflet-premium-marker',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -10]
  });

  return iconCache[type];
};

export default function MapExperience({ stops, polyline }) {
  const { theme } = useTheme();
  const [mapReady, setMapReady] = useState(false);

  // Fallback initial coordinates (Middle of US)
  const defaultCenter = [37.8, -96];
  const defaultZoom = 4;

  const polylineCoords = polyline && polyline.length > 0 ? polyline : [];

  // Deduplicate markers by coordinate to avoid stacking identical ones
  const uniqueStops = [];
  const coordsSet = new Set();

  if (stops && stops.length > 0) {
    stops.forEach(stop => {
      if (stop && stop.lat != null && stop.lng != null && typeof stop.lat === 'number' && typeof stop.lng === 'number') {
        // Round to 5 decimal places to handle micro-differences (approx 1 meter precision)
        const coordKey = `${stop.lat.toFixed(5)},${stop.lng.toFixed(5)}`;
        if (!coordsSet.has(coordKey)) {
          coordsSet.add(coordKey);
          uniqueStops.push(stop);
        }
      }
    });
  }

  return (
    <div className="w-full h-full relative min-h-[350px] md:min-h-[450px] lg:h-[600px] rounded-3xl overflow-hidden border border-luxury-ivory-200/50 dark:border-luxury-charcoal-700/60 shadow-premium-light dark:shadow-premium-dark bg-luxury-cream-100 dark:bg-luxury-charcoal-900">
      
      {/* Visual map status indicator */}
      <div className="absolute top-4 left-4 z-[400] glass-panel px-4 py-2 rounded-full text-[10px] font-semibold uppercase tracking-wider text-luxury-charcoal-700 dark:text-luxury-ivory-300 pointer-events-none flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-luxury-gold-500 animate-pulse" />
        <span>Telemetry Visualizer</span>
      </div>

      <MapContainer
        center={defaultCenter}
        zoom={defaultZoom}
        className="w-full h-full z-10"
        whenReady={() => setMapReady(true)}
        zoomControl={true}
      >
        {/* Standard OSM tile provider */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {uniqueStops.map((stop, index) => (
          <Marker
            key={`${stop.name}-${index}-${stop.lat}-${stop.lng}`}
            position={[stop.lat, stop.lng]}
            icon={getPremiumIcon(stop.type)}
          >
            <Popup>
              <div className="p-1">
                <span className="text-[10px] uppercase font-bold tracking-widest text-luxury-gold-600 dark:text-luxury-gold-400 block mb-1">
                  {stop.type}
                </span>
                <h4 className="text-xs font-semibold text-luxury-charcoal-950 dark:text-white mb-0.5 leading-snug">
                  {stop.name}
                </h4>
                <p className="text-[10px] text-luxury-charcoal-400 font-light">
                  Scheduled Arrival: {stop.time}
                </p>
              </div>
            </Popup>
          </Marker>
        ))}

        {polylineCoords.length > 1 && (
          <>
            {/* Background polyline for soft glowing shadow */}
            <Polyline
              positions={polylineCoords}
              pathOptions={{
                color: theme === 'dark' ? '#ab894d' : '#826f54',
                weight: 6,
                opacity: 0.15,
                lineCap: 'round',
                lineJoin: 'round'
              }}
            />
            {/* Primary active route line */}
            <Polyline
              positions={polylineCoords}
              pathOptions={{
                color: '#ab894d',
                weight: 3.5,
                opacity: 0.85,
                lineCap: 'round',
                lineJoin: 'round',
                dashArray: '1, 2'
              }}
            />
          </>
        )}

        <MapBoundsController stops={uniqueStops} />
      </MapContainer>

      {/* Decorative layout vignette borders to create cinematic shadows */}
      <div className="absolute inset-0 border border-luxury-ivory-200/50 dark:border-luxury-charcoal-700/60 rounded-3xl pointer-events-none z-[400]" />
    </div>
  );
}
