export const DEFAULT_PROXY_HOST = "10.0.2.2";
export const DEFAULT_PROXY_PORT = "8877";
export const DONATION_URL =
  import.meta.env.VITE_DONATION_URL ?? "https://www.paypal.com/donate/?hosted_button_id=LU5E9BD7QFYGU";

export const DETAIL_TABS = ["request", "response", "headers", "cookies", "params", "timing"] as const;
export type DetailTab = (typeof DETAIL_TABS)[number];
