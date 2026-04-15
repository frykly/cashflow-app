declare module "pdf-parse" {
  import type { Buffer } from "buffer";
  function pdfParse(data: Buffer | Uint8Array): Promise<{ text: string; numpages: number }>;
  export default pdfParse;
}
