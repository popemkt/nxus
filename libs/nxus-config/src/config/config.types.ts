export interface CreateConfigStoreOptions<T extends Record<string, unknown>> {
  /** Unique localStorage key, e.g. 'nxus-recall-config' */
  name: string
  /** Default values for the config store */
  defaults: T
  /** Optional persist version for migrations */
  version?: number
}
