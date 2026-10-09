export type ProfileMatchStatus = 'none' | 'sent' | 'received' | 'active';
/** Unknown or inconsistent metadata disables mutations until the profile can be refreshed. */
export function profileMatchState(profile: {match_status?: unknown; match_id?: unknown} | null): {status: ProfileMatchStatus; id: number | null} | null {
  if (!profile || typeof profile.match_status !== 'string' || !['none','sent','received','active'].includes(String(profile.match_status))) return null;
  const status = profile.match_status as ProfileMatchStatus;
  const id = profile.match_id;
  if (status === 'none') return id === null ? {status, id:null} : null;
  return typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? {status, id} : null;
}
