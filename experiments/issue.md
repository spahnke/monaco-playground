# Extend API surface
In my work with editor over the past two years I've used four internal APIs that I think could improve the API surface by making them public. In this issue I would like to list those, explain the use cases and track progress. In addition I will prepare draft PRs against VS Code to add the APIs and discuss their design.

> The variable `editor` is always of the type `monaco.editor.IStandaloneCodeEditor` in the following examples.

## `EditorZoom` API

- Subscribe to zoom level change events
- Get/set current zoom level

### Current use with internal APIs
This is basically just me copying the interface definition and then calling `require` to get the object.
```ts
/** CAUTION: Internal unofficial API */
interface IEditorZoom {
	onDidChangeZoomLevel: monaco.IEvent<number>;
	/** A number between -5 and 20; 0 being no zoom. */
	getZoomLevel(): number;
	/** @param zoomLevel A number between -5 and 20; 0 being no zoom. */
	setZoomLevel(zoomLevel: number): void;
}

getEditorZoom(): Promise<monaco.editor.IEditorZoom> {
	return new Promise(resolve => {
		require(["vs/editor/common/config/editorZoom"], (x: { EditorZoom: monaco.editor.IEditorZoom }) => {
			resolve(x.EditorZoom);
		});
	});
}
```

## Opener service
- Handle Links that aren't http(s)

## Code editor service
- Handle "Go to definition" requests, e.g. make it possible to open a new tab
- see https://github.com/microsoft/monaco-editor/issues/2000