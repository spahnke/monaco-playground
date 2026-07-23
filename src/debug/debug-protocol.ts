// See
// - https://chromedevtools.github.io/devtools-protocol/
// - https://chromedevtools.github.io/devtools-protocol/1-3/
// - https://github.com/ChromeDevTools/devtools-protocol/ for the types

import { type ProtocolProxyApi } from "./protocol-proxy-api";

interface ProtocolApiMap {
	Debugger: ProtocolProxyApi.DebuggerApi;
	Runtime: ProtocolProxyApi.RuntimeApi;
}

interface DebugProtocolRequest {
	id: number;
	method: string;
	params: unknown;
}

interface PendingDebugProtocolResponse {
	id: number;
	resolve(response: unknown): void;
	reject(reason?: any): void;
}

interface DebugProtocolResponseSuccess {
	id: number;
	result: unknown;
}

interface DebugProtocolResponseError {
	id: number;
	error: { code: number; message: string; };
}

type DebugProtocolResponse = DebugProtocolResponseSuccess | DebugProtocolResponseError;

interface DebugProtocolNotification {
	method: string;
	params: unknown;
}

type DebugProtocolMessage = DebugProtocolResponse | DebugProtocolNotification;

export class DebugProtocol {
	private messageId = 1;
	private readonly notificationListeners = new Map<string, (params: unknown) => void>();
	private readonly pendingResponses = new Map<number, PendingDebugProtocolResponse>(); // TODO(seb) Can this be a fixed sized array that we wrap around?

	constructor(readonly transport: Transport) {
		transport.onDidReceiveMessage(message => this.onDidReceiveMessage(message));
		transport.onDidTerminate((reason, error) => {
			for (const pendingResponse of this.pendingResponses.values()) {
				pendingResponse.reject(reason === "close" ? "canceled" : error);
			}
			this.pendingResponses.clear();
			this.notificationListeners.clear();
		});
	}

	debugger = this.createProxy("Debugger");
	runtime = this.createProxy("Runtime");

	private createProxy<T extends keyof ProtocolApiMap>(api: T): ProtocolApiMap[T] {
		//@ts-ignore
		return new Proxy(this, {
			get(target, prop, receiver) {
				if (prop === "on") {
					return (event: string, listener: (params: unknown) => void) => target.notificationListeners.set(api + "." + event, listener);
				} else if (typeof prop === "string") {
					return (params: unknown) => target.sendRequest(api + "." + prop, params);
				} else {
					return undefined;
				}
			},
		});
	}

	private onDidReceiveMessage(data: string) {
		const message: DebugProtocolMessage = JSON.parse(data);
		if ("id" in message) {
			const pendingResponse = this.pendingResponses.get(message.id);
			if (pendingResponse && pendingResponse.id === message.id) {
				this.pendingResponses.delete(message.id);
				if ("error" in message) {
					console.error(message.error);
					pendingResponse.reject();
				} else {
					pendingResponse.resolve(message.result);
				}
			} else {
				console.error(`No or wrong pending response found for id ${message.id}`, pendingResponse);
			}
		} else {
			this.notificationListeners.get(message.method)?.(message.params);
		}
	}

	private sendRequest(method: string, params: unknown): Promise<unknown> {
		const request: DebugProtocolRequest = {
			id: this.messageId++,
			method,
			params,
		};
		const { promise, resolve, reject } = Promise.withResolvers();
		this.pendingResponses.set(request.id, { id: request.id, resolve, reject });
		this.transport.sendMessage(JSON.stringify(request));
		return promise;
	}
}

export interface Transport {
	connect(): Promise<boolean>;
	sendMessage(message: string): void;
	onDidReceiveMessage(listener: (message: string) => void): void;
	onDidTerminate(listener: (reason: "close" | "error", error?: any) => void): void;
	disconnect(): void;
}

export class WebsocketTransport implements Transport {
	private readonly address: string;
	private readonly messageListeners: ((message: string) => void)[] = [];
	private readonly terminateListeners: ((reason: "close" | "error", error?: any) => void)[] = [];
	private ws?: WebSocket;

	constructor(address: string) {
		this.address = address;
	}

	connect(): Promise<boolean> {
		const barrier = Promise.withResolvers<boolean>();
		this.ws = new WebSocket(this.address);
		this.ws.addEventListener("open", () => barrier.resolve(true));
		this.ws.addEventListener("message", ev => {
			for (const listener of this.messageListeners) {
				listener(ev.data);
			}
		});
		this.ws.addEventListener("close", () => {
			for (const listener of this.terminateListeners) {
				listener("close");
			}
			this.disconnect();
			barrier.resolve(false);
		});
		this.ws.addEventListener("error", ev => {
			for (const listener of this.terminateListeners) {
				listener("error", ev);
			}
			this.disconnect();
			barrier.resolve(false);
		});
		return barrier.promise;
	}

	sendMessage(data: string) {
		if (!this.ws) {
			throw new Error("Not connected");
		}
		if (this.ws.readyState === WebSocket.OPEN) {
			this.ws.send(data);
		}
	}

	onDidReceiveMessage(listener: (message: string) => void) {
		this.messageListeners.push(listener);
	}

	onDidTerminate(listener: (reason: "close" | "error", error?: any) => void) {
		this.terminateListeners.push(listener);
	}

	disconnect() {
		this.ws?.close();
		this.ws = undefined;
	}
}