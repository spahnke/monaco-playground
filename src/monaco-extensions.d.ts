interface Window {
	require: monaco.IRequire;
}

declare namespace monaco {
	interface IRequire {
		(dependencies: string[], callback: (...resolvedDependecies: any[]) => void): void;
		config(value: IRequireConfig): void;
	}

	interface IRequireConfig {
		paths?: Record<string, string>;
		"vs/nls"?: {
			availableLanguages: Record<string, string>
		}
	}

	namespace editor {
		interface IEditorZoom {
			onDidChangeZoomLevel: monaco.IEvent<number>;
			/** A number between -5 and 20; 0 being no zoom. */
			getZoomLevel(): number;
			/** @param zoomLevel A number between -5 and 20; 0 being no zoom. */
			setZoomLevel(zoomLevel: number): void;
		}

		interface IStandaloneCodeEditor {
			/** CAUTION: Internal unofficial API */
			_standaloneKeybindingService: {
				addDynamicKeybinding(commandId: string, _keybinding?: number, handler?: monaco.editor.ICommandHandler, when?: monaco.platform.IContextKeyExpr | undefined): monaco.IDisposable
			}
		}
	}

	namespace platform {
		interface IContextKeyExpr {
			equals(other: IContextKeyExpr): boolean;
			serialize(): string;
			keys(): string[];
			negate(): IContextKeyExpr;
		}

		interface IContextKeyExprFactory {
			has(key: string): IContextKeyExpr;
			equals(key: string, value: any): IContextKeyExpr;
			notEquals(key: string, value: any): IContextKeyExpr;
			regex(key: string, value: RegExp): IContextKeyExpr;
			not(key: string): IContextKeyExpr;
			and(...expr: Array<IContextKeyExpr | undefined | null>): IContextKeyExpr | undefined;
			or(...expr: Array<IContextKeyExpr | undefined | null>): IContextKeyExpr | undefined;
			deserialize(serialized: string | null | undefined, strict?: boolean): IContextKeyExpr | undefined;
		}
	}
}