"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CardItem } from "@/lib/cards";
import type { View } from "@/lib/view";
import { LiveCard } from "./LiveCard";

type Props = {
  initial: CardItem[];
  next: string | null;       // cursor for the following page, or null if this is everything
  view: View;
  signedIn: boolean;
  category: string | null;
  back: string;
};

// How many tile columns fit. Matches the breakpoints in globals.css.
function useColumns(enabled: boolean): number {
  const [columns, setColumns] = useState(2);
  useEffect(() => {
    if (!enabled) return;
    const update = () => setColumns(window.innerWidth >= 960 ? 4 : window.innerWidth >= 640 ? 3 : 2);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [enabled]);
  return columns;
}

// The question list for all three layouts. The first page arrives with the HTML; later pages
// are fetched as the reader nears the end, so the browser never holds more than it has shown.
export function FeedList({ initial, next, view, signedIn, category, back }: Props) {
  const [items, setItems] = useState(initial);
  const [cursor, setCursor] = useState(next);
  const [failed, setFailed] = useState(false);
  const loading = useRef(false);
  const scroller = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const columns = useColumns(view === "tiles");

  const loadMore = useCallback(async () => {
    if (loading.current || !cursor) return;
    loading.current = true;
    try {
      const params = new URLSearchParams({ cursor });
      if (category) params.set("c", category);
      const response = await fetch(`/api/feed?${params}`);
      if (!response.ok) throw new Error(String(response.status));
      const page = (await response.json()) as { items: CardItem[]; next: string | null };
      setItems((current) => {
        const have = new Set(current.map((i) => i.id));
        return [...current, ...page.items.filter((i) => !have.has(i.id))];
      });
      setCursor(page.next);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      loading.current = false;
    }
  }, [cursor, category]);

  // Fetch the next page when the end marker comes within reach: a couple of screens ahead in
  // the scrolling layouts, a few panels ahead when paging one at a time.
  useEffect(() => {
    const target = sentinel.current;
    if (!target || !cursor || failed) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries.some((e) => e.isIntersecting)) void loadMore(); },
      { root: view === "swipe" ? scroller.current : null, rootMargin: view === "swipe" ? "300% 0px" : "1200px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [cursor, failed, loadMore, view, items.length]);

  const skip = useCallback((id: number) => setItems((current) => current.filter((i) => i.id !== id)), []);
  const card = (item: CardItem) => <LiveCard key={item.id} item={item} signedIn={signedIn} back={back} onSkip={skip} />;

  const end = (
    <div ref={sentinel} className="feed-end" aria-live="polite">
      {failed ? (
        <button className="btn" onClick={() => { setFailed(false); void loadMore(); }}>Couldn&apos;t load more. Try again</button>
      ) : cursor ? (
        <span>Loading more questions</span>
      ) : items.length > 0 ? (
        <span>{signedIn ? "That's every question for now." : "That's every question."}</span>
      ) : null}
    </div>
  );

  if (view === "tiles") {
    // Deal cards into fixed columns in order, so loading more never reshuffles what is on screen.
    const cols: CardItem[][] = Array.from({ length: columns }, () => []);
    items.forEach((item, i) => cols[i % columns].push(item));
    return (
      <>
        <div className="feed feed-tiles">
          {cols.map((col, i) => <div className="col" key={i}>{col.map(card)}</div>)}
        </div>
        {end}
      </>
    );
  }

  if (view === "swipe") {
    return (
      <div className="feed feed-swipe" ref={scroller}>
        {items.map(card)}
        {end}
      </div>
    );
  }

  return (
    <>
      <div className="feed feed-compact">{items.map(card)}</div>
      {end}
    </>
  );
}
