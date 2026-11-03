import { mount } from "svelte";
import "../app.css";
import { disableContextMenu } from "../lib/context-menu";
import Popup from "./Popup.svelte";

const target = document.getElementById("app");

if (!target) {
  throw new Error("#app mount point not found");
}

disableContextMenu();

const app = mount(Popup, { target });

export default app;
