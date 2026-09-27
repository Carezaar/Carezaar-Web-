import { useEffect, useRef, useState } from "react";
import { useI18n } from "../app/i18n";

/** Square crop after choosing a photo, as Android does before upload. Drag to
 *  position, pinch / wheel / slider to zoom; the square always stays covered.
 *  Produces an 800×800 JPEG `File`. */
export function PhotoCropper({ file, onDone, onCancel }: {
  file: File; onDone: (cropped: File) => void; onCancel: () => void;
}) {
  const { t } = useI18n();
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; z: number } | null>(null);
  const side = Math.min(360, (typeof window !== "undefined" ? window.innerWidth : 400) - 40);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => setImg(image);
    image.src = url;
    return () => {
      // Abandon this load before revoking, or it fails against a dead URL.
      image.onload = null;
      image.removeAttribute("src");
      URL.revokeObjectURL(url);
    };
  }, [file]);

  const base = img ? side / Math.min(img.naturalWidth, img.naturalHeight) : 1;
  const scale = base * zoom;
  const shown = img ? { w: img.naturalWidth * scale, h: img.naturalHeight * scale } : { w: side, h: side };
  const clamp = (o: { x: number; y: number }, s = shown) => {
    const mx = Math.max(0, (s.w - side) / 2), my = Math.max(0, (s.h - side) / 2);
    return { x: Math.min(mx, Math.max(-mx, o.x)), y: Math.min(my, Math.max(-my, o.y)) };
  };
  const setZoomClamped = (z: number) => {
    const next = Math.min(4, Math.max(1, z));
    setZoom(next);
    if (img) setOffset((o) => clamp(o, { w: img.naturalWidth * base * next, h: img.naturalHeight * base * next }));
  };

  const confirm = () => {
    if (!img) return;
    const out = 800;
    const canvas = document.createElement("canvas");
    canvas.width = out; canvas.height = out;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const sx = (shown.w / 2 - side / 2 - offset.x) / scale;
    const sy = (shown.h / 2 - side / 2 - offset.y) / scale;
    ctx.drawImage(img, sx, sy, side / scale, side / scale, 0, 0, out, out);
    canvas.toBlob((blob) => {
      if (blob) onDone(new File([blob], "profile.jpg", { type: "image/jpeg" }));
    }, "image/jpeg", 0.85);
  };

  return (
    <div className="cropper" role="dialog" aria-modal="true" aria-label={t("profile_edit_upload_photo", "Upload Photo")}>
      <div className="cropper-bar">
        <button type="button" className="link light" onClick={onCancel}>{t("general_cancel", "Cancel")}</button>
        <button type="button" className="link light strong" onClick={confirm} disabled={!img}>{t("general_confirm", "Confirm")}</button>
      </div>
      <div className="cropper-stage"
        onWheel={(e) => setZoomClamped(zoom * (e.deltaY < 0 ? 1.08 : 0.93))}
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture?.(e.pointerId);
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()];
            pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), z: zoom };
            drag.current = null;
          } else {
            drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
          }
        }}
        onPointerMove={(e) => {
          if (!pointers.current.has(e.pointerId)) return;
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pinch.current && pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()];
            setZoomClamped(pinch.current.z * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.d));
          } else if (drag.current) {
            setOffset(clamp({ x: drag.current.ox + e.clientX - drag.current.x, y: drag.current.oy + e.clientY - drag.current.y }));
          }
        }}
        onPointerUp={(e) => { pointers.current.delete(e.pointerId); pinch.current = null; drag.current = null; }}
        onPointerCancel={(e) => { pointers.current.delete(e.pointerId); pinch.current = null; drag.current = null; }}>
        {img && (
          <img src={img.src} alt="" draggable={false} style={{
            width: shown.w, height: shown.h,
            transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
          }} />
        )}
        <div className="cropper-window" style={{ width: side, height: side }} />
      </div>
      <input className="cropper-zoom" type="range" min={1} max={4} step={0.01} value={zoom}
        aria-label="Zoom" onChange={(e) => setZoomClamped(Number(e.target.value))} />
    </div>
  );
}
