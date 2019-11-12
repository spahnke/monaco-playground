class EslintWorker {
	constructor(private name: string) { }

	greet(): string {
		return `Hello I'm ${this.name}`;
	}
}

interface ICreateData {
	name: string;
}

export function create(context: monaco.worker.IWorkerContext, createData: ICreateData) {
	console.log(`Creating worker...`, context, createData);
	return new EslintWorker(createData.name);
}