import { Disposable } from "../common/disposable.js";
import { DebugProtocol, Transport } from "./debug-protocol.js";
import { type Protocol } from "./protocol";

export class DebugSession extends Disposable {
	private protocol?: DebugProtocol;
	private readonly activeEvent = this.register(new monaco.Emitter<boolean>());
	private readonly pausedEvent = this.register(new monaco.Emitter<boolean>());

	readonly onDidChangeActiveState = this.activeEvent.event;
	readonly onDidChangePausedState = this.pausedEvent.event;

	// TODO(seb) Temp shape of state accessible during pause states. Consolidate what we actually need for UI and look
	// into type/write safety.
	readonly scriptMetadata = new Map<string, Protocol.Debugger.ScriptParsedEvent>();
	readonly scriptModels = new Map<string, monaco.editor.ITextModel>();
	readonly urlToScriptId = new Map<string, string>();
	readonly wasmModules = new Map<string, Protocol.Debugger.DisassembleWasmModuleResponse>();
	executionContext?: Protocol.Runtime.ExecutionContextCreatedEvent;
	pauseState?: Protocol.Debugger.PausedEvent;

	private resetState(): void {
		this.protocol = undefined;
		this.scriptMetadata.clear();
		for (const model of this.scriptModels.values()) {
			model.dispose();
		}
		this.scriptModels.clear();
		this.urlToScriptId.clear();
		this.wasmModules.clear();
		this.executionContext = undefined;
		this.pauseState = undefined;
	}

	async connect(transport: Transport): Promise<void> {
		this.activeEvent.fire(true);
		this.protocol = new DebugProtocol(transport);
		this.protocol.transport.onDidTerminate((reason, error) => {
			if (reason === "close") {
				console.log("Transport connection was closed");
			} else {
				console.error("Transport connection was closed unexpectedly", error);
			}
			this.activeEvent.fire(false);
			this.resetState();
		});
		this.protocol.runtime.on("executionContextCreated", params => {
			console.log("Debugging session started");
			this.executionContext = params;
		});
		this.protocol.runtime.on("executionContextDestroyed", () => {
			console.log("Debugging session finished");
			this.executionContext = undefined;
			this.disconnect();
		});
		this.protocol.runtime.on("consoleAPICalled", DebugSession.handleConsoleApiCall);
		this.protocol.debugger.on("scriptParsed", params => {
			this.scriptMetadata.set(params.scriptId, params);
			if (params.url) {
				this.urlToScriptId.set(params.url, params.scriptId);
			}
		});
		this.protocol.debugger.on("paused", async (params) => {
			this.pauseState = params;
			const scriptId = params.callFrames[0].location.scriptId;
			const metadata = this.scriptMetadata.get(scriptId);
			if (metadata && !this.scriptModels.has(scriptId)) {
				if (metadata.scriptLanguage === "JavaScript") {
					const scriptSource = await this.protocol!.debugger.getScriptSource({ scriptId });
					// NOTE(seb) In the createModel call, the uri parameter wins over language and since we don't
					// necessarily have a proper file extension the model will be plaintext. So set the language
					// manually afterwards.
					const model = monaco.editor.createModel(scriptSource.scriptSource, undefined, metadata.url ? monaco.Uri.parse(metadata.url) : undefined);
					monaco.editor.setModelLanguage(model, "javascript");
					this.scriptModels.set(scriptId, model);
				} else if (metadata.scriptLanguage === "WebAssembly") {
					const wasmModule = await this.protocol!.debugger.disassembleWasmModule({ scriptId });
					const wat = wasmModule.chunk.lines.join("\n");
					const model = monaco.editor.createModel(wat, undefined, metadata.url ? monaco.Uri.parse(metadata.url) : undefined);
					// TODO(seb) Add syntax definition for WAT
					monaco.editor.setModelLanguage(model, "wat");
					this.scriptModels.set(scriptId, model);
					this.wasmModules.set(scriptId, wasmModule);
				}
			}
			this.pausedEvent.fire(true);
		});
		this.protocol.debugger.on("resumed", () => {
			// TODO(seb) Do we want to clear this or leave it accessible to the UI for rendering?
			this.pauseState = undefined;
			this.pausedEvent.fire(false);
		});
		if (await this.protocol.transport.connect()) {
			await this.protocol.runtime.enable();
			await this.protocol.debugger.enable({});
			await this.protocol.runtime.runIfWaitingForDebugger();
		}
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
	}

	override dispose(): void {
		this.disconnect();
		this.resetState();
		super.dispose();
	}

	private static handleConsoleApiCall(params: Protocol.Runtime.ConsoleAPICalledEvent): void {
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
	}
}