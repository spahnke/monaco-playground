declare function requiredModule<K extends keyof ModuleTypeMap>(type: K): ModuleTypeMap[K];

interface ModuleTypeMap {
    "test": string
}
