"use client";

import {
  AlertTriangle,
  ArrowUpDown,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Heart,
  Home,
  Link2,
  Loader2,
  MapPin,
  RotateCcw,
  Scale,
  Search,
  SlidersHorizontal,
  Star,
  X
} from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";

import { cn } from "@/lib/cn";
import {
  type HouseListing,
  type HouseTrackerSnapshot,
  formatDateTime,
  formatHkd,
  formatNumber,
  getBedrooms,
  getFriendlyReason,
  getFriendScore,
  getListingFlags,
  isFocusArea,
  isLikelyWholeUnit,
  listingText
} from "@/lib/houseTracker";

type Mode = "focus" | "all" | "saved";
type SortMode = "friend" | "value" | "rent" | "area" | "new";

const dataUrl = "/data/house-tracker/latest.json";
const savedStorageKey = "hk-house-tracker:saved";
const compareStorageKey = "hk-house-tracker:compare";

const maxCompare = 4;

const sortLabels: Record<SortMode, string> = {
  friend: "Friends pick",
  value: "Best value",
  rent: "Lowest rent",
  area: "Largest area",
  new: "Newest"
};

function readStoredIds(key: string) {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as string[]) : [];
  } catch {
    return [];
  }
}

function getDistrictLabel(listing: HouseListing) {
  return listing.district || listing.sourceDistrict || "Unknown";
}

function metric(label: string, value: string) {
  return (
    <div className="min-w-0">
      <div className="metric-label">{label}</div>
      <div className="metric-value truncate">{value}</div>
    </div>
  );
}

function toggleItem(items: string[], id: string, limit?: number) {
  if (items.includes(id)) {
    return items.filter((item) => item !== id);
  }

  const next = [id, ...items];
  return typeof limit === "number" ? next.slice(0, limit) : next;
}

