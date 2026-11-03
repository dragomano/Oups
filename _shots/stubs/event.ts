/** No Tauri event bus in the harness: the app never emits anything here. */

export async function listen(): Promise<() => void> {
  return () => {};
}
