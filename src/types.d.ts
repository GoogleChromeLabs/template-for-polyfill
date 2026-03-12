// Define the options interface for the Sanitizer API
interface SetHTMLOptions {
  sanitizer?: any; // You can refine this if using a specific Sanitizer polyfill
}

interface Element {
  setHTML(input: string, options?: SetHTMLOptions): void;
}

interface Document {
  parseHTML(input: string): HTMLDocument;
}
