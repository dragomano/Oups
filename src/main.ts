import { mount } from "svelte";
import "./app.css";
import App from "./App.svelte";
import { disableContextMenu } from "./lib/context-menu";

const target = document.getElementById("app");
if (!target) {
  throw new Error("#app mount point not found");
}

disableContextMenu();

const app = mount(App, { target });

export default app;
