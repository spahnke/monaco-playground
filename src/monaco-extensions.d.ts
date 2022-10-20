declare namespace monaco {
	namespace editor {
		//#region Font zoom

		/** CAUTION: Internal unofficial API */
		interface IEditorZoom {
			onDidChangeZoomLevel: monaco.IEvent<number>;
			/** A number between -5 and 20; 0 being no zoom. */
			getZoomLevel(): number;
			/** @param zoomLevel A number between -5 and 20; 0 being no zoom. */
			setZoomLevel(zoomLevel: number): void;
		}

		/** CAUTION: Unofficial patched API */
		export let EditorZoom: IEditorZoom;

		//#endregion

		//#region Link opener

		/** CAUTION: Unofficial own patched API */
		interface ILinkOpener {
			open(resource: monaco.Uri): Promise<boolean>;
		}

		/** CAUTION: Internal unofficial API */
		interface ILinkDetector extends monaco.editor.IEditorContribution {
			/** CAUTION: Internal unofficial API */
			openerService: IOpenerService;
		}

		/** CAUTION: Internal unofficial API */
		interface IOpenerService {
			/** CAUTION: Internal unofficial API */
			_openers: ILinkedList<IOpener>;
		}

		/** CAUTION: Internal unofficial API */
		interface IOpener {
			/** CAUTION: Internal unofficial API */
			open(resource: string | monaco.Uri | string, options?: any): Promise<boolean>;
		}

		/** CAUTION: Internal unofficial API */
		interface ILinkedList<T> {
			/** Adds element to the end. Returns a function that removes the element again. */
			push(element: T): () => void;
			/** Adds element to the beginning. Returns a function that removes the element again. */
			unshift(element: T): () => void;
		}

		//#endregion

		//#region Message Controller

		/** CAUTION: Internal unofficial API */
		interface IMessageController extends monaco.editor.IEditorContribution {
			/** Shows an inline message at a position in the editor (similar to e.g. the "Cannot edit in read-only editor" message) */
			showMessage(message: string, position: IPosition): void;
		}

		//#endregion

		//#region Editor opener

		/**
		 * Registers a handler that is called when a resource other than the current model should be opened in the editor (e.g. "go to definition").
		 * The handler callback should return `true` if the request was handled and `false` otherwise.
		 *
		 * Returns a disposable that can unregister the opener again.
		 *
		 * CAUTION: Unofficial own patched API
		 */
		export function registerEditorOpener(opener: ICodeEditorOpener): monaco.IDisposable;

		/** CAUTION: Unofficial own patched API */
		interface ICodeEditorOpener {
			openCodeEditor(source: monaco.editor.ICodeEditor, resource: monaco.Uri, selection?: monaco.IRange): Promise<boolean>;
		}

		interface ICodeEditor {
			/** CAUTION: Internal unofficial API */
			_codeEditorService: {
				openCodeEditor(input: IResourceEditorInput, source: ICodeEditor | null, sideBySide?: boolean): Promise<ICodeEditor | null>;
			};
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

		/** CAUTION: Internal unofficial API */
		interface ITextEditorOptions {
			/**
			 * Text editor selection.
			 */
			readonly selection?: monaco.IRange;

			/**
			 * A optional hint to signal in which context the editor opens.
			 *
			 * If configured to be `EditorOpenSource.USER`, this hint can be
			 * used in various places to control the experience. For example,
			 * if the editor to open fails with an error, a notification could
			 * inform about this in a modal dialog. If the editor opened through
			 * some background task, the notification would show in the background,
			 * not as a modal dialog.
			 */
			readonly source?: number;
		}

		//#endregion

		//#region Read Keybindings

		interface IStandaloneCodeEditor {
			/** CAUTION: Internal unofficial API */
			_actions: Record<string, {
				id: string;
				_precondition?: monaco.platform.IContextKeyExpr;
			}>;

			/** CAUTION: Internal unofficial API */
			_standaloneKeybindingService: {
				_getResolver(): {
					_keybindings: IResolvedKeybindingItem[];
				};
			};
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

		//#endregion

		//#region Tokenization

		interface ITextModel {
			/** CAUTION: Internal unofficial API */
			readonly tokenization: ITokenizationTextModelPart;
		}

		/** CAUTION: Internal unofficial API */
		interface ITokenizationTextModelPart {
			/**
			 * CAUTION: Internal unofficial API
			 *
			 * Get the tokens for the line `lineNumber`.
			 * The tokens might be inaccurate. Use `forceTokenization` to ensure accurate tokens.
			 */
			getLineTokens(lineNumber: number): ILineTokens;

			/** CAUTION: Internal unofficial API */
			readonly backgroundTokenizationState: number;
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

		//#endregion
	}

	namespace platform {
		/** CAUTION: Internal unofficial API */
		interface IContextKeyExpr {
			equals(other: IContextKeyExpr): boolean;
			serialize(): string;
			keys(): string[];
			negate(): IContextKeyExpr;
		}
	}
}