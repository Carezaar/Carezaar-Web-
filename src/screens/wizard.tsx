import { Suspense, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGoBack } from "../navigation/back";
import { ApiError } from "../api/errors";
import { caregiverService, clientService, type BaseTable } from "../api/services";
import { useSession } from "../auth/SessionContext";
import { useBaseData } from "../app/baseData";
import { useFeedback } from "../app/feedback";
import { useI18n } from "../app/i18n";
import { useSignUp } from "../app/signup";
import { lazyWithReload } from "../app/recovery";
import { requestNotificationPermission } from "../app/notifications";
import { Spinner } from "../ui/kit";
import type { LatLng } from "./LocationPicker";
import { type StepDef, Section, MultiSelect, SingleSelect, CareTypeCards, SalaryRange, LocationField, ReviewRow, WizardIntro, Wizard, ReviewCard } from "./wizardParts";

// Leaflet (~150 kB) loads only when the user opens the map.
const LocationPicker = lazyWithReload(() => import("./LocationPicker").then((m) => ({ default: m.LocationPicker })));

type Mode = "signup" | "edit";

/* ------------------------------------------------------------ primitives */

export function ClientPreferencesWizard({ mode }: { mode: Mode }) {
  const navigate = useNavigate();
  const goBack = useGoBack("/main/matches");
  const { t, label } = useI18n();
  const { items, find } = useBaseData();
  const { run, act, toast, messageOf } = useFeedback();
  const { state: signUp, reset, update } = useSignUp();
  const { signIn } = useSession();

  const [started, setStarted] = useState(mode === "edit");
  const [picking, setPicking] = useState(false);
  const [clienttype, setClienttype] = useState<number[]>([]);
  const [conditions, setConditions] = useState<number[]>([]);
  const [specials, setSpecials] = useState<number[]>([]);
  const [experiences, setExperiences] = useState<number[]>([]);
  const [roles, setRoles] = useState<number[]>([]);
  const [certifications, setCertifications] = useState<number[]>([]);
  const [languages, setLanguages] = useState<number[]>([]);
  const [location, setLocation] = useState<LatLng | null>(null);
  const [commutes, setCommutes] = useState<number[]>([]);
  const [shifts, setShifts] = useState<number[]>([]);
  const [days, setDays] = useState<number[]>([]);
  const [worktypes, setWorktypes] = useState<number[]>([]);
  const [genders, setGenders] = useState<number[]>([]);
  const [salaryMin, setSalaryMin] = useState<number | null>(null);
  const [salaryMax, setSalaryMax] = useState<number | null>(null);

  useEffect(() => {
    if (mode === "signup" && !signUp.userId) navigate("/intro", { replace: true });
  }, [mode, signUp.userId, navigate]);

  useEffect(() => {
    if (mode !== "edit") return;
    run(t("loading_profile_get", "Getting profile"), () => clientService.profile())
      .then((p) => {
        setClienttype([p.clienttype_id]); setConditions(p.carecondition_ids); setSpecials(p.carespecial_ids);
        setExperiences(p.experience_ids); setRoles(p.role_ids); setCertifications(p.certification_ids);
        setLanguages(p.languageskill_ids); setLocation({ lat: p.lat, lng: p.lng }); setCommutes(p.commute_ids);
        setShifts(p.shift_ids); setDays(p.careday_ids); setWorktypes(p.worktype_ids); setGenders(p.gender_ids);
        setSalaryMin(p.salary_min); setSalaryMax(p.salary_max);
      })
      .catch((e) => toast(messageOf(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load the saved preferences once; the setters are stable
  }, [mode]);

  const need = (value: unknown[], property: string) =>
    value.length ? null : t("general_select_one", `You must select at least one item in the "{PROPERTY}" section.`)
      .replace("{PROPERTY}", property);

  const hint = t("signup_form_client_select_all_that_apply", "Select all that apply");
  const steps: StepDef[] = [
    {
      title: t("signup_form_client_select_care_type", "Select your care type"),
      description: t("signup_form_client_select_care_type_description", "Tell us what kind of care you are looking for"),
      body: <CareTypeCards items={items("clienttypes")} value={clienttype} onToggle={(id) => setClienttype([id])} />,
      problem: () => need(clienttype, t("client_details_client_type", "Client Type")),
    },
    {
      title: t("signup_form_client_tell_us_about_needs", "Tell us about your needs"),
      description: t("signup_form_client_needs_description", "This helps us find the right match you with right caregivers."),
      body: <>
        <Section title={t("signup_form_client_services", "What services do you need?")} hint={hint}>
          <MultiSelect items={items("careconditions")} value={conditions} onChange={setConditions} withIcons tiles /></Section>
        <Section title={t("signup_form_client_caregiver_qualities", "What qualities are important in a caregiver?")} hint={hint}>
          <MultiSelect items={items("carespecials")} value={specials} onChange={setSpecials} withIcons /></Section>
        <Section title={t("signup_form_client_preferred_language", "Preferred Language")} hint={hint}>
          <MultiSelect items={items("languageskills")} value={languages} onChange={setLanguages} withIcons /></Section>
        <Section title={t("signup_form_client_minimum_experience", "Minimum Experience")} hint={hint}>
          <MultiSelect items={items("experiences")} value={experiences} onChange={setExperiences} /></Section>
        <Section title={t("signup_form_client_preferred_caregiver_role", "Preferred Caregiver Role")} hint={hint}>
          <MultiSelect items={items("roles")} value={roles} onChange={setRoles} /></Section>
        <Section title={t("signup_form_client_required_certifications", "Required Certifications")} hint={hint}>
          <MultiSelect items={items("certifications")} value={certifications} onChange={setCertifications} /></Section>
      </>,
      problem: () => need(conditions, t("signup_form_client_services", "What services do you need?"))
        ?? need(specials, t("signup_form_client_caregiver_qualities", "What qualities are important in a caregiver?"))
        ?? need(experiences, t("signup_form_client_minimum_experience", "Minimum Experience"))
        ?? need(roles, t("signup_form_client_preferred_caregiver_role", "Preferred Caregiver Role"))
        // Certifications are optional, as in the native app (and for caregivers).
        ?? need(languages, t("signup_form_client_preferred_language", "Preferred Language")),
    },
    {
      title: t("signup_form_client_schedule_preferences", "Your schedule & preferences"),
      description: t("signup_form_client_schedule_preferences_description", "Tell us when and where you need care and how much your expected pay rate is."),
      body: <>
        <LocationField value={location} onPick={() => setPicking(true)} />
        <Section title={t("signup_form_client_max_commute", "Max Commute")} hint={hint}>
          <MultiSelect items={items("commutes")} value={commutes} onChange={setCommutes} /></Section>
        <Section title={t("signup_form_client_preferred_shifts", "Preferred Shifts")} hint={hint}>
          <MultiSelect items={items("shifts")} value={shifts} onChange={setShifts} withIcons /></Section>
        <Section title={t("signup_form_client_care_days", "Care Days")} hint={hint}>
          <MultiSelect items={items("caredays")} value={days} onChange={setDays} /></Section>
        <Section title={t("signup_form_client_work_type", "Work Type")} hint={hint}>
          <MultiSelect items={items("worktypes")} value={worktypes} onChange={setWorktypes} /></Section>
        <Section title={t("signup_form_client_gender_preference", "What is your preferred caregiver gender?")} hint={hint}>
          <MultiSelect items={items("genders")} value={genders} onChange={setGenders} withIcons /></Section>
        <SalaryRange title={t("signup_form_client_pay_rate", "Pay Rate")} unit={t("signup_form_client_usd_per_hour", "USD per hour")}
          min={salaryMin} max={salaryMax} onMin={setSalaryMin} onMax={setSalaryMax} />
      </>,
      problem: () => (location ? null : t("signup_form_client_location_hint", "Tap to select location from map or your current location"))
        ?? need(commutes, t("signup_form_client_max_commute", "Max Commute"))
        ?? need(shifts, t("signup_form_client_preferred_shifts", "Preferred Shifts"))
        ?? need(days, t("signup_form_client_care_days", "Care Days"))
        ?? need(worktypes, t("signup_form_client_work_type", "Work Type"))
        ?? need(genders, t("signup_form_client_gender_preference", "What is your preferred caregiver gender?"))
        ?? (salaryMin !== null && salaryMax !== null && salaryMin > salaryMax
          ? `${t("signup_form_client_minimum", "Minimum")} > ${t("signup_form_client_maximum", "Maximum")}` : null),
    },
  ];

  const labels = (table: BaseTable, ids: number[]) => ids.map((id) => label(find(table, id))).filter(Boolean);
  const review = (
    <ReviewCard title={t("signup_form_client_review", "Review Your Preferences")}
      description={t("signup_form_client_review_description", "Review your preferences below. You can change these anytime later.")}>
      <ReviewRow title={t("client_details_client_type", "Client Type")} values={labels("clienttypes", clienttype)} />
      <ReviewRow title={t("signup_form_client_services", "What services do you need?")} values={labels("careconditions", conditions)} />
      <ReviewRow title={t("signup_form_client_caregiver_qualities", "Qualities")} values={labels("carespecials", specials)} />
      <ReviewRow title={t("signup_form_client_minimum_experience", "Minimum Experience")} values={labels("experiences", experiences)} />
      <ReviewRow title={t("signup_form_client_preferred_caregiver_role", "Preferred Caregiver Role")} values={labels("roles", roles)} />
      <ReviewRow title={t("signup_form_client_required_certifications", "Required Certifications")} values={labels("certifications", certifications)} />
      <ReviewRow title={t("signup_form_client_preferred_language", "Preferred Language")} values={labels("languageskills", languages)} />
      <ReviewRow title={t("signup_form_client_location", "Location")} values={location ? [`${location.lat.toFixed(6)} , ${location.lng.toFixed(6)}`] : []} />
      <ReviewRow title={t("signup_form_client_max_commute", "Max Commute")} values={labels("commutes", commutes)} />
      <ReviewRow title={t("signup_form_client_preferred_shifts", "Preferred Shifts")} values={labels("shifts", shifts)} />
      <ReviewRow title={t("signup_form_client_care_days", "Care Days")} values={labels("caredays", days)} />
      <ReviewRow title={t("signup_form_client_work_type", "Work Type")} values={labels("worktypes", worktypes)} />
      <ReviewRow title={t("signup_form_client_gender_preference", "Preferred caregiver gender")} values={labels("genders", genders)} />
      <ReviewRow title={`${t("signup_form_client_pay_rate", "Pay Rate")} (${t("signup_form_client_usd_per_hour", "USD per hour")})`}
        values={[`${t("signup_form_client_minimum", "Minimum")}: $${salaryMin ?? "—"}`, `${t("signup_form_client_maximum", "Maximum")}: $${salaryMax ?? "—"}`]} />
    </ReviewCard>
  );

  const save = async () => {
    // Inside the Save click, where browsers allow the permission prompt.
    if (mode === "signup") requestNotificationPermission();
    const prefs = {
      clienttypeId: clienttype[0], lat: location!.lat, lng: location!.lng, salaryMin, salaryMax,
      careconditionIds: conditions, caredayIds: days, carespecialIds: specials, certificationIds: certifications,
      commuteIds: commutes, experienceIds: experiences, genderIds: genders, languageskillIds: languages,
      roleIds: roles, shiftIds: shifts, worktypeIds: worktypes,
    };
    try {
      if (mode === "signup") {
        if (!signUp.entityCreated) {
          await act(t("loading_client_signup", "Signing up care needer"), () => clientService.create(signUp.userId!, prefs));
          update({ entityCreated: true });
        }
        // Signing in moves the user into the app (the signed-out route guard redirects).
        await act(t("loading_auth_login", "Signing in"), () => signIn(signUp.email, signUp.password));
        reset();
      } else {
        await act(t("loading_profile_set", "Updating profile"), () => clientService.updateProfile(prefs));
        goBack();
      }
    } catch (e) {
      toast(e instanceof ApiError && e.kind === "validation" ? Object.values(e.fields).flat()[0] ?? e.message : messageOf(e));
    }
  };

  if (!started) return <WizardIntro onStart={() => setStarted(true)} />;
  // The map opens over the wizard; unmounting the wizard would lose the current step.
  return (
    <>
      <Wizard steps={steps} review={review} reviewTitle={t("signup_form_client_review", "Review Your Preferences")}
        saveLabel={mode === "signup" ? t("general_save", "Save") : t("profile_save", "Save")}
        onSave={save} onExit={() => (mode === "signup" ? setStarted(false) : goBack())} />
      {picking && <Suspense fallback={<Spinner />}><LocationPicker initial={location} onCancel={() => setPicking(false)}
        onConfirm={(p) => { setLocation(p); setPicking(false); }} /></Suspense>}
    </>
  );
}

/* --------------------------------------------------------------- caregiver */

export function CaregiverSkillsWizard({ mode }: { mode: Mode }) {
  const navigate = useNavigate();
  const goBack = useGoBack("/main/matches");
  const { t, label } = useI18n();
  const { items, find } = useBaseData();
  const { run, act, toast, messageOf } = useFeedback();
  const { state: signUp, reset, update } = useSignUp();
  const { signIn } = useSession();

  const [started, setStarted] = useState(mode === "edit");
  const [picking, setPicking] = useState(false);
  const [clienttypes, setClienttypes] = useState<number[]>([]);
  const [conditions, setConditions] = useState<number[]>([]);
  const [specials, setSpecials] = useState<number[]>([]);
  const [experience, setExperience] = useState<number | null>(null);
  const [role, setRole] = useState<number | null>(null);
  const [certifications, setCertifications] = useState<number[]>([]);
  const [languages, setLanguages] = useState<number[]>([]);
  const [location, setLocation] = useState<LatLng | null>(null);
  const [commute, setCommute] = useState<number | null>(null);
  const [shifts, setShifts] = useState<number[]>([]);
  const [days, setDays] = useState<number[]>([]);
  const [worktype, setWorktype] = useState<number | null>(null);
  const [salaryMin, setSalaryMin] = useState<number | null>(null);
  const [salaryMax, setSalaryMax] = useState<number | null>(null);

  useEffect(() => {
    if (mode === "signup" && !signUp.userId) navigate("/intro", { replace: true });
  }, [mode, signUp.userId, navigate]);

  useEffect(() => {
    if (mode !== "edit") return;
    run(t("loading_profile_get", "Getting profile"), () => caregiverService.profile())
      .then((p) => {
        setClienttypes(p.clienttype_ids); setConditions(p.carecondition_ids); setSpecials(p.carespecial_ids);
        setExperience(p.experience_id); setRole(p.role_id); setCertifications(p.certification_ids);
        setLanguages(p.languageskill_ids); setLocation({ lat: p.lat, lng: p.lng }); setCommute(p.commute_id);
        setShifts(p.shift_ids); setDays(p.careday_ids); setWorktype(p.worktype_id);
        setSalaryMin(p.salary_min); setSalaryMax(p.salary_max);
      })
      .catch((e) => toast(messageOf(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load the saved preferences once; the setters are stable
  }, [mode]);

  const need = (ok: boolean, property: string) =>
    ok ? null : t("general_select_one", `You must select at least one item in the "{PROPERTY}" section.`)
      .replace("{PROPERTY}", property);
  const hint = t("signup_form_caregiver_multiple_hint", "Select all that apply");

  const steps: StepDef[] = [
    {
      title: t("signup_form_caregiver_supported_client_types_title", "Which Client Types Do You Support?"),
      description: t("signup_form_caregiver_supported_client_types_description", "Select the types of clients you provide care services to."),
      body: <CareTypeCards items={items("clienttypes")} value={clienttypes}
        onToggle={(id) => setClienttypes((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]))} />,
      problem: () => need(clienttypes.length > 0, t("caregiver_details_supported_care_needer_types", "Supported Care Needer Types")),
    },
    {
      title: t("signup_form_caregiver_skill_title", "Tell us about your skills"),
      description: t("signup_form_caregiver_skill_description", "This helps us match you with the right people who need your specialties."),
      body: <>
        <Section title={t("signup_form_caregiver_carecondition", "What services can you provide?")} hint={hint}>
          <MultiSelect items={items("careconditions")} value={conditions} onChange={setConditions} withIcons tiles /></Section>
        <Section title={t("signup_form_caregiver_carespecial", "What qualities describe you best?")} hint={hint}>
          <MultiSelect items={items("carespecials")} value={specials} onChange={setSpecials} withIcons /></Section>
        <Section title={t("signup_form_caregiver_experience", "Years of caregiving experience")}>
          <SingleSelect items={items("experiences")} value={experience} onChange={setExperience} /></Section>
        <Section title={t("signup_form_caregiver_role", "Preferred caregiver role")}>
          <SingleSelect items={items("roles")} value={role} onChange={setRole} /></Section>
        <Section title={t("signup_form_caregiver_languageskill", "Languages you speak")} hint={hint}>
          <MultiSelect items={items("languageskills")} value={languages} onChange={setLanguages} withIcons /></Section>
        <Section title={t("signup_form_caregiver_certification", "Certifications")} hint={hint}>
          <MultiSelect items={items("certifications")} value={certifications} onChange={setCertifications} /></Section>
      </>,
      problem: () => need(conditions.length > 0, t("signup_form_caregiver_carecondition", "What services can you provide?"))
        ?? need(specials.length > 0, t("signup_form_caregiver_carespecial", "What qualities describe you best?"))
        ?? need(experience !== null, t("signup_form_caregiver_experience", "Years of caregiving experience"))
        ?? need(role !== null, t("signup_form_caregiver_role", "Preferred caregiver role"))
        ?? need(languages.length > 0, t("signup_form_caregiver_languageskill", "Languages you speak")),
    },
    {
      title: t("signup_form_caregiver_schedule_title", "Your schedule & preferences"),
      description: t("signup_form_caregiver_schedule_description", "Tell us when and where you are available."),
      body: <>
        <LocationField value={location} onPick={() => setPicking(true)} />
        <Section title={t("signup_form_caregiver_commute", "Max Commute")}>
          <SingleSelect items={items("commutes")} value={commute} onChange={setCommute} /></Section>
        <Section title={t("signup_form_caregiver_shift", "Preferred Shifts")} hint={hint}>
          <MultiSelect items={items("shifts")} value={shifts} onChange={setShifts} withIcons /></Section>
        <Section title={t("signup_form_caregiver_careday", "Days Available")} hint={hint}>
          <MultiSelect items={items("caredays")} value={days} onChange={setDays} /></Section>
        <Section title={t("signup_form_caregiver_worktype", "Work Types")}>
          <SingleSelect items={items("worktypes")} value={worktype} onChange={setWorktype} /></Section>
        <SalaryRange title={t("signup_form_caregiver_salary", "Expected Pay Rate")} unit={t("signup_form_caregiver_unit", "USD per hour")}
          min={salaryMin} max={salaryMax} onMin={setSalaryMin} onMax={setSalaryMax} />
      </>,
      problem: () => (location ? null : t("signup_form_client_location_hint", "Tap to select location from map or your current location"))
        ?? need(commute !== null, t("signup_form_caregiver_commute", "Max Commute"))
        ?? need(shifts.length > 0, t("signup_form_caregiver_shift", "Preferred Shifts"))
        ?? need(days.length > 0, t("signup_form_caregiver_careday", "Days Available"))
        ?? need(worktype !== null, t("signup_form_caregiver_worktype", "Work Types"))
        // The caregiver endpoint requires both bounds as non-null integers.
        ?? (salaryMin === null || salaryMax === null ? t("general_required", "This field is required.")
          : salaryMin > salaryMax ? `${t("signup_form_caregiver_salary_min", "Minimum")} > ${t("signup_form_caregiver_salary_max", "Maximum")}` : null),
    },
  ];

  const labels = (table: BaseTable, ids: (number | null)[]) =>
    ids.filter((x): x is number => x !== null).map((id) => label(find(table, id))).filter(Boolean);
  const review = (
    <ReviewCard title={t("signup_form_caregiver_review_title", "Review your skills and availability")}
      description={t("signup_form_caregiver_review_description", "Review your selections below. You can change them anytime later.")}>
      <ReviewRow title={t("caregiver_details_supported_care_needer_types", "Supported Care Needer Types")} values={labels("clienttypes", clienttypes)} />
      <ReviewRow title={t("caregiver_details_provided_care_types", "Provided Care Types")} values={labels("careconditions", conditions)} />
      <ReviewRow title={t("caregiver_details_special_qualities", "Special Qualities")} values={labels("carespecials", specials)} />
      <ReviewRow title={t("caregiver_details_experience", "Experience")} values={labels("experiences", [experience])} />
      <ReviewRow title={t("caregiver_details_role", "Role")} values={labels("roles", [role])} />
      <ReviewRow title={t("caregiver_details_certifications", "Certifications")} values={labels("certifications", certifications)} />
      <ReviewRow title={t("caregiver_details_spoken_languages", "Spoken Languages")} values={labels("languageskills", languages)} />
      <ReviewRow title={t("caregiver_details_location", "Location")} values={location ? [`${location.lat.toFixed(6)} , ${location.lng.toFixed(6)}`] : []} />
      <ReviewRow title={t("caregiver_details_maximum_commute_distance", "Maximum Commute Distance")} values={labels("commutes", [commute])} />
      <ReviewRow title={t("caregiver_details_preferred_shifts", "Preferred Shifts")} values={labels("shifts", shifts)} />
      <ReviewRow title={t("caregiver_details_selected_work_days", "Selected Work Days")} values={labels("caredays", days)} />
      <ReviewRow title={t("caregiver_details_work_type", "Work Type")} values={labels("worktypes", [worktype])} />
      <ReviewRow title={`${t("caregiver_details_pay_rate", "Pay Rate")} (${t("caregiver_details_usd_per_hour", "USD per hour")})`}
        values={[`$${salaryMin ?? "—"} - $${salaryMax ?? "—"}`]} />
    </ReviewCard>
  );

  const save = async () => {
    // Inside the Save click, where browsers allow the permission prompt.
    if (mode === "signup") requestNotificationPermission();
    const skills = {
      commuteId: commute!, experienceId: experience!, roleId: role!, worktypeId: worktype!,
      lat: location!.lat, lng: location!.lng, salaryMin: salaryMin!, salaryMax: salaryMax!,
      careconditionIds: conditions, caredayIds: days, carespecialIds: specials, certificationIds: certifications,
      clienttypeIds: clienttypes, languageskillIds: languages, shiftIds: shifts,
    };
    try {
      if (mode === "signup") {
        if (!signUp.entityCreated) {
          await act(t("loading_caregiver_signup", "Signing up caregiver"), () => caregiverService.create(signUp.userId!, skills));
          update({ entityCreated: true });
        }
        // Signing in moves the user into the app (the signed-out route guard redirects).
        await act(t("loading_auth_login", "Signing in"), () => signIn(signUp.email, signUp.password));
        reset();
      } else {
        await act(t("loading_profile_set", "Updating profile"), () => caregiverService.updateProfile(skills));
        goBack();
      }
    } catch (e) {
      toast(e instanceof ApiError && e.kind === "validation" ? Object.values(e.fields).flat()[0] ?? e.message : messageOf(e));
    }
  };

  if (!started) return <WizardIntro caregiver onStart={() => setStarted(true)}
    title={t("signup_form_caregiver_match_title", "Find Your Ideal Matches")}
    description={t("signup_form_caregiver_match_description", "")} />;
  return (
    <>
      <Wizard steps={steps} review={review}
        reviewTitle={t("signup_form_caregiver_review_title", "Review your skills and availability")}
        saveLabel={t("general_save", "Save")}
        onSave={save} onExit={() => (mode === "signup" ? setStarted(false) : goBack())} />
      {picking && <Suspense fallback={<Spinner />}><LocationPicker initial={location} onCancel={() => setPicking(false)}
        onConfirm={(p) => { setLocation(p); setPicking(false); }} /></Suspense>}
    </>
  );
}
