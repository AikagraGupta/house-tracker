#!/usr/bin/env node

import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_DIR = path.join(ROOT_DIR, "data", "house-tracker");
const LATEST_PATH = path.join(OUTPUT_DIR, "latest.json");
const HISTORY_PATH = path.join(OUTPUT_DIR, "history.jsonl");
const DEFAULT_DELAY_MS = 1000;

const MAX_PAGES_PER_DISTRICT = getOptionalPositiveInteger(
  process.env.HOUSE_TRACKER_MAX_PAGES
);
const REQUEST_DELAY_MS = getPositiveInteger(
  process.env.HOUSE_TRACKER_DELAY_MS,
  DEFAULT_DELAY_MS
);
const LISTINGS_PER_PAGE_ESTIMATE = 15;

const DISTRICTS = [
  {
    id: "dg5",
    label: "Causeway Bay / Happy Valley",
    url: "https://www.28hse.com/en/rent/apartment/a1/dg5"
  },
  {
    id: "dg4",
    label: "Wan Chai / Admiralty",
    url: "https://www.28hse.com/en/rent/apartment/a1/dg4"
  },
  {
    id: "dg3",
    label: "Mid-Levels / West-Levels",
    url: "https://www.28hse.com/en/rent/apartment/a1/dg3"
  },
  {
    id: "dg2",
    label: "Central / Sheung Wan",
    url: "https://www.28hse.com/en/rent/apartment/a1/dg2"
  },
  {
    id: "dg1",
    label: "Sai Ying Pun / Shek Tong Tsui",
    url: "https://www.28hse.com/en/rent/apartment/a1/dg1"
  },
  {
    id: "dg121",
    label: "Kennedy Town",
    url: "https://www.28hse.com/en/rent/apartment/a1/dg121"
  }
];

const FOCUS_AREAS = [
  {
    id: "kennedy-town",
    label: "Kennedy Town",
    query: "Kennedy Town Hong Kong rental"
  },
  {
    id: "sai-ying-pun",
    label: "Sai Ying Pun",
    query: "Sai Ying Pun Hong Kong rental"
  },
  {
    id: "shek-tong-tsui",
    label: "Shek Tong Tsui",
    query: "Shek Tong Tsui Hong Kong rental"
  }
];

const TRACKED_SOURCES = [
  {
    id: "28hse",
    name: "28HSE",
    url: "https://www.28hse.com/en/rent",
    robotsTxt: "https://www.28hse.com/robots.txt",
    mode: "Parsed listings",
    status: "parsed",
    note: "Public rental result pages allow crawling and expose rent, saleable area, and listing metadata."
  },
  {
    id: "carousell",
    name: "Carousell",
    url: "https://www.carousell.com.hk/search/property",
    robotsTxt: "https://www.carousell.com.hk/robots.txt",
    mode: "Tracked search links",
    status: "manual",
    note: "Carousell disallows automated /search/ crawling and returned 403 to the tracker, so it is tracked as search coverage links."
  },
  {
    id: "airbnb",
    name: "Airbnb",
    url: "https://www.airbnb.com/s/Hong-Kong/homes",
    robotsTxt: "https://www.airbnb.com/robots.txt",
    mode: "Tracked search links",
    status: "manual",
    note: "Airbnb search result pages with structured stay data are disallowed for general crawlers, so it is tracked as search coverage links."
  }
];

const REQUEST_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (compatible; HKHouseTracker/0.2; personal rental tracker)",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9"
};

const REFERENCE_SITES = [
  {
    name: "Spacious",
    url: "https://www.spacious.hk/en/hong-kong/for-rent",
    robotsTxt: "https://www.spacious.hk/robots.txt",
    host: "spacious.hk"
  },
  {
    name: "Squarefoot",
    url: "https://www.squarefoot.com.hk/en/",
    robotsTxt: "https://www.squarefoot.com.hk/robots.txt",
    host: "squarefoot.com.hk"
  },
  {
    name: "Centaline",
    url: "https://hk.centanet.com/findproperty/en/list/rent",
    robotsTxt: "https://hk.centanet.com/robots.txt",
    host: "hk.centanet.com"
  },
  {
    name: "Hong Kong Homes",
    url: "https://hongkonghomes.com/en/rentals/hk",
    robotsTxt: "https://hongkonghomes.com/robots.txt",
    host: "hongkonghomes.com"
  }
];

function getPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getOptionalPositiveInteger(value) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function pageUrl(baseUrl, page) {
  return page === 1 ? baseUrl : `${baseUrl}/page-${page}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decodeEntities(value) {
  const named = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"'
  };

  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity) => {
    if (entity[0] === "#") {
      const isHex = entity[1]?.toLowerCase() === "x";
      const codePoint = Number.parseInt(entity.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }

    return named[entity] ?? match;
  });
}

function cleanText(value) {
  return decodeEntities(value)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchFirst(value, pattern) {
  return value.match(pattern)?.[1]?.trim() ?? "";
}

function parseMoney(value) {
  const parsed = Number.parseInt(value.replace(/,/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseNumber(value) {
  const parsed = Number.parseFloat(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function extractListingBlocks(html) {
  const starts = [];
  const marker = /<div class="item property_item[^>]*>/g;
  let match;

  while ((match = marker.exec(html)) !== null) {
    starts.push(match.index);
  }

  return starts.map((start, index) => {
    const end = starts[index + 1] ?? html.length;
    return html.slice(start, end);
  });
}

function extractAnchorTexts(html) {
  return [...html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => cleanText(match[1]))
    .filter(Boolean);
}

function parseResultCount(html) {
  const text = cleanText(html);
  const count = parseMoney(matchFirst(text, /([\d,]+)\s+results of property for lease/i));
  return count ?? 0;
}

function estimatedPageCount(resultCount) {
  if (!resultCount) {
    return 1;
  }

  return Math.max(1, Math.ceil(resultCount / LISTINGS_PER_PAGE_ESTIMATE));
}

function buildReferenceLinks(listing) {
  const query = [
    listing.building || listing.district,
    listing.district,
    "rent Hong Kong"
  ]
    .filter(Boolean)
    .join(" ");

  return REFERENCE_SITES.map((site) => ({
    name: site.name,
    url: `https://www.google.com/search?q=${encodeURIComponent(`${query} site:${site.host}`)}`
  }));
}

function sourceSearchUrl(sourceId, area) {
  if (sourceId === "carousell") {
    return `https://www.carousell.com.hk/search/property?search=${encodeURIComponent(area.query)}`;
  }

  if (sourceId === "airbnb") {
    return `https://www.airbnb.com/s/${area.label.replace(/\s+/g, "-")}--Hong-Kong/homes`;
  }

  return "https://www.28hse.com/en/rent";
}

function buildSourceSummaries({ districtTotals, errors, listings, pagesFetched, expectedResults }) {
  const parsedCount = listings.length;

  return TRACKED_SOURCES.map((source) => {
    if (source.id === "28hse") {
      return {
        ...source,
        listingsParsed: parsedCount,
        pagesFetched,
        reportedResults: expectedResults,
        errors: errors.filter((error) => !error.sourceId || error.sourceId === source.id).length,
        areas: districtTotals.map((district) => ({
          id: district.id,
          label: district.label,
          url: district.url,
          listingsParsed: district.listingsParsed,
          pagesFetched: district.pagesFetched,
          reportedResults: district.reportedResults
        }))
      };
    }

    return {
      ...source,
      listingsParsed: 0,
      pagesFetched: 0,
      reportedResults: 0,
      errors: 0,
      areas: FOCUS_AREAS.map((area) => ({
        id: area.id,
        label: area.label,
        url: sourceSearchUrl(source.id, area),
        listingsParsed: 0,
        pagesFetched: 0,
        reportedResults: 0
      }))
    };
  });
}

