{
	/** @type {import("monaco-editor").editor.IEditorOptions} */
	const options = {
		fontFamily: "Cascadia Code",
		fontWeight: "350",
		suggest: {
			preview: true,
		},
	};
	localStorage.setItem("monaco-config", JSON.stringify(options, undefined, "\t"));
}