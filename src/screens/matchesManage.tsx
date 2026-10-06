import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { userService } from "../api/services";
import type { Match, MatchListType } from "../api/types";
import { awaitsPartner, awaitsResponse, matchStage, reviewBy } from "../api/match";
import { useSession } from "../auth/SessionContext";
import { useFeedback } from "../app/feedback";
import { useI18n } from "../app/i18n";
import { usePaged } from "../app/usePaged";
import { BackHeader, Page } from "../ui/layout";
import { Avatar, Button, cardLink, Dialog, EmptyState, ErrorState, InfiniteSentinel, Spinner, TextArea } from "../ui/kit";
import { Icon } from "../ui/Icon";

/** Profile → Matches: the user's own match records in three tabs. */
export function ManageMatchesScreen() {
  const navigate = useNavigate();
  const { role } = useSession();
  const { t } = useI18n();
  const { run, act, toast, messageOf } = useFeedback();
  const [tab, setTab] = useState<MatchListType>("matches");
  const [confirm, setConfirm] = useState<{ match: Match; action: "accept" | "reject" | "withdraw" | "unmatch" } | null>(null);
  const [reviewing, setReviewing] = useState<Match | null>(null);

  const loadingLabel = { matches: "loading_matches", requests: "loading_requests", histories: "loading_histories" }[tab];
  const list = usePaged(async (page) => {
    const work = userService.matches(tab, page);
    return page === 1 ? run(`${t(loadingLabel, "Loading")} ${page}`, () => work) : work;
  }, [tab]);

  const perform = async () => {
    if (!confirm) return;
    const { match, action } = confirm;
    setConfirm(null);
    const labels = { accept: "loading_match_accept", reject: "loading_match_reject", withdraw: "loading_match_withdraw", unmatch: "loading_unmatch_submit" };
    try {
      await act(t(labels[action], "Please wait"), async () => {
        if (action === "accept") await userService.acceptMatch(match.id);
        else if (action === "reject") await userService.rejectMatch(match.id);
        else if (action === "withdraw") await userService.withdrawMatch(match.id);
        else await userService.breakMatch(match.id);
      });
      void list.reload();
    } catch (e) { toast(messageOf(e)); }
  };

  const titles = {
    accept: ["match_accept_title", "match_accept_message"], reject: ["match_reject_title", "match_reject_message"],
    withdraw: ["match_withdraw_title", "match_withdraw_message"], unmatch: ["match_unmatch_title", "match_unmatch_message"],
  } as const;

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
                    <div className="match-row-side" onClick={(e) => e.stopPropagation()}>
                      <Icon name={stage === "history" ? "ic_match_off" : "ic_match_on"} size={34}
                        tint={stage === "history" ? "var(--error)" : "var(--success)"} />
                      {stage === "active" && <button type="button" className="mini-danger" onClick={() => setConfirm({ match: m, action: "unmatch" })}>{t("general_unmatch", "Unmatch")}</button>}
                      {stage === "pending" && role && awaitsResponse(m, role) && (
                        <span className="mini-actions">
                          <button type="button" className="mini-primary" onClick={() => setConfirm({ match: m, action: "accept" })}>{t("match_accept_title", "Accept")}</button>
                          <button type="button" className="mini-danger" onClick={() => setConfirm({ match: m, action: "reject" })}>{t("match_reject_title", "Reject")}</button>
                        </span>
                      )}
                      {stage === "pending" && role && awaitsPartner(m, role) && (
                        <button type="button" className="mini-danger" onClick={() => setConfirm({ match: m, action: "withdraw" })}>{t("match_withdraw_title", "Cancel")}</button>
                      )}
                      {stage === "history" && !myReview && (
                        <button type="button" className="mini-primary" onClick={() => setReviewing(m)}>{t("match_review_button", "Review")}</button>
                      )}
                    </div>
                    {stage === "pending" && m.introduction && (
                      <p className="match-intro" dir="auto"><b>{t("match_introduction_title", "Introduction")}:</b> {m.introduction}</p>
                    )}
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      {list.loading && list.items.length > 0 && <Spinner />}
      <InfiniteSentinel active={list.hasMore && !list.loading} onVisible={list.loadMore} />

      <Dialog open={confirm !== null} onClose={() => setConfirm(null)} labelledBy="mm-title"
        title={confirm ? t(titles[confirm.action][0], "") : ""}>
        <p>{confirm ? t(titles[confirm.action][1], "") : ""}</p>
        <div className="dialog-actions">
          <Button variant="outline" onClick={() => setConfirm(null)}>{t("general_cancel", "Cancel")}</Button>
          <Button variant={confirm?.action === "accept" ? "primary" : "danger"} onClick={() => void perform()}>{t("general_confirm", "Confirm")}</Button>
        </div>
      </Dialog>
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
