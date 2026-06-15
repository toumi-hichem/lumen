/**
 * Generic repository contract. Concrete repositories encapsulate IndexedDB
 * access so business logic and stores depend on this interface, never on idb
 * directly. This keeps storage swappable (e.g. a future SQLite-on-native
 * backend) and trivially mockable in tests.
 */
export interface Repository<T, Id = string> {
  findAll(): Promise<T[]>
  findById(id: Id): Promise<T | null>
  save(entity: T): Promise<T>
  delete(id: Id): Promise<void>
}
