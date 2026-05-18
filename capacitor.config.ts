import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.meiyue.salon",
  appName: "美约管家",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
};

export default config;
