import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./estilo.css";

const raiz = document.getElementById("raiz");
if (!raiz) throw new Error("#raiz não encontrado");
createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
