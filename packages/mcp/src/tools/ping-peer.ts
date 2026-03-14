import type { SyncClient } from "../client.js";
import { MessageTypes, createMessage, type Message } from "@claude-sync/protocol";

export interface PingResult {
  peer: string;
  roundTripMs: number;
  remoteReceivedAt: number;
}

export async function pingPeer(
  client: SyncClient,
  peerName: string,
  target: string,
  timeout = 5000,
): Promise<PingResult> {
  return new Promise((resolve, reject) => {
    const pingId = crypto.randomUUID();
    const sentAt = Date.now();

    const timer = setTimeout(() => {
      reject(new Error(`Ping to "${target}" timed out after ${timeout}ms`));
    }, timeout);

    const handler = (msg: Message) => {
      if (msg.type === MessageTypes.PONG && msg.payload.pingId === pingId) {
        clearTimeout(timer);
        resolve({
          peer: target,
          roundTripMs: Date.now() - sentAt,
          remoteReceivedAt: msg.payload.receivedAt,
        });
      }
    };

    client.onMessage(handler);
    client.send(createMessage(MessageTypes.PING, peerName, target, { pingId, sentAt }));
  });
}
