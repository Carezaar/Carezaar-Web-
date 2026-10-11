import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../api/errors';
import { caregiverService, clientService, userService } from '../api/services';
import type { CaregiverFull, ClientFull, Match, UserRole } from '../api/types';
import { profileMatchState, type ProfileMatchStatus } from '../api/profileMatch';
import { useFeedback } from '../app/feedback';
import { useI18n } from '../app/i18n';

export type PartnerAction = 'request' | 'withdraw' | 'received' | 'unmatch';
export type MatchMutation = 'request' | 'withdraw' | 'accept' | 'reject' | 'unmatch';

/** The profile state each action needs, and the states it can lead to. */
const NEEDS: Record<MatchMutation, ProfileMatchStatus> = { request: 'none', withdraw: 'sent', accept: 'received', reject: 'received', unmatch: 'active' };
const LEADS_TO: Record<MatchMutation, ProfileMatchStatus[]> = {
  request: ['sent', 'active'], withdraw: ['none'], accept: ['active'], reject: ['none'], unmatch: ['none'],
};

const isActive = (m: Partial<Match> | null | undefined) =>
  Boolean(m && m.is_client_accepted === true && m.is_caregiver_accepted === true && !m.finished_at);

/** Match actions on another person's profile (client requirement, October 2026):
 *
 *  1. Check first. Before every action the profile is read again and compared with the
 *     state the action needs (and the same `match_id`). If the other person changed
 *     anything, nothing is sent and "This match has changed" is shown.
 *  2. If that check can't be done, the "Couldn't check this match" window opens. Its
 *     Try Again repeats the check and, if the match is still as expected, carries out
 *     the same action, so the user doesn't start over.
 *  3. The action is sent once, never repeated automatically. If its answer is lost, the
 *     profile is read to find out whether it went through. */
export function usePartnerMatch(partnerId: string, viewer: {role: UserRole} | null,
  detail: CaregiverFull | ClientFull | null, setDetail: (d: CaregiverFull | ClientFull) => void) {
  const navigate = useNavigate();
  const {t} = useI18n();
  const {act,toast,messageOf} = useFeedback();
  const lock = useRef(false);
  const [busy,setBusy] = useState(false);
  const [checkFailed,setCheckFailed] = useState(false);
  // The action waiting for a successful check (Try Again continues it).
  const pending = useRef<{which: MatchMutation; introduction?: string; id: number | null} | null>(null);
  const state = profileMatchState(detail);
  const action: PartnerAction | null = state ? ({none:'request', sent:'withdraw', received:'received', active:'unmatch'} as const)[state.status] : null;
  const matchedPath = `/matched/${viewer?.role === 'client' ? 'caregivers' : 'clients'}/${partnerId}`;

  const fetchProfile = useCallback(() => (viewer?.role === 'client' ? clientService.caregiver(partnerId) : caregiverService.client(partnerId)),
    [viewer?.role, partnerId]);
  const openMatched = useCallback(() => navigate(matchedPath, {state: {from: 'profile'}}), [navigate, matchedPath]);

  /** Reads the profile. Returns its state, or null (with the dialog open) if it couldn't be read. */
  const check = useCallback(async () => {
    try {
      const fresh = await fetchProfile();
      setDetail(fresh);
      setCheckFailed(false);
      return profileMatchState(fresh);
    } catch {
      setCheckFailed(true);
      return null;
    }
  }, [fetchProfile, setDetail]);

  /** Check, then act. `id` is the match the user confirmed on screen. */
  const run = useCallback(async (which: MatchMutation, introduction: string | undefined, id: number | null) => {
    const labels = {request:'loading_match_submit',accept:'loading_match_accept',reject:'loading_match_reject',withdraw:'loading_match_withdraw',unmatch:'loading_unmatch_submit'};
    pending.current = {which, introduction, id};
    const fresh = await act(t('loading_match_get', 'Getting match details'), check);
    if (!fresh) return; // "Couldn't check this match"; Try Again resumes from here
    pending.current = null;
    if (fresh.status !== NEEDS[which] || (which !== 'request' && fresh.id !== id)) {
      toast(t('match_changed_message', 'This match has changed'));
      return;
    }
    const matchId = fresh.id!;
    try {
      const result = await act(t(labels[which], 'Please wait'), async (): Promise<Partial<Match> | null> => {
        if (which === 'request') return userService.requestMatch(partnerId, introduction);
        if (which === 'accept') return userService.acceptMatch(matchId);
        if (which === 'reject') await userService.rejectMatch(matchId);
        else if (which === 'withdraw') await userService.withdrawMatch(matchId);
        else await userService.breakMatch(matchId);
        return null;
      });
      // A request that crosses the other person's own request becomes a match at once:
      // the server answers with both sides accepted. Accepting answers the same way.
      if ((which === 'request' || which === 'accept') && isActive(result)) { openMatched(); return; }
      const after = await check();
      if (which === 'accept' && after?.status === 'active') openMatched();
    } catch (e) {
      // Not sent again. Read the profile to see where things stand.
      const noAnswer = e instanceof ApiError && (e.kind === 'network' || e.kind === 'timeout');
      let after: ReturnType<typeof profileMatchState> = null;
      try { const p = await fetchProfile(); setDetail(p); after = profileMatchState(p); } catch { /* unknown */ }
      if (noAnswer && after && LEADS_TO[which].includes(after.status)) {
        // It went through before the connection dropped.
        if (after.status === 'active' && (which === 'request' || which === 'accept')) openMatched();
        return;
      }
      toast(after && (after.status !== NEEDS[which] || (after.id !== null && after.id !== matchId))
        ? t('match_changed_message', 'This match has changed') : messageOf(e));
    }
  }, [act, t, check, toast, partnerId, openMatched, fetchProfile, setDetail, messageOf]);

  const perform = useCallback(async (which: MatchMutation, introduction?: string) => {
    if (lock.current || !viewer || !state || state.status !== NEEDS[which]) return;
    lock.current = true; setBusy(true);
    try { await run(which, introduction, state.id); } finally { lock.current = false; setBusy(false); }
  }, [viewer, state, run]);

  /** "Couldn't check this match" → Try Again: check again, then continue the action. */
  const retryCheck = useCallback(async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try {
      const next = pending.current;
      if (next) await run(next.which, next.introduction, next.id);
      else await act(t('loading_match_get', 'Getting match details'), check);
    } finally { lock.current = false; setBusy(false); }
  }, [run, act, t, check]);

  /** Closing the window drops the waiting action. */
  const dismissCheck = useCallback(() => { pending.current = null; setCheckFailed(false); }, []);

  return {action, status: state?.status, loaded: state !== null, busy, perform, checkFailed, dismissCheck, retryCheck};
}
