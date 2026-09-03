export interface PositionResult {
  latitude: number;
  longitude: number;
  accuracy: number;
}

function isIOSDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function locationHelpMessage(error: GeolocationPositionError) {
  const iosHelp = ' On iPhone: open Settings > Privacy & Security > Location Services and turn it on. Then go to Settings > Safari > Location and choose Ask/Allow. In Safari, open staff.mezzomaths.org, tap AA or the website settings icon, choose Website Settings, and set Location to Allow. Do not use Private Browsing for attendance.';
  const androidHelp = ' On Android: open Chrome, tap the lock icon beside staff.mezzomaths.org, open Permissions, and allow Location.';
  const help = isIOSDevice() ? iosHelp : androidHelp;

  if (error.code === error.PERMISSION_DENIED) return `Location permission was denied or blocked.${help}`;
  if (error.code === error.POSITION_UNAVAILABLE) return `The phone could not get a GPS location. Turn on Location Services, mobile data or Wi-Fi, then stand in an open area and try again.${help}`;
  if (error.code === error.TIMEOUT) return `Getting location took too long. Turn on Location Services, mobile data or Wi-Fi, then try again.${help}`;
  return `${error.message || 'Unable to get current location.'}${help}`;
}

function requestPosition(options: PositionOptions) {
  return new Promise<PositionResult>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      reject,
      options
    );
  });
}

export async function getCurrentPosition(): Promise<PositionResult> {
  if (!('geolocation' in navigator)) {
    throw new Error('Geolocation is not supported on this device. Use a phone/browser with location support.');
  }

  if (typeof window !== 'undefined' && !window.isSecureContext) {
    throw new Error('Location only works on a secure HTTPS website. Open https://staff.mezzomaths.org, not an http link.');
  }

  try {
    if ('permissions' in navigator && (navigator as any).permissions?.query) {
      const permission = await (navigator as any).permissions.query({ name: 'geolocation' });
      if (permission?.state === 'denied') {
        throw new Error(isIOSDevice()
          ? 'Location is blocked for Safari or this website. Open iPhone Settings > Privacy & Security > Location Services, then Settings > Safari > Location and allow it for staff.mezzomaths.org.'
          : 'Location is blocked for this website. Open browser site permissions and allow Location for staff.mezzomaths.org.');
      }
    }
  } catch (error: any) {
    if (error?.message?.includes('Location is blocked')) throw error;
  }

  try {
    return await requestPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  } catch (firstError: any) {
    if (firstError?.code === 1) throw new Error(locationHelpMessage(firstError));
    try {
      return await requestPosition({ enableHighAccuracy: false, timeout: 30000, maximumAge: 60000 });
    } catch (secondError: any) {
      throw new Error(locationHelpMessage(secondError?.code ? secondError : firstError));
    }
  }
}

export function distanceInMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radius = 6371000;
  const toRadians = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(radius * c);
}

export function todayGhanaDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Accra',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function nextFourPmGhana() {
  const now = new Date();
  const ghanaDate = todayGhanaDate();
  const target = new Date(`${ghanaDate}T16:00:00Z`);
  return target.getTime() > now.getTime() ? target : null;
}
