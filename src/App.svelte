<script lang="ts">
  import { onMount, tick } from "svelte";
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

  const viewId = $props.id();
  const views = ["active", "done", "matrix"] as const;
  let content: HTMLElement;
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
    listen("menu-open-settings", openSettings);
    listen("settings-changed", async () => {
      const settings = await api.getSettings();
      applyTheme(settings.theme, settings.accent);
      applyBackdrop(await api.windowBackdrop().catch(() => false));
      await loadLocale(settings.language);
    });
    // The window is created hidden (tauri.conf.json); reveal it only once the
    // theme, language and data are in place, so the first frame is final.
    await tick();
    void api.mainWindowReady();
  });

  function reportError(error: unknown) {
    alert(t("msg.action_failed", { err: String(error) }));
  }

  function openSettings() {
    void api.openSettings().catch(reportError);
  }

  function openNew() {
    void api.openEditor().catch(reportError);
  }

  function openEdit(r: Reminder) {
    void api.openEditor(r).catch(reportError);
  }

  // Duplicate: open the editor pre-filled as a NEW reminder with a fresh id,
  // so the user can tweak date/time before saving the copy.
  function openDuplicate(r: Reminder) {
    void api.openEditor(r, true).catch(reportError);
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
  const listed = $derived(view === "done" ? done : active);
  const searching = $derived(query.trim().length > 0);
  const status = $derived(!store.loaded ? t("a11y.loading") :
    searching ? (listed.length ? t("a11y.results", { n: listed.length }) : t("list.no_match")) :
    listed.length === 0 ? t("list.empty_title") : "");

  $effect.pre(() => {
    const reminders = listed;
    const focused = document.activeElement;
    const row = focused?.closest<HTMLElement>("[data-reminder-id]");
    const id = row?.dataset.reminderId;
    if (!id || !content?.contains(row)) return;

    // A refreshed row may disappear or move to a different matrix quadrant.
    void tick().then(() => {
      if (focused?.isConnected || document.activeElement !== document.body) return;
      if (reminders.some((reminder) => reminder.id === id)) {
        const replacement = content.querySelector<HTMLButtonElement>(`[data-reminder-id="${CSS.escape(id)}"] .q-item-btn`);
        if (replacement) {
          replacement.focus();
          return;
        }
      }
      content.querySelector<HTMLElement>('[role="tabpanel"]:not([hidden])')?.focus();
    });
  });
</script>

<svelte:head><title>{appName}</title></svelte:head>

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
    <TitleBar name={appName} bind:view {viewId} windowControls={captionControls} />
    <Toolbar
      bind:query
      onNew={openNew}
      onSettings={openSettings}
      onImport={doImport}
      onExport={doExport}
    />
    <div class="sr-only" role="status">{status}</div>
    <main bind:this={content} class="content" class:matrix={view === "matrix"} data-tauri-drag-region="false">
      {#each views as tab (tab)}
        <div
          id={`${viewId}-panel-${tab}`}
          class="view-panel"
          role="tabpanel"
          aria-labelledby={`${viewId}-tab-${tab}`}
          aria-busy={!store.loaded}
          tabindex="0"
          hidden={view !== tab}
        >
          {#if view === tab}
            {#if tab === "matrix"}
              <EisenhowerMatrix reminders={active} loading={!store.loaded} {searching} onEdit={openEdit} />
            {:else}
              <ReminderList
                reminders={listed}
                loading={!store.loaded}
                showEmpty={view !== "done"}
                {searching}
                onEdit={openEdit}
                onDuplicate={openDuplicate}
              />
            {/if}
          {/if}
        </div>
      {/each}
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
  .content.matrix .view-panel { height: 100%; }

  .content.matrix {
    overflow: hidden;
    padding-bottom: 12px;
  }
</style>
