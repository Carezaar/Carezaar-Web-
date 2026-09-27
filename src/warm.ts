// Loaded by the landing page (same origin) while the visitor reads it: fills the app's
// lookup-table cache so the app opens without its loading sheet.
import { loadBaseData } from "./app/baseDataLoader";

void loadBaseData().catch(() => { /* the app loads the tables itself on open */ });
