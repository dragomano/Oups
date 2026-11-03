import { mount } from "svelte";
import "../app.css";
import { disableContextMenu } from "../lib/context-menu";
import SettingsWindow from "./SettingsWindow.svelte";

const target = document.getElementById("app");
if (!target) throw new Error("#app mount point not found");
disableContextMenu();
mount(SettingsWindow, { target });
