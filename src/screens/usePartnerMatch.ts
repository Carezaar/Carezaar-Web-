import { useCallback, useRef, useState } from 'react';
import { DuplicateActionError, guarded, useGuarded } from '../app/actionGuard';
import { retireSubmissions } from '../api/idempotency';
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
 *     profile is read to find out whether it went through. A match request carries an
 *     Idempotency-Key, so sending it again after a lost answer can't create a second one.
 *
 *  Every action on this person's match shares one guard (`match:<partner id>`, see
 *  actionGuard), so accepting and rejecting, or a double tap, or the same action from a
 *  remounted screen, can never run at the same time. */
export function usePartnerMatch(partnerId: string, viewer: {role: UserRole} | null,
  detail: CaregiverFull | ClientFull | null, setDetail: (d: CaregiverFull | ClientFull) => void) {
  const navigate = useNavigate();
  const {t} = useI18n();
  const {toast,messageOf} = useFeedback();
  const resource = `match:${partnerId}`;
  const busy = useGuarded(resource);
  // Which action is running, for the progress indicator on its own button.
  const [working,setWorking] = useState<MatchMutation | null>(null);
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
      const state = profileMatchState(fresh);
      // The profile shows a request (or a match): an earlier request whose answer was lost
      // went through, so its key is done with.
      if (state && state.status !== 'none') retireSubmissions('match_request', partnerId);
      return state;
    } catch {
      setCheckFailed(true);
      return null;
    }
  }, [fetchProfile, setDetail, partnerId]);

  /** Check, then act. `id` is the match the user confirmed on screen. */
  const run = useCallback(async (which: MatchMutation, introduction: string | undefined, id: number | null) => {
    pending.current = {which, introduction, id};
    const fresh = await check();
    if (!fresh) return; // "Couldn't check this match"; Try Again resumes from here
    pending.current = null;
    if (fresh.status !== NEEDS[which] || (which !== 'request' && fresh.id !== id)) {
      toast(t('match_changed_message', 'This match has changed'));
      return;
    }
    const matchId = fresh.id!;
    try {
      const result: Partial<Match> | null = await (async () => {
        if (which === 'request') return userService.requestMatch(partnerId, introduction);
        if (which === 'accept') return userService.acceptMatch(matchId);
        if (which === 'reject') await userService.rejectMatch(matchId);
        else if (which === 'withdraw') await userService.withdrawMatch(matchId);
        else await userService.breakMatch(matchId);
        return null;
      })();
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
  }, [t, check, toast, partnerId, openMatched, fetchProfile, setDetail, messageOf]);

  /** Runs under the match's guard; a second attempt while one is unresolved does nothing. */
  const exclusive = useCallback(async (which: MatchMutation | null, work: () => Promise<unknown>) => {
    setWorking(which);
    try { await guarded(resource, work); }
    catch (e) { if (!(e instanceof DuplicateActionError)) throw e; }
    finally { setWorking(null); }
  }, [resource]);

  const perform = useCallback(async (which: MatchMutation, introduction?: string) => {
    if (busy || !viewer || !state || state.status !== NEEDS[which]) return;
    const id = state.id;
    await exclusive(which, () => run(which, introduction, id));
  }, [busy, viewer, state, run, exclusive]);

  /** "Couldn't check this match" → Try Again: check again, then continue the action. */
  const retryCheck = useCallback(async () => {
    const next = pending.current;
    await exclusive(next?.which ?? null, () => next ? run(next.which, next.introduction, next.id) : check());
  }, [run, check, exclusive]);

  /** Closing the window drops the waiting action. */
  const dismissCheck = useCallback(() => { pending.current = null; setCheckFailed(false); }, []);

  return {action, status: state?.status, loaded: state !== null, busy, working, perform, checkFailed, dismissCheck, retryCheck};
}
