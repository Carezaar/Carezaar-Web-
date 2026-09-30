import { useState } from "react";
import { useGoBack } from "../navigation/back";
import { ApiError } from "../api/errors";
import { userService } from "../api/services";
import { useSession } from "../auth/SessionContext";
import { useBaseData } from "../app/baseData";
import { useFeedback } from "../app/feedback";
import { useI18n } from "../app/i18n";
import { BackHeader, Page } from "../ui/layout";
import { Button } from "../ui/kit";
import { Icon } from "../ui/Icon";
import { backgroundCheckProblems, toServerDate, type BackgroundCheckForm } from "../validation/backgroundCheck";

/** Background check. Messaging and match requests route here for any viewer who is
 *  not VERIFIED. After submitting, the account is PENDING and the confirmation
 *  message is shown instead of the form. */
export function VerificationScreen() {
  const goBack = useGoBack("/main/profile");
  const { t } = useI18n();
  const { states } = useBaseData();
  const { user, refreshUser } = useSession();
  const { act, toast, messageOf } = useFeedback();
  const { languageId } = useI18n();
  const [form, setForm] = useState<BackgroundCheckForm>({ first: user?.first_name ?? "", middle: "", last: user?.last_name ?? "", dob: "", ssn: "", street: "", zip: "", state: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showSsn, setShowSsn] = useState(false);
  const status = user?.status.toUpperCase();
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    const formatMessage: Partial<Record<keyof BackgroundCheckForm, string>> = {
      dob: "Enter a valid date of birth (MM/DD/YYYY).",
      ssn: "Enter the 9-digit Social Security Number, for example 123-45-6789.",
      zip: "Enter a 5-digit ZIP code, or ZIP+4 such as 12345-6789.",
    };
    const next = Object.fromEntries(Object.entries(backgroundCheckProblems(form)).map(([field, problem]) =>
      [field, problem === "format" ? formatMessage[field as keyof BackgroundCheckForm] ?? "" : t("general_required", "This field is required.")]));
    setErrors(next);
    if (Object.keys(next).length) return;
    try {
      await act(t("loading_submitting_verification_request", "Submitting verification request"), () => userService.verifyIdentity({
        firstName: form.first.trim(), middleName: form.middle.trim() || null, lastName: form.last.trim(),
        dateOfBirth: toServerDate(form.dob), socialSecurityNumber: form.ssn.trim(), streetAddress: form.street.trim(),
        zipCode: form.zip.trim(), stateId: Number(form.state),
      }));
      await refreshUser();
    } catch (e) {
      if (e instanceof ApiError && e.kind === "validation") {
        const map: Record<string, string> = { first_name: "first", middle_name: "middle", last_name: "last", date_of_birth: "dob", social_security_number: "ssn", street_address: "street", zip_code: "zip", state_id: "state" };
        setErrors(Object.fromEntries(Object.entries(e.fields).map(([k, v]) => [map[k] ?? k, v[0]])));
      } else toast(messageOf(e));
    }
  };

  const stateName = (s: (typeof states)[number]) => s.translations.find((x) => x.language_id === languageId)?.name ?? s.translations[0]?.name ?? s.slug ?? "";
  return (
    <Page header={<BackHeader title={t("general_background_check_title", "Background Check")} />}
      footer={status === "PENDING" ? <Button onClick={() => goBack()}>{t("general_ok", "OK")}</Button>
        : <Button onClick={() => void submit()}>{t("general_background_check_submit", "Submit")}</Button>}>
      {status === "PENDING" ? (
        <div className="center stack"><Icon name="ic_timer" size={80} tint="var(--primary)" />
          <p className="lead">{t("general_background_check_submitted", "Your information has been received.")}</p></div>
      ) : (
        // Figma v2 frame 738:11737.
        <div className="bgc">
          <p className="bgc-intro">{t("general_background_check_required", "")}</p>
          <div className="bgc-grid">
            <BgcField label={t("general_background_check_first_name", "First Name")} required error={errors.first}>
              <input value={form.first} onChange={set("first")} autoComplete="given-name" placeholder={t("general_background_check_first_name", "First Name")} />
            </BgcField>
            <BgcField label={t("general_background_check_middle_name", "Middle Name")} error={errors.middle}>
              <input value={form.middle} onChange={set("middle")} autoComplete="additional-name" placeholder={t("general_background_check_middle_name", "Middle Name")} />
            </BgcField>
            <BgcField label={t("general_background_check_last_name", "Last Name")} required error={errors.last}>
              <input value={form.last} onChange={set("last")} autoComplete="family-name" placeholder={t("general_background_check_last_name", "Last Name")} />
            </BgcField>
            <BgcField label={t("general_background_check_date_of_birth", "Date of Birth")} required error={errors.dob} icon="ic_calendar">
              <input type="date" value={form.dob} onChange={set("dob")} aria-label={t("general_background_check_date_of_birth", "Date of Birth")} />
            </BgcField>
            <BgcField wide label={t("general_background_check_social_security_number", "Social Security Number")} required error={errors.ssn}>
              {/* Masked like a password: it is a national identity number. */}
              <input type={showSsn ? "text" : "password"} inputMode="numeric" maxLength={11} value={form.ssn} onChange={set("ssn")}
                autoComplete="off" placeholder={t("general_background_check_social_security_number", "Social Security Number")} />
              <button type="button" className="icon-btn" onClick={() => setShowSsn((v) => !v)} aria-pressed={showSsn}
                aria-label={showSsn ? "Hide Social Security Number" : "Show Social Security Number"}>
                <Icon name={showSsn ? "ic_visible" : "ic_hidden"} size={20} tint="#555" />
              </button>
            </BgcField>
            <BgcField label={t("general_background_check_street_address", "Street Address")} required error={errors.street}>
              <input value={form.street} onChange={set("street")} autoComplete="street-address" placeholder={t("general_background_check_street_address", "Street Address")} />
            </BgcField>
            <BgcField label={t("general_background_check_zip_code", "ZIP Code")} required error={errors.zip}>
              <input inputMode="numeric" maxLength={10} value={form.zip} onChange={set("zip")} autoComplete="postal-code" placeholder={t("general_background_check_zip_code", "ZIP Code")} />
            </BgcField>
            <BgcField wide label={t("general_background_check_state", "State")} required error={errors.state} trailing="ic_chevron_down">
              <select value={form.state} onChange={set("state")} className={form.state ? "" : "placeholder"}
                aria-label={t("general_background_check_state", "State")}>
                <option value="">{t("general_background_check_state", "State")}</option>
                {states.map((s) => <option key={s.id} value={s.id}>{stateName(s)}</option>)}
              </select>
            </BgcField>
          </div>
        </div>
      )}
    </Page>
  );
}

/** A labelled input in the Background Check frame: "Label: *" above a 54px box. */
function BgcField({ label, required = false, error, wide = false, icon, trailing, children }: {
  label: string; required?: boolean; error?: string; wide?: boolean; icon?: string; trailing?: string; children: React.ReactNode;
}) {
  return (
    <label className={`bgc-field ${wide ? "wide" : ""} ${error ? "invalid" : ""}`}>
      <span className="bgc-label">{label}:{required && <b> *</b>}</span>
      <span className="bgc-box">
        {icon && <Icon name={icon} size={20} tint="#555" />}
        {children}
        {trailing && <Icon name={trailing} size={18} tint="#888" />}
      </span>
      {error && <span className="bgc-error" role="alert">{error}</span>}
    </label>
  );
}
