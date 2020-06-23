// general definition file
declare function defineModule<T>(name: string, definition: () => T): T;
declare function requiredModule(name: string): any;

// dynamically generated definition file
/** Not a real object! Only relevant for module code completion. */
namespace __moduleDefinitions { }
// module definition file (all modules including name -> enables name completion)
declare function requiredModule(name: "asdf"): typeof __moduleDefinitions["asdf"];
