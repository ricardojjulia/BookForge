import "@testing-library/jest-dom/vitest";
import { File as NodeFile } from "node:buffer";

// jsdom's File class fails undici's brand check when a FormData built with
// it is parsed by a real Request/Response (e.g. request.formData() in an
// API route under test) -- swap in Node's native File so both sides agree.
globalThis.File = NodeFile as unknown as typeof File;

if (typeof window !== "undefined" && !window.matchMedia) {
	Object.defineProperty(window, "matchMedia", {
		writable: true,
		value: (query: string) => ({
			matches: false,
			media: query,
			onchange: null,
			addListener: () => {},
			removeListener: () => {},
			addEventListener: () => {},
			removeEventListener: () => {},
			dispatchEvent: () => false,
		}),
	});
}

if (typeof window !== "undefined" && !window.visualViewport) {
	Object.defineProperty(window, "visualViewport", {
		writable: true,
		value: {
			addEventListener: () => {},
			removeEventListener: () => {},
		},
	});
}