function parseListing(block, source) {
  const detailUrl = matchFirst(block, /<a class="detail_page" href="([^"]+)"/i);
  const id = matchFirst(detailUrl, /property-(\d+)/i) || matchFirst(block, /attr1='(\d+)'/i);
  const title = cleanText(
    matchFirst(block, /<div class="header wHoverBlue">[\s\S]*?<a\b[^>]*>([\s\S]*?)<\/a>/i)
  );
  const imageUrl = matchFirst(block, /<img\b[^>]*class="[^"]*detail_page_img[^"]*"[^>]*src="([^"]+)"/i);
  const bodyText = cleanText(block);
  const rent = parseMoney(matchFirst(bodyText, /Lease\s+HKD\$\s*([\d,]+)/i));
  const saleableArea = parseNumber(matchFirst(bodyText, /Saleable Area:\s*([\d,]+)\s*ft/i));
  const posted = matchFirst(
    bodyText,
    /((?:just now|\d+\s+(?:minute|minutes|hour|hours|day|days|week|weeks|month|months)\s+ago|today|yesterday)\s+posted)/i
  );
  const unitPriceFromSite = parseNumber(
    matchFirst(block, /Saleable Area:\s*[\d,]+\s*ft[\s\S]*?@\s*([\d,.]+)/i)
  );
  const locationHtml = matchFirst(
    block,
    /<div class="district_area wHoverBlue">([\s\S]*?)<\/div>/i
  );
  const locationAnchors = extractAnchorTexts(locationHtml);
  const unit = cleanText(matchFirst(locationHtml, /<span class="unit_desc">([\s\S]*?)<\/span>/i));
  const locationLine = cleanText(
    locationHtml
      .replace(/<span class="less_span separation">[\s\S]*?<\/span>/gi, " | ")
      .replace(/<span class="unit_desc">/gi, " | <span>")
  );
  const company = cleanText(
    matchFirst(block, /<div class="companyName"[^>]*>([\s\S]*?)<\/div>/i)
  );
  const tags = [
    ...block.matchAll(/<div class="ui\s{2,}label">([\s\S]*?)<\/div>/gi)
  ]
    .map((match) => cleanText(match[1]))
    .filter(Boolean);

  if (!id || !detailUrl || !rent || !saleableArea) {
    return null;
  }

  const pricePerSqft = rent / saleableArea;
  const sqftPerHkd1000 = saleableArea / (rent / 1000);

  return {
    id: `28hse:${id}`,
    sourceId: "28hse",
    sourceName: "28HSE",
    externalId: id,
    title: title || "Untitled listing",
    url: detailUrl,
    imageUrl,
    sourceDistrictId: source.id,
    sourceDistrict: source.label,
    district: locationAnchors[0] ?? "",
    building: locationAnchors[1] ?? "",
    unit,
    locationLine,
    posted,
    agency: company || (tags.some((tag) => tag.toLowerCase() === "landlord") ? "Landlord" : ""),
    rent,
    saleableArea,
    pricePerSqft: round(pricePerSqft, 1),
    sitePricePerSqft: unitPriceFromSite,
    sqftPerHkd1000: round(sqftPerHkd1000, 1),
    tags,
    references: []
  };
}

async function fetchHtml(url) {
  const response = await fetch(url, { headers: REQUEST_HEADERS });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  return response.text();
}

async function loadPreviousListings() {
  try {
    const snapshot = JSON.parse(await readFile(LATEST_PATH, "utf8"));
    return new Map(
      (snapshot.listings ?? []).map((listing) => [
        listing.id,
        {
          firstSeenAt: listing.firstSeenAt,
          seenCount: listing.seenCount ?? 1
        }
      ])
    );
  } catch {
    return new Map();
  }
}

function rankListings(listings) {
  return [...listings].sort((a, b) => {
    if (a.pricePerSqft !== b.pricePerSqft) {
      return a.pricePerSqft - b.pricePerSqft;
    }

    if (a.rent !== b.rent) {
      return a.rent - b.rent;
    }

    return b.saleableArea - a.saleableArea;
  });
}

