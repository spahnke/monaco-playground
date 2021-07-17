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
				require(["vs/editor/editor.main"], () => {
					require(["vs/editor/common/config/editorZoom", "vs/platform/contextkey/common/contextkey"], (editorZoom: { EditorZoom: monaco.editor.IEditorZoom; }, contextKey: { ContextKeyExpr: monaco.platform.IContextKeyExprFactory; }) => {
						monaco.editor.EditorZoom = editorZoom.EditorZoom;
						monaco.ContextKeyExpr = contextKey.ContextKeyExpr;
						registerLanguages();
						resolve();
					});
				});
			});
		}
		return MonacoLoader.editorLoaded;
	}
}
