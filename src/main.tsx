import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { startMatchesPrefetch } from "./app/matchesPrefetch";
import "./styles.css";
import "./styles/app.css";

startMatchesPrefetch(window.location.pathname);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
