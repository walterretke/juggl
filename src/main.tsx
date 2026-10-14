import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import Captura from "./telas/Captura";
import MiniFoco from "./telas/MiniFoco";
import NotaRapida from "./telas/NotaRapida";
import Principal from "./telas/Principal";
import { iniciarTema } from "./tema";
import "./index.css";

// As janelas carregam o mesmo index.html; o rótulo da janela decide a tela.
iniciarTema();

const rotulo = getCurrentWindow().label;
const Tela = rotulo === "captura" ? Captura : rotulo === "nota" ? NotaRapida : rotulo === "mini" ? MiniFoco : Principal;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Tela />
  </React.StrictMode>,
);
