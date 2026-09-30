import type { passwordRules } from "../validation/validation";
import { Icon } from "./Icon";

/** The five password-rule chips with their Android glyphs. */
export function RuleChips({ rules }: { rules: ReturnType<typeof passwordRules> }) {
  const glyph: Record<string, string> = {
    "8_letters": "8+", "1_uppercase": "A", "1_lowercase": "a", "1_number": "1", "1_special_symbol": "@",
  };
  return (
    <div className="rule-chips" dir="ltr">
      {/* The frames order the chips 8+, A, a, 1, @. */}
      {Object.keys(glyph).map((id) => rules.find((r) => r.id === id)!).map((r) => (
        <span key={r.id} className={`rule-chip ${r.satisfied ? "on" : ""}`} aria-label={`${r.label}: ${r.satisfied ? "met" : "not met"}`}>
          <Icon name={r.satisfied ? "ic_check_circle" : "ic_radiobutton_off"} size={16}
            tint={r.satisfied ? "var(--success)" : "var(--text-secondary)"} />
          {glyph[r.id]}
        </span>
      ))}
    </div>
  );
}
