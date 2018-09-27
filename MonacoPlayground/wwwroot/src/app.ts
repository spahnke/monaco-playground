import { CodeEditor } from "./code-editor.js";
import { EsLint } from "./linter/eslint.js";
import { XmlLint } from "./linter/xmllint.js";

async function main() {
	const editor = await CodeEditor.create(document.querySelector(".editor") as HTMLElement);
	editor.setContents(`class Foo {
	/**
	 * The class Foo
	 * 
	 * [Online documentation](http://www.google.de)
	 */
	constructor() {
		this.bar = 42;
	}
}

const foo = new Foo();
foo.bar = Facts.next();`);

	const config = await fetch("eslintrc.json").then(r => r.json());
	editor.setLinter(new EsLint(config, editor.editor));

//	editor.setContents(`<?xml version="1.0" encoding="UTF-8"?>

//<shiporder orderid="889923"
//xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
//xsi:noNamespaceSchemaLocation="shiporder.xsd">
//  <orderperson>John Smith</orderperson>
//  <shipto>
//    <name>Ola Nordmann</name>
//    <address>Langgt 23</address>
//    <city>4000 Stavanger</city>
//    <country>Norway</country>
//  </shipto>
//  <item>
//    <title>Empire Burlesque</title>
//    <note>Special Edition</note>
//    <quantity>1</quantity>
//    <price>10.90</price>
//  </item>
//  <item>
//    <title>Hide your heart</title>
//    <quantity>1</quantity>
//    <price>9.90</price>
//  </item>
//</shiporder>`, "xml");

//	const xsd = await fetch("example.xsd").then(r => r.text());
//	editor.setLinter(new XmlLint(xsd, editor.editor));
}

main();