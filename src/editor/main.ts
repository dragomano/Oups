import { mount } from "svelte";
import "../app.css";
import { disableContextMenu } from "../lib/context-menu";
import EditorWindow from "./EditorWindow.svelte";

const target = document.getElementById("app");
if (!target) throw new Error("#app mount point not found");
disableContextMenu();
mount(EditorWindow, { target });
