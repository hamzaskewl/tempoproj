declare module 'bs58' {
  const bs58: {
    encode(source: Uint8Array | Buffer): string
    decode(source: string): Uint8Array
  }
  export default bs58
}
