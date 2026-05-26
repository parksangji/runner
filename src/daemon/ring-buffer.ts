export class RingBuffer<T> {
  private readonly data: (T | undefined)[];
  private start = 0;
  private size = 0;

  constructor(private readonly capacity: number) {
    if (capacity <= 0) throw new Error('Capacity must be positive');
    this.data = new Array<T | undefined>(capacity);
  }

  push(item: T): void {
    if (this.size < this.capacity) {
      this.data[(this.start + this.size) % this.capacity] = item;
      this.size += 1;
    } else {
      this.data[this.start] = item;
      this.start = (this.start + 1) % this.capacity;
    }
  }

  toArray(): T[] {
    const out: T[] = [];
    for (let i = 0; i < this.size; i += 1) {
      out.push(this.data[(this.start + i) % this.capacity] as T);
    }
    return out;
  }

  get length(): number {
    return this.size;
  }
}
