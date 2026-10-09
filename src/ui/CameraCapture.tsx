import { useEffect, useRef, useState } from "react";
import { useI18n } from "../app/i18n";
import { Button, Dialog } from "./kit";
import "./cameraCapture.css";

/** Mounted only by the Camera click. Closing also releases a permission request
 * that resolves late, so navigating away never leaves a webcam running. */
export function CameraCapture({ onDone, onCancel }: {
  onDone: (file: File) => void; onCancel: () => void;
}) {
  const { t } = useI18n();
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const alive = useRef(true);
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captured, setCaptured] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const stop = () => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  };

  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
      setError(t("profile_camera_unsupported", "Camera capture isn't supported here. Use Gallery to choose a photo."));
      return () => { alive.current = false; };
    }
    // Defer by one microtask so React StrictMode's setup/cleanup probe doesn't
    // open two cameras for one click. A cancelled mount never requests access.
    void Promise.resolve().then(() => cancelled ? null : navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false }))
      .then(async (media) => {
        if (!media) return;
        if (cancelled) { media.getTracks().forEach((track) => track.stop()); return; }
        stream.current = media;
        media.getVideoTracks().forEach((track) => track.addEventListener("ended", () => {
          if (cancelled) return;
          setReady(false);
          setError(t("profile_camera_disconnected", "Camera access ended. Reconnect your camera or use Gallery."));
          stop();
        }));
        if (video.current) {
          video.current.srcObject = media;
          try { await video.current.play(); }
          catch {
            if (!cancelled) {
              stop();
              setError(t("profile_camera_start_failed", "The camera couldn't start. Try again or use Gallery."));
            }
          }
        }
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        const name = cause instanceof Error ? cause.name : "";
        setError(name === "NotAllowedError" || name === "SecurityError"
          ? t("profile_camera_denied", "Camera access was blocked. Allow camera access in your browser settings and try again, or use Gallery.")
          : name === "NotFoundError" || name === "OverconstrainedError"
            ? t("profile_camera_missing", "No usable camera was found. Connect a camera or use Gallery.")
            : t("profile_camera_unavailable", "The camera isn't available. Close other apps using it and try again, or use Gallery."));
      });
    return () => { cancelled = true; alive.current = false; stop(); };
    // Each explicit retry opens a new request; translations do not reopen a camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  useEffect(() => {
    if (!captured) { setPreview(null); return; }
    const url = URL.createObjectURL(captured);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [captured]);

  const capture = () => {
    if (!video.current || !ready || busy) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.current.videoWidth;
    canvas.height = video.current.videoHeight;
    const context = canvas.getContext("2d");
    if (!context || !canvas.width || !canvas.height) return;
    context.drawImage(video.current, 0, 0);
    setBusy(true);
    canvas.toBlob((blob) => {
      if (!alive.current) return;
      setBusy(false);
      if (blob) {
        setCaptured(new File([blob], "camera.jpg", { type: "image/jpeg" }));
        // Captured still is private until confirmed; stop immediately.
        stop();
        setReady(false);
      } else setError(t("profile_camera_capture_failed", "The photo couldn't be captured. Please try again."));
    }, "image/jpeg", 0.9);
  };

  return <Dialog open onClose={onCancel} title={t("general_camera", "Camera")} labelledBy="camera-title">
    <div className="camera-capture stack">
      {error ? <p role="alert">{error}</p> : <>
        <div className="camera-capture-stage">
          {preview ? <img src={preview} alt={t("profile_camera_preview", "Captured photo preview")} /> :
            <video ref={video} autoPlay muted playsInline aria-label={t("profile_camera_live", "Live camera preview")}
              onLoadedData={() => setReady(true)} />}
        </div>
        {!captured && !ready && <p className="muted" role="status">{t("profile_camera_starting", "Waiting for camera access…")}</p>}
        {captured && <p className="muted">{t("profile_camera_crop_next", "Use this photo to continue to the crop preview.")}</p>}
      </>}
      <div className="camera-capture-actions">
        <Button variant="outline" onClick={onCancel}>{t("general_cancel", "Cancel")}</Button>
        {captured ? <>
          <Button variant="outline" onClick={() => { setCaptured(null); setError(null); setAttempt((n) => n + 1); }}>{t("profile_camera_retake", "Retake")}</Button>
          <Button onClick={() => { stop(); onDone(captured); }}>{t("profile_camera_use", "Use Photo")}</Button>
        </> : error ? <Button onClick={() => { setError(null); setReady(false); setAttempt((n) => n + 1); }}>{t("general_try_again", "Try again")}</Button> :
          <Button disabled={!ready || busy} onClick={capture}>{t("profile_camera_capture", "Capture Photo")}</Button>}
      </div>
    </div>
  </Dialog>;
}
