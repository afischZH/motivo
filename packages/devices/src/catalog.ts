import type { Device, DeviceGroup, SafeZone } from "./types";

/*
 * Native resolutions follow the vendors' published display specifications
 * (Apple tech specs, Google Pixel and Samsung spec pages). Re-check them
 * every autumn when new models ship. Safe zones are deliberately generous
 * approximations per device group, not measured per model: they only guide
 * composition (keep the focal point away from the clock) and are never
 * drawn into an export.
 */

const PHONE_ZONES: readonly SafeZone[] = [
  { kind: "statusBar", rect: { x: 0, y: 0, width: 1, height: 0.06 } },
  { kind: "clock", rect: { x: 0.1, y: 0.08, width: 0.8, height: 0.22 } },
  { kind: "dock", rect: { x: 0, y: 0.95, width: 1, height: 0.05 } },
];

const ANDROID_ZONES: readonly SafeZone[] = [
  { kind: "statusBar", rect: { x: 0, y: 0, width: 1, height: 0.05 } },
  { kind: "clock", rect: { x: 0.05, y: 0.06, width: 0.9, height: 0.2 } },
  { kind: "dock", rect: { x: 0, y: 0.94, width: 1, height: 0.06 } },
];

const TABLET_ZONES: readonly SafeZone[] = [
  { kind: "statusBar", rect: { x: 0, y: 0, width: 1, height: 0.03 } },
  { kind: "clock", rect: { x: 0.2, y: 0.06, width: 0.6, height: 0.18 } },
  { kind: "dock", rect: { x: 0.15, y: 0.9, width: 0.7, height: 0.1 } },
];

const MAC_ZONES: readonly SafeZone[] = [
  { kind: "menuBar", rect: { x: 0, y: 0, width: 1, height: 0.03 } },
  { kind: "dock", rect: { x: 0.2, y: 0.91, width: 0.6, height: 0.09 } },
];

const DESKTOP_ZONES: readonly SafeZone[] = [
  { kind: "dock", rect: { x: 0, y: 0.95, width: 1, height: 0.05 } },
];

type DeviceSpec = Omit<Device, "group" | "safeZones">;

function inGroup(
  group: DeviceGroup,
  safeZones: readonly SafeZone[],
  specs: readonly DeviceSpec[],
): Device[] {
  return specs.map((spec) => ({ ...spec, group, safeZones }));
}

