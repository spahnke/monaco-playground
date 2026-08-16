import { Disposable } from "../common/disposable.js";
import { DebugProtocol, Transport } from "./debug-protocol.js";
import { type Protocol } from "./protocol";

interface Script {
	metadata: Protocol.Debugger.ScriptParsedEvent;
	model: monaco.editor.ITextModel;
	sourceWasLoaded: boolean;
	wasm?: Protocol.Debugger.DisassembleWasmModuleResponse;
}

export class DebugSession extends Disposable {
	private protocol?: DebugProtocol;
	private readonly activeEvent = this.register(new monaco.Emitter<boolean>());
	private readonly pausedEvent = this.register(new monaco.Emitter<boolean>());

	readonly onDidChangeActiveState = this.activeEvent.event;
	readonly onDidChangePausedState = this.pausedEvent.event;

	// TODO(seb) Temp shape of state accessible during pause states. Consolidate what we actually need for UI and look
	// into type/write safety.
	private executionContext?: Protocol.Runtime.ExecutionContextCreatedEvent;
	private pauseState?: Protocol.Debugger.PausedEvent;
	private readonly noScriptModel = monaco.editor.createModel("No script available");
	private readonly scripts = new Map<string, Script>();
	private readonly uriToScriptId = new Map<string, string>();
	private readonly breakpoints = new Map<string, Protocol.Debugger.SetBreakpointResponse[]>();

