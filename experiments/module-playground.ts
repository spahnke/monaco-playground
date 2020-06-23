// general definition file
declare function defineModule<T>(name: string, definition: () => T): T;

// module definition file (all modules including name -> enables name completion)
declare function requiredModule(name: "asdf"): typeof asdf;

// javascript text model for the editor -> defines the type of the variable (one for each module)
const asdf = defineModule("asdf", () => {
	return class Foo {
		a = 1;
		b() {
			return "";
		}
	}
});

// normal code can then use the type
const Foo = requiredModule("asdf");
const foo = new Foo();
foo.