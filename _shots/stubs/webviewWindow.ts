/** Record window actions while keeping the capture mounted. */

export const windowCalls: string[] = [];

export function getCurrentWebviewWindow() {
  return {
    close: () => {
      windowCalls.push("close");
    },
    show: () => {},
    setFocus: () => {},
  };
}