	private resetState(): void {
		this.protocol = undefined;
		for (const script of this.scripts.values()) {
			script.model.dispose();
		}
		this.scripts.clear();
		this.uriToScriptId.clear();
		this.breakpoints.clear();
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
			if (params.url) {
				// NOTE(seb) Only collect scripts with an actual url/name. Scripts without url are typically coming from
				// expressions evaluated on the fly during debugging and are ephemeral.
				const model = monaco.editor.createModel("No source code available", undefined, monaco.Uri.file(params.url));
				this.scripts.set(params.scriptId, { metadata: params, model, sourceWasLoaded: false });
				this.uriToScriptId.set(model.uri.toString(), params.scriptId);
			}
		});
		this.protocol.debugger.on("paused", async (params) => {
			if (params.reason === "exception") {
				console.error(params.data?.description ?? "Unknown exception");
			}
			this.pauseState = params;
			this.pausedEvent.fire(true);
		});
		this.protocol.debugger.on("resumed", () => {
			this.pauseState = undefined;
			this.pausedEvent.fire(false);
		});
		if (await this.protocol.transport.connect()) {
			await this.protocol.runtime.enable();
			await this.protocol.debugger.enable({});
			await this.protocol.debugger.setPauseOnExceptions({ state: "all" });
			await this.protocol.runtime.runIfWaitingForDebugger();
		}
	}

	continue(): void {
		this.protocol?.debugger.resume({});
	}

	getCallframes(): string[] {
		const callframes: string[] = [];
		if (this.pauseState) {
			for (const callframe of this.pauseState.callFrames) {
				const script = this.scripts.get(callframe.location.scriptId);
				if (script) {
					if (script.metadata.scriptLanguage === "JavaScript") {
						callframes.push(`${script.metadata.url}:${callframe.location.lineNumber + 1}`);
					} else if (script.metadata.scriptLanguage === "WebAssembly") {
						// TODO(seb) Can we convert this offset to a proper line number? Is that useful? Keep the offset in addition to line number?
						callframes.push(`${script.metadata.url}:${callframe.location.columnNumber}`);
					}
				}
			}
		}
		return callframes;
	}

	getScriptUris(): monaco.Uri[] {
		const uris: monaco.Uri[] = [];
		for (const script of this.scripts.values()) {
			uris.push(script.model.uri);
		}
		return uris;
	}

	// TODO(seb) In the long run this will probably be more like "getModelAndRange" to be able to show intermediate
	// steps on the same line (e.g. in for-loops).
	getModelAndLineByStackframeIndex(index: number): Promise<{ model: monaco.editor.ITextModel; line: number; }> {
		const location = this.pauseState?.callFrames[index]?.location ?? { scriptId: "", lineNumber: 0 };
		return this.getModelAndLineByLocation(location);
	}

	async getModelByUri(uri: monaco.Uri): Promise<monaco.editor.ITextModel> {
		let model = this.noScriptModel;
		const scriptId = this.uriToScriptId.get(uri.toString());
		if (scriptId) {
			const script = await this.getFullyLoadedScriptByScriptId(scriptId);
			if (script) {
				model = script.model;
			}
		}
		return model;
	}

	pause(): void {
		this.protocol?.debugger.pause();
	}

	async setBreakpoint(uri: monaco.Uri, lineOneBased: number, op: "add" | "remove"): Promise<void> {
		if (!this.protocol) {
			return;
		}
		const scriptId = this.uriToScriptId.get(uri.toString());
		if (!scriptId) {
			return;
		}
		const breakpointList = this.breakpoints.get(scriptId) ?? [];
		if (op === "add") {
			const breakpointAddResponse = await this.protocol.debugger.setBreakpoint({ location: { scriptId, lineNumber: lineOneBased - 1 } });
			breakpointList.push(breakpointAddResponse);
			this.breakpoints.set(scriptId, breakpointList);
		} else if (op === "remove") {
			const breakpoint = breakpointList.find(b => b.actualLocation.lineNumber === lineOneBased - 1);
			if (breakpoint) {
				await this.protocol.debugger.removeBreakpoint({ breakpointId: breakpoint.breakpointId });
			}
		}
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

	private async getFullyLoadedScriptByScriptId(scriptId: string): Promise<Script | undefined> {
		if (!this.protocol) {
			return undefined;
		}
		const script = this.scripts.get(scriptId);
		if (script) {
			if (!script.sourceWasLoaded) {
				script.sourceWasLoaded = true;
				if (script.metadata.scriptLanguage === "JavaScript") {
					const scriptSource = await this.protocol.debugger.getScriptSource({ scriptId });
					script.model.setValue(scriptSource.scriptSource);
					monaco.editor.setModelLanguage(script.model, "javascript");
				} else if (script.metadata.scriptLanguage === "WebAssembly") {
					const wasmModule = await this.protocol.debugger.disassembleWasmModule({ scriptId });
					script.wasm = wasmModule;
					while (wasmModule.streamId) {
						const nextChunk = await this.protocol.debugger.nextWasmDisassemblyChunk({ streamId: wasmModule.streamId });
						wasmModule.chunk.lines.push(...nextChunk.chunk.lines);
						wasmModule.chunk.bytecodeOffsets.push(...nextChunk.chunk.bytecodeOffsets);
						if (nextChunk.chunk.lines.length === 0) {
							wasmModule.streamId = undefined;
						}
					}
					console.assert(wasmModule.totalNumberOfLines === wasmModule.chunk.lines.length && wasmModule.totalNumberOfLines === wasmModule.chunk.bytecodeOffsets.length, wasmModule);
					const wat = wasmModule.chunk.lines.join("\n");
					script.model.setValue(wat);
					monaco.editor.setModelLanguage(script.model, "wat");
				}
			}
		}
		return script;
	}

	private async getModelAndLineByLocation(location: Protocol.Debugger.Location): Promise<{ model: monaco.editor.ITextModel; line: number; }> {
		let model = this.noScriptModel;
		let line = location.lineNumber + 1; // monaco lines are 1-based

		const script = await this.getFullyLoadedScriptByScriptId(location.scriptId);
		if (script) {
			model = script.model;
			if (script.wasm) {
				const offset = location.columnNumber ?? 0;
				// Binary search: find the line of the disassembled code that the offset falls into.
				let start = 0;
				let end = script.wasm.chunk.bytecodeOffsets.length - 1;
				while (start <= end) {
					const mid = start + ((end - start) >> 1);
					const lineStart = script.wasm.chunk.bytecodeOffsets[mid];
					const onePastLineEnd = script.wasm.chunk.bytecodeOffsets[mid + 1] ?? Number.MAX_SAFE_INTEGER;
					if (offset < lineStart) {
						end = mid - 1;
					} else if (offset >= onePastLineEnd) {
						start = mid + 1;
					} else {
						line = mid + 1; // monaco lines are 1-based
						break;
					}
				}
			}
		}

		return { model, line };
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