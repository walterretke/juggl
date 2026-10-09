import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import Captura from "./telas/Captura";
import Principal from "./telas/Principal";
import { iniciarTema } from "./tema";
import "./index.css";

// As duas janelas carregam o mesmo index.html; o rótulo da janela decide a tela.
iniciarTema();

const Tela = getCurrentWindow().label === "captura" ? Captura : Principal;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Tela />
  </React.StrictMode>,
);
