type Job = () => Promise<void>;

class SerialQueue {
    private running = false;
    private queue: Job[] = [];

    enqueue(job: Job): void {
        this.queue.push(job);
        this.drain();
    }

    private async drain(): Promise<void> {
        if (this.running) return;
        this.running = true;

        while (this.queue.length > 0) {
            const job = this.queue.shift()!;
            try {
                await job();
            } catch {

            }
        }

        this.running = false;
    }
}

const judgeQueue = new SerialQueue();

export { judgeQueue };
