import { cookies } from "next/headers";

// The three ways to lay out a list of questions.
export const VIEWS = ["compact", "tiles", "swipe"] as const;
export type View = (typeof VIEWS)[number];
export const VIEW_COOKIE = "bm_view";

export async function getView(): Promise<View> {
  const value = (await cookies()).get(VIEW_COOKIE)?.value as View | undefined;
  return value && VIEWS.includes(value) ? value : "compact";
}
