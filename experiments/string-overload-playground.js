monaco.languages.typescript.javascriptDefaults.addExtraLib(`
declare function foo(name: "Foo.Bar.Baz"): number
declare function foo(name: "Foo.Bar.Qux"): string
`, 'test.d.ts');

monaco.editor.create(document.getElementById("container"), {
	value: `foo('Foo.Bar.')`, // overload completion replaces everything in VS Code, but inserts at the end in Monaco -> why?
	language: "javascript"
});