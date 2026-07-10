export type HouseListing = {
  id: string;
  sourceId?: string;
  sourceName?: string;
  externalId?: string;
  rank: number;
  title: string;
  url: string;
  imageUrl: string;
  sourceDistrictId: string;
  sourceDistrict: string;
  district: string;
  building: string;
  unit: string;
  locationLine: string;
  posted: string;
  agency: string;
  rent: number;
  saleableArea: number;
  pricePerSqft: number;
  sitePricePerSqft: number | null;
  sqftPerHkd1000: number;
  tags: string[];
  references: Array<{
    name: string;
    url: string;
  }>;
  firstSeenAt: string;
  lastSeenAt: string;
  seenCount: number;
  isNew: boolean;
};

export type HouseTrackerSnapshot = {
  scannedAt: string;
  source: {
    name: string;
    url: string;
    robotsTxt: string;
  };
  sources?: Array<{
    id: string;
    name: string;
    url: string;
    robotsTxt: string;
    mode: string;
    status: "parsed" | "manual";
    note: string;
    listingsParsed: number;
    pagesFetched: number;
    reportedResults: number;
    errors: number;
    areas: Array<{
      id: string;
      label: string;
      url: string;
      listingsParsed: number;
      pagesFetched: number;
      reportedResults: number;
    }>;
  }>;
  referenceSources: Array<{
    name: string;
    url: string;
    robotsTxt: string;
    mode: string;
  }>;
  schedule: {
    intervalHours: number;
    pageMode: string;
    maxPagesPerDistrict: number | null;
    requestDelayMs: number;
  };
  filters: {
    location: string;
    districts: Array<{ id: string; label: string; url: string }>;
    type: string;
    rentType: string;
    price: string;
    areaBasis: string;
    areaRange: string;
    bedrooms: string;
    ranking: string;
  };
  totals: {
    listings: number;
    newListings: number;
    districts: number;
    expectedResults: number;
    pagesFetched: number;
    errors: number;
    sources?: number;
  };
  districtTotals: Array<{
    id: string;
    label: string;
    reportedResults: number;
    pagesFetched: number;
    listingsParsed: number;
  }>;
  errors: Array<{
    sourceId?: string;
    district: string;
    page: number;
    url: string;
    message: string;
  }>;
  listings: HouseListing[];
};

export type ListingFlag = {
  label: string;
  tone: "amber" | "rose";
};

const flagRules: Array<ListingFlag & { pattern: RegExp }> = [
  {
    label: "Share",
    pattern: /share rental|roommate|single room|livingroom|co-living/i,
    tone: "amber"
  },
  {
    label: "Dorm",
    pattern: /dormitory|dorm|foreign worker|worker bed|bed space/i,
    tone: "rose"
  },
  {
    label: "Subdivided",
    pattern: /subdivided/i,
    tone: "amber"
  },
  {
    label: "Short-term",
    pattern: /short-term rental/i,
    tone: "amber"
  }
];

const focusAreaPattern = /kennedy town|sai ying pun|shek tong tsui/i;

export function listingText(listing: HouseListing) {
  return [
    listing.title,
    listing.district,
    listing.sourceDistrict,
    listing.building,
    listing.unit,
    listing.locationLine,
    listing.agency,
    ...(listing.tags ?? [])
  ]
    .filter(Boolean)
    .join(" ");
}

export function isFocusArea(listing: HouseListing) {
  return focusAreaPattern.test(listingText(listing));
}

export function getListingFlags(listing: HouseListing) {
  const text = listingText(listing);

  return flagRules
    .filter((flag) => flag.pattern.test(text))
    .map(({ label, tone }) => ({ label, tone }));
}

export function isLikelyWholeUnit(listing: HouseListing) {
  return getListingFlags(listing).length === 0;
}

export function formatHkd(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat("en-HK", {
    currency: "HKD",
    maximumFractionDigits,
    style: "currency"
  }).format(value);
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-HK", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Hong_Kong"
  }).format(new Date(value));
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export function getBedrooms(listing: HouseListing) {
  const match = listingText(listing).match(/(\d+|Studio)\s+Bedrooms?/i);

  if (!match) {
    return listingText(listing).match(/Studio/i) ? "Studio" : null;
  }

  return match[1].toLowerCase() === "studio" ? "Studio" : `${match[1]} bed`;
}

export function getFriendScore(listing: HouseListing) {
  const wholeUnitScore = isLikelyWholeUnit(listing) ? 34 : -42;
  const focusScore = isFocusArea(listing) ? 24 : 0;
  const valueScore = Math.max(0, 72 - listing.pricePerSqft);
  const rentScore = Math.max(0, 30 - listing.rent / 1500);
  const areaScore = Math.min(18, listing.saleableArea / 55);
  const freshnessScore = listing.isNew ? 5 : 0;

  return wholeUnitScore + focusScore + valueScore + rentScore + areaScore + freshnessScore;
}

export function getFriendlyReason(listing: HouseListing) {
  const pieces: string[] = [];

  if (isFocusArea(listing)) {
    pieces.push("Ktown/SYP area");
  }

  if (isLikelyWholeUnit(listing)) {
    pieces.push("likely whole unit");
  } else {
    pieces.push("needs listing check");
  }

  if (listing.pricePerSqft <= 42) {
    pieces.push("strong $/sq ft");
  }

  if (listing.rent <= 18000) {
    pieces.push("lower rent");
  }

  return pieces.slice(0, 3).join(" | ");
}
