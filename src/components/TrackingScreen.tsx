/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { motion, AnimatePresence } from 'motion/react';
import { 
  CheckCircle, Bike, MapPin, Phone, HelpCircle, AlertTriangle, 
  ChevronRight, ChevronLeft, Compass, Navigation, Clock, ShieldCheck,
  MessageSquare, Send, X, Store, ArrowLeft, ThumbsUp, Share2,
  Star, Smile, Activity, Wifi, Battery, Cpu, Terminal, Radio, RefreshCw,
  Smartphone, IndianRupee, ChefHat, Utensils, Check, PackageCheck, Sparkles, CheckCircle2,
  Bell, BellRing
} from 'lucide-react';
import { OrderStatus } from '../types';
import { APIProvider, Map, AdvancedMarker, Pin, InfoWindow, MapControl, ControlPosition, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';

// Stable GPS Seed coordinates for Chirala area (Center: 15.8246, 80.3533)
const CHIRALA_CENTER = { lat: 15.8246, lng: 80.3533 };

const getApiKey = (): string => {
  try {
    const vKey = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY;
    if (vKey && vKey !== 'YOUR_API_KEY' && !vKey.includes('your_google_maps')) return vKey;
  } catch (e) {}
  try {
    const vpKey = (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY;
    if (vpKey && vpKey !== 'YOUR_API_KEY' && !vpKey.includes('your_google_maps')) return vpKey;
  } catch (e) {}
  try {
    if (typeof process !== 'undefined' && process.env) {
      const pKey = process.env.GOOGLE_MAPS_PLATFORM_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_PLATFORM_KEY;
      if (pKey && pKey !== 'YOUR_API_KEY' && !pKey.includes('your_google_maps')) return pKey;
    }
  } catch (e) {}
  try {
    const gKey = (globalThis as any).GOOGLE_MAPS_PLATFORM_KEY || (globalThis as any).VITE_GOOGLE_MAPS_API_KEY;
    if (gKey && gKey !== 'YOUR_API_KEY' && !gKey.includes('your_google_maps')) return gKey;
  } catch (e) {}
  return '';
};

const API_KEY = getApiKey();
const hasValidKey = Boolean(API_KEY) && API_KEY !== 'YOUR_API_KEY';

function getSeedCoordinates(id: string, indexOffset: number = 0) {
  const hash = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) + indexOffset;
  const latDisp = ((hash % 37) - 18.5) * 0.0006; // ~1-2km spread
  const lngDisp = ((hash % 43) - 21.5) * 0.0006;
  return {
    lat: CHIRALA_CENTER.lat + latDisp,
    lng: CHIRALA_CENTER.lng + lngDisp,
  };
}

// Calculate real-world distance between coordinate pairs (in kilometers)
function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's mean radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const straightLineKm = R * c;
  // Apply urban road circuity coefficient (~1.28x road navigation factor)
  return Math.max(0.1, parseFloat((straightLineKm * 1.28).toFixed(2)));
}


function LiveRouteTracker({
  restaurantCoords,
  destinationCoords,
  progress,
  restaurantName,
  riderName,
  riderVehicle,
  riderPhone,
  speed,
  accuracy,
  realTimeCoords,
  countdownText,
  distanceKm,
  onOpenChat,
}: {
  restaurantCoords: { lat: number; lng: number };
  destinationCoords: { lat: number; lng: number };
  progress: number;
  restaurantName: string;
  riderName: string;
  riderVehicle?: string;
  riderPhone?: string;
  speed?: number;
  accuracy?: number;
  realTimeCoords?: { lat: number; lng: number };
  countdownText?: string;
  distanceKm?: number;
  onOpenChat?: () => void;
}) {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');
  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const [partnerCoords, setPartnerCoords] = useState<{ lat: number; lng: number }>(restaurantCoords);
  const [routePath, setRoutePath] = useState<google.maps.LatLngLiteral[]>([]);
  const [activeInfoWindow, setActiveInfoWindow] = useState<'rider' | 'restaurant' | 'destination' | null>(null);

  useEffect(() => {
    if (!routesLib || !map) return;

    // Clear previous polylines
    polylinesRef.current.forEach(p => p.setMap(null));
    polylinesRef.current = [];

    const request = {
      origin: restaurantCoords,
      destination: destinationCoords,
      travelMode: 'DRIVING' as const,
      fields: ['path', 'distanceMeters', 'durationMillis', 'viewport'],
    };

    routesLib.Route.computeRoutes(request)
      .then(({ routes }) => {
        if (routes && routes[0]) {
          const route = routes[0];
          // Draw polylines on map with Nuvvo warm orange styling
          const newPolylines = route.createPolylines();
          newPolylines.forEach(p => {
            p.setOptions({
              strokeColor: '#f97316', // Warm Nuvvo orange
              strokeOpacity: 0.85,
              strokeWeight: 5,
            });
            p.setMap(map);
          });
          polylinesRef.current = newPolylines;

          // Approx polyline coordinates
          const pathCoords: google.maps.LatLngLiteral[] = [];
          if (route.path) {
            route.path.forEach(latLng => {
              const anyLatLng = latLng as any;
              const latVal = typeof anyLatLng.lat === 'function' ? anyLatLng.lat() : anyLatLng.lat;
              const lngVal = typeof anyLatLng.lng === 'function' ? anyLatLng.lng() : anyLatLng.lng;
              pathCoords.push({ lat: Number(latVal), lng: Number(lngVal) });
            });
          }
          setRoutePath(pathCoords);

          // Fit map viewport to encompass the route
          if (route.viewport) {
            map.fitBounds(route.viewport, { top: 40, bottom: 40, left: 40, right: 40 });
          }
        }
      })
      .catch((err) => {
        console.error('Tracking Route compute failed:', err);
      });

    return () => {
      polylinesRef.current.forEach(p => p.setMap(null));
    };
  }, [routesLib, map, restaurantCoords, destinationCoords]);

  // Interpolate partner location along computed route path with live telemetry jitter
  useEffect(() => {
    if (routePath.length === 0) {
      // Linear interpolation fallback if routes are loading or failed
      const lat = restaurantCoords.lat + (destinationCoords.lat - restaurantCoords.lat) * (progress / 100);
      const lng = restaurantCoords.lng + (destinationCoords.lng - restaurantCoords.lng) * (progress / 100);
      setPartnerCoords({ lat, lng });
      return;
    }

    // Find coordinate on route corresponding to the progress percentage
    const index = Math.min(
      routePath.length - 1,
      Math.max(0, Math.floor((progress / 100) * (routePath.length - 1)))
    );
    if (routePath[index]) {
      const targetPoint = routePath[index];
      // Micro-jitter to give real-time sensor displacement
      const jitterLat = realTimeCoords ? (realTimeCoords.lat - restaurantCoords.lat) * 0.04 : 0;
      const jitterLng = realTimeCoords ? (realTimeCoords.lng - restaurantCoords.lng) * 0.04 : 0;
      setPartnerCoords({
        lat: parseFloat((targetPoint.lat + jitterLat).toFixed(6)),
        lng: parseFloat((targetPoint.lng + jitterLng).toFixed(6)),
      });
    }
  }, [progress, routePath, restaurantCoords, destinationCoords, realTimeCoords]);

  const handleRecenter = () => {
    if (!map) return;
    map.panTo(partnerCoords);
    map.setZoom(16);
  };

  const handleFitRoute = () => {
    if (!map) return;
    const bounds = new google.maps.LatLngBounds();
    bounds.extend(restaurantCoords);
    bounds.extend(destinationCoords);
    bounds.extend(partnerCoords);
    map.fitBounds(bounds, { top: 50, bottom: 50, left: 50, right: 50 });
  };

  return (
    <>
      {/* Restaurant origin pin */}
      <AdvancedMarker 
        position={restaurantCoords} 
        title={restaurantName}
        onClick={() => setActiveInfoWindow(activeInfoWindow === 'restaurant' ? null : 'restaurant')}
      >
        <Pin background="#3b82f6" glyphColor="#fff" scale={0.95} />
      </AdvancedMarker>
      {activeInfoWindow === 'restaurant' && (
        <InfoWindow 
          position={restaurantCoords} 
          onCloseClick={() => setActiveInfoWindow(null)}
        >
          <div className="p-1 text-zinc-900 text-xs">
            <p className="font-black text-sm">🍳 {restaurantName}</p>
            <p className="text-[10px] text-zinc-500 font-mono mt-0.5">
              Lat: {restaurantCoords.lat.toFixed(5)}, Lng: {restaurantCoords.lng.toFixed(5)}
            </p>
            <span className="inline-block mt-1 bg-blue-100 text-blue-800 text-[9px] px-1.5 py-0.5 rounded font-bold uppercase">
              Pickup Station
            </span>
          </div>
        </InfoWindow>
      )}

      {/* Customer drop area pin */}
      <AdvancedMarker 
        position={destinationCoords} 
        title="Your Delivery Address"
        onClick={() => setActiveInfoWindow(activeInfoWindow === 'destination' ? null : 'destination')}
      >
        <Pin background="#10b981" glyphColor="#fff" scale={0.95} />
      </AdvancedMarker>
      {activeInfoWindow === 'destination' && (
        <InfoWindow 
          position={destinationCoords} 
          onCloseClick={() => setActiveInfoWindow(null)}
        >
          <div className="p-1 text-zinc-900 text-xs">
            <p className="font-black text-sm">🏠 Delivery Address</p>
            <p className="text-[10px] text-zinc-500 font-mono mt-0.5">
              Lat: {destinationCoords.lat.toFixed(5)}, Lng: {destinationCoords.lng.toFixed(5)}
            </p>
            <span className="inline-block mt-1 bg-emerald-100 text-emerald-800 text-[9px] px-1.5 py-0.5 rounded font-bold uppercase">
              Drop Location
            </span>
          </div>
        </InfoWindow>
      )}

      {/* Delivery Partner's Moving Pin */}
      <AdvancedMarker 
        position={partnerCoords} 
        title={riderName}
        onClick={() => setActiveInfoWindow(activeInfoWindow === 'rider' ? null : 'rider')}
      >
        <div className="relative flex items-center justify-center cursor-pointer group" style={{ width: '44px', height: '44px' }}>
          {/* Animated ping effect */}
          <span className="absolute inline-flex h-11 w-11 rounded-full bg-orange-500/40 animate-ping" />
          <div className="relative w-9 h-9 rounded-full bg-gradient-to-tr from-orange-600 to-amber-500 border-2 border-white shadow-xl flex items-center justify-center text-white text-lg transition-transform group-hover:scale-110">
            🛵
          </div>
        </div>
      </AdvancedMarker>
      {activeInfoWindow === 'rider' && (
        <InfoWindow 
          position={partnerCoords} 
          onCloseClick={() => setActiveInfoWindow(null)}
        >
          <div className="p-1.5 text-zinc-900 text-xs min-w-[190px]">
            <div className="flex items-center justify-between gap-2 border-b pb-1.5 mb-1.5">
              <div>
                <p className="font-black text-sm leading-tight">{riderName}</p>
                <p className="text-[10px] text-zinc-500">{riderVehicle || 'Electric Scooter'}</p>
              </div>
              <span className="bg-emerald-100 text-emerald-700 text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                Active
              </span>
            </div>
            
            <div className="space-y-1 font-mono text-[10.5px]">
              <div className="flex justify-between text-zinc-650">
                <span>GPS Coords:</span>
                <span className="font-bold text-zinc-900">{partnerCoords.lat.toFixed(5)}, {partnerCoords.lng.toFixed(5)}</span>
              </div>
              <div className="flex justify-between text-zinc-650">
                <span>Live Speed:</span>
                <span className="font-bold text-orange-600">{speed || 36} km/h</span>
              </div>
              <div className="flex justify-between text-zinc-650">
                <span>Accuracy:</span>
                <span className="font-bold text-zinc-900">±{accuracy || 4.2}m</span>
              </div>
              <div className="flex justify-between text-zinc-650">
                <span>Progress:</span>
                <span className="font-bold text-emerald-600">{Math.round(progress)}% en route</span>
              </div>
            </div>

            <div className="flex gap-1.5 mt-2">
              {riderPhone && (
                <a 
                  href={`tel:${riderPhone}`}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] py-1.5 px-2 rounded-lg flex items-center justify-center gap-1 transition"
                >
                  📞 Call
                </a>
              )}
              {onOpenChat && (
                <button
                  type="button"
                  onClick={onOpenChat}
                  className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-bold text-[10px] py-1.5 px-2 rounded-lg flex items-center justify-center gap-1 transition cursor-pointer"
                >
                  💬 Message
                </button>
              )}
            </div>
          </div>
        </InfoWindow>
      )}

      {/* Floating Map Navigation Controls */}
      <MapControl position={ControlPosition.TOP_RIGHT}>
        <div className="m-2 flex flex-col gap-1.5 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md p-1 rounded-xl shadow-lg border border-slate-200 dark:border-zinc-800">
          <button
            type="button"
            onClick={handleRecenter}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-[10px] font-bold flex items-center gap-1 cursor-pointer transition"
            title="Recenter on delivery partner"
          >
            🎯 Recenter
          </button>
          <button
            type="button"
            onClick={handleFitRoute}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-[10px] font-bold flex items-center gap-1 cursor-pointer transition border-t border-slate-100 dark:border-zinc-800"
            title="Fit full route in viewport"
          >
            🗺️ Fit Route
          </button>
        </div>
      </MapControl>

      {/* Real-time Coordinate Telemetry Overlay */}
      <MapControl position={ControlPosition.BOTTOM_LEFT}>
        <div className="m-2 bg-zinc-900/90 backdrop-blur-md text-white px-2.5 py-1.5 rounded-xl text-[9.5px] font-mono border border-zinc-700/60 shadow-lg flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          {countdownText && (
            <>
              <span className="text-orange-400 font-bold">⏱️ {countdownText}</span>
              <span className="text-zinc-500">•</span>
            </>
          )}
          {distanceKm !== undefined && (
            <>
              <span className="text-emerald-400 font-bold">{distanceKm} km</span>
              <span className="text-zinc-500">•</span>
            </>
          )}
          <span className="font-bold">
            {partnerCoords.lat.toFixed(5)}, {partnerCoords.lng.toFixed(5)}
          </span>
          <span className="text-zinc-400">|</span>
          <span className="text-orange-400 font-bold">{speed || 38} km/h</span>
        </div>
      </MapControl>
    </>
  );
}

