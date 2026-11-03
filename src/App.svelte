<script lang="ts">
  import { onMount } from "svelte";
  import { listen } from "@tauri-apps/api/event";
  import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
  import Toolbar from "./components/Toolbar.svelte";
  import TitleBar from "./components/TitleBar.svelte";
  import ReminderList from "./components/ReminderList.svelte";
  import EisenhowerMatrix from "./components/EisenhowerMatrix.svelte";
  import WindowControls from "./components/WindowControls.svelte";
  import { api, type Reminder, type View } from "./lib/api";
  import { startClock } from "./lib/clock.svelte";
  import { loadLocale, t } from "./lib/i18n.svelte";
  import { store, initState } from "./lib/state.svelte";
  import { applyBackdrop, applyTheme } from "./lib/theme";

  let query = $state("");
  let view = $state<View>("active");
  let appName = $state("");

  // The shared clock keeps relative labels and the matrix's urgency true while
  // the window stays open. It lives and dies with the main window.
  onMount(startClock);

  onMount(async () => {
    const s = await api.getSettings();
    applyTheme(s.theme, s.accent);
    // The system material behind the window decides whether the app paints
    // translucent layers or solid ones. Asked before the window is revealed,
    // so the first frame is already the final look.
    applyBackdrop(await api.windowBackdrop().catch(() => false));
    // The display name for the title strip. It comes from productName, not
    // from a locale file, so it is fetched before the window is revealed.
    appName = await api.appName().catch(() => "");
    await loadLocale(s.language);
    await initState();
    listen("menu-new-reminder", () => openNew());
    listen("menu-open-settings", () => void api.openSettings());
    listen("settings-changed", async () => {
      const settings = await api.getSettings();
      applyTheme(settings.theme, settings.accent);
      applyBackdrop(await api.windowBackdrop().catch(() => false));
      await loadLocale(settings.language);
    });
    // The window is created hidden (tauri.conf.json); reveal it only once the
    // theme, language and data are in place, so the first frame is final.
    void api.mainWindowReady();
  });

  function openNew() {
    void api.openEditor();
  }

  function openEdit(r: Reminder) {
    void api.openEditor(r);
  }

  // Duplicate: open the editor pre-filled as a NEW reminder with a fresh id,
  // so the user can tweak date/time before saving the copy.
  function openDuplicate(r: Reminder) {
    void api.openEditor(r, true);
  }

  async function doExport() {
    const path = await saveDialog({
      defaultPath: "reminders.json",
      filters: [{ name: "JSON", extensions: ["json"] }],
    });

    if (!path) return;

    try {
      const n = await api.exportReminders(path);
      alert(t("msg.exported", { n }));
    } catch (e) {
      alert(t("msg.export_failed", { err: String(e) }));
    }
  }

  async function doImport() {
    const path = await openDialog({
      multiple: false,
      filters: [
        { name: t("msg.import_filter_json"), extensions: ["json"] },
        { name: t("msg.import_filter_wise"), extensions: ["dat"] },
        { name: t("msg.import_filter_wrm"), extensions: ["wrm"] },
      ],
    });

    if (typeof path !== "string") return;

    try {
      const n = await api.importReminders(path);
      alert(t("msg.imported", { n }));
    } catch (e) {
      alert(t("msg.import_failed", { err: String(e) }));
    }
  }

  const searched = $derived.by(() => {
    const q = query.trim().toLowerCase();

    if (!q) return store.reminders;

    return store.reminders.filter(
      (r) =>
        r.title.toLowerCase().includes(q) || r.note.toLowerCase().includes(q),
    );
  });

  const active = $derived(searched.filter((r) => !r.completed && r.enabled));
  const done = $derived(searched.filter((r) => r.completed || !r.enabled));
  const listed = $derived(view === "active" ? active : done);
</script>

{#snippet captionControls()}
  <WindowControls />
{/snippet}

<!--
  The window is frameless (tauri.conf.json): Windows keeps the invisible
  resize border, the drop shadow and the rounded corners, and the app draws
  the frame itself. Clicks on the frame, on the title strip or on the toolbar's
  empty space drag the window (`deep`); the list blocks dragging so its rows
  stay clickable.
-->
<div class="frame" data-tauri-drag-region="deep">
  <div class="card">
    <TitleBar name={appName} bind:view windowControls={captionControls} />
    <Toolbar
      bind:query
      onNew={openNew}
      onSettings={() => void api.openSettings()}
      onImport={doImport}
      onExport={doExport}
    />
    <main class="content" class:matrix={view === "matrix"} data-tauri-drag-region="false">
      {#if view === "matrix"}
        <EisenhowerMatrix reminders={active} loading={!store.loaded} onEdit={openEdit} />
      {:else}
        <ReminderList reminders={listed} loading={!store.loaded} onEdit={openEdit} onDuplicate={openDuplicate} />
      {/if}
    </main>
  </div>
</div>

<style>
  /* The gutter shows the window's own background, the card is the app. With
     the system material behind the window the gutter is transparent, so the
     window's edge is the material itself. */
  .frame {
    height: 100vh;
    padding: 6px;
    background: var(--frame-bg);
  }

  .card {
    display: flex;
    flex-direction: column;
    height: 100%;
    /* Clips the toolbar's corners into the card's radius. */
    overflow: hidden;
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  .content {
    flex: 1;
    overflow-y: auto;
    padding: 12px 14px 20px;
  }

  /* The matrix owns the full height so the four quadrants share it evenly. */
  .content.matrix {
    overflow: hidden;
    padding-bottom: 12px;
  }
</style>
