import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

/** Back within the app. A screen opened directly (a shared link, a bookmark, a new tab)
 *  has no in-app history, and `history.back()` would leave the site; it goes to
 *  `fallback` instead. React Router records the in-app position as `history.state.idx`. */
export function useGoBack(fallback = "/") {
  const navigate = useNavigate();
  return useCallback(() => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(fallback, { replace: true });
  }, [navigate, fallback]);
}