/** All devices, grouped, newest first within each group. */
export const DEVICES: readonly Device[] = [
  ...inGroup("iphone", PHONE_ZONES, [
    {
      id: "iphone-pro-max-6-9",
      name: "iPhone 17 Pro Max, 16 Pro Max",
      width: 1320,
      height: 2868,
      pixelRatio: 3,
      year: 2025,
    },
    { id: "iphone-air", name: "iPhone Air", width: 1260, height: 2736, pixelRatio: 3, year: 2025 },
    {
      id: "iphone-6-3",
      name: "iPhone 17, 17 Pro, 16 Pro",
      width: 1206,
      height: 2622,
      pixelRatio: 3,
      year: 2025,
    },
    {
      id: "iphone-plus-6-7",
      name: "iPhone 16 Plus, 15 Plus, 15 Pro Max",
      width: 1290,
      height: 2796,
      pixelRatio: 3,
      year: 2024,
    },
    {
      id: "iphone-6-1",
      name: "iPhone 16, 15, 15 Pro, 14 Pro",
      width: 1179,
      height: 2556,
      pixelRatio: 3,
      year: 2024,
    },
    {
      id: "iphone-6-1-classic",
      name: "iPhone 16e, 14, 13, 12",
      width: 1170,
      height: 2532,
      pixelRatio: 3,
      year: 2025,
    },
    { id: "iphone-se", name: "iPhone SE", width: 750, height: 1334, pixelRatio: 2, year: 2022 },
  ]),
  ...inGroup("android", ANDROID_ZONES, [
    {
      id: "galaxy-s-ultra",
      name: "Galaxy S25 Ultra",
      width: 1440,
      height: 3120,
      pixelRatio: 3.5,
      year: 2025,
    },
    { id: "galaxy-s", name: "Galaxy S25", width: 1080, height: 2340, pixelRatio: 3, year: 2025 },
    {
      id: "pixel-pro-xl",
      name: "Pixel 9 Pro XL",
      width: 1344,
      height: 2992,
      pixelRatio: 3.5,
      year: 2024,
    },
    {
      id: "pixel-pro",
      name: "Pixel 9 Pro",
      width: 1280,
      height: 2856,
      pixelRatio: 3.5,
      year: 2024,
    },
    { id: "pixel", name: "Pixel 9", width: 1080, height: 2424, pixelRatio: 2.625, year: 2024 },
    {
      id: "android-fhd",
      name: "Android Full HD+",
      width: 1080,
      height: 2400,
      pixelRatio: 2.75,
      year: 2023,
    },
  ]),
  ...inGroup("tablet", TABLET_ZONES, [
    {
      id: "ipad-pro-13",
      name: 'iPad Pro 13"',
      width: 2064,
      height: 2752,
      pixelRatio: 2,
      year: 2024,
    },
    {
      id: "ipad-pro-11",
      name: 'iPad Pro 11"',
      width: 1668,
      height: 2420,
      pixelRatio: 2,
      year: 2024,
    },
    {
      id: "ipad-air-13",
      name: 'iPad Air 13"',
      width: 2048,
      height: 2732,
      pixelRatio: 2,
      year: 2025,
    },
    {
      id: "ipad-11",
      name: 'iPad Air 11", iPad',
      width: 1640,
      height: 2360,
      pixelRatio: 2,
      year: 2025,
    },
    { id: "ipad-mini", name: "iPad mini", width: 1488, height: 2266, pixelRatio: 2, year: 2024 },
    {
      id: "galaxy-tab-ultra",
      name: "Galaxy Tab S10 Ultra",
      width: 1848,
      height: 2960,
      pixelRatio: 2,
      year: 2024,
    },
  ]),
  ...inGroup("laptop", MAC_ZONES, [
    {
      id: "macbook-pro-16",
      name: 'MacBook Pro 16"',
      width: 3456,
      height: 2234,
      pixelRatio: 2,
      year: 2024,
    },
    {
      id: "macbook-pro-14",
      name: 'MacBook Pro 14"',
      width: 3024,
      height: 1964,
      pixelRatio: 2,
      year: 2024,
    },
    {
      id: "macbook-air-15",
      name: 'MacBook Air 15"',
      width: 2880,
      height: 1864,
      pixelRatio: 2,
      year: 2025,
    },
    {
      id: "macbook-air-13",
      name: 'MacBook Air 13"',
      width: 2560,
      height: 1664,
      pixelRatio: 2,
      year: 2025,
    },
  ]),
  ...inGroup("monitor", DESKTOP_ZONES, [
    {
      id: "monitor-6k",
      name: "6K (Pro Display XDR)",
      width: 6016,
      height: 3384,
      pixelRatio: 2,
      year: 2019,
    },
    {
      id: "monitor-5k",
      name: "5K (Studio Display)",
      width: 5120,
      height: 2880,
      pixelRatio: 2,
      year: 2022,
    },
    // 4K is usually scaled 150 % (Windows) or 200 % (macOS); 2 keeps lines as thick as on screen.
    { id: "monitor-4k", name: "4K UHD", width: 3840, height: 2160, pixelRatio: 2, year: 2015 },
    { id: "monitor-qhd", name: "QHD 1440p", width: 2560, height: 1440, pixelRatio: 1, year: 2015 },
    {
      id: "monitor-wuxga",
      name: "WUXGA 16:10",
      width: 1920,
      height: 1200,
      pixelRatio: 1,
      year: 2010,
    },
    {
      id: "monitor-fhd",
      name: "Full HD 1080p",
      width: 1920,
      height: 1080,
      pixelRatio: 1,
      year: 2010,
    },
  ]),
  ...inGroup("ultrawide", DESKTOP_ZONES, [
    {
      id: "ultrawide-5k2k",
      name: "Ultrawide 5K2K",
      width: 5120,
      height: 2160,
      pixelRatio: 1,
      year: 2023,
    },
    {
      id: "ultrawide-dqhd",
      name: "Super ultrawide 32:9",
      width: 5120,
      height: 1440,
      pixelRatio: 1,
      year: 2020,
    },
    {
      id: "ultrawide-uwqhd",
      name: "Ultrawide 21:9 QHD",
      width: 3440,
      height: 1440,
      pixelRatio: 1,
      year: 2016,
    },
    {
      id: "ultrawide-uwfhd",
      name: "Ultrawide 21:9 Full HD",
      width: 2560,
      height: 1080,
      pixelRatio: 1,
      year: 2014,
    },
  ]),
];

const BY_ID = new Map(DEVICES.map((device) => [device.id, device]));

export function getDevice(id: string): Device | undefined {
  return BY_ID.get(id);
}

export function devicesInGroup(group: DeviceGroup): Device[] {
  return DEVICES.filter((device) => device.group === group);
}
