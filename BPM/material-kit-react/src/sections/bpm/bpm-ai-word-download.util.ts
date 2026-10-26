export function downloadDocxFromBase64(docxBase64: string, docxFilename: string) {
  const binary = atob(docxBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = docxFilename || 'BPM-Document.docx';
  link.click();
  URL.revokeObjectURL(url);
}
