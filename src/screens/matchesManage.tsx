import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { userService } from "../api/services";
import type { Match, MatchListType } from "../api/types";
import { awaitsPartner, matchStage, reviewBy } from "../api/match";
import { useSession } from "../auth/SessionContext";
import { useFeedback } from "../app/feedback";
import { useI18n } from "../app/i18n";
import { usePaged } from "../app/usePaged";
import { BackHeader, Page } from "../ui/layout";
import { Avatar, Button, cardLink, Dialog, EmptyState, ErrorState, InfiniteSentinel, Spinner, TextArea } from "../ui/kit";
import { Icon } from "../ui/Icon";
import { requestPreview } from "../ui/requestPreview";

/** Profile → Matches: the user's own match records in three tabs. */
export function ManageMatchesScreen() {
  const navigate = useNavigate();
  const { role } = useSession();
  const { t } = useI18n();
  const { run, messageOf } = useFeedback();
  const [tab, setTab] = useState<MatchListType>("matches");
  const [reviewing, setReviewing] = useState<Match | null>(null);

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
              const myReview = role ? reviewBy(m, role) : null;
              const preview = requestPreview(m.introduction ?? "");
              return (
                <li key={m.id}>
                  <article className="match-row" {...cardLink(() => { if (partner) navigate(role === "client" ? `/caregivers/${partner.id}` : `/clients/${partner.id}`); }, `${partner?.user.first_name ?? ""} ${partner?.user.last_name ?? ""}`)}>
                    <Avatar src={partner?.user.photo} size={72} />
                    <div className="match-row-text">
                      <h3>{partner?.user.first_name} {partner?.user.last_name}</h3>
                      <p className="muted">{t("match_start", "Start")}: {m.created_at}</p>
                      {m.finished_at && <p className="muted">{t("match_end", "End")}: {m.finished_at}</p>}
                      {stage === "pending" && role && awaitsPartner(m, role) && <p className="pending-note">{t("match_pending_review", "Pending Review")}</p>}
                    </div>
                    <div className="match-row-side">
                      {tab !== "requests" && stage !== "pending" && (
                        <Icon name={stage === "history" ? "ic_match_off" : "ic_match_on"} size={34}
                          tint={stage === "history" ? "var(--error)" : "var(--success)"} />
                      )}
                      {stage === "history" && !myReview && (
                        <button type="button" className="mini-primary" onClick={(e) => { e.stopPropagation(); setReviewing(m); }}>{t("match_review_button", "Review")}</button>
                      )}
                    </div>
                    {stage === "pending" && preview && (
                      <button type="button" className="match-intro" dir="auto"
                        aria-label={`${t("match_introduction_title", "Introduction")}: ${preview}`}
                        onClick={(e) => { e.stopPropagation(); if (partner) navigate(role === "client" ? `/caregivers/${partner.id}` : `/clients/${partner.id}`); }}>
                        <span aria-hidden="true">💬 </span>{preview}
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

      <ReviewDialog match={reviewing} onClose={() => setReviewing(null)} onDone={() => { setReviewing(null); void list.reload(); }} />
    </Page>
  );
}

function ReviewDialog({ match, onClose, onDone }: { match: Match | null; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const { act, toast, messageOf } = useFeedback();
  const [score, setScore] = useState(5);
  const [comment, setComment] = useState("");
  if (!match) return null;
  return (
    <Dialog open onClose={onClose} labelledBy="review-title" title={t("match_review_title", "Submit your review")}>
      <p className="muted small">{t("match_review_message", "")}</p>
      <p><b>{t("match_review_score", "Score")}</b></p>
      <div className="stars" role="radiogroup" aria-label={t("match_review_score", "Score")}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={score === n} onClick={() => setScore(n)}
            className={n <= score ? "on" : ""} aria-label={`${n}`}>★</button>
        ))}
      </div>
      {/* The live server fails (400 "Undefined array key comment") on a review without
          a comment, so one is required here. */}
      <TextArea label={t("match_review_comment", "Comment")} required value={comment} onChange={(e) => setComment(e.target.value)} />
      <Button disabled={!comment.trim()} onClick={async () => {
        try {
          await act(t("loading_review_submit", "Submitting your review"), () => userService.submitReview(match.id, score, comment.trim()));
          onDone();
        } catch (e) { toast(messageOf(e)); }
      }}>{t("match_submit_button", "Submit")}</Button>
    </Dialog>
  );
}
