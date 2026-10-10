import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { userService } from "../api/services";
import type { Match, MatchListType } from "../api/types";
import { awaitsPartner, matchStage } from "../api/match";
import { useSession } from "../auth/SessionContext";
import { useFeedback } from "../app/feedback";
import { useI18n } from "../app/i18n";
import { usePaged } from "../app/usePaged";
import { BackHeader, Page } from "../ui/layout";
import { Avatar, Button, cardLink, Dialog, EmptyState, ErrorState, InfiniteSentinel, Spinner } from "../ui/kit";
import { Icon } from "../ui/Icon";
import { requestPreview } from "../ui/requestPreview";

/** Profile → Matches: the user's own match records in three tabs. Finished matches show
 *  no reviews (stars, comments or a Review button), at the client's request. */
export function ManageMatchesScreen() {
  const navigate = useNavigate();
  const { role } = useSession();
  const { t } = useI18n();
  const { run, messageOf } = useFeedback();
  const [tab, setTab] = useState<MatchListType>("matches");
  const [introFor, setIntroFor] = useState<Match | null>(null);

  const loadingLabel = { matches: "loading_matches", requests: "loading_requests", histories: "loading_histories" }[tab];
  const list = usePaged(async (page) => {
    const work = userService.matches(tab, page);
    return page === 1 ? run(`${t(loadingLabel, "Loading")} ${page}`, () => work) : work;
  }, [tab]);

  return (
    <Page header={<BackHeader title={t("profile_matches_title", "Matches")} />}>
      <div className="segmented" role="tablist">
        {(["matches", "requests", "histories"] as MatchListType[]).map((x) => (
          <button key={x} type="button" role="tab" aria-selected={tab === x} className={tab === x ? "on" : ""}
            onClick={() => setTab(x)}>{t(x === "histories" ? "match_tab_history" : `match_tab_${x}`, x)}</button>
        ))}
      </div>
      {list.error && list.items.length === 0 ? <ErrorState message={messageOf(list.error)} error={list.error} onRetry={() => void list.reload()} />
        : !list.loading && list.items.length === 0 ? <EmptyState title={`${t(tab === "histories" ? "match_tab_history" : `match_tab_${tab}`, tab)} (0)`} />
        : (
          <ul className="card-list">
            {list.items.map((m) => {
              const partner = role === "client" ? m.caregiver : m.client;
              const stage = matchStage(m);
              const preview = requestPreview(m.introduction ?? "");
              return (
                <li key={m.id}>
                  <article className="match-row" {...cardLink(() => { if (partner) navigate(role === "client" ? `/caregivers/${partner.id}` : `/clients/${partner.id}`); }, `${partner?.user.first_name ?? ""} ${partner?.user.last_name ?? ""}`)}>
                    <Avatar src={partner?.user.photo} size={72} />
                    <div className="match-row-text">
                      <h3>{partner?.user.first_name} {partner?.user.last_name}</h3>
                      <p className="muted">{t("match_start", "Start")}: {m.created_at}</p>
                      {m.finished_at && <p className="muted">{t("match_end", "End")}: {m.finished_at}</p>}
                      {stage === "pending" && role && awaitsPartner(m, role) && <p className="pending-note">{t("match_pending_acceptance", "Pending Acceptance")}</p>}
                    </div>
                    <div className="match-row-side">
                      {tab !== "requests" && stage !== "pending" && (
                        <Icon name={stage === "history" ? "ic_match_off" : "ic_match_on"} size={34}
                          tint={stage === "history" ? "var(--error)" : "var(--success)"} />
                      )}
                    </div>
                    {stage === "pending" && preview && (
                      <button type="button" className="match-intro" dir="auto"
                        aria-label={`${t("match_introduction_title", "Introduction")}: ${preview}`}
                        onClick={(e) => { e.stopPropagation(); setIntroFor(m); }}
                        onKeyDown={(e) => e.stopPropagation()}>
                        <span aria-hidden="true">💬 </span><span className="match-intro-text">{preview}</span>
                      </button>
                    )}
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      {list.loading && list.items.length > 0 && <Spinner />}
      <InfiniteSentinel active={list.hasMore && !list.loading} onVisible={list.loadMore} />

      <IntroductionDialog match={introFor} onClose={() => setIntroFor(null)} />
    </Page>
  );
}

/** The whole introduction of a request, with who wrote it; the user stays on the list. */
function IntroductionDialog({ match, onClose }: { match: Match | null; onClose: () => void }) {
  const { role } = useSession();
  const { t } = useI18n();
  if (!match) return null;
  const partner = role === "client" ? match.caregiver : match.client;
  const name = `${partner?.user.first_name ?? ""} ${partner?.user.last_name ?? ""}`.trim();
  return (
    <Dialog open onClose={onClose} labelledBy="intro-title" title={t("match_introduction_title", "Introduction")}>
      <div className="request-context-who"><Avatar src={partner?.user.photo} size={56} name={name} /><b dir="auto">{name}</b></div>
      <p className="request-intro-full" dir="auto">{match.introduction}</p>
      <div className="dialog-actions">
        <Button onClick={onClose}>{t("general_ok", "OK")}</Button>
      </div>
    </Dialog>
  );
}
