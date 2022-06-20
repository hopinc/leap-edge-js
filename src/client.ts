import { Heartbeat, Hello } from "./messages/control";
import { EncapsulatingPayload } from "./messages/payload";
import { OpCode, PayloadType } from "./messages/opcodes";
import { errorMap, unknownError, LeapError } from "./messages/errors";

const ENDPOINT = "wss://leap-stg.hop.io/ws";
// const ENDPOINT = "ws://localhost:4001/ws";

const WebSocket =
  typeof window === "undefined" ? require("ws") : window.WebSocket;

export class LeapEdgeClient {
  public token: string;
  private endpoint: string;
  private socket: WebSocket | null;
  private heartbeat: ReturnType<typeof setTimeout> | null;

  constructor(token: string) {
    this.token = token;
    this.endpoint = ENDPOINT;
    this.socket = null;
    this.heartbeat = null;
  }

  /**
   * Connect to Leap Edge
   */
  public connect = () => {
    if (this.socket) return;

    this.socket = new WebSocket(this.endpoint);
    if (!this.socket) return;

    this.socket.addEventListener("message", this._handleSocketMessage);
    this.socket.addEventListener("close", this._handleSocketClose);
  };

  private sendPayload = (op: number, d: any = null): void => {
    void this.encodeSend(d ? { op, d } : { op });
  };

  private encodeSend = (d: unknown) => {
    if (!this.socket) return;
    console.log("send:", d);
    this.socket.send(JSON.stringify(d));
  };

  private _handleSocketClose = (e: CloseEvent) => {
    if (this.heartbeat) clearInterval(this.heartbeat);

    this.socket = null;
    this.heartbeat = null;

    const errorCode = e.code as LeapError;
    const error = errorMap[errorCode] || unknownError;

    console.warn("[Leap Edge] Client disconnected unexpectedly:", error);

    switch (errorCode) {
      case LeapError.BAD_ROUTE: {
        this.endpoint = e.reason;
        this.connect();
        break;
      }
      default: {
        if (error.reconnect) this.connect();
        break;
      }
    }
  };

  private _handleSocketMessage = (m: MessageEvent<any>) => {
    const data: EncapsulatingPayload = JSON.parse(m.data);
    if (data.op == null) {
      return console.warn("leap edge received badly formatted payload:", data);
    }

    console.log("recv:", data);

    this._handleOpcode(data.op, data.d);
  };

  private _handleOpcode = <T extends keyof PayloadType>(
    opcode: T,
    data: PayloadType[T]
  ) => {
    switch (opcode) {
      case OpCode.HELLO: {
        this._setupHeartbeat((<Hello>data).heartbeat_interval);
        this._identify();
        break;
      }
      case OpCode.HEARTBEAT: {
        this.sendPayload(OpCode.HEARTBEAT, { tag: (<Heartbeat>data).tag });
        break;
      }
    }
  };

  private _identify = () => {
    this.sendPayload(OpCode.IDENTIFY, {
      project_id: "project_0",
      token: this.token,
    });
  };

  private _setupHeartbeat = (int: number) => {
    this.heartbeat = setInterval(() => {
      this.sendPayload(OpCode.HEARTBEAT);
    }, int);
  };
}
