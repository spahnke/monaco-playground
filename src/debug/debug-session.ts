import { Disposable } from "../common/disposable.js";
import { DebugProtocol, Transport } from "./debug-protocol.js";

export class DebugSession extends Disposable {
	private protocol: DebugProtocol | undefined;
	private readonly connectedEvent = this.register(new monaco.Emitter<boolean>());
	private readonly pausedEvent = this.register(new monaco.Emitter<boolean>());

	readonly onDidConnectedChange = this.connectedEvent.event;
	readonly onDidPausedStateChange = this.pausedEvent.event;

	async connect(connectTransport: () => Transport, pauseOnFirstStatement: boolean): Promise<void> {
		this.protocol = new DebugProtocol(connectTransport());
		this.protocol.transport.onDidTerminate((reason, error) => {
			if (reason === "close") {
				console.log("Transport connection was closed");
			} else {
				console.error("Transport connection was closed unexpectedly", error);
			}
			this.connectedEvent.fire(false);
		});
		this.protocol.runtime.on("executionContextCreated", params => {
			console.log("Debugging session started", params);
		});
		this.protocol.runtime.on("executionContextDestroyed", params => {
			console.log("Debugging session finished", params);
			this.disconnect();
		});
		this.protocol.runtime.on("consoleAPICalled", params => {
			const args = params.args.map(arg => {
				switch (arg.type) {
					case "bigint": return BigInt(arg.unserializableValue!.slice(0, -1));
					case "function": return arg.description ?? "<function>";
					case "object": {
						if (arg.subtype === "null") {
							return null;
						} else if (arg.preview) {
							if (arg.subtype) {
								return arg.description;
							} else {
								const obj = Object.create(null);
								for (const prop of arg.preview.properties) {
									let value;
									switch (prop.type) {
										case "bigint": value = BigInt(prop.value!.slice(0, -1)); break;
										case "boolean": value = Boolean(prop.value); break;
										case "number": value = Number(prop.value); break;
										default: value = prop.value; break;
									}
									obj[prop.name] = value;
								}
								return obj;
							}
						} else {
							return "<object>";
						}
					}
					case "symbol": return arg.description ?? "<symbol>";
					default: return arg.value;
				}
			});
			switch (params.type) {
				case "assert": console.assert(...args); break;
				case "warning": console.warn(...args); break;
				case "startGroup": console.group(...args); break;
				case "startGroupCollapsed": console.groupCollapsed(...args); break;
				case "endGroup": console.groupEnd(); break;
				case "profile": console.time(...args); break;
				case "profileEnd": console.timeEnd(...args); break;
				default: console[params.type](...args); break;
			}
		});
		this.protocol.debugger.on("scriptParsed", async params => {
			console.log("scriptParsed notification", params);
			const source = await this.protocol?.debugger.getScriptSource({ scriptId: params.scriptId });
			console.log("script src result", source);
		});
		this.protocol.debugger.on("paused", params => {
			console.log("paused notification", params);
			this.pausedEvent.fire(true);
		});
		this.protocol.debugger.on("resumed", () => {
			console.log("resumed notification");
			this.pausedEvent.fire(false);
		});
		await this.protocol.runtime.enable();
		console.log("Runtime.enable done");
		const enableResult = await this.protocol.debugger.enable({});
		console.log("Debugger.enable response", enableResult);
		if (pauseOnFirstStatement) {
			await this.protocol.debugger.pause();
			console.log("Scheduled pause on first statement");
		}
		await this.protocol.runtime.runIfWaitingForDebugger();
		this.connectedEvent.fire(true);
	}

	continue(): void {
		this.protocol?.debugger.resume({});
	}

	pause(): void {
		this.protocol?.debugger.pause();
	}

	stepOver(): void {
		this.protocol?.debugger.stepOver({});
	}

	stepInto(): void {
		this.protocol?.debugger.stepInto({});
	}

	stepOut(): void {
		this.protocol?.debugger.stepOut();
	}

	stop(): void {
		this.protocol?.debugger.resume({ terminateOnResume: true });
	}

	disconnect(): void {
		this.protocol?.transport.disconnect();
		this.protocol = undefined;
	}

	override dispose(): void {
		this.disconnect();
		super.dispose();
	}
}