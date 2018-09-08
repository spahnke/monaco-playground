export abstract class AsyncWorker {
	private worker: Worker;
	private id: number;

	constructor(workerPath: string) {
		this.worker = new Worker(workerPath);
		this.id = 0;
	}

	process(data: any): Promise<any> {
		return new Promise(resolve => {
			const id = ++this.id;
			const handler = (e: MessageEvent) => {
				if (e.data.id !== id)
					return;
				this.worker.removeEventListener("message", handler);
				resolve(e.data);
			}
			this.worker.addEventListener("message", handler);
			this.worker.postMessage({ id, ...data });
		});
	}
}