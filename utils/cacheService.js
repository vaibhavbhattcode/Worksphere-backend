// utils/cacheService.js
// In-memory cache placeholder - simple Map used for lightweight caching
const cache = new Map(); // In-memory cache for demo

export const getCached = (key) => cache.get(key);
export const setCached = (key, value, ttl = 300) => {
  cache.set(key, { value, expiry: Date.now() + ttl * 1000 });
};

export const cleanExpired = () => {
  const now = Date.now();
  for (const [key, data] of cache) {
    if (data.expiry < now) cache.delete(key);
  }
};

// Set interval to clean expired cache every 5 minutes
setInterval(cleanExpired, 5 * 60 * 1000);
