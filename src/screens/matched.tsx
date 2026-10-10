import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { caregiverService, clientService, userService } from '../api/services';
import type { CaregiverFull, ClientFull, UserRole } from '../api/types';
import { profileMatchState } from '../api/profileMatch';
import { useSession } from '../auth/SessionContext';
import { useFeedback } from '../app/feedback';
import { useI18n } from '../app/i18n';
import { useGoBack } from '../navigation/back';
import { BackHeader, Page } from '../ui/layout';
import { Button, PhotoBox, Spinner } from '../ui/kit';
import { Icon } from '../ui/Icon';

/** Where the screen was opened from, passed as navigation state. */
export type MatchedOrigin = 'profile' | 'notification';

/** "It's a Match!". Whether to show it is decided from the other person's profile alone
 *  (`match_status`), as on Android, with no separate check of the match record. A match
 *  that is no longer active opens that person's profile instead. */
export function MatchedScreen() {
  const {kind='',partnerId=''} = useParams();
  const location = useLocation();
  const origin = (location.state as {from?: MatchedOrigin} | null)?.from;
  const {user,role} = useSession();
  const {t} = useI18n();
  const {run,act,toast,messageOf} = useFeedback();
  const navigate = useNavigate();
  const goBack = useGoBack('/main/matches');
  const [detail,setDetail] = useState<CaregiverFull | ClientFull | null>(null);
  const [failed,setFailed] = useState(false);
  const profilePath = `/${kind}/${partnerId}`;
  const ownKind = role === 'client' ? 'caregivers' : 'clients';
  const goBackRef = useRef(goBack);
  goBackRef.current = goBack;

  const load = useCallback(() => {
    let current = true;
    if (!partnerId || kind !== ownKind) { navigate('/main/matches', {replace: true}); return () => { current = false; }; }
    run<CaregiverFull | ClientFull>(t('loading_profile_get','Getting profile'), () => (role === 'client' ? clientService.caregiver(partnerId) : caregiverService.client(partnerId)))
      .then((p) => {
        if (!current) return;
        if (profileMatchState(p)?.status !== 'active') {
          // Not (or no longer) a match: show the person's profile, replacing this screen
          // so Back does not return here.
          if (origin === 'profile') goBackRef.current(); else navigate(profilePath, {replace: true});
          return;
        }
        setDetail(p);
      })
      .catch((e) => { if (current) { toast(messageOf(e)); setFailed(true); } });
    return () => { current = false; };
  }, [kind, ownKind, partnerId, role, run, t, navigate, profilePath, origin, toast, messageOf]);
  useEffect(() => load(), [load]);
  // Unavailable: a short message, then back after two seconds (no Try Again page, no loop).
  useEffect(() => {
    if (!failed) return;
    const timer = window.setTimeout(() => goBackRef.current(), 2000);
    return () => window.clearTimeout(timer);
  }, [failed]);

  const header = <BackHeader title={t('match_matched_title',"It's a Match!")} />;
  if (failed) return <Page header={header}><p className="state muted" role="status">{t('error_profile_unavailable', "This profile isn't available.")}</p></Page>;
  if (!detail || !user) return <Page header={header}><Spinner /></Page>;
  const partner = detail.user;
  const fullName = (u: {first_name: string | null; last_name: string | null}) => `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim();
  const roleLabel = (r: UserRole) => (r === 'client' ? t('general_usertype_client','Client') : t('general_usertype_caregiver','Caregiver'));
  const chat = async () => {
    try {
      const conversation = await act(t('loading_chat_create','Creating a new chat'), () => userService.createChat(partnerId));
      navigate(`/chat/${conversation.id}`);
    } catch(e) { toast(messageOf(e)); }
  };
  // Opened from the profile: return to it rather than stacking a second copy.
  const viewProfile = () => (origin === 'profile' ? goBack() : navigate(profilePath, {replace: true}));
  const info = [
    ['ic_message',t('match_matched_chat_title','Start a Conversation'),t('match_matched_chat_message','Send a message and get to know each other.')],
    ['ic_calendar',t('match_matched_plan_title','Plan Next Steps'),t('match_matched_plan_message','Discuss care needs and availability.')],
    ['ic_match_on',t('match_matched_fit_title','A Better Care Experience'),t('match_matched_fit_message','Find the right care together.')],
  ];
  const card = (photo: string | null | undefined, name: string, sub: string) => (
    <figure className="matched-card">
      <PhotoBox className="matched-photo" src={photo} alt="" />
      <figcaption><b dir="auto">{name}</b><span className="muted">{sub}</span></figcaption>
    </figure>
  );
  return <Page header={header} footer={<div className="pending-actions"><Button onClick={() => void chat()} icon="ic_message">{t('match_matched_chat_button','Send a Message')}</Button><Button variant="outline" onClick={viewProfile}>{t('match_matched_profile_button','View Profile')}</Button></div>}>
    <div className="pending matched" data-testid="matched-screen">
      <div className="matched-pair">
        {card(user.photo, t('chat_screen_you','You'), roleLabel(user.role))}
        <span className="matched-heart" aria-hidden="true"><Icon name="ic_favorite_on" size={26} tint="#fff"/></span>
        {card(partner.photo, fullName(partner), roleLabel(partner.role))}
      </div>
      <h2 dir="auto">{t('match_matched_prompt','You and {PARTNER} have matched!').replace(/\{PARTNER\}/g, fullName(partner))}</h2>
      <p className="muted">{t('match_matched_message','You can now start messaging each other, discuss care needs, and next steps.')}</p>
      <ul className="pending-info">{info.map(([icon,title,message])=><li key={icon}><span className="pending-icon"><Icon name={icon} size={22} tint="var(--primary)"/></span><span><b>{title}</b><span className="muted">{message}</span></span></li>)}</ul>
    </div>
  </Page>;
}
