import { Bonjour, type Service } from "bonjour-service";
import { MDNS_SERVICE_TYPE, MDNS_DISCOVERY_TIMEOUT_MS } from "@claude-sync/protocol";

export interface DiscoveredRelay {
  url: string;
  name: string;
  host: string;
  port: number;
}

export function discoverRelay(preferredName?: string, timeoutMs = MDNS_DISCOVERY_TIMEOUT_MS): Promise<DiscoveredRelay> {
  return new Promise((resolve, reject) => {
    const bonjour = new Bonjour();
    const browser = bonjour.find({ type: MDNS_SERVICE_TYPE }, (service: Service) => {
      if (preferredName && service.name !== preferredName) return;
      const host = service.addresses?.[0] ?? service.host;
      browser.stop();
      bonjour.destroy();
      resolve({ url: `ws://${host}:${service.port}`, name: service.name, host, port: service.port });
    });
    setTimeout(() => {
      browser.stop();
      bonjour.destroy();
      reject(new Error("No claude-sync relay found. Set CLAUDE_SYNC_URL to connect manually."));
    }, timeoutMs);
  });
}
