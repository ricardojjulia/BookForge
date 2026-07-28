import "@testing-library/jest-dom/vitest";

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
