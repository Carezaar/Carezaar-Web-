# Figma scenes: export pipeline and layer-name dependencies

Five phone screens are drawn directly from the Figma design, not built by hand:

| Scene file (`public/scenes/`) | Figma frame | Screen | Used in |
|---|---|---|---|
| `v2-195-11749.json` | 195:11749 | Splash | `screens/auth.tsx` → `SplashScreen` |
| `v2-16-14997.json` | 16:14997 | Intro (role choice) | `screens/auth.tsx` → `IntroScene` |
| `v2-51-5170.json` | 51:5170 | Sign In | `screens/auth.tsx` → `SignInScene` |
| `v2-56-84378.json` | 56:84378 | Create Account (+ "Are you sure?" dialog) | `screens/auth.tsx` → `SignUpScene` |
| `v2-65-19934.json` | 65:19934 | Preferences / skills intro | `screens/wizardParts.tsx` → `WizardIntro` |

All five come from the Figma file `anRcqIByBhNlGiSd0h8GWy`, page **"v2 (New)"**, as 412 × 892 frames. They're used below 768 px only. From 768 px up, Intro, Sign In and Create Account are the native web forms in `screens/authCards.tsx`, and those don't use scene files.

At runtime:

```
public/scenes/<key>.json ──fetch──▶ FigmaScreen ──▶ DesignElement (+ SourceText, SourceImage, SourceVector…) ──▶ DOM
                                        ▲
                                   SceneBinder (per screen): live values, clicks, visibility, translations
```

`FigmaScreen` scales the frame to the container width, up to a maximum of 480 px. The screen's **binder** (`figma/binder.ts`) connects nodes to React state:
- `binding` binds inputs;
- `handle` handles clicks;
- `isHidden` controls visibility;
- `text` replaces copy, for translations;
- `isEnabled` / `opacity` show the enabled state;
- `inputType` drives the password reveal.

Controls that the frame doesn't contain are placed over it at frame coordinates with `overlays`: eye toggles, Forgot Password, the language menu, and the licence checkbox.

---

## 1. Export pipeline

### What it does

