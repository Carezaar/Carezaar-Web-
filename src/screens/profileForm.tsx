import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGoBack } from "../navigation/back";
import { ApiError } from "../api/errors";
import { userService } from "../api/services";
import { useSession } from "../auth/SessionContext";
import { useBaseData } from "../app/baseData";
import { useFeedback } from "../app/feedback";
import { useI18n } from "../app/i18n";
import { useSignUp } from "../app/signup";
import { BackHeader, Page } from "../ui/layout";
import { Avatar, Button, Dialog, Field, TextArea, TextField } from "../ui/kit";
import { Icon } from "../ui/Icon";
import { PhotoCropper } from "../ui/PhotoCropper";
import { CameraCapture } from "../ui/CameraCapture";

/** "MM/DD/YYYY" (how the API returns date_of_birth) → yyyy-mm-dd for <input type=date>. */
function toInputDate(value: string | null | undefined): string {
  const m = value?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1]}-${m[2]}` : "";
}

function isAdult(iso: string): boolean {
  const dob = new Date(`${iso}T00:00:00`);
  const limit = new Date(); limit.setFullYear(limit.getFullYear() - 18);
  return dob <= limit;
}

/** "Tell us about yourself".
 *
 *  Signup: `users/profile` multipart **without** a session, keyed by email, then on
 *  to the role's preference wizard. Edit (from Profile): same endpoint, signed in,
 *  prefilled from `auth/info`. Photo is optional, as in the Android app. */
export function ProfileFormScreen({ mode }: { mode: "signup" | "edit" }) {
  const navigate = useNavigate();
  const goBack = useGoBack("/main/profile");
  const { t, label } = useI18n();
  const { run, act, toast, messageOf, unavailable } = useFeedback();
  const { items } = useBaseData();
  const { state: signUp, update } = useSignUp();
  const { user, refreshUser } = useSession();
  const genders = items("genders");

  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(mode === "edit" ? user?.photo ?? null : null);
  const [firstName, setFirstName] = useState(mode === "edit" ? user?.first_name ?? "" : "");
  const [lastName, setLastName] = useState(mode === "edit" ? user?.last_name ?? "" : "");
  const [genderId, setGenderId] = useState<number | null>(mode === "edit" ? user?.gender_id ?? null : null);
  const [dob, setDob] = useState(mode === "edit" ? toInputDate(user?.date_of_birth) : "");
  const [bio, setBio] = useState(mode === "edit" ? user?.bio ?? "" : "");
  const [genderOpen, setGenderOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [cameraOpen, setCameraOpen] = useState(false);
  const galleryInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode === "signup" && !signUp.email) navigate("/intro", { replace: true });
  }, [mode, signUp.email, navigate]);

  useEffect(() => {
    if (mode !== "edit") return;
    void run(t("loading_auth_info", "Getting user information"), refreshUser).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh once when the edit screen opens
  }, [mode]);

  useEffect(() => {
    if (mode === "edit" && user) {
      setFirstName(user.first_name ?? ""); setLastName(user.last_name ?? "");
      setGenderId(user.gender_id); setDob(toInputDate(user.date_of_birth)); setBio(user.bio ?? "");
      setPreview((p) => (photo ? p : user.photo));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refill the form only when the user record changes
  }, [user]);

  // A freshly picked photo waits for the square crop, as on Android.
  const [cropping, setCropping] = useState<File | null>(null);
  const pick = (file: File | undefined) => {
    setSourceOpen(false);
    if (!file) return;
    // JPEG, PNG or WebP up to 10 MB; not GIF (agreed with the client, October 2026).
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      toast(t("profile_photo_format", "Choose a JPEG, PNG or WebP photo."));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast(t("profile_photo_size", "Choose a photo smaller than 10 MB."));
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); setCropping(file); };
    image.onerror = () => { URL.revokeObjectURL(url); toast(t("profile_photo_invalid", "This photo couldn't be opened. Choose another image.")); };
    image.src = url;
  };
  const cropped = (file: File) => {
    setCropping(null);
    setPhoto(file);
    setPreview(URL.createObjectURL(file));
  };
  // Release a picked photo's object URL once it is replaced or the screen closes.
  useEffect(() => {
    if (!preview?.startsWith("blob:")) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  const valid = firstName.trim() && lastName.trim() && genderId !== null && dob && isAdult(dob);

  const submit = async () => {
    const next: Record<string, string> = {};
    const req = t("general_required", "This field is required.");
    if (!firstName.trim()) next.first_name = req;
    if (!lastName.trim()) next.last_name = req;
    if (genderId === null) next.gender_id = req;
    if (!dob) next.date_of_birth = req;
    else if (!isAdult(dob)) next.date_of_birth = t("profile_edit_age_requirement", "You must be 18 years or older.");
    setErrors(next);
    if (Object.keys(next).length) return;
    const email = mode === "signup" ? signUp.email : user?.email ?? "";
    // A save without a photo removes the current one, so keep it unless the user removed it.
    let photoToSend = photo;
    if (mode === "edit" && !photo && preview && preview === user?.photo) {
      try {
        photoToSend = await userService.currentPhotoFile(preview);
      } catch {
        toast(t("profile_edit_photo_keep_failed", "Your current photo couldn't be kept. Choose it again or remove it, then save."));
        return;
      }
    }
    try {
      const saved = await act(
        mode === "signup" ? t("loading_auth_register", "Registering") : t("loading_profile_set", "Updating profile"),
        () => userService.setProfile({
          email, genderId, firstName: firstName.trim(), lastName: lastName.trim(),
          bio: bio.trim() || null, dateOfBirth: new Date(`${dob}T00:00:00`), photo: photoToSend,
          anonymous: mode === "signup",
        }),
      );
      if (mode === "signup") {
        update({ userId: saved.id });
        navigate(signUp.role === "client" ? "/onboarding/client" : "/onboarding/caregiver");
      } else {
        await refreshUser();
        goBack();
      }
    } catch (e) {
      // Until 2026-10-01 the server refused every profile update after signup with "The
      // selected Email is invalid." (BE-05). Should it happen again, that message would
      // wrongly tell the user their email is bad, so it is shown as unavailable instead.
      if (mode === "edit" && e instanceof ApiError && (e.isServiceFault || /email/i.test(e.message) && !e.fieldError("first_name"))) {
        toast(unavailable(t("profile_edit_title", "Edit profile")));
      } else if (e instanceof ApiError && e.kind === "validation") {
        setErrors(Object.fromEntries(Object.entries(e.fields).map(([k, v]) => [k, v[0]])));
      } else toast(messageOf(e));
    }
  };

  const gender = genders.find((g) => g.id === genderId);
  return (
    <Page header={<BackHeader />} footer={
      <Button trailingIcon="ic_arrow_forward" disabled={!valid} onClick={() => void submit()}>
        {mode === "signup" ? t("general_continue", "Continue") : t("profile_save", "Save")}
      </Button>
    }>
      <div className="stack">
        <div>
          <h2 className="title">{t("signup_form_client_tell_us_about_yourself", "Tell us about yourself")}</h2>
          <p className="muted">{t("signup_form_client_about_yourself_description", "This helps us match you with the right caregiver.")}</p>
        </div>
        <Field label={t("profile_edit_profile_picture", "Profile Picture (optional)")}>
          <div className="photo-row">
            {preview ? <Avatar src={preview} size={120} /> : (
              <span className="photo-placeholder"><Icon name="ic_camera" size={48} tint="var(--text-secondary)" /></span>
            )}
            <div className="stack-sm">
              <strong>{t("profile_edit_upload_profile_picture", "Upload a profile picture")}</strong>
              <span className="muted small">{t("profile_edit_profile_picture_description", "This helps caregivers get to know you.")}</span>
              {preview ? (
                <Button variant="danger" icon="ic_clear" onClick={() => { setPhoto(null); setPreview(null); }}>
                  {t("profile_edit_remove_photo", "Remove Photo")}
                </Button>
              ) : (
                <Button variant="outline" icon="ic_upload" onClick={() => setSourceOpen(true)}>
                  {t("profile_edit_upload_photo", "Upload Photo")}
                </Button>
              )}
            </div>
          </div>
        </Field>
        <input ref={galleryInput} type="file" accept="image/jpeg,image/png,image/webp" hidden
          onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
        {cameraOpen && <CameraCapture onDone={(file) => { setCameraOpen(false); pick(file); }} onCancel={() => setCameraOpen(false)} />}
        {cropping && <PhotoCropper file={cropping} onDone={cropped} onCancel={() => setCropping(null)} />}
        <div className="grid-2">
          <TextField label={t("profile_edit_first_name", "First name")} required autoComplete="given-name"
            value={firstName} onChange={(e) => setFirstName(e.target.value)} error={errors.first_name}
            placeholder={t("profile_edit_enter_first_name", "Enter your first name")} />
          <TextField label={t("profile_edit_last_name", "Last name")} required autoComplete="family-name"
            value={lastName} onChange={(e) => setLastName(e.target.value)} error={errors.last_name}
            placeholder={t("profile_edit_enter_last_name", "Enter your last name")} />
        </div>
        <div className="grid-2">
          <Field label={t("profile_edit_gender", "What is your gender?")} required error={errors.gender_id}
            icon={gender?.icon ?? undefined}>
            <button type="button" className="select-button" onClick={() => setGenderOpen(true)}>
              <span className={gender ? "" : "placeholder"}>{gender ? label(gender) : t("profile_edit_gender_placeholder", "Select your gender")}</span>
              <Icon name="ic_chevron_down" size={20} tint="var(--text-secondary)" />
            </button>
          </Field>
          <Field label={t("profile_edit_date_of_birth", "Date of birth")} required icon="ic_calendar"
            // Continue stays disabled for an underage date, so say why straight away.
            error={errors.date_of_birth ?? (dob && !isAdult(dob) ? t("profile_edit_age_requirement", "You must be 18 years or older.") : undefined)}
            hint={<span title={t("profile_edit_age_requirement", "You must be 18 years or older.")}>
              <Icon name="ic_info_circle" size={20} tint="var(--primary)" /></span>}>
            <input type="date" aria-label={t("profile_edit_date_of_birth", "Date of birth")} value={dob}
              max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDob(e.target.value)} />
          </Field>
        </div>
        <TextArea label={t("profile_edit_bio", "Bio (optional)")} value={bio} onChange={(e) => setBio(e.target.value)}
          placeholder={t("profile_edit_bio_placeholder", "Tell us a little about yourself.")} />
      </div>

      <Dialog open={sourceOpen} onClose={() => setSourceOpen(false)} title={t("profile_edit_upload_photo", "Upload Photo")} labelledBy="photo-source-title">
        <div className="source-picker">
          <button type="button" onClick={() => { setSourceOpen(false); setCameraOpen(true); }}>
            <Icon name="ic_camera" size={34} tint="#fff" /><span>{t("general_camera", "Camera")}</span>
          </button>
          <button type="button" onClick={() => galleryInput.current?.click()}>
            <Icon name="ic_gallery" size={34} tint="#fff" /><span>{t("general_gallery", "Gallery")}</span>
          </button>
        </div>
      </Dialog>
      <Dialog open={genderOpen} onClose={() => setGenderOpen(false)} title={t("profile_edit_gender", "What is your gender?")} labelledBy="gender-title">
        <div className="stack-sm">
          {genders.map((g) => (
            <button key={g.id} type="button" className={`option-row ${g.id === genderId ? "on" : ""}`}
              onClick={() => { setGenderId(g.id); setGenderOpen(false); }}>
              <Icon name={g.icon} size={26} tint="var(--text)" /><span>{label(g)}</span>
            </button>
          ))}
        </div>
      </Dialog>
    </Page>
  );
}
