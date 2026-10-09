import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { caregiverService, clientService, userService } from '../api/services';
import type { CaregiverFull, ClientFull, UserRole } from '../api/types';
import { profileMatchState } from '../api/profileMatch';
import { useFeedback } from '../app/feedback';
import { useI18n } from '../app/i18n';

export type PartnerAction = 'request' | 'withdraw' | 'received' | 'unmatch';
export type MatchMutation = 'request' | 'withdraw' | 'accept' | 'reject' | 'unmatch';
export function usePartnerMatch(partnerId: string, viewer: {role: UserRole} | null,
  detail: CaregiverFull | ClientFull | null, reloadDetail: () => Promise<void>) {
  const navigate = useNavigate();
  const {t} = useI18n();
  const {act,toast,messageOf} = useFeedback();
  const lock = useRef(false);
  const [busy,setBusy] = useState(false);
  const state = profileMatchState(detail);
  const action: PartnerAction | null = state ? ({none:'request', sent:'withdraw', received:'received', active:'unmatch'} as const)[state.status] : null;
  const perform = useCallback(async (which: MatchMutation, introduction?: string) => {
    if (lock.current || !viewer) return;
    lock.current = true; setBusy(true);
    const fetchProfile = () => viewer.role === 'client' ? clientService.caregiver(partnerId) : caregiverService.client(partnerId);
    const labels = {request:'loading_match_submit',accept:'loading_match_accept',reject:'loading_match_reject',withdraw:'loading_match_withdraw',unmatch:'loading_unmatch_submit'};
    try {
      await act(t(labels[which], 'Please wait'), async () => {
        const fresh = profileMatchState(await fetchProfile());
        const expected = {request:'none',withdraw:'sent',accept:'received',reject:'received',unmatch:'active'}[which];
        if (!fresh || fresh.status !== expected || (which !== 'request' && fresh.id !== state?.id)) {
          throw new Error('Match state changed');
        }
        if (which === 'request') await userService.requestMatch(partnerId, introduction);
        else if (which === 'accept') await userService.acceptMatch(fresh.id!);
        else if (which === 'reject') await userService.rejectMatch(fresh.id!);
        else if (which === 'withdraw') await userService.withdrawMatch(fresh.id!);
        else await userService.breakMatch(fresh.id!);
        const updated = profileMatchState(await fetchProfile());
        await reloadDetail();
        if (which === 'accept') {
          if (updated?.status !== 'active') throw new Error('Match not active');
          navigate(`/matched/${viewer.role === 'client' ? 'caregivers' : 'clients'}/${partnerId}`);
        }
      });
    } catch (e) {
      await reloadDetail();
      toast(e instanceof Error && ['Match state changed','Match not active'].includes(e.message)
        ? t('match_state_changed', 'This match has changed. Please review the updated profile and try again.') : messageOf(e));
    } finally { lock.current = false; setBusy(false); }
  }, [viewer, act, t, state?.id, partnerId, reloadDetail, navigate, toast, messageOf]);
  return {action, status: state?.status, loaded: state !== null, busy, perform};
}
