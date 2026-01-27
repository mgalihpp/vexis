import { useState, useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  useMapEvents,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import { Crosshair, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Fix for default marker icons
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIconRetina from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

const DefaultIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIconRetina,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

L.Marker.prototype.options.icon = DefaultIcon;

interface LocationPickerProps {
  value: { lat: number; lng: number };
  onChange: (value: { lat: number; lng: number }) => void;
  height?: string;
}

function LocationMarker({
  position,
  setPosition,
}: {
  position: { lat: number; lng: number };
  setPosition: (pos: { lat: number; lng: number }) => void;
}) {
  useMapEvents({
    click(e) {
      setPosition(e.latlng);
    },
  });

  return (
    <Marker
      position={position}
      draggable={true}
      eventHandlers={{
        dragend: (e) => {
          const marker = e.target;
          setPosition(marker.getLatLng());
        },
      }}
    />
  );
}

function ChangeView({ center }: { center: { lat: number; lng: number } }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center);
  }, [center, map]);
  return null;
}

export function LocationPicker({
  value,
  onChange,
  height = "300px",
}: LocationPickerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isLocating, setIsLocating] = useState(false);

  const handleGetCurrentLocation = () => {
    setIsLocating(true);
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          onChange({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
          setIsLocating(false);
        },
        (error) => {
          console.error("Error getting location", error);
          setIsLocating(false);
        },
      );
    } else {
      setIsLocating(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}`,
      );
      const data = await response.json();
      if (data && data.length > 0) {
        onChange({
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon),
        });
      }
    } catch (error) {
      console.error("Search error", error);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <form className="flex-1 flex gap-2">
          <Input
            placeholder="Cari lokasi (contoh: Monas)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={handleSearch}
          >
            <Search className="h-4 w-4" />
          </Button>
        </form>
        <Button
          type="button"
          variant="outline"
          onClick={handleGetCurrentLocation}
          disabled={isLocating}
        >
          <Crosshair
            className={`h-4 w-4 ${isLocating ? "animate-spin" : ""}`}
          />
        </Button>
      </div>

      <div
        style={{ height, width: "100%" }}
        className="rounded-md overflow-hidden border"
      >
        <MapContainer
          center={value}
          zoom={13}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <LocationMarker position={value} setPosition={onChange} />
          <ChangeView center={value} />
        </MapContainer>
      </div>
      <div className="text-xs text-muted-foreground flex justify-between">
        <span>Lat: {value.lat.toFixed(6)}</span>
        <span>Lng: {value.lng.toFixed(6)}</span>
      </div>
    </div>
  );
}