async function scan() {
  const scannedAt = new Date().toISOString();
  const previousListings = await loadPreviousListings();
  const seen = new Map();
  const errors = [];
  const districtTotals = [];
  let pagesFetched = 0;
  let expectedResults = 0;

  for (const district of DISTRICTS) {
    let districtResultCount = 0;
    let districtPageLimit = MAX_PAGES_PER_DISTRICT ?? 1;
    let districtPagesFetched = 0;
    let districtListingsParsed = 0;

    for (let page = 1; page <= districtPageLimit; page += 1) {
      const url = pageUrl(district.url, page);
      process.stdout.write(`Fetching ${district.label} page ${page}... `);

      try {
        const html = await fetchHtml(url);
        const listings = extractListingBlocks(html)
          .map((block) => parseListing(block, district))
          .filter(Boolean);

        pagesFetched += 1;
        districtPagesFetched += 1;
        districtListingsParsed += listings.length;

        if (page === 1) {
          districtResultCount = parseResultCount(html);
          expectedResults += districtResultCount;
          districtPageLimit = estimatedPageCount(districtResultCount);

          if (MAX_PAGES_PER_DISTRICT) {
            districtPageLimit = Math.min(districtPageLimit, MAX_PAGES_PER_DISTRICT);
          }
        }

        for (const listing of listings) {
          if (!seen.has(listing.id)) {
            const previous = previousListings.get(listing.id) ?? previousListings.get(listing.externalId);
            seen.set(listing.id, {
              ...listing,
              references: buildReferenceLinks(listing),
              firstSeenAt: previous?.firstSeenAt ?? scannedAt,
              lastSeenAt: scannedAt,
              seenCount: (previous?.seenCount ?? 0) + 1,
              isNew: !previous
            });
          }
        }

        process.stdout.write(`${listings.length} listings`);

        if (page === 1) {
          process.stdout.write(
            `, ${districtResultCount.toLocaleString("en-US")} reported results, ${districtPageLimit} pages planned`
          );
        }

        process.stdout.write("\n");

        if (page > 1 && listings.length === 0) {
          break;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push({ sourceId: "28hse", district: district.id, page, url, message });
        process.stdout.write(`failed: ${message}\n`);
      }

      if (REQUEST_DELAY_MS > 0) {
        await sleep(REQUEST_DELAY_MS);
      }
    }

    districtTotals.push({
      id: district.id,
      label: district.label,
      reportedResults: districtResultCount,
      pagesFetched: districtPagesFetched,
      listingsParsed: districtListingsParsed
    });
  }

  const listings = rankListings([...seen.values()]).map((listing, index) => ({
    ...listing,
    rank: index + 1
  }));
  const newListings = listings.filter((listing) => listing.isNew);
  const snapshot = {
    scannedAt,
    source: {
      name: "28HSE",
      url: "https://www.28hse.com/en/rent",
      robotsTxt: "https://www.28hse.com/robots.txt"
    },
    sources: buildSourceSummaries({ districtTotals, errors, listings, pagesFetched, expectedResults }),
    referenceSources: REFERENCE_SITES.map(({ name, url, robotsTxt }) => ({
      name,
      url,
      robotsTxt,
      mode: "Manual cross-check link"
    })),
    schedule: {
      intervalHours: 3,
      pageMode: MAX_PAGES_PER_DISTRICT
        ? `First ${MAX_PAGES_PER_DISTRICT} pages per district`
        : "All public result pages",
      maxPagesPerDistrict: MAX_PAGES_PER_DISTRICT,
      requestDelayMs: REQUEST_DELAY_MS
    },
    filters: {
      location: "Hong Kong Island",
      districts: DISTRICTS.map(({ id, label, url }) => ({ id, label, url })),
      type: "Apartment",
      rentType: "All",
      price: "All",
      areaBasis: "Saleable Area",
      areaRange: "All",
      bedrooms: "All",
      ranking: "Lowest rent per saleable square foot"
    },
    totals: {
      listings: listings.length,
      newListings: newListings.length,
      districts: DISTRICTS.length,
      expectedResults,
      pagesFetched,
      errors: errors.length,
      sources: TRACKED_SOURCES.length
    },
    districtTotals,
    errors,
    listings
  };

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(LATEST_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  await appendFile(
    HISTORY_PATH,
    `${JSON.stringify({
      scannedAt,
      totals: snapshot.totals,
      bestListingIds: listings.slice(0, 10).map((listing) => listing.id),
      newListingIds: newListings.slice(0, 50).map((listing) => listing.id),
      districtTotals
    })}\n`,
    "utf8"
  );

  return snapshot;
}

scan()
  .then((snapshot) => {
    const best = snapshot.listings[0];
    console.log(
      `Saved ${snapshot.totals.listings} listings to ${path.relative(ROOT_DIR, LATEST_PATH)}`
    );

    if (best) {
      console.log(
        `Best value: HKD$${best.rent.toLocaleString("en-US")} / ${best.saleableArea} sq ft = HKD$${best.pricePerSqft}/sq ft`
      );
      console.log(best.url);
    }
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
