import { localTime } from "../app/serverTime";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../api/errors";
import { useParams } from "react-router-dom";
import { userService } from "../api/services";
import type { ChatFull, ChatMessage } from "../api/types";
import { useSession } from "../auth/SessionContext";
import { useFeedback } from "../app/feedback";
import { useI18n } from "../app/i18n";
import { BackHeader, Page } from "../ui/layout";
import { Avatar, EmptyState, ErrorState, Spinner } from "../ui/kit";
import { Icon } from "../ui/Icon";
import { useIsDesktop } from "../ui/frames";
import { CHATS_CHANGED, MessagesDesktop } from "./main";

/* --------------------------------------------------------------------- Chat */

const CHAT_POLL_MS = 10_000;

/** The API returns messages newest-first with minute-precision timestamps; the
 *  Android transcript reads oldest-at-top. Ids are monotonic, so order by id. */
function chronological(chat: ChatFull): ChatFull {
  return { ...chat, messages: [...chat.messages].sort((a, b) => a.id - b.id) };
}

/** `Chat/{chatId}`. Sending returns the whole updated `ChatFull`, so the transcript
 *  is replaced from the response rather than optimistically appended. */
export function ChatScreen() {
  const { chatId = "" } = useParams();
  const { role } = useSession();
  const { t } = useI18n();
  const { run, toast, messageOf } = useFeedback();
  const [chat, setChat] = useState<ChatFull | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [menuFor, setMenuFor] = useState<number | null>(null);
  // Queued messages show at once, in order, until the server confirms each one.
  const [queued, setQueued] = useState<{ key: number; text: string; parent: string | null }[]>([]);
  const queueKey = useRef(0);
  const end = useRef<HTMLDivElement>(null);
  const desktop = useIsDesktop();

  const load = useCallback(() => {
    setError(null);
    run(t("loading_chat_get_one", "Getting chat details"), () => userService.chat(Number(chatId)))
      .then((c) => setChat(chronological(c))).catch(setError);
  }, [chatId, run, t]);
  useEffect(load, [load]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [chat?.messages.length, queued.length]);

  // There is no push channel on the web (Android refreshes on an FCM message), so an
  // open conversation checks for new messages and read receipts while it is visible.
  useEffect(() => {
    if (menuFor === null) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !(e.target as Element).closest(".bubble-menu, .bubble-more")) setMenuFor(null);
    };
    window.addEventListener("keydown", close);
    window.addEventListener("pointerdown", close);
    return () => { window.removeEventListener("keydown", close); window.removeEventListener("pointerdown", close); };
  }, [menuFor]);

  const chatRef = useRef(chat);
  chatRef.current = chat;
  useEffect(() => {
    const signature = (c: ChatFull) => c.messages.map((m) => `${m.id}:${m.seen_at ?? ""}`).join(",");
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      userService.chat(Number(chatId)).then((fresh) => {
        const current = chatRef.current;
        if (current && signature(current) === signature(chronological(fresh))) return;
        setChat(chronological(fresh));
        // Keep the desktop conversation list's preview in step.
        if (current && fresh.messages.length !== current.messages.length) window.dispatchEvent(new Event(CHATS_CHANGED));
      }).catch(() => undefined);
    };
    const timer = window.setInterval(refresh, CHAT_POLL_MS);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [chatId]);

  const partner = role === "client" ? chat?.caregiver?.user : chat?.client?.user;
  // A chat belongs to the match that created it; once that match ends the server
  // answers "The id field contains an unauthorized value."
  const chatMessage = (e: unknown) => (e instanceof ApiError && e.status === 400 && /unauthori[sz]ed/i.test(e.message)
    ? t("chat_screen_match_check", "You can only send messages to your current matches.") : messageOf(e));
  const mine = (m: ChatMessage) => (role === "caregiver" ? m.is_from_caregiver : !m.is_from_caregiver);

  // Messages go out one after another in the order they were written. The field
  // clears as soon as a message is queued, so a double click finds it empty and sends
  // once; if sending fails the text is put back rather than lost.
  const outbox = useRef<Promise<void>>(Promise.resolve());
  const send = () => {
    const text = draft.trim();
    if (!text) return;
    // Android checks the partner's is_match before sending; the server itself accepts
    // messages to an ended match.
    const partnerEntity = role === "client" ? chat?.caregiver : chat?.client;
    if (partnerEntity && partnerEntity.is_match === false) {
      toast(t("chat_screen_match_check", "You can only send messages to your current matches."));
      return;
    }
    const parentId = replyTo?.id ?? null;
    const key = ++queueKey.current;
    setQueued((q) => [...q, { key, text, parent: replyTo?.message ?? null }]);
    setDraft(""); setReplyTo(null);
    outbox.current = outbox.current.then(async () => {
      try {
        const updated = await userService.sendMessage(Number(chatId), text, parentId);
        setChat(chronological(updated));
        window.dispatchEvent(new Event(CHATS_CHANGED));
      } catch (e) {
        toast(chatMessage(e));
        // Every unsent message goes back to the box, in the order it was written.
        setDraft((current) => (current ? `${current}\n${text}` : text));
      } finally {
        setQueued((q) => q.filter((m) => m.key !== key));
      }
    });
  };

  const composer = (
    <div className="composer">
      {replyTo && (
        <div className="reply-bar">
          <Icon name="ic_reply" size={18} tint="var(--primary)" />
          <span className="ellipsis">{replyTo.message}</span>
          <button type="button" className="icon-btn" onClick={() => setReplyTo(null)} aria-label={t("chat_screen_cancel", "Cancel")}>
            <Icon name="ic_clear" size={16} tint="var(--text-secondary)" />
          </button>
        </div>
      )}
      <div className="composer-row">
        <textarea rows={1} value={draft} onChange={(e) => setDraft(e.target.value)}
          placeholder={t("chat_screen_message_placeholder", "Type a message...")} aria-label={t("chat_screen_message_placeholder", "Type a message...")}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <button type="button" className="send-btn" onClick={send} disabled={!draft.trim()} aria-label="Send">
          <Icon name="ic_send" size={22} tint="#fff" className="flip-rtl" />
        </button>
      </div>
    </div>
  );

  const conversation = (
    <>
      <div className="chat-partner">
        <Avatar src={partner?.photo} size={44} />
        <b>{partner?.first_name} {partner?.last_name}</b>
        <button type="button" className="icon-btn" onClick={load} aria-label={t("chat_screen_refresh", "Refresh")}>
          <Icon name="ic_refresh" size={24} tint="var(--primary)" />
        </button>
      </div>
      {error ? <ErrorState message={chatMessage(error)} error={error}
          // Not the user's chat (or the match has ended): retrying cannot help.
          onRetry={chatMessage(error) === messageOf(error) ? load : undefined} />
        : !chat ? <Spinner />
        : chat.messages.length === 0 && queued.length === 0 ? <EmptyState title={t("chat_screen_no_messages_yet", "No Messages Yet")} />
        : (
          <ol className="transcript">
            {chat.messages.map((m) => (
              <li key={m.id} className={`bubble-row ${mine(m) ? "mine" : "theirs"}`}>
                <div className="bubble">
                  {m.parent && <p className="quote" dir="auto">{m.parent.message}</p>}
                  <p dir="auto">{m.message}</p>
                  <span className="bubble-meta">{localTime(m.created_at)}
                    {mine(m) && <Icon name={m.seen_at ? "ic_check_double" : "ic_check"} size={16}
                      tint={mine(m) ? "rgba(255,255,255,.85)" : "var(--text-secondary)"}
                      label={m.seen_at ? `${t("chat_screen_seen_at", "Seen at")} ${localTime(m.seen_at)}` : undefined} />}
                  </span>
                </div>
                <button type="button" className="icon-btn bubble-more" aria-label="Message options"
                  onClick={() => setMenuFor(menuFor === m.id ? null : m.id)}>
                  <Icon name="ic_more" size={20} tint="var(--text-secondary)" />
                </button>
                {menuFor === m.id && (
                  <div className="bubble-menu" role="menu">
                    <button type="button" role="menuitem" onClick={() => { setReplyTo(m); setMenuFor(null); }}>
                      <Icon name="ic_reply" size={18} tint="var(--text)" />{t("chat_screen_reply", "Reply")}</button>
                    <button type="button" role="menuitem" onClick={() => { void navigator.clipboard?.writeText(m.message); setMenuFor(null); }}>
                      <Icon name="ic_edit" size={18} tint="var(--text)" />{t("chat_screen_copy", "Copy")}</button>
                  </div>
                )}
              </li>
            ))}
            {queued.map((m) => (
              <li key={`queued-${m.key}`} className="bubble-row mine queued" aria-busy="true">
                <div className="bubble">
                  {m.parent && <p className="quote" dir="auto">{m.parent}</p>}
                  <p dir="auto">{m.text}</p>
                  <span className="bubble-meta" role="status">
                    <Icon name="ic_clock" size={14} tint="rgba(255,255,255,.9)" />
                    {t("loading_chat_send", "Sending a new message")}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        )}
      <div ref={end} className="transcript-end" />
    </>
  );

  if (desktop) {
    return (
      <MessagesDesktop selectedId={Number(chatId)}>
        <div className="chat-pane">
          <div className="chat-pane-scroll">{conversation}</div>
          {composer}
        </div>
      </MessagesDesktop>
    );
  }
  return (
    <Page className="chat-page" header={<BackHeader title={t("chat_screen_messages_title", "Chat Messages")} />} footer={composer}>
      {conversation}
    </Page>
  );
}

/* ----------------------------------------------------------- Manage matches */
