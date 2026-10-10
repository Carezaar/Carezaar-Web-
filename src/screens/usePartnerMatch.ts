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

/** The profile state each action needs, and the state it leads to. */
const NEEDS: Record<MatchMutation, ProfileMatchStatus> = { request: 'none', withdraw: 'sent', accept: 'received', reject: 'received', unmatch: 'active' };
const LEADS_TO: Record<MatchMutation, ProfileMatchStatus[]> = {
  request: ['sent', 'active'], withdraw: ['none'], accept: ['active'], reject: ['none'], unmatch: ['none'],
};

const isActive = (m: Partial<Match> | null | undefined) =>
  Boolean(m && m.is_client_accepted === true && m.is_caregiver_accepted === true && !m.finished_at);

/** Match actions on another person's profile. Each action goes straight to the server
 *  with the profile's `match_id`; the profile is read again afterwards, not before.
 *
 *  - The server refuses the action (the relationship moved on in the meantime): the
 *    profile is reloaded and, if its state differs, "This match has changed" is shown.
 *  - No answer (connection lost, timeout): the action may or may not have happened, so
 *    it is never sent again blindly. The profile is checked instead; if that check
 *    fails too, the "Couldn't check this match" dialog offers Try Again, which repeats
 *    the check, not the action. */
export function usePartnerMatch(partnerId: string, viewer: {role: UserRole} | null,
  detail: CaregiverFull | ClientFull | null, setDetail: (d: CaregiverFull | ClientFull) => void) {
  const navigate = useNavigate();
  const {t} = useI18n();
  const {act,toast,messageOf} = useFeedback();
  const lock = useRef(false);
  const [busy,setBusy] = useState(false);
  const [checkFailed,setCheckFailed] = useState(false);
  const state = profileMatchState(detail);
  const action: PartnerAction | null = state ? ({none:'request', sent:'withdraw', received:'received', active:'unmatch'} as const)[state.status] : null;
  const matchedPath = `/matched/${viewer?.role === 'client' ? 'caregivers' : 'clients'}/${partnerId}`;

  const fetchProfile = useCallback(() => (viewer?.role === 'client' ? clientService.caregiver(partnerId) : caregiverService.client(partnerId)),
    [viewer?.role, partnerId]);
  const openMatched = useCallback(() => navigate(matchedPath, {state: {from: 'profile'}}), [navigate, matchedPath]);

  /** Reads the profile again. Returns its state, or null when it couldn't be read. */
  const recheck = useCallback(async () => {
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

  const perform = useCallback(async (which: MatchMutation, introduction?: string) => {
    if (lock.current || !viewer || !state || state.status !== NEEDS[which]) return;
    lock.current = true; setBusy(true);
    const labels = {request:'loading_match_submit',accept:'loading_match_accept',reject:'loading_match_reject',withdraw:'loading_match_withdraw',unmatch:'loading_unmatch_submit'};
    const id = state.id!;
    try {
      const result = await act(t(labels[which], 'Please wait'), async (): Promise<Partial<Match> | null> => {
        if (which === 'request') return userService.requestMatch(partnerId, introduction);
        if (which === 'accept') return userService.acceptMatch(id);
        if (which === 'reject') await userService.rejectMatch(id);
        else if (which === 'withdraw') await userService.withdrawMatch(id);
        else await userService.breakMatch(id);
        return null;
      });
      // A request that crosses the other person's own request becomes a match at once:
      // the server answers with both sides accepted. Accepting answers the same way.
      if ((which === 'request' || which === 'accept') && isActive(result)) { openMatched(); return; }
      const after = await recheck();
      if (which === 'accept' && after?.status === 'active') openMatched();
    } catch (e) {
      const noAnswer = e instanceof ApiError && (e.kind === 'network' || e.kind === 'timeout');
      const after = await recheck();
      if (!after) return; // the "Couldn't check this match" dialog is showing
      if (noAnswer && LEADS_TO[which].includes(after.status)) {
        // It went through before the connection dropped.
        if (after.status === 'active' && (which === 'request' || which === 'accept')) openMatched();
        return;
      }
      toast(after.status !== NEEDS[which] || (after.id !== null && after.id !== id)
        ? t('match_changed_message', 'This match has changed') : messageOf(e));
    } finally { lock.current = false; setBusy(false); }
  }, [viewer, state, act, t, partnerId, recheck, openMatched, toast, messageOf]);

  const retryCheck = useCallback(async () => {
    lock.current = true; setBusy(true);
    try { await act(t('loading_match_get', 'Getting match details'), recheck); } finally { lock.current = false; setBusy(false); }
  }, [act, t, recheck]);

  return {action, status: state?.status, loaded: state !== null, busy, perform, checkFailed, setCheckFailed, retryCheck};
}
