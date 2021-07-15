import { registerLanguages } from "./languages/language-registry.js";

declare const require: IRequire;

interface IRequire {
	(dependencies: string[], callback: (...resolvedDependecies: any[]) => void): void;
	config(value: IRequireConfig): void;
}

interface IRequireConfig {
	paths?: Record<string, string>;
	"vs/nls"?: {
		availableLanguages: Record<string, string>;
	};
}

export class MonacoLoader {
	private static editorLoaded: Promise<void> | null = null;

	static loadEditor(): Promise<void> {
		if (MonacoLoader.editorLoaded === null) {
			MonacoLoader.editorLoaded = new Promise<void>(resolve => {
				require.config({ paths: { vs: "lib/monaco-editor/dev/vs" } });
				// require.config({
				// 	"vs/nls": {
				// 		availableLanguages: {
				// 			"*": "de"
				// 		}
				// 	}
				// });
				require(["vs/editor/editor.main"], async () => {
					registerLanguages();
					resolve();
				});
			});
		}
		return MonacoLoader.editorLoaded;
	}

	/**
	 * CAUTION: Uses an internal API to get an object of the non-exported class ContextKeyExpr.
	 */
	static get ContextKeyExpr(): Promise<monaco.platform.IContextKeyExprFactory> {
		return new Promise(resolve => {
			require(["vs/platform/contextkey/common/contextkey"], (x: { ContextKeyExpr: monaco.platform.IContextKeyExprFactory }) => {
				resolve(x.ContextKeyExpr);
			});
		});
	}

	/**
	 * CAUTION: Uses an internal API to get an instance of the non-exported class EditorZoom as `editor.getConfiguration().fontInfo.zoomLevel` always returns the initial zoom level.
	 */
	static get editorZoom(): Promise<monaco.editor.IEditorZoom> {
		return new Promise(resolve => {
			require(["vs/editor/common/config/editorZoom"], (x: { EditorZoom: monaco.editor.IEditorZoom }) => {
				resolve(x.EditorZoom);
			});
		});
	}
}
