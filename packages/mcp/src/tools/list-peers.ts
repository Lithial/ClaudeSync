import type { SyncClient } from "../client.js";
import { MessageTypes, createMessage, type Message, type PeerInfo } from "@claude-sync/protocol";

export async function listPeers(client: SyncClient, peerName: string): Promise<PeerInfo[]> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Peer list request timed out"));
    }, 5000);

    const handler = (msg: Message) => {
      if (msg.type === MessageTypes.PEER_LIST_RESPONSE) {
        clearTimeout(timeout);
        resolve(msg.payload.peers);
      }
    };

    client.onMessage(handler);
    client.send(createMessage(MessageTypes.PEER_LIST, peerName, "server", {}));
  });
}
