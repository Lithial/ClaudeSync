export const MessageTypes = {
  PEER_REGISTER: "peer:register",
  PEER_LIST: "peer:list",
  PEER_LIST_RESPONSE: "peer:list:response",
  PEER_JOINED: "peer:joined",
  PEER_LEFT: "peer:left",
  TASK_REQUEST: "task:request",
  TASK_RESULT: "task:result",
  TASK_STATUS: "task:status",
  ERROR: "error",
} as const;

export type MessageType = (typeof MessageTypes)[keyof typeof MessageTypes];

export interface Envelope {
  id: string;
  type: MessageType;
  from: string;
  to: string | null;
  timestamp: number;
}

export interface PeerRegisterPayload {
  name: string;
  token: string;
}

export interface PeerInfo {
  name: string;
  connectedAt: number;
}

export interface PeerListResponsePayload {
  peers: PeerInfo[];
}

export interface PeerEventPayload {
  name: string;
}

export interface TaskContext {
  branch?: string;
  repo?: string;
  files?: string[];
}

export interface TaskRequestPayload {
  taskId: string;
  description: string;
  instructions: string;
  context?: TaskContext;
  timeout?: number;
}

export type TaskStatus = "success" | "failure" | "error";

export interface TaskResultPayload {
  taskId: string;
  status: TaskStatus;
  summary: string;
  details?: string;
}

export interface TaskStatusPayload {
  taskId: string;
  status: "received" | "in-progress";
  message?: string;
}

export interface ErrorPayload {
  code: string;
  message: string;
}

export type Message =
  | (Envelope & { type: typeof MessageTypes.PEER_REGISTER; payload: PeerRegisterPayload })
  | (Envelope & { type: typeof MessageTypes.PEER_LIST; payload: Record<string, never> })
  | (Envelope & { type: typeof MessageTypes.PEER_LIST_RESPONSE; payload: PeerListResponsePayload })
  | (Envelope & { type: typeof MessageTypes.PEER_JOINED; payload: PeerEventPayload })
  | (Envelope & { type: typeof MessageTypes.PEER_LEFT; payload: PeerEventPayload })
  | (Envelope & { type: typeof MessageTypes.TASK_REQUEST; payload: TaskRequestPayload })
  | (Envelope & { type: typeof MessageTypes.TASK_RESULT; payload: TaskResultPayload })
  | (Envelope & { type: typeof MessageTypes.TASK_STATUS; payload: TaskStatusPayload })
  | (Envelope & { type: typeof MessageTypes.ERROR; payload: ErrorPayload });

export function createEnvelope(
  type: MessageType,
  from: string,
  to: string | null = null,
): Envelope {
  return {
    id: crypto.randomUUID(),
    type,
    from,
    to,
    timestamp: Date.now(),
  };
}

export function createMessage<T extends Message["type"]>(
  type: T,
  from: string,
  to: string | null,
  payload: Extract<Message, { type: T }>["payload"],
): Extract<Message, { type: T }> {
  return {
    ...createEnvelope(type, from, to),
    payload,
  } as Extract<Message, { type: T }>;
}

export function parseMessage(raw: string): Message {
  const msg = JSON.parse(raw);
  if (!msg.id || !msg.type || !msg.from || msg.timestamp == null || !msg.payload) {
    throw new Error("Invalid message: missing required fields");
  }
  if (!Object.values(MessageTypes).includes(msg.type)) {
    throw new Error(`Unknown message type: ${msg.type}`);
  }
  return msg as Message;
}
