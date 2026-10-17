import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useFeedback } from "../app/feedback";
import { useI18n } from "../app/i18n";
import { BackHeader } from "../ui/layout";
import { Button } from "../ui/kit";
import { Icon } from "../ui/Icon";

export interface LatLng { lat: number; lng: number }

/** Full-screen map with a fixed centre crosshair, a my-location button and Confirm —
 *  the Android location picker, on OpenStreetMap tiles. */
export function LocationPicker({ initial, onConfirm, onCancel }: {
  initial: LatLng | null; onConfirm: (p: LatLng) => void; onCancel: () => void;
}) {
  const { t } = useI18n();
  const { toast } = useFeedback();
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const [locating, setLocating] = useState(false);

  // Nothing chosen yet: the whole country. The visitor's own location is asked for only
  // when they tap My Location, as on Android (parity review v4.0, F1).
  useEffect(() => {
    if (!host.current || map.current) return;
    const start = initial ?? { lat: 39.8283, lng: -98.5795 };
    map.current = L.map(host.current, { zoomControl: false, attributionControl: true })
      .setView([start.lat, start.lng], initial ? 14 : 4);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: "© OpenStreetMap",
    }).addTo(map.current);
    return () => { map.current?.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the map is created once per mount
  }, []);

  const denied = () => toast(t("general_location_permission_denied", "Allow location access to use your current location."));

  function locate() {
    if (!navigator.geolocation) { denied(); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { map.current?.setView([pos.coords.latitude, pos.coords.longitude], 15); setLocating(false); },
      (error) => {
        setLocating(false);
        // Refused (now or earlier, in the browser's site settings): say what's needed
        // rather than leave a button that seems not to work (F2).
        if (error.code === error.PERMISSION_DENIED) denied();
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <div className="map-screen">
      <div className="map-header"><BackHeader title={t("general_location", "Location")} onBack={onCancel} /></div>
      <div ref={host} className="map-host" aria-label={t("general_location", "Location")} />
      <span className="map-crosshair" aria-hidden="true" />
      <button type="button" className="map-locate" onClick={locate} aria-label="My location" disabled={locating}>
        <Icon name="ic_my_location" size={26} tint="var(--primary)" />
      </button>
      <div className="map-confirm">
        <Button trailingIcon="ic_chevron_forward" onClick={() => {
          const c = map.current?.getCenter();
          if (c) onConfirm({ lat: c.lat, lng: c.lng });
        }}>{t("general_confirm", "Confirm")}</Button>
      </div>
    </div>
  );
}
