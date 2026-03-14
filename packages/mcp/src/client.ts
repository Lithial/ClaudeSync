import WebSocket from "ws";
import {
  type Message,
  MessageTypes,
  createMessage,
  parseMessage,
  RECONNECT_INTERVAL_MS,
  MAX_RECONNECT_ATTEMPTS,
} from "@claude-sync/protocol";

export type MessageHandler = (msg: Message) => void;

export class SyncClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private handlers: MessageHandler[] = [];
  private _connected = false;
  private _closing = false;

  constructor(
    private readonly urlOrResolver: string | (() => Promise<string>),
    private readonly peerName: string,
  ) {}

  get connected(): boolean {
    return this._connected;
  }

  onMessage(handler: MessageHandler): void {
    this.handlers.push(handler);
  }

  async connect(): Promise<void> {
    const url = typeof this.urlOrResolver === "string"
      ? this.urlOrResolver
      : await this.urlOrResolver();

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);

      this.ws.on("open", () => {
        const registerMsg = createMessage(
          MessageTypes.PEER_REGISTER,
          this.peerName,
          "server",
          { name: this.peerName },
        );
        this.ws!.send(JSON.stringify(registerMsg));
        this._connected = true;
        this.reconnectAttempts = 0;
        resolve();
      });

      this.ws.on("message", (raw) => {
        try {
          const msg = parseMessage(raw.toString());
          // Auto-respond to pings
          if (msg.type === MessageTypes.PING) {
            this.send(createMessage(MessageTypes.PONG, this.peerName, msg.from, {
              pingId: msg.payload.pingId,
              sentAt: msg.payload.sentAt,
              receivedAt: Date.now(),
            }));
          }
          for (const handler of this.handlers) {
            handler(msg);
          }
        } catch {
          // Ignore unparseable messages
        }
      });

      this.ws.on("close", (code) => {
        this._connected = false;
        if (!this._closing && code !== 4006) {
          this.scheduleReconnect();
        }
      });

      this.ws.on("error", (err) => {
        this._connected = false;
        if (this.reconnectAttempts === 0) {
          reject(err);
        }
      });
    });
  }

  send(msg: Message): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Not connected");
    }
    this.ws.send(JSON.stringify(msg));
  }

  close(): void {
    this._closing = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._connected = false;
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      return;
    }
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(() => {
        // Will retry via close handler
      });
    }, RECONNECT_INTERVAL_MS);
  }
}
