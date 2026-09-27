/** Current editable Figma palette. Legacy scenes retain their own source values. */
export const tokens = {
  color: { primary: "#007AFE", text: "#000000", muted: "#7F7F7F", surface: "#FFFFFF", care: "#EDF4FC", caregiver: "#EFF9F7", success: "#01BB8A", error: "#FF0000", privacy: "#9247F5" },
  font: { family: "Vazirmatn", caption: 12, body: 14, control: 16, heading: 28 },
  spacing: { compact: 8, control: 16, screen: 20, section: 24, large: 32 },
} as const;