export function HouseFinder() {
  const [snapshot, setSnapshot] = useState<HouseTrackerSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("focus");
  const [sortMode, setSortMode] = useState<SortMode>("friend");
  const [query, setQuery] = useState("");
  const [maxRent, setMaxRent] = useState(35000);
  const [minArea, setMinArea] = useState(0);
  const [maxPpsf, setMaxPpsf] = useState(95);
  const [hideFlagged, setHideFlagged] = useState(false);
  const [newOnly, setNewOnly] = useState(false);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [visibleCount, setVisibleCount] = useState(36);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadSnapshot() {
      try {
        const response = await fetch(dataUrl, { cache: "no-store" });

        if (!response.ok) {
          throw new Error(`Snapshot request failed with ${response.status}`);
        }

        const payload = (await response.json()) as HouseTrackerSnapshot;

        if (!cancelled) {
          setSnapshot(payload);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Could not load listings.");
        }
      }
    }

    setSavedIds(readStoredIds(savedStorageKey));
    setCompareIds(readStoredIds(compareStorageKey).slice(0, maxCompare));
    void loadSnapshot();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(savedStorageKey, JSON.stringify(savedIds));
  }, [savedIds]);

  useEffect(() => {
    window.localStorage.setItem(compareStorageKey, JSON.stringify(compareIds.slice(0, maxCompare)));
  }, [compareIds]);

  useEffect(() => {
    setVisibleCount(36);
  }, [mode, sortMode, query, maxRent, minArea, maxPpsf, hideFlagged, newOnly]);

  const listings = useMemo(() => snapshot?.listings ?? [], [snapshot]);

  const summary = useMemo(() => {
    const focusListings = listings.filter(isFocusArea);
    const likelyWhole = focusListings.filter(isLikelyWholeUnit);
    const cheapestFocus = focusListings.reduce<HouseListing | null>((best, listing) => {
      if (!best || listing.rent < best.rent) {
        return listing;
      }

      return best;
    }, null);

    return {
      focusListings,
      focusCount: focusListings.length,
      likelyWholeCount: likelyWhole.length,
      cheapestFocus
    };
  }, [listings]);

  const savedListings = useMemo(
    () => savedIds.map((id) => listings.find((listing) => listing.id === id)).filter(Boolean) as HouseListing[],
    [listings, savedIds]
  );

  const compareListings = useMemo(
    () => compareIds.map((id) => listings.find((listing) => listing.id === id)).filter(Boolean) as HouseListing[],
    [listings, compareIds]
  );

  const filteredListings = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    const base = listings.filter((listing) => {
      if (mode === "focus" && !isFocusArea(listing)) {
        return false;
      }

      if (mode === "saved" && !savedIds.includes(listing.id)) {
        return false;
      }

      if (normalizedQuery && !listingText(listing).toLowerCase().includes(normalizedQuery)) {
        return false;
      }

      if (listing.rent > maxRent) {
        return false;
      }

      if (listing.saleableArea < minArea) {
        return false;
      }

      if (listing.pricePerSqft > maxPpsf) {
        return false;
      }

      if (hideFlagged && !isLikelyWholeUnit(listing)) {
        return false;
      }

      if (newOnly && !listing.isNew) {
        return false;
      }

      return true;
    });

    return [...base].sort((left, right) => {
      if (sortMode === "friend") {
        return getFriendScore(right) - getFriendScore(left);
      }

      if (sortMode === "rent") {
        return left.rent - right.rent;
      }

      if (sortMode === "area") {
        return right.saleableArea - left.saleableArea;
      }

      if (sortMode === "new") {
        return new Date(right.firstSeenAt).getTime() - new Date(left.firstSeenAt).getTime();
      }

      return left.pricePerSqft - right.pricePerSqft;
    });
  }, [hideFlagged, listings, maxPpsf, maxRent, minArea, mode, newOnly, query, savedIds, sortMode]);

  const topListing = filteredListings[0] ?? null;
  const visibleListings = filteredListings.slice(0, visibleCount);

  const resetFilters = useCallback(() => {
    setMode("focus");
    setSortMode("friend");
    setQuery("");
    setMaxRent(35000);
    setMinArea(0);
    setMaxPpsf(95);
    setHideFlagged(false);
    setNewOnly(false);
  }, []);

  const shareView = useCallback(async () => {
    const params = new URLSearchParams({
      mode,
      sort: sortMode,
      q: query,
      rent: String(maxRent),
      area: String(minArea),
      ppsf: String(maxPpsf),
      clean: hideFlagged ? "1" : "0",
      new: newOnly ? "1" : "0"
    });

    await navigator.clipboard.writeText(`${window.location.origin}?${params.toString()}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }, [hideFlagged, maxPpsf, maxRent, minArea, mode, newOnly, query, sortMode]);

  const toggleSaved = useCallback((id: string) => {
    setSavedIds((current) => toggleItem(current, id));
  }, []);

  const toggleCompare = useCallback((id: string) => {
    setCompareIds((current) => toggleItem(current, id, maxCompare));
  }, []);

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((current) => toggleItem(current, id));
  }, []);

  if (error) {
    return (
      <main className="mx-auto flex min-h-screen max-w-app items-center justify-center px-4 py-8">
        <section className="tool-panel max-w-xl p-6">
          <div className="flex items-start gap-3 text-coral">
            <AlertTriangle className="mt-1 h-5 w-5 shrink-0" />
            <div>
              <h1 className="font-display text-2xl font-semibold text-ink">Listings did not load</h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">{error}</p>
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (!snapshot) {
    return (
      <main className="mx-auto flex min-h-screen max-w-app items-center justify-center px-4 py-8">
        <div className="inline-flex items-center gap-3 rounded-lg border border-line bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin text-sea" />
          Loading listings
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-3 py-4 text-ink sm:px-5 lg:px-7">
      <div className="mx-auto grid max-w-app gap-4">
        <section className="grid gap-4 lg:grid-cols-[1fr_22rem]">
          <div className="tool-panel p-4 sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-sea">
                  <Home className="h-4 w-4" />
                  HK House Tracker
                </div>
                <h1 className="mt-2 font-display text-3xl font-semibold text-ink sm:text-4xl">
                  Ktown and SYP rental finder
                </h1>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-600">
                  <span>{formatNumber(summary.focusCount)} Ktown/SYP listings</span>
                  <span>{formatNumber(summary.likelyWholeCount)} likely whole units</span>
                  <span>Updated {formatDateTime(snapshot.scannedAt)}</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={shareView}
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-slate-700 hover:border-sea hover:text-sea"
                >
                  <Link2 className="h-4 w-4" />
                  {copied ? "Copied" : "Share"}
                </button>
                <a
                  href={snapshot.source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-10 items-center gap-2 rounded-md bg-ink px-3 text-sm font-semibold text-white hover:bg-sea"
                >
                  <ExternalLink className="h-4 w-4" />
                  28HSE
                </a>
              </div>
            </div>
          </div>

          <aside className="tool-panel p-4">
            <div className="control-label">Best match now</div>
            {topListing ? (
              <div className="mt-3">
                <a
                  href={topListing.url}
                  target="_blank"
                  rel="noreferrer"
                  className="line-clamp-2 text-base font-semibold leading-6 text-ink hover:text-sea"
                >
                  {topListing.title}
                </a>
                <div className="mt-3 grid grid-cols-3 gap-3">
                  {metric("Rent", formatHkd(topListing.rent))}
                  {metric("Area", `${formatNumber(topListing.saleableArea)} ft²`)}
                  {metric("$/ft²", formatHkd(topListing.pricePerSqft, 1))}
                </div>
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-600">No matches in this view.</p>
            )}
          </aside>
        </section>

        <section className="tool-panel p-3 sm:p-4">
          <div className="grid gap-3 xl:grid-cols-[auto_minmax(15rem,1fr)_auto] xl:items-end">
            <div>
              <div className="control-label mb-2">View</div>
              <div className="grid grid-cols-3 rounded-lg border border-line bg-slate-100 p-1">
                {[
                  { value: "focus", label: "Ktown/SYP", icon: MapPin },
                  { value: "all", label: "All Island", icon: Home },
                  { value: "saved", label: `Saved ${savedIds.length}`, icon: Heart }
                ].map((item) => {
                  const Icon = item.icon;

                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setMode(item.value as Mode)}
                      className={cn(
                        "inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold",
                        mode === item.value
                          ? "bg-white text-ink shadow-sm"
                          : "text-slate-600 hover:bg-white hover:text-ink"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="hidden sm:inline">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="block">
              <span className="control-label mb-2 block">Search</span>
              <span className="flex h-11 items-center gap-2 rounded-md border border-line bg-white px-3">
                <Search className="h-4 w-4 shrink-0 text-slate-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Building, district, agency, tag"
                  className="h-full min-w-0 flex-1 border-0 bg-transparent text-sm text-ink outline-none placeholder:text-slate-400"
                />
                {query ? (
                  <button type="button" onClick={() => setQuery("")} title="Clear search">
                    <X className="h-4 w-4 text-slate-400 hover:text-coral" />
                  </button>
                ) : null}
              </span>
            </label>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:flex">
              {[18000, 25000, 35000, 50000].map((budget) => (
                <button
                  key={budget}
                  type="button"
                  onClick={() => setMaxRent(budget)}
                  className={cn(
                    "inline-flex h-10 items-center justify-center rounded-md border px-3 text-sm font-semibold",
                    maxRent === budget
                      ? "border-sea bg-teal-50 text-sea"
                      : "border-line bg-white text-slate-600 hover:border-sea hover:text-sea"
                  )}
                >
                  {formatHkd(budget).replace(".00", "")}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end">
            <label className="grid gap-2">
              <span className="control-label">Max rent {formatHkd(maxRent)}</span>
              <input
                type="range"
                min={6000}
                max={120000}
                step={1000}
                value={maxRent}
                onChange={(event) => setMaxRent(Number(event.target.value))}
                className="accent-sea"
              />
            </label>

            <label className="grid gap-2">
              <span className="control-label">Min area {formatNumber(minArea)} ft²</span>
              <input
                type="range"
                min={0}
                max={1200}
                step={25}
                value={minArea}
                onChange={(event) => setMinArea(Number(event.target.value))}
                className="accent-grape"
              />
            </label>

            <label className="grid gap-2">
              <span className="control-label">Max $/ft² {formatHkd(maxPpsf, 0)}</span>
              <input
                type="range"
                min={20}
                max={180}
                step={5}
                value={maxPpsf}
                onChange={(event) => setMaxPpsf(Number(event.target.value))}
                className="accent-coral"
              />
            </label>

            <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[25rem]">
              <label className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={hideFlagged}
                  onChange={(event) => setHideFlagged(event.target.checked)}
                  className="h-4 w-4 accent-sea"
                />
                Whole-ish
              </label>
              <label className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={newOnly}
                  onChange={(event) => setNewOnly(event.target.checked)}
                  className="h-4 w-4 accent-sea"
                />
                New only
              </label>
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-slate-700 hover:border-coral hover:text-coral"
              >
                <RotateCcw className="h-4 w-4" />
                Reset
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[1fr_22rem]">
          <div className="grid gap-4">
            <div className="tool-panel flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <SlidersHorizontal className="h-4 w-4 text-sea" />
                <span>
                  <strong className="font-semibold text-ink">{formatNumber(filteredListings.length)}</strong> matches
                </span>
              </div>

              <label className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-slate-700">
                <ArrowUpDown className="h-4 w-4 text-slate-400" />
                <select
                  value={sortMode}
                  onChange={(event) => setSortMode(event.target.value as SortMode)}
                  className="border-0 bg-transparent text-sm font-semibold outline-none"
                >
                  {Object.entries(sortLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {compareListings.length > 0 ? (
              <CompareTray
                listings={compareListings}
                onClear={() => setCompareIds([])}
                onRemove={(id) => setCompareIds((current) => current.filter((item) => item !== id))}
              />
            ) : null}

            <div className="grid gap-3">
              {visibleListings.map((listing) => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  expanded={expandedIds.includes(listing.id)}
                  saved={savedIds.includes(listing.id)}
                  compared={compareIds.includes(listing.id)}
                  onSave={() => toggleSaved(listing.id)}
                  onCompare={() => toggleCompare(listing.id)}
                  onToggleExpanded={() => toggleExpanded(listing.id)}
                />
              ))}
            </div>

            {visibleListings.length < filteredListings.length ? (
              <button
                type="button"
                onClick={() => setVisibleCount((current) => current + 36)}
                className="mx-auto inline-flex h-11 items-center justify-center rounded-md border border-line bg-white px-5 text-sm font-semibold text-slate-700 shadow-sm hover:border-sea hover:text-sea"
              >
                Show more
              </button>
            ) : null}

            {filteredListings.length === 0 ? (
              <div className="tool-panel p-8 text-center">
                <p className="text-base font-semibold text-ink">No listings match this view.</p>
                <button
                  type="button"
                  onClick={resetFilters}
                  className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-slate-700 hover:border-sea hover:text-sea"
                >
                  <RotateCcw className="h-4 w-4" />
                  Reset filters
                </button>
              </div>
            ) : null}
          </div>

          <aside className="grid h-fit gap-4 xl:sticky xl:top-4">
            <section className="tool-panel p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="control-label">Shortlist</div>
                  <div className="mt-1 text-sm text-slate-600">{savedListings.length} saved</div>
                </div>
                <Heart className="h-5 w-5 text-coral" />
              </div>

              <div className="mt-4 grid gap-3">
                {savedListings.slice(0, 5).map((listing) => (
                  <a
                    key={listing.id}
                    href={listing.url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md border border-line bg-slate-50 p-3 hover:border-sea"
                  >
                    <div className="line-clamp-2 text-sm font-semibold leading-5 text-ink">{listing.title}</div>
                    <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-600">
                      <span>{getDistrictLabel(listing)}</span>
                      <span>{formatHkd(listing.rent)}</span>
                    </div>
                  </a>
                ))}
              </div>

              {savedListings.length === 0 ? (
                <p className="mt-4 text-sm leading-6 text-slate-600">Saved listings will stay on this device.</p>
              ) : null}
            </section>

            <section className="tool-panel p-4">
              <div className="control-label">Coverage</div>
              <div className="mt-3 grid gap-3">
                {snapshot.districtTotals.map((district) => (
                  <div key={district.id} className="grid grid-cols-[1fr_auto] gap-3 text-sm">
                    <span className="truncate text-slate-700">{district.label}</span>
                    <span className="font-semibold text-ink">{formatNumber(district.listingsParsed)}</span>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}

function ListingCard({
  listing,
  expanded,
  saved,
  compared,
  onSave,
  onCompare,
  onToggleExpanded
}: {
  listing: HouseListing;
  expanded: boolean;
  saved: boolean;
  compared: boolean;
  onSave: () => void;
  onCompare: () => void;
  onToggleExpanded: () => void;
}) {
  const flags = getListingFlags(listing);
  const wholeUnit = flags.length === 0;
  const bedroomLabel = getBedrooms(listing);

  return (
    <article className="tool-panel overflow-hidden">
      <div className="grid gap-0 md:grid-cols-[14rem_1fr]">
        <div className="relative min-h-[12rem] bg-slate-100 md:min-h-full">
          <ListingImage src={listing.imageUrl} />
          <div className="absolute left-3 top-3 rounded-md bg-white px-2 py-1 text-xs font-semibold text-ink shadow-sm">
            #{listing.rank}
          </div>
        </div>

        <div className="grid gap-4 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-md bg-teal-50 px-2 py-1 text-xs font-semibold text-sea">
                  <MapPin className="h-3.5 w-3.5" />
                  {getDistrictLabel(listing)}
                </span>
                {isFocusArea(listing) ? (
                  <span className="rounded-md bg-indigo-50 px-2 py-1 text-xs font-semibold text-grape">
                    Ktown/SYP
                  </span>
                ) : null}
                {listing.isNew ? (
                  <span className="rounded-md bg-rose-50 px-2 py-1 text-xs font-semibold text-coral">New</span>
                ) : null}
                {wholeUnit ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Whole-ish
                  </span>
                ) : (
                  flags.map((flag) => (
                    <span
                      key={flag.label}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold",
                        flag.tone === "rose" ? "bg-rose-50 text-coral" : "bg-amber-50 text-amber-700"
                      )}
                    >
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {flag.label}
                    </span>
                  ))
                )}
              </div>

              <a
                href={listing.url}
                target="_blank"
                rel="noreferrer"
                className="line-clamp-2 text-lg font-semibold leading-6 text-ink hover:text-sea"
              >
                {listing.title}
              </a>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-600">
                <span>{listing.building || "Building not listed"}</span>
                {bedroomLabel ? <span>{bedroomLabel}</span> : null}
                <span>{listing.agency || "Agency not listed"}</span>
              </div>
            </div>

            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={onSave}
                title={saved ? "Remove from shortlist" : "Save to shortlist"}
                className={cn(
                  "inline-flex h-10 w-10 items-center justify-center rounded-md border",
                  saved
                    ? "border-coral bg-rose-50 text-coral"
                    : "border-line bg-white text-slate-600 hover:border-coral hover:text-coral"
                )}
              >
                <Heart className={cn("h-4 w-4", saved && "fill-current")} />
              </button>
              <button
                type="button"
                onClick={onCompare}
                title={compared ? "Remove from compare" : "Add to compare"}
                className={cn(
                  "inline-flex h-10 w-10 items-center justify-center rounded-md border",
                  compared
                    ? "border-grape bg-indigo-50 text-grape"
                    : "border-line bg-white text-slate-600 hover:border-grape hover:text-grape"
                )}
              >
                <Scale className="h-4 w-4" />
              </button>
              <a
                href={listing.url}
                target="_blank"
                rel="noreferrer"
                title="Open listing"
                className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-line bg-white text-slate-600 hover:border-sea hover:text-sea"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            {metric("Rent", formatHkd(listing.rent))}
            {metric("Area", `${formatNumber(listing.saleableArea)} ft²`)}
            {metric("$/ft²", formatHkd(listing.pricePerSqft, 1))}
            {metric("Why", getFriendlyReason(listing))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
            <div className="flex flex-wrap gap-2">
              {(listing.references ?? []).slice(0, 4).map((reference) => (
                <a
                  key={reference.name}
                  href={reference.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-8 items-center rounded-md border border-line bg-white px-2 text-xs font-semibold text-slate-600 hover:border-sea hover:text-sea"
                >
                  {reference.name}
                </a>
              ))}
            </div>

            <button
              type="button"
              onClick={onToggleExpanded}
              className="inline-flex h-8 items-center gap-2 rounded-md border border-line bg-white px-2 text-xs font-semibold text-slate-600 hover:border-sea hover:text-sea"
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              Details
            </button>
          </div>

          {expanded ? (
            <div className="grid gap-3 rounded-md border border-line bg-slate-50 p-3 text-sm text-slate-700 sm:grid-cols-2">
              <div>
                <div className="font-semibold text-ink">Posted</div>
                <div>{listing.posted || "Not listed"}</div>
              </div>
              <div>
                <div className="font-semibold text-ink">Source district</div>
                <div>{listing.sourceDistrict || "Not listed"}</div>
              </div>
              <div className="sm:col-span-2">
                <div className="font-semibold text-ink">Tags</div>
                <div className="mt-1">{(listing.tags ?? []).join(" | ") || "No tags"}</div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function ListingImage({ src }: { src: string }) {
  const isUsableSource = src?.startsWith("https://");
  const [imageSrc, setImageSrc] = useState(isUsableSource ? src : "/house-tracker-icon.svg");
  const isFallback = imageSrc === "/house-tracker-icon.svg";

  return (
    <Image
      src={imageSrc}
      alt=""
      fill
      sizes="(min-width: 768px) 14rem, 100vw"
      className={cn(isFallback ? "object-contain p-10" : "object-cover")}
      unoptimized
      onError={() => setImageSrc("/house-tracker-icon.svg")}
    />
  );
}

function CompareTray({
  listings,
  onClear,
  onRemove
}: {
  listings: HouseListing[];
  onClear: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <section className="tool-panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Scale className="h-4 w-4 text-grape" />
          Compare
        </div>
        <button
          type="button"
          onClick={onClear}
          className="inline-flex h-8 items-center gap-2 rounded-md border border-line bg-white px-2 text-xs font-semibold text-slate-600 hover:border-coral hover:text-coral"
        >
          <X className="h-4 w-4" />
          Clear
        </button>
      </div>

      <div className="overflow-x-auto">
        <div className="grid min-w-[44rem] gap-0" style={{ gridTemplateColumns: `9rem repeat(${listings.length}, minmax(12rem, 1fr))` }}>
          <div className="border-b border-line bg-slate-50 p-3 text-xs font-semibold uppercase text-slate-500">Metric</div>
          {listings.map((listing) => (
            <div key={listing.id} className="border-b border-line bg-slate-50 p-3">
              <div className="flex items-start justify-between gap-2">
                <a
                  href={listing.url}
                  target="_blank"
                  rel="noreferrer"
                  className="line-clamp-2 text-sm font-semibold leading-5 text-ink hover:text-sea"
                >
                  {listing.title}
                </a>
                <button type="button" onClick={() => onRemove(listing.id)} title="Remove">
                  <X className="h-4 w-4 text-slate-400 hover:text-coral" />
                </button>
              </div>
            </div>
          ))}

          {[
            ["Rent", (listing: HouseListing) => formatHkd(listing.rent)],
            ["Area", (listing: HouseListing) => `${formatNumber(listing.saleableArea)} ft²`],
            ["$/ft²", (listing: HouseListing) => formatHkd(listing.pricePerSqft, 1)],
            ["District", (listing: HouseListing) => getDistrictLabel(listing)],
            ["Fit", (listing: HouseListing) => (isLikelyWholeUnit(listing) ? "Whole-ish" : "Check first")]
          ].map(([label, getValue]) => (
            <div key={label as string} className="contents">
              <div className="border-b border-line p-3 text-sm font-semibold text-slate-600">{label as string}</div>
              {listings.map((listing) => (
                <div key={`${listing.id}-${label as string}`} className="border-b border-line p-3 text-sm text-ink">
                  {(getValue as (listing: HouseListing) => string)(listing)}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
