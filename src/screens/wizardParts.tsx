import { useMemo, useState, type ReactNode } from "react";
import { useGoBack } from "../navigation/back";
import type { BaseItem } from "../api/types";
import { useFeedback } from "../app/feedback";
import { useI18n } from "../app/i18n";
import { FigmaScreen } from "../figma/FigmaScreen";
import type { SceneBinder } from "../figma/binder";
import { BackHeader, Page } from "../ui/layout";
import { Button, CheckChip, Field, Stepper } from "../ui/kit";
import { Icon } from "../ui/Icon";
import type { LatLng } from "./LocationPicker";

/** Android client-type art → the description slug shown under each care type. */
const CARE_TYPE_DESCRIPTION: Record<string, string> = {
  client_pregnancy: "signup_form_client_birth_postpartum_description",
  client_child: "signup_form_client_child_care_description",
  client_senior: "signup_form_client_senior_care_description",
  client_adult: "signup_form_client_adult_care_description",
};

/* ------------------------------------------------------------ primitives */

export function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="pref-card">
      <header><h3>{title}</h3>{hint && <span className="muted small">{hint}</span>}</header>
      {children}
    </section>
  );
}

export function MultiSelect({ items, value, onChange, withIcons = false, tiles = false }: {
  items: BaseItem[]; value: number[]; onChange: (v: number[]) => void; withIcons?: boolean;
  /** The services grid of the Figma frames: four icon tiles per row. */
  tiles?: boolean;
}) {
  const { label } = useI18n();
  return (
    <div className={tiles ? "tile-grid" : "chip-wrap"}>
      {items.map((item) => {
        const on = value.includes(item.id);
        return (
          <CheckChip key={item.id} selected={on} icon={withIcons ? item.icon : undefined}
            onToggle={() => onChange(on ? value.filter((x) => x !== item.id) : [...value, item.id])}>
            {label(item)}
          </CheckChip>
        );
      })}
    </div>
  );
}

export function SingleSelect({ items, value, onChange }: {
  items: BaseItem[]; value: number | null; onChange: (v: number) => void;
}) {
  const { label } = useI18n();
  return (
    <div className="chip-wrap" role="radiogroup">
      {items.map((item) => (
        <button key={item.id} type="button" role="radio" aria-checked={value === item.id}
          className={`check-chip ${value === item.id ? "on" : ""}`} onClick={() => onChange(item.id)}>
          <Icon name={value === item.id ? "ic_radiobutton_on" : "ic_radiobutton_off"} size={18}
            tint={value === item.id ? "var(--primary)" : "var(--text-secondary)"} />
          <span>{label(item)}</span>
        </button>
      ))}
    </div>
  );
}

export function CareTypeCards({ items, value, onToggle }: {
  items: BaseItem[]; value: number[]; onToggle: (id: number) => void;
}) {
  const { label, t } = useI18n();
  return (
    <div className="stack">
      {items.map((item) => {
        const on = value.includes(item.id);
        const description = item.icon ? CARE_TYPE_DESCRIPTION[item.icon] : undefined;
        return (
          <button key={item.id} type="button" className={`care-type ${on ? "on" : ""}`}
            aria-pressed={on} onClick={() => onToggle(item.id)}>
            <Icon name={item.icon} size={64} />
            <span className="care-type-text">
              <strong>{label(item)}</strong>
              {description && <span className="muted small">{t(description, "")}</span>}
            </span>
            <Icon name={on ? "ic_radiobutton_on" : "ic_radiobutton_off"} size={22}
              tint={on ? "var(--primary)" : "var(--text-secondary)"} />
          </button>
        );
      })}
    </div>
  );
}

export function SalaryRange({ min, max, onMin, onMax, unit, title }: {
  min: number | null; max: number | null; onMin: (v: number | null) => void; onMax: (v: number | null) => void;
  unit: string; title: string;
}) {
  const { t } = useI18n();
  const parse = (v: string) => (v === "" ? null : Math.max(0, Math.round(Number(v))));
  return (
    <Section title={title} hint={`(${unit})`}>
      <div className="grid-2">
        <Field label={t("signup_form_client_minimum", "Minimum")} icon="ic_usd">
          <input type="number" inputMode="numeric" min={0} value={min ?? ""} aria-label={t("signup_form_client_minimum", "Minimum")}
            onChange={(e) => onMin(parse(e.target.value))} />
        </Field>
        <Field label={t("signup_form_client_maximum", "Maximum")} icon="ic_usd">
          <input type="number" inputMode="numeric" min={0} value={max ?? ""} aria-label={t("signup_form_client_maximum", "Maximum")}
            onChange={(e) => onMax(parse(e.target.value))} />
        </Field>
      </div>
    </Section>
  );
}

