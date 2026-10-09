import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { caregiverService, clientService, userService } from '../api/services';
import type { CaregiverFull, ClientFull } from '../api/types';
import { profileMatchState } from '../api/profileMatch';
import { matchStage } from '../api/match';
import { useSession } from '../auth/SessionContext';
import { useFeedback } from '../app/feedback';
import { useI18n } from '../app/i18n';
import { BackHeader, Page } from '../ui/layout';
import { Avatar, Button, ErrorState, Spinner } from '../ui/kit';
import { Icon } from '../ui/Icon';

/** Success is verified against the current connection, including stale notifications. */
export function MatchedScreen() {
  const {kind='',partnerId=''} = useParams();
  const {user,role} = useSession();
  const {t} = useI18n();
  const {run,act,toast,messageOf} = useFeedback();
  const navigate = useNavigate();
  const [detail,setDetail] = useState<CaregiverFull | ClientFull | null>(null);
  const [error,setError] = useState<unknown>(null);
  const [stale,setStale] = useState(false);
  const generation = useRef({value:0});
  const profilePath = `/${kind}/${partnerId}`;
  const load = useCallback(() => {
    const request = ++generation.current.value;
    const current = () => request === generation.current.value;
    setError(null);setStale(false);setDetail(null);
    return run(t('loading_match_get','Getting match details'),async () => {
      if (!partnerId || kind !== (role === 'client' ? 'caregivers' : 'clients')) {if(current()) setStale(true);return;}
      const p = role === 'client' ? await clientService.caregiver(partnerId) : await caregiverService.client(partnerId);
      const state = profileMatchState(p);
      if (state?.status !== 'active') {if(current()) setStale(true);return;}
      const connection = await userService.match(state.id!);
      const partner = role === 'client' ? connection.caregiver : connection.client;
      if (matchStage(connection) !== 'active' || partner?.id !== partnerId) {if(current()) setStale(true);return;}
      if(current()) setDetail(p);
    }).catch(e => {if(current()) setError(e);});
  }, [kind,partnerId,role,run,t]);
  useEffect(() => {const sequence = generation.current; void load();return () => {sequence.value++;};},[load]);
  const header = <BackHeader title={t('match_matched_title',"It's a Match!")} />;
  if (error) return <Page header={header}><ErrorState message={messageOf(error)} error={error} onRetry={() => void load()} /></Page>;
  if (stale) return <Page header={header}><div className="pending"><p>{t('match_no_longer_active','This match is no longer active.')}</p><Button onClick={() => navigate('/profile/matches',{replace:true})}>{t('profile_matches_title','Matches')}</Button></div></Page>;
  if (!detail) return <Page header={header}><Spinner /></Page>;
  const partner = detail.user;
  const fill = (text:string) => text.replace(/\{PARTNER\}/g,partner.first_name ?? '');
  const chat = async () => {
    try {
      await act(t('loading_chat_create','Creating a new chat'),async () => {
        const p = role === 'client' ? await clientService.caregiver(partnerId) : await caregiverService.client(partnerId);
        if (profileMatchState(p)?.status !== 'active') {await load();return;}
        const conversation = await userService.createChat(partnerId);
        navigate(`/chat/${conversation.id}`);
      });
    } catch(e) {toast(messageOf(e));}
  };
  const info = [
    ['ic_message',t('match_matched_chat_title','Start a Conversation'),t('match_matched_chat_message','Send a message and get to know each other.')],
    ['ic_calendar',t('match_matched_plan_title','Plan Next Steps'),t('match_matched_plan_message','Discuss care needs and availability.')],
    ['ic_match_on',t('match_matched_fit_title','A Better Care Experience'),t('match_matched_fit_message','Find the right care together.')],
  ];
  return <Page header={header} footer={<div className="pending-actions"><Button onClick={() => void chat()} icon="ic_message">{t('match_matched_chat_button','Send a Message')}</Button><Button variant="outline" onClick={() => navigate(profilePath)}>{t('match_matched_profile_button','View Profile')}</Button></div>}>
    <div className="pending matched" data-testid="matched-screen">
      <div className="pending-pair"><Avatar src={user?.photo} size={96} name={user?.first_name ?? undefined}/><span className="pending-heart" aria-hidden="true"><Icon name="ic_match_on" size={24} tint="var(--primary)"/></span><Avatar src={partner.photo} size={96} name={partner.first_name ?? undefined}/></div>
      <h2>{fill(t('match_matched_prompt','You and {PARTNER} have matched!'))}</h2>
      <p className="muted">{t('match_matched_message','You can now start messaging each other, discuss care needs, and next steps.')}</p>
      <ul className="pending-info">{info.map(([icon,title,message])=><li key={icon}><span className="pending-icon"><Icon name={icon} size={22} tint="var(--primary)"/></span><span><b>{title}</b><span className="muted">{message}</span></span></li>)}</ul>
    </div>
  </Page>;
}
