interface Luocaptcha {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string;
      callback: (response: string) => void;
      // Add other options here if needed, e.g., theme, lang
    }
  ) => string; // Returns widget ID
  reset: (widgetId: string) => void;
}

interface Window {
  LUOCAPTCHA?: Luocaptcha;
}
