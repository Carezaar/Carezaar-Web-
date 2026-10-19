import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ApiError } from "../api/errors";
import { useParams } from "react-router-dom";
import { userService } from "../api/services";
import type { ChatFull, ChatMessage } from "../api/types";
import { useSession } from "../auth/SessionContext";
import { useFeedback } from "../app/feedback";
import { useI18n } from "../app/i18n";
import { isDeletedAccount, personName } from "../app/names";
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
  const { role, user } = useSession();
  const { t } = useI18n();
  const { run, toast, messageOf } = useFeedback();
  const [chat, setChat] = useState<ChatFull | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [menuFor, setMenuFor] = useState<number | null>(null);
  // One message at a time, as on Android: the next can be sent once the server has
  // answered for this one.
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const end = useRef<HTMLDivElement>(null);
  // Whether the reader is at the newest message. New messages scroll into view only
  // then; someone reading older messages keeps their place.
  const stick = useRef(true);
  const desktop = useIsDesktop();
  const scope = useRef(0);
  // Reset conversation-owned state before paint without remounting the desktop
  // list. Resizing the same conversation retains its draft and reply.
  useLayoutEffect(() => {
    const invalidate = () => { scope.current++; };
    invalidate();
    setChat(null); setError(null); setDraft(""); setReplyTo(null); setMenuFor(null);
    sendingRef.current = false; setSending(false); stick.current = true;
    return invalidate;
  }, [chatId, user?.id]);

  const load = useCallback(() => {
    if (!user?.id) return;
    const owner = scope.current;
    setError(null);
    run(t("loading_chat_get_one", "Getting chat details"), () => userService.chat(Number(chatId)))
      .then((c) => { if (scope.current === owner) setChat(chronological(c)); })
      .catch((e) => { if (scope.current === owner) setError(e); });
  }, [chatId, user?.id, run, t]);
  useEffect(load, [load]);
  const hasChat = chat !== null;
  useEffect(() => {
    // The transcript scrolls in its pane on desktop and with the page on phones.
    const pane = () => end.current?.closest(".chat-pane-scroll") as HTMLElement | null;
    const onScroll = () => {
      const box = pane();
      const gap = box ? box.scrollHeight - box.scrollTop - box.clientHeight
        : document.documentElement.scrollHeight - window.scrollY - window.innerHeight;
      stick.current = gap < 80;
    };
    const box = pane();
    const target: HTMLElement | Window = box ?? window;
    target.addEventListener("scroll", onScroll, { passive: true });
    return () => target.removeEventListener("scroll", onScroll);
  }, [desktop, hasChat]);
  useEffect(() => { if (stick.current) end.current?.scrollIntoView({ block: "end" }); }, [chat?.messages.length]);
  // A different conversation starts at its newest message.
  useEffect(() => { stick.current = true; }, [chatId]);

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
    let active = true;
    const owner = scope.current;
    const signature = (c: ChatFull) => c.messages.map((m) => `${m.id}:${m.seen_at ?? ""}`).join(",");
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      userService.chat(Number(chatId)).then((fresh) => {
        if (!active || scope.current !== owner) return;
        const current = chatRef.current;
        if (current && signature(current) === signature(chronological(fresh))) return;
        setChat(chronological(fresh));
        // Keep the desktop conversation list's preview in step.
        if (current && fresh.messages.length !== current.messages.length) window.dispatchEvent(new Event(CHATS_CHANGED));
      }).catch(() => undefined);
    };
    const timer = window.setInterval(refresh, CHAT_POLL_MS);
    window.addEventListener("focus", refresh);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [chatId, user?.id]);

  const partnerEntity = role === "client" ? chat?.caregiver : chat?.client;
  const partner = partnerEntity?.user;
  // A conversation that can't take messages any more is closed, with the reason above
  // the box, as on Android (parity review v4.0, K2 and K3): the other person deleted
  // their account, or is no longer a match (the server itself would accept the message).
  const closedNote = isDeletedAccount(partner)
    ? t("chat_screen_account_deleted", "This account has been deleted. You can no longer send messages.")
    : partnerEntity && partnerEntity.is_match === false
      ? t("chat_screen_match_check", "You can only send messages to your current matches.")
      : null;
  // A chat belongs to the match that created it; once that match ends the server
  // answers "The id field contains an unauthorized value."
  const chatMessage = (e: unknown) => (e instanceof ApiError && e.status === 400 && /unauthori[sz]ed/i.test(e.message)
    ? t("chat_screen_match_check", "You can only send messages to your current matches.") : messageOf(e));
  const mine = (m: ChatMessage) => (role === "caregiver" ? m.is_from_caregiver : !m.is_from_caregiver);
  const composerUnavailable = !chat || Boolean(error);

  // One send at a time: the text stays in the box (read-only) until the server confirms
  // it, so a double click, Enter held down or a slow connection can't send it twice, and
  // a failed send leaves the text there to try again. A send is never repeated
  // automatically: it may have reached the server.
  const send = async () => {
    if (sendingRef.current || closedNote || composerUnavailable) return;
    const text = draft.trim();
    // Send stays active with an empty box and says why nothing was sent (K4).
    if (!text) { toast(t("chat_screen_message_required", "Please type a message first.")); return; }
    const owner = scope.current;
    sendingRef.current = true;
    setSending(true);
    try {
      const updated = await run(t("loading_chat_send", "Sending a new message"),
        () => userService.sendMessage(Number(chatId), text, replyTo?.id ?? null));
      if (scope.current !== owner) return;
      stick.current = true;
      setChat(chronological(updated));
      setDraft(""); setReplyTo(null);
      window.dispatchEvent(new Event(CHATS_CHANGED));
    } catch (e) {
      if (scope.current !== owner) return;
      // No answer: the message may have been delivered. It is not sent again; the
      // conversation is read, and if the message is there it counts as sent.
      if (e instanceof ApiError && (e.kind === "network" || e.kind === "timeout")) {
        const known = new Set((chat?.messages ?? []).map((m) => m.id));
        try {
          const fresh = chronological(await userService.chat(Number(chatId)));
          if (scope.current !== owner) return;
          setChat(fresh);
          if (fresh.messages.some((m) => !known.has(m.id) && mine(m) && m.message.trim() === text)) {
            stick.current = true;
            setDraft(""); setReplyTo(null);
            window.dispatchEvent(new Event(CHATS_CHANGED));
            return;
          }
        } catch { /* still unknown: say so below, keep the text */ }
      }
      if (scope.current !== owner) return;
      toast(chatMessage(e));
    } finally {
      if (scope.current === owner) {
        sendingRef.current = false;
        setSending(false);
      }
    }
  };

  const composer = (
    <div className="composer">
      {closedNote && <p className="composer-note" role="status">{closedNote}</p>}
      {replyTo && !closedNote && (
        <div className="reply-bar">
          <Icon name="ic_reply" size={18} tint="var(--primary)" />
          <span className="ellipsis">{replyTo.message}</span>
          <button type="button" className="icon-btn" onClick={() => setReplyTo(null)} aria-label={t("chat_screen_cancel", "Cancel")}>
            <Icon name="ic_clear" size={16} tint="var(--text-secondary)" />
          </button>
        </div>
      )}
      <div className="composer-row">
        <textarea rows={1} value={draft} onChange={(e) => setDraft(e.target.value)} readOnly={sending} aria-busy={sending}
          disabled={closedNote !== null || composerUnavailable}
          placeholder={t("chat_screen_message_placeholder", "Type a message...")} aria-label={t("chat_screen_message_placeholder", "Type a message...")}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} />
        <button type="button" className={`send-btn ${closedNote ? "closed" : ""}`} onClick={() => void send()}
          disabled={sending || closedNote !== null || composerUnavailable}
          aria-label={sending ? t("loading_chat_send", "Sending a new message") : "Send"}>
          {sending ? <span className="spinner small" aria-hidden="true" /> : <Icon name="ic_send" size={22} tint="#fff" className="flip-rtl" />}
        </button>
      </div>
    </div>
  );

  const conversation = (
    <>
      <div className="chat-partner">
        <Avatar src={partner?.photo} size={44} />
        <b>{personName(partner, t)}</b>
        <button type="button" className="icon-btn" onClick={load} aria-label={t("chat_screen_refresh", "Refresh")}>
          <Icon name="ic_refresh" size={24} tint="var(--primary)" />
        </button>
      </div>
      {error ? <ErrorState message={chatMessage(error)} error={error}
          // Not the user's chat (or the match has ended): retrying cannot help.
          onRetry={chatMessage(error) === messageOf(error) ? load : undefined} />
        : !chat ? <Spinner />
        : chat.messages.length === 0 ? <EmptyState title={t("chat_screen_no_messages_yet", "No Messages Yet")} />
        : (
          <ol className="transcript">
            {chat.messages.map((m) => (
              <li key={m.id} className={`bubble-row ${mine(m) ? "mine" : "theirs"}`}>
                <div className="bubble">
                  {m.parent && <p className="quote" dir="auto">{m.parent.message}</p>}
                  <p dir="auto">{m.message}</p>
                  <span className="bubble-meta">{/* As stored on the server, not converted. */}{m.created_at}
                    {mine(m) && <Icon name={m.seen_at ? "ic_check_double" : "ic_check"} size={16}
                      tint={mine(m) ? "rgba(255,255,255,.85)" : "var(--text-secondary)"}
                      label={m.seen_at ? `${t("chat_screen_seen_at", "Seen at")} ${m.seen_at}` : undefined} />}
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
