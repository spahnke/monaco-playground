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
		/** CAUTION: Internal unofficial API */
		interface IEditorZoom {
			onDidChangeZoomLevel: monaco.IEvent<number>;
			/** A number between -5 and 20; 0 being no zoom. */
			getZoomLevel(): number;
			/** @param zoomLevel A number between -5 and 20; 0 being no zoom. */
			setZoomLevel(zoomLevel: number): void;
		}

		/** CAUTION: Internal unofficial API */
		interface ILinkDetector extends monaco.editor.IEditorContribution {
			/** CAUTION: Internal unofficial API */
			openerService: IOpenerService;
		}

		/** CAUTION: Internal unofficial API */
		interface ILinkedList<T> {
			/** Adds element to the end. Returns a function that removes the element again. */
			push(element: T): () => void;
			/** Adds element to the beginning. Returns a function that removes the element again. */
			unshift(element: T): () => void;
		}

		/** CAUTION: Internal unofficial API */
		interface IMessageController extends monaco.editor.IEditorContribution {
			/** Shows an inline message at a position in the editor (similar to e.g. the "Cannot edit in read-only editor" message) */
			showMessage(message: string, position: IPosition): void;
		}

		/** CAUTION: Internal unofficial API */
		interface IOpener {
			/** CAUTION: Internal unofficial API */
			open(resource: string | monaco.Uri | string, options?: any): Promise<boolean>;
		}

		/** CAUTION: Internal unofficial API */
		interface IOpenerService {
			/** CAUTION: Internal unofficial API */
			_openers: ILinkedList<IOpener>;
		}

		/** CAUTION: Internal unofficial API */
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
			_actions: Record<string, {
				id: string;
				_precondition?: monaco.platform.IContextKeyExpr;
			}>;

			/** CAUTION: Internal unofficial API */
			_codeEditorService: {
				openCodeEditor(input: IResourceEditorInput, source: ICodeEditor | null, sideBySide?: boolean): Promise<ICodeEditor | null>;
			};

			/** CAUTION: Internal unofficial API */
			_standaloneKeybindingService: {
				addDynamicKeybinding(commandId: string, _keybinding: number | undefined, handler: monaco.editor.ICommandHandler, when?: monaco.platform.IContextKeyExpr | undefined): monaco.IDisposable;
				_getResolver(): {
					_keybindings: IResolvedKeybindingItem[];
				};
			};
		}

		interface ITextModel {
			/** CAUTION: Internal unofficial API */
			getLineTokens(line: number): ILineTokens;
			/** CAUTION: Internal unofficial API */
			_tokenization: {
				_tokenizationSupport: object | null
			}
		}

		/** CAUTION: Internal unofficial API */
		interface ILineTokens {
			/** CAUTION: Internal unofficial API */
			getCount(): number;
			/** CAUTION: Internal unofficial API */
			getLineContent(): string;
			/** CAUTION: Internal unofficial API */
			getStartOffset(tokenIndex: number): number;
			/** CAUTION: Internal unofficial API */
			getEndOffset(tokenIndex: number): number;
			/** CAUTION: Internal unofficial API (see IEncodedLineTokens in monaco.d.ts) */
			getStandardTokenType(tokenIndex: number): number;
		}

		/** CAUTION: Internal unofficial API */
		interface IResolvedKeybindingItem {
			command: string;
			resolvedKeybinding: IResolvedKeybinding;
			when?: monaco.platform.IContextKeyExpr;
		}

		/** CAUTION: Internal unofficial API */
		interface IResolvedKeybinding {
			getAriaLabel(): string;
		}

		/** CAUTION: Internal unofficial API */
		interface ITextEditorOptions {
			/**
	 		 * Text editor selection.
	 		 */
			readonly selection?: monaco.IRange;
		}
	}

	namespace platform {
		/** CAUTION: Internal unofficial API */
		interface IContextKeyExpr {
			equals(other: IContextKeyExpr): boolean;
			serialize(): string;
			keys(): string[];
			negate(): IContextKeyExpr;
		}

		/** CAUTION: Internal unofficial API */
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