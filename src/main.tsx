import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/golos-text/cyrillic-400.css";
import "@fontsource/golos-text/cyrillic-500.css";
import "@fontsource/golos-text/cyrillic-600.css";
import "@fontsource/golos-text/latin-400.css";
import "@fontsource/golos-text/latin-600.css";
import "@fontsource/unbounded/cyrillic-500.css";
import "@fontsource/unbounded/cyrillic-600.css";
import "@fontsource/unbounded/latin-600.css";
import "@fontsource/caveat/cyrillic-700.css";
import "@fontsource/caveat/latin-700.css";
import "./styles.css";
import "./themes/azure.css";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
