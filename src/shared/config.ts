export const DEFAULT_PROXY_HOST = "10.0.2.2";
export const DEFAULT_PROXY_PORT = "8877";

export const DETAIL_TABS = ["request", "response", "headers", "cookies", "params", "timing"] as const;
export type DetailTab = (typeof DETAIL_TABS)[number];
