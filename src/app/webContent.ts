/** Copy the web needs that the server's content table doesn't have yet (October 2026),
 *  in the app's eight languages. Used only while `base/contents` has no row for the slug:
 *  once the client adds these keys there, the server's text is shown instead. */
export const WEB_CONTENT: Record<string, Record<string, string>> = {
  notification_permission_title: {
    en: "Allow notifications", sp: "Permitir notificaciones", fr: "Autoriser les notifications", ru: "Разрешите уведомления",
    ar: "السماح بالإشعارات", fa: "اجازه دادن به اعلان‌ها", in: "सूचनाओं की अनुमति दें", cn: "允许通知",
  },
  notification_permission_message: {
    en: "Carezaar needs to send you notifications about match requests, matches and messages. Please allow notifications to continue.",
    sp: "Carezaar necesita enviarte notificaciones sobre solicitudes de match, matches y mensajes. Permite las notificaciones para continuar.",
    fr: "Carezaar doit vous envoyer des notifications sur les demandes de match, les matchs et les messages. Autorisez les notifications pour continuer.",
    ru: "Carezaar отправляет уведомления о запросах на совпадение, совпадениях и сообщениях. Разрешите уведомления, чтобы продолжить.",
    ar: "يحتاج Carezaar إلى إرسال إشعارات إليك بشأن طلبات المطابقة والمطابقات والرسائل. يرجى السماح بالإشعارات للمتابعة.",
    fa: "Carezaar باید درباره درخواست‌های تطبیق، تطبیق‌ها و پیام‌ها برای شما اعلان بفرستد. برای ادامه، اعلان‌ها را مجاز کنید.",
    in: "Carezaar को आपको मैच अनुरोधों, मैचों और संदेशों के बारे में सूचनाएँ भेजनी होती हैं। जारी रखने के लिए कृपया सूचनाओं की अनुमति दें।",
    cn: "Carezaar 需要向您发送有关匹配请求、匹配和消息的通知。请允许通知以继续。",
  },
  notification_permission_settings: {
    en: "Notifications are blocked for this site. Open the site settings (the icon next to the address bar), set Notifications to Allow, then continue.",
    sp: "Las notificaciones están bloqueadas para este sitio. Abre la configuración del sitio (el icono junto a la barra de direcciones), cambia Notificaciones a Permitir y continúa.",
    fr: "Les notifications sont bloquées pour ce site. Ouvrez les paramètres du site (l'icône à côté de la barre d'adresse), réglez Notifications sur Autoriser, puis continuez.",
    ru: "Уведомления для этого сайта заблокированы. Откройте настройки сайта (значок рядом с адресной строкой), выберите для уведомлений «Разрешить» и продолжите.",
    ar: "الإشعارات محظورة لهذا الموقع. افتح إعدادات الموقع (الرمز بجوار شريط العنوان)، واضبط الإشعارات على السماح، ثم تابع.",
    fa: "اعلان‌ها برای این سایت مسدود شده‌اند. تنظیمات سایت را باز کنید (نماد کنار نوار نشانی)، اعلان‌ها را روی «اجازه» بگذارید و سپس ادامه دهید.",
    in: "इस साइट के लिए सूचनाएँ अवरुद्ध हैं। साइट सेटिंग्स खोलें (पता बार के पास वाला आइकन), सूचनाओं को अनुमति पर सेट करें, फिर जारी रखें।",
    cn: "此网站的通知已被阻止。请打开网站设置（地址栏旁的图标），将通知设为允许，然后继续。",
  },
  notification_permission_allow: {
    en: "Allow notifications", sp: "Permitir notificaciones", fr: "Autoriser les notifications", ru: "Разрешить уведомления",
    ar: "السماح بالإشعارات", fa: "اجازه دادن به اعلان‌ها", in: "सूचनाओं की अनुमति दें", cn: "允许通知",
  },
  error_general: {
    en: "Something went wrong. Please try again.", sp: "Algo salió mal. Inténtalo de nuevo.", fr: "Un problème est survenu. Veuillez réessayer.",
    ru: "Что-то пошло не так. Попробуйте ещё раз.", ar: "حدث خطأ ما. يرجى المحاولة مرة أخرى.", fa: "مشکلی پیش آمد. لطفاً دوباره تلاش کنید.",
    in: "कुछ गलत हो गया। कृपया फिर से प्रयास करें।", cn: "出了点问题，请重试。",
  },
  error_forbidden: {
    en: "You can't do this right now.", sp: "No puedes hacer esto ahora.", fr: "Vous ne pouvez pas faire cela pour le moment.",
    ru: "Сейчас это действие недоступно.", ar: "لا يمكنك القيام بذلك الآن.", fa: "اکنون نمی‌توانید این کار را انجام دهید.",
    in: "आप अभी यह नहीं कर सकते।", cn: "您现在无法执行此操作。",
  },
  error_not_found: {
    en: "This item is no longer available.", sp: "Este elemento ya no está disponible.", fr: "Cet élément n'est plus disponible.",
    ru: "Этот элемент больше недоступен.", ar: "هذا العنصر لم يعد متاحًا.", fa: "این مورد دیگر در دسترس نیست.",
    in: "यह आइटम अब उपलब्ध नहीं है।", cn: "此内容已不可用。",
  },
  error_session_expired: {
    en: "Your session has expired. Please sign in again.", sp: "Tu sesión ha caducado. Inicia sesión de nuevo.", fr: "Votre session a expiré. Veuillez vous reconnecter.",
    ru: "Сеанс истёк. Войдите снова.", ar: "انتهت صلاحية جلستك. يرجى تسجيل الدخول مرة أخرى.", fa: "نشست شما منقضی شده است. لطفاً دوباره وارد شوید.",
    in: "आपका सत्र समाप्त हो गया है। कृपया फिर से साइन इन करें।", cn: "您的会话已过期，请重新登录。",
  },
  error_profile_unavailable: {
    en: "This profile isn't available.", sp: "Este perfil no está disponible.", fr: "Ce profil n'est pas disponible.",
    ru: "Этот профиль недоступен.", ar: "هذا الملف الشخصي غير متاح.", fa: "این نمایه در دسترس نیست.",
    in: "यह प्रोफ़ाइल उपलब्ध नहीं है।", cn: "此个人资料不可用。",
  },
};

/** The web's own copy for a slug in a language (English if that language is missing). */
export function webContent(slug: string, code: string | undefined): string | undefined {
  const entry = WEB_CONTENT[slug];
  return entry ? (code && entry[code]) || entry.en : undefined;
}
