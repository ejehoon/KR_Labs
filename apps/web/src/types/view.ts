import type { DashboardData } from "../data";

export type DataState =
  | { status: "loading"; data?: undefined; error?: undefined }
  | { status: "ready"; data: DashboardData; error?: undefined }
  | { status: "error"; data?: undefined; error: string };

export type MainView = "home" | "search" | "list" | "detail" | "review";

export type DetailMode = "field" | "school";

export type HomeSearchMode = "keyword" | "ai";
