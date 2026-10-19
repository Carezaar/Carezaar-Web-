import { StrictMode, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FeedbackProvider, useFeedback } from '../../../src/app/feedback';
let root: Root | null = null;
let current: ReturnType<typeof useFeedback> | null = null;
const controls = {
  mount() { root = createRoot(document.getElementById('root')!); root.render(<StrictMode><FeedbackProvider><Probe /></FeedbackProvider></StrictMode>); },
  unmount() { root?.unmount(); root = null; },
  show(message: string) { current?.toast(message); },
  late: null as null | (() => void),
  startPending() {
    const captured = current!;
    const pending = new Promise<void>((_, reject) => { controls.late = () => reject(new Error('Synthetic rejection')); });
    void captured.act('Synthetic pending action', () => pending).catch(() => captured.toast('Late synthetic failure'));
  },
};
function Probe() {
  const value = useFeedback();
  useEffect(() => { current = value; }, [value]);
  return <span>Private feedback component fixture</span>;
}
(window as unknown as { __qaFeedback: typeof controls }).__qaFeedback = controls;
controls.mount();
