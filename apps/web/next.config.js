/** @type {import('next').NextConfig} */

// The root .env is not picked up here -- next reads .env from ITS OWN project
// root (apps/web), not the workspace root, so process.env.WEATHER_API_KEY came
// back undefined and every provider request 401'd. Putting the keys in the env
// block below makes them available to the server components and the client.
const nextConfig = {
  reactStrictMode: true,
  env: {
    WEATHER_API_KEY: '0ef942eaa3092d70b2a7c7856b7a10ee',
    NEXT_PUBLIC_WEATHER_API_KEY: '0ef942eaa3092d70b2a7c7856b7a10ee',
  },
};
module.exports = nextConfig;
