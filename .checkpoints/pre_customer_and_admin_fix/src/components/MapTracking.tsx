/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * MapTracking View - Google Maps Platform Interactive Delivery & Restaurant Tracking.
 * Displays an interactive map centered on the user's selected delivery address and highlights the nearby restaurant.
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, useMotionValue, animate } from 'motion/react';
import { useApp } from '../context/AppContext';
import { 
  APIProvider, 
  Map, 
  AdvancedMarker, 
  Pin, 
  InfoWindow, 
  useMap,
  MapControl,
  ControlPosition
} from '@vis.gl/react-google-maps';
import { 
  MapPin, 
  Navigation, 
  Store, 
  ChevronLeft, 
  Clock, 
  Phone, 
  Utensils, 
  Star, 
  Compass, 
  Layers, 
  Crosshair, 
  Sparkles, 
  Bike, 
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  Info
} from 'lucide-react';
import { Restaurant, Address } from '../types';

// Default Chirala City Coordinates (Center: 15.8246, 80.3533)
const CHIRALA_DEFAULT_COORDS = { lat: 15.8246, lng: 80.3533 };

// Deterministic GPS coordinates generator for restaurants in Chirala
function getRestaurantCoordinates(restaurantId: string): { lat: number; lng: number } {
  const hash = restaurantId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const latDisp = ((hash % 29) - 14.5) * 0.0007; // ~1-2km spread from center
  const lngDisp = ((hash % 37) - 18.5) * 0.0007;
  return {
    lat: parseFloat((CHIRALA_DEFAULT_COORDS.lat + latDisp).toFixed(6)),
    lng: parseFloat((CHIRALA_DEFAULT_COORDS.lng + lngDisp).toFixed(6)),
  };
}

// Haversine distance formula with urban road factor
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
  return Math.max(0.2, parseFloat((straightLineKm * 1.25).toFixed(2)));
}

/**
 * Smoothly animated Delivery Rider marker driven by Framer Motion (`useMotionValue` + `animate`)
 * so geographic coordinate updates glide smoothly between positions instead of snapping abruptly.
 */
