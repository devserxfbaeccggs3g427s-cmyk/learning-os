// plantuml-encoder ships no types; declare the surface we use.
declare module "plantuml-encoder" {
  export function encode(source: string): string;
}
