import { useEffect, useMemo, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useGoBack, exitPast } from "../navigation/back";
import type { BaseItem } from "../api/types";
import { useFeedback } from "../app/feedback";
import { useBaseData } from "../app/baseData";
import { useI18n } from "../app/i18n";
import { FigmaScreen } from "../figma/FigmaScreen";
import type { SceneBinder } from "../figma/binder";
import { BackHeader, Page } from "../ui/layout";
import { Button, CheckChip, Field, Stepper } from "../ui/kit";
import { Icon } from "../ui/Icon";
import { useIsWide } from "../ui/frames";
import { CardTop } from "./authCards";
import type { LatLng } from "./LocationPicker";
import { parsePay } from "../validation/validation";

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
      <header><h2>{title}</h2>{hint && <span className="muted small">{hint}</span>}</header>
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

/** `note` is the managed line under the fields, as on Android (client review, 23 Oct). */
export function SalaryRange({ min, max, onMin, onMax, unit, title, note }: {
  min: number | null; max: number | null; onMin: (v: number | null) => void; onMax: (v: number | null) => void;
  unit: string; title: string; note?: string;
}) {
  const { t } = useI18n();
  // Digits only, at most 6 (F4).
  const parse = parsePay;
  return (
    <Section title={title} hint={`(${unit})`}>
      <div className="grid-2">
        <Field label={t("signup_form_client_minimum", "Minimum")} icon="ic_usd">
          <input type="text" inputMode="numeric" pattern="[0-9]*" value={min ?? ""} placeholder="0"
            aria-label={t("signup_form_client_minimum", "Minimum")} onChange={(e) => onMin(parse(e.target.value))} />
        </Field>
        <Field label={t("signup_form_client_maximum", "Maximum")} icon="ic_usd">
          <input type="text" inputMode="numeric" pattern="[0-9]*" value={max ?? ""} placeholder="0"
            aria-label={t("signup_form_client_maximum", "Maximum")} onChange={(e) => onMax(parse(e.target.value))} />
        </Field>
      </div>
      {note && <p className="muted pay-note">{note}</p>}
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
      <h2>{title}</h2>
      <div className="chip-wrap">{values.map((v) => <span key={v} className="review-chip">{v}</span>)}</div>
    </div>
  );
}

/** The Android preference intro (v2 "Match Prefs - Step 0"), re-titled for caregivers. */
export const CLIENT_ILLUSTRATIONS = new Set(["101:11970", "101:11969", "101:11971"]);

const SKILL_ICONS = ["ic_condition_feeding", "ic_special_calm", "ic_shift_weekends", "ic_certified_full"];

function Orbit({ names, radius, size, tint }: { names: string[]; radius: number; size: number; tint?: string }) {
  const box = radius * 2 + size;
  return (
    <div className="orbit" style={{ width: box, height: box }} aria-hidden="true">
      {names.map((name, i) => (
        <span key={name + i} className="orbit-arm"
          style={{ transform: `rotate(${(360 / names.length) * i - 90}deg) translateX(${radius}px) rotate(${90 - (360 / names.length) * i}deg)` }}>
          <span className="orbit-item" style={{ width: size, height: size, margin: -size / 2 }}>
            <Icon name={name} size={size} tint={tint} />
          </span>
        </span>
      ))}
    </div>
  );
}

function IntroOrbit({ caregiver }: { caregiver: boolean }) {
  const { items } = useBaseData();
  return caregiver
    ? <Orbit names={SKILL_ICONS} radius={72} size={80} tint="var(--primary)" />
    : <Orbit names={items("clienttypes").flatMap((c) => (c.icon ? [c.icon] : []))} radius={96} size={128} />;
}