function AnimatedRiderMarker({
  targetPosition,
  riderName,
  vehicleLabel,
  isMoving,
  isSelected,
  onClick,
  onPositionFrame,
}: {
  targetPosition: { lat: number; lng: number };
  riderName: string;
  vehicleLabel?: string;
  isMoving: boolean;
  isSelected: boolean;
  onClick: () => void;
  onPositionFrame?: (pos: { lat: number; lng: number }) => void;
}) {
  const latMotion = useMotionValue(targetPosition.lat);
  const lngMotion = useMotionValue(targetPosition.lng);
  const [animatedPos, setAnimatedPos] = useState<{ lat: number; lng: number }>(targetPosition);
  const [leanDegrees, setLeanDegrees] = useState<number>(0);
  const [isGliding, setIsGliding] = useState<boolean>(false);

  const prevTargetRef = useRef<{ lat: number; lng: number }>(targetPosition);
  const rafRef = useRef<number | null>(null);
  const onPositionFrameRef = useRef(onPositionFrame);
  onPositionFrameRef.current = onPositionFrame;

  // Coalesce motion value frame changes into a single React state update per animation frame
  useEffect(() => {
    const syncFrame = () => {
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const nextPos = {
          lat: latMotion.get(),
          lng: lngMotion.get(),
        };
        setAnimatedPos(nextPos);
        onPositionFrameRef.current?.(nextPos);
      });
    };

    const unsubLat = latMotion.on('change', syncFrame);
    const unsubLng = lngMotion.on('change', syncFrame);

    return () => {
      unsubLat();
      unsubLng();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [latMotion, lngMotion]);

  // Animate latitude and longitude smoothly whenever targetPosition updates
  useEffect(() => {
    const prev = prevTargetRef.current;
    const dLat = targetPosition.lat - prev.lat;
    const dLng = targetPosition.lng - prev.lng;
    const hasMoved = Math.abs(dLat) > 1e-7 || Math.abs(dLng) > 1e-7;

    prevTargetRef.current = targetPosition;

    if (!hasMoved) {
      return;
    }

    // Subtle directional lean based on horizontal displacement
    const tilt = dLng >= 0 ? 7 : -7;
    setLeanDegrees(tilt);
    setIsGliding(true);

    const latControls = animate(latMotion, targetPosition.lat, {
      duration: 1.35,
      ease: [0.22, 1, 0.36, 1],
    });
    const lngControls = animate(lngMotion, targetPosition.lng, {
      duration: 1.35,
      ease: [0.22, 1, 0.36, 1],
      onComplete: () => {
        setIsGliding(false);
        setLeanDegrees(0);
      },
    });

    return () => {
      latControls.stop();
      lngControls.stop();
    };
  }, [targetPosition.lat, targetPosition.lng, latMotion, lngMotion]);

  const activeMotion = isMoving || isGliding;

  return (
    <AdvancedMarker
      position={animatedPos}
      title={`Rider: ${riderName}`}
      zIndex={40}
      onClick={onClick}
    >
      <motion.div
        initial={{ scale: 0.65, opacity: 0, y: 8 }}
        animate={{ scale: isSelected ? 1.12 : 1, opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 22 }}
        className="relative flex flex-col items-center group cursor-pointer"
      >
        {/* Radar Pulse Ring */}
        <motion.span
          animate={{
            scale: activeMotion ? [1, 1.75, 1] : [1, 1.35, 1],
            opacity: activeMotion ? [0.55, 0, 0.55] : [0.28, 0.05, 0.28],
          }}
          transition={{
            duration: activeMotion ? 1.5 : 2.6,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="absolute -top-1.5 w-11 h-11 rounded-full bg-orange-500/35 pointer-events-none"
        />

        {/* Animated Scooter / Rider Badge */}
        <motion.div
          animate={{
            y: activeMotion ? [0, -3, 0] : 0,
            rotate: isGliding ? leanDegrees : 0,
          }}
          transition={{
            y: {
              duration: 0.85,
              repeat: activeMotion ? Infinity : 0,
              ease: 'easeInOut',
            },
            rotate: {
              type: 'spring',
              stiffness: 240,
              damping: 18,
            },
          }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.94 }}
          className="relative w-11 h-11 rounded-2xl bg-gradient-to-tr from-orange-600 via-orange-500 to-amber-500 text-white border-2 border-white shadow-xl flex items-center justify-center"
        >
          <Bike className="w-5 h-5 text-white drop-shadow-xs" />
          <span
            className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-white ${
              activeMotion ? 'bg-emerald-400' : 'bg-amber-300'
            }`}
          />
        </motion.div>

        {/* Compact Rider Pill Tag */}
        <motion.span
          layout
          className="mt-1 px-2.5 py-0.5 bg-zinc-900/95 text-white text-[10px] font-black rounded-lg shadow-md tracking-wide whitespace-nowrap flex items-center gap-1 border border-white/15 backdrop-blur-xs"
        >
          <span className={`w-1.5 h-1.5 rounded-full ${activeMotion ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
          <span>{riderName}</span>
          {vehicleLabel ? <span className="text-orange-300 font-semibold">• {vehicleLabel}</span> : null}
        </motion.span>
      </motion.div>
    </AdvancedMarker>
  );
}

/**
 * Camera Controller component using Google Maps hooks to handle smooth panning and bounds fitting
 */
function MapCameraController({
  deliveryCoords,
  restaurantCoords,
  riderCoords,
  focusMode,
  onResetFocus
}: {
  deliveryCoords: { lat: number; lng: number };
  restaurantCoords: { lat: number; lng: number };
  riderCoords: { lat: number; lng: number };
  focusMode: 'delivery' | 'restaurant' | 'rider' | 'fit' | null;
  onResetFocus: () => void;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map || !focusMode) return;

    if (focusMode === 'delivery') {
      map.panTo(deliveryCoords);
      map.setZoom(16);
      onResetFocus();
    } else if (focusMode === 'restaurant') {
      map.panTo(restaurantCoords);
      map.setZoom(16);
      onResetFocus();
    } else if (focusMode === 'rider') {
      map.panTo(riderCoords);
      map.setZoom(16);
      onResetFocus();
    } else if (focusMode === 'fit') {
      const bounds = new google.maps.LatLngBounds();
      bounds.extend(deliveryCoords);
      bounds.extend(restaurantCoords);
      bounds.extend(riderCoords);
      map.fitBounds(bounds, { top: 70, bottom: 90, left: 50, right: 50 });
      onResetFocus();
    }
  }, [map, focusMode, deliveryCoords, restaurantCoords, riderCoords, onResetFocus]);

  return null;
}

