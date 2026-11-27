import type { CapacitorConfig } from '@capacitor/cli';

const serverUrl = process.env.CAPACITOR_SERVER_URL;

const config: CapacitorConfig = {
  appId: 'in.genzbroker.app',
  appName: 'GENZ Broker Network',
  webDir: 'dist',
  server: serverUrl
    ? {
        url: serverUrl,
        cleartext: true,
      }
    : {
        androidScheme: 'http',
        cleartext: true,
      },
  android: {
    allowMixedContent: true,
  },
};

export default config;
