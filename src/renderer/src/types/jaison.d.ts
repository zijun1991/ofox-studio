declare module 'jaison' {
  export interface JaisonOptions {
    /**
     * Whether to throw an error if the JSON is invalid and cannot be repaired.
     * If false, the function will return null if the JSON cannot be repaired.
     * @default false
     */
    throwOnError?: boolean
    /**
     * Whether to auto-complete the JSON if it is incomplete.
     * @default true
     */
    autoComplete?: boolean
  }

  /**
   * A robust, fault-tolerant JSON parser for handling malformed JSON from AI systems.
   */
  function jaison(json: string, options?: JaisonOptions): unknown

  export default jaison
}