export function LocationField({ value, onPick }: { value: LatLng | null; onPick: () => void }) {
  const { t } = useI18n();
  return (
    <Section title={t("signup_form_client_location", "Location")}>
      <button type="button" className="location-field" onClick={onPick}>
        <Icon name="ic_distance" size={24} tint="var(--primary)" />
        <span className={`location-text ${value ? "" : "muted"}`}>
          {value ? `${value.lat.toFixed(6)} , ${value.lng.toFixed(6)}`
            : t("signup_form_client_location_hint", "Tap to select location from map or your current location")}
        </span>
        <Icon name="ic_chevron_forward" size={20} tint="var(--text-secondary)" className="flip-rtl" />
      </button>
    </Section>
  );
}

export function ReviewRow({ title, values }: { title: string; values: string[] }) {
  return (
    <div className="review-row">
      <h4>{title}</h4>
      <div className="chip-wrap">{values.map((v) => <span key={v} className="review-chip">{v}</span>)}</div>
    </div>
  );
}

/** The Android preference intro (v2 "Match Prefs - Step 0"), re-titled for caregivers. */
export const CLIENT_ILLUSTRATIONS = new Set(["101:11970", "101:11969", "101:11971"]);

export function WizardIntro({ title, description, caregiver = false, onStart }: {
  title?: string; description?: string; caregiver?: boolean; onStart: () => void;
}) {
  const goBack = useGoBack("/main/matches");
  const binder = useMemo<SceneBinder>(() => ({
    handle: (n) => {
      if (n.name === "Back" || n.name === "Header") { goBack(); return true; }
      if (n.name === "Button" || n.actionTarget) { onStart(); return true; }
      return false;
    },
    text: (n) => (n.name === "Title" && title ? title : n.name === "Description" && description ? description : undefined),
    // The caregiver frame (715:11684) shows its own skills illustration.
    isHidden: (n) => caregiver && CLIENT_ILLUSTRATIONS.has(n.id),
  }), [goBack, onStart, title, description, caregiver]);
  return <FigmaScreen sceneKey="v2-65-19934" binder={binder} overlays={caregiver ? [
    { x: 94, y: 110, width: 224, height: 238, content: <img src="/assets/mobile-match-skills-illustration.png" alt="" width="100%" height="100%" /> },
  ] : []} />;
}

/* --------------------------------------------------------------- engine */

export interface StepDef {
  title: string;
  description: string;
  body: ReactNode;
  /** First unmet requirement, as a user-facing message. */
  problem: () => string | null;
}

export function Wizard({ steps, review, reviewTitle, saveLabel, onSave, onExit }: {
  steps: StepDef[]; review: ReactNode; reviewTitle: string; saveLabel: string;
  onSave: () => Promise<void>; onExit: () => void;
}) {
  const { t } = useI18n();
  const { toast } = useFeedback();
  const [index, setIndex] = useState(0);
  const total = steps.length + 1;
  const onReview = index === steps.length;
  const current = steps[index];

  const next = () => {
    const problem = current?.problem();
    if (problem) { toast(problem); return; }
    setIndex((i) => i + 1);
    window.scrollTo({ top: 0 });
  };

  return (
    <Page header={<BackHeader onBack={() => (index === 0 ? onExit() : setIndex((i) => i - 1))} />}
      footer={
        <div className="stack-sm">
          <Button trailingIcon="ic_arrow_forward" onClick={() => (onReview ? void onSave() : next())}>
            {onReview ? saveLabel : t("signup_form_client_continue", "Continue")}
          </Button>
          <p className="footnote"><Icon name="ic_info_circle" size={18} tint="var(--primary)" />
            {t("signup_form_client_create_account_description", "You can change all of this later.")}</p>
        </div>
      }>
      <Stepper step={index + 1} total={total} label={t("step_wizard_step", "Step").toUpperCase()} />
      <div className="wizard-head">
        <h2>{onReview ? reviewTitle : current.title}</h2>
      </div>
      {onReview ? review : (
        <>
          <p className="muted center">{current.description}</p>
          <div className="stack">{current.body}</div>
        </>
      )}
    </Page>
  );
}

export function ReviewCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <>
      <p className="muted center">{description}</p>
      <div className="review-card" aria-label={title}>{children}</div>
    </>
  );
}

/* ------------------------------------------------------------------ client */
