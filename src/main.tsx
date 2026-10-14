import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { isStaticSite } from "./api";
import "../styles.css";

if (isStaticSite) {
  const robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
  if (robots) {
    robots.content = "noindex,follow";
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