export default function TrackingScreen() {
  const { 
    activeTrackingOrder, deliveryRouteProgress, 
    clickToWhatsAppSupport, changeOrderStatus, setCurrentPage,
    restaurants, submitRestaurantReview, user,
    pageHistory, goBack, closePage,
    notificationPermission, requestNotificationPermission,
    triggerPushNotification,
    deliveryPartners, storePaymentSettings
  } = useApp();

  const assignedPartner = deliveryPartners?.find(p => p.id === activeTrackingOrder?.deliveryPartnerId) || 
    (activeTrackingOrder?.deliveryPartnerId ? deliveryPartners?.find(p => p.isApproved) : null);
  const hasAssignedRider = Boolean(activeTrackingOrder?.deliveryPartnerId || assignedPartner);

  const riderName = activeTrackingOrder?.deliveryPartnerName || assignedPartner?.name || 'Awaiting Partner';
  const riderPhone = activeTrackingOrder?.deliveryPartnerPhone || assignedPartner?.phone || '';
  const riderVehicle = activeTrackingOrder?.deliveryPartnerVehicle || (assignedPartner ? `${assignedPartner.vehicleType || 'Bike'} (${assignedPartner.bikeNumber || ''})` : 'Delivery Fleet');
  const riderAvatar = activeTrackingOrder?.deliveryPartnerAvatar || assignedPartner?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80';
  const riderRating = activeTrackingOrder?.deliveryPartnerRating || assignedPartner?.rating || 5.0;
  const isDeliveryStarted = ['picked', 'on_the_way', 'delivered'].includes(activeTrackingOrder?.status || '');

  const restaurantId = activeTrackingOrder?.items[0]?.foodItem?.restaurantId || 'rest_1';
  const restaurantName = restaurants.find(r => r.id === restaurantId)?.name || 'Nuvvo Kitchens';
  const restaurantCoords = useMemo(() => getSeedCoordinates(restaurantId, 10), [restaurantId]);
  const addressId = activeTrackingOrder?.address?.id || 'default_cust';
  const rawDestinationCoords = useMemo(() => {
    return activeTrackingOrder?.address?.gpsCoordinates || getSeedCoordinates(addressId, 25);
  }, [activeTrackingOrder?.address?.gpsCoordinates, addressId]);
  // Auto-snap destination if they are way too far apart (e.g. Hyderabad vs Chirala)
  const destinationCoords = useMemo(() => {
    return Math.abs(rawDestinationCoords.lat - restaurantCoords.lat) > 0.5
      ? getSeedCoordinates(addressId, 25)
      : rawDestinationCoords;
  }, [rawDestinationCoords, restaurantCoords, addressId]);

  const [simulatedDistance, setSimulatedDistance] = useState(2.8); // in km
  const [etaRemaining, setEtaRemaining] = useState(24); // in minutes
  const [timeLeftMs, setTimeLeftMs] = useState<number>(0);

  // Real-time WebSocket Polling & Telemetry States
  const [isPolling, setIsPolling] = useState(true);
  const [telemetryLogs, setTelemetryLogs] = useState<{ id: string; timestamp: string; message: string; type: 'info' | 'rx' | 'warn' }[]>([]);
  const [currentSpeed, setCurrentSpeed] = useState(38);
  const [batteryLevel, setBatteryLevel] = useState(89);
  const [gpsAccuracy, setGpsAccuracy] = useState(4.2);
  const [satelliteCount, setSatelliteCount] = useState(11);
  const [jitterCoords, setJitterCoords] = useState<{ lat: number; lng: number }>(restaurantCoords);

  // Initialize initial WebSocket logs
  useEffect(() => {
    if (!activeTrackingOrder) return;
    setTelemetryLogs([
      {
        id: 'init_conn',
        timestamp: new Date().toLocaleTimeString(),
        message: `Establishing secure WS connection to wss://gateway.nuvvo.in/tracking/live...`,
        type: 'info'
      },
      {
        id: 'init_auth',
        timestamp: new Date().toLocaleTimeString(),
        message: `Authorized token for Order ID ${activeTrackingOrder.id.slice(-6).toUpperCase()}`,
        type: 'info'
      },
      {
        id: 'init_sub',
        timestamp: new Date().toLocaleTimeString(),
        message: `Subscribed to channel: rider_coordinates_shravan`,
        type: 'info'
      }
    ]);
  }, [activeTrackingOrder?.id]);

  // Periodic simulated polling for WS frame receipt
  useEffect(() => {
    if (!activeTrackingOrder || !isPolling) return;

    // Run first coordinate snap
    const baseLat = restaurantCoords.lat + (destinationCoords.lat - restaurantCoords.lat) * (deliveryRouteProgress / 100);
    const baseLng = restaurantCoords.lng + (destinationCoords.lng - restaurantCoords.lng) * (deliveryRouteProgress / 100);
    setJitterCoords({ lat: parseFloat(baseLat.toFixed(6)), lng: parseFloat(baseLng.toFixed(6)) });

    const interval = setInterval(() => {
      // 1. Calculate base coordinate
      const currentProgressLat = restaurantCoords.lat + (destinationCoords.lat - restaurantCoords.lat) * (deliveryRouteProgress / 100);
      const currentProgressLng = restaurantCoords.lng + (destinationCoords.lng - restaurantCoords.lng) * (deliveryRouteProgress / 100);

      // 2. Add realistic GPS jitter
      const latJitter = (Math.random() - 0.5) * 0.00015;
      const lngJitter = (Math.random() - 0.5) * 0.00015;
      const finalLat = parseFloat((currentProgressLat + latJitter).toFixed(6));
      const finalLng = parseFloat((currentProgressLng + lngJitter).toFixed(6));
      setJitterCoords({ lat: finalLat, lng: finalLng });

      // 3. Fluctuating statistics
      const nextSpeed = Math.floor(32 + Math.random() * 14); // 32 to 45 km/h
      const nextAccuracy = parseFloat((3.0 + Math.random() * 3.5).toFixed(1)); // 3.0 to 6.5 meters
      const nextSatellites = Math.floor(10 + Math.random() * 4); // 10 to 13
      setCurrentSpeed(nextSpeed);
      setGpsAccuracy(nextAccuracy);
      setSatelliteCount(nextSatellites);
      setBatteryLevel(prev => Math.max(10, prev - (Math.random() < 0.1 ? 1 : 0))); // occasionally drop battery by 1%

      // 4. Build telemetry log message
      const frameData = {
        lat: finalLat,
        lng: finalLng,
        speed: `${nextSpeed}km/h`,
        satellites: nextSatellites,
        accuracy: `${nextAccuracy}m`,
        progress: `${deliveryRouteProgress}%`
      };

      setTelemetryLogs(prev => [
        {
          id: `log_${Date.now()}`,
          timestamp: new Date().toLocaleTimeString(),
          message: `Frame Rx: ${JSON.stringify(frameData)}`,
          type: 'rx'
        },
        ...prev.slice(0, 24) // Keep last 25 logs
      ]);

    }, 2000); // Polling every 2 seconds

    return () => clearInterval(interval);
  }, [isPolling, deliveryRouteProgress, restaurantCoords, destinationCoords, activeTrackingOrder?.id]);
  
  // Post-order feedback states - Rate Food, Rate Restaurant, Rate Delivery Partner
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [mealRating, setMealRating] = useState(0);
  const [restaurantRating, setRestaurantRating] = useState(0);
  const [deliveryRating, setDeliveryRating] = useState(0);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [isFeedbackSubmitted, setIsFeedbackSubmitted] = useState(false);
  const [hoverMealRating, setHoverMealRating] = useState(0);
  const [hoverRestaurantRating, setHoverRestaurantRating] = useState(0);
  const [hoverDeliveryRating, setHoverDeliveryRating] = useState(0);

  useEffect(() => {
    if (activeTrackingOrder?.status === 'delivered') {
      const feedbackKey = `nuvvo_feedback_${activeTrackingOrder.id}`;
      if (!localStorage.getItem(feedbackKey)) {
        const timer = setTimeout(() => {
          setShowFeedbackModal(true);
        }, 800);
        return () => clearTimeout(timer);
      }
    }
  }, [activeTrackingOrder?.status, activeTrackingOrder?.id]);

  const handleFeedbackSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mealRating === 0 || restaurantRating === 0 || deliveryRating === 0) return;

    const restId = activeTrackingOrder?.items[0]?.foodItem?.restaurantId || 'rest_1';

    submitRestaurantReview({
      orderId: activeTrackingOrder?.id || `ord_${Date.now()}`,
      customerId: user?.id || 'anon',
      customerName: user?.name || 'Anonymous Customer',
      restaurantId: restId,
      foodRating: mealRating,
      restaurantRating: restaurantRating,
      deliveryRating: deliveryRating,
      comment: feedbackComment,
    });

    localStorage.setItem(`nuvvo_feedback_${activeTrackingOrder?.id}`, 'submitted');
    setIsFeedbackSubmitted(true);
  };
  
  // Share Action Toast States
  const [shareCopied, setShareCopied] = useState(false);
  const [shareError, setShareError] = useState(false);

  const handleShareTrackingLink = async () => {
    const trackingUrl = `${window.location.origin}${window.location.pathname}?orderId=${activeTrackingOrder?.id}&track=true`;
    
    const shareData = {
      title: `🍔 Track my Nuvvo Feast Live!`,
      text: `My order "${activeTrackingOrder?.id.split('_')[1] || activeTrackingOrder?.id}" from Nuvvo is on its way! Track my live delivery route in real-time here:`,
      url: trackingUrl
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(trackingUrl);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 3000);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error("Web Share API failed, using clipboard fallback:", err);
        try {
          await navigator.clipboard.writeText(trackingUrl);
          setShareCopied(true);
          setTimeout(() => setShareCopied(false), 3000);
        } catch (clipErr) {
          console.error("Clipboard copy failed as well:", clipErr);
          setShareError(true);
          setTimeout(() => setShareError(false), 3000);
        }
      }
    }
  };

  // Chat Support Interface State
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'driver' | 'restaurant'>('driver');
  const [inputText, setInputText] = useState('');
  
  const [driverMessages, setDriverMessages] = useState<{ id: string; sender: 'user' | 'partner'; text: string; timestamp: string }[]>(() => {
    if (!activeTrackingOrder) return [];
    const key = `nuvvo_chat_driver_${activeTrackingOrder.id}`;
    const stored = localStorage.getItem(key);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        console.error('Failed to parse driver messages:', e);
      }
    }
    const activeRiderTitle = activeTrackingOrder?.deliveryPartnerName || assignedPartner?.name;
    return [
      {
        id: 'driver_init',
        sender: 'partner',
        text: activeRiderTitle 
          ? `Hi there, this is ${activeRiderTitle}, your delivery partner. I'm prep-riding my vehicle near Chirala road and heading to the kitchen coordinate. Feel free to text me with gate codes or other drop instructions! 🛵`
          : "Order confirmed! Our kitchen is preparing your package. A delivery partner will be assigned shortly once ready for dispatch! 🛵",
        timestamp: new Date(new Date(activeTrackingOrder.date).getTime() + 10000).toISOString()
      }
    ];
  });

  const [restaurantMessages, setRestaurantMessages] = useState<{ id: string; sender: 'user' | 'partner'; text: string; timestamp: string }[]>(() => {
    if (!activeTrackingOrder) return [];
    const key = `nuvvo_chat_restaurant_${activeTrackingOrder.id}`;
    const stored = localStorage.getItem(key);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        console.error('Failed to parse restaurant messages:', e);
      }
    }
    return [
      {
        id: 'restaurant_init',
        sender: 'partner',
        text: `Chef team here! We've received your ticket and are currently hot-boxing your fresh culinary package. Let us know if you have any special instructions like spice adjustment or cutlery packing! 🍳`,
        timestamp: new Date(new Date(activeTrackingOrder.date).getTime() + 2000).toISOString()
      }
    ];
  });

  const [isDriverTyping, setIsDriverTyping] = useState(false);
  const [isRestaurantTyping, setIsRestaurantTyping] = useState(false);
  const [unreadDriverCount, setUnreadDriverCount] = useState(0);
  const [unreadRestaurantCount, setUnreadRestaurantCount] = useState(1); // Start with welcome indicator

  const messageEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom helper
  useEffect(() => {
    if (messageEndRef.current) {
      messageEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [driverMessages, restaurantMessages, isDriverTyping, isRestaurantTyping, activeTab, isChatOpen]);

  // Persist messages to LocalStorage
  useEffect(() => {
    if (!activeTrackingOrder) return;
    localStorage.setItem(`nuvvo_chat_driver_${activeTrackingOrder.id}`, JSON.stringify(driverMessages));
  }, [driverMessages, activeTrackingOrder]);

  useEffect(() => {
    if (!activeTrackingOrder) return;
    localStorage.setItem(`nuvvo_chat_restaurant_${activeTrackingOrder.id}`, JSON.stringify(restaurantMessages));
  }, [restaurantMessages, activeTrackingOrder]);

  // Clear unreads on tab dynamic shift
  useEffect(() => {
    if (isChatOpen) {
      if (activeTab === 'driver') {
        setUnreadDriverCount(0);
      } else {
        setUnreadRestaurantCount(0);
      }
    }
  }, [isChatOpen, activeTab]);

  // Audio chime for incoming chat message notifications
  const playMessageChime = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08); // A5
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.35);
    } catch {
      // Audio autoplay restrictions handled gracefully
    }
  };

  // Automated intelligent replying router
  const handleSendMessage = (textOverride?: string) => {
    const rawMsg = textOverride || inputText;
    if (!rawMsg.trim()) return;

    const userMessage = {
      id: `msg_${Date.now()}`,
      sender: 'user' as const,
      text: rawMsg,
      timestamp: new Date().toISOString()
    };

    if (activeTab === 'driver') {
      setDriverMessages(prev => [...prev, userMessage]);
      setInputText('');
      setIsDriverTyping(true);

      setTimeout(() => {
        setIsDriverTyping(false);
        let replyText = "Understood perfectly! I have noted your delivery instructions and will follow them carefully while delivering. Riding safely! 🛵";
        const low = rawMsg.toLowerCase();
        
        if (low.includes('door') || low.includes('doorstep') || low.includes('porch') || low.includes('front')) {
          replyText = "Understood! I will leave your order right at your doorstep and send a confirmation ping. Contactless delivery ensured! 🚪📦";
        } else if (low.includes('bell') || low.includes('ring') || low.includes('knock') || low.includes('quiet') || low.includes('sleep') || low.includes('baby') || low.includes('shh')) {
          replyText = "Noted! I will NOT ring the doorbell or knock loudly. I will leave the food gently at the door and give you a soft missed call. 🤫";
        } else if (low.includes('guard') || low.includes('security') || low.includes('gate') || low.includes('watchman') || low.includes('lobby') || low.includes('reception')) {
          replyText = "Got it! I will hand over the food parcel safely to your building security guard / lobby reception and update you. 🏢";
        } else if (low.includes('call') || low.includes('phone') || low.includes('dial') || low.includes('reach') || low.includes('arrive') || low.includes('arrival')) {
          replyText = `Absolutely! As soon as my motorcycle rolls up near your street coordinate or apartment lobby, I will stop and dial your phone number (+91 ${riderPhone || 'your contact'}) instantly! 📞`;
        } else if (low.includes('dog') || low.includes('pet') || low.includes('cat') || low.includes('bark')) {
          replyText = "Thanks for the heads-up about your dog! I will stay cautious, keep a safe distance, and leave the package securely by the gate latch. 🐕";
        } else if (low.includes('where') || low.includes('status') || low.includes('far') || low.includes('location') || low.includes('map') || low.includes('eta')) {
          replyText = `I am currently crossing the Chirala bypass speedway! The live GPS radar shows about ${simulatedDistance} km remaining. I will ensure the food package stays ultra-piping hot inside our thermal carrier box! 🏍️`;
        } else if (low.includes('spoon') || low.includes('fork') || low.includes('cutlery') || low.includes('tissue') || low.includes('napkin')) {
          replyText = "Rest assured! I checked with the hotel kitchen dispatcher to verify they added heavy-duty wooden cutleries and multiple hygiene tissues before sealing up the outer packet. 🍴";
        } else if (low.includes('spicy') || low.includes('spice') || low.includes('salt') || low.includes('chill')) {
          replyText = "Ah! For direct food culinary adjustments, you can drop a chat message to the Restaurant Chef on the other tab too! I'll also double check the package label before departing.";
        }

        const systemReply = {
          id: `reply_${Date.now()}`,
          sender: 'partner' as const,
          text: replyText,
          timestamp: new Date().toISOString()
        };

        setDriverMessages(prev => [...prev, systemReply]);
        playMessageChime();
        if (!isChatOpen) {
          setUnreadDriverCount(prev => prev + 1);
        }
      }, 1200);

    } else {
      setRestaurantMessages(prev => [...prev, userMessage]);
      setInputText('');
      setIsRestaurantTyping(true);

      setTimeout(() => {
        setIsRestaurantTyping(false);
        let replyText = "Hello! The chef team has received and registered your instruction. We are crafting and double-checking your orders with care.";
        const low = rawMsg.toLowerCase();
        
        if (low.includes('spicy') || low.includes('spice') || low.includes('hot') || low.includes('pepper') || low.includes('chill') || low.includes('masala')) {
          replyText = "Perfect! Our head chef of the tiffin station has adjusted the coastal spice blend to match your request perfectly. Your dishes are sizzling inside the tandoor clay ovens right now! 🌶️";
        } else if (low.includes('cutlery') || low.includes('spoon') || low.includes('fork') || low.includes('tissue') || low.includes('plates')) {
          replyText = "Of course! We are dropping high-grade disposable eco-friendly wooden spoons and hand-towel napkins inside the secure heat-lock bag right now. 🍴";
        } else if (low.includes('fresh') || low.includes('hot') || low.includes('good') || low.includes('cook') || low.includes('clean')) {
          replyText = "We source all premium ingredients fresh daily from Chirala's local farmer co-ops and clean seafood docks. Your checkout order is cooked and packed under 100% strict hygienic compliance rules. 🔥";
        } else if (low.includes('onion') || low.includes('garlic') || low.includes('diet') || low.includes('allergy') || low.includes('veg')) {
          replyText = "Understood. The chef has highlighted this constraint on the prep board. We are isolating clean utensils to prepare your meal safely away from non-eligible allergens. 🥦";
        }

        const systemReply = {
          id: `reply_${Date.now()}`,
          sender: 'partner' as const,
          text: replyText,
          timestamp: new Date().toISOString()
        };

        setRestaurantMessages(prev => [...prev, systemReply]);
        playMessageChime();
        if (!isChatOpen) {
          setUnreadRestaurantCount(prev => prev + 1);
        }
      }, 1200);
    }
  };

  // Helper to open chat directly focused on the delivery partner
  const openDriverChat = (instructionPreset?: string) => {
    setActiveTab('driver');
    setIsChatOpen(true);
    if (instructionPreset) {
      setTimeout(() => {
        handleSendMessage(instructionPreset);
      }, 150);
    }
  };

  // Countdown timer for 2-minute cancellation limit
  useEffect(() => {
    if (!activeTrackingOrder) return;
    const orderTime = new Date(activeTrackingOrder.date).getTime();
    
    const updateTime = () => {
      const elapsed = Date.now() - orderTime;
      const remaining = 120000 - elapsed; // 2 minutes in ms
      setTimeLeftMs(Math.max(0, remaining));
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [activeTrackingOrder]);

  // Baseline total distance between restaurant and customer address
  const totalRouteDistanceKm = useMemo(() => {
    if (!restaurantCoords || !destinationCoords) return 2.8;
    const calc = calculateDistanceKm(restaurantCoords.lat, restaurantCoords.lng, destinationCoords.lat, destinationCoords.lng);
    return Math.max(1.4, Math.min(12, calc));
  }, [restaurantCoords, destinationCoords]);

  // Current real-time distance from delivery partner's current position to destination
  const currentDistanceKm = useMemo(() => {
    if (activeTrackingOrder?.status === 'delivered') return 0;
    if (activeTrackingOrder?.status === 'cancelled') return 0;

    const remainingFraction = Math.max(0, 1 - (deliveryRouteProgress / 100));

    // When in transit ('picked' or 'on_the_way'), calculate from actual current GPS position (jitterCoords)
    if (activeTrackingOrder?.status === 'picked' || activeTrackingOrder?.status === 'on_the_way') {
      const geoDist = calculateDistanceKm(jitterCoords.lat, jitterCoords.lng, destinationCoords.lat, destinationCoords.lng);
      const progressDist = totalRouteDistanceKm * remainingFraction;
      const blended = Math.max(0.1, (geoDist * 0.35) + (progressDist * 0.65));
      return parseFloat(blended.toFixed(2));
    }

    return parseFloat((totalRouteDistanceKm * remainingFraction).toFixed(2));
  }, [activeTrackingOrder?.status, deliveryRouteProgress, jitterCoords, destinationCoords, totalRouteDistanceKm]);

  // Function to calculate estimated arrival seconds based on distance, speed, and order stage
  const calculateEtaSeconds = (distanceKm: number, speedKmH: number, status?: string): number => {
    if (status === 'delivered' || distanceKm <= 0.05) return 0;
    if (status === 'cancelled') return 0;

    const safeSpeed = Math.max(20, Math.min(50, speedKmH || 36));
    const transitSeconds = Math.round((distanceKm / safeSpeed) * 3600);
    const doorstepHandoffBufferSeconds = 75; // ~1.25 minutes

    let stageBufferSeconds = 0;
    if (status === 'accepted') {
      stageBufferSeconds = 720; // 12 minutes kitchen prep
    } else if (status === 'preparing') {
      stageBufferSeconds = 360; // 6 minutes remaining cooking
    }

    return Math.max(30, transitSeconds + doorstepHandoffBufferSeconds + stageBufferSeconds);
  };

  // Dynamic live ticking countdown state (in seconds)
  const [countdownSeconds, setCountdownSeconds] = useState<number>(() => {
    return calculateEtaSeconds(2.8, 38, activeTrackingOrder?.status);
  });

  // Synchronize target seconds based on distance whenever distance, speed, or status changes
  useEffect(() => {
    if (!activeTrackingOrder) return;
    if (activeTrackingOrder.status === 'delivered') {
      setCountdownSeconds(0);
      setEtaRemaining(0);
      setSimulatedDistance(0);
      return;
    }

    const targetSeconds = calculateEtaSeconds(currentDistanceKm, currentSpeed, activeTrackingOrder.status);
    
    // Smoothly resynchronize countdown if it drifted significantly from distance (> 12 seconds) or initial 0
    setCountdownSeconds(prev => {
      if (Math.abs(prev - targetSeconds) > 12 || prev === 0) {
        return targetSeconds;
      }
      return prev;
    });

    setSimulatedDistance(currentDistanceKm);
    setEtaRemaining(Math.max(1, Math.ceil(targetSeconds / 60)));
  }, [currentDistanceKm, currentSpeed, activeTrackingOrder?.status]);

  // Live second-by-second countdown ticker
  useEffect(() => {
    if (!activeTrackingOrder || activeTrackingOrder.status === 'delivered' || activeTrackingOrder.status === 'cancelled') {
      return;
    }

    const ticker = setInterval(() => {
      setCountdownSeconds(prev => {
        if (prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(ticker);
  }, [activeTrackingOrder?.status]);

  const countdownMinutes = Math.floor(countdownSeconds / 60);
  const countdownSecs = countdownSeconds % 60;
  const formattedCountdown = `${countdownMinutes}:${countdownSecs.toString().padStart(2, '0')}`;
  const arrivalClockTime = useMemo(() => {
    const arrivalTime = new Date(Date.now() + countdownSeconds * 1000);
    return arrivalTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }, [countdownSeconds]);

  // Proximity Alert Chime Player (Harmonic alert chime with haptic vibration)
  const playProximityChime = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, ctx.currentTime); // A5
      gain1.gain.setValueAtTime(0.2, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + 0.25);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1318.51, ctx.currentTime + 0.12); // E6
      gain2.gain.setValueAtTime(0.25, ctx.currentTime + 0.12);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(ctx.currentTime + 0.12);
      osc2.stop(ctx.currentTime + 0.45);

      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([200, 100, 200]);
      }
    } catch (e) {
      console.warn('Proximity chime could not play:', e);
    }
  };

  // 500m Proximity Alert States (Notified only once per active delivery cycle)
  const [hasTriggeredProximityAlert, setHasTriggeredProximityAlert] = useState<boolean>(() => {
    if (!activeTrackingOrder) return false;
    return Boolean(localStorage.getItem(`nuvvo_proximity_500m_${activeTrackingOrder.id}`));
  });
  const [showProximityBanner, setShowProximityBanner] = useState<boolean>(false);

  // Monitor 500m (0.5 km) proximity threshold
  useEffect(() => {
    if (!activeTrackingOrder) return;
    const isTransit = activeTrackingOrder.status === 'picked' || activeTrackingOrder.status === 'on_the_way';
    
    // Automatically close banner if order gets delivered or cancelled
    if (activeTrackingOrder.status === 'delivered' || activeTrackingOrder.status === 'cancelled') {
      setShowProximityBanner(false);
      return;
    }

    if (!isTransit) return;

    const storageKey = `nuvvo_proximity_500m_${activeTrackingOrder.id}`;
    const alreadyFired = Boolean(localStorage.getItem(storageKey));

    // Threshold: 500 meters (0.5 km)
    if (currentDistanceKm <= 0.5 && !alreadyFired && !hasTriggeredProximityAlert) {
      localStorage.setItem(storageKey, 'true');
      setHasTriggeredProximityAlert(true);
      setShowProximityBanner(true);

      // Play double-tone audio chime and haptic vibration
      playProximityChime();

      const title = `🛵 Delivery Partner is within 500 meters!`;
      const body = `${riderName} is arriving at your doorstep (~${Math.round(currentDistanceKm * 1000)}m away). Please prepare for handover!`;

      // 1. Dispatch into App Notification center
      if (triggerPushNotification) {
        triggerPushNotification(
          activeTrackingOrder.id,
          'on_the_way',
          title,
          body,
          false,
          'customers'
        );
      }

      // 2. Dispatch native browser/device Notification if permitted
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification(title, {
            body,
            icon: '/nuvvo-logo.png',
            tag: `proximity-500m-${activeTrackingOrder.id}`,
            requireInteraction: true
          });
        } catch (err) {
          console.warn('Native notification trigger failed:', err);
        }
      }
    } else if (currentDistanceKm <= 0.5 && isTransit) {
      setShowProximityBanner(true);
    } else if (currentDistanceKm > 0.5) {
      setShowProximityBanner(false);
    }
  }, [currentDistanceKm, activeTrackingOrder?.status, activeTrackingOrder?.id, hasTriggeredProximityAlert, riderName, triggerPushNotification]);

  const handleTestProximityAlert = () => {
    playProximityChime();
    setShowProximityBanner(true);
    const title = `🛵 Delivery Partner is within 500 meters!`;
    const body = `${riderName} is arriving at your doorstep (~380m away). Please prepare for handover!`;

    if (triggerPushNotification) {
      triggerPushNotification(
        activeTrackingOrder?.id || 'order_test',
        'on_the_way',
        title,
        body,
        false,
        'customers'
      );
    }

    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body,
          icon: '/nuvvo-logo.png',
          tag: `proximity-500m-test-${Date.now()}`
        });
      } catch (e) {}
    }
  };



  if (!activeTrackingOrder) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 flex flex-col items-center justify-center p-6 text-center pb-24 transition-colors duration-300">
        <div className="w-24 h-24 rounded-full bg-black p-1 border border-amber-500/40 shadow-2xl flex items-center justify-center mb-4">
          <img src="/nuvvo-logo.png" alt="Nuvvo Logo" className="w-full h-full rounded-full object-contain" referrerPolicy="no-referrer" />
        </div>
        <p className="text-zinc-600 dark:text-zinc-450 font-bold text-sm">No active delivery is currently underway.</p>
        <p className="text-xs text-zinc-450 dark:text-zinc-500 mt-1 max-w-xs">Once you submit an order request from your cart, live coordinate simulations appear here.</p>
        <button 
          onClick={() => setCurrentPage('home')}
          className="mt-5 bg-orange-500 text-white font-bold text-xs px-5 py-2.5 rounded-lg shadow"
        >
          Browse Dishes
        </button>
      </div>
    );
  }

  // Beautifully handle when this order gets cancelled (either in the history or directly here)
  if (activeTrackingOrder.status === 'cancelled') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 flex flex-col items-center justify-center p-6 text-center pb-24 transition-colors duration-300">
        <div className="w-20 h-20 bg-rose-100 dark:bg-rose-950/20 rounded-full flex items-center justify-center text-rose-500 mb-4 border border-rose-200">
          <AlertTriangle className="w-10 h-10 animate-bounce text-rose-500" />
        </div>
        <h2 className="text-base font-black text-rose-600 dark:text-rose-450 uppercase tracking-tight">Order Cancelled</h2>
        <p className="text-zinc-600 dark:text-zinc-300 font-bold text-sm mt-2 max-w-sm">
          Order #{activeTrackingOrder.id.split('_')[1] || activeTrackingOrder.id} has been voided.
        </p>
        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1 max-w-xs mx-auto leading-relaxed">
          The transaction logs were cleared and preparation slips aborted. Full reimbursement balance back on source.
        </p>
        <button 
          onClick={() => setCurrentPage('home')}
          className="mt-6 bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-xs px-6 py-3 rounded-2xl shadow transition cursor-pointer"
        >
          Back To Kitchen Store
        </button>
      </div>
    );
  }

  interface TimelineStage {
    id: 'placed' | 'preparing' | 'out_for_delivery' | 'delivered';
    stepNumber: number;
    label: string; // 'Order Placed', 'Preparing', 'Out for Delivery', 'Delivered'
    shortLabel: string;
    desc: string;
    detailedDesc: string;
    icon: string;
    time: string;
    isCompleted: boolean;
    isActive: boolean;
    statusKey: OrderStatus;
  }

  const getStageIndex = (status?: string): number => {
    switch (status) {
      case 'accepted': return 0; // Order Placed
      case 'preparing': return 1; // Preparing
      case 'picked':
      case 'on_the_way': return 2; // Out for Delivery
      case 'delivered': return 3; // Delivered
      case 'cancelled': return -1;
      default: return 0;
    }
  };

  const currentStageIndex = getStageIndex(activeTrackingOrder.status);
  const timelineProgressPercent = Math.max(0, Math.min(100, (currentStageIndex / 3) * 100));

  const orderBaseTime = activeTrackingOrder.date ? new Date(activeTrackingOrder.date).getTime() : Date.now();
  const formatStageTime = (offsetMinutes: number) => {
    return new Date(orderBaseTime + offsetMinutes * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const stages: TimelineStage[] = [
    {
      id: 'placed',
      stepNumber: 1,
      label: 'Order Placed',
      shortLabel: 'Placed',
      desc: 'Order confirmed & ticket issued to kitchen',
      detailedDesc: `Order #${activeTrackingOrder.id.split('_')[1] || activeTrackingOrder.id} successfully placed at ${restaurantName}. Payment: ${activeTrackingOrder.paymentStatus === 'confirmed' || activeTrackingOrder.paymentStatus === 'success' ? 'Confirmed' : activeTrackingOrder.paymentMethod || 'UPI'}.`,
      icon: '📝',
      time: formatStageTime(0),
      isCompleted: currentStageIndex > 0,
      isActive: currentStageIndex === 0,
      statusKey: 'accepted',
    },
    {
      id: 'preparing',
      stepNumber: 2,
      label: 'Preparing',
      shortLabel: 'Cooking',
      desc: 'Our chefs are cooking your fresh plate with care',
      detailedDesc: `${activeTrackingOrder.items.length} culinary dish(es) are hot-boxed with 100% tamper-proof safety tape.`,
      icon: '🍳',
      time: formatStageTime(4),
      isCompleted: currentStageIndex > 1,
      isActive: currentStageIndex === 1,
      statusKey: 'preparing',
    },
    {
      id: 'out_for_delivery',
      stepNumber: 3,
      label: 'Out for Delivery',
      shortLabel: 'In Transit',
      desc: 'Rider is speeding down the path with your hot bag',
      detailedDesc: `${hasAssignedRider ? riderName : 'Assigned delivery partner'} is en route. Approx. ${simulatedDistance} km remaining to your delivery address.`,
      icon: '🛵',
      time: formatStageTime(15),
      isCompleted: currentStageIndex > 2,
      isActive: currentStageIndex === 2,
      statusKey: 'on_the_way',
    },
    {
      id: 'delivered',
      stepNumber: 4,
      label: 'Delivered',
      shortLabel: 'Delivered',
      desc: 'Arrived! Consolidated package dropped at your door',
      detailedDesc: `Consolidated order package handed over safely at ${activeTrackingOrder.address?.flatNo || 'your address'}, ${activeTrackingOrder.address?.area || 'Chirala'}. Enjoy your warm meal!`,
      icon: '😋',
      time: formatStageTime(25),
      isCompleted: currentStageIndex >= 3,
      isActive: currentStageIndex === 3,
      statusKey: 'delivered',
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 pb-32 transition-colors duration-300 relative">
      
      {/* Custom Share Toast Notification overlays */}
      <AnimatePresence>
        {shareCopied && (
          <motion.div 
            initial={{ opacity: 0, y: 50, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: 20, x: "-50%" }}
            className="fixed bottom-24 left-1/2 bg-zinc-900 border border-zinc-800 text-white font-sans text-xs px-4 py-2.5 rounded-full shadow-2xl z-50 flex items-center gap-2"
          >
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <span>Tracking link copied to clipboard!</span>
          </motion.div>
        )}
        {shareError && (
          <motion.div 
            initial={{ opacity: 0, y: 50, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: 20, x: "-50%" }}
            className="fixed bottom-24 left-1/2 bg-red-650 border border-red-550 text-white font-sans text-xs px-4 py-2.5 rounded-full shadow-2xl z-50 flex items-center gap-2"
          >
            <AlertTriangle className="w-4 h-4 text-amber-300" />
            <span>Unable to share the tracking link.</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="sticky top-0 bg-white dark:bg-zinc-900 border-b border-slate-100 dark:border-zinc-800 p-4 z-10 flex items-center justify-between">
        <div className="flex items-center gap-2 max-w-[65%]">
          <div className="flex items-center gap-1 shrink-0 mr-1">
            <button
              onClick={pageHistory.length > 1 ? goBack : closePage}
              className="p-1.5 bg-slate-150 dark:bg-zinc-800 hover:bg-slate-250 dark:hover:bg-zinc-700 rounded-full text-zinc-700 dark:text-zinc-300 transition-all cursor-pointer active:scale-95 flex items-center justify-center shrink-0"
              title="Go Back"
              id="tracking-screen-back-btn"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={closePage}
              className="p-1.5 bg-slate-150 dark:bg-zinc-800 hover:bg-slate-250 dark:hover:bg-zinc-700 rounded-full text-zinc-700 dark:text-zinc-300 transition-all cursor-pointer active:scale-95 flex items-center justify-center shrink-0"
              title="Close to Home"
              id="tracking-screen-close-btn"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="w-8 h-8 rounded-full bg-black p-0.5 border border-amber-500/30 shrink-0 flex items-center justify-center shadow-xs">
            <img src="/nuvvo-logo.png" alt="Nuvvo Logo" className="w-full h-full rounded-full object-contain" referrerPolicy="no-referrer" />
          </div>
          <div className="overflow-hidden">
            <span className="text-[10px] font-mono bg-orange-500/10 text-orange-600 px-2 py-0.5 rounded-md font-bold inline-block">LIVE GPS POSITIONING</span>
            <h2 className="text-sm font-black text-zinc-900 dark:text-zinc-50 tracking-tight mt-0.5 truncate">Tracking Order {activeTrackingOrder.id.split('_')[1] || activeTrackingOrder.id}</h2>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            id="share-tracking-button"
            onClick={handleShareTrackingLink}
            className="p-2 bg-orange-50 dark:bg-orange-950/25 text-orange-600 dark:text-orange-400 rounded-full hover:bg-orange-100 dark:hover:bg-orange-955/30 flex items-center gap-1.5 text-xs font-bold cursor-pointer transition-colors duration-200"
            title="Share tracking link with friends"
          >
            <Share2 className="w-3.5 h-3.5" /> Share
          </button>

          <button 
            onClick={() => clickToWhatsAppSupport(`Queries about order index ${activeTrackingOrder.id}`)}
            className="p-2 bg-emerald-50 text-emerald-600 rounded-full hover:bg-emerald-100 flex items-center gap-1 text-xs font-bold cursor-pointer"
          >
            <Phone className="w-4 h-4" /> Help
          </button>
        </div>
      </div>

      <div className="p-4 max-w-md mx-auto space-y-4">
        
        {/* LOCAL NOTIFICATION PROXIMITY BANNER (< 500 METERS) */}
        <AnimatePresence>
          {showProximityBanner && (
            <motion.div
              id="proximity-alert-banner"
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              className="bg-gradient-to-r from-amber-500 via-orange-500 to-emerald-600 p-0.5 rounded-3xl shadow-2xl relative overflow-hidden"
            >
              <div className="bg-zinc-950/95 backdrop-blur-md rounded-[22px] p-4 text-white space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-2xl bg-orange-500/20 border border-orange-500/40 flex items-center justify-center text-xl shrink-0 shadow-inner">
                      🛵
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[9.5px] font-black uppercase tracking-wider bg-orange-500 text-white px-2 py-0.5 rounded-full font-mono flex items-center gap-1">
                          <BellRing className="w-3 h-3 animate-bounce" /> 500m Proximity Alert
                        </span>
                        <span className="text-[9.5px] text-emerald-400 font-mono font-bold">
                          ~{Math.round(currentDistanceKm * 1000)}m away
                        </span>
                      </div>
                      <h3 className="text-xs font-black text-white mt-1 leading-tight">
                        {riderName} is arriving at your doorstep!
                      </h3>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowProximityBanner(false)}
                    className="p-1 rounded-full text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 transition cursor-pointer"
                    title="Dismiss alert"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <p className="text-[11px] text-zinc-300 leading-relaxed font-medium">
                  Your delivery partner is within 500 meters of your delivery address. Please ensure someone is available at the door for handover.
                </p>

                <div className="flex items-center justify-between gap-2 pt-1 border-t border-zinc-800/80 flex-wrap">
                  <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 font-mono">
                    <Clock className="w-3 h-3 text-orange-400" />
                    <span>ETA: <strong className="text-white">{formattedCountdown}</strong> ({currentSpeed} km/h)</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => openDriverChat()}
                      className="bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-bold text-[10.5px] py-1.5 px-2.5 rounded-xl flex items-center gap-1 shadow transition cursor-pointer"
                    >
                      <MessageSquare className="w-3 h-3" /> Instructions
                    </button>

                    {riderPhone && (
                      <a
                        href={`tel:${riderPhone}`}
                        className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-[10.5px] py-1.5 px-2.5 rounded-xl flex items-center gap-1 shadow transition"
                      >
                        <Phone className="w-3 h-3" /> Call
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* PAYMENT VERIFICATION STATUS CARD (Requirements #8, #14 & #15) */}
        {activeTrackingOrder && (
          <div id="tracking-payment-status-card" className="bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 rounded-3xl p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-orange-500/10 text-orange-600">
                  <Smartphone className="w-4 h-4" />
                </span>
                <div>
                  <h4 className="text-xs font-black text-zinc-900 dark:text-zinc-50 uppercase tracking-tight">
                    {activeTrackingOrder.paymentMethod || 'UPI Payment'}
                  </h4>
                  <p className="text-[10px] text-zinc-400 font-mono">
                    Final Payable: ₹{activeTrackingOrder.finalAmount}
                  </p>
                </div>
              </div>

              {/* Status Badge */}
              <span className={`text-[9.5px] font-black uppercase px-2.5 py-1 rounded-full ${
                activeTrackingOrder.paymentStatus === 'confirmed' || activeTrackingOrder.paymentStatus === 'success'
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30'
                  : activeTrackingOrder.paymentStatus === 'awaiting_confirmation'
                  ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 animate-pulse'
                  : activeTrackingOrder.paymentStatus === 'initiated'
                  ? 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border border-blue-500/30'
                  : activeTrackingOrder.paymentStatus === 'failed'
                  ? 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
              }`}>
                {activeTrackingOrder.paymentStatus === 'confirmed' || activeTrackingOrder.paymentStatus === 'success'
                  ? '✅ Payment Confirmed'
                  : activeTrackingOrder.paymentStatus === 'awaiting_confirmation'
                  ? '🔍 Awaiting Payment Confirmation'
                  : activeTrackingOrder.paymentStatus === 'initiated'
                  ? '🚀 Payment Initiated'
                  : activeTrackingOrder.paymentStatus === 'failed'
                  ? '❌ Payment Failed'
                  : '⏳ Payment Pending'}
              </span>
            </div>

            {/* Explanatory Message */}
            <div className={`p-3 rounded-2xl text-[10.5px] leading-relaxed ${
              activeTrackingOrder.paymentStatus === 'confirmed' || activeTrackingOrder.paymentStatus === 'success'
                ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-500/20'
                : activeTrackingOrder.paymentStatus === 'awaiting_confirmation'
                ? 'bg-amber-500/10 text-amber-900 dark:text-amber-200 border border-amber-500/25'
                : 'bg-slate-50 dark:bg-zinc-850 text-zinc-600 dark:text-zinc-300 border border-slate-100 dark:border-zinc-800'
            }`}>
              {activeTrackingOrder.paymentStatus === 'confirmed' || activeTrackingOrder.paymentStatus === 'success' ? (
                <p className="flex items-center gap-1.5 font-bold">
                  <span>✓ Payment confirmed by store admin externally. Your order is safely verified and dispatched.</span>
                </p>
              ) : activeTrackingOrder.paymentStatus === 'awaiting_confirmation' ? (
                <div className="space-y-1">
                  <p className="font-black text-amber-900 dark:text-amber-200">
                    Payment initiated. Please confirm that you completed the UPI payment.
                  </p>
                  <p className="text-[10px] text-amber-800/90 dark:text-amber-300">
                    Our team verifies transactions externally against receiver UPI: <strong className="font-mono">{activeTrackingOrder.upiDetails?.upiId || storePaymentSettings?.upiId || 'arjun.gorrepati@axl'}</strong> ({activeTrackingOrder.upiDetails?.bankName || storePaymentSettings?.bankName || 'PhonePe Account'}). Status will update to Confirmed once verified by the store admin.
                  </p>
                </div>
              ) : (
                <p>
                  Order placed. Payment status: <strong>{activeTrackingOrder.paymentStatus || 'Pending'}</strong>.
                </p>
              )}
            </div>

            {/* UPI Details Row if available */}
            {activeTrackingOrder.upiDetails && (
              <div className="flex flex-wrap items-center justify-between gap-1 text-[9.5px] text-zinc-400 font-mono pt-0.5 px-1">
                {activeTrackingOrder.upiDetails.transactionRef && (
                  <span>Ref: #{activeTrackingOrder.upiDetails.transactionRef}</span>
                )}
                {activeTrackingOrder.upiDetails.customerUtr && (
                  <span>UTR: #{activeTrackingOrder.upiDetails.customerUtr}</span>
                )}
                <span>Receiver: {activeTrackingOrder.upiDetails.upiId || storePaymentSettings?.upiId || 'arjun.gorrepati@axl'}</span>
              </div>
            )}
          </div>
        )}

        {/* DYNAMIC COUNTDOWN TIMER CARD (CALCULATED VIA REAL-TIME DISTANCE & SPEED) */}
        <div 
          id="live-eta-countdown-card"
          className="bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 text-white rounded-3xl p-5 border border-zinc-800 shadow-2xl relative overflow-hidden space-y-4"
        >
          {/* Subtle warm glow background accent */}
          <div className="absolute top-0 right-0 w-48 h-48 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-8 -left-8 w-40 h-40 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />

          {/* Top Status & Telemetry Row */}
          <div className="flex items-center justify-between relative z-10 flex-wrap gap-2 border-b border-zinc-800/80 pb-3">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${activeTrackingOrder.status === 'delivered' ? 'bg-emerald-400' : 'bg-orange-400'} opacity-75`} />
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${activeTrackingOrder.status === 'delivered' ? 'bg-emerald-500' : 'bg-orange-500'}`} />
              </span>
              <span className="text-[10px] font-black uppercase tracking-widest text-orange-400 font-mono">
                {activeTrackingOrder.status === 'delivered'
                  ? 'DELIVERY COMPLETE'
                  : currentDistanceKm <= 0.3 && (activeTrackingOrder.status === 'picked' || activeTrackingOrder.status === 'on_the_way')
                  ? 'ARRIVING AT YOUR DOOR'
                  : 'LIVE DISTANCE-CALCULATED ETA'}
              </span>
            </div>

            <div className="flex items-center gap-1.5 font-mono text-[9.5px] bg-zinc-800/80 px-2.5 py-1 rounded-full text-zinc-300 border border-zinc-700/50">
              <MapPin className="w-3 h-3 text-emerald-400" />
              <span>
                {activeTrackingOrder.status === 'delivered'
                  ? '0.0 km • At Your Door'
                  : `${currentDistanceKm} km (${Math.round(currentDistanceKm * 1000)}m) away`}
              </span>
            </div>
          </div>

          {/* Main Countdown Digits & Estimated Time */}
          <div className="flex items-center justify-between relative z-10 gap-4 flex-wrap">
            <div className="space-y-1">
              <span className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider block">
                Estimated Delivery In
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl sm:text-5xl font-black font-mono tracking-tight text-white drop-shadow-md">
                  {activeTrackingOrder.status === 'delivered' ? '00:00' : formattedCountdown}
                </span>
                <span className="text-xs font-bold text-orange-400 uppercase font-mono">
                  {activeTrackingOrder.status === 'delivered' ? 'Completed' : 'Mins : Secs'}
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 flex items-center gap-1.5 pt-0.5">
                <Clock className="w-3.5 h-3.5 text-zinc-400" />
                <span>
                  Expected by <strong className="text-zinc-200 font-mono">{arrivalClockTime}</strong>
                </span>
              </p>
            </div>

            {/* Dynamic Status Pill */}
            <div className="text-right flex flex-col items-end gap-1.5">
              <span className={`px-3 py-1.5 rounded-2xl text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1.5 shadow-sm ${
                activeTrackingOrder.status === 'delivered'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : currentDistanceKm <= 0.3
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-bounce'
                  : 'bg-orange-500/15 text-orange-300 border border-orange-500/30'
              }`}>
                {activeTrackingOrder.status === 'delivered'
                  ? '🎉 Order Delivered'
                  : currentDistanceKm <= 0.3
                  ? '🔔 Stand by at Door'
                  : `⚡ ${currentSpeed} km/h Transit`}
              </span>
              <span className="text-[9px] text-zinc-400 font-mono">
                Updates dynamically with rider movement
              </span>
            </div>
          </div>

          {/* Visual Distance Progress Gauge */}
          <div className="space-y-2 pt-1 relative z-10">
            <div className="flex items-center justify-between text-[10px] text-zinc-400 font-medium">
              <span className="flex items-center gap-1 truncate max-w-[45%]">
                <Store className="w-3 h-3 text-blue-400 shrink-0" />
                <span className="truncate">{restaurantName}</span>
              </span>
              <span className="text-orange-400 font-mono font-bold shrink-0">
                {activeTrackingOrder.status === 'delivered'
                  ? '100% Reached'
                  : `${Math.round(deliveryRouteProgress)}% Journey`}
              </span>
              <span className="flex items-center gap-1 truncate max-w-[45%] text-right justify-end">
                <MapPin className="w-3 h-3 text-emerald-400 shrink-0" />
                <span className="truncate">{activeTrackingOrder.address?.flatNo || 'Your Address'}</span>
              </span>
            </div>

            {/* Progress Track */}
            <div className="relative w-full h-2.5 bg-zinc-800 rounded-full overflow-hidden p-0.5 border border-zinc-700/50">
              <div 
                className="h-full bg-gradient-to-r from-blue-500 via-orange-500 to-emerald-500 rounded-full transition-all duration-700 ease-out"
                style={{ 
                  width: `${activeTrackingOrder.status === 'delivered' ? 100 : Math.max(8, deliveryRouteProgress)}%` 
                }}
              />
            </div>
            
            <div className="flex items-center justify-between text-[9px] text-zinc-450 font-mono">
              <span>Origin: 0.0 km</span>
              <span className="text-emerald-400 font-bold">
                {activeTrackingOrder.status === 'delivered' ? '0 meters remaining' : `${currentDistanceKm} km remaining`}
              </span>
              <span>Total: ~{totalRouteDistanceKm} km</span>
            </div>
          </div>
        </div>

        {/* STEP-BY-STEP PROGRESS TIMELINE OVERVIEW (HORIZONTAL BAR) */}
        <div id="order-timeline-hero-card" className="bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 rounded-3xl p-5 shadow-lg relative overflow-hidden space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-2xl bg-orange-500/10 text-orange-600 dark:text-orange-400">
                <Clock className="w-4 h-4" />
              </span>
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-orange-500 font-mono block">
                  ORDER JOURNEY
                </span>
                <h3 className="text-xs font-black text-zinc-900 dark:text-zinc-50 leading-tight">
                  {stages[currentStageIndex]?.label || 'Order Tracking'}
                </h3>
              </div>
            </div>

            <div className="text-right">
              <span className={`text-[9.5px] font-black uppercase px-2.5 py-1 rounded-full font-mono inline-flex items-center gap-1 ${
                activeTrackingOrder.status === 'delivered'
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30'
                  : 'bg-orange-500/15 text-orange-700 dark:text-orange-400 border border-orange-500/30 animate-pulse'
              }`}>
                {activeTrackingOrder.status === 'delivered' ? '🎉 Arrived' : `⏱️ ${formattedCountdown} • ${currentDistanceKm} km`}
              </span>
            </div>
          </div>

          {/* Horizontal Progress Bar connecting 4 stages */}
          <div className="pt-2 pb-1">
            <div className="relative">
              {/* Background track line */}
              <div className="absolute top-4 left-6 right-6 h-1 bg-slate-150 dark:bg-zinc-800 rounded-full -translate-y-1/2 z-0" />
              
              {/* Active fill bar */}
              <div 
                className="absolute top-4 left-6 h-1 bg-gradient-to-r from-orange-500 to-amber-500 rounded-full -translate-y-1/2 transition-all duration-700 ease-out z-0" 
                style={{ width: `calc((100% - 48px) * ${currentStageIndex / 3})` }}
              />

              {/* 4 Stage Nodes */}
              <div className="relative z-10 flex items-center justify-between">
                {stages.map((stage) => {
                  const isDone = stage.isCompleted;
                  const isCurrent = stage.isActive;

                  return (
                    <button
                      key={stage.id}
                      type="button"
                      onClick={() => changeOrderStatus(activeTrackingOrder.id, stage.statusKey)}
                      className="group flex flex-col items-center cursor-pointer transition-transform active:scale-95 focus:outline-none"
                      title={`Stage: ${stage.label} (Click to simulate status)`}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all shadow-sm ${
                        isDone
                          ? 'bg-emerald-500 text-white shadow-emerald-500/20'
                          : isCurrent
                          ? 'bg-orange-500 text-white ring-4 ring-orange-500/25 shadow-orange-500/30 animate-bounce'
                          : 'bg-white dark:bg-zinc-800 text-zinc-400 border-2 border-slate-200 dark:border-zinc-700'
                      }`}>
                        {isDone ? (
                          <Check className="w-4 h-4 stroke-[3]" />
                        ) : (
                          <span>{stage.icon}</span>
                        )}
                      </div>

                      <span className={`text-[10px] font-black mt-2 text-center transition-colors ${
                        isCurrent
                          ? 'text-orange-500 dark:text-orange-400'
                          : isDone
                          ? 'text-zinc-800 dark:text-zinc-200 font-bold'
                          : 'text-zinc-400 dark:text-zinc-500'
                      }`}>
                        {stage.shortLabel}
                      </span>
                      
                      <span className="text-[8.5px] font-mono text-zinc-400 dark:text-zinc-500">
                        {stage.time}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* DELIVERY BOY DETAILS & LIVE LOCATION CARD (VISIBLE PROMINENTLY UPON DELIVERY START) */}
        <div 
          id="delivery-boy-details-card" 
          className="bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 rounded-3xl p-5 shadow-lg relative overflow-hidden transition-all duration-300"
        >
          {/* Decorative glowing gradient backdrop */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 dark:bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />

          {/* Card Header Status Indicator */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isDeliveryStarted ? 'bg-emerald-400' : 'bg-orange-400'} opacity-75`}></span>
                <span className={`relative inline-flex rounded-full h-3 w-3 ${isDeliveryStarted ? 'bg-emerald-500' : 'bg-orange-500'}`}></span>
              </span>
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 font-mono block">
                  {hasAssignedRider 
                    ? (isDeliveryStarted ? '🛵 DELIVERY STARTED • IN TRANSIT' : '👨‍🍳 KITCHEN PREPARING • RIDER ASSIGNED')
                    : '👨‍🍳 KITCHEN PREPARING • AWAITING RIDER DISPATCH'}
                </span>
                <h3 className="text-xs font-black text-zinc-900 dark:text-zinc-50 leading-tight">
                  {hasAssignedRider ? 'Delivery Partner Executive' : 'Fleet Routing Desk'}
                </h3>
              </div>
            </div>

            <span className="text-[10px] font-mono font-bold bg-slate-100 dark:bg-zinc-800 px-2.5 py-1 rounded-full text-zinc-650 dark:text-zinc-250 border border-slate-200 dark:border-zinc-700">
              ETA: {activeTrackingOrder.status === 'delivered' ? 'Arrived' : formattedCountdown}
            </span>
          </div>

          {/* Rider Profile Row or Awaiting Assignment State */}
          {hasAssignedRider ? (
            <>
              <div className="flex items-center gap-3.5 pt-3">
                <div className="relative shrink-0">
                  <img 
                    src={riderAvatar} 
                    alt={`${riderName} Delivery Partner`}
                    className="w-14 h-14 rounded-2xl object-cover border-2 border-emerald-500/40 shadow-sm"
                  />
                  <span className="absolute -bottom-1 -right-1 bg-emerald-500 text-white rounded-full p-0.5 border-2 border-white dark:border-zinc-900" title="Verified Delivery Partner">
                    <ShieldCheck className="w-3 h-3" />
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h4 className="text-sm font-black text-zinc-900 dark:text-zinc-50 truncate">
                      {riderName}
                    </h4>
                    <span className="text-[9px] bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.2 rounded font-bold">
                      Verified Rider
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400 font-medium mt-0.5">
                    <span className="flex items-center gap-0.5 text-amber-500 font-bold">
                      <Star className="w-3 h-3 fill-amber-500" /> {riderRating}
                    </span>
                    <span>•</span>
                    <span className="truncate">{riderVehicle}</span>
                  </div>

                  {riderPhone && (
                    <div className="flex items-center gap-1.5 mt-1 text-xs">
                      <span className="text-zinc-400 font-bold text-[10px] uppercase">Rider Phone:</span>
                      <a 
                        href={`tel:${riderPhone}`}
                        className="font-mono font-black text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-lg border border-emerald-200/60 dark:border-emerald-800/40"
                        title="Click to Call Delivery Boy"
                      >
                        <Phone className="w-3 h-3" /> +91 {riderPhone}
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Quick Contact Action Buttons */}
              <div className="grid grid-cols-3 gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => openDriverChat()}
                  className="bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-black text-xs py-2.5 px-2 rounded-2xl flex items-center justify-center gap-1.5 shadow-md shadow-orange-500/20 transition-all cursor-pointer text-center"
                  title={`Direct Message ${riderName} for Delivery Instructions`}
                >
                  <MessageSquare className="w-4 h-4" /> Message
                </button>

                <a 
                  href={`tel:${riderPhone}`}
                  className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs py-2.5 px-2 rounded-2xl flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20 transition-all cursor-pointer text-center"
                  title={`Call ${riderName}`}
                >
                  <Phone className="w-4 h-4" /> Call
                </a>

                <a 
                  href={`https://wa.me/91${riderPhone}?text=Hi%20${encodeURIComponent(riderName)},%20I%20am%20tracking%20my%20Nuvvo%20food%20order.`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-black text-xs py-2.5 px-2 rounded-2xl flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer text-center"
                  title="Chat on WhatsApp"
                >
                  <Send className="w-3.5 h-3.5" /> WhatsApp
                </a>
              </div>

              {/* Instant Delivery Instructions Shortcut Chips */}
              <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-zinc-800/80">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
                    <Send className="w-3 h-3 text-orange-500" /> Delivery Instructions
                  </span>
                  <span className="text-[9px] text-zinc-400 font-mono">1-tap instant send</span>
                </div>
                <div className="flex gap-1.5 overflow-x-auto scrollbar-none py-0.5">
                  {[
                    { label: "Leave at door 🚪", text: "Please leave the food package at my door 🚪" },
                    { label: "Don't ring bell 🤫", text: "Please don't ring the doorbell or knock loudly 🤫" },
                    { label: "Call on arrival 📞", text: "Please give me a quick call when you arrive 📞" },
                    { label: "Leave with security 🏢", text: "Please hand the food over to the security guard / lobby 🏢" },
                    { label: "Beware of dog 🐕", text: "Beware of pet dog inside the gate 🐕" },
                  ].map((chip, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => openDriverChat(chip.text)}
                      className="shrink-0 bg-slate-100 hover:bg-orange-50 dark:bg-zinc-800 hover:dark:bg-orange-950/30 text-zinc-750 dark:text-zinc-200 hover:text-orange-600 dark:hover:text-orange-400 text-[10.5px] font-bold px-2.5 py-1.5 rounded-full border border-slate-200 dark:border-zinc-700 transition cursor-pointer active:scale-95"
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="p-3.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 rounded-2xl mt-3 space-y-1.5">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 text-xs font-black">
                <Clock className="w-4 h-4 shrink-0" />
                <span>Awaiting Delivery Partner Assignment</span>
              </div>
              <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
                The restaurant kitchen has received your order and is preparing it fresh. A delivery executive will be assigned automatically as soon as the food is boxed for pickup.
              </p>
            </div>
          )}

          {/* Live Location GPS Status Bar */}
          <div className="mt-3 p-3 bg-slate-50 dark:bg-zinc-850/70 border border-slate-100 dark:border-zinc-800 rounded-2xl space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-orange-500 flex items-center gap-1">
                <Radio className="w-3 h-3 animate-pulse text-orange-500" /> Live Location Beacon
              </span>
              <span className="text-[9px] font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded font-bold">
                {currentSpeed} km/h • 5G GPS
              </span>
            </div>

            <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5 leading-snug">
              <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
              <span>Chirala Trunk Road, Near RTC Bus Stand (approx. {simulatedDistance} km away)</span>
            </p>

            <p className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-tight">
              Live coordinates streaming: <span className="font-mono text-zinc-700 dark:text-zinc-300 font-bold">{jitterCoords.lat}, {jitterCoords.lng}</span>. Delivery partner is en route to your address!
            </p>
          </div>
        </div>

        {/* PREMIUM MAP VIEWPORT WITH GOOGLE MAPS API INTEGRATION */}
        <div className="bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 rounded-3xl p-4 shadow-md overflow-hidden relative">
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300">
              <Compass className="w-5 h-5 text-orange-500 animate-spin" />
              <span className="text-xs font-black">
                {hasValidKey ? "Live GPS Navigation Map" : "GPS Routing Simulator"}
              </span>
            </div>
            
            <div className="flex items-center gap-2 bg-orange-500/10 px-2.5 py-1 rounded-xl text-orange-600">
              <Clock className="w-3.5 h-3.5" />
              <span className="text-[10px] font-black font-mono">
                {activeTrackingOrder.scheduledTime 
                  ? `SCHEDULED: ${activeTrackingOrder.scheduledTime}` 
                  : activeTrackingOrder.status === 'delivered'
                  ? 'DELIVERED'
                  : `ETA: ${formattedCountdown} • ${currentDistanceKm} KM`
                }
              </span>
            </div>
          </div>

          {hasValidKey ? (
            <div className="border rounded-2xl h-80 relative overflow-hidden flex items-center justify-center shadow-inner">
              <APIProvider apiKey={API_KEY} version="weekly">
                <Map
                  defaultCenter={CHIRALA_CENTER}
                  defaultZoom={14}
                  mapId="DEMO_MAP_ID"
                  internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                  style={{ width: '100%', height: '100%' }}
                >
                  <LiveRouteTracker
                    restaurantCoords={restaurantCoords}
                    destinationCoords={destinationCoords}
                    progress={deliveryRouteProgress}
                    restaurantName={restaurantName}
                    riderName={hasAssignedRider ? riderName : "Delivery Partner"}
                    riderVehicle={riderVehicle}
                    riderPhone={riderPhone}
                    speed={currentSpeed}
                    accuracy={gpsAccuracy}
                    realTimeCoords={jitterCoords}
                    countdownText={activeTrackingOrder.status === 'delivered' ? 'Arrived' : formattedCountdown}
                    distanceKm={currentDistanceKm}
                    onOpenChat={() => openDriverChat()}
                  />
                </Map>
              </APIProvider>
            </div>
          ) : (
            <div className="bg-slate-50 dark:bg-zinc-950 border rounded-2xl p-4 flex flex-col items-center justify-center min-h-[280px] text-center">
              <div className="w-12 h-12 bg-orange-100 dark:bg-orange-950/20 rounded-full flex items-center justify-center text-orange-500 mb-2">
                <MapPin className="w-6 h-6 animate-bounce" />
              </div>
              <h4 className="text-sm font-black text-zinc-900 dark:text-zinc-50">Google Maps API Key Required</h4>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-xs">
                To display the interactive live tracking route map, please configure your Google Maps API Key.
              </p>
              
              <div className="mt-3 text-left text-[11px] space-y-1.5 bg-white dark:bg-zinc-900 p-3 rounded-xl border w-full max-w-sm text-zinc-650 dark:text-zinc-350 shadow-xs">
                <p><strong>Step 1:</strong> <a href="https://console.cloud.google.com/google/maps-apis/start?utm_campaign=gmp-code-assist-ais" target="_blank" rel="noopener noreferrer" className="text-orange-500 underline font-bold">Get an API Key</a></p>
                <p><strong>Step 2:</strong> Add your key as a secret in AI Studio:</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>Open <strong>Settings</strong> (⚙️ gear icon, <strong>top-right corner</strong>)</li>
                  <li>Select <strong>Secrets</strong></li>
                  <li>Type <code>GOOGLE_MAPS_PLATFORM_KEY</code> as the secret name</li>
                  <li>Paste your API key as the value, and press <strong>Enter</strong></li>
                </ul>
              </div>
              <p className="text-[10px] text-zinc-400 mt-2">The app will rebuild automatically once saved.</p>
            </div>
          )}

          <div className="mt-3 flex items-center justify-between text-xs border-t pt-3">
            <div>
              <p className="text-zinc-400 text-[10px] uppercase font-bold tracking-wider">Distance residual</p>
              <p className="font-extrabold text-zinc-900 dark:text-zinc-100 font-mono text-sm">
                {activeTrackingOrder.status === 'delivered' ? '0.0 km • Destination Reached' : `${currentDistanceKm} km remaining`}
              </p>
            </div>
            <div className="text-right">
              <p className="text-zinc-400 text-[10px] uppercase font-bold tracking-wider">Rider Assignment</p>
              <p className="font-extrabold text-zinc-900 dark:text-zinc-100 text-xs">Shravan Kumar (Nuvvo Elite)</p>
            </div>
          </div>
        </div>

        {/* BACKGROUND NOTIFICATION PERMISSION PROMPT BANNER */}
        {notificationPermission !== 'granted' && (
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-r from-orange-500/10 via-orange-600/[0.04] to-transparent border border-orange-500/20 rounded-3xl p-4 shadow-sm flex items-start gap-3 text-left relative overflow-hidden"
          >
            {/* Subtle light pulse background overlay */}
            <span className="absolute top-0 right-0 w-24 h-24 bg-orange-500/5 rounded-full blur-2xl pointer-events-none" />
            
            <div className="p-2.5 bg-orange-500 text-white rounded-2xl shrink-0 mt-0.5 animate-pulse">
              <Radio className="w-5 h-5" />
            </div>
            
            <div className="space-y-1.5 flex-1 pr-2">
              <h4 className="text-xs font-black text-zinc-900 dark:text-zinc-50 leading-tight uppercase tracking-tight flex items-center gap-1.5">
                Enable Minimized Status Alerts!
              </h4>
              <p className="text-[10.5px] text-zinc-650 dark:text-zinc-400 leading-relaxed font-medium">
                Want real-time updates when backgrounded or minimized? Enable browser push notifications to track your delivery partner's precise location seamlessly!
              </p>
              
              <div className="pt-1 flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    await requestNotificationPermission();
                  }}
                  className="px-3.5 py-1.5 bg-orange-500 hover:bg-orange-600 text-white font-black text-[9.5px] uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-sm active:scale-95 flex items-center gap-1"
                >
                  ⚡ Enable Alerts
                </button>
                {notificationPermission === 'denied' && (
                  <span className="text-[8.5px] text-rose-500 font-bold uppercase tracking-wider italic">
                    ⚠ Blocked in browser settings
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* LIVE TELEMETRY & WEBSOCKET POLLING ENGINE */}
        <div id="live-telemetry-ws-panel" className="bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 rounded-3xl p-5 shadow-sm space-y-4">
          {/* Panel Header */}
          <div className="flex justify-between items-center border-b pb-2.5 dark:border-zinc-800/80">
            <div className="flex items-center gap-2 text-left">
              <Activity className={`w-4 h-4 text-emerald-500 ${isPolling ? 'animate-pulse' : ''}`} />
              <div>
                <h4 className="text-xs font-black text-zinc-955 dark:text-zinc-50 tracking-tight uppercase flex items-center gap-1.5">
                  Live Telemetry Desk
                </h4>
                <p className="text-[9px] text-zinc-400 font-bold uppercase leading-none">WebSocket Polling Protocol</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider font-mono ${
                isPolling 
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/15' 
                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/15'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isPolling ? 'bg-emerald-500 animate-ping' : 'bg-amber-500'}`} />
                {isPolling ? 'WS: Active' : 'WS: Paused'}
              </span>

              <button
                type="button"
                onClick={() => {
                  setIsPolling(!isPolling);
                  setTelemetryLogs(prev => [
                    {
                      id: `toggle_${Date.now()}`,
                      timestamp: new Date().toLocaleTimeString(),
                      message: isPolling ? '⚠️ WS Connection Paused. Polling thread suspended.' : '🟢 WS Connection Re-established. Polling thread resumed.',
                      type: isPolling ? 'warn' : 'info'
                    },
                    ...prev
                  ]);
                }}
                className="p-1 hover:bg-slate-150 dark:hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors cursor-pointer"
                title={isPolling ? "Pause Real-Time Polling" : "Resume Real-Time Polling"}
              >
                {isPolling ? <X className="w-3.5 h-3.5" /> : <RefreshCw className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Core GPS stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {/* Coordinates */}
            <div className="p-2.5 bg-slate-50 dark:bg-zinc-850 border border-slate-100 dark:border-zinc-800/80 rounded-2xl space-y-1 text-left">
              <span className="text-[8.5px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest block flex items-center gap-1">
                <Radio className="w-2.5 h-2.5 text-orange-500" /> GPS Lat/Lng
              </span>
              <p className="font-mono text-[10.5px] font-black text-zinc-800 dark:text-zinc-150 leading-none">
                {jitterCoords.lat}
              </p>
              <p className="font-mono text-[10.5px] font-black text-zinc-800 dark:text-zinc-150 leading-none pt-0.5">
                {jitterCoords.lng}
              </p>
            </div>

            {/* Velocity */}
            <div className="p-2.5 bg-slate-50 dark:bg-zinc-850 border border-slate-100 dark:border-zinc-800/80 rounded-2xl space-y-1 text-left">
              <span className="text-[8.5px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest block flex items-center gap-1">
                <Bike className="w-2.5 h-2.5 text-orange-500" /> Velocity
              </span>
              <p className="font-mono text-base font-black text-zinc-900 dark:text-zinc-50 leading-none flex items-baseline gap-0.5">
                {currentSpeed} <span className="text-[9px] text-zinc-450 font-bold uppercase">km/h</span>
              </p>
              <span className="text-[8px] font-bold text-emerald-500 uppercase leading-none block">Moving Smoothly</span>
            </div>

            {/* Link & Quality */}
            <div className="p-2.5 bg-slate-50 dark:bg-zinc-850 border border-slate-100 dark:border-zinc-800/80 rounded-2xl space-y-1 text-left">
              <span className="text-[8.5px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest block flex items-center gap-1">
                <Wifi className="w-2.5 h-2.5 text-orange-500" /> Connection
              </span>
              <p className="font-mono text-xs font-black text-zinc-800 dark:text-zinc-150 leading-none flex items-center gap-1">
                98% <span className="text-[7.5px] bg-emerald-150 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 px-1 py-0.2 rounded uppercase font-black font-sans">5G</span>
              </p>
              <p className="text-[8px] text-zinc-450 leading-none pt-0.5">Sats: {satelliteCount} locked</p>
            </div>

            {/* Rider Device Battery */}
            <div className="p-2.5 bg-slate-50 dark:bg-zinc-850 border border-slate-100 dark:border-zinc-800/80 rounded-2xl space-y-1 text-left">
              <span className="text-[8.5px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest block flex items-center gap-1">
                <Battery className="w-2.5 h-2.5 text-orange-500" /> Device Tele
              </span>
              <p className="font-mono text-xs font-black text-zinc-800 dark:text-zinc-150 leading-none flex items-center gap-1">
                {batteryLevel}% <span className="text-[8px] text-zinc-400 font-bold font-sans">charge</span>
              </p>
              <p className="text-[8px] text-zinc-450 leading-none pt-0.5">Acc: ±{gpsAccuracy}m</p>
            </div>
          </div>

          {/* WebSocket Terminal Stream Logs */}
          <div className="space-y-1.5 text-left">
            <span className="text-[9px] font-black uppercase tracking-wider text-orange-500 flex items-center gap-1.5">
              <Terminal className="w-3 h-3" /> Live WS Packet Stream
            </span>

            <div className="bg-zinc-950 dark:bg-black border border-zinc-850 rounded-2xl p-3 font-mono text-[9px] text-zinc-300 space-y-1.5 max-h-[140px] overflow-y-auto scrollbar-thin shadow-inner">
              {telemetryLogs.length === 0 ? (
                <p className="text-zinc-500 italic text-center py-2">Waiting for WebSocket connection telemetry...</p>
              ) : (
                telemetryLogs.map((log) => {
                  let textCol = 'text-zinc-300';
                  let prefix = '📥';
                  if (log.type === 'info') {
                    textCol = 'text-indigo-400';
                    prefix = 'ℹ️';
                  } else if (log.type === 'warn') {
                    textCol = 'text-amber-400';
                    prefix = '⚠️';
                  }

                  return (
                    <div key={log.id} className={`flex items-start gap-1 leading-relaxed ${textCol}`}>
                      <span className="text-zinc-500 shrink-0 select-none">[{log.timestamp}]</span>
                      <span className="shrink-0 select-none">{prefix}</span>
                      <span className="break-all whitespace-pre-wrap">{log.message}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Manual Repoll Option */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[10px] text-zinc-450 gap-2">
            <span className="flex items-center gap-1.5 text-left">
              <Cpu className="w-3 h-3 text-zinc-450" />
              <span>Simulating wss:// gateway coordinates via WebSocket frame emulation</span>
            </span>
            <button
              type="button"
              onClick={() => {
                const baseLat = restaurantCoords.lat + (destinationCoords.lat - restaurantCoords.lat) * (deliveryRouteProgress / 100);
                const baseLng = restaurantCoords.lng + (destinationCoords.lng - restaurantCoords.lng) * (deliveryRouteProgress / 100);
                const latJitter = (Math.random() - 0.5) * 0.00015;
                const lngJitter = (Math.random() - 0.5) * 0.00015;
                const finalLat = parseFloat((baseLat + latJitter).toFixed(6));
                const finalLng = parseFloat((baseLng + lngJitter).toFixed(6));
                
                setJitterCoords({ lat: finalLat, lng: finalLng });
                setTelemetryLogs(prev => [
                  {
                    id: `manual_${Date.now()}`,
                    timestamp: new Date().toLocaleTimeString(),
                    message: `⚡ Force Polled coordinates: [${finalLat}, ${finalLng}]`,
                    type: 'info'
                  },
                  ...prev
                ]);
              }}
              className="px-2.5 py-1 bg-orange-500/10 hover:bg-orange-500/20 text-orange-600 dark:text-orange-400 font-extrabold uppercase rounded-lg transition text-center sm:self-end cursor-pointer"
            >
              Force Poll Now
            </button>
          </div>
        </div>

        {/* Dynamic Cancellation Grace Period Banner (Within 2 minutes of placement) */}
        {timeLeftMs > 0 && (activeTrackingOrder.status === 'accepted' || activeTrackingOrder.status === 'preparing') && (
          <div id="active-order-cancellation-banner" className="bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/40 rounded-3xl p-4 shadow-sm space-y-3 animate-fadeIn">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/45 text-[9px] font-black text-rose-600 dark:text-rose-450 uppercase tracking-wider font-mono">
                  ⏱️ Grace Period
                </span>
                <h4 className="text-xs font-black text-zinc-900 dark:text-zinc-50 leading-tight">
                  Cancel order without penalty
                </h4>
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-snug">
                  Made a mistake? Cancelling now halts kitchen cooking and grants an instant zero-fee refund.
                </p>
              </div>
              <div className="text-right shrink-0">
                <span className="text-[8px] text-zinc-400 uppercase font-bold block">Aborts in</span>
                <span className="text-sm font-black text-rose-500 font-mono tracking-wider">
                  {Math.floor(timeLeftMs / 60000)}:{(Math.floor((timeLeftMs % 60000) / 1000)).toString().padStart(2, '0')}
                </span>
              </div>
            </div>
            
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Do you really want to cancel this order? This will notify the kitchen to discard the preparation slip and immediately process a refund to your payment method.")) {
                  changeOrderStatus(activeTrackingOrder.id, 'cancelled');
                }
              }}
              className="w-full bg-rose-500 hover:bg-rose-600 active:scale-[0.99] text-white font-black uppercase text-[10.5px] py-2.5 rounded-2xl cursor-pointer transition-all flex items-center justify-center gap-1.5 shadow-sm shadow-rose-500/10"
            >
              🛑 Abort Cooking & Cancel Order
            </button>
          </div>
        )}

        {/* STEP-BY-STEP PROGRESS TIMELINE UI (CHRONOLOGICAL DETAIL) */}
        <div id="step-by-step-timeline-card" className="bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 rounded-3xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800/80 pb-3">
            <div>
              <span className="text-[9.5px] font-black uppercase tracking-widest text-orange-500 font-mono block">
                TIMELINE TRACKER
              </span>
              <h3 className="text-xs font-black text-zinc-900 dark:text-zinc-50 leading-tight">
                Order Delivery Progress
              </h3>
            </div>

            <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-zinc-800/80 px-2.5 py-1 rounded-full text-[9.5px] font-mono text-zinc-600 dark:text-zinc-300 font-bold border border-slate-200/60 dark:border-zinc-700/60">
              <Clock className="w-3 h-3 text-orange-500" />
              <span>Step {currentStageIndex + 1} of 4</span>
            </div>
          </div>
          
          <div className="relative pl-6 space-y-6 pt-1">
            {/* Vertical connector line */}
            <div className="absolute left-2.5 top-3.5 bottom-3.5 w-0.5 bg-slate-150 dark:bg-zinc-800" />
            <div 
              className="absolute left-2.5 top-3.5 w-0.5 bg-gradient-to-b from-emerald-500 via-orange-500 to-amber-500 transition-all duration-700"
              style={{
                height: `${Math.min(100, Math.max(0, (currentStageIndex / 3) * 100))}%`
              }}
            />
            
            {stages.map((stage) => {
              const isCompleted = stage.isCompleted;
              const isActive = stage.isActive;
              
              return (
                <div key={stage.id} className="relative flex items-start gap-3.5 group">
                  {/* Timeline Node */}
                  <div className={`absolute -left-5 top-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center text-[10px] z-10 transition-all ${
                    isCompleted 
                      ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm shadow-emerald-500/25' 
                      : isActive 
                        ? 'bg-orange-500 border-white dark:border-zinc-900 text-white shadow-md shadow-orange-500/30 ring-4 ring-orange-500/20 animate-pulse' 
                        : 'bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-zinc-400'
                  }`}>
                    {isCompleted ? (
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    ) : (
                      <span className="font-mono font-bold text-[9px]">{stage.stepNumber}</span>
                    )}
                  </div>

                  {/* Stage Icon Box */}
                  <div className={`w-9 h-9 rounded-2xl flex items-center justify-center text-base shrink-0 transition-colors ${
                    isActive
                      ? 'bg-orange-500/10 border border-orange-500/30 shadow-xs'
                      : isCompleted
                      ? 'bg-emerald-500/10 border border-emerald-500/20'
                      : 'bg-slate-50 dark:bg-zinc-850 border border-slate-100 dark:border-zinc-800 opacity-60'
                  }`}>
                    {stage.icon}
                  </div>

                  {/* Stage Text & Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <h4 className={`text-xs font-black transition-colors ${
                        isActive 
                          ? 'text-orange-500 dark:text-orange-400' 
                          : isCompleted 
                          ? 'text-zinc-900 dark:text-zinc-100' 
                          : 'text-zinc-400 dark:text-zinc-500'
                      }`}>
                        {stage.label}
                      </h4>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[9px] font-mono text-zinc-400 dark:text-zinc-500">
                          {stage.time}
                        </span>
                        
                        <span className={`text-[8.5px] font-black uppercase px-2 py-0.5 rounded-full ${
                          isCompleted
                            ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                            : isActive
                            ? 'bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 animate-pulse'
                            : 'bg-slate-100 dark:bg-zinc-800 text-zinc-400'
                        }`}>
                          {isCompleted ? 'Done' : isActive ? 'In Progress' : 'Pending'}
                        </span>
                      </div>
                    </div>

                    <p className="text-[10.5px] text-zinc-500 dark:text-zinc-400 leading-snug mt-0.5 font-medium">
                      {stage.desc}
                    </p>

                    {/* Active highlighted detail box */}
                    {isActive && (
                      <motion.div 
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-2.5 p-3 rounded-2xl bg-orange-500/[0.07] border border-orange-500/20 text-[10.5px] text-zinc-700 dark:text-zinc-300 leading-relaxed space-y-1.5 shadow-xs"
                      >
                        <p className="font-semibold text-zinc-800 dark:text-zinc-200">
                          {stage.detailedDesc}
                        </p>
                        
                        {stage.id === 'out_for_delivery' && (
                          <div className="flex items-center justify-between pt-1 border-t border-orange-500/15 text-[9.5px] font-mono text-orange-600 dark:text-orange-400 font-bold">
                            <span>🛵 Live Rider: {riderName}</span>
                            <span>{currentSpeed} km/h • GPS Beacon</span>
                          </div>
                        )}
                        {stage.id === 'preparing' && (
                          <div className="flex items-center justify-between pt-1 border-t border-orange-500/15 text-[9.5px] text-orange-600 dark:text-orange-400 font-medium">
                            <span>👨‍🍳 Freshly Prepared by Kitchen</span>
                            <span>Hygiene Certified</span>
                          </div>
                        )}
                        {stage.id === 'placed' && (
                          <div className="flex items-center justify-between pt-1 border-t border-orange-500/15 text-[9.5px] text-orange-600 dark:text-orange-400 font-mono">
                            <span>Kitchen: {restaurantName}</span>
                            <span>Receipt #{activeTrackingOrder.id.slice(-6).toUpperCase()}</span>
                          </div>
                        )}
                        {stage.id === 'delivered' && (
                          <div className="flex items-center justify-between pt-1 border-t border-orange-500/15 text-[9.5px] text-emerald-600 dark:text-emerald-400 font-bold">
                            <span>✅ Delivered Safely</span>
                            <span>Enjoy your meal!</span>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quick Stage Simulator Switcher for instant demo / verification */}
          <div className="pt-2 border-t border-slate-100 dark:border-zinc-800/80">
            <div className="flex items-center justify-between gap-1 flex-wrap mb-2">
              <span className="text-[9px] font-black uppercase tracking-wider text-zinc-400 font-mono flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-orange-500" /> Stage Switcher:
              </span>
              <span className="text-[8.5px] text-zinc-400 italic">
                (Tap to test any status in real-time)
              </span>
            </div>

            <div className="grid grid-cols-4 gap-1.5">
              {stages.map((stage) => {
                const isSelected = activeTrackingOrder.status === stage.statusKey || 
                  (stage.id === 'out_for_delivery' && (activeTrackingOrder.status === 'picked' || activeTrackingOrder.status === 'on_the_way'));
                return (
                  <button
                    key={stage.id}
                    type="button"
                    onClick={() => changeOrderStatus(activeTrackingOrder.id, stage.statusKey)}
                    className={`py-2 px-1.5 rounded-xl text-[9px] font-black uppercase transition-all cursor-pointer flex flex-col items-center gap-1 text-center active:scale-95 ${
                      isSelected
                        ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-sm shadow-orange-500/20'
                        : 'bg-slate-50 dark:bg-zinc-800/80 hover:bg-slate-100 dark:hover:bg-zinc-800 text-zinc-650 dark:text-zinc-350 border border-slate-200/80 dark:border-zinc-700/80'
                    }`}
                  >
                    <span className="text-sm">{stage.icon}</span>
                    <span className="truncate w-full leading-tight">{stage.shortLabel}</span>
                  </button>
                );
              })}
            </div>

            {/* Test 500m Alert Action */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleTestProximityAlert}
                className="w-full py-2 px-3 rounded-xl bg-orange-500/10 hover:bg-orange-500/20 active:scale-98 text-orange-600 dark:text-orange-400 border border-orange-500/30 text-[9.5px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition cursor-pointer shadow-xs"
                title="Test 500m proximity alert with chime, haptic, and notification"
              >
                <BellRing className="w-3.5 h-3.5 animate-bounce" /> Trigger 500m Proximity Alert Test
              </button>
            </div>
          </div>
        </div>

        {/* SECURE PACKAGING STATS AND COMPLIANCE */}
        <div className="bg-emerald-500/10 p-3.5 rounded-2xl border border-emerald-500/20 flex gap-2.5 text-xs text-emerald-700 dark:text-emerald-400">
          <ShieldCheck className="w-5 h-5 flex-shrink-0 text-emerald-500 mt-0.5 animate-bounce" />
          <div>
            <strong className="font-extrabold block">Secure Safe Delivery Code</strong>
            Seals are 100% verified on leaving the kitchen. Do not accept parcel packs with compromised outer adhesive tapes or barcodes.
          </div>
        </div>
      </div>

      {/* FLOATING ACTION CHAT SUPPORT TRIGGER BUTTON */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
        {/* Unread Pill notification when chat is closed */}
        {!isChatOpen && (unreadDriverCount + unreadRestaurantCount > 0) && (
          <div className="bg-rose-500 border border-white dark:border-zinc-900 text-white text-[9.5px] font-black rounded-full px-2.5 py-1 shadow-md animate-bounce select-none">
            ⚡ {unreadDriverCount + unreadRestaurantCount} New messages
          </div>
        )}
        
        <button
          type="button"
          onClick={() => setIsChatOpen(!isChatOpen)}
          className={`p-4 rounded-full shadow-2xl flex items-center justify-center transition-all duration-300 active:scale-95 border cursor-pointer hover:shadow-orange-500/20 focus:outline-none ${
            isChatOpen 
              ? 'bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-950' 
              : 'bg-orange-500 border-orange-400 text-white hover:bg-orange-600'
          }`}
          title="Direct Support Chat"
        >
          {isChatOpen ? (
            <X className="w-6 h-6" />
          ) : (
            <MessageSquare className="w-6 h-6" />
          )}
        </button>
      </div>

      {/* FLOATING SUPPORT CHAT INTERFACE CARD (FIXED DRAWER OVERLAY) */}
      {isChatOpen && (
        <div 
          className="fixed bottom-24 right-4 md:right-8 z-50 w-[calc(100vw-32px)] md:w-[410px] h-[550px] max-h-[80vh] bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-850 rounded-3xl shadow-2xl flex flex-col overflow-hidden transition-all duration-200"
          id="partner-chat-support-modal"
        >
          {/* Header */}
          <div className="p-3.5 border-b border-slate-100 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/70 flex items-center justify-between">
            {activeTab === 'driver' ? (
              <div className="flex items-center gap-2.5">
                <div className="relative shrink-0">
                  <img
                    src={riderAvatar}
                    alt={riderName}
                    className="w-9 h-9 rounded-2xl object-cover border border-emerald-500/40 shadow-xs"
                  />
                  <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-white dark:border-zinc-900 absolute -bottom-0.5 -right-0.5 animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-xs font-black text-zinc-900 dark:text-zinc-50 leading-tight">
                      {hasAssignedRider ? riderName : 'Delivery Partner'}
                    </h3>
                    <span className="text-[9px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold px-1.5 py-0.2 rounded font-mono">
                      Active
                    </span>
                  </div>
                  <span className="text-[9.5px] font-medium text-zinc-400 dark:text-zinc-500 block truncate max-w-[210px]">
                    {riderVehicle} • {currentSpeed} km/h • ~{currentDistanceKm} km
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-orange-500/10 text-orange-600 flex items-center justify-center font-bold text-sm shrink-0 border border-orange-500/20">
                  👨‍🍳
                </div>
                <div>
                  <h3 className="text-xs font-black text-zinc-900 dark:text-zinc-50 leading-tight truncate max-w-[210px]">
                    {restaurantName} Kitchen
                  </h3>
                  <span className="text-[9.5px] font-medium text-zinc-400 dark:text-zinc-500 block">
                    Chef Dispatch Desk • Live Order #{activeTrackingOrder.id.slice(-6).toUpperCase()}
                  </span>
                </div>
              </div>
            )}

            <div className="flex items-center gap-1">
              {activeTab === 'driver' && riderPhone && (
                <a
                  href={`tel:${riderPhone}`}
                  className="p-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 transition cursor-pointer"
                  title={`Call ${riderName}`}
                >
                  <Phone className="w-4 h-4" />
                </a>
              )}
              <button
                type="button"
                onClick={() => setIsChatOpen(false)}
                className="p-1.5 rounded-xl hover:bg-slate-200 dark:hover:bg-zinc-800 text-zinc-400 dark:text-zinc-500 transition-colors cursor-pointer"
                title="Close Chat"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Partner Selector Tabs */}
          <div className="grid grid-cols-2 text-center border-b border-slate-100 dark:border-zinc-800/80 bg-white dark:bg-zinc-900">
            <button
              type="button"
              onClick={() => setActiveTab('driver')}
              className={`p-3 text-xs font-extrabold uppercase tracking-wider flex items-center justify-center gap-1.5 border-b-2 transition-all cursor-pointer ${
                activeTab === 'driver'
                  ? 'border-orange-500 text-orange-500 bg-orange-50/10'
                  : 'border-transparent text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300'
              }`}
            >
              <Bike className="w-3.5 h-3.5" />
              <span>{hasAssignedRider ? `Rider ${riderName.split(' ')[0]}` : 'Delivery Partner'}</span>
              {unreadDriverCount > 0 && (
                <span className="bg-rose-500 text-white rounded-full text-[9px] w-4.5 h-4.5 flex items-center justify-center font-bold">
                  {unreadDriverCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('restaurant')}
              className={`p-3 text-xs font-extrabold uppercase tracking-wider flex items-center justify-center gap-1.5 border-b-2 transition-all cursor-pointer ${
                activeTab === 'restaurant'
                  ? 'border-orange-500 text-orange-500 bg-orange-50/10'
                  : 'border-transparent text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300'
              }`}
            >
              <Store className="w-3.5 h-3.5" />
              <span className="truncate max-w-[100px]">
                {restaurants.find(r => r.id === activeTrackingOrder.items[0]?.foodItem?.restaurantId)?.name || 'Kitchen'}
              </span>
              {unreadRestaurantCount > 0 && (
                <span className="bg-rose-500 text-white rounded-full text-[9px] w-4.5 h-4.5 flex items-center justify-center font-bold">
                  {unreadRestaurantCount}
                </span>
              )}
            </button>
          </div>

          {/* Chat Messages Log */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5 cursor-default bg-slate-50/40 dark:bg-zinc-950/20 scrollbar-thin">
            {activeTab === 'driver' ? (
              driverMessages.map(msg => (
                <div 
                  key={msg.id} 
                  className={`flex flex-col max-w-[85%] ${
                    msg.sender === 'user' ? 'ml-auto items-end' : 'mr-auto items-start'
                  }`}
                >
                  <div className={`p-3 rounded-2xl text-[11px] leading-relaxed font-semibold transition-colors ${
                    msg.sender === 'user'
                      ? 'bg-orange-500 text-white rounded-tr-none shadow-sm shadow-orange-500/10'
                      : 'bg-white dark:bg-zinc-800/80 border border-slate-100 dark:border-zinc-800 text-zinc-800 dark:text-zinc-150 rounded-tl-none'
                  }`}>
                    {msg.text}
                  </div>
                  <span className="text-[8px] font-medium text-zinc-400 dark:text-zinc-500 mt-1 uppercase px-1 flex items-center gap-1">
                    <span>{msg.sender === 'user' ? 'You' : (hasAssignedRider ? riderName.split(' ')[0] : 'Partner')} • {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    {msg.sender === 'user' && (
                      <span className="text-emerald-500 font-bold tracking-tighter" title="Delivered & Read">✓✓</span>
                    )}
                  </span>
                </div>
              ))
            ) : (
              restaurantMessages.map(msg => (
                <div 
                  key={msg.id} 
                  className={`flex flex-col max-w-[85%] ${
                    msg.sender === 'user' ? 'ml-auto items-end' : 'mr-auto items-start'
                  }`}
                >
                  <div className={`p-3 rounded-2xl text-[11px] leading-relaxed font-semibold transition-colors ${
                    msg.sender === 'user'
                      ? 'bg-orange-500 text-white rounded-tr-none shadow-sm shadow-orange-500/10'
                      : 'bg-white dark:bg-zinc-800/80 border border-slate-100 dark:border-zinc-800 text-zinc-800 dark:text-zinc-150 rounded-tl-none'
                  }`}>
                    {msg.text}
                  </div>
                  <span className="text-[8px] font-medium text-zinc-400 dark:text-zinc-500 mt-1 uppercase px-1 flex items-center gap-1">
                    <span>{msg.sender === 'user' ? 'You' : 'Kitchen Chef'} • {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    {msg.sender === 'user' && (
                      <span className="text-emerald-500 font-bold tracking-tighter" title="Delivered & Read">✓✓</span>
                    )}
                  </span>
                </div>
              ))
            )}

            {/* Simulated Typings Animating Bubble */}
            {((activeTab === 'driver' && isDriverTyping) || (activeTab === 'restaurant' && isRestaurantTyping)) && (
              <div className="flex flex-col items-start mr-auto max-w-[80%]">
                <div className="bg-white dark:bg-zinc-800/80 border border-slate-100 dark:border-zinc-800 p-2.5 px-3.5 rounded-2xl rounded-tl-none flex items-center gap-1">
                  <div className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest font-mono animate-pulse flex items-center gap-1.5">
                    <span>{activeTab === 'driver' ? (hasAssignedRider ? riderName.split(' ')[0] : 'Partner') : 'Chef'} is writing</span>
                    <span className="flex gap-0.5 mt-0.5">
                      <span className="w-1 h-1 bg-zinc-400 dark:bg-zinc-500 rounded-full animate-bounce delay-75" />
                      <span className="w-1 h-1 bg-zinc-400 dark:bg-zinc-500 rounded-full animate-bounce delay-150" />
                      <span className="w-1 h-1 bg-zinc-400 dark:bg-zinc-500 rounded-full animate-bounce delay-225" />
                    </span>
                  </div>
                </div>
              </div>
            )}
            
            <div ref={messageEndRef} />
          </div>

          {/* Quick Preset Message helper bubbled row */}
          <div className="px-3 py-2 border-t border-slate-100 dark:border-zinc-800/50 bg-white dark:bg-zinc-900 flex gap-1.5 overflow-x-auto scrollbar-none select-none">
            {(activeTab === 'driver' 
              ? [
                  "Leave at door 🚪",
                  "Don't ring bell 🤫",
                  "Call on arrival 📞",
                  "Leave with security 🏢",
                  "Beware of dog 🐕",
                  "Where are you? 📍",
                  "Bring spoons & napkins 🍴"
                ] 
              : [
                  "Make it extra spicy! 🌶️",
                  "Please drop extra tissues 🧻",
                  "Any allergy warnings? 🥦",
                  "Double packaged packaging 🔥"
                ]
            ).map((preset, index) => (
              <button
                key={index}
                type="button"
                onClick={() => handleSendMessage(preset)}
                className="bg-slate-50 dark:bg-zinc-800/60 hover:bg-orange-50 dark:hover:bg-orange-950/30 hover:border-orange-300 dark:hover:border-orange-800 text-[10px] font-extrabold text-zinc-650 dark:text-zinc-350 hover:text-orange-600 dark:hover:text-orange-400 px-2.5 py-1.5 rounded-full border border-slate-150 dark:border-zinc-800 cursor-pointer shrink-0 transition-all active:scale-[0.97]"
              >
                {preset}
              </button>
            ))}
          </div>

          {/* Form message input sender */}
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="p-3 border-t border-slate-100 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/70 flex gap-2 items-center"
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={activeTab === 'driver' ? (hasAssignedRider ? `Type a message to Rider ${riderName.split(' ')[0]}...` : "Type a message to delivery fleet...") : "Ask the Chef kitchen team details..."}
              className="flex-1 bg-white dark:bg-zinc-850 px-3.5 py-2 rounded-2xl border border-slate-100 dark:border-zinc-800/60 text-xs text-zinc-900 dark:text-zinc-50 focus:outline-none focus:border-orange-400 placeholder-zinc-400 dark:placeholder-zinc-500 font-semibold"
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white p-2.5 rounded-2xl shadow-sm shadow-orange-500/10 cursor-pointer active:scale-95 transition-all flex items-center justify-center shrink-0 disabled:cursor-not-allowed"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      )}

      {/* POST-ORDER FEEDBACK MODAL */}
      <AnimatePresence>
        {showFeedbackModal && (
          <div 
            id="post-order-feedback-modal-backdrop"
            className="fixed inset-0 bg-zinc-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto"
          >
            <motion.div
              id="post-order-feedback-modal-card"
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", duration: 0.5 }}
              className="w-full max-w-md bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 rounded-3xl p-6 shadow-2xl relative"
            >
              {/* Dismiss button */}
              <button
                id="feedback-modal-close-btn"
                onClick={() => {
                  setShowFeedbackModal(false);
                  setIsFeedbackSubmitted(false);
                }}
                className="absolute top-4 right-4 p-1.5 rounded-full bg-slate-50 dark:bg-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-700 text-zinc-400 dark:text-zinc-500 transition-colors cursor-pointer"
                title="Dismiss rating modal"
              >
                <X className="w-4 h-4" />
              </button>

              {!isFeedbackSubmitted ? (
                <form id="post-order-feedback-form" onSubmit={handleFeedbackSubmit} className="space-y-5">
                  <div className="text-center space-y-1">
                    <div className="w-12 h-12 bg-orange-100 dark:bg-orange-950/20 rounded-full flex items-center justify-center text-orange-500 mx-auto border border-orange-200">
                      <Smile className="w-6 h-6 animate-pulse" />
                    </div>
                    <h3 className="text-base font-black text-zinc-900 dark:text-zinc-50 tracking-tight pt-1">
                      Rate Your Nuvvo Experience
                    </h3>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium">
                      Tell us how much you enjoyed the culinary feast and the delivery service.
                    </p>
                  </div>

                  {/* Rating Block 1: Meal Taste & Food Quality */}
                  <div className="p-4 bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-850 rounded-2xl space-y-2.5">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                          🍔 Food Quality & Taste
                        </h4>
                        <p className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium">
                          From: <span className="font-bold text-zinc-700 dark:text-zinc-300">
                            {restaurants.find(r => r.id === activeTrackingOrder.items[0]?.foodItem?.restaurantId)?.name || "Hotel Kitchen"}
                          </span>
                        </p>
                      </div>
                      {mealRating > 0 && (
                        <span className="text-[10px] font-black text-orange-500 bg-orange-100/40 dark:bg-orange-950/30 px-2 py-0.5 rounded-lg border border-orange-200/40 font-semibold shrink-0">
                          {mealRating === 5 ? "Loved It! 😋" : mealRating === 4 ? "Delicious! 👍" : mealRating === 3 ? "Decent 😊" : mealRating === 2 ? "Below expectation" : "Not good"}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 justify-center py-1">
                      {[1, 2, 3, 4, 5].map((star) => {
                        const isHighlighted = (hoverMealRating || mealRating) >= star;
                        return (
                          <button
                            key={star}
                            id={`meal-star-rating-${star}`}
                            type="button"
                            onMouseEnter={() => setHoverMealRating(star)}
                            onMouseLeave={() => setHoverMealRating(0)}
                            onClick={() => setMealRating(star)}
                            className="p-1 focus:outline-none transition-transform hover:scale-110 active:scale-95 cursor-pointer"
                          >
                            <Star 
                              className={`w-7 h-7 stroke-[2] ${
                                isHighlighted 
                                  ? 'fill-orange-500 stroke-orange-500 text-orange-500' 
                                  : 'stroke-zinc-300 dark:stroke-zinc-700 text-transparent'
                              }`} 
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="p-4 bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-850 rounded-2xl space-y-2.5">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                          🏠 Restaurant & Kitchen Setup
                        </h4>
                        <p className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium">
                          Quality, Packaging & Hygiene
                        </p>
                      </div>
                      {restaurantRating > 0 && (
                        <span className="text-[10px] font-black text-amber-550 bg-amber-100/40 dark:bg-amber-950/30 px-2 py-0.5 rounded-lg border border-amber-200/40 font-semibold shrink-0 text-amber-600 dark:text-amber-400">
                          {restaurantRating === 5 ? "Top Notch! 🏆" : restaurantRating === 4 ? "Very Clean 👌" : restaurantRating === 3 ? "Good Packing 😊" : restaurantRating === 2 ? "Packing could improve" : "Poor packaging"}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 justify-center py-1">
                      {[1, 2, 3, 4, 5].map((star) => {
                        const isHighlighted = (hoverRestaurantRating || restaurantRating) >= star;
                        return (
                          <button
                            key={star}
                            id={`restaurant-star-rating-${star}`}
                            type="button"
                            onMouseEnter={() => setHoverRestaurantRating(star)}
                            onMouseLeave={() => setHoverRestaurantRating(0)}
                            onClick={() => setRestaurantRating(star)}
                            className="p-1 focus:outline-none transition-transform hover:scale-110 active:scale-95 cursor-pointer"
                          >
                            <Star 
                              className={`w-7 h-7 stroke-[2] ${
                                isHighlighted 
                                  ? 'fill-amber-500 stroke-amber-500 text-amber-500' 
                                  : 'stroke-zinc-300 dark:stroke-zinc-700 text-transparent'
                              }`} 
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Rating Block 3: Delivery & Rider Execution */}
                  <div className="p-4 bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-850 rounded-2xl space-y-2.5">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                          🛵 Delivery Service
                        </h4>
                        <p className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium">
                          Partner Executive: <span className="font-bold text-zinc-700 dark:text-zinc-300">{hasAssignedRider ? riderName : 'Assigned Partner'}</span>
                        </p>
                      </div>
                      {deliveryRating > 0 && (
                        <span className="text-[10px] font-black text-emerald-500 bg-emerald-100/40 dark:bg-emerald-950/30 px-2 py-0.5 rounded-lg border border-emerald-200/40 font-semibold shrink-0">
                          {deliveryRating === 5 ? "Superfast! ⚡" : deliveryRating === 4 ? "Polite & Professional" : deliveryRating === 3 ? "Good service" : deliveryRating === 2 ? "A bit delayed" : "Poor experience"}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 justify-center py-1">
                      {[1, 2, 3, 4, 5].map((star) => {
                        const isHighlighted = (hoverDeliveryRating || deliveryRating) >= star;
                        return (
                          <button
                            key={star}
                            id={`delivery-star-rating-${star}`}
                            type="button"
                            onMouseEnter={() => setHoverDeliveryRating(star)}
                            onMouseLeave={() => setHoverDeliveryRating(0)}
                            onClick={() => setDeliveryRating(star)}
                            className="p-1 focus:outline-none transition-transform hover:scale-110 active:scale-95 cursor-pointer"
                          >
                            <Star 
                              className={`w-7 h-7 stroke-[2] ${
                                isHighlighted 
                                  ? 'fill-emerald-500 stroke-emerald-500 text-emerald-500' 
                                  : 'stroke-zinc-300 dark:stroke-zinc-700 text-transparent'
                              }`} 
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Comments Input */}
                  <div className="space-y-1.5">
                    <label htmlFor="feedback-comment" className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                      Write a review (Optional)
                    </label>
                    <textarea
                      id="feedback-comment"
                      value={feedbackComment}
                      onChange={(e) => setFeedbackComment(e.target.value)}
                      placeholder="Share your experience about the hot-locking, curry rich spice blend, or delivery experience..."
                      className="w-full bg-slate-50 dark:bg-zinc-950 px-3 py-2 rounded-2xl border border-slate-100 dark:border-zinc-800/80 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-orange-500 placeholder-zinc-400 dark:placeholder-zinc-500 font-semibold min-h-[70px] resize-none"
                    />
                  </div>

                  {/* Submit buttons */}
                  <div className="flex gap-2">
                    <button
                      id="feedback-skip-btn"
                      type="button"
                      onClick={() => {
                        setShowFeedbackModal(false);
                        setCurrentPage('orders');
                      }}
                      className="flex-1 bg-slate-50 dark:bg-zinc-850 hover:bg-slate-100 dark:hover:bg-zinc-800 text-zinc-605 dark:text-zinc-350 text-xs font-bold py-3 rounded-2xl border border-slate-150 dark:border-zinc-800 transition cursor-pointer text-center"
                    >
                      Skip
                    </button>
                    <button
                      id="feedback-submit-btn"
                      type="submit"
                      disabled={mealRating === 0 || restaurantRating === 0 || deliveryRating === 0}
                      className="flex-[2] bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-black uppercase py-3 rounded-2xl transition cursor-pointer shadow-md shadow-orange-500/10 flex items-center justify-center gap-1.5 disabled:cursor-not-allowed"
                    >
                      Submit Rating ✨
                    </button>
                  </div>
                </form>
              ) : (
                <div id="feedback-success-card" className="text-center py-6 space-y-4 animate-fadeIn">
                  <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-500 rounded-full flex items-center justify-center mx-auto border border-emerald-100 dark:border-emerald-800">
                    <CheckCircle className="w-10 h-10 animate-bounce text-emerald-500" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-base font-black text-zinc-900 dark:text-zinc-50 tracking-tight">
                      Thank You for Your Feedback!
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-xs mx-auto leading-relaxed">
                      Your valuable rating has been saved successfully! Your detailed comments were transmitted straight to our kitchen and delivery fleet to help coordinate better next time! 🌟
                    </p>
                  </div>
                  <button
                    id="feedback-success-continue-btn"
                    onClick={() => {
                      setShowFeedbackModal(false);
                      setIsFeedbackSubmitted(false);
                      setCurrentPage('orders');
                    }}
                    className="w-full bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-xs py-3 rounded-2xl shadow transition cursor-pointer"
                  >
                    View Order Invoice Receipt
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
