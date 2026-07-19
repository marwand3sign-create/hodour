/**
 * Replacement for the Whacka `maps` SDK stub — plain browser Geolocation
 * wrapper, no backend involved.
 */
export const maps = {
  getCurrentLocation: () =>
    new Promise((resolve, reject) => {
      if (!navigator.geolocation) { reject(new Error('الموقع الجغرافي غير مدعوم في هذا المتصفح')); return }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => reject(err),
        { enableHighAccuracy: true, timeout: 10000 }
      )
    }),
}
