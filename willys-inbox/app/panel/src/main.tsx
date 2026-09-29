import { createRoot } from "react-dom/client";
import { App } from "./app";
import "./index.css";

const el = document.getElementById("app");
if (el) {
  createRoot(el).render(<App />);
} else {
  console.error("my-willys-list: #app container not found");
}