1. **Copy from Figma.** In a browser, open the file, go to the "v2 (New)" page, select the frames, and press Copy. Figma puts the frames on the clipboard as HTML that contains its binary scene format.
2. **Save the clipboard.** Save the HTML clipboard flavour to `v2-clipboard.html`. The original run used a small macOS script, `read-clipboard.swift`, to dump every clipboard type; any tool that saves `public.html` works.
3. **Resolve the scene tree** with `resolve.mjs`. It decodes the clipboard payload with the npm package [`fig-kiwi`](https://www.npmjs.com/package/fig-kiwi), which uses [`kiwi-schema`](https://github.com/evanw/kiwi) (MIT). It then:
   - builds the node tree for every **412-wide top-level frame**;
   - applies component instances and overrides, styles and colour variables;
   - decodes vector and glyph geometry into SVG path strings.

   It writes one `resolved/<page>-<session>-<local>.json` per frame, plus the target states of "swap state" prototype links.
4. **Collect images** with `used-assets.mjs` and `assets.mjs`. These list the image hashes that the frames use. They get signed download URLs from Figma's image batch endpoint, which must be called from a **logged-in Figma browser tab**, and download the files.
5. **Build the app scenes** with `prepare-apps.py`. It converts each resolved tree into the compact scene format read by `src/design/types.ts`:
   - geometry, fills, strokes, effects and text with its font metrics;
   - vector paths;
   - **the input type**, worked out from placeholder text inside field groups (see §2);
   - **`actionTarget` / `stateTarget`**, taken from on-click prototype links.

   It writes `public/scenes/<key>.json` and copies images to `public/assets/<sha1>.png|jpg`.

### Verified

On 2026-09-30, steps 3 and 5 were re-run from the saved v2 clipboard. All five committed scene files came out **identical** to the ones in `public/scenes/`, so the pipeline and its output are consistent.

### Where the tools are

The scripts live in the delivery workspace (`work/fig-tools/` and `work/prepare-apps.py`) and **aren't committed here**. Two reasons:
- the decoder (`fig-kiwi`) and a vector-path helper that `resolve.mjs` uses were published without a licence;
- the scripts have workspace paths hard-coded.

They can be handed over as a separate package, or rewritten against a licensed decoder, if the team wants to regenerate scenes in-house.

### Regenerating a scene after a Figma change

1. Copy the changed frame(s) from Figma and save the clipboard HTML (steps 1–2).
2. Run the resolve step, then the image step if new images were added. Then run the build step (steps 3–5).
3. Copy only the scene file(s) you need into `public/scenes/`, plus any new `public/assets/<hash>` images. The build step also emits every other frame and a catalogue, and the app doesn't need those.
4. **Check the dependencies in §2.** Compare the layer names, node IDs and texts listed there with the new file, for example with `grep '"name":"Button"' public/scenes/v2-51-5170.json`.
5. **Check the overlay positions.** The overlays in `screens/auth.tsx` and `screens/wizardParts.tsx` are placed at frame coordinates. If the layout moved, update their `x`/`y`.
6. **Run the app below 768 px, and the test suites.** Tap every control on the regenerated screen: fields, eye toggles, buttons, links and the language menu.

### Limitations

- Image downloads need a signed-in Figma session. The other steps run offline from the saved clipboard.
- Scene coordinates are absolute, in 412-wide frames. Responsiveness comes from scaling, not from Figma auto-layout.
- The input type is inferred from placeholder text (see §2). A field whose placeholder lacks those words becomes a plain text input.

---

## 2. Layer names, IDs and texts the code relies on

Renaming one of these in Figma, then regenerating the scene, **silently breaks** the behaviour listed. Update the code in the same change, or keep the name.

### Layer names

| Layer name | Scene(s) | Purpose | Where in code | If renamed | Required |
|---|---|---|---|---|---|
| `Button` | Sign In, Create Account, Preferences intro | The primary action (Sign In, Continue, Get started). In Create Account it's also the dialog's Edit and Confirm buttons, told apart by their text. | `auth.tsx` (`SignInScene`, `SignUpScene` binders), `wizardParts.tsx` (`WizardIntro`), `DesignElement.tsx` (makes the node a real `<button>`) | The button stops being clickable, and submit and enable/disable stop working | Yes |
| `Back` | Sign In, Create Account, Preferences intro | Back arrow | Same binders; `DesignElement.tsx` | Back stops working | Yes |
| `Header` | Sign In, Create Account, Preferences intro | Header group; clicking it goes back | Same binders | Back via the header stops working | Yes |
| `Info` | Create Account | Country info icon → shows the country hint | `SignUpScene` | The hint no longer opens | Optional |
| `Error` | Create Account | Error line under the password | `SignUpScene` (hidden until there's an error, then shows it) | Validation messages stop appearing | Yes |
| `Credentials` | Create Account | Static "Country / Email" lines in the dialog, replaced by live values | `SignUpScene` (hidden) | Static placeholder text shows in the dialog | Yes |
| `Dialog`, `Rectangle 2931` | Create Account | The "Are you sure?" dialog and its scrim | `SignUpScene` (hidden until Continue) | The dialog shows permanently, or never | Yes |
| `United States` | Create Account | Country value, replaced by the selected country | `SignUpScene` | The country always reads "United States" | Yes |
| `Lanuage` (sic) | Intro | The frame's own language pill, hidden and replaced by a working one | `IntroScene` | Two language pills appear | Yes |
| `Group 1` | Intro | The frame's "Sign in" group, hidden and replaced by a real link | `IntroScene` | Duplicate Sign in link | Yes |
| `Title`, `Description` | Preferences intro | Text replaced for the caregiver variant | `WizardIntro` | The caregiver sees the client copy | Yes |
| `Care Needer`, `Caregiver` | Intro | Role cards made into buttons | `DesignElement.tsx` | The cards aren't buttons (Intro falls back to text matching) | Yes |
| names starting `Care Type`, `Option`, `Checkbox` | none of the current five | Renderer convention: makes such nodes selectable tiles | `DesignElement.tsx` | No effect today; only matters if a future scene uses them | No (not in current scenes) |
| `Text Field`, `Input Field`, `Base-Input Field`, `Input` | All forms | Field groups. The exporter looks inside them for the placeholder that becomes an input. | Export step (`prepare-apps.py`) | The field becomes static text, not an input | Yes |
| `Label`, `Text`, `Required`, `Hint text`, `Error` (inside a field group) | All forms | Excluded when choosing the placeholder | Export step | The wrong text becomes the input | Yes |

### Node IDs

| Node ID | Scene | Purpose | If it changes |
|---|---|---|---|
| `56:84399` | Create Account | The frame's static password-rule chips, hidden and replaced by live chips | Static chips show under the live ones |
| `101:11969`, `101:11970`, `101:11971` | Preferences intro | Client illustration, hidden for caregivers, who get their own image | Caregivers see the client illustration |

### Exact texts

| Text | Scene | Purpose |
|---|---|---|
| Placeholders containing `password` / `email` | Sign In, Create Account | Decide the input type (`password`, `email`) when exporting |
| Placeholders containing `enter`, `confirm`, `type`, `your`, `search` | All forms | Mark the text as a placeholder rather than a pre-filled value |
| `Sign in to continue to Carezaar.` | Sign In | Hidden in other languages, because it has no translation key |
| `For myself…` | Intro | Replaced by `intro_client_description` in other languages |
| `Use 8 or more characters…` | Create Account | Hidden in other languages |
| `Confirm your password...` | Create Account | The frame's static confirm field, hidden and replaced by a real input |
| Button text containing `edit` / `confirm` | Create Account dialog | Tells the dialog's buttons apart |

**Translations:** other copy in the scenes is translated by matching its English text against the server's content table (`i18n.tsx` → `translateEnglish`). Changing English wording in Figma without the same change in the content table leaves that text in English.
