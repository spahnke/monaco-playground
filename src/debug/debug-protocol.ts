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
	reject(): void;
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
		const pendingResponse = new Promise((resolve, reject) => this.pendingResponses.set(request.id, { id: request.id, resolve, reject }));
		this.transport.sendMessage(JSON.stringify(request));
		return pendingResponse;
	}
}

export interface Transport {
	sendMessage(message: string): void;
	onDidReceiveMessage(listener: (message: string) => void): void;
	onDidTerminate(listener: (reason: "close" | "error", error?: any) => void): void;
	disconnect(): void;
}

export class WebsocketTransport implements Transport {
	private readonly ws: WebSocket;
	private readonly openBarrier: Promise<void>;

	constructor(address: string) {
		this.ws = new WebSocket(address);
		this.openBarrier = new Promise(resolve => this.ws.addEventListener("open", () => resolve()));
	}

	sendMessage(data: string) {
		this.openBarrier.then(() => {
			if (this.ws.readyState === this.ws.OPEN) {
				this.ws.send(data);
			}
		});
	}

	onDidReceiveMessage(listener: (message: string) => void) {
		this.ws.addEventListener("message", ev => listener(ev.data));
	}

	onDidTerminate(listener: (reason: "close" | "error", error?: any) => void) {
		this.ws.addEventListener("close", () => listener("close"));
		this.ws.addEventListener("error", ev => listener("error", ev));
	}

	disconnect() {
		this.ws.close();
	}
}