export function WizardIntro({ title, description, caregiver = false, onStart }: {
  title?: string; description?: string; caregiver?: boolean; onStart: () => void;
}) {
  const goBack = useGoBack("/main/matches");
  const isWide = useIsWide();
  const { t } = useI18n();
  const binder = useMemo<SceneBinder>(() => ({
    handle: (n) => {
      if (n.name === "Back" || n.name === "Header") { goBack(); return true; }
      if (n.name === "Button" || n.actionTarget) { onStart(); return true; }
      return false;
    },
    text: (n) => (n.name === "Title" && title ? title : n.name === "Description" && description ? description : undefined),
    isHidden: (n) => CLIENT_ILLUSTRATIONS.has(n.id),
  }), [goBack, onStart, title, description]);
  if (isWide) {
    return (
      <main className="auth-form wizard-intro-web">
        <CardTop onBack={goBack} logo />
        <IntroOrbit caregiver={caregiver} />
        <h1>{title ?? t("signup_form_client_find_ideal_caregiver", "Find Your Ideal Caregiver")}</h1>
        <p className="auth-sub">{description ?? t("signup_form_client_intro_description", "Tell us your preferences and we will recommend caregivers that best match your needs.")}</p>
        <Button onClick={onStart}>{t("signup_form_client_get_started", "Get Started")}</Button>
      </main>
    );
  }
  return <FigmaScreen sceneKey="v2-65-19934" binder={binder} overlays={[caregiver
    ? { x: 94, y: 113, width: 224, height: 224, content: <IntroOrbit caregiver /> }
    : { x: 46, y: 65, width: 320, height: 320, content: <IntroOrbit caregiver={false} /> },
  ]} />;
}

/* --------------------------------------------------------------- engine */

export interface StepDef {
  title: string;
  description: string;
  body: ReactNode;
  /** First unmet requirement, as a user-facing message. */
  problem: () => string | null;
}

export function Wizard({ steps, index: savedIndex, onStepChange, historyScope, review, reviewTitle, saveLabel, onSave, onExit, saving = false }: {
  steps: StepDef[]; review: ReactNode; reviewTitle: string; saveLabel: string;
  /** The save is unresolved: Save shows progress and is disabled. */
  saving?: boolean;
  index: number; onStepChange: (index: number) => void; historyScope: string;
  /** `leave` closes the wizard after a successful save in the editor (all its step entries). */
  onSave: (leave: () => void) => Promise<void>; onExit: () => void;
}) {
  const { t } = useI18n();
  const { toast } = useFeedback();
  const location = useLocation();
  const navigate = useNavigate();
  const state = useMemo(() => location.state && typeof location.state === "object" ? location.state : {}, [location.state]);
  const marker = state.carezaarWizard as { scope?: string; step?: number; depth?: number } | undefined;
  const matching = marker?.scope === historyScope && Number.isSafeInteger(marker.step)
    && marker.step! >= 0 && marker.step! <= steps.length && Number.isSafeInteger(marker.depth) && marker.depth! >= 0;
  const index = matching ? marker.step! : Math.max(0, Math.min(savedIndex, steps.length));
  const depth = matching ? marker.depth! : 0;
  const destination = `${location.pathname}${location.search}${location.hash}`;
  // Each completed step gets an actual browser-history entry. Restored signup
  // choices remain in the existing tab draft; history only records navigation.
  useEffect(() => {
    if (!matching) navigate(destination, { replace: true, state: { ...state,
      carezaarWizard: { scope: historyScope, step: index, depth: 0 } } });
    if (savedIndex !== index) onStepChange(index);
  }, [matching, destination, historyScope, index, savedIndex, onStepChange, navigate, state]);
  const move = (step: number, replace = false) => {
    onStepChange(step);
    navigate(destination, { replace, state: { ...state,
      carezaarWizard: { scope: historyScope, step, depth: replace ? 0 : depth + 1 } } });
    window.scrollTo({ top: 0 });
  };
  const leave = () => {
    const exit = exitPast((window.history.state as { idx?: number } | null)?.idx ?? 0, depth, "/main/matches");
    if ("back" in exit) navigate(-exit.back);
    else navigate(exit.to, { replace: true });
  };
  const total = steps.length + 1;
  const onReview = index === steps.length;
  const current = steps[index];

  const next = () => {
    const problem = current?.problem();
    if (problem) { toast(problem); return; }
    move(index + 1);
  };

  return (
    <Page header={<BackHeader onBack={() => {
      if (index === 0) onExit();
      else if (depth > 0) navigate(-1);
      else move(index - 1, true);
    }} />}
      footer={
        <div className="stack-sm">
          <Button trailingIcon="ic_arrow_forward" loading={onReview && saving} onClick={() => (onReview ? void onSave(leave) : next())}>
            {onReview ? saveLabel : t("signup_form_client_continue", "Continue")}
          </Button>
          <p className="footnote"><Icon name="ic_info_circle" size={18} tint="var(--primary)" />
            {t("signup_form_client_create_account_description", "You can change all of this later.")}</p>
        </div>
      }>
      <Stepper step={index + 1} total={total} label={t("step_wizard_step", "Step").toUpperCase()} />
      <div className="wizard-head">
        <h1>{onReview ? reviewTitle : current.title}</h1>
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
