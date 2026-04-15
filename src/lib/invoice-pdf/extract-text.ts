import pdf from "pdf-parse";

export async function extractTextFromPdfBuffer(buffer: Buffer): Promise<{ text: string; numPages: number }> {
  const data = await pdf(buffer);
  const text = typeof data.text === "string" ? data.text : "";
  const numPages = typeof data.numpages === "number" ? data.numpages : 0;
  return { text: text.replace(/\r\n/g, "\n"), numPages };
}
