declare function dm<T>(name: string, cb: () => T): T;

const asdf = dm("asdf", () => {
	return class Foo {
		a = 1;
		b() {
			return "";
		}
	}
});

declare function rm(name: "asdf"): typeof asdf;

const Foo = rm("asdf");
const foo = new Foo();
foo