export default function MapTracking() {
  const { 
    currentAddress, 
    user, 
    restaurants, 
    orders, 
    activeTrackingOrder,
    deliveryRouteProgress,
    deliveryPartners,
    setCurrentPage, 
    goBack,
    clickToWhatsAppSupport 
  } = useApp();

  // Resolve the specifically tracked order first, falling back to any active or latest order
  const activeOrder = useMemo(() => {
    return activeTrackingOrder || orders?.find(o => o.status !== 'delivered' && o.status !== 'cancelled') || orders?.[0];
  }, [activeTrackingOrder, orders]);

  // 1. Resolve Delivery Address and GPS Coordinates
  const selectedAddress: Address | null = useMemo(() => {
    if (activeOrder?.address) return activeOrder.address;
    if (currentAddress) return currentAddress;
    if (user?.addresses && user.addresses.length > 0) {
      return user.addresses.find(a => a.isDefault) || user.addresses[0];
    }
    return null;
  }, [activeOrder, currentAddress, user]);

  const deliveryCoords = useMemo(() => {
    if (selectedAddress?.gpsCoordinates?.lat && selectedAddress?.gpsCoordinates?.lng) {
      return {
        lat: selectedAddress.gpsCoordinates.lat,
        lng: selectedAddress.gpsCoordinates.lng
      };
    }
    return CHIRALA_DEFAULT_COORDS;
  }, [selectedAddress]);

  // Find candidate restaurants with valid locations
  const restaurantListWithCoords = useMemo(() => {
    return restaurants.map(r => ({
      ...r,
      coords: getRestaurantCoordinates(r.id),
      distance: calculateDistanceKm(
        deliveryCoords.lat, 
        deliveryCoords.lng, 
        getRestaurantCoordinates(r.id).lat, 
        getRestaurantCoordinates(r.id).lng
      )
    })).sort((a, b) => a.distance - b.distance);
  }, [restaurants, deliveryCoords]);

  // Active highlighted restaurant (defaults to active order restaurant or nearest available restaurant)
  const defaultHighlightedRestaurantId = useMemo(() => {
    const orderRestId = activeOrder?.restaurantId || activeOrder?.items?.[0]?.foodItem?.restaurantId;
    if (orderRestId) {
      const match = restaurants.find(r => r.id === orderRestId);
      if (match) return match.id;
    }
    if (activeOrder?.restaurantName) {
      const nameMatch = restaurants.find(
        r => r.name.toLowerCase() === activeOrder.restaurantName?.toLowerCase()
      );
      if (nameMatch) return nameMatch.id;
    }
    return restaurantListWithCoords[0]?.id || '';
  }, [activeOrder, restaurants, restaurantListWithCoords]);

  const [highlightedRestaurantId, setHighlightedRestaurantId] = useState<string>(defaultHighlightedRestaurantId);

  useEffect(() => {
    if (defaultHighlightedRestaurantId) {
      setHighlightedRestaurantId(defaultHighlightedRestaurantId);
    }
  }, [defaultHighlightedRestaurantId]);

  const highlightedRestaurant = useMemo(() => {
    return restaurantListWithCoords.find(r => r.id === highlightedRestaurantId) || restaurantListWithCoords[0];
  }, [restaurantListWithCoords, highlightedRestaurantId]);

  const restaurantCoords = useMemo(() => {
    return highlightedRestaurant?.coords || CHIRALA_DEFAULT_COORDS;
  }, [highlightedRestaurant]);

  // Distance and ETA metrics
  const tripMetrics = useMemo(() => {
    const km = calculateDistanceKm(
      restaurantCoords.lat, 
      restaurantCoords.lng, 
      deliveryCoords.lat, 
      deliveryCoords.lng
    );
    // Estimated delivery time: 10 min prep + 3.5 min per km
    const etaMinutes = Math.round(10 + km * 3.5);
    return {
      distanceKm: km,
      etaMinutes: Math.max(15, etaMinutes)
    };
  }, [restaurantCoords, deliveryCoords]);

  // Resolve assigned rider info & target rider GPS coordinates
  const assignedRider = useMemo(() => {
    if (activeOrder?.deliveryPartner) return activeOrder.deliveryPartner;
    if (activeOrder?.deliveryPartnerId) {
      const found = deliveryPartners?.find(p => p.id === activeOrder.deliveryPartnerId);
      if (found) return found;
    }
    return deliveryPartners?.find(p => p.isApproved && p.isAvailable) || deliveryPartners?.[0] || null;
  }, [activeOrder, deliveryPartners]);

  const riderDisplayName = activeOrder?.deliveryPartnerName || assignedRider?.name || 'Nuvvo Rider';
  const riderVehicle = activeOrder?.deliveryPartnerVehicle || assignedRider?.vehicleType || 'Bike';

  const riderProgress = useMemo(() => {
    if (!activeOrder) return Math.max(0, Math.min(100, deliveryRouteProgress || 0));
    if (activeOrder.status === 'delivered') return 100;
    if (activeOrder.status === 'on_the_way' || activeOrder.status === 'picked') {
      return Math.max(8, Math.min(100, deliveryRouteProgress || 35));
    }
    return Math.max(0, Math.min(100, deliveryRouteProgress || 0));
  }, [activeOrder, deliveryRouteProgress]);

  const riderCoords = useMemo(() => {
    if (activeOrder?.deliveryPartnerLocation?.lat && activeOrder?.deliveryPartnerLocation?.lng) {
      return {
        lat: activeOrder.deliveryPartnerLocation.lat,
        lng: activeOrder.deliveryPartnerLocation.lng,
      };
    }
    if (activeOrder && assignedRider?.currentLocation?.lat && assignedRider?.currentLocation?.lng) {
      return {
        lat: assignedRider.currentLocation.lat,
        lng: assignedRider.currentLocation.lng,
      };
    }
    const t = riderProgress / 100;
    return {
      lat: restaurantCoords.lat + (deliveryCoords.lat - restaurantCoords.lat) * t,
      lng: restaurantCoords.lng + (deliveryCoords.lng - restaurantCoords.lng) * t,
    };
  }, [activeOrder, assignedRider, riderProgress, restaurantCoords, deliveryCoords]);

  const isRiderMoving = Boolean(
    activeOrder &&
    (activeOrder.status === 'on_the_way' || activeOrder.status === 'picked' || (riderProgress > 0 && riderProgress < 100))
  );

  const [liveRiderPos, setLiveRiderPos] = useState<{ lat: number; lng: number }>(riderCoords);

  // Interactive UI States
  const [activeInfoWindow, setActiveInfoWindow] = useState<'delivery' | 'restaurant' | 'rider' | string | null>('restaurant');
  const [cameraFocus, setCameraFocus] = useState<'delivery' | 'restaurant' | 'rider' | 'fit' | null>('fit');
  const [mapTypeId, setMapTypeId] = useState<string>('roadmap');
  const [showNearbyList, setShowNearbyList] = useState(false);

  // Retrieve API Key securely from environment
  const apiKey = useMemo(() => {
    const key = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY || 
                (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY || '';
    return key && key !== 'YOUR_API_KEY' ? key : '';
  }, []);

  const handleResetFocus = useCallback(() => {
    setCameraFocus(null);
  }, []);

  return (
    <div className="relative w-full h-[calc(100vh-64px)] flex flex-col bg-slate-50 dark:bg-zinc-950 overflow-hidden">
      {/* Top Header Floating Navigation Bar */}
      <header className="absolute top-3 left-3 right-3 z-30 flex items-center justify-between gap-2 pointer-events-none">
        <button
          type="button"
          onClick={() => {
            if (typeof goBack === 'function') goBack();
            else setCurrentPage('delivery');
          }}
          className="pointer-events-auto flex items-center gap-1.5 px-3.5 py-2 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-slate-200/80 dark:border-zinc-800 shadow-md rounded-2xl text-xs font-bold text-zinc-800 dark:text-zinc-100 hover:bg-white dark:hover:bg-zinc-900 transition-transform active:scale-95 cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4 text-orange-600 dark:text-orange-500" />
          <span>Back</span>
        </button>

        <div className="pointer-events-auto flex items-center gap-1.5 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-slate-200/80 dark:border-zinc-800 shadow-md px-3 py-1.5 rounded-2xl">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[11px] font-black tracking-tight text-zinc-800 dark:text-zinc-200 uppercase font-mono">
            Live Delivery Tracking{activeOrder ? ` • #${activeOrder.id.replace('order_', 'ORD-').slice(-6).toUpperCase()}` : ''}
          </span>
        </div>

        <div className="pointer-events-auto flex items-center gap-1 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-slate-200/80 dark:border-zinc-800 shadow-md p-1 rounded-2xl">
          <button
            type="button"
            onClick={() => setMapTypeId(prev => prev === 'roadmap' ? 'satellite' : 'roadmap')}
            title="Toggle Map Style"
            className="p-1.5 rounded-xl text-zinc-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition cursor-pointer"
          >
            <Layers className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Google Maps View Container */}
      <div className="relative flex-1 w-full h-full min-h-[480px]">
        {apiKey ? (
          <APIProvider apiKey={apiKey} libraries={['marker', 'geometry']}>
            <Map
              mapId="DEMO_MAP_ID"
              center={deliveryCoords}
              defaultZoom={14}
              gestureHandling="greedy"
              disableDefaultUI={false}
              mapTypeId={mapTypeId}
              internalUsageAttributionIds={["gmp_mcp_codeassist_v1_aistudio"]}
              className="w-full h-full"
              style={{ width: '100%', height: '100%' }}
            >
              {/* Dynamic Camera Focus Controller */}
              <MapCameraController
                deliveryCoords={deliveryCoords}
                restaurantCoords={restaurantCoords}
                riderCoords={liveRiderPos}
                focusMode={cameraFocus}
                onResetFocus={handleResetFocus}
              />

              {/* 1. PRIMARY MARKER: User's Selected Delivery Address */}
              <AdvancedMarker
                position={deliveryCoords}
                title="Your Delivery Address"
                zIndex={25}
                onClick={() => setActiveInfoWindow(prev => prev === 'delivery' ? null : 'delivery')}
              >
                <div className="relative flex flex-col items-center group cursor-pointer">
                  {/* Subtle Radar Pulse */}
                  <span className="absolute -inset-1 rounded-full bg-orange-500/25 animate-ping pointer-events-none" />
                  <Pin
                    background="#ea580c"
                    borderColor="#9a3412"
                    glyphColor="#ffffff"
                    scale={1.15}
                  />
                  <span className="mt-1 px-2 py-0.5 bg-zinc-900/90 text-white text-[9.5px] font-bold rounded-md shadow-md uppercase tracking-wider backdrop-blur-xs whitespace-nowrap">
                    🏠 Delivery Location
                  </span>
                </div>
              </AdvancedMarker>

              {/* Delivery Address InfoWindow */}
              {activeInfoWindow === 'delivery' && (
                <InfoWindow
                  position={deliveryCoords}
                  onCloseClick={() => setActiveInfoWindow(null)}
                >
                  <div className="p-1.5 text-zinc-900 text-xs max-w-[220px]">
                    <div className="flex items-center gap-1.5 text-orange-600 font-extrabold text-xs uppercase border-b pb-1 mb-1">
                      <MapPin className="w-3.5 h-3.5" />
                      <span>{selectedAddress?.type || 'Home'} Address</span>
                    </div>
                    <p className="font-semibold text-zinc-800 text-[11px] leading-tight">
                      {selectedAddress?.flatNo ? `${selectedAddress.flatNo}, ` : ''}{selectedAddress?.area || 'Chirala Area'}
                    </p>
                    {selectedAddress?.landmark && (
                      <p className="text-[10px] text-zinc-500 mt-0.5">
                        Landmark: {selectedAddress.landmark}
                      </p>
                    )}
                    <div className="mt-2 pt-1 border-t flex justify-between text-[10px] text-zinc-500 font-mono">
                      <span>Coordinates:</span>
                      <span className="font-bold text-zinc-700">
                        {deliveryCoords.lat.toFixed(4)}, {deliveryCoords.lng.toFixed(4)}
                      </span>
                    </div>
                  </div>
                </InfoWindow>
              )}

              {/* 2. PRIMARY HIGHLIGHTED RESTAURANT MARKER */}
              {highlightedRestaurant && (
                <AdvancedMarker
                  position={restaurantCoords}
                  title={`Restaurant: ${highlightedRestaurant.name}`}
                  zIndex={30}
                  onClick={() => setActiveInfoWindow(prev => prev === 'restaurant' ? null : 'restaurant')}
                >
                  <div className="relative flex flex-col items-center group cursor-pointer">
                    {/* Glowing Beacon Effect for Highlighted Restaurant */}
                    <div className="absolute -top-3 w-12 h-12 rounded-full bg-emerald-500/20 animate-ping pointer-events-none" />
                    <div className="relative w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white border-2 border-white shadow-xl flex items-center justify-center transition-transform group-hover:scale-110">
                      <Utensils className="w-5 h-5 text-white" />
                    </div>
                    <span className="mt-1 px-2.5 py-0.5 bg-emerald-700 text-white text-[10px] font-black rounded-lg shadow-md uppercase tracking-wider whitespace-nowrap flex items-center gap-1">
                      <span>🍳 {highlightedRestaurant.name}</span>
                    </span>
                  </div>
                </AdvancedMarker>
              )}

              {/* Highlighted Restaurant InfoWindow */}
              {activeInfoWindow === 'restaurant' && highlightedRestaurant && (
                <InfoWindow
                  position={restaurantCoords}
                  onCloseClick={() => setActiveInfoWindow(null)}
                >
                  <div className="p-2 text-zinc-900 text-xs min-w-[210px] max-w-[250px]">
                    <div className="flex items-center justify-between gap-1 border-b pb-1 mb-1.5">
                      <h4 className="font-black text-sm text-zinc-900 truncate">
                        {highlightedRestaurant.name}
                      </h4>
                      <span className="flex items-center gap-0.5 text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded font-bold">
                        <Star className="w-2.5 h-2.5 fill-amber-500 text-amber-500" />
                        {highlightedRestaurant.rating || '4.8'}
                      </span>
                    </div>

                    <p className="text-[10px] text-zinc-600 truncate mb-1">
                      {highlightedRestaurant.cuisines?.slice(0, 3).join(', ') || 'Authentic Andhra & South Indian'}
                    </p>

                    <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-200 text-[10.5px] space-y-1 mb-2 font-mono">
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Road Distance:</span>
                        <strong className="text-emerald-700">{tripMetrics.distanceKm} km</strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Estimated Delivery:</span>
                        <strong className="text-orange-600">~{tripMetrics.etaMinutes} mins</strong>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setCurrentPage('home')}
                      className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-center font-bold text-[10px] uppercase tracking-wider transition cursor-pointer"
                    >
                      Browse Restaurant Menu
                    </button>
                  </div>
                </InfoWindow>
              )}

              {/* 2B. ANIMATED DELIVERY RIDER MARKER */}
              <AnimatedRiderMarker
                targetPosition={riderCoords}
                riderName={riderDisplayName}
                vehicleLabel={riderVehicle}
                isMoving={isRiderMoving}
                isSelected={activeInfoWindow === 'rider'}
                onClick={() => setActiveInfoWindow(prev => prev === 'rider' ? null : 'rider')}
                onPositionFrame={setLiveRiderPos}
              />

              {/* Delivery Rider InfoWindow */}
              {activeInfoWindow === 'rider' && (
                <InfoWindow
                  position={liveRiderPos}
                  onCloseClick={() => setActiveInfoWindow(null)}
                >
                  <div className="p-2 text-zinc-900 text-xs min-w-[200px] max-w-[240px]">
                    <div className="flex items-center justify-between gap-2 border-b pb-1 mb-1.5">
                      <div className="flex items-center gap-1.5 text-orange-600 font-black uppercase text-[11px]">
                        <Bike className="w-4 h-4" />
                        <span className="truncate">{riderDisplayName}</span>
                      </div>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                        isRiderMoving ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {activeOrder?.status === 'delivered' ? 'Arrived' : isRiderMoving ? 'En Route' : 'At Kitchen'}
                      </span>
                    </div>
                    <div className="space-y-1 text-[10.5px] font-mono text-zinc-600">
                      <div className="flex justify-between">
                        <span>Vehicle:</span>
                        <strong className="text-zinc-900">{riderVehicle}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span>Route Progress:</span>
                        <strong className="text-orange-600">{Math.round(riderProgress)}%</strong>
                      </div>
                      <div className="flex justify-between">
                        <span>Remaining Distance:</span>
                        <strong className="text-emerald-700">
                          {calculateDistanceKm(liveRiderPos.lat, liveRiderPos.lng, deliveryCoords.lat, deliveryCoords.lng)} km
                        </strong>
                      </div>
                    </div>
                  </div>
                </InfoWindow>
              )}

              {/* 3. ADDITIONAL NEARBY RESTAURANTS (MAPPED IN AREA) */}
              {restaurantListWithCoords
                .filter(r => r.id !== highlightedRestaurantId)
                .slice(0, 8)
                .map((r) => (
                  <AdvancedMarker
                    key={r.id}
                    position={r.coords}
                    title={r.name}
                    zIndex={15}
                    onClick={() => {
                      setHighlightedRestaurantId(r.id);
                      setActiveInfoWindow(r.id);
                      setCameraFocus('restaurant');
                    }}
                  >
                    <div className="flex flex-col items-center opacity-85 hover:opacity-100 transition-opacity cursor-pointer">
                      <Pin
                        background="#3b82f6"
                        borderColor="#1d4ed8"
                        glyphColor="#ffffff"
                        scale={0.8}
                      />
                      <span className="text-[9px] bg-white/90 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 px-1 rounded shadow-xs font-semibold whitespace-nowrap truncate max-w-[90px]">
                        {r.name}
                      </span>
                    </div>
                  </AdvancedMarker>
              ))}

              {/* InfoWindow for non-primary tapped restaurants */}
              {activeInfoWindow && 
                activeInfoWindow !== 'delivery' && 
                activeInfoWindow !== 'restaurant' && 
                activeInfoWindow !== 'rider' &&
                (() => {
                  const clickedRest = restaurantListWithCoords.find(r => r.id === activeInfoWindow);
                  if (!clickedRest) return null;
                  return (
                    <InfoWindow
                      position={clickedRest.coords}
                      onCloseClick={() => setActiveInfoWindow(null)}
                    >
                      <div className="p-1.5 text-zinc-900 text-xs min-w-[180px]">
                        <p className="font-bold text-xs">{clickedRest.name}</p>
                        <p className="text-[10px] text-zinc-500 mt-0.5">
                          Distance: {clickedRest.distance} km from delivery point
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setHighlightedRestaurantId(clickedRest.id);
                            setActiveInfoWindow('restaurant');
                          }}
                          className="mt-2 w-full py-1 bg-orange-600 text-white rounded text-[10px] font-bold uppercase tracking-wider"
                        >
                          Highlight as Target
                        </button>
                      </div>
                    </InfoWindow>
                  );
                })()
              }
            </Map>
          </APIProvider>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-slate-100 dark:bg-zinc-900">
            <div className="w-14 h-14 rounded-3xl bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-3">
              <Compass className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
              Interactive Map Initializing
            </h3>
            <p className="text-xs text-zinc-500 max-w-sm mt-1">
              Google Maps API integration is configured for Chirala delivery tracking.
            </p>
          </div>
        )}

        {/* Floating Camera Control Buttons */}
        <div className="absolute right-3 top-20 z-20 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => {
              setCameraFocus('rider');
              setActiveInfoWindow('rider');
            }}
            title="Center on Delivery Rider"
            className="w-10 h-10 rounded-2xl bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md shadow-md border border-slate-200 dark:border-zinc-800 text-orange-600 dark:text-orange-400 flex items-center justify-center hover:bg-orange-50 dark:hover:bg-zinc-800 transition active:scale-95 cursor-pointer"
          >
            <Bike className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={() => setCameraFocus('delivery')}
            title="Center on Delivery Address"
            className="w-10 h-10 rounded-2xl bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md shadow-md border border-slate-200 dark:border-zinc-800 text-orange-600 dark:text-orange-500 flex items-center justify-center hover:bg-orange-50 dark:hover:bg-zinc-800 transition active:scale-95 cursor-pointer"
          >
            <MapPin className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={() => setCameraFocus('restaurant')}
            title="Focus Highlighted Restaurant"
            className="w-10 h-10 rounded-2xl bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md shadow-md border border-slate-200 dark:border-zinc-800 text-emerald-600 dark:text-emerald-500 flex items-center justify-center hover:bg-emerald-50 dark:hover:bg-zinc-800 transition active:scale-95 cursor-pointer"
          >
            <Store className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={() => setCameraFocus('fit')}
            title="Fit All Locations"
            className="w-10 h-10 rounded-2xl bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md shadow-md border border-slate-200 dark:border-zinc-800 text-blue-600 dark:text-blue-500 flex items-center justify-center hover:bg-blue-50 dark:hover:bg-zinc-800 transition active:scale-95 cursor-pointer"
          >
            <Crosshair className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Bottom Floating Delivery & Highlighted Restaurant Card */}
      <div className="relative z-20 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border-t border-slate-200 dark:border-zinc-800 px-4 py-3.5 shadow-2xl safe-bottom">
        <div className="w-full max-w-4xl mx-auto space-y-3">
          {/* Main Delivery & Restaurant Correlation Header */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-black uppercase text-zinc-400 tracking-wider block">
                Highlighted Nearby Partner
              </span>
              <h3 className="font-black text-sm text-zinc-900 dark:text-zinc-50 truncate flex items-center gap-1.5">
                <span className="text-emerald-600">🍳</span> {highlightedRestaurant?.name || 'Local Kitchen'}
              </h3>
            </div>

            <div className="flex items-center gap-2">
              <div className="text-right">
                <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 block font-mono">
                  {tripMetrics.distanceKm} km
                </span>
                <span className="text-[9.5px] text-zinc-400 font-mono">
                  ~{tripMetrics.etaMinutes} mins
                </span>
              </div>

              <button
                type="button"
                onClick={() => setShowNearbyList(!showNearbyList)}
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-xl text-[10px] font-bold transition cursor-pointer"
              >
                {showNearbyList ? 'Hide List' : 'Switch'}
              </button>
            </div>
          </div>

          {/* Delivery Point Summary Pill */}
          <div className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-zinc-800/60 rounded-xl border border-slate-150/80 dark:border-zinc-800 text-xs">
            <div className="w-7 h-7 rounded-lg bg-orange-100 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0">
              <MapPin className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-[11px] text-zinc-900 dark:text-zinc-100">
                  {selectedAddress?.type || 'Home'} ({selectedAddress?.flatNo || 'House'})
                </span>
                <span className="text-[9.5px] text-zinc-400 font-mono">
                  Centered Location
                </span>
              </div>
              <p className="text-[10.5px] text-zinc-500 dark:text-zinc-400 truncate">
                {selectedAddress?.area || 'Chirala, Andhra Pradesh'}
              </p>
            </div>
          </div>

          {/* Collapsible Switcher for other nearby restaurants */}
          {showNearbyList && (
            <div className="pt-2 border-t border-slate-100 dark:border-zinc-800">
              <span className="text-[9.5px] font-bold text-zinc-400 uppercase tracking-wider block mb-1.5 font-mono">
                Select Nearby Restaurant to Highlight
              </span>
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                {restaurantListWithCoords.slice(0, 6).map((r) => {
                  const isSelected = r.id === highlightedRestaurantId;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        setHighlightedRestaurantId(r.id);
                        setActiveInfoWindow('restaurant');
                        setCameraFocus('fit');
                      }}
                      className={`shrink-0 px-3 py-2 rounded-xl text-left border text-xs transition cursor-pointer min-w-[140px] ${
                        isSelected
                          ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-500/50 text-emerald-900 dark:text-emerald-200 shadow-xs'
                          : 'bg-white dark:bg-zinc-800 border-slate-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300'
                      }`}
                    >
                      <p className="font-bold text-[11px] truncate">{r.name}</p>
                      <div className="flex items-center justify-between mt-1 text-[9.5px] font-mono text-zinc-500">
                        <span>{r.distance} km</span>
                        <span className="text-amber-500 font-bold">★ {r.rating || '4.8'}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
