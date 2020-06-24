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

		interface ILinkDetector extends monaco.editor.IEditorContribution {
			/** CAUTION: Internal unofficial API */
			openerService: IOpenerService;
		}

		interface IOpener {
			/** CAUTION: Internal unofficial API */
			open(resource: string | monaco.Uri | string, options?: any): Promise<boolean>;
		}

		interface IOpenerService {
			/**
			 * CAUTION: Internal unofficial API
			 * Actually a LinkedList, but those also have a push/unshift method, so don't bother
			 */
			_openers: IOpener[];
		}

		interface IResourceEditorInput {

			/**
			 * The resource URI of the resource to open.
			 */
			readonly resource: monaco.Uri;

			/**
	 		 * Optional options to use when opening the text input.
	 		 */
			options?: ITextEditorOptions;
		}

		interface IStandaloneCodeEditor {
			/** CAUTION: Internal unofficial API */
			_codeEditorService: {
				openCodeEditor(input: IResourceEditorInput, source: ICodeEditor | null, sideBySide?: boolean): Promise<ICodeEditor | null>;
			}

			/** CAUTION: Internal unofficial API */
			_standaloneKeybindingService: {
				addDynamicKeybinding(commandId: string, _keybinding?: number, handler?: monaco.editor.ICommandHandler, when?: monaco.platform.IContextKeyExpr | undefined): monaco.IDisposable
			}
		}

		interface ITextEditorOptions {
			/**
	 		 * Text editor selection.
	 		 */
			readonly selection?: monaco.IRange;
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